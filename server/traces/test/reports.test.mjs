// The bug reports (reports.mjs) the traces service takes from the pause menu's form (src/ui/bugReport.ts), on a port of
// its own, kept in a folder of the test's: what it takes and reads back, each limit it holds a report to, the rate
// limits an hour and a day, the disk's cap, the days it keeps them, and that no address is written down.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KINDS, Limiter, jpegSize } from '../reports.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const DATA = join(ROOT, '.tmp', `reports-test-${process.pid}`);
const ORIGIN = 'https://last-stand.cc';
const TOKEN = 'test-token';
/** an address never held to its own limits (every address's together still counts it) */
const TRUSTED = '10.9.0.1';
/** the limits the tests run with: small, so each is reached in a few sends */
const LIMITS = {
  REPORT_PER_HOUR: '3', REPORT_PER_DAY: '4', REPORT_PER_DAY_ALL: '60', REPORT_PICTURE_MAX: String(64 << 10),
  REPORT_MAX_BYTES: String(128 << 10),
};
let server, base;
/** a fresh address for each send that shouldn't be held to an earlier one's count */
let nextAddress = 1;
const fresh = () => `10.1.${Math.floor(nextAddress / 250)}.${nextAddress++ % 250}`;

async function startWith(overrides = {}) {
  server?.close();
  const { start } = await import('../traces.mjs');
  server = await start(0, { DATA, TRACES_TOKEN: TOKEN, ORIGINS: ORIGIN, TRUSTED_ADDRESSES: TRUSTED, ...LIMITS,
    ...overrides });
  base = `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  mkdirSync(DATA, { recursive: true });
  await startWith();
});

after(() => {
  server?.close();
  // (the folder this test made, and nothing else)
  rmSync(DATA, { recursive: true, force: true });
});

/** A JPEG's markers as a decoder reads its size: SOI, an APP0 padded by `pad` bytes, a start of frame, EOI. */
function jpeg(width = 640, height = 360, pad = 100) {
  const segments = [Buffer.from([0xff, 0xd8])];
  for (let left = pad; left > 0; left -= 65000) {
    const size = Math.min(left, 65000);
    const app = Buffer.alloc(4 + size, 0x20);
    app.writeUInt16BE(0xffe0, 0);
    app.writeUInt16BE(size + 2, 2);
    segments.push(app);
  }
  const frame = Buffer.from([0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  segments.push(frame, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(segments);
}

/** A report as the form sends one, `changes` over it. */
const report = (changes = {}) => ({
  kind: 'looks', text: 'The warrior\'s arm went through his shield.', expected: 'The shield stays on his arm.',
  facts: ['Where: the lobby', 'Build: abc1234'], picture: jpeg().toString('base64'), ...changes,
});

/** Posts `body` (JSON unless a string already) as the game does, from `origin`, as `address`. */
const send = (body, { origin = ORIGIN, address = fresh() } = {}) => fetch(`${base}/traces/reports`, {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { origin, 'x-forwarded-for': `1.2.3.4, ${address}`, 'content-type': 'text/plain;charset=UTF-8' },
});
const read = (path, token = TOKEN) => fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('the server\'s kinds are the form\'s', () => {
  const source = readFileSync(join(ROOT, 'src/data/bugReport.ts'), 'utf8');
  const ids = [...source.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), [...KINDS].sort());
});

test('takes a report from the game and answers with its code, readable with the token alone', async () => {
  const sent = report();
  const r = await send(sent, { address: '10.2.0.1' });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const { code } = await r.json();
  assert.match(code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  for (const path of ['/traces/reports', `/traces/reports/${code}`, `/traces/reports/${code}.jpg`]) {
    assert.equal((await read(path, '')).status, 401);
    assert.equal((await read(path, 'wrong')).status, 401);
  }
  const whole = await (await read(`/traces/reports/${code}`)).json();
  assert.equal(whole.kind, 'looks');
  assert.equal(whole.text, sent.text);
  assert.equal(whole.expected, sent.expected);
  assert.deepEqual(whole.facts, sent.facts);
  assert.equal(whole.picture, true);
  const picture = await read(`/traces/reports/${code.toLowerCase()}.jpg`);
  assert.equal(picture.headers.get('content-type'), 'image/jpeg');
  assert.equal(picture.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await picture.arrayBuffer()), jpeg());
  const { reports, total } = await (await read('/traces/reports')).json();
  assert.ok(total >= 1);
  assert.equal(reports[0].code, code);
  // (no address written down: the rate limits count in memory alone)
  for (const name of readdirSync(join(DATA, 'reports')).filter((n) => n.endsWith('.json'))) {
    const kept = readFileSync(join(DATA, 'reports', name), 'utf8');
    assert.ok(!kept.includes('10.2.0.1') && !kept.includes('1.2.3.4'), `${name} holds an address`);
  }
});

test('takes a report without a picture, and answers a preflight for the game\'s pages', async () => {
  const r = await send(report({ picture: null, expected: undefined }));
  assert.equal(r.status, 201);
  const { code } = await r.json();
  assert.equal((await (await read(`/traces/reports/${code}`)).json()).picture, false);
  assert.equal((await read(`/traces/reports/${code}.jpg`)).status, 404);
  const preflight = await fetch(`${base}/traces/reports`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
});

test('turns away other pages, and what isn\'t a report the form could make', async () => {
  const refused = async (body, status = 400, options = {}) => assert.equal((await send(body, options)).status, status,
    JSON.stringify(body).slice(0, 80));
  await refused(report(), 403, { origin: 'https://evil.example' });
  await refused(report(), 403, { origin: '' });
  await refused('not json');
  await refused('[1, 2]');
  await refused(report({ name: 'Ken' }));
  await refused(report({ room: 'ABCD' }));
  await refused(report({ kind: 'fire' }));
  await refused(report({ kind: undefined }));
  await refused(report({ text: 'too short' }));
  await refused(report({ text: '          x          ' }));
  await refused(report({ text: 'x'.repeat(1201) }));
  await refused(report({ expected: 'x'.repeat(401) }));
  await refused(report({ expected: 4 }));
  await refused(report({ facts: Array.from({ length: 17 }, (_, i) => `Line ${i}`) }));
  await refused(report({ facts: ['x'.repeat(401)] }));
  await refused(report({ facts: [{ html: '<b>' }] }));
  await refused(report({ picture: 'not base64!' }));
  await refused(report({ picture: Buffer.from('\x89PNG\r\n\x1a\nnot a jpeg at all').toString('base64') }));
  await refused(report({ picture: jpeg(1281, 720).toString('base64') }));
  await refused(report({ picture: jpeg(640, 360, 65 << 10).toString('base64') }));
  // (a body over its most, by the length it says)
  await refused(report({ facts: ['x'.repeat(130 << 10)] }), 413);
  // (what it takes at the edges)
  assert.equal((await send(report({ text: 'x'.repeat(1200), expected: 'y'.repeat(400) }))).status, 201);
  assert.equal((await send(report({ picture: jpeg(1280, 1280, 60 << 10).toString('base64') }))).status, 201);
});

test('takes so many an hour and a day from one address, and others still', async () => {
  const address = '10.3.0.1';
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await send(report(), { address })).status);
  assert.deepEqual(statuses, [201, 201, 201, 429]);
  const refused = await send(report(), { address });
  assert.equal(await refused.text(), 'too many reports from here');
  const retry = Number(refused.headers.get('retry-after'));
  assert.ok(retry > 3500 && retry <= 3600, `retry after ${retry} s`);
  assert.equal(refused.headers.get('access-control-expose-headers'), 'retry-after');
  assert.equal((await send(report(), { address: '10.3.0.2' })).status, 201);
  // (a report turned away for what it holds still counts: nobody probes the limits for free)
  const probing = '10.3.0.3';
  for (let i = 0; i < 3; i++) assert.equal((await send('nope', { address: probing })).status, 400);
  assert.equal((await send(report(), { address: probing })).status, 429);
});

test('takes any number from a trusted address', async () => {
  for (let i = 0; i < 6; i++) assert.equal((await send(report(), { address: TRUSTED })).status, 201);
});

test('an hour\'s and a day\'s windows free their places as they pass', () => {
  const hour = 3_600_000;
  const limiter = new Limiter([[hour, 3], [24 * hour, 4]]);
  const at = (hours) => hours * hour;
  for (const t of [0, 0.1, 0.2]) assert.ok(limiter.take('a', at(t)).ok);
  const held = limiter.take('a', at(0.5));
  assert.equal(held.ok, false);
  assert.equal(held.retryMs, at(0.5));
  assert.ok(limiter.take('b', at(0.5)).ok);
  // (an hour on, the hour has room; the day holds a fourth and no more till the first is a day old)
  assert.ok(limiter.take('a', at(1.01)).ok);
  const day = limiter.take('a', at(3));
  assert.equal(day.ok, false);
  assert.equal(day.retryMs, at(21));
  assert.ok(limiter.take('a', at(24.01)).ok);
  limiter.prune(at(60));
  assert.equal(limiter.sent.size, 0);
});

test('reads a JPEG\'s size from its markers, and nothing else', () => {
  assert.deepEqual(jpegSize(jpeg(1280, 720)), { width: 1280, height: 720 });
  assert.deepEqual(jpegSize(jpeg(3, 4, 70_000)), { width: 3, height: 4 });
  assert.equal(jpegSize(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(jpegSize(jpeg().subarray(0, -1)), null);
  assert.equal(jpegSize(Buffer.from('GIF89a')), null);
});

test('takes so many a day from every address together', async () => {
  await startWith({ REPORT_PER_DAY_ALL: '3' });
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await send(report())).status);
  assert.deepEqual(statuses, [201, 201, 201, 429]);
  const refused = await send(report(), { address: TRUSTED });
  assert.equal(refused.status, 429);
  assert.equal(await refused.text(), 'too many reports today');
  await startWith();
});

test('keeps its reports across a start, and drops them after their days and the oldest past the disk\'s cap', async () => {
  rmSync(join(DATA, 'reports'), { recursive: true, force: true });
  // (each report some 2.4 KB, its picture most of it: three fit, a fourth pushes the oldest out)
  const picture = jpeg(640, 360, 2000);
  await startWith({ REPORT_DISK_MAX: String(3 * (picture.length + 400)) });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await (await send(report({ picture: picture.toString('base64') }))).json()).code);
  const { reports, diskBytes, diskMax } = await (await read('/traces/reports')).json();
  assert.ok(diskBytes <= diskMax, `${diskBytes} B kept over ${diskMax}`);
  assert.ok(!reports.some((r) => r.code === codes[0]), 'the oldest was kept');
  assert.equal(reports[0].code, codes[3]);
  assert.equal((await read(`/traces/reports/${codes[0]}.jpg`)).status, 404);
  // (a report 91 days old, as an old volume would hold one: dropped as the service starts)
  const old = { code: 'OLD0-0000', at: new Date(Date.now() - 91 * 86_400_000).toISOString(), kind: 'other',
    text: 'an old report', expected: '', facts: [], picture: false, pictureBytes: 0 };
  writeFileSync(join(DATA, 'reports', 'OLD0-0000.json'), JSON.stringify(old));
  await startWith();
  const after = await (await read('/traces/reports')).json();
  assert.ok(after.reports.some((r) => r.code === codes[3]), 'a report was lost across the start');
  assert.ok(!readdirSync(join(DATA, 'reports')).includes('OLD0-0000.json'), 'the old report was kept');
  assert.equal(after.keepDays, 90);
});

test('reads nothing without the token set', async () => {
  await startWith({ TRACES_TOKEN: '' });
  assert.equal((await read('/traces/reports')).status, 503);
  assert.equal((await send(report())).status, 201);
  await startWith();
});
