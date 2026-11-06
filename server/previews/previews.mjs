// The PR previews service (server/previews/AGENTS.md): each PR's builds, sent by pr-preview.yml with the secret
// token, kept under `pr-N/<sha7>/` and served as static files under /pr-preview, on the co-op relay's host.
//   GET  /pr-preview/health                      200 "ok"
//   GET  /pr-preview/pr-N/                        the PR's stable page (its index.html, main's copy, sent with it)
//   GET  /pr-preview/pr-N/latest.json             what the stable page goes by: { headSha, state, folder, since, run }
//   GET  /pr-preview/pr-N/<sha7>/...              a build's files; a pruned build's page goes to the stable page, a
//                                                 gone PR's to the game (SITE)
//   PUT  /pr-preview/api/pr-N/<sha7>?sha=<sha>    a build, a gzipped ustar of its folder (token)      -> 201
//   PUT  /pr-preview/api/pr-N/latest.json         (token)
//   PUT  /pr-preview/api/pr-N/index.html          (token)
//   DELETE /pr-preview/api/pr-N                   a closed PR's previews (token)
//   GET  /pr-preview/api/previews                 what's kept, each PR's builds and latest.json (token)
// A build is served the moment its PUT answers: unpacked beside, then moved into place. Each PR keeps its newest
// KEEP builds, and the oldest of all go (never a PR's newest) once they take over DISK_MAX.
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { constants as zlibConstants, brotliCompress, createGunzip, gzip } from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { readTar } from './tar.mjs';

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/** The service's settings, from the environment (`start` may give others: its tests', the lab's). */
function settingsFrom(vars) {
  return {
    port: Number(vars.PORT ?? 8080),
    data: vars.DATA ?? '/data',
    token: vars.PREVIEWS_TOKEN ?? '',
    keep: Number(vars.KEEP ?? 3),
    diskMax: Number(vars.DISK_MAX ?? 2 << 30),
    mostUpload: Number(vars.MOST_UPLOAD ?? 200 << 20),
    mostUnpacked: Number(vars.MOST_UNPACKED ?? 600 << 20),
    /** where a preview that's gone sends its visitor: the game */
    site: vars.SITE ?? 'https://last-stand.cc/',
  };
}
let settings = settingsFrom(process.env);

const PREFIX = '/pr-preview';
const PR = /^pr-([1-9]\d{0,6})$/;
const FOLDER = /^[0-9a-f]{7}$/;
const SHA = /^[0-9a-f]{40}$/;
const STATES = ['building', 'ready', 'failed'];
/** what each stores beside a build's files: its precompressed copies, its metadata */
const ENCODED = '.encoded';
const METADATA = 'preview-metadata.json';
const INCOMING = '.incoming';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
};
/** the types sent compressed (the rest are packed already: pictures, sound, fonts) */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.map', '.txt', '.md', '.xml',
  '.svg', '.wasm', '.bin', '.glb']);
const SMALLEST_COMPRESSED = 1024;

const log = (...parts) => console.log(new Date().toISOString(), ...parts);

// ---- the store ----

const prDir = (number) => join(settings.data, `pr-${number}`);
const folderDir = (number, folder) => join(prDir(number), folder);

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** errors a rename meets while another process holds a file just written (on Windows, its scanner or indexer) */
const HELD = ['EPERM', 'EACCES', 'EBUSY'];

/** `from` renamed to `to`, tried again for up to a second while a file in it is held: on Windows a folder of files
 *  just written failed to move one upload in a few (EPERM), and the build answered 500. */
async function moveWhenFree(from, to) {
  for (let wait = 10; ; wait *= 2) {
    try {
      return await rename(from, to);
    } catch (error) {
      if (!HELD.includes(error.code) || wait > 640) throw error;
      await sleep(wait);
    }
  }
}

/** A file written whole or not at all: beside, then moved over. */
async function writeAtomic(file, contents) {
  const beside = `${file}.${randomBytes(4).toString('hex')}.part`;
  await writeFile(beside, contents);
  await moveWhenFree(beside, file);
}

