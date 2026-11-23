// Player stats (server/traces/AGENTS.md, Player stats): every game that plays sends a heartbeat here once a minute
// while its tab shows (src/stats), unless its player turned it off, and the dashboard's Players section reads the
// sums: players online over time, daily, weekly and monthly active players, playtime, sessions, new players. Beside
// the traces and the bug reports: the same host, route, process and volume, so no new deploy.
//   POST /traces/beat           a heartbeat as JSON, from the game's own pages               -> 204
//   GET  /traces/stats?days=    the sums of the last `days` days (1 to STATS_KEEP_DAYS), live and test apart (read)
// What a heartbeat holds: a random id the game made for this browser (never an account, a name or an address), where
// the player is (the lobby or a fight), whether in co-op, and whether it starts a page's session or is the browser's
// first ever. A player signed in to cloud saves sends instead the play id the saves service derives from the account
// (server/saves, GET /saves/play-id: an HMAC of its own key, never the account) and the browser's id as `was`: the
// browser's days fold into the account's (`fold`), so one account on a phone and a PC is one player. The id is kept only as a salted hash (the salt made once, on the volume, never sent), and only for
// STATS_ID_DAYS (35: a month's active players need 30), then just the day's sums. No address is written down: the
// limits count in memory alone. Production (last-stand.cc) is counted as `live`, every PR preview, commit build and
// dev server as `test`, apart, so testing never reads as players.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Limiter } from './reports.mjs';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** the online count's slots: one every 5 minutes, 288 a day */
const SLOT = 5 * MINUTE;
const SLOTS = DAY / SLOT;
/** a beat this soon after the same id's last adds no minute (the game beats once a minute) */
const SAME_MINUTE = 50_000;
/** an id beaten within this long counts as online now */
const ONLINE_NOW = 2 * MINUTE;
/** the most a heartbeat's JSON may be */
export const BEAT_MAX_BYTES = 512;
/** a heartbeat's id: 16 random bytes, base64url */
const ID = /^[A-Za-z0-9_-]{22}$/;
const WHERE = new Set(['lobby', 'fight']);
const FIELDS = new Set(['id', 'was', 'where', 'coop', 'start', 'first']);
/** the sites counted as production's; every other allowed page is a test build */
const LIVE = new Set(['https://last-stand.cc', 'https://www.last-stand.cc']);

/** The stats' limits, from the service's settings (settingsFrom in traces.mjs). */
export function statsLimits(vars) {
  return {
    /** days the sums are kept, and the hashed ids */
    keepDays: Number(vars.STATS_KEEP_DAYS ?? 400),
    idDays: Number(vars.STATS_ID_DAYS ?? 35),
    /** beats from one address in any minute (a household or a LAN party plays from one) */
    beatsPerMinute: Number(vars.STATS_BEATS_PER_MINUTE ?? 60),
    /** new ids from one address in a day: a script making up ids can't inflate the players past it */
    idsPerAddress: Number(vars.STATS_IDS_PER_ADDRESS ?? 20),
    /** ids in a day over every address, which bounds the memory a day's sets take */
    idsPerDay: Number(vars.STATS_IDS_PER_DAY ?? 200_000),
  };
}

/** The UTC day of `ms`, as `2026-11-20`. */
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** A day's sums for one kind of site, as kept and as read. */
function emptySums() {
  return { minutes: 0, fight: 0, coop: 0, sessions: 0, newPlayers: 0, online: new Array(SLOTS).fill(0), ids: new Set() };
}

/** A heartbeat's JSON checked: the beat, or why it was refused. */
export function checkBeat(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { error: 'not an object' };
  for (const key of Object.keys(json)) if (!FIELDS.has(key)) return { error: `no field ${key}` };
  if (typeof json.id !== 'string' || !ID.test(json.id)) return { error: 'no id' };
  if (json.was !== undefined && (typeof json.was !== 'string' || !ID.test(json.was) || json.was === json.id)) {
    return { error: 'no browser id' };
  }
  if (!WHERE.has(json.where)) return { error: 'no such place' };
  for (const flag of ['coop', 'start', 'first']) {
    if (json[flag] !== undefined && typeof json[flag] !== 'boolean') return { error: `${flag} is not true or false` };
  }
  const beat = { id: json.id, where: json.where, coop: !!json.coop, start: !!json.start, first: !!json.first };
  if (json.was) beat.was = json.was;
  return { beat };
}

