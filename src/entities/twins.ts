// The Ossuary Twins (the Crypt's special boss wave, data/biomes.ts `bossWaves`; data/enemies.ts `twinslab` and
// `twinreliquary`, their numbers `TWINS`): two tall figures of stacked bone and grave cloth, linked by a glowing chain
// of bone, sharing one life (the toolkit's shared life: `shareHit`, `partnerOf` in entities/bossKit.ts). Their models
// are models/twins.ts.
//
// - **Slab**, broad, a tombstone for a weapon: the grave slam (the slab lifted a second, a ring before him, then brought
//   down) and a short shoulder charge at the nearest hero (its line ringed first, each game judging its own hero as the
//   charge passes, enemyAI's `twinCharge` fx).
// - **Reliquary**, thin, a casket of floating skulls: a volley of 3 to 5 skulls curving in on a hero (`skullVolley` fx,
//   each an arc ending where he stood), and, once Slab has stood hurt and unhit for `mend.untouched` s, a mend of the
//   pair's life over a channel a stun or a freeze breaks (`mend`, its hit at the channel's end).
// - **The chain**: past `chain.max` m apart it snaps tight, dragging both back together and hurting any hero within
//   `chain.reach` of its line (`chainSnap` fx): never stand between them.
// - **At half** the one that took more of the hits collapses (`twinFall` fx: no spoils from it) and the other takes its
//   power: faster, casting sooner, and gaining its brother's signature attack (Slab the volley, Reliquary the slam).
//   Wearing both down evenly leaves the stronger of them, Slab or the caster, no stronger than the other.
// Their warned hits never land together (`claimBeat`).
import * as THREE from 'three';
import { G } from '../state';
import { TWINS } from '../data/foes/twins';
import { DAMAGE_TYPES, hurtPlayer } from '../combat/damage';
import { spawnProjectile } from '../combat/projectiles';
import { burst, col, particles, smokePuff } from '../fx/particles';
import { groundFlash, shockwave } from '../fx/effects';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { twinSounds } from '../core/sounds/twins';
import { schedule } from '../core/timers';
import { claimBeat, partnerOf, telegraphShare, telegraphTime, telegraphed } from './bossKit';
import { bossHooks } from './bossHooks';
import { fx, seek } from './enemyAI';
import type { Enemy } from './enemy';
import type { Player } from './player';

const T = TWINS;
/** the chain's light, bone lit gold from within; Slab's slam's and charge's ember; Reliquary's skulls' cold light */
export const CHAIN_LIGHT = 0xffd890;
const EMBER = 0xffb060, COLD = 0x8fe8ff;
/** the skulls' flight height (m) */
const SKULL_Y = 1.3;

const slabOf = (e: Enemy): boolean => e.type === 'twinslab';
/** the one left standing at half: faster, casting sooner, with its brother's attack too */
const alone = (e: Enemy): boolean => e.bossPhase >= 1 || !partnerOf(e);

/** Each twin's behaviour, where the fight is simulated. */
export function twinsAI(e: Enemy): void {
  const a = e.action;
  if (a) { if (a.name === 'charge') chargeStep(e); return; }
  const p = e.target!;
  e.faceTo(p.pos.x, p.pos.z);
  const { dx, dz, dist } = e.toPlayer();
  const lone = alone(e), pace = 1;
  if (e.cd <= 0 && (slabOf(e) ? slabAttack(e, dist, lone) : reliquaryAttack(e, dist, lone))) return;
  const partner = partnerOf(e);
  // (the chain held slack: back toward a brother drifting out of its reach)
  if (partner) {
    const bx = partner.pos.x - e.pos.x, bz = partner.pos.z - e.pos.z, apart = Math.hypot(bx, bz);
    if (apart > T.chain.max - 3) { seek(e, bx, bz, apart, pace); return; }
  }
  if (slabOf(e)) { if (dist > T.slam.ahead + 1) seek(e, dx, dz, dist, pace); return; }
  // (Reliquary keeps its distance, 9 to 13 m)
  if (dist > 13) seek(e, dx, dz, dist, pace);
  else if (dist < 9) seek(e, -dx, -dz, dist, pace * 0.7);
}

