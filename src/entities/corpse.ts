// A fallen foe's body: its ragdoll (entities/ragdoll.ts) thrown by the kill (combat/fling.ts), lying still a moment
// once it has come to rest and then dissolving. Frozen, it falls stiff and shatters where it lands; shocked, it
// twitches and sparks as it falls; burnt, it chars, glowing in its cracks, and smokes. The skills move the fallen too:
// a storm whirls them round it and a beam carries them along it (`addField`), a blast throws them out (`blastCorpses`).
import * as THREE from 'three';
import { G } from '../state';
import { Ragdoll, type Field } from './ragdoll';
import { groundHeight } from '../world/ground';
import { col, debris, particles, smokePuff } from '../fx/particles';
import { sfx } from '../core/audio';
import { rand } from '../util';
import type { Fling } from '../combat/fling';
import type { Enemy } from './enemy';
import type { XZ } from '../types';

/** a body lies still this long (s) before it dissolves, at most this long after the fall or after a storm last held
 *  it (whirled for the storm's whole time, a body dissolved in the air as it was flung off), and dissolves over this
 *  long; one without a rig (falling as its model's animation has it) dissolves from `RIGLESS` */
const LIE = 0.7, LONGEST = 5, FADE = 1.1, RIGLESS = 0.5;
/** frozen: it shatters landing at this speed (m/s) or lying still this long (s), or at the latest this long after
 *  the fall, and is gone in shards over this long */
const SHATTER_AT = 3.5, SHATTER_LYING = 0.15, SHATTER_LATEST = 1.6, SHATTER_FADE = 0.3;
const ICE = 0x9ad8ff;
/** shocked: twitching this long (s), a jolt every so often to a couple of its points (m/s) */
const SHOCK_FOR = 0.9, JOLT_EVERY = 0.07, JOLT = 2.6;
const SPARK = 0x9fb2ff;
/** burnt: charred over this long (s), with embers and smoke rising off it */
const CHAR_IN = 0.8;
const EMBER = 0xff7a30;
/** a landing this hard (m/s) is heard and raises dust, at most once in this long (s) */
const THUD_AT = 2.5, THUD_EVERY = 0.25;

/** the fields moving the fallen (a list: each body walks it for each of its points, every step), and the fallen */
const fields: Field[] = [];
const corpses = new Set<Corpse>();

/** A field moving the fallen while it lasts (a storm's whirl); returns what takes it away. */
export function addField(field: Field): () => void {
  fields.push(field);
  return () => {
    const i = fields.indexOf(field);
    if (i >= 0) fields.splice(i, 1);
  };
}

/** How a blast or a shove drives the fallen (`blastCorpses`). */
export interface Shove {
  /** how much of its speed goes up */
  lift?: number;
  /** the way it drives them, when not out from where it struck */
  dir?: XZ;
  /** how much it drives them round where it struck (from +z towards +x, as a heading turns to the left), against
   *  out from it */
  swirl?: number;
  /** the bodies it has driven already, driven no more (a wave passing over them) */
  once?: Set<object>;
  /** only the bodies whose hips are where this says (a charge's way, not a ring round it) */
  where?: (hips: XZ) => boolean;
  /** each body set going at its full speed, not added to the way it was going (a charge's stop: its bodies thrown on
   *  as it throws the living, however fast they rode before it) */
  set?: boolean;
}

/**
 * The bodies that have lain at least a frame within `radius` of `at` thrown out from it at up to `speed` (m/s, less
 * further out): a blast's, a shove's. A body the same blow killed is thrown by its own fling.
 */
export function blastCorpses(at: XZ, radius: number, speed: number, shove: Shove = {}): void {
  for (const c of corpses) {
    if (!c.ragdoll || c.t === 0 || shove.once?.has(c)) continue;
    const hips = c.ragdoll.hips(_h);
    const dx = hips.x - at.x, dz = hips.z - at.z, d = Math.hypot(dx, dz);
    if (d > radius || (shove.where && !shove.where(hips))) continue;
    shove.once?.add(c);
    const ox = d > 1e-3 ? dx / d : 1, oz = d > 1e-3 ? dz / d : 0, swirl = shove.swirl ?? 0;
    let wx = shove.dir?.x ?? ox + oz * swirl, wz = shove.dir?.z ?? oz - ox * swirl;
    const w = Math.hypot(wx, wz) || 1;
    wx /= w; wz /= w;
    const k = shove.set ? speed : speed * (1 - 0.6 * (d / radius));
    if (shove.set) c.ragdoll.drive(wx * k, k * (shove.lift ?? 0.5), wz * k);
    else c.ragdoll.throw(wx * k, k * (shove.lift ?? 0.5), wz * k, 0.5);
  }
}

