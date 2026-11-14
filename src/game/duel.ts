// A duel: hero against hero, 1 v 1 or 2 v 2, within a room's party, on a battleground with no foes (#406: "PvP 1v1
// and 2v2, first to 3, no rewards"; from play: "a menu where you can select the map, how many players, against which
// players. And how many matches"). Set up by the room's host at the village's weapons rack (ui/pvpMenu.ts), fought as a
// run with no waves (`RunState.duel`): rounds to the wins chosen, each from the gates with a count, over when a side
// is all down or its time is up, everyone whole again for the next. Nothing is won or lost, nothing saved.
//
// The host's game rules the rounds and says each turn of them to the others (`DuelNet`); each game judges its own
// hero's hits on its rivals as its own screen shows them (entities/rival.ts) and tells the struck hero's game, which
// works each hit out as its own screen has him (his block, his ward, a blink away) and reports his life and his fall
// as it does in any run.
import * as THREE from 'three';
import { G } from '../state';
import { COOP, PVP } from '../data/balance';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { DAMAGE_TYPES, hurtByRival } from '../combat/damage';
import { clearProjectiles } from '../combat/projectiles';
import { clearEffects } from '../fx/effects';
import { clearTimers } from '../core/timers';
import { Rival, type RivalHit } from '../entities/rival';
import { HERO_RADIUS, type Player } from '../entities/player';
import { resolveWorld } from '../world/collision';
import { isGuest, readying } from '../net/role';
import { floatText } from '../ui/floaters';
import { sfx } from '../core/audio';

/** A player's part in a duel: on the first side, on the second, or watching. */
export type DuelPart = 0 | 1 | 'watch';
export type Side = 0 | 1;
/** the rounds a match may be won by, and the one it is unless chosen (#406: "first to 3") */
export const DUEL_WINS = [1, 3, 5] as const;
const WINS_USUAL = 3;

/** A duel as agreed: its battleground, how many a side, the rounds that win it, whether gear counts, and each
 *  player's part by its slot. */
export interface DuelSetup { ground: BiomeId; aSide: 1 | 2; wins: number; gear: boolean; parts: [number, DuelPart][] }

/** The duel as set up at the rack (the host's; a guest's is the host's word of it), and the guests who said they're
 *  ready for it, by slot (any change to it asks them again). */
export const duelSetup = {
  ground: BIOME_IDS[0] as BiomeId,
  aSide: 1 as 1 | 2,
  wins: WINS_USUAL as number,
  gear: true,
  parts: new Map<number, DuelPart>(),
  ready: new Set<number>(),
};

export const setupNow = (): DuelSetup => ({
  ground: duelSetup.ground, aSide: duelSetup.aSide, wins: duelSetup.wins, gear: duelSetup.gear, parts: [...duelSetup.parts],
});

/** A setup as a message carries it, checked: null if it's none. */
export function readSetup(m: unknown): DuelSetup | null {
  const s = m as Partial<DuelSetup> | null;
  if (!s || !BIOME_IDS.includes(s.ground as BiomeId) || (s.aSide !== 1 && s.aSide !== 2)) return null;
  if (!(DUEL_WINS as readonly number[]).includes(s.wins as number) || typeof s.gear !== 'boolean' || !Array.isArray(s.parts)) return null;
  const parts: [number, DuelPart][] = [];
  for (const row of s.parts) {
    if (!Array.isArray(row) || !Number.isInteger(row[0]) || ![0, 1, 'watch'].includes(row[1])) return null;
    parts.push([row[0], row[1]]);
  }
  return { ground: s.ground as BiomeId, aSide: s.aSide, wins: s.wins as number, gear: s.gear, parts };
}

/** A guest: the host's word of the duel as set up, and who is ready for it. */
export function takeSetup(m: unknown, ready: unknown): void {
  const s = readSetup(m);
  if (!s) return;
  Object.assign(duelSetup, { ground: s.ground, aSide: s.aSide, wins: s.wins, gear: s.gear });
  duelSetup.parts = new Map(s.parts);
  duelSetup.ready = new Set(Array.isArray(ready) ? ready.filter((n): n is number => Number.isInteger(n)) : []);
}

