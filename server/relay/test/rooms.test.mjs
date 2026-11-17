// The relay's rooms (rooms.mjs) through its real sockets: hosts, the public list, passwords and their limits, a
// room's size. Each check was shown to fail with what it guards switched off (`faults`, or the line taken out).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startRelay } from '../relay.mjs';
import { cardOf, siteOf } from '../rooms.mjs';

const ORIGIN = 'https://last-stand.cc', PREVIEW = 'https://pr-7.ls.wellscoped.dev';
const ORIGINS = `${ORIGIN},https://www.last-stand.cc,https://pr-*.ls.wellscoped.dev`;
const APP = 'last-stand-coop-1';
const GRACE = 150;
const CARD = { name: 'Brannoch\'s room', tag: 'Brannoch', cls: 'warrior', map: 'crypt', wave: 12, run: true, lobby: 'village', v: 36 };

let server, base, codeNo = 0;
const quiet = () => {};
before(async () => {
  server = await startRelay({ port: 0, origins: ORIGINS, grace: GRACE, log: quiet });
  base = `127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const newCode = () => `T${++codeNo}X`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A game's socket on the relay: its messages kept in order, with a wait for the next of a kind. */
function connect(code, id, { host = false, pub = false, lock = false, max, origin = ORIGIN } = {}) {
  const flags = host ? `&host=1${pub ? '&pub=1' : ''}${lock ? '&lock=1' : ''}${max ? `&max=${max}` : ''}` : '';
  const ws = new WebSocket(`ws://${base}/room/${APP}/${code}?id=${id}${flags}`, { origin });
  const got = [], waiting = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const i = waiting.findIndex((w) => w.kind(m));
    if (i >= 0) waiting.splice(i, 1)[0].resolve(m); else got.push(m);
  });
  const closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
  const next = (kind) => {
    const i = got.findIndex(kind);
    if (i >= 0) return Promise.resolve(got.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiting.push({ kind, resolve });
      setTimeout(() => reject(new Error('no such message came')), 3000);
    });
  };
  const opened = new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  return { ws, next, closed, opened, send: (m) => ws.send(JSON.stringify(m)), t: (t) => next((m) => m.t === t) };
}

/** The list a page of `origin` gets. */
async function list(origin = ORIGIN, app = APP) {
  const answer = await fetch(`http://${base}/rooms?app=${app}`, { headers: { origin } });
  return { status: answer.status, rooms: answer.ok ? (await answer.json()).rooms : null, text: answer.ok ? '' : await answer.text() };
}

/** A host's room opened, its password set if `pw`, its card sent if `card`. */
async function openRoom(options = {}, pw = null, card = CARD) {
  const code = newCode(), host = connect(code, `h${code}`, { host: true, ...options });
  await host.t('hi');
  if (pw) host.send({ t: 'lock', pw });
  if (card) host.send({ t: 'card', c: card });
  await sleep(pw ? 120 : 30);
  return { code, host };
}

test('a public room is listed with its card, for its own site alone', async () => {
  const { code, host } = await openRoom({ pub: true });
  const { rooms } = await list();
  const mine = rooms.find((r) => r.code === code);
  assert.ok(mine, 'the public room is listed');
  assert.deepEqual({ ...mine, since: 0 }, { code, ...CARD, players: 1, max: 4, locked: false, since: 0 });
  assert.ok((await list('https://www.last-stand.cc')).rooms.some((r) => r.code === code), 'www. is the same site');
  assert.ok(!(await list(PREVIEW)).rooms.some((r) => r.code === code), 'a preview never sees production\'s rooms');
  assert.ok(!(await list(ORIGIN, 'last-stand-coop-0')).rooms.some((r) => r.code === code), 'nor another app\'s');
  assert.equal((await list('https://evil.example')).status, 403, 'a page off the list reads nothing');
  host.ws.close();
});

test('a private room is never listed, nor one whose host sent no card', async () => {
  const priv = await openRoom({ pub: false });
  const bare = await openRoom({ pub: true }, null, null);
  const { rooms } = await list();
  assert.ok(!rooms.some((r) => r.code === priv.code), 'the private room is listed');
  assert.ok(!rooms.some((r) => r.code === bare.code), 'a room with no card is listed');
  priv.host.ws.close();
  bare.host.ws.close();
});

test('only the host says what its room is', async () => {
  const { code, host } = await openRoom({ pub: true });
  const guest = connect(code, 'g1');
  await guest.t('hi');
  guest.send({ t: 'card', c: { ...CARD, name: 'Not yours' } });
  await sleep(30);
  const mine = (await list()).rooms.find((r) => r.code === code);
  assert.equal(mine.name, CARD.name, 'a guest changed the card');
  assert.equal(mine.players, 2, 'the list counts the players in the room');
  guest.ws.close();
  host.ws.close();
});

test('a card is cleaned: no markup or control characters, each part held to its size', () => {
  const card = cardOf({ name: `  <b>x</b>‮${'y'.repeat(60)}`, tag: 'a\u0000b', cls: 'Mage!', map: 'crypt', wave: -3, v: 'x' });
  assert.equal([...card.name].length, 32);
  assert.ok(!card.name.includes('‮'));
  assert.equal(card.tag, 'ab');
  assert.equal(card.cls, '');
  assert.equal(card.wave, 0);
  assert.equal(siteOf('https://www.last-stand.cc'), 'https://last-stand.cc');
});

