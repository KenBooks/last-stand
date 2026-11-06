// The traces service (server/traces/AGENTS.md): games that ran slowly send their performance traces here, with their
// player's consent (src/perf), and agents read them back (`npm run lab -- trace`). A process of its own beside the
// co-op relay, on the same host under /traces, so an upload never holds a room's messages up.
//   POST /traces                  a trace, gzipped (1 MB at most), from the game's own pages  -> 201 { code }
//   GET  /traces/health           200 "ok"
//   GET  /traces?build=&limit=    the traces kept, newest first (token)                     -> { traces: [...] }
//   GET  /traces/latest           the newest trace's gzip (token), its code in X-Trace-Code
//   GET  /traces/<code>           a trace's gzip (token)
// Reading takes the secret token (`Authorization: Bearer <TRACES_TOKEN>`): a report's code alone reads nothing. Kept
// for KEEP_DAYS, the oldest dropped first past DISK_MAX (100 MB: the traces and the lines beside them); each address may send PER_DAY in any 24 hours
// (10: what a game holds itself to, src/perf/consent.ts).
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const env = process.env;
/** The service's settings, from the environment (`start` may give others: the lab's local one, its tests'). */
function settingsFrom(vars) {
  return {
    port: Number(vars.PORT ?? 8080),
    data: vars.DATA ?? '/data',
    /** pages allowed to send (the relay's: the game's own domain, the github.io address it moved from, the dev
     *  server) */
    origins: new Set((vars.ORIGINS ?? 'https://last-stand.cc,https://www.last-stand.cc,https://victorzakharov.github.io,http://localhost:5173')
      .split(',').map((o) => o.trim()).filter(Boolean)),
    token: vars.TRACES_TOKEN ?? '',
    maxBytes: Number(vars.MAX_BYTES ?? 1 << 20),
    keepDays: Number(vars.KEEP_DAYS ?? 30),
    diskMax: Number(vars.DISK_MAX ?? 100 << 20),
    perDay: Number(vars.PER_DAY ?? 10),
  };
}
let settings = settingsFrom(env);
/** the most a trace may unpack to (its header checked): a gzip that unpacks without end is turned away */
const MAX_UNPACKED = 16 << 20;
/** uploads being read at once: more wait their turn with a 503 */
const AT_ONCE = 4;
const PRUNE_EVERY = 60 * 60_000;
/** a report's code: 8 letters of Crockford's base32 (no I, L, O, U), shown as ABCD-EFGH */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** code -> what's kept of it (`meta`), newest last */
const index = new Map();
let diskBytes = 0, uploading = 0;
/** address -> its uploads' times (ms) in the last day */
const sent = new Map();

function newCode() {
  const bytes = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] & 31];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** The trace's header, read from its unpacked bytes (src/perf/traceFormat.ts): "LSPT", a version, its JSON. */
function headerOf(raw) {
  if (raw.length < 10 || raw.toString('latin1', 0, 4) !== 'LSPT') throw new Error('not a trace');
  const version = raw.readUInt16LE(4), length = raw.readUInt32LE(6);
  if (version !== 1) throw new Error(`trace version ${version}`);
  if (10 + length > raw.length) throw new Error('header runs past the end');
  const header = JSON.parse(raw.toString('utf8', 10, 10 + length));
  if (typeof header?.frames !== 'number' || !Array.isArray(header.columns)) throw new Error('header without frames');
  return header;
}

/** What the list says of a trace: when, which build, where and why it was slow, on what. */
function metaOf(code, header, bytes) {
  const s = (v, n = 120) => String(v ?? '').slice(0, n);
  return {
    code, at: new Date().toISOString(), bytes,
    commit: s(header.build?.commit, 40), pr: Number(header.build?.pr) || null, bundle: s(header.build?.bundle, 80),
    scene: s(header.reason?.scene, 20), why: s(header.reason?.why, 20), frames: header.frames,
    gpu: s(header.device?.gpu), ua: s(header.device?.ua, 200), quality: s(header.settings?.quality, 20),
  };
}

const fileOf = (code) => join(settings.data, `${code}.lspt.gz`);
const metaFileOf = (code) => join(settings.data, `${code}.json`);

/** The address an upload came from: the proxy's last hop says (Traefik sets it), else the socket's. */
function addressOf(req) {
  const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? req.socket.remoteAddress ?? '?';
}

/** Whether `address` may send one more now (and counts it). */
function allowed(address, now = Date.now()) {
  const times = (sent.get(address) ?? []).filter((t) => now - t < 86_400_000);
  if (times.length >= settings.perDay) { sent.set(address, times); return false; }
  times.push(now);
  sent.set(address, times);
  return true;
}

/** Whether the request carries the token (compared in constant time). */
function authorised(req) {
  if (!settings.token) return false;
  const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const digest = (v) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(given), digest(settings.token));
}

/** The body, up to `most` bytes (null past it). */
function bodyOf(req, most) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > most) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function cors(req) {
  const origin = req.headers.origin ?? '';
  return settings.origins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
}

