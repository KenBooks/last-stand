// The Rootmother's volleys of thrown branches, where the fight is simulated (from Kenneth: "It should throw more
// sticks at the ground, like combos, and they should even try to predict your path"): each branch let go from her
// hand aimed at where its hero will be when it lands, read from his pace over the floor (`watchPaces`: from his place
// frame to frame, so a partner's copy on the host is led as well as its own hero) and how fast his way turns (a hero
// circling her is led round his circle), led by a share of it and no further than `lead.most` (a hero who stops or turns as it leaves her hand is out of its ring). Her throws by name:
// a branch (led whole), a pair (where he stands, then led), a fan (its middle led), a line (half led) and her rain
// (one branch after another, each aimed as it leaves her hand, led whole, half, not at all, whole). Each branch is a
// `branch` fx every game flies and judges its own hero by (entities/rootmother.ts `branchAt`).
import * as THREE from 'three';
import { G } from '../state';
import { ROOTMOTHER } from '../data/foes/rootmother';
import { ARENA } from '../data/balance';
import { fx } from './enemyAI';
import { releaseFrom } from './throws';
import type { Enemy } from './enemy';
import type { Player } from './player';

const R = ROOTMOTHER;
const B = R.branch;

/** Her throws, and how many branches each lets go. */
export type Throw = 'branch' | 'pair' | 'fan' | 'volley' | 'rain';
export const THROWS: Record<Throw, number> = { branch: 1, pair: 2, fan: 3, volley: 5, rain: B.rain.count };

/** How long a branch flies `d` m (s). */
export const branchFlight = (d: number): number => B.flight[0] + B.flight[1] * d;

/** A branch's aim, kept for the lab (`lab boss --parts combos`): where its hero stood and how fast he went as it left
 *  her hand, the share of his way it was led by, and where it was aimed. */
export interface Aim {
  at: number;
  name: Throw;
  hero: { x: number; z: number };
  pace: { x: number; z: number };
  share: number;
  /** where its lead put it (a fan's or a line's middle, its branches spread across it), and where it was aimed */
  led: { x: number; z: number };
  to: { x: number; z: number };
  flight: number;
}
/** the latest aims, the newest last */
export const AIMS: Aim[] = [];

/** Each hero's pace over the floor as she reads it (m/s), how fast his way turns (rad/s, to his left), smoothed, and
 *  where he stood a frame ago. */
interface Pace { x: number; z: number; vx: number; vz: number; turn: number }
const PACES = new WeakMap<Player, Pace>();

/** Where simulated, each frame: every hero's pace read from where he stands now against a frame ago, smoothed over
 *  `lead.smooth` s; a jump (a blink, a set-up's place) read as no pace. */
export function watchPaces(heroes: Player[], dt: number): void {
  if (!(dt > 0)) return;
  const keep = Math.exp(-dt / B.lead.smooth);
  for (const p of heroes) {
    const pace = PACES.get(p);
    if (!pace) {
      PACES.set(p, { x: p.pos.x, z: p.pos.z, vx: 0, vz: 0, turn: 0 });
      continue;
    }
    let vx = (p.pos.x - pace.x) / dt, vz = (p.pos.z - pace.z) / dt;
    if (Math.hypot(vx, vz) > 20) vx = vz = 0;
    const wasX = pace.vx, wasZ = pace.vz;
    pace.vx = pace.vx * keep + vx * (1 - keep);
    pace.vz = pace.vz * keep + vz * (1 - keep);
    // (his way's turn, from his smoothed pace's heading frame to frame: none read while he hardly moves)
    let turn = 0;
    if (Math.hypot(wasX, wasZ) > 1 && Math.hypot(pace.vx, pace.vz) > 1) {
      turn = Math.atan2(wasX * pace.vz - wasZ * pace.vx, wasX * pace.vx + wasZ * pace.vz) / dt;
    }
    pace.turn = pace.turn * keep + turn * (1 - keep);
    pace.x = p.pos.x;
    pace.z = p.pos.z;
  }
}

/** Hero `p`'s pace as she reads it (m/s). */
export const paceOf = (p: Player): { x: number; z: number } => {
  const pace = PACES.get(p);
  return pace ? { x: pace.vx, z: pace.vz } : { x: 0, z: 0 };
};

/** Where hero `p` will be `t` s on (from where he stands, m) as she reads him: along his way, round its turn (`turn`
 *  at most `lead.turnMost` rad/s). */
function wayOver(p: Player, t: number): { x: number; z: number } {
  const pace = PACES.get(p);
  if (!pace) return { x: 0, z: 0 };
  const v = Math.hypot(pace.vx, pace.vz), heading = Math.atan2(pace.vz, pace.vx);
  const turn = Math.max(-B.lead.turnMost, Math.min(B.lead.turnMost, pace.turn));
  if (Math.abs(turn * t) < 1e-3) return { x: pace.vx * t, z: pace.vz * t };
  // (an arc of his speed's length, turning at his rate: its chord)
  const r = v / turn, to = heading + turn * t;
  return { x: r * (Math.sin(to) - Math.sin(heading)), z: r * (Math.cos(heading) - Math.cos(to)) };
}

/** Where a branch from `from` should land to meet hero `p`, led by `share` of his way over its flight and `later` s
 *  more, `lead.most` m at the most, kept `lead.inside` m inside the arena's wall. */