const _h = new THREE.Vector3(), _p = new THREE.Vector3();

/** A fallen foe's body, from its fall until it has dissolved. */
export class Corpse {
  /** the body gone limp (none for a model without the rig, which falls as its animation has it) */
  readonly ragdoll: Ragdoll | null;
  /** seconds since the fall */
  t = 0;
  private still = 0;
  /** when it began to dissolve (s after the fall), and over how long */
  private fadeAt = -1;
  private fade = FADE;
  private shattered = false;
  private jolt = 0;
  private thudAt = -1;
  /** when a field last held it (s after the fall) */
  private heldAt = 0;

  constructor(private readonly e: Enemy, readonly fling: Fling) {
    const joints = e.model.joints;
    this.ragdoll = joints ? new Ragdoll(joints, { stiff: fling.style === 'frozen' }) : null;
    const v = e.vel, k = e.knock;
    if (this.ragdoll) {
      // (it keeps the way it was going, and the blow's throw)
      this.ragdoll.throw(v.x + k.x, 0, v.z + k.z, 0.5);
      this.ragdoll.strike(fling.vx, fling.vy, fling.vz, fling.at, fling.ox, fling.oz);
      // (its meshes leave the bounds they were measured in standing)
      e.obj.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
    }
    const u = e.model.kit.u;
    if (fling.style === 'frozen') u.uFrozen.value = 1;
    if (fling.style === 'burn') u.uEdge.value.setHex(EMBER).multiplyScalar(3);
    corpses.add(this);
  }

  /** whether it has begun to dissolve */
  get fading(): boolean { return this.fadeAt >= 0; }

  /** The body moved on by `dt` s; false once it has dissolved. */
  update(dt: number): boolean {
    this.t += dt;
    const e = this.e, rd = this.ragdoll, u = e.model.kit.u;
    if (rd) {
      rd.step(dt, fields);
      // (its place follows its hips, so its meshes stay round it)
      rd.hips(_h);
      e.pos.x = _h.x;
      e.pos.z = _h.z;
      e.obj.position.set(_h.x, groundHeight(_h.x, _h.z), _h.z);
      rd.pose();
      this.still = rd.asleep ? this.still + dt : 0;
      if (rd.held) this.heldAt = this.t;
      this.landing(rd.impact);
      rd.impact = 0;
    } else e.animate(dt, G.time, 0);
    this.styled(dt);
    const tooLong = this.t - this.heldAt >= LONGEST;
    if (this.fadeAt < 0 && (this.still >= LIE || tooLong || (!rd && this.t >= RIGLESS))) this.dissolve(FADE);
    u.uHit.value = 0;
    if (e.auraMat) e.auraMat.opacity = Math.max(0, 0.6 - this.t);
    if (this.fadeAt < 0) return true;
    const k = Math.min(1, (this.t - this.fadeAt) / this.fade);
    u.uDissolve.value = k;
    if (k < 1 && Math.random() < 0.5) this.mote(col(u.uEdge.value.getHex(), 1.2));
    return k < 1;
  }

  /** It begins to dissolve, over `over` s, casting no shadow from then (the shadow doesn't dissolve with it). */
  private dissolve(over: number): void {
    this.fadeAt = this.t;
    this.fade = over;
    this.e.model.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
  }

  /** A mote of light rising off the body's middle. */
  private mote(color: THREE.Color): void {
    const e = this.e, at = this.ragdoll ? this.somewhere(_p) : _p.set(e.pos.x, e.obj.position.y + rand(0.1, e.height * 0.4), e.pos.z);
    particles.glow.spawn({
      x: at.x + rand(-0.15, 0.15), y: at.y, z: at.z + rand(-0.15, 0.15), vy: rand(0.5, 1.5), life: 0.8, size: 0.15,
      sizeEnd: 0, color,
    });
  }

  /** One of its points, at random. */
  private somewhere(out: THREE.Vector3): THREE.Vector3 {
    const rd = this.ragdoll!;
    return rd.point(Math.floor(Math.random() * rd.count), out);
  }