async function entries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Every byte under `dir`. */
async function sizeOf(dir) {
  let bytes = 0;
  for (const entry of await entries(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) bytes += await sizeOf(path);
    else bytes += (await stat(path)).size;
  }
  return bytes;
}

/** A PR's builds kept, newest first: { folder, headSha, publishedAt }. */
async function foldersOf(number) {
  const folders = [];
  for (const entry of await entries(prDir(number))) {
    if (!entry.isDirectory() || !FOLDER.test(entry.name)) continue;
    const metadata = await readJson(join(folderDir(number, entry.name), METADATA));
    folders.push({ folder: entry.name, headSha: metadata?.headSha ?? '', publishedAt: metadata?.publishedAt ?? '' });
  }
  return folders.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** The PRs that have anything kept. */
async function prsKept() {
  const numbers = [];
  for (const entry of await entries(settings.data)) {
    const match = entry.isDirectory() ? PR.exec(entry.name) : null;
    if (match) numbers.push(Number(match[1]));
  }
  return numbers.sort((a, b) => a - b);
}

/** The folder PR `number`'s latest.json sends its stable page to, or ''. Never pruned: a stable page sent to a
 *  pruned folder is sent back to the stable page, round and round. */
async function latestFolder(number) {
  return (await readJson(join(prDir(number), 'latest.json')))?.folder ?? '';
}

/** Each PR's builds past its newest `keep` go (never the one its latest.json names); then, past DISK_MAX, the
 *  oldest of all but each PR's newest and the one its latest.json names. */
async function prune(number) {
  if (number) {
    const named = await latestFolder(number);
    for (const old of (await foldersOf(number)).slice(settings.keep)) {
      if (old.folder === named) continue;
      await rm(folderDir(number, old.folder), { recursive: true, force: true });
      log('pruned', `pr-${number}/${old.folder}`);
    }
  }
  let total = await sizeOf(settings.data);
  if (total <= settings.diskMax) return;
  const droppable = [];
  for (const each of await prsKept()) {
    const named = await latestFolder(each);
    for (const kept of (await foldersOf(each)).slice(1)) {
      if (kept.folder !== named) droppable.push({ number: each, ...kept });
    }
  }
  droppable.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  for (const old of droppable) {
    if (total <= settings.diskMax) break;
    const dir = folderDir(old.number, old.folder);
    total -= await sizeOf(dir);
    await rm(dir, { recursive: true, force: true });
    log('dropped for space', `pr-${old.number}/${old.folder}`);
  }
}

/** The body as it streams in, cut off past `most` bytes. */
async function* bodyChunks(req, most) {
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > most) throw Object.assign(new Error(`over ${most} bytes`), { status: 413 });
    yield chunk;
  }
}

/** A stream ready for more, or gone. */
const drainedOrClosed = (stream) => new Promise((resolve) => {
  const done = () => {
    stream.off('drain', done);
    stream.off('close', done);
    resolve();
  };
  stream.on('drain', done);
  stream.on('close', done);
});

/** The gzip's bytes as they unpack, cut off past `most`: a gzip that unpacks without end is turned away. */
async function* unpacked(chunks, most) {
  const gunzip = createGunzip();
  const feeding = (async () => {
    try {
      for await (const chunk of chunks) {
        if (gunzip.destroyed) return;
        if (!gunzip.write(chunk)) await drainedOrClosed(gunzip);
      }
      gunzip.end();
    } catch (error) {
      gunzip.destroy(error);
    }
  })();
  let size = 0;
  try {
    for await (const chunk of gunzip) {
      size += chunk.length;
      if (size > most) throw Object.assign(new Error(`unpacks to over ${most} bytes`), { status: 413 });
      yield chunk;
    }
  } finally {
    gunzip.destroy();
    await feeding;
  }
}

/** A file's precompressed copies beside the build (`.encoded/<path>.br`, `.gz`), when it's worth sending them. */
async function compress(root, path, data) {
  if (!COMPRESSIBLE.has(extname(path).toLowerCase()) || data.length < SMALLEST_COMPRESSED) return;
  const params = { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length };
  const [br, gz] = await Promise.all([brotli(data, { params }), gzipped(data, { level: 9 })]);
  const base = join(root, ENCODED, path);
  await mkdir(dirname(base), { recursive: true });
  if (br.length < data.length) await writeFile(`${base}.br`, br);
  if (gz.length < data.length) await writeFile(`${base}.gz`, gz);
}