/** A warned attack `name` begun if its hit has its turn in the fight (`claimBeat`), its cooldown set after it. */
function begin(e: Enemy, name: string, every: number): number | null {
  const hitIn = telegraphTime(e, name) * telegraphShare(e, name)!;
  if (!claimBeat(hitIn, T.beat)) { e.cd = 0.25; return null; }
  e.cd = every * (alone(e) ? T.alone.sooner : 1);
  return hitIn;
}

function slabAttack(e: Enemy, dist: number, lone: boolean): boolean {
  if (dist < T.slam.ahead + T.slam.radius) return slam(e);
  e.brain.chargeT ??= 0;
  if (dist < T.charge.reach + 1 && G.time >= e.brain.chargeT) {
    if (begin(e, 'charge', e.def.cooldown * 0.8) === null) return true;
    e.brain.chargeT = G.time + 7;
    charge(e);
    return true;
  }
  // (alone, his brother's skulls at a hero out of reach)
  if (lone && dist > 7) return volley(e);
  return false;
}

function reliquaryAttack(e: Enemy, dist: number, lone: boolean): boolean {
  const slab = partnerOf(e);
  // (Slab's unhit time counted from the first look that finds the pair hurt, if no hit on him came first)
  if (slab && !lone && slab.life < slab.maxLife * 0.98 && G.time - (slab.brain.hitAt ??= G.time) >= T.mend.untouched) return mend(e, slab);
  // (alone, his brother's slab brought down on a hero who comes close)
  if (lone && dist < T.slam.ahead + T.slam.radius) return slam(e);
  if (dist < 22) return volley(e);
  return false;
}

/** The grave slam: a ring `slam.ahead` m before it for the warning (the slab held up a second), then down. */
function slam(e: Enemy): boolean {
  if (begin(e, 'slam', e.def.cooldown) === null) return true;
  const x = e.pos.x + Math.sin(e.facing) * T.slam.ahead, z = e.pos.z + Math.cos(e.facing) * T.slam.ahead;
  // (Reliquary's slam, its brother's power taken up at half: his own damage is lighter, so raised to near Slab's)
  const damage = e.damage * (slabOf(e) ? 1 : 1.2);
  telegraphed(e, 'slam', () => {
    fx('slam', x, z, T.slam.radius, EMBER, 1, damage, DAMAGE_TYPES.indexOf('physical'), e.id);
  }, { x, z, radius: T.slam.radius, color: EMBER });
  return true;
}

/** The shoulder charge: its line ringed for the warning, then a rush along it (`chargeStep`), each game judging its
 *  own hero as the charge passes him. */
function charge(e: Enemy): void {
  const p = e.target!, ox = e.pos.x, oz = e.pos.z;
  const way = Math.atan2(p.pos.x - ox, p.pos.z - oz), reach = Math.min(T.charge.reach, Math.hypot(p.pos.x - ox, p.pos.z - oz) + 2);
  const tx = ox + Math.sin(way) * reach, tz = oz + Math.cos(way) * reach, warn = e.def.bossKit!.attacks!.charge.warn;
  for (let i = 1; i <= 3; i++) fx('tele', e.id, ox + Math.sin(way) * reach * i / 3, oz + Math.cos(way) * reach * i / 3, T.charge.width, warn, EMBER);
  e.brain.cx = tx; e.brain.cz = tz; e.facing = e.targetFacing = way;
  telegraphed(e, 'charge', () => fx('twinCharge', e.id, ox, oz, tx, tz, e.damage * T.charge.hurt));
}

/** Where simulated, through the charge's rush: on along its line at the charge's speed until it's there. */
function chargeStep(e: Enemy): void {
  const a = e.action!, warn = e.def.bossKit!.attacks!.charge.warn;
  if (a.t < warn) return;
  const dx = e.brain.cx - e.pos.x, dz = e.brain.cz - e.pos.z, left = Math.hypot(dx, dz);
  if (left < 0.6) return;
  e.desired.set((dx / left) * T.charge.speed, 0, (dz / left) * T.charge.speed);
  e.targetFacing = Math.atan2(dx, dz);
}