  /** A hard landing heard, with dust raised where it struck; frozen, the body shatters. */
  private landing(impact: number): void {
    const style = this.fling.style;
    if (style === 'frozen' && !this.shattered && (impact >= SHATTER_AT || this.still >= SHATTER_LYING || this.t >= SHATTER_LATEST)) {
      this.shatter();
      return;
    }
    if (impact < THUD_AT || this.t - this.thudAt < THUD_EVERY) return;
    this.thudAt = this.t;
    sfx.bodyFall(Math.min(1, impact / 10));
    const hips = this.ragdoll!.hips(_h);
    smokePuff({ x: hips.x, y: groundHeight(hips.x, hips.z), z: hips.z }, {
      count: 2 + Math.round(Math.min(4, impact / 3)), color: 0x2a241c, alpha: 0.35, size: 0.5, sizeEnd: 1.6, life: 0.8,
      speed: 1.2, rise: 0.3,
    });
  }

  /** Frozen stiff, it breaks into shards of ice where it lies and is gone. */
  private shatter(): void {
    this.shattered = true;
    const rd = this.ragdoll!;
    for (let i = 0; i < rd.count; i++) {
      rd.point(i, _p);
      for (let n = 0; n < 4; n++) {
        particles.glow.spawn({
          x: _p.x, y: _p.y, z: _p.z, vx: rand(-3, 3), vy: rand(1, 5), vz: rand(-3, 3), life: rand(0.4, 0.8),
          size: rand(0.08, 0.18), sizeEnd: 0.02, color: col(n % 2 ? ICE : 0xffffff, 2), colorEnd: col(0x2060ff, 0.3),
          gravity: 14, drag: 1.5,
        });
      }
    }
    debris(rd.hips(_h), { count: 14, color: 0xbfe6ff, speed: 5, size: 0.12, life: 0.9 });
    sfx.shatter();
    this.dissolve(SHATTER_FADE);
  }

  /** What its style does as it falls and lies: a shocked body's jolts and sparks, a burnt one's char and smoke. */
  private styled(dt: number): void {
    const style = this.fling.style, rd = this.ragdoll, u = this.e.model.kit.u;
    if (style === 'shock' && rd && this.t < SHOCK_FOR && (this.jolt -= dt) <= 0) {
      this.jolt = JOLT_EVERY;
      for (let n = 0; n < 2; n++) {
        const i = Math.floor(Math.random() * rd.count);
        rd.push(i, rand(-1, 1) * JOLT, rand(0, 1) * JOLT, rand(-1, 1) * JOLT);
        rd.point(i, _p);
        particles.glow.spawn({
          x: _p.x, y: _p.y, z: _p.z, vx: rand(-2, 2), vy: rand(0, 3), vz: rand(-2, 2), life: rand(0.12, 0.25),
          size: rand(0.04, 0.09), sizeEnd: 0, color: col(SPARK, 2.5), colorEnd: col(0x3050ff, 0.4), gravity: 6,
        });
      }
    }
    if (style !== 'burn') return;
    u.uChar.value = Math.min(1, this.t / CHAR_IN);
    if (this.fadeAt >= 0 && this.t - this.fadeAt > this.fade * 0.6) return;
    if (Math.random() < dt * 30) {
      const at = this.ragdoll ? this.somewhere(_p) : _p.copy(this.e.pos);
      particles.glow.spawn({
        x: at.x + rand(-0.1, 0.1), y: at.y, z: at.z + rand(-0.1, 0.1), vx: rand(-0.4, 0.4), vy: rand(0.8, 2.2),
        vz: rand(-0.4, 0.4), life: rand(0.5, 1), size: rand(0.04, 0.08), sizeEnd: 0, color: col(EMBER, 2.2),
        colorEnd: col(0x601000, 0.3), drag: 1,
      });
    }
    if (Math.random() < dt * 5) {
      const at = this.ragdoll ? this.ragdoll.hips(_h) : _h.copy(this.e.pos);
      smokePuff(at, { count: 1, color: 0x1a1612, alpha: 0.4, size: 0.4, sizeEnd: 1.4, life: 1.4, speed: 0.3, rise: 0.9 });
    }
  }

  dispose(): void { corpses.delete(this); }
}
