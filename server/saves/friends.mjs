// Friends and who of them is online (#676, part 2): each account has, on each site, a friend id (never its account's
// id), a friend code to give to whoever it chooses, its friends, and its requests in and out. Kept with the account
// (`account.social[site]`), so a PR preview's friends are its own and never touch production's. A friendship is
// both ways: each side lists the other, and one side listing alone (a crash between the two writes, a removal)
// counts as nothing. Who is online, and in which room, is held in memory: a page signed in says so every half
// minute, and only its friends read it. Invites are held in memory too, for 10 minutes.
//   GET    /saves/friends                  the view: the code, friends (online, their room, last seen), requests, invites
//   POST   /saves/friends/presence         { name, cls, room, hidden } -> the view: online, in that room (or none)
//   POST   /saves/friends/code             a new friend code -> the view (the old one stops working)
//   POST   /saves/friends/request          { code } -> the view: a request sent (both asked: friends at once)
//   POST   /saves/friends/accept           { id } -> the view: friends both ways
//   POST   /saves/friends/decline          { id } -> the view: the request gone on both sides
//   DELETE /saves/friends/<id>             a friend (or a request out) gone on both sides -> the view
//   POST   /saves/friends/invite           { id, room }: an invite to that friend, into this page's room
//   POST   /saves/friends/invite/dismiss   { id }: the invite from that friend gone -> the view
import { randomBytes } from 'node:crypto';
import * as store from './store.mjs';