test('a password room asks for its password, lets the right one in and turns a wrong one away', async () => {
  const { code, host } = await openRoom({ pub: true, lock: true }, 'open sesame');
  const listed = (await list()).rooms.find((r) => r.code === code);
  assert.equal(listed.locked, true, 'the list says it is locked');
  const raw = JSON.stringify(await list());
  assert.ok(!raw.includes('open sesame') && !raw.includes('salt') && !raw.includes('key'), 'the list gives away the password');
  const wrong = connect(code, 'w1');
  await wrong.t('locked');
  wrong.send({ t: 'pass', pw: 'open sesam' });
  assert.equal((await wrong.t('denied')).why, 'password');
  assert.equal(await wrong.closed, 4003);
  const right = connect(code, 'r1');
  await right.t('locked');
  right.send({ t: 'pass', pw: 'open sesame' });
  const hi = await right.t('hi');
  assert.deepEqual(hi.peers, [`h${code}`]);
  assert.equal((await host.t('join')).p, 'r1', 'the host never heard the joiner come');
  right.ws.close();
  host.ws.close();
});

test('a joiner back within the grace needs no password again', async () => {
  const { code, host } = await openRoom({ lock: true }, 'pw');
  const first = connect(code, 'back1');
  await first.t('locked');
  first.send({ t: 'pass', pw: 'pw' });
  await first.t('hi');
  first.ws.terminate();
  await sleep(20);
  const again = connect(code, 'back1');
  assert.ok((await again.t('hi')).peers.includes(`h${code}`));
  again.ws.close();
  host.ws.close();
});

test('wrong passwords from one address are held to a few a minute', async () => {
  // (a relay of its own: the other checks' wrong passwords came from this address too)
  const shared = base;
  const own = await startRelay({ port: 0, origins: ORIGINS, grace: GRACE, log: quiet });
  base = `127.0.0.1:${own.address().port}`;
  const { code, host } = await openRoom({ lock: true }, 'right');
  const whys = [];
  for (let i = 0; i < 7; i++) {
    const guess = connect(code, `guess${i}`);
    const first = await guess.next((m) => m.t === 'locked' || m.t === 'denied');
    if (first.t === 'denied') { whys.push(first.why); continue; }
    guess.send({ t: 'pass', pw: `wrong${i}` });
    whys.push((await guess.t('denied')).why);
  }
  assert.deepEqual(whys, ['password', 'password', 'password', 'password', 'password', 'tries', 'tries']);
  host.ws.close();
  base = shared;
  await new Promise((resolve) => own.close(resolve));
});

test('a room holds as many as its host said, and no more', async () => {
  const { code, host } = await openRoom({ max: 2 });
  const second = connect(code, 's2');
  await second.t('hi');
  const third = connect(code, 's3');
  assert.equal((await third.t('denied')).why, 'full');
  second.ws.close();
  host.ws.close();
});

test('a host can\'t open a room another host holds', async () => {
  const { code, host } = await openRoom({ pub: true });
  const other = connect(code, 'other', { host: true, pub: true });
  assert.equal((await other.t('denied')).why, 'taken');
  host.ws.close();
});

test('a room drops off the list as its host goes', async () => {
  const { code, host } = await openRoom({ pub: true });
  const guest = connect(code, 'stay');
  await guest.t('hi');
  host.ws.close();
  await sleep(40);
  assert.ok(!(await list()).rooms.some((r) => r.code === code), 'a room with its host gone is listed');
  guest.ws.close();
});

test('a game of the relay before rooms still meets in a room by its code', async () => {
  const code = newCode();
  const a = connect(code, 'a'), b = connect(code, 'b');
  assert.equal((await a.t('hi')).v, 2);
  await b.t('hi');
  a.send({ ch: 'hello', d: { x: 1 } });
  assert.deepEqual(await b.next((m) => m.ch === 'hello'), { ch: 'hello', d: { x: 1 }, from: 'a' });
  a.ws.close();
  b.ws.close();
});

test('the canaries\' faults are caught: any password, private rooms listed', async () => {
  const faulty = await startRelay({ port: 0, origins: ORIGINS, grace: GRACE, log: quiet, faults: { anyPassword: true, listPrivate: true } });
  const at = `127.0.0.1:${faulty.address().port}`;
  const host = new WebSocket(`ws://${at}/room/${APP}/FAULT?id=h&host=1&lock=1`, { origin: ORIGIN });
  await new Promise((resolve) => host.on('message', resolve));
  host.send(JSON.stringify({ t: 'lock', pw: 'right' }));
  host.send(JSON.stringify({ t: 'card', c: CARD }));
  await sleep(120);
  const answer = await fetch(`http://${at}/rooms?app=${APP}`, { headers: { origin: ORIGIN } });
  assert.equal((await answer.json()).rooms.length, 1, 'the fault listed no private room');
  const guest = new WebSocket(`ws://${at}/room/${APP}/FAULT?id=g`, { origin: ORIGIN });
  const said = await new Promise((resolve) => {
    guest.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'locked') guest.send(JSON.stringify({ t: 'pass', pw: 'wrong' })); else resolve(m.t);
    });
  });
  assert.equal(said, 'hi', 'the fault turned a wrong password away');
  host.close();
  guest.close();
  await new Promise((resolve) => faulty.close(resolve));
});
