// The relay's rooms beyond their peers: who opened each (its host), whether it's listed for anyone to find (public)
// and the card it's listed with, its password, and how many it holds. The relay checks the password and builds the
// list itself; a game only ever says what its own room is, and only its host may.
//   ws(s)://host/room/<app>/<code>?id=<peer>&host=1[&pub=1][&lock=1][&max=2..4]   a host opens its room
//   host -> relay { t: 'lock', pw }    the password of a room opened with lock=1 (kept only as a salted scrypt hash)
//   relay -> game { t: 'locked' }       a locked room asks a joiner for its password, which answers { t: 'pass', pw }
//   relay -> game { t: 'denied', why }  'password', 'tries', 'wait' (the host hasn't set it yet), 'taken', 'full'
//   host -> relay { t: 'card', c }      a public room's card: its name, the host's tag and class, map, wave, lobby, v
//   GET /rooms?app=<app>                the public rooms of the asking page's own site and app, as cards
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** the most a password may be (characters) */
export const PASSWORD_MAX = 64;
/** a joiner's wrong passwords from one address a minute before it's turned away for the rest of it */
export const TRIES_PER_MINUTE = 5;
/** a card not sent again within this long is stale: its room drops off the list (ms; the game sends it every 20 s) */
export const CARD_TTL = 75_000;
/** the most rooms a listing holds */
export const LIST_MOST = 100;
/** listings one address may ask for a minute */
export const LISTS_PER_MINUTE = 120;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const HASH_BYTES = 32;

/** A page's site, as the list is kept apart by it: its origin, `www.` left off (a preview's rooms are its own). */
export const siteOf = (origin) => origin.replace(/^(https?:\/\/)www\./, '$1');

/** A password as the relay takes it: a non-empty string of at most `PASSWORD_MAX` characters, else null. */
export const passwordOf = (pw) => (typeof pw === 'string' && pw.length > 0 && [...pw].length <= PASSWORD_MAX ? pw : null);

/** A password's salted hash. */
export function hashPassword(pw, salt = randomBytes(16)) {
  return new Promise((resolve, reject) => {
    scrypt(pw.normalize('NFC'), salt, HASH_BYTES, SCRYPT, (error, key) => (error ? reject(error) : resolve({ salt, key })));
  });
}

/** Whether `pw` is the password `lock` was hashed from (compared in constant time). */
export async function passwordFits(lock, pw) {
  const { key } = await hashPassword(pw, lock.salt);
  return timingSafeEqual(key, lock.key);
}

const TEXT = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu;
/** A card's text: no control or format characters, its spaces one, at most `most` characters; '' if none. */
function textOf(value, most) {
  if (typeof value !== 'string') return '';
  return [...value.replace(TEXT, '').replace(/\s+/g, ' ').trim()].slice(0, most).join('');
}
const wordOf = (value, most) => (typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value) ? value.slice(0, most) : '');
const countOf = (value, most) => (Number.isInteger(value) && value >= 0 && value <= most ? value : 0);

/** A host's card as the relay keeps it: only what the list shows, each part checked and held to its size. */
export function cardOf(c) {
  if (!c || typeof c !== 'object') return null;
  return {
    name: textOf(c.name, 32), tag: textOf(c.tag, 16), cls: wordOf(c.cls, 16), map: wordOf(c.map, 16),
    wave: countOf(c.wave, 9999), run: c.run === true, lobby: c.lobby === 'panels' ? 'panels' : 'village',
    v: countOf(c.v, 1e6),
  };
}

/** The flags a host opens its room with, from its address: listed, locked, how many it holds (2 to `most`). */
export function openingOf(params, most) {
  const max = Number(params.get('max'));
  return {
    pub: params.get('pub') === '1',
    lock: params.get('lock') === '1',
    max: Number.isInteger(max) && max >= 2 && max <= most ? max : most,
  };
}

/** Counts an address's asks a minute (wrong passwords, listings); `spend` is false once it has spent its `most`. */
export class PerMinute {
  constructor(most) {
    this.most = most;
    this.counts = new Map();
  }

  spend(address, now = Date.now()) {
    let count = this.counts.get(address);
    if (!count || now - count.since >= 60_000) this.counts.set(address, (count = { since: now, n: 0 }));
    return ++count.n <= this.most;
  }

  /** Whether the address has spent its minute already (nothing spent). */
  spent(address, now = Date.now()) {
    const count = this.counts.get(address);
    return Boolean(count && now - count.since < 60_000 && count.n >= this.most);
  }

  prune(now = Date.now()) {
    for (const [address, count] of this.counts) if (now - count.since >= 60_000) this.counts.delete(address);
  }
}

/** The address a request came from: the last hop Traefik adds to `X-Forwarded-For`, else the socket's (an IPv6
 *  address counts by its /64, as one machine is often given a whole one). */
export function addressOf(req) {
  const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const address = hops.at(-1) ?? req.socket.remoteAddress ?? '';
  return address.includes(':') ? address.split(':').slice(0, 4).join(':') : address;
}

/**
 * The public rooms a page of `site` may see for `app`: listed, with a fresh card, its host there, as cards with the
 * room's code, how many are in it, how many it holds and whether it's locked. Fullest first, then newest.
 */
export function listRooms(rooms, site, app, now = Date.now(), faults = {}) {
  const list = [];
  for (const [key, room] of rooms) {
    const meta = room.meta;
    if (!meta || meta.site !== site || !key.startsWith(`${app}/`)) continue;
    // (the canary's fault lists a private room, which sends no card, under a blank one)
    const leaked = !meta.pub && faults.listPrivate;
    const card = leaked ? meta.card ?? cardOf({}) : meta.card;
    if (!(meta.pub || leaked) || !card || (!leaked && now - meta.cardAt > CARD_TTL)) continue;
    if (!room.peers.get(meta.owner)?.ws) continue;
    list.push({ code: key.slice(app.length + 1), ...card, players: room.peers.size, max: meta.max,
      locked: Boolean(meta.lock), since: meta.since });
  }
  list.sort((a, b) => (b.players - a.players) || (b.since - a.since));
  return list.slice(0, LIST_MOST);
}