/** A build unpacked into `root`: what it held. */
async function unpackInto(root, req) {
  let files = 0;
  let bytes = 0;
  await mkdir(root, { recursive: true });
  const archive = unpacked(bodyChunks(req, settings.mostUpload), settings.mostUnpacked);
  try {
    for await (const entry of readTar(archive)) {
      const path = join(root, entry.path);
      if (entry.type === 'dir') {
        await mkdir(path, { recursive: true });
        continue;
      }
      if (entry.path === METADATA) continue;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, entry.data);
      await compress(root, entry.path, entry.data);
      files++;
      bytes += entry.data.length;
    }
  } catch (error) {
    // (what the archive held turns it away; the disk's own error stays one)
    if (!error.status && !error.syscall) error.status = 400;
    throw error;
  }
  return { files, bytes };
}

/** A build put in its folder: unpacked beside, then moved into place, so it's served whole or not at all. */
async function putBuild(req, number, folder, sha) {
  const incoming = join(settings.data, INCOMING, randomBytes(8).toString('hex'));
  const started = Date.now();
  try {
    const { files, bytes } = await unpackInto(incoming, req);
    if (files === 0) throw Object.assign(new Error('an empty build'), { status: 400 });
    const publishedAt = new Date().toISOString();
    await writeFile(join(incoming, METADATA), `${JSON.stringify({ headSha: sha, publishedAt })}\n`);
    await mkdir(prDir(number), { recursive: true });
    const target = folderDir(number, folder);
    const replaced = `${incoming}-replaced`;
    // (a build sent again: its old folder moved aside first; none there is the usual case)
    await moveWhenFree(target, replaced).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await moveWhenFree(incoming, target);
    await rm(replaced, { recursive: true, force: true });
    await prune(number);
    const ms = Date.now() - started;
    log('build', `pr-${number}/${folder}`, `${files} files`, `${(bytes / 1048576).toFixed(1)} MB`, `${ms} ms`);
    return { folder, headSha: sha, publishedAt, files, bytes, ms };
  } finally {
    await rm(incoming, { recursive: true, force: true });
  }
}

/** latest.json checked to be what the stable page reads, and nothing else. */
function checkLatest(value) {
  const ok = value && typeof value === 'object' && !Array.isArray(value)
    && SHA.test(value.headSha ?? '') && STATES.includes(value.state)
    && (value.folder === null || FOLDER.test(value.folder ?? ''))
    && (value.since === undefined || typeof value.since === 'string')
    && typeof value.run === 'string' && value.run.startsWith('https://github.com/');
  if (!ok) throw Object.assign(new Error('not a latest.json'), { status: 400 });
  const { headSha, state, folder, since, run } = value;
  return { headSha, state, folder, ...(since ? { since } : {}), run };
}

async function readBody(req, most) {
  const parts = [];
  for await (const chunk of bodyChunks(req, most)) parts.push(chunk);
  return Buffer.concat(parts);
}

/** Every change to the store, one at a time (an upload's unpacking included): the CPU and memory it takes bounded,
 *  and no prune running over a build moving into place. */
let queue = Promise.resolve();
let waiting = 0;
const MOST_WAITING = 8;
function oneAtATime(work) {
  if (waiting >= MOST_WAITING) return Promise.reject(Object.assign(new Error('busy'), { status: 503 }));
  waiting++;
  const run = queue.then(work);
  queue = run.catch(() => {}).finally(() => waiting--);
  return run;
}

// ---- the API ----

/** Whether the request carries the token (compared in constant time). */
function authorised(req) {
  if (!settings.token) return false;
  const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(settings.token));
}

async function listPreviews() {
  const previews = [];
  for (const number of await prsKept()) {
    previews.push({
      number,
      folders: await foldersOf(number),
      latest: await readJson(join(prDir(number), 'latest.json')),
      page: await stat(join(prDir(number), 'index.html')).then(() => true, () => false),
    });
  }
  return { previews };
}