/** A match's turns: the count before a round, the round, the pause after it, the result. */
export type DuelPhase = 'count' | 'fight' | 'between' | 'done';

export interface DuelState {
  setup: DuelSetup;
  score: [number, number];
  /** the round counted in or fought (0: the first not yet called, the host waiting for a guest still readying) */
  round: number;
  phase: DuelPhase;
  /** seconds left of the phase */
  timer: number;
  /** host: when the fallen are counted (`PVP.trade` after a fall; -1: no one fell) */
  judgeAt: number;
  /** who took the last round, and the match */
  last: Side | 'draw' | null;
  winner: Side | null;
  /** the draughts the local hero drank this round (combat/skills/potion.ts counts them) */
  drunk: number;
}

export const newDuel = (setup: DuelSetup): DuelState => ({
  setup, score: [0, 0], round: 0, phase: 'count', timer: PVP.countdown, judgeAt: -1, last: null, winner: null, drunk: 0,
});

/** The duel being fought, if one is. */
export const duelOn = (): DuelState | null => G.run?.duel ?? null;

/** What the host says of the duel to the other games, and each game's hits to the hero they struck (set by
 *  net/session; none solo). */
export interface DuelNet {
  round(n: number, score: [number, number]): void;
  fight(n: number): void;
  won(n: number, side: Side | 'draw', score: [number, number]): void;
  end(winner: Side, score: [number, number]): void;
  hits(to: Player, n: number, rows: number[][]): void;
  /** a guest leaves the duel: its side gives the match up */
  quit(): void;
}
let net: DuelNet | null = null;
export function setDuelNet(n: DuelNet | null): void { net = n; }

/** What the duel shows and asks of the rest of the game (set by main). */
export interface DuelUI {
  banner(title: string, sub?: string): void;
  /** the name a player goes by */
  name(p: Player): string;
  /** the local hero placed for a round: the camera behind him */
  face(facing: number): void;
  /** the match is over: its result shown */
  result(d: DuelState): void;
  /** back to the village */
  back(): void;
}
let ui: DuelUI;
export function initDuel(hooks: DuelUI): void { ui = hooks; }

// --- sides -----------------------------------------------------------------------------------------
/** The side `p` fights on, or null: watching, or no duel. */
export function sideOf(p: Player, d: DuelState | null = duelOn()): Side | null {
  const part = d?.setup.parts.find(([slot]) => slot === p.slot)?.[1];
  return part === 0 || part === 1 ? part : null;
}

/** The fighters of `side` in the room, by slot. */
export const fighters = (d: DuelState, side: Side): Player[] =>
  G.players.filter((p) => sideOf(p, d) === side).sort((a, b) => a.slot - b.slot);

/** A side by its fighters' names ("Mira & Dax"). */
export const sideName = (d: DuelState, side: Side): string => fighters(d, side).map((p) => ui.name(p)).join(' & ') || (side ? 'Side two' : 'Side one');

const other = (side: Side): Side => (side === 0 ? 1 : 0);

/** The share of its life a side has left, summed over its fighters. */
const lifeOf = (d: DuelState, side: Side): number =>
  fighters(d, side).reduce((sum, p) => sum + (p.alive ? Math.max(0, p.life) / p.stats.maxLife : 0), 0);

// --- a round ---------------------------------------------------------------------------------------
/** The two gates the sides start from: the first, and the one furthest from it. */
function gates(): [THREE.Vector3, THREE.Vector3][] {
  const portals = G.arena.portals, first = portals[0];
  const far = [...portals].sort((a, b) => b.pos.distanceTo(first.pos) - a.pos.distanceTo(first.pos))[0];
  return [first, far].map((gate) => [gate.pos, gate.dir]);
}

/** Where the `i`th of `of` fighters of `side` stands as a round begins, and the way he faces: in from his side's gate,
 *  two of a side abreast. */