/** friends an account may have on a site */
export const FRIENDS_MAX = 100;
/** requests waiting, in or out, on a site (the oldest incoming one is dropped past it) */
export const PENDING_MAX = 50;
/** a friend online is one whose page said so this recently (it says so every 30 s) */
export const ONLINE_MS = 75_000;
/** how long an invite waits to be seen */
export const INVITE_MS = 10 * 60_000;
/** the last time seen is written down at most this often (presence itself is in memory) */
const SEEN_EVERY = 10 * 60_000;
/** requests an account may send in an hour (a code is 40 bits: no guessing at this pace) */
const REQUESTS_PER_HOUR = 20;
/** presence an account may send at most this often */
const PRESENCE_EVERY_MS = 4_000;
/** a friend code's letters: Crockford's base32 (no I, L, O, U), 8 of them, shown as XXXX-XXXX */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** a name tag as the game allows it (src/net/nameTag.ts) */
const TAG = /^[\p{L}\p{N} ._'-]{1,16}$/u;
const ROOM_CODE = /^[A-Z0-9]{4,8}$/;
const KINDS = new Set(['public', 'private', 'password']);

/** `site\0pid` -> { at, name, cls, room, hidden }: who is online, as their pages last said */
const presence = new Map();
/** `site\0pid` of the one invited -> Map(from pid -> { room, at }) */
const invites = new Map();
/** `site\0pid` -> the times it sent a request in the last hour */
const requests = new Map();
/** `site\0pid` -> when it last sent its presence */
const lastPresence = new Map();

const key = (site, pid) => `${site}\0${pid}`;

/** Faults the lab's canary plants (`lab friends --canary`), never set otherwise: `oneWay`, a request counted as a
 *  friendship before it's accepted; `hiddenRooms`, a room its host keeps from friends shown to them. */
let faults = {};
/** Sets the canary's faults (`{}`: none). */
export function setFriendFaults(planted = {}) { faults = planted; }

/** Forgets everything held in memory (a start). */
export function resetFriends() {
  presence.clear();
  invites.clear();
  requests.clear();
  lastPresence.clear();
}

/** Drops what has run out: presence long gone, invites past their time, empty counts. */
export function pruneFriends(now = Date.now()) {
  for (const [at, entry] of presence) if (now - entry.at > ONLINE_MS * 4) presence.delete(at);
  for (const [at, from] of invites) {
    for (const [pid, invite] of from) if (now - invite.at > INVITE_MS) from.delete(pid);
    if (!from.size) invites.delete(at);
  }
  for (const [at, times] of requests) if (!times.some((t) => now - t < 3_600_000)) requests.delete(at);
  for (const [at, time] of lastPresence) if (now - time > ONLINE_MS * 4) lastPresence.delete(at);
}

function newCode() {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[bytes[i] & 31];
  return code;
}

/** A code no account on `site` has. */
function freeCode(site) {
  for (;;) {
    const code = newCode();
    if (!store.accountOfFriendCode(site, code)) return code;
  }
}

/** A code as typed (dashes, spaces, lower case, the letters people mistake for digits) as kept. */
export const cleanCode = (typed) => String(typed ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  .replace(/[IL]/g, '1').replace(/O/g, '0');

/** The account's friends on `site`, made if it has none yet (on a copy being changed). */
function socialOn(changed, site) {
  changed.social ??= {};
  changed.social[site] ??= {
    pid: store.newId(), code: freeCode(site), name: '', cls: '', seen: 0, friends: {}, incoming: {}, outgoing: {},
  };
  return changed.social[site];
}

/** Changes account `id` (a copy, written unless `edit` returns false), its changes in turn with every other. */
function edit(id, change) {
  return store.withAccount(id, async () => {
    const changed = structuredClone(store.account(id));
    if (!changed) return { gone: true };
    const result = await change(changed);
    if (result !== false) await store.keepAccount(changed);
    return result;
  });
}

/** The other side of a friend id on `site`: its account's friends there, or null. */
function other(site, pid) {
  return store.accountOfFriendId(site, pid)?.social?.[site] ?? null;
}

/** A room as a page may say it, or null: its code, name, map, wave, players, size, kind, and whether friends see it. */
export function roomOf(value) {
  if (!value || typeof value !== 'object') return null;
  const code = String(value.code ?? '');
  if (!ROOM_CODE.test(code)) return null;
  const count = (n, least, most) => Math.min(most, Math.max(least, Math.round(Number(n) || 0)));
  return {
    code,
    name: String(value.name ?? '').slice(0, 32),
    map: String(value.map ?? '').slice(0, 24),
    wave: count(value.wave, 0, 9999),
    players: count(value.players, 1, 4),
    size: count(value.size, 2, 4),
    kind: KINDS.has(value.kind) ? value.kind : 'private',
    friends: value.friends !== false,
  };
}

/** What a friend sees of `pid`'s presence: online or not, and its room if it lets friends see it. */
function seenOf(site, pid, kept, now) {
  const here = presence.get(key(site, pid));
  const online = Boolean(here && !here.hidden && now - here.at <= ONLINE_MS);
  const room = online && here.room ? here.room : null;
  return {
    online,
    room: room?.friends || (room && faults.hiddenRooms) ? { ...room, locked: room.kind === 'password' } : null,
    busy: Boolean(room && !room.friends && !faults.hiddenRooms),
    seen: online ? now : kept.seen,
  };
}

/** What the page shows: its code, friends (each with its presence), requests both ways and invites to it. Only
 *  what both sides agree to counts. */
export function viewOf(social, site, now = Date.now()) {
  const card = (pid, kept) => ({ id: pid, name: kept.name || 'Friend', cls: kept.cls });
  const friends = [];
  const counted = faults.oneWay ? { ...social.outgoing, ...social.friends } : social.friends;
  for (const [pid, since] of Object.entries(counted)) {
    const kept = other(site, pid);
    if (!kept?.friends[social.pid] && !faults.oneWay) continue;
    friends.push({ ...card(pid, kept), since, ...seenOf(site, pid, kept, now) });
  }
  friends.sort((a, b) => Number(b.online) - Number(a.online) || b.seen - a.seen || a.name.localeCompare(b.name));
  const incoming = [];
  for (const [pid, when] of Object.entries(social.incoming)) {
    const kept = other(site, pid);
    if (kept?.outgoing[social.pid]) incoming.push({ ...card(pid, kept), when });
  }
  const outgoing = [];
  for (const [pid, when] of Object.entries(social.outgoing)) {
    const kept = other(site, pid);
    if (kept) outgoing.push({ ...card(pid, kept), when });
  }
  const invited = [];
  for (const [pid, invite] of invites.get(key(site, social.pid)) ?? []) {
    const kept = other(site, pid);
    if (!kept?.friends[social.pid] || !social.friends[pid] || now - invite.at > INVITE_MS) continue;
    invited.push({ ...card(pid, kept), room: invite.room, when: invite.at });
  }
  return { id: social.pid, code: social.code, name: social.name, friends, incoming, outgoing, invites: invited };
}

/** An answer: `{ status, body }`. */
const told = (status, body) => ({ status, body });

/** The view of the signed-in account on `site`, its friends made first if it has none. */
async function view(accountId, site) {
  const result = await edit(accountId, (changed) => {
    const had = Boolean(changed.social?.[site]);
    socialOn(changed, site);
    return had ? false : true;
  });
  if (result?.gone) return told(401, 'signed out');
  return told(200, viewOf(store.account(accountId).social[site], site));
}

/** Presence from the page: online (or hidden), in that room or none; its name tag and class kept for its friends. */
async function sayPresence(accountId, site, body, now = Date.now()) {
  const name = String(body?.name ?? '').normalize('NFC').trim();
  const cls = /^[a-z]{1,16}$/.test(String(body?.cls ?? '')) ? body.cls : '';
  if (name && !TAG.test(name)) return told(400, 'not a name tag');
  const before = store.account(accountId)?.social?.[site];
  const hidden = body?.hidden === true;
  // (where it is is always taken, in memory: a room changed just after the last word must reach its friends at once;
  // what's written down, its name and class, at most every PRESENCE_EVERY_MS)
  if (before && now - (lastPresence.get(key(site, before.pid)) ?? 0) < PRESENCE_EVERY_MS) {
    presence.set(key(site, before.pid), { at: now, room: roomOf(body?.room), hidden });
    return told(200, viewOf(before, site, now));
  }
  const result = await edit(accountId, (changed) => {
    const social = socialOn(changed, site);
    const fresh = !before;
    const renamed = (name && name !== social.name) || (cls && cls !== social.cls);
    const stale = !hidden && now - social.seen > SEEN_EVERY;
    if (name) social.name = name;
    if (cls) social.cls = cls;
    if (!hidden) social.seen = stale ? now : social.seen;
    return fresh || renamed || stale ? true : false;
  });
  if (result?.gone) return told(401, 'signed out');
  const social = store.account(accountId).social[site];
  presence.set(key(site, social.pid), { at: now, room: roomOf(body?.room), hidden });
  lastPresence.set(key(site, social.pid), now);
  return told(200, viewOf(social, site, now));
}

/** A request to the account whose code is `typed`; friends at once if it had asked this one already. */
async function request(accountId, site, typed, now = Date.now()) {
  const code = cleanCode(typed);
  const target = code.length === 8 ? store.accountOfFriendCode(site, code) : null;
  const mine = await view(accountId, site);
  if (mine.status !== 200) return mine;
  const me = store.account(accountId).social[site];
  const times = (requests.get(key(site, me.pid)) ?? []).filter((t) => now - t < 3_600_000);
  if (times.length >= REQUESTS_PER_HOUR) return told(429, 'Too many requests this hour: try again later.');
  times.push(now);
  requests.set(key(site, me.pid), times);
  if (!target) return told(404, 'No player has that friend code.');
  if (target.id === accountId) return told(400, 'That is your own friend code.');
  const them = target.social[site];
  if (me.friends[them.pid] && them.friends[me.pid]) return told(409, 'You are friends already.');
  if (them.outgoing[me.pid]) return accept(accountId, site, them.pid, now);
  if (Object.keys(me.friends).length >= FRIENDS_MAX) return told(409, `${FRIENDS_MAX} friends at most.`);
  if (Object.keys(me.outgoing).length >= PENDING_MAX) return told(409, 'Too many requests waiting: cancel one.');
  await edit(accountId, (changed) => { socialOn(changed, site).outgoing[them.pid] = now; });
  await edit(target.id, (changed) => {
    const social = socialOn(changed, site);
    social.incoming[me.pid] = now;
    const waiting = Object.entries(social.incoming).sort((a, b) => a[1] - b[1]);
    while (waiting.length > PENDING_MAX) delete social.incoming[waiting.shift()[0]];
  });
  return view(accountId, site);
}

/** Friends both ways with `pid`, which asked this account. */
async function accept(accountId, site, pid, now = Date.now()) {
  const me = store.account(accountId)?.social?.[site];
  const them = other(site, pid);
  const themId = store.accountOfFriendId(site, pid)?.id;
  if (!me || !them || !them.outgoing[me.pid]) return told(404, 'No such request.');
  if (Object.keys(me.friends).length >= FRIENDS_MAX) return told(409, `${FRIENDS_MAX} friends at most.`);
  await edit(accountId, (changed) => {
    const social = socialOn(changed, site);
    social.friends[pid] = now;
    delete social.incoming[pid];
    delete social.outgoing[pid];
  });
  await edit(themId, (changed) => {
    const social = socialOn(changed, site);
    social.friends[me.pid] = now;
    delete social.outgoing[me.pid];
    delete social.incoming[me.pid];
  });
  return view(accountId, site);
}

/** `pid` dropped on both sides: as a friend, a request in or out, and the invites between them. */
async function part(accountId, site, pid) {
  const me = store.account(accountId)?.social?.[site];
  if (!me) return view(accountId, site);
  await edit(accountId, (changed) => {
    const social = socialOn(changed, site);
    delete social.friends[pid];
    delete social.incoming[pid];
    delete social.outgoing[pid];
  });
  const themId = store.accountOfFriendId(site, pid)?.id;
  if (themId) {
    await edit(themId, (changed) => {
      const social = changed.social?.[site];
      if (!social) return false;
      delete social.friends[me.pid];
      delete social.incoming[me.pid];
      delete social.outgoing[me.pid];
    });
  }
  invites.get(key(site, me.pid))?.delete(pid);
  invites.get(key(site, pid))?.delete(me.pid);
  return view(accountId, site);
}

/** An invite to friend `pid`, into the room this account's page says it is in. */
async function invite(accountId, site, pid, room, now = Date.now()) {
  const me = store.account(accountId)?.social?.[site];
  const them = other(site, pid);
  if (!me || !them || !me.friends[pid] || !them.friends[me.pid]) return told(404, 'Not a friend of yours.');
  const into = roomOf(room);
  if (!into) return told(400, 'Not a room.');
  const at = key(site, pid);
  if (!invites.has(at)) invites.set(at, new Map());
  invites.get(at).set(me.pid, { room: { ...into, locked: into.kind === 'password' }, at: now });
  return told(204, '');
}

/** Answers a request under /saves/friends from a signed-in page, or null if it isn't one of these routes. */
export async function friendsRequest(method, path, accountId, site, body) {
  const now = Date.now();
  if (path === '/saves/friends' && method === 'GET') return view(accountId, site);
  if (path === '/saves/friends/presence' && method === 'POST') return sayPresence(accountId, site, await body(), now);
  if (path === '/saves/friends/code' && method === 'POST') {
    const result = await edit(accountId, (changed) => { socialOn(changed, site).code = freeCode(site); });
    if (result?.gone) return told(401, 'signed out');
    return view(accountId, site);
  }
  if (path === '/saves/friends/request' && method === 'POST') return request(accountId, site, (await body())?.code, now);
  if (path === '/saves/friends/accept' && method === 'POST') {
    await view(accountId, site);
    return accept(accountId, site, String((await body())?.id ?? ''), now);
  }
  if (path === '/saves/friends/decline' && method === 'POST') return part(accountId, site, String((await body())?.id ?? ''));
  if (path === '/saves/friends/invite' && method === 'POST') {
    const sent = await body();
    return invite(accountId, site, String(sent?.id ?? ''), sent?.room, now);
  }
  if (path === '/saves/friends/invite/dismiss' && method === 'POST') {
    const me = store.account(accountId)?.social?.[site];
    if (me) invites.get(key(site, me.pid))?.delete(String((await body())?.id ?? ''));
    return view(accountId, site);
  }
  if (path.startsWith('/saves/friends/') && method === 'DELETE') {
    return part(accountId, site, decodeURIComponent(path.slice('/saves/friends/'.length)));
  }
  return null;
}
