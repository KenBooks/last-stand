// Bug reports (server/traces/AGENTS.md): the pause menu's Report a bug form (src/ui/bugReport.ts) sends what the
// player wrote, the facts the game adds and, if they left it ticked, a picture of the game, here, beside the traces:
// the same kind of upload (anonymous, from the game's own pages, read back by agents with the owner's token), on the
// same host, route, certificate, token and volume, so no new deploy. Nothing goes to GitHub.
//   POST /traces/reports              a report as JSON (1 MB at most), from the game's own pages -> 201 { code }
//   GET  /traces/reports?limit=&offset=   the reports kept, newest first (read)  -> { reports: [...], total, ... }
//   GET  /traces/reports/<code>       a report whole, as JSON (read)
//   GET  /traces/reports/<code>.jpg   its picture (read)
// Every limit is a setting (settingsFrom in traces.mjs) and listed with what happens past it in the AGENTS.md.
// No address is kept on the disk: the rate limits count in memory alone, and forget at a restart.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** the kinds of trouble the form offers (src/data/bugReport.ts's ids: a test holds the two lists alike) */
export const KINDS = new Set([
  'gameplay', 'looks', 'slow', 'sound', 'controls', 'coop', 'menus', 'saves', 'stuck', 'idea', 'other',
]);
/** what a report's JSON may hold, and nothing else */
const FIELDS = new Set(['kind', 'text', 'expected', 'facts', 'picture']);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** The limits on what one report may hold, from the service's settings. */
export function reportLimits(settings) {
  return {
    leastText: 10,
    mostText: settings.reportMostText,
    mostExpected: settings.reportMostExpected,
    mostFacts: 16,
    mostFactLength: 400,
    mostPictureBytes: settings.reportPictureMax,
    mostPictureSide: settings.reportPictureSide,
  };
}

/**
 * Counts of what each sender sent within windows of time (`windows`: [ms, most] pairs), kept in memory alone. `take`
 * counts one more if every window has room, else says how long until one has (ms).
 */
export class Limiter {
  constructor(windows) {
    this.windows = windows;
    /** sender -> its times (ms), newest last, none older than the longest window */
    this.sent = new Map();
  }

  /** One more from `sender` at `now`, if each window holds fewer than its most: `{ ok }`, else `{ retryMs }`. */
  take(sender, now = Date.now()) {
    const longest = Math.max(...this.windows.map(([span]) => span));
    const times = (this.sent.get(sender) ?? []).filter((t) => now - t < longest);
    this.sent.set(sender, times);
    let retryMs = 0;
    for (const [span, most] of this.windows) {
      const within = times.filter((t) => now - t < span);
      // (the window frees a place once the oldest of its last `most` falls out of it)
      if (within.length >= most) retryMs = Math.max(retryMs, within[within.length - most] + span - now);
    }
    if (retryMs > 0) return { ok: false, retryMs };
    times.push(now);
    return { ok: true };
  }

  /** Forgets the senders with nothing left in any window. */
  prune(now = Date.now()) {
    const longest = Math.max(...this.windows.map(([span]) => span));
    for (const [sender, times] of this.sent) if (!times.some((t) => now - t < longest)) this.sent.delete(sender);
  }
}

/** The width and height a JPEG says it is (its first start-of-frame marker), or null if it isn't a whole JPEG. */
export function jpegSize(bytes) {
  const n = bytes.length;
  if (n < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[n - 2] !== 0xff || bytes[n - 1] !== 0xd9) return null;
  for (let at = 2; at + 9 < n;) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // (a run of 0xff is padding; a marker without a length stands alone)
    if (marker === 0xff) { at++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    const length = bytes.readUInt16BE(at + 2);
    const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    at += 2 + length;
  }
  return null;
}

/** A report's JSON checked against `limits`: `{ report, picture }` (the picture's bytes or null), or `{ error }`. */
export function checkReport(json, limits) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { error: 'not a report' };
  const unknown = Object.keys(json).filter((key) => !FIELDS.has(key));
  if (unknown.length) return { error: `fields it can't hold: ${unknown.join(', ')}` };
  const { kind, text, expected = '', facts = [], picture = null } = json;
  if (!KINDS.has(kind)) return { error: 'no such kind' };
  if (typeof text !== 'string' || text.trim().length < limits.leastText) return { error: 'what happened is too short' };
  if (text.length > limits.mostText) return { error: `what happened is over ${limits.mostText} characters` };
  if (typeof expected !== 'string' || expected.length > limits.mostExpected) {
    return { error: `what was expected is over ${limits.mostExpected} characters` };
  }
  const factsFit = Array.isArray(facts) && facts.length <= limits.mostFacts
    && facts.every((fact) => typeof fact === 'string' && fact.length <= limits.mostFactLength);
  if (!factsFit) return { error: `the game's facts: ${limits.mostFacts} lines of ${limits.mostFactLength} at most` };
  let bytes = null;
  if (picture !== null) {
    if (typeof picture !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(picture)) return { error: 'the picture is not base64' };
    bytes = Buffer.from(picture, 'base64');
    if (bytes.length > limits.mostPictureBytes) return { error: `the picture is over ${limits.mostPictureBytes} bytes` };
    const size = jpegSize(bytes);
    if (!size) return { error: 'the picture is not a JPEG' };
    if (Math.max(size.width, size.height) > limits.mostPictureSide) {
      return { error: `the picture is over ${limits.mostPictureSide} px on a side` };
    }
  }
  return { report: { kind, text: text.trim(), expected: expected.trim(), facts }, picture: bytes };
}

