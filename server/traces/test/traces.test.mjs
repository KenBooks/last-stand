// The traces service (traces.mjs) on a port of its own, its traces in a folder of the test's: what it takes, what it
// turns away, who may read, and what it drops. Traces are made by the game's own packer (src/perf/traceFormat.ts).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHmac } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { encodeTrace } from '../../../src/perf/traceFormat.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const DATA = join(ROOT, '.tmp', `traces-test-${process.pid}`);
const ORIGIN = 'https://last-stand.cc';
const TOKEN = 'test-token';
let server, base;

before(async () => {
  mkdirSync(DATA, { recursive: true });
  Object.assign(process.env, { DATA, TRACES_TOKEN: TOKEN, ORIGINS: ORIGIN, PER_DAY: '4', DISK_MAX: '1000' });
  const { start } = await import('../traces.mjs');
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  // (the folder this test made, and nothing else)
  rmSync(DATA, { recursive: true, force: true });
});

/** A small trace of `frames` frames from `commit`, gzipped. */
function trace(commit = 'abc1234', frames = 30, reason = { scene: 'lobby', why: 'low' }) {
  const interval = Array.from({ length: frames }, (_, i) => 16 + (i % 5));
  const bytes = encodeTrace({
    at: new Date().toISOString(), build: { bundle: 'index-x.js', commit, pr: null }, page: '/',
    reason, device: { gpu: 'test GPU', ua: 'test' }, settings: { quality: 'low' }, game: {},
    columns: [{ name: 'interval', kind: 'ms' }], longFrames: [], marks: [],
  }, frames, { interval });
  return gzipSync(bytes);
}

/** Posts `body` as the game does, from `origin`, as `address`. */
const send = (body, { origin = ORIGIN, address = '10.0.0.1' } = {}) =>
  fetch(`${base}/traces`, { method: 'POST', body, headers: { origin, 'x-forwarded-for': `1.2.3.4, ${address}` } });
const read = (path, token = TOKEN) => fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('takes a trace from the game and answers with its code, readable with the token alone', async () => {
  const body = trace('feed123');
  const r = await send(body);
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const { code } = await r.json();
  assert.match(code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal((await read(`/traces/${code}`, '')).status, 401);
  assert.equal((await read(`/traces/${code}`, 'wrong')).status, 401);
  const got = await read(`/traces/${code}`);
  assert.equal(got.status, 200);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), body);
  const latest = await read('/traces/latest');
  assert.equal(latest.headers.get('x-trace-code'), code);
  const { traces } = await (await read('/traces?build=feed')).json();
  assert.deepEqual(traces.map((t) => [t.code, t.commit, t.scene, t.why]), [[code, 'feed123', 'lobby', 'low']]);
});

test('turns away other pages, what isn\'t a trace and what is too big', async () => {
  assert.equal((await send(trace(), { origin: 'https://evil.example', address: '10.0.0.2' })).status, 403);
  assert.equal((await send(Buffer.from('not gzip'), { address: '10.0.0.3' })).status, 400);
  assert.equal((await send(gzipSync(Buffer.from('LSPX not a trace')), { address: '10.0.0.3' })).status, 400);
  const big = Buffer.alloc((1 << 20) + 10, 7);
  assert.equal((await send(big, { address: '10.0.0.4' })).status, 413);
});

test('takes so many a day from one address, and others still', async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await send(trace(), { address: '10.0.0.9' })).status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 429]);
  assert.equal((await send(trace(), { address: '10.0.0.10' })).status, 201);
});

test('drops the oldest once the disk holds over its cap', async () => {
  const { traces } = await (await read('/traces?limit=500')).json();
  const onDisk = readdirSync(DATA).reduce((sum, name) => sum + statSync(join(DATA, name)).size, 0);
  assert.ok(onDisk <= 1000, `the disk holds ${onDisk} B, over the 1000 B cap`);
  // (seven were taken, each some 270 B and its line some 250: the newest kept, the oldest dropped)
  assert.ok(traces.length >= 1 && traces.length < 7, `${traces.length} kept`);
  const newest = traces[0].code;
  assert.ok(readdirSync(DATA).includes(`${newest}.lspt.gz`), 'the newest is kept');
  const files = readdirSync(DATA).filter((name) => name.endsWith('.lspt.gz'));
  assert.equal(files.length, traces.length);
});