function standAt(side: Side, i: number, of: number): { at: THREE.Vector3; facing: number } {
  const [pos, dir] = gates()[side];
  const across = (i - (of - 1) / 2) * PVP.apart;
  const at = new THREE.Vector3(pos.x + dir.x * PVP.fromGate - dir.z * across, 0, pos.z + dir.z * PVP.fromGate + dir.x * across);
  resolveWorld(at, HERO_RADIUS);
  return { at, facing: Math.atan2(dir.x, dir.z) };
}

/** What a round leaves in the air let go: shots, effects, and what skills had scheduled. */
function clearFight(): void {
  for (const p of G.players) p.stopChannel();
  clearProjectiles();
  clearEffects();
  clearTimers();
}

/** Round `n` called, on every game: everyone whole again and at their gates, the watchers out of the arena, the
 *  count begun. */
function round(d: DuelState, n: number, score: [number, number]): void {
  d.round = n;
  d.score = score;
  d.phase = 'count';
  d.timer = PVP.countdown;
  d.judgeAt = -1;
  d.drunk = 0;
  clearFight();
  for (const side of [0, 1] as const) {
    const list = fighters(d, side);
    list.forEach((p, i) => {
      const { at, facing } = standAt(side, i, list.length);
      p.reset();
      p.place(at, facing);
      Object.assign(p.remote, { x: at.x, z: at.z, vx: 0, vz: 0, f: facing });
      if (p.local) ui.face(facing);
    });
  }
  for (const p of G.players) {
    if (sideOf(p, d) !== null) continue;
    p.reset();
    p.out = 'banked';
    p.show(false);
  }
  G.player.truce = true;
  standRivals(d);
  sfx.waveClear();
  ui.banner(`Round ${n}`, score[0] + score[1] ? `${score[0]} : ${score[1]}` : `First to ${d.setup.wins}`);
}

function fight(d: DuelState, n: number): void {
  if (d.round !== n) return;
  d.phase = 'fight';
  d.timer = PVP.roundTime;
  G.player.truce = false;
  sfx.waveStart();
  ui.banner('Fight');
}

function won(d: DuelState, n: number, side: Side | 'draw', score: [number, number]): void {
  if (d.round !== n) return;
  d.phase = 'between';
  d.timer = PVP.between;
  d.score = score;
  d.last = side;
  G.player.truce = true;
  ui.banner(side === 'draw' ? 'A draw' : `${sideName(d, side)} ${fighters(d, side).length > 1 ? 'take' : 'takes'} the round`, `${score[0]} : ${score[1]}`);
}

function end(d: DuelState, winner: Side, score: [number, number]): void {
  if (d.phase === 'done') return;
  d.phase = 'done';
  d.timer = PVP.result;
  d.score = score;
  d.winner = winner;
  G.player.truce = true;
  clearFight();
  ui.result(d);
}

/** A guest: the host's word of the duel's turn (`DuelNet`), by its name. */
export function duelWord(m: Record<string, unknown>): void {
  const d = duelOn();
  if (!d || !isGuest()) return;
  const score = (Array.isArray(m.score) ? m.score.map(Number) : d.score) as [number, number];
  const n = Number(m.n);
  if (m.t === 'dround') round(d, n, score);
  else if (m.t === 'dfight') fight(d, n);
  else if (m.t === 'dwon') won(d, n, m.side === 0 || m.side === 1 ? m.side : 'draw', score);
  else if (m.t === 'dend' && (m.side === 0 || m.side === 1)) end(d, m.side, score);
}

// --- the host's ruling -----------------------------------------------------------------------------
function hostRound(d: DuelState, n: number): void {
  round(d, n, d.score);
  net?.round(n, d.score);
}

function hostWon(d: DuelState, side: Side | 'draw'): void {
  const score: [number, number] = [d.score[0] + (side === 0 ? 1 : 0), d.score[1] + (side === 1 ? 1 : 0)];
  won(d, d.round, side, score);
  net?.won(d.round, side, score);
}

function hostEnd(d: DuelState, winner: Side): void {
  end(d, winner, d.score);
  net?.end(winner, d.score);
}

/** A hero fell in the duel (`playerDied`, on every game): the host counts the fallen a moment later, so two who
 *  fell together draw. */