function answer(res, status, body, headers = {}) {
  const json = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': json ? 'application/json' : Buffer.isBuffer(body) ? 'application/gzip' : 'text/plain',
    'cache-control': 'no-store', ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

async function upload(req, res) {
  const headers = cors(req);
  if (!settings.origins.has(req.headers.origin ?? '')) return answer(res, 403, 'not from the game', headers);
  if (Number(req.headers['content-length'] ?? 0) > settings.maxBytes) return answer(res, 413, 'over its most', headers);
  if (uploading >= AT_ONCE) return answer(res, 503, 'busy', { ...headers, 'retry-after': '5' });
  if (!allowed(addressOf(req))) return answer(res, 429, 'too many', headers);
  uploading++;
  try {
    const body = await bodyOf(req, settings.maxBytes);
    if (!body) return answer(res, 413, 'over its most', headers);
    let header;
    try { header = headerOf(gunzipSync(body, { maxOutputLength: MAX_UNPACKED })); } catch (e) {
      return answer(res, 400, `not a trace: ${e.message}`, headers);
    }
    const code = newCode();
    const meta = metaOf(code, header, body.length);
    await writeFile(fileOf(code), body);
    await writeFile(metaFileOf(code), JSON.stringify(meta));
    index.set(code, meta);
    diskBytes += onDisk(meta);
    log('trace', code, `${body.length} B`, meta.commit, meta.scene, meta.why);
    if (diskBytes > settings.diskMax) await prune();
    return answer(res, 201, { code }, headers);
  } finally {
    uploading--;
  }
}

/** The list, newest first: `build` keeps a commit's (or a bundle's) alone, `limit` the newest so many. */
function list(url) {
  const build = url.searchParams.get('build') ?? '';
  const limit = Math.min(500, Number(url.searchParams.get('limit')) || 50);
  const all = [...index.values()].reverse()
    .filter((m) => !build || m.commit.startsWith(build) || m.bundle === build || String(m.pr) === build.replace(/^#/, ''));
  return { traces: all.slice(0, limit), total: all.length };
}

async function read(res, code) {
  if (!index.has(code)) return answer(res, 404, 'no such trace');
  return answer(res, 200, await readFile(fileOf(code)), { 'x-trace-code': code });
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/traces/health') return answer(res, 200, 'ok', cors(req));
  if (req.method === 'OPTIONS' && path === '/traces') {
    return answer(res, 204, '', { ...cors(req), 'access-control-allow-methods': 'POST', 'access-control-max-age': '86400' });
  }
  if (req.method === 'POST' && path === '/traces') return upload(req, res);
  if (req.method !== 'GET' || !path.startsWith('/traces')) return answer(res, 404, 'not here');
  if (!settings.token) return answer(res, 503, 'reading is off: no TRACES_TOKEN set');
  if (!authorised(req)) return answer(res, 401, 'the token, please');
  if (path === '/traces') return answer(res, 200, list(url));
  if (path === '/traces/latest') {
    const newest = [...index.keys()].pop();
    return newest ? read(res, newest) : answer(res, 404, 'none kept');
  }
  const code = decodeURIComponent(path.slice('/traces/'.length)).toUpperCase();
  return CODE.test(code) ? read(res, code) : answer(res, 404, 'not a code');
}

/** What a trace takes on the disk: its gzip and the line beside it. */
const onDisk = (meta) => meta.bytes + Buffer.byteLength(JSON.stringify(meta));

/** Drops what's older than KEEP_DAYS, then the oldest till the disk holds under DISK_MAX. */
async function prune() {
  const oldest = Date.now() - settings.keepDays * 86_400_000;
  for (const [code, meta] of index) {
    if (Date.parse(meta.at) >= oldest && diskBytes <= settings.diskMax) break;
    index.delete(code);
    diskBytes -= onDisk(meta);
    await rm(fileOf(code), { force: true });
    await rm(metaFileOf(code), { force: true });
    log('dropped', code);
  }
  for (const [address, times] of sent) if (!times.some((t) => Date.now() - t < 86_400_000)) sent.delete(address);
}

/** The index, from the traces kept (oldest first). */
async function load() {
  await mkdir(settings.data, { recursive: true });
  const metas = [];
  for (const name of await readdir(settings.data)) {
    if (!name.endsWith('.json')) continue;
    try {
      const meta = JSON.parse(await readFile(join(settings.data, name), 'utf8'));
      meta.bytes = (await stat(fileOf(meta.code))).size;
      metas.push(meta);
    } catch { /* half written: dropped below */ }
  }
  metas.sort((a, b) => a.at.localeCompare(b.at));
  for (const meta of metas) { index.set(meta.code, meta); diskBytes += onDisk(meta); }
  await prune();
}

/** The service on `port` (0: any; its PORT by default), `overrides` over the environment's settings (`DATA`,
 *  `ORIGINS`... as named there); resolves to its server once it listens. */
export async function start(port, overrides = {}) {
  settings = settingsFrom({ ...env, ...overrides });
  index.clear();
  sent.clear();
  diskBytes = 0;
  await load();
  const http = createServer((req, res) => {
    handle(req, res).catch((e) => { log('error', e); if (!res.headersSent) answer(res, 500, 'error'); else res.end(); });
  });
  http.requestTimeout = 30_000;
  const timer = setInterval(() => void prune(), PRUNE_EVERY);
  timer.unref();
  http.on('close', () => clearInterval(timer));
  await new Promise((resolve) => http.listen(port ?? settings.port, resolve));
  log(`traces on :${http.address().port}, ${index.size} kept (${Math.round(diskBytes / 1024)} KB), reading ${settings.token ? 'on' : 'off'}`);
  return http;
}