async function api(req, res, parts) {
  if (!settings.token) return answer(res, 503, 'the API is off: no PREVIEWS_TOKEN set');
  if (!authorised(req)) return answer(res, 401, 'the token, please');
  if (req.method === 'GET' && parts.length === 1 && parts[0] === 'previews') return answer(res, 200, await listPreviews());
  const number = Number(PR.exec(parts[0] ?? '')?.[1] ?? 0);
  if (!number) return answer(res, 404, 'not a PR');
  if (req.method === 'DELETE' && parts.length === 1) {
    await oneAtATime(() => rm(prDir(number), { recursive: true, force: true }));
    log('removed', `pr-${number}`);
    return answer(res, 200, { removed: number });
  }
  if (req.method !== 'PUT' || parts.length !== 2) return answer(res, 404, 'not here');
  const [, name] = parts;
  if (name === 'latest.json') {
    const latest = checkLatest(JSON.parse((await readBody(req, 8192)).toString('utf8') || 'null'));
    await oneAtATime(async () => {
      await mkdir(prDir(number), { recursive: true });
      await writeAtomic(join(prDir(number), 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
      // (the folder it named before may go now)
      await prune(number);
    });
    log('latest', `pr-${number}`, latest.state, latest.headSha.slice(0, 7));
    return answer(res, 200, latest);
  }
  if (name === 'index.html') {
    const page = await readBody(req, 256 << 10);
    await oneAtATime(async () => {
      await mkdir(prDir(number), { recursive: true });
      await writeAtomic(join(prDir(number), 'index.html'), page);
    });
    return answer(res, 200, { page: page.length });
  }
  if (!FOLDER.test(name)) return answer(res, 404, 'not a commit folder');
  const sha = new URL(req.url ?? '/', 'http://x').searchParams.get('sha') ?? '';
  if (!SHA.test(sha) || !sha.startsWith(name)) return answer(res, 400, 'sha= the commit the folder is named by');
  if (Number(req.headers['content-length'] ?? 0) > settings.mostUpload) return answer(res, 413, 'over its most');
  return answer(res, 201, await oneAtATime(() => putBuild(req, number, name, sha)));
}

// ---- serving ----

function answer(res, status, body, headers = {}) {
  const json = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { location, 'cache-control': 'no-store' });
  res.end();
}

/** A page being opened (not a file a page asks for): only those are sent on when what they ask for is gone. */
const isNavigation = (req) => req.headers['sec-fetch-mode'] === 'navigate'
  || String(req.headers.accept ?? '').includes('text/html');

/** The precompressed copy to send, or none: brotli, then gzip, as the browser takes them. */
async function encodedCopy(req, folderRoot, relative) {
  if (!folderRoot) return null;
  const accepts = String(req.headers['accept-encoding'] ?? '');
  for (const [encoding, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
    if (!new RegExp(`\\b${encoding}\\b`).test(accepts)) continue;
    const path = join(folderRoot, ENCODED, `${relative}${suffix}`);
    const found = await stat(path).catch(() => null);
    if (found?.isFile()) return { path, size: found.size, encoding };
  }
  return null;
}

/** A file sent: built assets (named by their contents) kept a year, everything else checked again each time. */
async function sendFile(req, res, file, { folderRoot, relative, latest }) {
  const info = await stat(file);
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const immutable = folderRoot && relative.startsWith('assets/');
  const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
  const headers = {
    'content-type': type,
    'cache-control': latest ? 'no-store' : immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    etag,
    'x-content-type-options': 'nosniff',
  };
  if (COMPRESSIBLE.has(extname(file).toLowerCase())) headers.vary = 'Accept-Encoding';
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const encoded = await encodedCopy(req, folderRoot, relative);
  if (encoded) headers['content-encoding'] = encoded.encoding;
  headers['content-length'] = String(encoded?.size ?? info.size);
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(encoded?.path ?? file).pipe(res);
}

const isFile = async (path) => (await stat(path).catch(() => null))?.isFile() ?? false;
const isDir = async (path) => (await stat(path).catch(() => null))?.isDirectory() ?? false;

/** Serves `parts` (the path after /pr-preview, split): `pr-N`, then the stable page, latest.json or a build's. */
async function serve(req, res, parts, url) {
  const number = Number(PR.exec(parts[0] ?? '')?.[1] ?? 0);
  if (!number) return answer(res, 404, 'not a preview');
  const stable = `${PREFIX}/pr-${number}/`;
  const prExists = await isDir(prDir(number));
  // a gone PR's preview: to the game
  if (!prExists) return isNavigation(req) ? redirect(res, settings.site) : answer(res, 404, 'no such preview');
  const trailing = url.pathname.endsWith('/');
  if (parts.length === 1) {
    if (!trailing) return redirect(res, `${stable}${url.search}`, 301);
    const page = join(prDir(number), 'index.html');
    if (await isFile(page)) return sendFile(req, res, page, {});
    return answer(res, 404, 'no stable page yet');
  }
  if (parts.length === 2 && parts[1] === 'latest.json') {
    const latest = join(prDir(number), 'latest.json');
    return (await isFile(latest)) ? sendFile(req, res, latest, { latest: true }) : answer(res, 404, 'none yet');
  }
  const folder = parts[1];
  if (!FOLDER.test(folder)) return answer(res, 404, 'not here');
  const folderRoot = folderDir(number, folder);
  // a pruned build: its page to the stable one, which goes to the newest (the files it asks for are 404s)
  if (!(await isDir(folderRoot))) return isNavigation(req) ? redirect(res, stable) : answer(res, 404, 'pruned');
  if (parts.length === 2 && !trailing) return redirect(res, `${stable}${folder}/${url.search}`, 301);
  const rest = parts.slice(2);
  // hidden names (what the service keeps beside a build) are never served
  if (rest.some((part) => part.startsWith('.'))) return answer(res, 404, 'not here');
  let relative = rest.join('/');
  let file = join(folderRoot, ...rest);
  if (trailing || rest.length === 0 || (await isDir(file))) {
    if (!trailing && rest.length > 0) return redirect(res, `${url.pathname}/${url.search}`, 301);
    relative = relative ? `${relative}/index.html` : 'index.html';
    file = join(file, 'index.html');
  }
  if (!(await isFile(file))) return answer(res, 404, 'not found');
  return sendFile(req, res, file, { folderRoot, relative });
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return answer(res, 404, 'not here');
  const path = url.pathname.slice(PREFIX.length).replace(/^\//, '').replace(/\/$/, '');
  let parts;
  try {
    parts = path ? path.split('/').map(decodeURIComponent) : [];
  } catch {
    return answer(res, 400, 'a bad path');
  }
  const bad = (part) => part === '' || part === '.' || part === '..' || part.includes('/') || part.includes('\\');
  if (parts.some(bad)) return answer(res, 400, 'a bad path');
  if (parts[0] === 'health' && parts.length === 1) return answer(res, 200, 'ok');
  if (parts[0] === 'api') return api(req, res, parts.slice(1));
  if (req.method !== 'GET' && req.method !== 'HEAD') return answer(res, 405, 'read only', { allow: 'GET, HEAD' });
  return serve(req, res, parts, url);
}

/** The service on `port` (0: any; its PORT by default), `overrides` over the environment's settings (`DATA`,
 *  `PREVIEWS_TOKEN`... as named there); resolves to its server once it listens. */
export async function start(port, overrides = {}) {
  settings = settingsFrom({ ...process.env, ...overrides });
  await mkdir(settings.data, { recursive: true });
  // what an upload cut off by a restart left
  await rm(join(settings.data, INCOMING), { recursive: true, force: true });
  await prune(0);
  const http = createServer((req, res) => {
    handle(req, res).catch((error) => {
      const status = error.status ?? 500;
      if (status === 500) log('error', error);
      if (!res.headersSent) answer(res, status, status === 500 ? 'error' : error.message);
      else res.destroy();
    });
  });
  // (a big build over a slow link: the request may take its time)
  http.requestTimeout = 10 * 60_000;
  await new Promise((resolve) => http.listen(port ?? settings.port, resolve));
  const kept = await prsKept();
  log(`previews on :${http.address().port}, ${kept.length} PRs kept, API ${settings.token ? 'on' : 'off'}`);
  return http;
}
