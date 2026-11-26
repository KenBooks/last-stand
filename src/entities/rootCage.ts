// The Rootmother's root cage (from Kenneth: "Roots burst up in a ring round you after a short warning. Dash out before
// it closes, or cut a root to escape. While you're caged, she winds up a big hit. It punishes standing still."). Her
// numbers are `ROOTMOTHER.cage`, its pooled meshes models/rootCage.ts.
//
// - Where simulated: a hero who has stood within `still.radius` m for `still.time` s is caged, every `every` s at most,
//   one cage at a time. Her palms go to the earth (`cage` warning) and it cracks in a ring round where he stands
//   (`cageWarn` fx), fixed as it's cast: walking or dashing out before it shuts dodges it whole.
// - As it shuts (`cageShut` fx, every game): roots burst up along the ring and arch over it, a cage he can see
//   through. Each root is a prop raised in the fight (`raiseProp`): paths and bodies keep off it, so he can't walk out,
//   but he can attack, cast and block inside it, and shots meet the roots. A root breaks in `hits` of a prop's hits (an
//   arrow or a swing 1, Bull Rush 3, a nova 4) and its gap lets him out; a partner outside can cut him free; Veilstep
//   passes through. Its life is the host's, told to every game by where it stands (`cageRoot` fx). It withers after
//   `life` s, or as she dies.
// - Her blow (`crush`): as it shuts she raises her arms and a great root rises out of the earth beside the cage on her
//   side, leaning back, then falls across it as its warning ends (`crushRise` fx, then `crush` fx as it lands): each
//   game's hero within the ring hurt hard, a shield raised towards her blocking what it blocks of any blow. It lands on the cage's place
//   alone: a hero who got out is safe. No other hit of hers lands within `gap` s of its shut or its blow (`claimBeat`),
//   and no branch is thrown at a hero it holds (`caged`).
import * as THREE from 'three';
import { G } from '../state';
import { ROOTMOTHER } from '../data/foes/rootmother';
import { hurtPlayer } from '../combat/damage';
import { addEffect, crackDecal, decal } from '../fx/effects';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { rootSounds } from '../core/sounds/rootmother';
import { schedule } from '../core/timers';
import { groundHeight } from '../world/ground';
import { lowerProp, meshLook, raiseProp, setPropLife, type Prop } from '../world/destructible';
import { claimBeat, telegraphed, telegraphTime } from './bossKit';
import { fx } from './enemyAI';
import { GREAT_LENGTH, placePooled, putAway, type CagePool } from './models/rootCage';
import type { Enemy } from './enemy';
import type { Player } from './player';

const C = ROOTMOTHER.cage;
/** the cracks' warm amber (her eruptions' warning), and her roots' earth */
const AMBER = 0xff9a38, EARTH = 0x2a2418;
/** how far a cage's root leans out as it bursts up, before it arches over (rad), how deep under the floor it starts
 *  (a share of its height), and how long it takes to sink away (s) */
const ROOT = { lean: 0.95, under: 0.9, sink: 0.45 };
/** the great root: how far back it leans as it winds up (rad), how long it takes to rise out of the earth and to fall
 *  across the cage (s: the fall ends as its warning does), how long it lies there and sinks away (s) */
const GREAT = { back: 0.42, rise: 0.8, fall: 0.32, lies: 0.6, sink: 0.6 };

const foeOf = (id: number): Enemy | null => G.enemies.find((e) => e.id === id) ?? null;
const ease = (k: number): number => k * k * (3 - 2 * k);
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// --- where the fight is simulated ---------------------------------------------------------------------------

/** Where each hero has stood since when (by his slot): he stands still while he keeps within `still.radius` of it. */
const STILL = new Map<number, { x: number; z: number; since: number }>();

/** Where simulated, every frame: each hero's standing watched, her cage's wait counted down. A hero `held` (her vine
 *  holds him, as the host has it) or rooted, stunned or seized isn't standing still by choice: his clock starts again
 *  while he's held, so her cage never warns at a hero who can't walk out of it (with her quicker tempo it came while
 *  her vine held him). */
export function tickCage(e: Enemy, dt: number, held: (p: Player) => boolean): void {
  e.brain.cageT = (e.brain.cageT ?? C.first) - dt;
  for (const p of G.players) {
    const s = STILL.get(p.slot);
    if (!p.active) STILL.delete(p.slot);
    else if (!s || Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > C.still.radius || held(p) || p.rooted) {
      STILL.set(p.slot, { x: p.pos.x, z: p.pos.z, since: G.time });
    }
  }
}

/** A hero who has stood still `still.time` s and isn't caged, or null. */
function standingStill(): Player | null {
  for (const p of G.players) {
    const s = STILL.get(p.slot);
    if (p.active && s && G.time - s.since >= C.still.time && !caged(p)) return p;
  }
  return null;
}

