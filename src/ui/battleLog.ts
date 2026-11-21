// Optional battle log (pause menu, persisted in a cookie): every hit the local hero deals and takes, newest at the
// bottom, each saying who dealt it to whom, with what, how much and of which type. The hits of one burst (a channel's
// ticks, a held attack's blows) are one line, its count and total growing as they land. Paused from its panel, it
// lists nothing until it goes on, so what it shows stays to be read. Copied as text, a hit a line, for a report. Off
// or paused, nothing is made for it: combat/damage's log sink is null.
import { readCookie, writeCookie } from '../core/cookies';
import { DAMAGE_COLORS } from '../data/balance';
import { setLogSink, type LoggedHit } from '../combat/damage';
import { G } from '../state';
import type { DamageType } from '../types';
import { copyText } from './clipboard';

const COOKIE = 'last-stand-battle-log';
/** how often the panel is drawn at most while hits come in (ms) */
const REDRAW_MS = 100;
/** a hit joins a line of the same dealer, skill or attack and type whose last hit landed this recently (s) */
const JOIN_GAP = 1;
/** how many of the latest lines a hit may join (a foe's blow between a channel's ticks leaves its line open) */
const JOIN_BACK = 6;
/** the lines kept to scroll back through, and the hits kept for a report */
const MOST_LINES = 200;
const MOST_HITS = 2000;
/** a line names this many kinds of foe at most, and counts them past it */
const NAMED = 3;
/** how the local hero is named */
const YOU = 'You';
/** a foe gone before its blow landed */
const SOMEONE = 'A foe';

/** A hit as listed: when (game time, s), who dealt it to whom with what (a skill, a foe's attack), how much of which
 *  type, and what came of it. */
export interface LogEntry {
  at: number;
  dealt: boolean;
  by: string;
  how: string;
  to: string;
  /** the foe dealing or taking it (its id; -1: none) */
  foe: number;
  amount: number;
  type: DamageType;
  crit: boolean;
  kill: boolean;
  /** it struck the foe's head (a headshot, #750) */
  head: boolean;
  /** what of a blow on the hero didn't get through: his armor's or resistance's share, his shield's, his ward's */
  armor: number;
  blocked: number;
  absorbed: number;
  /** his raised shield's guard broken by it */
  broke: boolean;
}

/** A line: its first hit (when, who, with what, of which type), when its last landed, the foes on its foes' side (to
 *  whom the hero's hits went, or who struck him: each name's foes, by id) and what its hits added up to. */
interface Line {
  key: string;
  first: LogEntry;
  last: number;
  foes: Map<string, Set<number>>;
  hits: number;
  amount: number;
  crits: number;
  kills: number;
  armor: number;
  blocked: number;
  absorbed: number;
  broke: boolean;
  row: HTMLElement | null;
  changed: boolean;
}

let enabled = false;
/** paused from its panel: no hit is listed until it goes on */
let paused = false;
let el: HTMLElement;
let box: HTMLElement;
const hits: LogEntry[] = [];
const lines: Line[] = [];
const dropped: HTMLElement[] = [];
let dirty = false;
let nextDraw = 0;
/** whether the newest line is in view: the panel follows it until scrolled back */
let following = true;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const whole = (n: number): string => Math.round(n).toLocaleString('en-US');
const counted = (n: number, what: string): string => `${n} ${what}${n === 1 ? '' : 's'}`;

/** Game time as minutes, seconds and tenths. */
function clock(at: number): string {
  const tenths = Math.floor(at * 10);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${Math.floor(tenths / 600)}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}

export function initBattleLog(): void {
  el = document.querySelector<HTMLElement>('#blog')!;
  el.innerHTML = `<div class="bl-head"><span>Battle log</span><button class="link" data-bl="pause">Pause</button>
    <button class="link" data-bl="copy">Copy</button><button class="link" data-bl="clear">Clear</button></div>
    <div class="bl-lines"><div class="bl-none">No hits yet</div></div>`;
  box = el.querySelector<HTMLElement>('.bl-lines')!;
  box.addEventListener('scroll', () => {
    following = box.scrollHeight - box.scrollTop - box.clientHeight < 4;
  }, { passive: true });
  el.querySelector<HTMLElement>('[data-bl="pause"]')!.onclick = () => pauseBattleLog(!paused);
  const copy = el.querySelector<HTMLElement>('[data-bl="copy"]')!;
  copy.onclick = () => void copyLog(copy);
  el.querySelector<HTMLElement>('[data-bl="clear"]')!.onclick = clearBattleLog;
  setBattleLog(readCookie(COOKIE) === '1', false);
}

