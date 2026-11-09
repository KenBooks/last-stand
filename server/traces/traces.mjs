// The traces service (server/traces/AGENTS.md): games that ran slowly send their performance traces here, with their
// player's consent (src/perf), and agents read them back (`npm run lab -- trace`). A process of its own beside the
// co-op relay, on the same host under /traces, so an upload never holds a room's messages up.
//   POST /traces                  a trace, gzipped (1 MB at most), from the game's own pages  -> 201 { code }
//   GET  /traces/health           200 "ok"
//   GET  /traces?build=&q=&limit=&offset=  the traces kept, newest first (read)         -> { traces: [...], total }
//   GET  /traces  (Accept: text/html)  the page to browse them (web/, built; page.mjs), signed in by a Dokci link
//   GET  /traces/assets/<file>    the page's built script and style, named by their content's hash (cached for good)
//   GET  /traces?dokci_link=v1.<exp>.<sig>  a Dokci link: one use, sets the session cookie, moves on to /traces
//   GET  /traces/summary          how many are kept, their size, builds, scenes, the disk's budget (read)
//   GET  /traces/latest           the newest trace's gzip (read), its code in X-Trace-Code
//   GET  /traces/<code>           a trace's gzip (read)
// Reading takes the secret token (`Authorization: Bearer <TRACES_TOKEN>`) or the session cookie a Dokci link set (a
// browser never sees the token): a report's code alone reads nothing. Kept for KEEP_DAYS, the oldest dropped first
// past DISK_MAX (100 MB: the traces and the lines beside them); each address may send PER_DAY in any 24 hours (10:
// what a game holds itself to, src/perf/consent.ts).
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { asset, notePage, pageBuilt, viewerPage } from './page.mjs';

const env = process.env;
/** Origins from a comma-separated list, a `*` standing for one DNS label's worth (`https://pr-*.ls.wellscoped.dev`:
 *  each PR's preview, at a host of its own), as something with `has(origin)` (the relay has its own copy: each
 *  service is a Docker build of its own folder). */
export function originsFrom(list) {
  const exact = new Set();
  const patterns = [];
  for (const origin of list.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!origin.includes('*')) {
      exact.add(origin);
      continue;
    }
    const parts = origin.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    patterns.push(new RegExp(`^${parts.join('[a-z0-9-]+')}$`));
  }
  return { has: (origin) => exact.has(origin) || patterns.some((pattern) => pattern.test(origin)) };
}
/** The service's settings, from the environment (`start` may give others: the lab's local one, its tests'). */
export function settingsFrom(vars) {
  return {
    port: Number(vars.PORT ?? 8080),
    data: vars.DATA ?? '/data',
    /** pages allowed to send (the relay's: the game's own domain, the github.io address it moved from, the dev
     *  server) */
    origins: originsFrom(vars.ORIGINS
      ?? 'https://last-stand.cc,https://www.last-stand.cc,https://victorzakharov.github.io,https://pr-*.ls.wellscoped.dev,https://c-*.ls.wellscoped.dev,http://localhost:5173'),
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

/** Whether two strings are the same, in constant time (their digests compared, so their lengths don't show). */
function same(a, b) {
  const digest = (v) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** base64url HMAC-SHA256 of `text` keyed by the token: a Dokci link's and the session's signature. */
const sign = (text) => createHmac('sha256', settings.token).update(text, 'utf8').digest('base64url');

/** How far ahead a Dokci link may expire (Dokci makes them 300 s), with 30 s of the clocks' skew. */
const LINK_AHEAD = 330;
const SESSION_S = 12 * 60 * 60;
const COOKIE = 'ls_traces';
/** a Dokci link's signature -> its expiry (s): each link signs in once, kept till it would have expired */
const usedLinks = new Map();

/** The host a link was signed for: the request's Host, lower-cased, without its port. */
function hostOf(req) {
  const host = String(req.headers.host ?? '').toLowerCase();
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d+$/, '');
}

/** Whether `link` (`v1.<exp>.<sig>`) is a Dokci link for this host and path, unexpired and unused: it's then used. */
function linkHolds(req, path, link, now = Date.now() / 1000) {
  const match = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(link);
  if (!match) return false;
  const exp = Number(match[1]), sig = match[2];
  if (!(exp > now && exp <= now + LINK_AHEAD)) return false;
  if (!same(sig, sign(`dokci-link/v1\n${hostOf(req)}\n${path}\n${exp}`))) return false;
  for (const [used, until] of usedLinks) if (until <= now) usedLinks.delete(used);
  if (usedLinks.has(sig)) return false;
  usedLinks.set(sig, exp);
  return true;
}

/** A session's cookie, for 12 hours: its expiry signed by the token, so a new token ends every session. */
function sessionCookie(now = Date.now() / 1000) {
  const exp = Math.floor(now) + SESSION_S;
  return `${COOKIE}=${exp}.${sign(`ls-traces-session/v1\n${exp}`)}; HttpOnly; Secure; SameSite=Strict; Path=/traces; `
    + `Max-Age=${SESSION_S}`;
}

/** Whether the request carries a session cookie the token signed, unexpired. */
function inSession(req, now = Date.now() / 1000) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [name, value = ''] = part.trim().split('=');
    const match = name === COOKIE && /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
    if (match && Number(match[1]) > now && same(match[2], sign(`ls-traces-session/v1\n${match[1]}`))) return true;
  }
  return false;
}

