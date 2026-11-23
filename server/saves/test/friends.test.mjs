// Friends (friends.mjs) on a saves service of the test's own: codes, requests accepted both ways, who is online and in
// which room (to friends alone), invites, removing, each site's friends apart, a restart, and a deleted account.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { authenticator } from './authenticator.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const DATA = join(ROOT, '.tmp', `friends-test-${process.pid}`);
const PRODUCTION = 'https://last-stand.cc';
const PREVIEW = 'https://pr-5.ls.wellscoped.dev';
const SETTINGS = {
  DATA, ORIGINS: `${PRODUCTION},https://pr-*.ls.wellscoped.dev`, ACCOUNTS_PER_DAY: '100', GITHUB_REPO: '',
};
const ROOM = { code: 'K7QM', name: 'Brannoch\'s room', map: 'The Crypt', wave: 12, players: 2, size: 4, kind: 'private' };
let saves, server, base;

async function boot() {
  server = await saves.start(0, SETTINGS);
  base = `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  mkdirSync(DATA, { recursive: true });
  saves = await import('../saves.mjs');
  await boot();
});

after(() => {
  server?.close();
  // (the folder this test made, and nothing else)
  rmSync(DATA, { recursive: true, force: true });
});

/** A request from the page at `origin`, signed in with `token` if given. */
async function call(method, path, { origin = PRODUCTION, token, json } = {}) {
  const headers = { origin };
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) headers['content-type'] = 'application/json';
  const answer = await fetch(`${base}${path}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
  const type = answer.headers.get('content-type') ?? '';
  return { status: answer.status, body: type.includes('json') ? await answer.json() : await answer.text() };
}

/** A new account on the page at `origin`: its session's token. */
async function signUp(device = authenticator(), origin = PRODUCTION) {
  const options = await call('POST', '/saves/passkey/options', { origin, json: { purpose: 'register' } });
  const made = await call('POST', '/saves/passkey/verify', { origin,
    json: { purpose: 'register', response: device.create(options.body, origin) } });
  assert.equal(made.status, 201, made.body);
  return made.body.token;
}

/** A player: signed up, its presence said once with `name` (and in `room` if given), and its view. */
async function player(name, room = null, origin = PRODUCTION) {
  const token = await signUp(authenticator(), origin);
  const said = await call('POST', '/saves/friends/presence', { origin, token, json: { name, cls: 'mage', room } });
  assert.equal(said.status, 200, said.body);
  return { token, view: said.body, origin };
}

const friendsOf = async (p) => (await call('GET', '/saves/friends', { origin: p.origin, token: p.token })).body;
const ask = (p, code) => call('POST', '/saves/friends/request', { origin: p.origin, token: p.token, json: { code } });
const accept = (p, id) => call('POST', '/saves/friends/accept', { origin: p.origin, token: p.token, json: { id } });

/** Two players made friends: `a` asks by code, `b` accepts. */
async function befriend(a, b) {
  assert.equal((await ask(a, b.view.code)).status, 200);
  const accepted = await accept(b, a.view.id);
  assert.equal(accepted.status, 200, accepted.body);
}

test('the health says friends are on', async () => {
  const health = await call('GET', '/saves/health');
  assert.equal(health.body.friends, true);
});