/** A volley of skulls at its target: 3 to 5 (5 alone), each on an arc of its own ending where the hero stood. */
function volley(e: Enemy): boolean {
  if (begin(e, 'volley', e.def.cooldown) === null) return true;
  const n = alone(e) ? T.volley.most : T.volley.least + Math.floor(Math.random() * (T.volley.most - T.volley.least + 1));
  telegraphed(e, 'volley', () => {
    const p = e.target;
    if (!p) return;
    const tx = p.pos.x + p.vel.x * 0.3, tz = p.pos.z + p.vel.z * 0.3;
    fx('skullVolley', e.id, e.pos.x, e.pos.z, tx, tz, n, e.damage * (slabOf(e) ? 0.6 : 1));
  });
  return true;
}

/** Reliquary mending the pair's life through a channel (its hit at the channel's end): a stun or a freeze breaks it. */
function mend(e: Enemy, slab: Enemy): boolean {
  const warn = e.def.bossKit!.attacks!.mend.warn;
  if (begin(e, 'mend', e.def.cooldown * 1.6) === null) return true;
  fx('twinMend', e.id, slab.id, warn);
  telegraphed(e, 'mend', () => {
    const s = partnerOf(e);
    if (!s) return;
    const life = Math.min(e.maxLife, e.life + e.maxLife * T.mend.heal);
    e.life = s.life = life;
    // (a fresh wait before the next: Slab must stand unhit again)
    s.brain.hitAt = G.time;
    fx('twinMended', e.id, s.id);
  });
  return true;
}

// --- what every game plays (enemyAI's fx) ---------------------------------------------------------

const foeOf = (id: number): Enemy | null => G.enemies.find((x) => x.id === id) ?? null;
/** this game's hero, if he can be hit on the ground */
const grounded = (): Player | null => (G.player.active && !G.player.airborne ? G.player : null);

/** Slab's shoulder charge from (ox, oz) to (tx, tz) (`twinCharge` fx): this game's hero hurt once if the charge's front
 *  passes within its width of him as it runs. */
export function chargeRan(id: number, ox: number, oz: number, tx: number, tz: number, damage: number): void {
  const len = Math.hypot(tx - ox, tz - oz), dur = len / T.charge.speed, ux = (tx - ox) / len, uz = (tz - oz) / len;
  let hit = false;
  const steps = Math.ceil(dur / 0.04);
  for (let i = 0; i <= steps; i++) {
    schedule((i / steps) * dur, () => {
      const at = (i / steps) * len, x = ox + ux * at, z = oz + uz * at;
      if (i % 3 === 0) smokePuff({ x, y: 0, z }, { count: 3, color: 0x2a241c, alpha: 0.35, size: 0.8, sizeEnd: 2, speed: 1.4, life: 0.7 });
      const p = grounded();
      if (hit || !p || Math.hypot(p.pos.x - x, p.pos.z - z) > T.charge.width / 2 + p.radius + 0.4) return;
      hit = true;
      hurtPlayer(p, damage, 'physical', new THREE.Vector3(x, 0, z), { foe: foeOf(id), attack: 'charge' });
      burst(p.pos, { count: 14, color: EMBER, speed: 5, life: 0.4, size: 0.25 });
      addShake(0.35);
    });
  }
  sfx.slam();
  addShake(0.25);
}

/** A volley of `n` skulls from (ox, oz) at (tx, tz) (`skullVolley` fx): each leaves swung out to its side and curves
 *  in on a circle's arc that ends where the hero stood, the same arcs on every game, each game's hero hurt by any that
 *  meets him. */