export function duelFall(_p: Player): void {
  const d = duelOn();
  if (d && !isGuest() && d.phase === 'fight' && d.judgeAt < 0) d.judgeAt = G.time + PVP.trade;
}

/** Host: a guest left the duel from its pause menu: its side gives the match up (a watcher just leaves). */
export function duelQuit(p: Player): void {
  const d = duelOn();
  const side = sideOf(p, d);
  if (d && !isGuest() && d.phase !== 'done' && side !== null) hostEnd(d, other(side));
}

/** The local player leaves the duel from the pause menu: a fighter's side gives the match up, a watcher goes back to
 *  the village alone. */
export function quitDuel(): void {
  const d = duelOn();
  if (!d) return;
  const side = sideOf(G.player, d);
  if (side === null || d.phase === 'done') { ui.back(); return; }
  if (isGuest()) net?.quit();
  else hostEnd(d, other(side));
}

/** Every frame of the duel: its clock, the hits its hero dealt sent on, and on the host its turns. */
export function updateDuel(dt: number): void {
  const d = duelOn();
  if (!d) return;
  sendHits(d);
  if (d.phase === 'done') {
    d.timer -= dt;
    if (d.timer <= 0) ui.back();
    return;
  }
  const waiting = d.round === 0;
  if (!waiting) d.timer = Math.max(0, d.timer - dt);
  if (isGuest()) return;
  // (a side with no one left in the room gives the match up)
  for (const side of [0, 1] as const) if (!fighters(d, side).length) { hostEnd(d, other(side)); return; }
  if (waiting) {
    if (!readying.guests.length || G.time - G.run!.started > COOP.waitForGuests) hostRound(d, 1);
    return;
  }
  if (d.phase === 'count' && d.timer <= 0) {
    fight(d, d.round);
    net?.fight(d.round);
  } else if (d.phase === 'fight') {
    const standing = ([0, 1] as const).map((side) => fighters(d, side).some((p) => p.alive));
    if (d.judgeAt >= 0 && G.time >= d.judgeAt) {
      d.judgeAt = -1;
      if (!standing[0] || !standing[1]) hostWon(d, standing[0] ? 0 : standing[1] ? 1 : 'draw');
    } else if (d.timer <= 0) {
      // (its time up: the side with more of its life left takes it)
      const a = lifeOf(d, 0), b = lifeOf(d, 1);
      hostWon(d, Math.abs(a - b) < 0.005 ? 'draw' : a > b ? 0 : 1);
    }
  } else if (d.phase === 'between' && d.timer <= 0) {
    const leader = d.score[0] >= d.setup.wins ? 0 : d.score[1] >= d.setup.wins ? 1 : null;
    if (leader !== null) hostEnd(d, leader);
    else hostRound(d, d.round + 1);
  }
}

/** The duel is left (the run abandoned): every hero as he was before it. */
export function leaveDuel(): void {
  for (const p of G.players) {
    p.truce = false;
    if (!p.gearless) continue;
    p.gearless = false;
    p.recomputeStats(p.equipped);
  }
  outgoing.clear();
  taken.clear();
}

/** The duel begins on this game (the run started with it): gear counted or not, as agreed. */
export function enterDuel(d: DuelState): void {
  for (const p of G.players) {
    p.gearless = !d.setup.gear;
    p.recomputeStats(p.equipped);
  }
  G.player.truce = true;
  outgoing.clear();
  taken.clear();
}

// --- rivals and hits -------------------------------------------------------------------------------
/** The local hero's rivals standing among the foes: one for each fighter of the other side, none for a watcher. */
function standRivals(d: DuelState): void {
  const mine = sideOf(G.player, d);
  if (mine === null) return;
  for (const p of fighters(d, other(mine))) {
    if (G.enemies.some((e) => e instanceof Rival && e.player === p)) continue;
    G.enemies.push(new Rival(p, ui.name(p), {
      stands: (rival) => duelOn() === d && d.phase !== 'done' && G.players.includes(rival.player),
      open: () => d.phase === 'fight',
      friend: (rival, by) => sideOf(by, d) === sideOf(rival.player, d),
      dealt,
    }));
  }
}