test('answers its health without the token, and reads nothing for a page', async () => {
  assert.equal(await (await fetch(`${base}/traces/health`)).text(), 'ok');
  assert.equal((await read('/traces', '')).status, 401);
});

test('takes each PR preview\'s host by its pattern, and no other', async () => {
  const { originsFrom } = await import('../traces.mjs');
  const origins = originsFrom('https://last-stand.cc, https://pr-*.ls.wellscoped.dev');
  assert.equal(origins.has('https://last-stand.cc'), true);
  assert.equal(origins.has('https://pr-352.ls.wellscoped.dev'), true);
  assert.equal(origins.has('https://pr-.ls.wellscoped.dev'), false);
  assert.equal(origins.has('https://pr-1.evil.ls.wellscoped.dev'), false);
  assert.equal(origins.has('https://pr-1.ls.wellscoped.dev.evil.example'), false);
  assert.equal(origins.has('http://pr-1.ls.wellscoped.dev'), false);
  assert.equal(origins.has('https://prX1.ls.wellscoped.dev'), false);
});

/** A Dokci link to `path` on `host`, signed as Dokci signs it: `v1.<exp>.<sig>`, the HMAC keyed by the token. */
function dokciLink({ exp = Math.floor(Date.now() / 1000) + 300, host = '127.0.0.1', path = '/traces', key = TOKEN } = {}) {
  const sig = createHmac('sha256', key).update(`dokci-link/v1\n${host}\n${path}\n${exp}`, 'utf8').digest('base64url');
  return `v1.${exp}.${sig}`;
}
/** A session cookie as the service signs it, expiring at `exp` (s). */
function session(exp, key = TOKEN) {
  const sig = createHmac('sha256', key).update(`ls-traces-session/v1\n${exp}`, 'utf8').digest('base64url');
  return `ls_traces=${exp}.${sig}`;
}
const HTML = 'text/html,application/xhtml+xml,*/*;q=0.8';
/** A browser's navigation: text/html, the cookie if any, redirects left to the test. */
const browse = (path, cookie) =>
  fetch(`${base}${path}`, { redirect: 'manual', headers: { accept: HTML, ...(cookie ? { cookie } : {}) } });
/** A read with the cookie alone, as the page's script makes it. */
const withCookie = (path, cookie) => fetch(`${base}${path}`, { headers: { cookie } });

test('serves a browser the page, an API client the list', async () => {
  const signedOut = await browse('/traces');
  assert.equal(signedOut.status, 401);
  assert.match(signedOut.headers.get('content-type'), /^text\/html/);
  assert.match(await signedOut.text(), /from Dokci/);
  const pageR = await fetch(`${base}/traces`, { headers: { accept: HTML, authorization: `Bearer ${TOKEN}` } });
  assert.equal(pageR.status, 200);
  assert.match(pageR.headers.get('content-type'), /^text\/html/);
  const csp = pageR.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.equal(pageR.headers.get('x-frame-options'), 'DENY');
  assert.equal(pageR.headers.get('referrer-policy'), 'no-referrer');
  const html = await pageR.text();
  const nonce = /script-src 'nonce-([^']+)'/.exec(csp)[1];
  assert.ok(html.includes(`<script nonce="${nonce}">`), 'the page\'s script carries the CSP\'s nonce');
  const api = await read('/traces');
  assert.match(api.headers.get('content-type'), /^application\/json/);
  assert.ok(Array.isArray((await api.json()).traces));
});

