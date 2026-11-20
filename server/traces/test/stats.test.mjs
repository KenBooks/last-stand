// The player stats (stats.mjs): what a heartbeat may hold, how beats add up to players, minutes, sessions and who
// is online, live apart from test builds, what's kept across a start and for how long, and the limits on what one
// address can add. The sums on a clock of the test's own; the routes through the service on a port of its own.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkBeat, dayOf, statsLimits, statsService } from '../stats.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const DATA = join(ROOT, '.tmp', `stats-test-${process.pid}`);
const LIVE = 'https://last-stand.cc';
const PREVIEW = 'https://pr-1.ls.wellscoped.dev';
const TOKEN = 'test-token';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** noon UTC on a day, so a few hours either way stay on it */
const NOON = Date.parse('2026-11-20T12:00:00Z');
const quiet = () => {};
let server, base;

/** An id as the game makes one: 16 random bytes, base64url. */
const idOf = (n) => Buffer.from(String(n).padStart(16, '0')).toString('base64url');
const beatOf = (n, extra = {}) => ({ id: idOf(n), where: 'lobby', coop: false, start: false, first: false, ...extra });

/** A stats service in a folder of its own, on a clock the test moves. */
function service(folder, clock, overrides = {}) {
  const settings = { data: folder, trusted: new Set(['10.0.0.77']), stats: { ...statsLimits({}), ...overrides } };
  return statsService(settings, { log: quiet, clock: () => clock.now });
}

let folders = 0;
const freshFolder = () => {
  const folder = join(DATA, `unit-${folders++}`);
  mkdirSync(folder, { recursive: true });
  return folder;
};