/** Where simulated: her cage begun at a hero standing still, if its wait is out, none stands and nothing else of hers
 *  lands near its shut or its blow (`claimBeat`, taken as it begins). True as it begins. */
export function cageDue(e: Enemy): boolean {
  if ((e.brain.cageT ?? 0) > 0 || CAGE) return false;
  const p = standingStill();
  if (!p) return false;
  const kit = e.def.bossKit!.attacks!, warn = kit.cage.warn;
  if (!claimBeat(warn, C.gap, kit.crush.warn + 0.4)) return false;
  const x = p.pos.x, z = p.pos.z;
  e.faceTo(x, z);
  fx('cageWarn', e.id, x, z, warn);
  telegraphed(e, 'cage', () => shut(e, x, z));
  rootSounds.groan(warn * 0.8);
  e.cd = telegraphTime(e, 'cage');
  e.brain.cageT = C.every;
  STILL.delete(p.slot);
  return true;
}

/** Where simulated, as its warning ends: the cage shut on every game, and her blow begun (the great root rising on her
 *  side of it, `rise` m off its edge). */
function shut(e: Enemy, x: number, z: number): void {
  if (!e.alive) return;
  fx('cageShut', e.id, x, z, e.damage);
  const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.max(0.1, Math.hypot(dx, dz));
  const bx = x + (dx / d) * (C.radius + C.rise), bz = z + (dz / d) * (C.radius + C.rise);
  // (begun as its own action once the cage's is done with this frame)
  schedule(0, () => {
    if (!e.alive || e.dazed > 0) return;
    const warn = e.def.bossKit!.attacks!.crush.warn;
    fx('crushRise', e.id, x, z, bx, bz, warn);
    telegraphed(e, 'crush', () => fx('crush', e.id, x, z, bx, bz, e.damage));
    e.cd = telegraphTime(e, 'crush');
  });
}

/** Whether hero `p` stands in the cage shut on this game. */
export function caged(p: Player): boolean {
  return !!CAGE && CAGE.shut && Math.hypot(p.pos.x - CAGE.x, p.pos.z - CAGE.z) < C.radius;
}

// --- what every game plays (enemyAI's fx) -------------------------------------------------------------------

/** One root of a cage: its mesh, where its foot stands and which way it faces in, the prop it is, and how it goes. */
interface CageRoot { mesh: THREE.Mesh; x: number; z: number; yaw: number; prop: Prop | null; broken: number }

/** The cage on this game: where it stands, when it was warned of and shut, its roots, and whether it has gone. */
export interface Cage { x: number; z: number; warnedAt: number; shutAt: number; shut: boolean; roots: CageRoot[]; gone: boolean }
/** the cage on this game, if one stands or is warned of */
export let CAGE: Cage | null = null;

/** What the lab reads of each cage this game played: when it was warned of and shut, when its blow came down and
 *  what it did to this game's hero (hurt for how much, a shield's), and when it withered. */
export interface CageLog { x: number; z: number; warnedAt: number; shutAt: number; blowAt: number; hurt: number; blocked: boolean; endedAt: number }
export const CAGE_LOG: CageLog[] = [];
const logNow = (): CageLog | undefined => CAGE_LOG[CAGE_LOG.length - 1];

/** The earth cracking in a ring at (x, z) for `warn` s before a cage shuts there (`cageWarn` fx): cracks round the
 *  ring, earth and dust thrown up along it, a rumble. Soft: no hard ring on the floor. */
export function cageWarnAt(_id: number, x: number, z: number, warn: number): void {
  CAGE = { x, z, warnedAt: G.time, shutAt: -1, shut: false, roots: [], gone: false };
  CAGE_LOG.push({ x, z, warnedAt: G.time, shutAt: -1, blowAt: -1, hurt: 0, blocked: false, endedAt: -1 });
  if (CAGE_LOG.length > 8) CAGE_LOG.shift();
  for (let i = 0; i < C.roots; i++) {
    const a = (i / C.roots) * Math.PI * 2;
    crackDecal({ x: x + Math.sin(a) * C.radius, z: z + Math.cos(a) * C.radius },
      { size: 1.2, color: AMBER, intensity: 1.1, life: warn + 0.5 });
  }
  rootSounds.crack(warn);
  let t = 0, next = 0;
  addEffect({
    update(dt) {
      t += dt;
      if (t >= next) {
        next += 0.12;
        const a = Math.random() * Math.PI * 2, r = C.radius * (0.9 + Math.random() * 0.2);
        const at = new THREE.Vector3(x + Math.sin(a) * r, 0, z + Math.cos(a) * r);
        at.y = groundHeight(at.x, at.z);
        debris(at, { count: 2, speed: 1.4, size: 0.1, life: 0.6 });
        smokePuff(at, { count: 1, color: EARTH, alpha: 0.35, size: 0.5, sizeEnd: 1.2, speed: 0.4, life: 0.8 });
      }
      return t < warn;
    },
  });
}