/** Whether the request may read: the token (compared in constant time), or a session a Dokci link began. */
function authorised(req) {
  if (!settings.token) return false;
  const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  return (given !== '' && same(given, settings.token)) || inSession(req);
}

/** Whether a browser is asking for a page (its navigations say text/html; the lab's fetches don't). */
const wantsPage = (req) => String(req.headers.accept ?? '').includes('text/html');

/** The page's own files and nothing else (the build inlines nothing): no frames, no referrer (a Dokci link in
 *  the address must never leak). */
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; "
  + "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PAGE_HEADERS = {
  'content-security-policy': CSP, 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

/** An HTML page, never cached (it names the hashed files of the build it came with). */
function page(res, status, html, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...PAGE_HEADERS,
    ...headers });
  res.end(html);
}
const note = (res, status, heading, text) => page(res, status, notePage(heading, text));

/** A built script or style: named by its content's hash, so cached for good. Public: it holds no trace. */
function serveAsset(res, name) {
  const file = asset(name);
  if (!file) return answer(res, 404, 'no such file');
  res.writeHead(200, { 'content-type': file.type, 'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff' });
  res.end(file.body);
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

/** Whether a trace's line holds `q` (the page's filter: any of its build, scene, why, GPU, quality or code). */
function holds(meta, q) {
  const fields = [meta.code, meta.commit, meta.pr ? `#${meta.pr}` : '', meta.bundle, meta.scene, meta.why, meta.gpu,
    meta.quality];
  return fields.some((field) => String(field).toLowerCase().includes(q));
}

/** The list, newest first: `build` keeps a commit's (or a bundle's, or a PR's) alone, `q` those whose line holds it,
 *  `limit` so many from the `offset`th newest (the page asks for them a page at a time). */
function list(url) {
  const build = url.searchParams.get('build') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(500, Number(url.searchParams.get('limit')) || 50);
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const all = [...index.values()].reverse()
    .filter((m) => !build || m.commit.startsWith(build) || m.bundle === build || String(m.pr) === build.replace(/^#/, ''))
    .filter((m) => !q || holds(m, q));
  return { traces: all.slice(offset, offset + limit), total: all.length };
}

/** What's kept, all of it (the list is a page at a time): counts, sizes, ages, builds, and the disk's budget. */
function summary() {
  const metas = [...index.values()];
  const tally = (key) => metas.reduce((counts, m) => ({ ...counts, [m[key]]: (counts[m[key]] ?? 0) + 1 }), {});
  return {
    count: metas.length,
    bytes: metas.reduce((sum, m) => sum + m.bytes, 0),
    diskBytes,
    oldest: metas[0]?.at ?? null,
    newest: metas[metas.length - 1]?.at ?? null,
    builds: new Set(metas.map((m) => m.commit || m.bundle).filter(Boolean)).size,
    prs: new Set(metas.map((m) => m.pr).filter(Boolean)).size,
    scenes: tally('scene'),
    whys: tally('why'),
    keepDays: settings.keepDays,
    diskMax: settings.diskMax,
    diskFull: settings.diskMax ? diskBytes / settings.diskMax : 0,
  };
}

async function read(res, code) {
  if (!index.has(code)) return answer(res, 404, 'no such trace');
  return answer(res, 200, await readFile(fileOf(code)), {
    'x-trace-code': code, 'content-disposition': `attachment; filename="${code}.lspt.gz"`,
  });
}

/** A Dokci link (`?dokci_link=`): signs the browser in for a session and drops the link from the address. A page
 *  that moves on to /traces, not a 303: the link is opened from Dokci, another site, and a browser sends no
 *  SameSite=Strict cookie on a redirect that navigation began (Chrome showed "Not signed in"); the page's own
 *  refresh is a navigation from this site, which does. */
function signIn(req, res, path, link) {
  if (!linkHolds(req, path, link)) {
    return note(res, 401, 'Link expired', 'This sign-in link has expired, was already used or is invalid. Open the traces again from Dokci.');
  }
  log('signed in', addressOf(req));
  page(res, 200, notePage('Signed in', 'Opening the traces...', '/traces'), { 'set-cookie': sessionCookie() });
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
  if (path.startsWith('/traces/assets/')) return serveAsset(res, path.slice('/traces/assets/'.length));
  const browsing = path === '/traces' && wantsPage(req) && pageBuilt();
  if (!settings.token) {
    return browsing ? note(res, 503, 'Reading is off', 'The traces service has no token set, so nothing can read them.')
      : answer(res, 503, 'reading is off: no TRACES_TOKEN set');
  }
  const link = url.searchParams.get('dokci_link');
  if (path === '/traces' && link !== null) {
    return pageBuilt() ? signIn(req, res, path, link) : answer(res, 503, 'the page was not built');
  }
  if (!authorised(req)) {
    return browsing ? note(res, 401, 'Not signed in', 'Open the traces from Dokci: its link signs this browser in.')
      : answer(res, 401, 'the token, please');
  }
  if (browsing) return page(res, 200, viewerPage());
  if (path === '/traces') return answer(res, 200, list(url));
  if (path === '/traces/summary') return answer(res, 200, summary());
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
  usedLinks.clear();
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