test('sums up all that is kept, past a page of the list', async () => {
  await send(trace('cafe001', 20, { scene: 'fight', why: 'stall' }), { address: '10.0.1.1' });
  await send(trace('cafe002', 20, { scene: 'fight', why: 'low' }), { address: '10.0.1.2' });
  const s = await (await read('/traces/summary')).json();
  const { traces, total } = await (await read('/traces?limit=500')).json();
  assert.equal(s.count, total);
  assert.equal(s.bytes, traces.reduce((sum, t) => sum + t.bytes, 0));
  const onDisk = readdirSync(DATA).reduce((sum, name) => sum + statSync(join(DATA, name)).size, 0);
  assert.equal(s.diskBytes, onDisk, 'the disk use counts the traces and their lines');
  assert.equal(s.newest, traces[0].at);
  assert.equal(s.oldest, traces[traces.length - 1].at);
  assert.equal(s.builds, new Set(traces.map((t) => t.commit)).size);
  const scenes = {};
  for (const t of traces) scenes[t.scene] = (scenes[t.scene] ?? 0) + 1;
  assert.deepEqual(s.scenes, scenes);
  assert.ok(s.scenes.fight >= 1);
  assert.deepEqual([s.keepDays, s.diskMax], [30, 1000]);
  assert.equal(s.diskFull, onDisk / 1000);
  // (a page of one, then the next, past the end of the few the test's small disk keeps; a filter by text)
  const first = await (await read('/traces?limit=1')).json();
  const second = await (await read('/traces?limit=1&offset=1')).json();
  const codes = (r) => r.traces.map((t) => t.code);
  assert.deepEqual([codes(first), codes(second)], [codes({ traces: traces.slice(0, 1) }), codes({ traces: traces.slice(1, 2) })]);
  assert.equal(first.total, total);
  const found = await (await read('/traces?q=CAFE002')).json();
  assert.deepEqual(found.traces.map((t) => t.commit), ['cafe002']);
});

test('signs a browser in by a Dokci link, once, and reads by its cookie', async () => {
  const link = dokciLink();
  const r = await browse(`/traces?dokci_link=${link}`);
  // (a page that moves on to /traces itself, so the browser's next request is this site's own and carries the
  // SameSite=Strict cookie; a 303 from a link opened on Dokci's site went without it)
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await r.text(), /<meta http-equiv="refresh" content="0; url=\/traces">/);
  const set = r.headers.get('set-cookie');
  assert.match(set, /^ls_traces=\d+\.[A-Za-z0-9_-]+; HttpOnly; Secure; SameSite=Strict; Path=\/traces; Max-Age=43200$/);
  const cookie = set.split(';')[0];
  const pageR = await browse('/traces', cookie);
  assert.equal(pageR.status, 200);
  assert.match(await pageR.text(), /<table>/);
  assert.equal((await withCookie('/traces/summary', cookie)).status, 200);
  const { traces } = await (await withCookie('/traces', cookie)).json();
  const got = await withCookie(`/traces/${traces[0].code}`, cookie);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-disposition'), `attachment; filename="${traces[0].code}.lspt.gz"`);
  assert.equal((await withCookie('/traces/latest', cookie)).status, 200);
  // (used once: the same link again signs nothing in)
  const again = await browse(`/traces?dokci_link=${link}`);
  assert.equal(again.status, 401);
  assert.equal(again.headers.get('set-cookie'), null);
  assert.match(await again.text(), /expired/);
});

test('turns away expired, too far ahead, wrongly signed and other hosts\' links', async () => {
  const now = Math.floor(Date.now() / 1000);
  const links = {
    expired: dokciLink({ exp: now - 1 }),
    tooFar: dokciLink({ exp: now + 400 }),
    wrongKey: dokciLink({ key: 'another-token' }),
    otherHost: dokciLink({ host: 'evil.example' }),
    otherPath: dokciLink({ path: '/traces/latest' }),
    garbled: 'v1.123.abc',
  };
  for (const [name, link] of Object.entries(links)) {
    const r = await browse(`/traces?dokci_link=${encodeURIComponent(link)}`);
    assert.equal(r.status, 401, name);
    assert.equal(r.headers.get('set-cookie'), null, name);
  }
  // (with the clocks 30 s apart a link still holds)
  assert.equal((await browse(`/traces?dokci_link=${dokciLink({ exp: now + 325 })}`)).status, 200);
});

test('turns away an expired session and one another token signed; the token still reads', async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await withCookie('/traces', session(now - 1))).status, 401);
  assert.equal((await withCookie('/traces', session(now + 3600, 'another-token'))).status, 401);
  assert.equal((await withCookie('/traces', 'ls_traces=garbage')).status, 401);
  assert.equal((await browse('/traces', session(now - 1))).status, 401);
  assert.equal((await withCookie('/traces', session(now + 3600))).status, 200);
  assert.equal((await read('/traces/summary')).status, 200);
  assert.equal((await read('/traces/summary', 'wrong')).status, 401);
});