/** The cage shut at (x, z) (`cageShut` fx): its roots burst up along the ring and arch over, each a prop he can't walk
 *  through, breaking in `hits`; withering after `life` s or as she dies. */
export function cageShutAt(id: number, x: number, z: number, _damage: number): void {
  const foe = foeOf(id), pool = foe?.model.root.userData.cage as CagePool | undefined;
  if (!pool) return;
  if (!CAGE || CAGE.shut) CAGE = { x, z, warnedAt: G.time, shutAt: -1, shut: false, roots: [], gone: false };
  const cage = CAGE;
  cage.shut = true;
  cage.shutAt = G.time;
  const log = logNow();
  if (log) log.shutAt = G.time;
  cage.roots = pool.roots.map((mesh, i) => {
    const a = (i / C.roots) * Math.PI * 2;
    return { mesh, x: x + Math.sin(a) * C.radius, z: z + Math.cos(a) * C.radius, yaw: a - Math.PI / 2, prop: null, broken: -1 };
  });
  for (const root of cage.roots) root.prop = raiseRoot(cage, root);
  const at = new THREE.Vector3(x, groundHeight(x, z), z);
  for (const root of cage.roots) {
    const foot = new THREE.Vector3(root.x, groundHeight(root.x, root.z), root.z);
    debris(foot, { count: 6, speed: 4, size: 0.16 });
    smokePuff(foot, { count: 1, color: EARTH, alpha: 0.4, size: 0.8, sizeEnd: 2, speed: 1, life: 1 });
  }
  burst(at.clone().setY(at.y + 0.3), { count: 12, color: 0x9aff40, colorEnd: 0x2a6a10, speed: 3, up: 3, life: 0.6, size: 0.14 });
  rootSounds.roots();
  addShake(0.35);
  let t = 0;
  addEffect({
    update(dt) {
      t += dt;
      const withering = !foe?.alive || t >= C.life;
      if (withering && !cage.gone) wither(cage);
      let showing = false;
      for (const root of cage.roots) showing = poseRoot(root, t, cage) || showing;
      if (cage.gone && !showing) {
        if (CAGE === cage) CAGE = null;
        return false;
      }
      return true;
    },
    dispose() {
      wither(cage);
      for (const root of cage.roots) putAway(root.mesh);
      if (CAGE === cage) CAGE = null;
    },
  });
}

/** Root `root` of `cage` raised as a prop at its foot: paths and bodies keep off it, shots meet it, `hits` break it
 *  (its life told to every game by where it stands). */
function raiseRoot(cage: Cage, root: CageRoot): Prop {
  const look = meshLook(root.mesh);
  const prop = raiseProp([{ x: root.x, z: root.z, r: C.rootR, h: C.rootH }], C.hits, 0x4a3a2a, {
    ...look,
    // (broken: it sinks away, its gap his way out)
    hide: () => { if (root.broken < 0) root.broken = G.time - cage.shutAt; },
  }, 'wood', (life) => fx('cageRoot', root.x, root.z, life));
  return prop;
}

/** `cage` withering: every root still standing let go (its prop lowered) and sinking away. */
function wither(cage: Cage): void {
  if (cage.gone) return;
  cage.gone = true;
  const log = logNow();
  if (log && log.endedAt < 0) log.endedAt = G.time;
  const t = G.time - cage.shutAt;
  for (const root of cage.roots) {
    if (root.prop && !root.prop.broken) lowerProp(root.prop);
    if (root.broken < 0) root.broken = t;
  }
}

const _q = new THREE.Quaternion(), _lean = new THREE.Quaternion(), _at = new THREE.Vector3();

/** Root `root` posed `t` s after its cage shut: up out of the earth leaning out, arched over to close, held, and once
 *  broken or withered sunk away. False once it's gone (put away). */
function poseRoot(root: CageRoot, t: number, cage: Cage): boolean {
  const H = C.rootH;
  let rise = ease(Math.min(1, t / C.burst));
  const close = ease(Math.min(1, Math.max(0, (t - C.burst) / C.close)));
  if (root.broken >= 0) {
    const k = Math.min(1, (t - root.broken) / ROOT.sink);
    if (k >= 1) { putAway(root.mesh); return false; }
    rise *= 1 - k;
  }
  // (a slow creak once shut: well under a beat a second)
  const creak = cage.shut ? Math.sin(t * 1.3 + root.yaw * 3) * 0.02 * close : 0;
  _at.set(root.x, groundHeight(root.x, root.z) - H * ROOT.under * (1 - rise), root.z);
  _q.setFromAxisAngle(UP, root.yaw);
  _lean.setFromAxisAngle(Z, -ROOT.lean * (1 - close) + creak);
  placePooled(root.mesh, _at, _q.multiply(_lean), 1);
  return true;
}

