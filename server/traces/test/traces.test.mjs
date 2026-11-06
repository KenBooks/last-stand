// The traces service (traces.mjs) on a port of its own, its traces in a folder of the test's: what it takes, what it
// turns away, who may read, and what it drops. Traces are made by the game's own packer (src/perf/traceFormat.ts).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { encodeTrace } from '../../../src/perf/traceFormat.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const DATA = join(ROOT, '.tmp', `traces-test-${process.pid}`);
const ORIGIN = 'https://last-stand.cc';
const TOKEN = 'test-token';
let server, base;

before(async () => {
  mkdirSync(DATA, { recursive: true });
  Object.assign(process.env, { DATA, TRACES_TOKEN: TOKEN, ORIGINS: ORIGIN, PER_HOUR: '4', PER_DAY: '50', DISK_MAX: '1000' });
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
function trace(commit = 'abc1234', frames = 30) {
  const interval = Array.from({ length: frames }, (_, i) => 16 + (i % 5));
  const bytes = encodeTrace({
    at: new Date().toISOString(), build: { bundle: 'index-x.js', commit, pr: null }, page: '/',
    reason: { scene: 'lobby', why: 'low' }, device: { gpu: 'test GPU', ua: 'test' }, settings: { quality: 'low' }, game: {},
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

test('takes so many an hour from one address, and others still', async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await send(trace(), { address: '10.0.0.9' })).status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 429]);
  assert.equal((await send(trace(), { address: '10.0.0.10' })).status, 201);
});

test('drops the oldest once the disk holds over its cap', async () => {
  const { traces } = await (await read('/traces?limit=500')).json();
  const kept = traces.reduce((sum, t) => sum + t.bytes, 0);
  assert.ok(kept <= 1000, `kept ${kept} B, over the 1000 B cap`);
  // (seven were taken, some 270 B each: the newest three kept)
  assert.equal(traces.length, 3);
  const files = readdirSync(DATA).filter((name) => name.endsWith('.lspt.gz'));
  assert.equal(files.length, traces.length);
});

test('answers its health without the token, and reads nothing for a page', async () => {
  assert.equal(await (await fetch(`${base}/traces/health`)).text(), 'ok');
  assert.equal((await read('/traces', '')).status, 401);
});