export function ledAt(p: Player, from: THREE.Vector3, share: number, later = 0): { x: number; z: number } {
  let x = p.pos.x, z = p.pos.z;
  if (share > 0) {
    // (its flight depends on where it's aimed: twice round is near enough)
    for (let i = 0; i < 2; i++) {
      const flight = branchFlight(Math.hypot(x - from.x, z - from.z)) + later;
      const way = wayOver(p, flight);
      let lx = way.x * share, lz = way.z * share;
      const length = Math.hypot(lx, lz);
      if (length > B.lead.most) {
        lx *= B.lead.most / length;
        lz *= B.lead.most / length;
      }
      x = p.pos.x + lx;
      z = p.pos.z + lz;
    }
  }
  const out = Math.hypot(x, z), most = ARENA.radius - B.lead.inside;
  if (out > most) {
    x *= most / out;
    z *= most / out;
  }
  return { x, z };
}

/** Where hero `p` will be `t` s on as she reads him (his way and its turn), `lead.most` m on at the most, inside
 *  the arena: her phase 2 eruption's spot, led as her branches are (aimed where he stood as it began, a runner was
 *  always gone, and half her attacks in that phase landed nothing on him). */
export function aheadOf(p: Player, t: number): { x: number; z: number } {
  const way = wayOver(p, t);
  const length = Math.hypot(way.x, way.z), k = length > B.lead.most ? B.lead.most / length : 1;
  let x = p.pos.x + way.x * k, z = p.pos.z + way.z * k;
  const out = Math.hypot(x, z), most = ARENA.radius - B.lead.inside;
  if (out > most) {
    x *= most / out;
    z *= most / out;
  }
  return { x, z };
}

/** A branch let go from her hand at (tx, tz), landing `late` s after its flight, for hero `p` (its aim kept). */
function letGo(e: Enemy, name: Throw, p: Player, from: THREE.Vector3, to: { x: number; z: number }, share: number,
  hurt: number, splash: number, stay: number, late = 0, led = to): void {
  const flight = branchFlight(Math.hypot(to.x - from.x, to.z - from.z)) + late;
  const pace = paceOf(p);
  AIMS.push({ at: G.time, name, hero: { x: p.pos.x, z: p.pos.z }, pace, share, led, to, flight });
  if (AIMS.length > 32) AIMS.shift();
  fx('branch', e.id, from.x, from.y, from.z, to.x, to.z, flight, e.damage, hurt * phaseHurt(e), splash, stay);
}

/** Her branches' hurt in her phase now. */
const phaseHurt = (e: Enemy): number => B.phaseHurt[Math.min(2, e.bossPhase)];

/** Where simulated, as her arm comes over: throw `name`'s branches at hero `p` (all but her rain, `rainOne`). */
export function hurl(e: Enemy, name: Throw, p: Player): void {
  if (!e.alive || !p.active) return;
  const from = releaseFrom(e, new THREE.Vector3());
  if (name === 'branch') {
    letGo(e, name, p, from, ledAt(p, from, 1), 1, B.hurt, B.splash, 0);
    return;
  }
  if (name === 'pair') {
    // (where he stands first, then where he'll be: one who keeps on is in the second's ring, one who stops the first's)
    const here = ledAt(p, from, 0);
    let there = ledAt(p, from, 1, B.pair.later);
    if (Math.hypot(there.x - here.x, there.z - here.z) < B.splash * 2 + p.radius) {
      // (he stands about still: the second beside the first across her line to him, so no one is in both)
      const ax = here.x - e.pos.x, az = here.z - e.pos.z, d = Math.max(1, Math.hypot(ax, az));
      there = { x: here.x + (az / d) * B.apart * 1.4, z: here.z - (ax / d) * B.apart * 1.4 };
    }
    letGo(e, name, p, from, here, 0, B.pair.hurt, B.splash, 0);
    letGo(e, name, p, from, there, 1, B.pair.hurt, B.splash, 0, B.pair.later);
    return;
  }
  // (a fan's three and a line's five across her line to where its middle is aimed)
  const n = THROWS[name], share = name === 'fan' ? 1 : 0.5;
  const middle = ledAt(p, from, share);
  const ax = middle.x - e.pos.x, az = middle.z - e.pos.z, d = Math.max(1, Math.hypot(ax, az));
  const cx = az / d, cz = -ax / d;
  const apart = name === 'volley' ? B.lineApart : B.apart;
  const hurt = name === 'fan' ? B.fanHurt : B.lineHurt;
  const stay = name === 'volley' ? B.bramble : 0;
  for (let i = 0; i < n; i++) {
    const across = (i - (n - 1) / 2) * apart;
    // (a line's branches land one after another from its near end, a fan's a breath apart)
    const late = name === 'volley' ? i * B.lineEvery : Math.abs(across) / apart * 0.1;
    const to = { x: middle.x + cx * across, z: middle.z + cz * across };
    letGo(e, name, p, from, to, share, hurt, B.smallSplash, stay, late, middle);
  }
}

/** Where simulated: her rain's `i`th branch, aimed as it leaves her hand at the far hero whose turn it is (`at`), led
 *  by its share of `rain.aims`. */
export function rainOne(e: Enemy, i: number, at: () => Player | null): void {
  const p = at();
  if (!e.alive || !p?.active) return;
  fx('branchTorn', e.id, 1);
  const from = releaseFrom(e, new THREE.Vector3());
  const share = B.rain.aims[i % B.rain.aims.length];
  letGo(e, 'rain', p, from, ledAt(p, from, share), share, B.rain.hurt, B.smallSplash, 0);
}

/** Where simulated: her rain's throws after its first, each `rain.every` s on, as shares of its action. */
export function rainLater(e: Enemy, warn: number, at: (i: number) => Player | null): [number, () => void][] {
  const length = warn + (e.def.bossKit!.attacks!.rain.recover ?? 0);
  return Array.from({ length: B.rain.count - 1 }, (_, k) => {
    const i = k + 1;
    return [(warn + i * B.rain.every) / length, () => rainOne(e, i, () => at(i))] as [number, () => void];
  });
}