/** the local hero's hits on each rival since they were last sent, by the rival's slot */
const outgoing = new Map<number, { to: Player; rows: number[][] }>();
const r2 = (v: number): number => Math.round(v * 100) / 100;

/** A skill of the local hero's struck a rival: told to the rival's own game with where he stood here as it struck. */
function dealt(to: Player, hit: RivalHit): void {
  let out = outgoing.get(to.slot);
  if (!out) outgoing.set(to.slot, (out = { to, rows: [] }));
  const from = hit.from ?? G.player.pos;
  out.rows.push([
    r2(hit.amount), DAMAGE_TYPES.indexOf(hit.type), hit.crit ? 1 : 0, r2(hit.knock ?? 0), r2(from.x), r2(from.z),
    r2(hit.chill ?? 0), r2(hit.freeze ?? 0), r2(hit.daze ?? 0), r2(hit.shove?.x ?? 0), r2(hit.shove?.z ?? 0), r2(to.pos.x), r2(to.pos.z),
  ]);
}

function sendHits(d: DuelState): void {
  for (const { to, rows } of outgoing.values()) net?.hits(to, d.round, rows);
  outgoing.clear();
}

/** what each rival's hits took of the local hero's life within the second running, by the rival's slot */
const taken = new Map<number, { since: number; share: number }>();

/**
 * A rival's hits on the local hero, as its game judged them (rows as `dealt` makes them), worked out here: none out of
 * a round, from a hero of his own side, or struck where he no longer stands on his own screen (he blinked or dashed
 * away: `PVP.dodged`); each held to what a hit and a second of hits may take (`PVP.hitMost`), whatever its sender says.
 */
export function duelHits(by: Player, n: number, rows: unknown): void {
  const d = duelOn(), me = G.player;
  if (!d || d.phase !== 'fight' || n !== d.round || !Array.isArray(rows)) return;
  const mine = sideOf(me, d), theirs = sideOf(by, d);
  if (mine === null || theirs === null || mine === theirs) return;
  for (const row of rows as unknown[]) {
    if (!me.alive) return;
    if (!Array.isArray(row) || row.length < 13 || !row.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const [amount, type, crit, knock, fromX, fromZ, chill, freeze, daze, shoveX, shoveZ, atX, atZ] = row as number[];
    if (Math.hypot(atX - me.pos.x, atZ - me.pos.z) > PVP.dodged) {
      floatText(me.pos.x, 2.5, me.pos.z, 'Dodged', 'info', '#cfe8ff');
      continue;
    }
    const from = new THREE.Vector3(fromX, 0, fromZ);
    if (amount > 0) {
      const most = me.stats.maxLife * PVP.hitMost;
      let budget = taken.get(by.slot);
      if (!budget || G.time - budget.since >= 1) taken.set(by.slot, (budget = { since: G.time, share: 0 }));
      const held = Math.max(0, Math.min(amount, most, most * 2 - budget.share));
      budget.share += held;
      if (held <= 0) continue;
      // (guarded, a moment after a round begins or a raise: nothing of the hit lands)
      if (!hurtByRival(me, held, DAMAGE_TYPES[type] ?? 'physical', from)) continue;
      if (crit) floatText(me.pos.x, 2.9, me.pos.z, 'Critical', 'info', '#ffd27a');
    }
    if (!me.alive) return;
    if (knock > 0) {
      const dx = me.pos.x - fromX, dz = me.pos.z - fromZ, far = Math.hypot(dx, dz) || 1;
      me.knock.x += (dx / far) * Math.min(knock, PVP.shove);
      me.knock.z += (dz / far) * Math.min(knock, PVP.shove);
    }
    if (shoveX || shoveZ) {
      const far = Math.hypot(shoveX, shoveZ);
      me.knock.set((shoveX / far) * PVP.shove, 0, (shoveZ / far) * PVP.shove);
    }
    if (chill > 0) me.chilledUntil = Math.max(me.chilledUntil, G.time + Math.min(chill, 10));
    if (freeze > 0) me.hold(Math.min(freeze, 10) * PVP.hold, true);
    else if (daze > 0) me.hold(Math.min(daze, 10) * PVP.hold, false);
  }
}