before(async () => {
  mkdirSync(DATA, { recursive: true });
  const { start } = await import('../traces.mjs');
  server = await start(0, {
    DATA: join(DATA, 'service'), TRACES_TOKEN: TOKEN, ORIGINS: `${LIVE},https://pr-*.ls.wellscoped.dev`,
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  // (the folder this test made, and nothing else)
  rmSync(DATA, { recursive: true, force: true });
});

test('a heartbeat holds an id, a place and three flags, and nothing else', () => {
  assert.deepEqual(checkBeat(beatOf(1, { coop: true })).beat, beatOf(1, { coop: true }));
  assert.equal(checkBeat({ id: idOf(1), where: 'fight' }).beat.start, false, 'a flag left out is false');
  assert.match(checkBeat({ ...beatOf(1), name: 'Ann' }).error, /no field name/, 'nothing can ride along');
  assert.match(checkBeat({ ...beatOf(1), id: 'short' }).error, /no id/);
  assert.match(checkBeat({ ...beatOf(1), where: 'shop' }).error, /no such place/);
  assert.match(checkBeat({ ...beatOf(1), coop: 'yes' }).error, /coop/);
  assert.match(checkBeat([beatOf(1)]).error, /not an object/);
});

test('beats add up to players, minutes once a minute, sessions, new players and who is online', async () => {
  const clock = { now: NOON };
  const stats = service(freshFolder(), clock);
  await stats.load();
  // one player for three minutes, from the start of a page's session, in a fight for the last one, in co-op
  stats.take(beatOf(1, { start: true, first: true }), LIVE, '10.0.0.1');
  clock.now += 20_000;
  stats.take(beatOf(1), LIVE, '10.0.0.1');
  clock.now += 40_000;
  stats.take(beatOf(1), LIVE, '10.0.0.1');
  clock.now += MINUTE;
  stats.take(beatOf(1, { where: 'fight', coop: true }), LIVE, '10.0.0.1');
  // a second player once, and a test build's player
  stats.take(beatOf(2, { start: true }), LIVE, '10.0.0.2');
  stats.take(beatOf(3, { start: true }), PREVIEW, '10.0.0.3');
  const read = stats.read(1);
  const today = read.days[0];
  assert.equal(today.day, dayOf(NOON));
  assert.equal(today.live.players, 2);
  assert.equal(today.live.minutes, 4, 'a beat 20 s after the last adds no minute');
  assert.deepEqual([today.live.fight, today.live.coop], [1, 1]);
  assert.deepEqual([today.live.sessions, today.live.newPlayers], [2, 1]);
  assert.equal(today.test.players, 1, 'a test build counts apart');
  assert.equal(today.live.ids, undefined, 'no id is read back');
  assert.deepEqual(read.online, { live: 2, test: 1 });
  const slot = Math.floor((clock.now % DAY) / (5 * MINUTE));
  assert.equal(today.live.online[slot], 2, 'two online in the slot');
  assert.equal(read.slotMinutes, 5);
  clock.now += 3 * MINUTE;
  assert.deepEqual(stats.read(1).online, { live: 0, test: 0 }, 'no beat for 2 minutes: not online');
});

test('active players by day, week and month count each player once', async () => {
  const clock = { now: NOON - 40 * DAY };
  const stats = service(freshFolder(), clock);
  await stats.load();
  // player 1 every day for 40 days, player 2 ten days ago, player 3 forty days ago only
  stats.take(beatOf(3), LIVE, '10.0.0.3');
  for (let day = 40; day >= 0; day--) {
    clock.now = NOON - day * DAY;
    stats.take(beatOf(1), LIVE, '10.0.0.1');
    if (day === 10) stats.take(beatOf(2), LIVE, '10.0.0.2');
  }
  assert.deepEqual(stats.read(1).active.live, { day: 1, week: 1, month: 2 });
  const read = stats.read(41);
  assert.equal(read.days.length, 41);
  assert.equal(read.days[0].live.players, 2, 'forty days ago: players 1 and 3');
});

test('keeps the sums across a start, the ids only 35 days, the days 400', async () => {
  const folder = freshFolder();
  const clock = { now: NOON - 36 * DAY };
  let stats = service(folder, clock);
  await stats.load();
  stats.take(beatOf(1, { start: true }), LIVE, '10.0.0.1');
  clock.now = NOON;
  stats.take(beatOf(1), LIVE, '10.0.0.1');
  await stats.save();
  const salt = readFileSync(join(folder, 'stats', 'salt'), 'utf8');
  const todays = readFileSync(join(folder, 'stats', `${dayOf(NOON)}.json`), 'utf8');
  assert.ok(!todays.includes(idOf(1)), 'the id is kept hashed, never as sent');
  stats = service(folder, clock);
  await stats.load();
  assert.equal(readFileSync(join(folder, 'stats', 'salt'), 'utf8'), salt, 'the salt is made once');
  const read = stats.read(37);
  assert.deepEqual([read.days[0].live.sessions, read.days[0].live.minutes], [1, 1], 'the old day\'s sums stay');
  assert.equal(read.days[0].live.players, 0, 'its ids are gone past 35 days');
  assert.equal(read.days[36].live.players, 1);
  clock.now = NOON + 365 * DAY;
  await stats.prune();
  const left = readdirSync(join(folder, 'stats')).filter((name) => name.endsWith('.json'));
  assert.deepEqual(left, [`${dayOf(NOON)}.json`], 'a day past 400 is deleted');
});

test('one address adds at most its new ids a day, and its beats a minute; a trusted one is held to neither', async () => {
  const clock = { now: NOON };
  const stats = service(freshFolder(), clock, { idsPerAddress: 3, beatsPerMinute: 5 });
  await stats.load();
  const counted = [1, 2, 3, 4].map((n) => stats.take(beatOf(n), LIVE, '10.0.0.9'));
  assert.deepEqual(counted, [true, true, true, false], 'a fourth new id from one address is one too many');
  assert.equal(stats.take(beatOf(1), LIVE, '10.0.0.9'), true, 'an id it already has still counts');
  const allowed = Array.from({ length: 6 }, () => stats.allowed('10.0.0.8').ok);
  assert.deepEqual(allowed, [true, true, true, true, true, false]);
  clock.now += MINUTE;
  assert.equal(stats.allowed('10.0.0.8').ok, true, 'a minute later, room again');
  assert.ok(Array.from({ length: 10 }, () => stats.allowed('10.0.0.77').ok).every(Boolean));
  assert.ok([5, 6, 7, 8].every((n) => stats.take(beatOf(n), LIVE, '10.0.0.77')));
});

/** Posts a beat as the game does: a plain request (a string body), from `origin`. */
const send = (body, origin = LIVE) =>
  fetch(`${base}/traces/beat`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { origin } });

test('takes a beat from the game\'s pages alone, and reads the sums with the token', async () => {
  const r = await send(beatOf(42, { start: true, first: true }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), LIVE);
  assert.equal((await send(beatOf(43), 'https://elsewhere.example')).status, 403);
  assert.equal((await send('not json')).status, 400);
  assert.equal((await send({ ...beatOf(44), name: 'Ann' })).status, 400);
  assert.equal((await send('x'.repeat(600))).status, 413);
  assert.equal((await fetch(`${base}/traces/stats`)).status, 401, 'reading needs the token');
  const read = await fetch(`${base}/traces/stats?days=7`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const sums = await read.json();
  assert.equal(sums.days.length, 7);
  assert.deepEqual([sums.days[6].live.players, sums.days[6].live.newPlayers], [1, 1]);
  assert.equal(sums.online.live, 1);
  const tooMany = await fetch(`${base}/traces/stats?days=99999`, { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal((await tooMany.json()).days.length, 400, 'at most the days kept');
});
