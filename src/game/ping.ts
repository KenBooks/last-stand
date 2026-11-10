// Co-op pings: a player shows the party a foe or a spot (Left Shift held and let go, or a long press on the
// minimap: ui/ping.ts), and every game shows it for a few seconds, in the world where it points and on the minimap.
// A ping has no gameplay effect, so every game sends its own straight to every other (`ctl` `ping`, net/session.ts)
// and shows the others' as they come. One ping a player at a time: a new one replaces the last.
import { G } from '../state';
import { PING } from '../data/balance';
import { sfx } from '../core/audio';
import { aimedFoe } from '../combat/skills/quarryMark';
import type * as THREE from 'three';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';

/** What a ping points out: a place on the ground, or a foe (followed while it lives). Every ping is one size (from
 *  play: "do not increase radius, just have same size for all"). */
export type PingKind = 'spot' | 'foe';

/** A ping as it goes over the link: its kind, where (m), a foe's id (the host's, every copy's). */
export interface PingMessage { k: PingKind; x: number; z: number; id?: number }

/** A ping shown: who sent it, what it points out, where (a foe's: where it is now), and how long it has shown (s). */
export interface Ping {
  by: Player;
  kind: PingKind;
  x: number;
  z: number;
  /** the ring's radius round it (m): `PING.radius`, every ping's */
  r: number;
  /** the foe pointed out, while it lives (a foe ping whose foe this game has no copy of marks its spot) */
  foe: Enemy | null;
  age: number;
}

/** every ping shown, one a player at most */
export const pings: Ping[] = [];

let sendPing: (m: PingMessage) => void = () => {};
/** How a ping of ours goes to the party (set by net/session.ts while a room is open: solo code has no network). */
export function setPingNet(send: ((m: PingMessage) => void) | null): void { sendPing = send ?? (() => {}); }

/** when the local player last pinged (G.time, s) */
let lastSent = -Infinity;

/** The foe a ping at `target` (the aim: its `y` over the floor) points out, as Quarry Mark's aim would mark it. */
export const foeAimed = (target: THREE.Vector3): Enemy | null => aimedFoe(G.player, target, PING.foeNear);

/** The foe nearest (x, z) within `near` (m) of its middle: a ping on the minimap, where there's no body to aim at. */
export function foeNear(x: number, z: number, near: number): Enemy | null {
  let best: Enemy | null = null, bd = near;
  for (const e of G.enemies) {
    if (!e.alive || e.spawning) continue;
    const at = foeAt(e), d = Math.hypot(at.x - x, at.z - z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** Where a foe is as this game draws it (its body's place: on a guest's copy, eased onto the host's reports, its
 *  `pos` can stand off it; a ping placed by `pos` stood beside the foe, from play: "center point above mob. not side"). */
export const foeAt = (e: Enemy): { x: number; z: number } => e.obj.position;

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** The local player pings `m` (a foe's ping with its foe): shown here and sent to the party. False if too soon. */
export function ping(m: PingMessage, foe: Enemy | null = null): boolean {
  if (G.time - lastSent < PING.gap) return false;
  lastSent = G.time;
  const sent: PingMessage = { k: m.k, x: r2(m.x), z: r2(m.z) };
  if (m.k === 'foe' && foe) sent.id = foe.id;
  show(G.player, sent, foe);
  sendPing(sent);
  return true;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A partner's ping, as its game sent it (`m` is checked: it came over the link). */
export function pingHeard(by: Player, m: Record<string, unknown>): void {
  const kind = m.k === 'foe' ? 'foe' : 'spot';
  if (!finite(m.x) || !finite(m.z) || Math.hypot(m.x, m.z) > 200) return;
  const foe = kind === 'foe' && finite(m.id) ? G.enemies.find((e) => e.id === m.id && e.alive) ?? null : null;
  show(by, { k: kind, x: m.x, z: m.z }, foe);
}

/** `by`'s ping `m` shown from now, in place of its last. */
function show(by: Player, m: PingMessage, foe: Enemy | null): void {
  const at = pings.findIndex((p) => p.by === by);
  if (at >= 0) pings.splice(at, 1);
  const where = foe ? foeAt(foe) : m;
  pings.push({ by, kind: foe ? 'foe' : 'spot', x: where.x, z: where.z, r: PING.radius, foe, age: 0 });
  sfx.ping();
}

/** How strongly a ping shows (0 to 1): fading in as it comes, out over its last moment. */
export const pingShown = (p: Ping): number =>
  Math.max(0, Math.min(1, p.age / PING.fadeIn, (PING.life - p.age) / PING.fadeOut));

/** Every frame: each ping ages, a foe's follows it while it lives (then stays where it fell), and the old go, as do a
 *  player's who left. */
export function updatePings(dt: number): void {
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i];
    p.age += dt;
    if (p.foe && (!p.foe.alive || !G.enemies.includes(p.foe))) p.foe = null;
    if (p.foe) { const at = foeAt(p.foe); p.x = at.x; p.z = at.z; }
    if (p.age >= PING.life || !G.players.includes(p.by)) pings.splice(i, 1);
  }
}

/** Every ping gone (a room left, a run's end). */
export function clearPings(): void { pings.length = 0; }