/** Her great root rising beside the cage at (x, z) from its foot at (bx, bz) over `warn` s (`crushRise` fx): out of
 *  the earth, leaning back as she winds up, swaying slowly, then falling across the cage as the warning ends, a heavy
 *  fall gathering speed; lying there a moment, then sinking away. */
export function crushRiseAt(id: number, x: number, z: number, bx: number, bz: number, warn: number): void {
  const foe = foeOf(id), pool = foe?.model.root.userData.cage as CagePool | undefined;
  if (!pool) return;
  const great = pool.great;
  const dir = new THREE.Vector3(x - bx, 0, z - bz).normalize();
  const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
  const foot = new THREE.Vector3(bx, groundHeight(bx, bz), bz);
  debris(foot, { count: 14, speed: 4, size: 0.2 });
  smokePuff(foot, { count: 4, color: EARTH, alpha: 0.45, size: 1, sizeEnd: 2.6, speed: 1.2, life: 1.4 });
  rootSounds.creak(warn);
  const fallFrom = warn - GREAT.fall;
  let t = 0;
  addEffect({
    update(dt) {
      t += dt;
      if (!foe?.alive && t < warn) { putAway(great); return false; }
      const up = ease(Math.min(1, t / GREAT.rise));
      const wind = ease(Math.min(1, t / fallFrom));
      // (its fall: gathering speed as a falling trunk does, flat across the cage as the warning ends)
      const f = Math.min(1, Math.max(0, (t - fallFrom) / GREAT.fall));
      let lean = -GREAT.back * wind * (1 - f) + (Math.PI / 2) * f * f;
      lean += t < fallFrom ? Math.sin(t * 1.1) * 0.03 : 0;
      const sink = t > warn + GREAT.lies ? Math.min(1, (t - warn - GREAT.lies) / GREAT.sink) : 0;
      _at.copy(foot).setY(foot.y - GREAT_LENGTH * (1 - up) * 0.9 - 0.8 * sink);
      _q.setFromAxisAngle(axis, lean);
      placePooled(great, _at, _q, 1 - sink * 0.3);
      if (sink >= 1) { putAway(great); return false; }
      return true;
    },
    dispose() { putAway(great); },
  });
}

/** Her great root landing across the cage at (x, z) (`crush` fx): earth and splinters along it, one soft light, a
 *  quake; this game's hero within the ring (and `blow.reach`) hurt `blow.hurt` of her damage and knocked off, from the
 *  great root's foot (bx, bz), so a shield raised towards her blocks it as it blocks any blow. */
export function crushAt(id: number, x: number, z: number, bx: number, bz: number, damage: number): void {
  const foe = foeOf(id), w = C.blow;
  const log = logNow();
  if (log) log.blowAt = G.time;
  for (let k = 0; k <= 6; k++) {
    const s = k / 6, px = bx + (x - bx) * s * 1.6, pz = bz + (z - bz) * s * 1.6;
    const at = new THREE.Vector3(px, groundHeight(px, pz), pz);
    debris(at, { count: 6, speed: 5, size: 0.2 });
    smokePuff(at, { count: 2, color: EARTH, alpha: 0.5, size: 1.1, sizeEnd: 2.8, speed: 1.6, life: 1.3 });
  }
  decal({ x, z }, { size: C.radius * 2.2, life: 6 });
  // (one light, soft: nothing large flashes faster than about 1.5 times a second)
  flash({ color: AMBER, intensity: 10, distance: 9, life: 0.6, pos: { x, y: 1.2, z } });
  addShake(0.8);
  rootSounds.slam();
  const p = G.player;
  if (!p.active) return;
  const rx = p.pos.x - x, rz = p.pos.z - z, d = Math.hypot(rx, rz);
  if (d > C.radius + w.reach) return;
  const blocked = p.shieldRaised;
  const from = new THREE.Vector3(bx, 0, bz);
  const hurt = hurtPlayer(p, damage * w.hurt, 'physical', from, { foe, attack: 'crush' });
  if (log) {
    log.hurt = hurt;
    log.blocked = blocked;
  }
  const out = d > 0.1 ? 1 / d : 0;
  p.knock.set(rx * out * w.knock, 0, rz * out * w.knock);
}

/** A root's life as the fight's owner deals it (`cageRoot` fx), found by where its foot stands: a guest's copy. */
export function cageRootAt(x: number, z: number, life: number): void {
  const root = CAGE?.roots.find((r) => Math.hypot(r.x - x, r.z - z) < 0.2);
  if (root?.prop && !root.prop.broken) setPropLife(root.prop, life);
}