/**
 * The stats' part of the service: `load` at a start, `allowed` and `take` for each beat, `read` for the dashboard,
 * `save` (each minute and at a close) and `prune` (hourly). `clock` is the time in ms (a test's own).
 */
export function statsService(settings, { log, clock = Date.now }) {
  const limits = settings.stats;
  const folder = join(settings.data, 'stats');
  /** day -> { live, test } sums */
  const days = new Map();
  /** a day's that changed since the last save */
  const dirty = new Set();
  /** hashed id -> its last beat (ms), the last that added a minute, and whether from a test build: who is online
   *  now, and each minute counted once */
  const last = new Map();
  /** the slot being filled, and the hashed ids online in it, live and test */
  let slot = { key: '', live: new Set(), test: new Set() };
  /** `address day` -> the new ids it sent that day */
  const idsFrom = new Map();
  /** hashed id -> the day it came as a new player (`first`), in memory alone: a browser new today folded into an
   *  account seen before takes its new player back */
  const newIds = new Map();
  const beats = new Limiter([[MINUTE, limits.beatsPerMinute]]);
  let salt = '';

  const hash = (id) => createHash('sha256').update(salt).update(id).digest('base64url').slice(0, 16);
  const fileOf = (day) => join(folder, `${day}.json`);

  function dayFor(day) {
    if (!days.has(day)) days.set(day, { live: emptySums(), test: emptySums() });
    return days.get(day);
  }

  async function load() {
    await mkdir(folder, { recursive: true });
    try {
      salt = (await readFile(join(folder, 'salt'), 'utf8')).trim();
    } catch {
      salt = randomBytes(32).toString('base64url');
      await writeFile(join(folder, 'salt'), salt);
    }
    for (const name of await readdir(folder)) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
      try {
        const kept = JSON.parse(await readFile(join(folder, name), 'utf8'));
        const day = dayFor(name.slice(0, 10));
        for (const kind of ['live', 'test']) Object.assign(day[kind], kept[kind], { ids: new Set(kept[kind]?.ids ?? []) });
      } catch (error) {
        log('stats: unreadable', name, error.message);
      }
    }
    await prune();
  }

  /** Whether `address` may send a beat now: `{ ok }` or `{ ok: false, why }`, counting it if so. */
  function allowed(address) {
    if (settings.trusted.has(address) || beats.take(address, clock()).ok) return { ok: true };
    return { ok: false, why: 'too many beats from here' };
  }

  /** Whether a new id from `address` today may still count (each address and every address have their most). */
  function newIdAllowed(address, today, sums) {
    if (sums.live.ids.size + sums.test.ids.size >= limits.idsPerDay) return false;
    if (settings.trusted.has(address)) return true;
    const key = `${address} ${today}`;
    const from = idsFrom.get(key) ?? 0;
    if (from >= limits.idsPerAddress) return false;
    idsFrom.set(key, from + 1);
    return true;
  }

  /** Whether `id` is among the kept days' players of `kind`. */
  function seen(id, kind) {
    for (const day of days.values()) if (day[kind].ids.has(id)) return true;
    return false;
  }

  /**
   * A signed-in player's browser `was` folded into the account's `id`: every kept day the browser played counts the
   * account in its place (the same player once, never both), who is online and the minute counted move over, and a
   * browser new today takes its new player back when the account played before (today's alone: the days before
   * keep their sums as counted). Nothing is kept of the pair: the days hold the account's hash alone after. Only
   * replaces an id already counted, so it adds no player.
   */
  function fold(was, id, kind, known, today) {
    for (const [name, day] of days) {
      if (!day[kind].ids.delete(was)) continue;
      day[kind].ids.add(id);
      dirty.add(name);
    }
    const before = last.get(was);
    if (before) {
      const mine = last.get(id);
      if (!mine || mine.counted < before.counted) last.set(id, { ...before, at: Math.max(before.at, mine?.at ?? 0) });
      last.delete(was);
    }
    if (slot[kind].delete(was)) {
      slot[kind].add(id);
      const [name, index] = slot.key.split(' ');
      const day = days.get(name);
      if (day) day[kind].online[Number(index)] = slot[kind].size;
    }
    const newOn = newIds.get(was);
    newIds.delete(was);
    if (newOn === today && known) {
      const day = days.get(newOn);
      if (day && day[kind].newPlayers > 0) {
        day[kind].newPlayers--;
        dirty.add(newOn);
      }
    }
  }

  /** A checked beat from a page at `origin` and `address`, counted; false if its id was one too many. */
  function take(beat, origin, address) {
    const now = clock();
    const today = dayOf(now);
    const kind = LIVE.has(origin) ? 'live' : 'test';
    const day = dayFor(today);
    const sums = day[kind];
    const id = hash(beat.id);
    // (an account's id: whether it played before, asked before its browser's days fold into it)
    const known = beat.was ? seen(id, kind) : false;
    if (beat.was) fold(hash(beat.was), id, kind, known, today);
    if (!sums.ids.has(id)) {
      if (!newIdAllowed(address, today, day)) return false;
      sums.ids.add(id);
    }
    const before = last.get(id);
    const newMinute = !before || now - before.counted >= SAME_MINUTE;
    if (newMinute) {
      sums.minutes++;
      if (beat.where === 'fight') sums.fight++;
      if (beat.coop) sums.coop++;
    }
    if (beat.start) sums.sessions++;
    // (a browser made its id just now: a new player, unless it is signed in to an account that played before)
    if (beat.first && !known) {
      sums.newPlayers++;
      if (!beat.was) newIds.set(id, today);
    }
    last.set(id, { at: now, counted: newMinute ? now : before.counted, kind });
    const slotIndex = Math.floor((now % DAY) / SLOT);
    const key = `${today} ${slotIndex}`;
    if (slot.key !== key) slot = { key, live: new Set(), test: new Set() };
    slot[kind].add(id);
    sums.online[slotIndex] = slot[kind].size;
    dirty.add(today);
    return true;
  }

  /** Ids seen over the last `span` days to `today`, for one kind of site. */
  function activeOver(kind, span, now) {
    const seen = new Set();
    for (let back = 0; back < span; back++) {
      const day = days.get(dayOf(now - back * DAY));
      for (const id of day?.[kind].ids ?? []) seen.add(id);
    }
    return seen.size;
  }

  /** The dashboard's read: online now, active players by day, week and month, and each of the last `span` days. */
  function read(span) {
    const now = clock();
    const online = { live: 0, test: 0 };
    for (const { at, kind } of last.values()) if (now - at < ONLINE_NOW) online[kind]++;
    const active = {};
    for (const kind of ['live', 'test']) {
      active[kind] = { day: activeOver(kind, 1, now), week: activeOver(kind, 7, now), month: activeOver(kind, 30, now) };
    }
    const list = [];
    for (let back = span - 1; back >= 0; back--) {
      const day = dayOf(now - back * DAY);
      const kept = days.get(day);
      const sumsOf = (kind) => {
        const { ids, ...sums } = kept?.[kind] ?? emptySums();
        return { ...sums, players: ids.size };
      };
      list.push({ day, live: sumsOf('live'), test: sumsOf('test') });
    }
    return { now: new Date(now).toISOString(), slotMinutes: SLOT / MINUTE, online, active, days: list };
  }

  /** Writes each day that changed. */
  async function save() {
    for (const day of [...dirty]) {
      dirty.delete(day);
      const kept = days.get(day);
      if (!kept) continue;
      const json = {};
      for (const kind of ['live', 'test']) json[kind] = { ...kept[kind], ids: [...kept[kind].ids] };
      try {
        await writeFile(fileOf(day), JSON.stringify(json));
      } catch (error) {
        dirty.add(day);
        log('stats: not saved', day, error.message);
      }
    }
  }

  /** Drops the ids of days past `idDays` and the days past `keepDays`; forgets what the limits no longer need. */
  async function prune() {
    const now = clock();
    for (const [day, kept] of days) {
      const age = (now - Date.parse(`${day}T00:00:00Z`)) / DAY;
      if (age >= limits.keepDays) {
        days.delete(day);
        await rm(fileOf(day), { force: true });
      } else if (age >= limits.idDays && (kept.live.ids.size || kept.test.ids.size)) {
        kept.live.ids.clear();
        kept.test.ids.clear();
        dirty.add(day);
      }
    }
    for (const [id, { at }] of last) if (now - at > DAY) last.delete(id);
    beats.prune(now);
    const today = dayOf(now);
    for (const key of idsFrom.keys()) if (!key.endsWith(today)) idsFrom.delete(key);
    for (const [id, day] of newIds) if (day !== today) newIds.delete(id);
    await save();
  }

  return { load, allowed, take, read, save, prune };
}