export function skullsLoosed(id: number, ox: number, oz: number, tx: number, tz: number, n: number, damage: number): void {
  const foe = foeOf(id), v = T.volley;
  const base = Math.atan2(tx - ox, tz - oz), d = Math.max(3, Math.hypot(tx - ox, tz - oz));
  for (let i = 0; i < n; i++) {
    // (swung out evenly either side: the middle one straight)
    const swing = n > 1 ? v.swing * (i / (n - 1) * 2 - 1) : 0;
    // (an arc leaving at `swing` off the line meets its end having turned twice that: its length d * swing / sin swing)
    const len = Math.abs(swing) > 1e-3 ? (d * swing) / Math.sin(swing) : d;
    const turn = (2 * swing * v.speed) / len;
    let heading = base + swing;
    const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    spawnProjectile({
      pos: new THREE.Vector3(ox + dir.x * 1.2, SKULL_Y, oz + dir.z * 1.2), dir, speed: v.speed, radius: v.radius, life: len / v.speed + 0.8,
      hostile: true, color: COLD, size: v.radius * 0.8, intensity: 3.2, glow: 2,
      trail: { color: COLD, colorEnd: 0x10283a, intensity: 1.1, size: v.radius * 1.6, rate: 50, life: 0.45 },
      // (turned on its arc until it has turned its whole, then straight on)
      tick: (p, dt) => {
        if (p.life < 0.8) return;
        heading -= turn * dt;
        p.vel.set(Math.sin(heading) * v.speed, 0, Math.cos(heading) * v.speed);
        p.pos.y = SKULL_Y;
      },
      onHit: (target, proj) => {
        hurtPlayer(target as Player, damage, 'vitality', proj.pos, { foe, attack: 'skull' });
        burst(proj.pos, { count: 14, color: COLD, speed: 4, life: 0.4, size: 0.28 });
      },
    });
  }
  twinSounds.skulls();
}

/** The chain snapping tight between (ax, az) and (bx, bz) (`chainSnap` fx): this game's hero hurt if he stands within its
 *  reach of the line between them; light and bone dust down its length. */
export function chainSnapped(id: number, ax: number, az: number, bx: number, bz: number, damage: number): void {
  const p = grounded(), lx = bx - ax, lz = bz - az, len2 = lx * lx + lz * lz || 1;
  if (p) {
    const k = Math.max(0, Math.min(1, ((p.pos.x - ax) * lx + (p.pos.z - az) * lz) / len2));
    const cx = ax + lx * k, cz = az + lz * k;
    if (Math.hypot(p.pos.x - cx, p.pos.z - cz) < T.chain.reach + p.radius) {
      hurtPlayer(p, damage, 'physical', new THREE.Vector3(cx, 0, cz), { foe: foeOf(id), attack: 'chain' });
      burst(p.pos, { count: 12, color: CHAIN_LIGHT, speed: 5, life: 0.4, size: 0.25 });
    }
  }
  const len = Math.sqrt(len2), n = Math.ceil(len / 1.2);
  for (let i = 0; i <= n; i++) {
    const x = ax + (lx * i) / n, z = az + (lz * i) / n;
    burst(new THREE.Vector3(x, 1.6, z), { count: 3, color: CHAIN_LIGHT, speed: 2.5, life: 0.45, size: 0.2 });
  }
  groundFlash({ x: (ax + bx) / 2, z: (az + bz) / 2 }, { color: CHAIN_LIGHT, intensity: 1, radius: len * 0.4, life: 0.4 });
  flash({ color: CHAIN_LIGHT, intensity: 10, distance: len, life: 0.45, pos: { x: (ax + bx) / 2, y: 1.8, z: (az + bz) / 2 } });
  addShake(0.3);
  twinSounds.chain();
}

/** Reliquary's mend begun (`twinMend` fx): its murmur over the channel. Its motes are drawn by the frame hook. */
export function mendBegun(warn: number): void {
  twinSounds.mend(warn);
}

/** The mend done (`twinMended` fx): a wash of light over Slab. */
export function mendDone(id: number, slabId: number): void {
  const s = foeOf(slabId), r = foeOf(id);
  if (!s) return;
  shockwave(s.pos, { color: COLD, intensity: 1.4, from: 0.5, to: s.radius * 2.4, life: 0.6 });
  burst(new THREE.Vector3(s.pos.x, 2.5, s.pos.z), { count: 24, color: COLD, speed: 3, up: 3, life: 0.8, size: 0.25 });
  if (r) flash({ color: COLD, intensity: 8, distance: 8, life: 0.5, pos: { x: s.pos.x, y: 2, z: s.pos.z } });
}