/** The reports' part of the service: their files under `<data>/reports`, the index and the rate limits. */
export function reportsService(settings, { log, newCode }) {
  const dir = join(settings.data, 'reports');
  const limits = reportLimits(settings);
  /** code -> what's kept of it (`meta`), oldest first */
  const index = new Map();
  let diskBytes = 0;
  /** each address's own: so many an hour and a day; every address's together: so many a day */
  const perAddress = new Limiter([[HOUR, settings.reportPerHour], [DAY, settings.reportPerDay]]);
  const everyone = new Limiter([[DAY, settings.reportPerDayAll]]);

  const fileOf = (code) => join(dir, `${code}.json`);
  const pictureOf = (code) => join(dir, `${code}.jpg`);

  /** Whether `address` may send one more now: `{ ok }`, or `{ retryMs }` and which limit it met. */
  function allowed(address, now = Date.now()) {
    if (!settings.trusted.has(address)) {
      const own = perAddress.take(address, now);
      if (!own.ok) return { ...own, why: 'too many reports from here' };
    }
    const all = everyone.take('*', now);
    return all.ok ? all : { ...all, why: 'too many reports today' };
  }

  /** A report taken: kept on the disk and in the index, its code back. */
  async function keep(report, picture) {
    const code = newCode();
    const meta = { code, at: new Date().toISOString(), ...report, picture: !!picture, pictureBytes: picture?.length ?? 0 };
    const json = JSON.stringify(meta);
    if (picture) await writeFile(pictureOf(code), picture);
    await writeFile(fileOf(code), json);
    meta.bytes = Buffer.byteLength(json) + meta.pictureBytes;
    index.set(code, meta);
    diskBytes += meta.bytes;
    log('report', code, report.kind, `${meta.bytes} B`);
    if (diskBytes > settings.reportDiskMax) await prune();
    return code;
  }

  /** Drops what's older than its days, then the oldest till the disk holds under its most. */
  async function prune(now = Date.now()) {
    const oldest = now - settings.reportKeepDays * DAY;
    for (const [code, meta] of index) {
      if (Date.parse(meta.at) >= oldest && diskBytes <= settings.reportDiskMax) break;
      index.delete(code);
      diskBytes -= meta.bytes;
      await rm(fileOf(code), { force: true });
      await rm(pictureOf(code), { force: true });
      log('dropped report', code);
    }
    perAddress.prune(now);
    everyone.prune(now);
  }

  /** The index, from the reports kept. */
  async function load() {
    await mkdir(dir, { recursive: true });
    const metas = [];
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const meta = JSON.parse(await readFile(join(dir, name), 'utf8'));
        const json = (await stat(join(dir, name))).size;
        meta.bytes = json + (meta.picture ? (await stat(pictureOf(meta.code))).size : 0);
        metas.push(meta);
      } catch { /* half written: left out */ }
    }
    metas.sort((a, b) => a.at.localeCompare(b.at));
    for (const meta of metas) {
      index.set(meta.code, meta);
      diskBytes += meta.bytes;
    }
    await prune();
  }

  /** The list, newest first, each report's line (what happened cut to 200 characters), `limit` from `offset`. */
  function list(url) {
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 50);
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    const all = [...index.values()].reverse();
    const lines = all.slice(offset, offset + limit).map((m) => ({
      code: m.code, at: m.at, kind: m.kind, text: m.text.slice(0, 200), picture: m.picture, bytes: m.bytes,
    }));
    return {
      reports: lines, total: all.length, diskBytes, diskMax: settings.reportDiskMax, keepDays: settings.reportKeepDays,
    };
  }

  /** The report kept under `code`, whole (without the counts the disk keeps), or null. */
  function whole(code) {
    const meta = index.get(code);
    if (!meta) return null;
    const { bytes, ...report } = meta;
    return report;
  }

  /** Its picture's bytes, or null. */
  async function picture(code) {
    return index.get(code)?.picture ? readFile(pictureOf(code)) : null;
  }

  /** A report's JSON checked against the limits (`checkReport`). */
  const check = (json) => checkReport(json, limits);

  return { limits, allowed, check, keep, prune, load, list, whole, picture };
}