export const battleLogEnabled = (): boolean => enabled;

export function setBattleLog(on: boolean, persist = true): void {
  enabled = on;
  el.classList.toggle('hidden', !on);
  setLogSink(on && !paused ? record : null);
  if (persist) writeCookie(COOKIE, on ? '1' : '0');
}

export const battleLogPaused = (): boolean => paused;

/** The log paused (no hit listed, what it shows kept to read) or going on again. */
export function pauseBattleLog(on: boolean): void {
  paused = on;
  setLogSink(enabled && !paused ? record : null);
  el.classList.toggle('paused', on);
  el.querySelector('.bl-head span')!.textContent = on ? 'Battle log · paused' : 'Battle log';
  el.querySelector('[data-bl="pause"]')!.textContent = on ? 'Resume' : 'Pause';
}

/** Every hit listed since the log was cleared (the latest `MOST_HITS`), oldest first. */
export const battleLogHits = (): readonly LogEntry[] => hits;

export function clearBattleLog(): void {
  hits.length = 0;
  for (const line of lines.splice(0)) if (line.row) dropped.push(line.row);
  following = true;
  dirty = true;
  nextDraw = 0;
}

/** A hit from combat/damage, as listed. */
function entryOf(hit: LoggedHit): LogEntry {
  const at = G.time;
  if (hit.dealt) {
    const { foe } = hit;
    return {
      at, dealt: true, by: YOU, how: hit.skill.name, to: foe.name, foe: foe.id, amount: hit.amount, type: hit.type,
      crit: hit.crit, kill: hit.kill, head: hit.head, armor: 0, blocked: 0, absorbed: 0, broke: false,
    };
  }
  const foe = hit.by?.foe ?? null;
  const { r } = hit;
  return {
    at, dealt: false, by: foe?.name ?? SOMEONE, how: hit.by?.attack ?? 'blow', to: YOU, foe: foe?.id ?? -1,
    amount: r.taken, type: hit.type, crit: false, kill: false, head: false, armor: hit.armor, blocked: r.blocked,
    absorbed: r.absorbed, broke: r.broke,
  };
}

function record(hit: LoggedHit): void {
  const entry = entryOf(hit);
  hits.push(entry);
  if (hits.length > MOST_HITS) hits.splice(0, hits.length - MOST_HITS);
  const line = lineFor(entry);
  line.last = entry.at;
  // (the foes' side: whom the hero struck, or who struck him; he's on the other side, alone)
  const name = entry.dealt ? entry.to : entry.by;
  const foes = line.foes.get(name) ?? new Set<number>();
  foes.add(entry.foe);
  line.foes.set(name, foes);
  line.hits++;
  line.amount += entry.amount;
  line.crits += entry.crit ? 1 : 0;
  line.kills += entry.kill ? 1 : 0;
  line.armor += entry.armor;
  line.blocked += entry.blocked;
  line.absorbed += entry.absorbed;
  line.broke ||= entry.broke;
  line.changed = true;
  dirty = true;
}

/** The line `entry` joins (one of the latest of its dealer, skill or attack and type, still open), or a new one. */
function lineFor(entry: LogEntry): Line {
  const key = `${entry.dealt ? 'd' : 't'}|${entry.by}|${entry.how}|${entry.type}`;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - JOIN_BACK); i--) {
    const line = lines[i];
    if (line.key === key && entry.at - line.last <= JOIN_GAP) return line;
  }
  const line: Line = {
    key, first: entry, last: entry.at, foes: new Map(), hits: 0, amount: 0, crits: 0, kills: 0, armor: 0,
    blocked: 0, absorbed: 0, broke: false, row: null, changed: true,
  };
  lines.push(line);
  if (lines.length > MOST_LINES) {
    const old = lines.shift()!;
    if (old.row) dropped.push(old.row);
  }
  return line;
}

/** A line's foes' side: each kind of foe, with how many of them past one, or how many in all past `NAMED`. */
function foesOf(line: Line): string {
  if (line.foes.size > NAMED) {
    const foes = [...line.foes.values()].reduce((sum, ids) => sum + ids.size, 0);
    return `${foes} foes`;
  }
  return [...line.foes].map(([name, ids]) => `${name}${ids.size > 1 ? ` ×${ids.size}` : ''}`).join(', ');
}