/** One twin collapsing at half (`twinFall` fx): it falls, paying nothing; its brother's cue is its phase's. */
export function twinFell(id: number): void {
  const e = foeOf(id);
  if (!e || !e.alive) return;
  e.noSpoils = true;
  e.die();
  twinSounds.fall();
  addShake(0.6);
}

// --- each frame, and their phases (entities/bossKit.ts) -------------------------------------------

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** Each frame on every game, from Slab: the chain laid between them on his model (gone with either), and where
 *  simulated, its snap past its reach. */
function slabFrame(e: Enemy): void {
  const r = partnerOf(e), lay = e.model.root.userData.layChain as ((to: THREE.Vector3 | null, taut: number) => void) | undefined;
  // (the chain gone with him: his frame isn't run once he's fallen)
  if (!e.brain.chainLetGo) { e.brain.chainLetGo = 1; e.onDeath.push(() => lay?.(null, 0)); }
  if (!r || e.spawning > 0 || r.spawning > 0) { lay?.(null, 0); return; }
  const apart = Math.hypot(r.pos.x - e.pos.x, r.pos.z - e.pos.z);
  lay?.(_a.set(r.pos.x, 0, r.pos.z), Math.min(1, apart / T.chain.max));
  if (e.net || apart <= T.chain.max || G.time < (e.brain.snapT ?? 0)) return;
  e.brain.snapT = G.time + T.chain.every;
  fx('chainSnap', e.id, e.pos.x, e.pos.z, r.pos.x, r.pos.z, e.damage * T.chain.hurt);
  // (both dragged back together, a share of the way each: a knock's travel is a sixth of its speed)
  const pull = apart * T.chain.drag * 0.5 * 6, ux = (r.pos.x - e.pos.x) / apart, uz = (r.pos.z - e.pos.z) / apart;
  e.knock.x += ux * pull; e.knock.z += uz * pull;
  r.knock.x -= ux * pull; r.knock.z -= uz * pull;
}

/** Each frame on every game, from Reliquary: motes drawn from it to Slab over a mend, and where simulated, a mend broken
 *  by a freeze (a daze cancels it of itself). */
function reliquaryFrame(e: Enemy): void {
  if (e.action?.name !== 'mend') return;
  if (!e.net && e.frozen > 0) { e.cancelAction(); return; }
  const s = partnerOf(e);
  if (!s || Math.random() > 0.5) return;
  _a.set(e.pos.x, 3.2, e.pos.z); _b.set(s.pos.x, 2.6, s.pos.z);
  const k = Math.random();
  particles.glow.spawn({
    x: _a.x + (_b.x - _a.x) * k, y: _a.y + (_b.y - _a.y) * k + Math.sin(k * Math.PI) * 1.2, z: _a.z + (_b.z - _a.z) * k,
    vx: (_b.x - _a.x) * 0.3, vy: 0.3, vz: (_b.z - _a.z) * 0.3, life: 0.7, size: 0.35, sizeEnd: 0.05, color: col(COLD, 2.5), colorEnd: col(0x103040, 0.4),
  });
}

/** Where simulated, after a hit either lived through: at half, the one that took more collapses and the other is
 *  told its phase (faster, its brother's attack too). */
function hurt(e: Enemy): void {
  const p = partnerOf(e);
  if (!p || e.life >= e.maxLife * 0.5) return;
  const [fell, stands] = e.taken >= p.taken ? [e, p] : [p, e];
  fx('twinFall', fell.id);
  if (stands.bossPhase < 1) fx('bossPhase', stands.id, 1);
}

const cue = (e: Enemy): void => {
  twinSounds.rise();
  shockwave(e.pos, { color: slabOf(e) ? EMBER : COLD, intensity: 1.8, from: 1, to: 9, life: 0.9 });
};

for (const kind of ['twinslab', 'twinreliquary'] as const) {
  bossHooks(kind, {
    hurt,
    enter(e) { e.cd = Math.min(e.cd, 1.2); (e as { speed: number }).speed *= T.alone.faster; },
    cue,
    frame(e) { if (kind === 'twinslab') slabFrame(e); else reliquaryFrame(e); },
  });
}