test('a friend code is asked by, typed any way, and accepted: friends on both sides', async () => {
  const ysolde = await player('Ysolde');
  const kenneth = await player('Kenneth');
  assert.match(kenneth.view.code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  const typed = `${kenneth.view.code.slice(0, 4).toLowerCase()}-${kenneth.view.code.slice(4)}`;
  const asked = await ask(ysolde, typed);
  assert.equal(asked.status, 200, asked.body);
  assert.deepEqual(asked.body.outgoing.map((f) => f.name), ['Kenneth']);
  const waiting = await friendsOf(kenneth);
  assert.deepEqual(waiting.incoming.map((f) => [f.name, f.cls]), [['Ysolde', 'mage']]);
  assert.equal(waiting.friends.length, 0, 'a request is no friendship');
  const accepted = await accept(kenneth, ysolde.view.id);
  assert.deepEqual(accepted.body.friends.map((f) => f.name), ['Ysolde']);
  assert.equal(accepted.body.incoming.length, 0);
  const hers = await friendsOf(ysolde);
  assert.deepEqual(hers.friends.map((f) => f.name), ['Kenneth']);
  assert.equal(hers.outgoing.length, 0);
  assert.equal((await ask(ysolde, kenneth.view.code)).status, 409, 'friends already');
  assert.equal((await accept(kenneth, ysolde.view.id)).status, 404, 'no request left to accept');
});

test('two asking each other are friends at once; nobody accepts a request never made', async () => {
  const a = await player('Pell');
  const b = await player('Gideon');
  const stranger = await player('Stranger');
  assert.equal((await ask(a, b.view.code)).status, 200);
  const both = await ask(b, a.view.code);
  assert.equal(both.status, 200);
  assert.deepEqual(both.body.friends.map((f) => f.name), ['Pell']);
  assert.equal((await accept(stranger, a.view.id)).status, 404);
  assert.equal((await friendsOf(stranger)).friends.length, 0);
});

test('an unknown code, one\'s own code, and too many requests in an hour are refused', async () => {
  const a = await player('Asker');
  assert.equal((await ask(a, 'ZZZZ-ZZZZ')).status, 404);
  assert.equal((await ask(a, a.view.code)).status, 400);
  let status = 0;
  for (let i = 0; i < 25 && status !== 429; i++) status = (await ask(a, `0000${String(i).padStart(4, '0')}`)).status;
  assert.equal(status, 429, 'requests are limited an hour');
});

test('who is online and in which room: friends see it, strangers don\'t; hidden rooms and appearing offline', async () => {
  const host = await player('Brannoch', ROOM);
  const friend = await player('Pell');
  const stranger = await player('Stranger');
  await befriend(friend, host);
  const seen = (await friendsOf(friend)).friends.find((f) => f.name === 'Brannoch');
  assert.equal(seen.online, true);
  assert.deepEqual(seen.room, { ...ROOM, friends: true, locked: false });
  assert.equal(JSON.stringify(await friendsOf(stranger)).includes('K7QM'), false, 'a stranger sees no room');
  const closed = await call('POST', '/saves/friends/presence',
    { token: host.token, json: { name: 'Brannoch', room: { ...ROOM, friends: false } } });
  assert.equal(closed.status, 200);
  const busy = (await friendsOf(friend)).friends[0];
  assert.equal(busy.online, true);
  assert.equal(busy.room, null, 'a room friends may not join isn\'t shown');
  assert.equal(busy.busy, true);
  await call('POST', '/saves/friends/presence', { token: host.token, json: { name: 'Brannoch', room: ROOM, hidden: true } });
  const hidden = (await friendsOf(friend)).friends[0];
  assert.equal(hidden.online, false, 'appearing offline');
  assert.equal(hidden.room, null);
  assert.equal((await call('POST', '/saves/friends/presence', { token: host.token, json: { name: '<b>x</b>' } })).status, 400);
});

test('an invite reaches a friend, into the room it names, and is dismissed; never from a stranger', async () => {
  const host = await player('Host', ROOM);
  const guest = await player('Guest');
  const stranger = await player('Stranger');
  await befriend(host, guest);
  const sent = await call('POST', '/saves/friends/invite', { token: host.token, json: { id: guest.view.id, room: ROOM } });
  assert.equal(sent.status, 204, sent.body);
  const arrived = (await friendsOf(guest)).invites;
  assert.deepEqual(arrived.map((i) => [i.name, i.room.code]), [['Host', 'K7QM']]);
  const refused = await call('POST', '/saves/friends/invite', { token: stranger.token, json: { id: guest.view.id, room: ROOM } });
  assert.equal(refused.status, 404);
  assert.equal((await call('POST', '/saves/friends/invite', { token: host.token, json: { id: guest.view.id, room: { code: '!' } } })).status, 400);
  const dismissed = await call('POST', '/saves/friends/invite/dismiss', { token: guest.token, json: { id: host.view.id } });
  assert.equal(dismissed.body.invites.length, 0);
});

test('declining, removing a friend and a new code: gone on both sides at once', async () => {
  const a = await player('Ada');
  const b = await player('Bo');
  await ask(a, b.view.code);
  const declined = await call('POST', '/saves/friends/decline', { token: b.token, json: { id: a.view.id } });
  assert.equal(declined.body.incoming.length, 0);
  assert.equal((await friendsOf(a)).outgoing.length, 0, 'the asker\'s request goes too');
  await befriend(a, b);
  await call('POST', '/saves/friends/invite', { token: a.token, json: { id: b.view.id, room: ROOM } });
  const removed = await call('DELETE', `/saves/friends/${encodeURIComponent(b.view.id)}`, { token: a.token });
  assert.equal(removed.body.friends.length, 0);
  const left = await friendsOf(b);
  assert.equal(left.friends.length, 0, 'removed on the other side too');
  assert.equal(left.invites.length, 0, 'and its invites');
  const renewed = await call('POST', '/saves/friends/code', { token: b.token });
  assert.notEqual(renewed.body.code, b.view.code);
  assert.equal((await ask(a, b.view.code)).status, 404, 'the old code works no more');
  assert.equal((await ask(a, renewed.body.code)).status, 200);
});

test('each site\'s friends are its own: a preview\'s never reach production\'s', async () => {
  const a = await player('Prod A');
  const b = await player('Prod B');
  await befriend(a, b);
  const link = await call('POST', '/saves/link-code', { token: a.token });
  const there = await call('POST', '/saves/link', { origin: PREVIEW, json: { code: link.body.code } });
  assert.equal(there.status, 200);
  const preview = await call('GET', '/saves/friends', { origin: PREVIEW, token: there.body.token });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.friends.length, 0, 'production\'s friends aren\'t a preview\'s');
  assert.notEqual(preview.body.code, a.view.code);
  const cross = await call('POST', '/saves/friends/request', { origin: PREVIEW, token: there.body.token, json: { code: b.view.code } });
  assert.equal(cross.status, 404, 'production\'s code means nothing on a preview');
});

test('a restart keeps friends and requests; a deleted account drops out of its friends\' lists', async () => {
  const a = await player('Keeps');
  const b = await player('Kept');
  const c = await player('Asks');
  await befriend(a, b);
  await ask(c, a.view.code);
  server.close();
  await boot();
  const after = await friendsOf(a);
  assert.deepEqual(after.friends.map((f) => f.name), ['Kept']);
  assert.equal(after.friends[0].online, false, 'presence is held in memory');
  assert.deepEqual(after.incoming.map((f) => f.name), ['Asks']);
  assert.equal((await call('DELETE', '/saves/account', { token: b.token })).status, 204);
  assert.equal((await friendsOf(a)).friends.length, 0);
});