/** Who dealt a line's hits and who took them: the hero alone on his side, the foes counted on theirs. */
function sidesOf(line: Line): { by: string; to: string } {
  return line.first.dealt ? { by: YOU, to: foesOf(line) } : { by: foesOf(line), to: YOU };
}

/** What of a blow on the hero didn't get through, each part said by what stopped it. */
function stoppedNotes(type: DamageType, armor: number, blocked: number, absorbed: number): string[] {
  const notes: string[] = [];
  if (Math.round(armor)) notes.push(`${whole(armor)} ${type === 'physical' ? 'stopped by armor' : 'resisted'}`);
  if (Math.round(blocked)) notes.push(`${whole(blocked)} blocked by shield`);
  if (Math.round(absorbed)) notes.push(`${whole(absorbed)} absorbed by ward`);
  return notes;
}

/** What a line's hits came to besides their damage: crits and kills, and what of a blow on the hero was stopped. */
function notesOf(line: Line): string[] {
  const notes: string[] = [];
  if (line.hits > 1) notes.push(counted(line.hits, 'hit'));
  if (line.crits) notes.push(line.hits > 1 ? counted(line.crits, 'crit') : 'crit');
  if (line.kills) notes.push(line.hits > 1 || line.kills > 1 ? counted(line.kills, 'kill') : 'kill');
  notes.push(...stoppedNotes(line.first.type, line.armor, line.blocked, line.absorbed));
  if (line.broke) notes.push('guard broken');
  return notes;
}

/** A line's markup: when, who dealt it with what to whom, how much of which type, and its notes. */
function lineHtml(line: Line): string {
  const { first } = line;
  const sides = sidesOf(line);
  const by = `<b class="${first.dealt ? 'you' : 'foe'}">${esc(sides.by)}</b>`;
  const to = `<b class="${first.dealt ? 'foe' : 'you'}">${esc(sides.to)}</b>`;
  const damage = `<em style="color:${hex(DAMAGE_COLORS[first.type])}">${whole(line.amount)} ${first.type}</em>`;
  const notes = notesOf(line);
  const small = notes.length ? ` <small>${notes.join(' · ')}</small>` : '';
  return `<span class="bl-t">${clock(first.at)}</span>`
    + `<span class="bl-what">${by} ${esc(first.how)} ▸ ${to} ${damage}${small}</span>`;
}

/** The log's lines as the panel shows them, oldest first, as text. */
export function battleLogLines(): string[] {
  return lines.map((line) => {
    const { first } = line;
    const sides = sidesOf(line);
    const notes = notesOf(line);
    const damage = `${whole(line.amount)} ${first.type}`;
    return `${clock(first.at)} ${sides.by} ${first.how} ▸ ${sides.to} ${damage}${notes.length ? ` · ${notes.join(' · ')}` : ''}`;
  });
}

/** The panel brought up to date, at most every `REDRAW_MS` while hits come in (once a frame, from the main loop). */
export function drawBattleLog(): void {
  if (!dirty || !enabled) return;
  const now = performance.now();
  if (now < nextDraw) return;
  nextDraw = now + REDRAW_MS;
  dirty = false;
  for (const row of dropped.splice(0)) row.remove();
  box.querySelector('.bl-none')?.classList.toggle('hidden', lines.length > 0);
  for (const line of lines) {
    if (!line.changed) continue;
    line.changed = false;
    if (!line.row) {
      line.row = document.createElement('div');
      line.row.className = line.first.dealt ? 'bl-line' : 'bl-line taken';
      box.append(line.row);
    }
    line.row.innerHTML = lineHtml(line);
  }
  if (following) box.scrollTop = box.scrollHeight;
}

/** A hit as a line of text, for a report. */
function hitText(hit: LogEntry): string {
  const notes = [hit.head ? 'headshot' : '', hit.crit ? 'crit' : '', hit.kill ? 'kill' : ''];
  notes.push(...stoppedNotes(hit.type, hit.armor, hit.blocked, hit.absorbed), hit.broke ? 'guard broken' : '');
  const more = notes.filter(Boolean);
  return `${clock(hit.at)} ${hit.by} ${hit.how} > ${hit.to}: ${whole(hit.amount)} ${hit.type}`
    + `${more.length ? ` (${more.join(', ')})` : ''}`;
}

async function copyLog(btn: HTMLElement): Promise<void> {
  const label = btn.textContent;
  const text = hits.length ? hits.map(hitText).join('\n') : 'No hits yet';
  btn.textContent = await copyText(text) ? 'Copied' : 'Copy failed';
  setTimeout(() => { btn.textContent = label; }, 1600);
}
