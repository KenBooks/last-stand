// Generic projectile system used by player skills and enemies.
import * as THREE from 'three';
import { G } from '../state';
import { particles, col, burst } from '../fx/particles';
import { flash, flashFree, release, type LightSlot } from '../fx/lights';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import { nearGlow } from '../core/materials';
import { portShader } from '../core/shaderPorts';
import { hurtProp, PROP_DAMAGE } from '../world/destructible';
import type { Obstacle } from '../types';
import { entry, strikesBody } from './strikes';
import { evades, SEEN_AHEAD, type Threat } from '../entities/evade';

const coreGeo = new THREE.SphereGeometry(1, 12, 8);
const matCache = new Map<string, THREE.Material>();
/**
 * A hostile bolt's core is energy, not a ball: added light, brightest in the middle, fading to a soft rim.
 */
const orbShader = {
  vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */`uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
    void main(){
      float f = max(dot(normalize(vN), normalize(vV)), 0.0);
      vec3 c = uColor * (0.15 + 1.1 * f * f);
      gl_FragColor = vec4(c, 1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
};
/** `orbShader` on WebGPU (core/shaderPorts.ts) */
const orbPort: Parameters<typeof portShader>[1] = ({ wgslFn, normalView, positionViewDirection }, u) => ({
  fragment: wgslFn(`fn boltOrb(n: vec3f, v: vec3f, color: vec3f) -> vec4f {
    let f = max(dot(normalize(n), normalize(v)), 0.0);
    return vec4f(color * (0.15 + 1.1 * f * f), 1.0);
  }`)({ n: normalView, v: positionViewDirection, color: u.uColor }),
});
function coreMat(color: THREE.ColorRepresentation, intensity: number, orb: boolean): THREE.Material {
  const key = `${color}:${intensity}:${orb}`;
  let m = matCache.get(key);
  if (!m) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    m = orb ? portShader(nearGlow(new THREE.ShaderMaterial({ ...orbShader, uniforms: { uColor: { value: c } } })), orbPort)
      : nearGlow(new THREE.MeshBasicMaterial({ color: c }));
    matCache.set(key, m);
  }
  return m;
}

/** Cores for the load-time warm-up: each kind shares its program (the colour is a uniform). */
export const coreSamples = (): THREE.Mesh[] => [false, true].map((orb) => new THREE.Mesh(coreGeo, coreMat(0xffffff, 4, orb)));

export interface TrailOpts { color: THREE.ColorRepresentation; colorEnd?: THREE.ColorRepresentation; intensity?: number; size?: number; rate?: number; life?: number }

export interface ProjectileOpts {
  pos: THREE.Vector3;
  /** normalized direction */
  dir: THREE.Vector3;
  speed: number;
  radius?: number;
  life?: number;
  /** hostile projectiles hit the players, friendly ones hit enemies */

  hostile?: boolean;
  color?: THREE.ColorRepresentation;
  size?: number;
  intensity?: number;
  /** attach a dynamic light of this intensity (0 = none); a hostile bolt's only takes a free light */
  glow?: number;
  trail?: TrailOpts;
  /** steering rate towards the nearest enemy in front (rad/s-ish) */
  homing?: number;
  /** test the whole flight segment: fast, narrow arrows otherwise skip small targets at low frame rates */
  swept?: boolean;
  /** it hits only a foe it's level with (an arrow on its arc flies over heads): one whose body it meets, as drawn,
   *  before its point goes into the ground in front of it */
  level?: boolean;
  /** how far ahead of where it is it strikes (m): an arrow's point, half its length on (struck with its middle, an
   *  arrow aimed low at a foe went into the ground in front of it first) */
  point?: number;
  /** it goes on through every foe it hits (once each), stopped only by the world */
  pierce?: boolean;
  ignore?: Set<Enemy>;
  /** a mesh of its own instead of the glowing core (sized by the caller) */
  mesh?: THREE.Mesh;
  /** every frame of its flight, after it moved (its own look: spin, trail...) */
  tick?(proj: Projectile, dt: number): void;
  onHit?(target: Enemy | Player, proj: Projectile): void;
  onExpire?(proj: Projectile): void;
  /** it met a prop's circle (`o`, coming from `from`): instead of fading out where it is, it ends as this has it (true: the
   *  prop takes the blow) or flies on past that prop (false: its circle is rounder than what it draws, and missed it) */
  onProp?(o: Obstacle, proj: Projectile, from: THREE.Vector3): boolean;
  /** how far from the middle it's gone (m, 28 by default): an arrow meets the wall itself */
  edge?: number;
  /** the hero whose shot it is: a foe that sees it coming may get out of its way (entities/evade.ts) */
  by?: Player;
  /** the foes that have seen it coming, shared by a cast's shots (a volley's arrows, a bolt's splits): each foe judged
   *  once a cast (each arrow of five judged alone, a foe got out of nearly every volley) */
  judged?: Set<Enemy>;
}

const _to = new THREE.Vector3(), _from = new THREE.Vector3(), _hits: Enemy[] = [], _along: number[] = [], _order: number[] = [];
const _ahead = new THREE.Vector3(), _stepFrom = new THREE.Vector3(), _stepTo = new THREE.Vector3();

export class Projectile {
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  readonly speed: number;
  readonly radius: number;
  life: number;
  readonly hostile: boolean;
  readonly homing: number;
  readonly swept: boolean;
  readonly level: boolean;
  readonly point: number;
  readonly pierce: boolean;
  readonly ignore: Set<Enemy>;
  readonly onHit?: ProjectileOpts['onHit'];
  readonly tick?: ProjectileOpts['tick'];
  /** its own mesh (not a glowing core): it may come close to the lens */
  readonly ownMesh: boolean;
  /** the mesh's full scale */
  readonly size: number;
  readonly onExpire?: ProjectileOpts['onExpire'];
  readonly onProp?: ProjectileOpts['onProp'];
  /** the props it has flown past (their circles, not what they draw) */
  readonly passed = new Set<Obstacle>();
  readonly edge: number;
  readonly by?: Player;
  /** the foes that have seen it coming (each judged once a cast, `foresee`) */
  readonly judged: Set<Enemy>;
  readonly trail?: TrailOpts;
  readonly color: THREE.ColorRepresentation;
  alive = true;
  trailAcc = 0;
  readonly mesh: THREE.Mesh;
  readonly light: LightSlot | null;

  constructor(o: ProjectileOpts) {
    this.pos = o.pos.clone();
    this.vel = o.dir.clone().multiplyScalar(o.speed);
    this.speed = o.speed;
    this.radius = o.radius ?? 0.3;
    this.life = o.life ?? 2;
    this.hostile = !!o.hostile;
    this.homing = o.homing ?? 0;
    this.swept = !!o.swept;
    this.level = !!o.level;
    this.point = o.point ?? 0;
    this.pierce = !!o.pierce;
    this.ignore = o.ignore ?? new Set();
    this.onHit = o.onHit;
    this.tick = o.tick;
    this.ownMesh = !!o.mesh;
    this.onExpire = o.onExpire;
    this.onProp = o.onProp;
    this.edge = o.edge ?? 28;
    this.by = o.hostile ? undefined : o.by;
    this.judged = o.judged ?? new Set();
    this.trail = o.trail;
    this.color = o.color ?? 0xffffff;
    this.mesh = o.mesh ?? new THREE.Mesh(coreGeo, coreMat(this.color, o.intensity ?? 4, this.hostile));
    this.mesh.name = 'projectile';
    if (!o.mesh) this.mesh.scale.setScalar(o.size ?? 0.12);
    this.size = this.mesh.scale.x;
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    const lo = { color: this.color, intensity: o.glow, distance: 6, life: 1, hold: 99, follow: this.mesh };
    this.light = !o.glow ? null : this.hostile ? flashFree(lo) : flash(lo);
  }

  /** Advance; returns false once the projectile is gone. */
  update(dt: number): boolean {
    this.life -= dt;
    if (this.life <= 0) return this.expire();

    if (this.homing && !this.hostile) {
      const t = this.findTarget();
      if (t) {
        _to.set(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize().multiplyScalar(this.speed);
        this.vel.lerp(_to, Math.min(1, this.homing * dt));
        this.vel.setLength(this.speed);
      }
    }
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    // in first person a bolt aimed at the player flies at the lens: it shrinks away over its last metres
    // (a glowing core sooner, it would fill the view) rather than vanishing at once
    const d = this.pos.distanceTo(G.camera.position), [d0, d1] = this.ownMesh ? [0.6, 2] : [1.2, 3.5];
    const k = Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
    this.mesh.scale.setScalar(this.size * k * k * (3 - 2 * k));
    this.mesh.visible = k > 0;
    if (this.by) this.foresee(this.by);
    if (this.level && !this.hostile && this.strikeFoes(_from.set(px, py, pz))) return false;
    this.tick?.(this, dt);
    // (its own flight may end it: an arrow into the ground, past a foe it went through first, which takes it: a
    // Lancewood Shot at a ducked foe's feet went through what was left of it into the ground)
    if (!this.alive) {
      if (!this.level && !this.hostile) this.strikeFoes(_from.set(px, py, pz));
      return false;
    }

    if (this.trail) {
      const tr = this.trail;
      this.trailAcc += dt * (tr.rate ?? 90);
      const c = col(tr.color, tr.intensity ?? 2.5), ce = col(tr.colorEnd ?? tr.color, 0.4);
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        const f = Math.random();
        particles.glow.spawn({
          x: this.pos.x - this.vel.x * dt * f, y: this.pos.y - this.vel.y * dt * f, z: this.pos.z - this.vel.z * dt * f,
          vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6,
          life: tr.life ?? 0.35, size: tr.size ?? 0.3, sizeEnd: 0.02, color: c, colorEnd: ce, drag: 3,
        });
      }
    }

    // world collision
    if (Math.hypot(this.pos.x, this.pos.z) > this.edge) return this.expire();
    // only what reaches up to the bolt: it flies over low cover
    const low = this.pos.y - this.radius * 0.5;
    for (const o of G.arena.obstacles) {
      if (o.h > low && !this.passed.has(o) && this.distanceSq(o.x, o.z, px, pz) < (o.r + this.radius * 0.5) ** 2) {
        if (this.onProp) {
          if (!this.onProp(o, this, _from.set(px, py, pz))) { this.passed.add(o); continue; }
          hurtProp(o, PROP_DAMAGE.bolt);
          return this.kill();
        }
        hurtProp(o, this.hostile ? PROP_DAMAGE.hostile : PROP_DAMAGE.bolt);
        return this.expire();
      }
    }

    // target collision
    if (this.hostile) {
      for (const p of G.players) {
        if (p.active && this.distanceSq(p.pos.x, p.pos.z, px, pz) < (p.radius + this.radius) ** 2) {
          this.onHit?.(p, this);
          return this.kill();
        }
      }
    } else if (!this.level && this.strikeFoes(_from.set(px, py, pz))) return false;
    return true;
  }

  /** The foes that see it coming within `SEEN_AHEAD` of its flight, each judged once (`evades`): one that blinks out
   *  of its way is passed by, and one that ducks is struck only where its drawn body is left over the ground. */
  private foresee(by: Player): void {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed < 1e-3) return;
    const x = this.pos.x, z = this.pos.z, dx = this.vel.x * SEEN_AHEAD, dz = this.vel.z * SEEN_AHEAD;
    for (const e of G.enemies) {
      if (!e.def.evade || this.ignore.has(e) || this.judged.has(e)) continue;
      if (entry(x, z, dx, dz, e.pos.x, e.pos.z, Math.max(e.radius, e.reach.out) + this.radius) < 0) continue;
      this.judged.add(e);
      const way = { x: this.vel.x / speed, z: this.vel.z / speed };
      const threat: Threat = { kind: 'shot', x, z, way, half: this.radius };
      if (!evades(e, by, threat) || e.def.evade.how !== 'blink') continue;
      // (blinked out of the cast's way: every shot of it passes it by, a volley's other arrows too)
      for (const shot of G.projectiles) if (shot.judged === this.judged) shot.ignore.add(e);
    }
  }

  /** The foes this frame's step from `from` strikes, struck: the first alone (true: it's gone), or going on through
   *  them each, in the order the step meets them. */
  private strikeFoes(from: THREE.Vector3): boolean {
    _hits.length = 0; _along.length = 0;
    for (const e of G.enemies) {
      if (!e.alive || e.invulnerable || this.ignore.has(e)) continue;
      const t = this.strikes(e, from);
      if (t >= 0) { _hits.push(e); _along.push(t); }
    }
    if (!_hits.length) return false;
    _order.length = 0;
    for (let i = 0; i < _hits.length; i++) _order.push(i);
    _order.sort((i, j) => _along[i] - _along[j]);
    if (!this.pierce) {
      this.pos.lerpVectors(from, this.pos, _along[_order[0]]);
      this.onHit?.(_hits[_order[0]], this);
      this.kill();
      return true;
    }
    for (const i of _order) { this.ignore.add(_hits[i]); this.onHit?.(_hits[i], this); }
    return false;
  }

  /**
   * Where along this frame's step from `from` it strikes `e` (0..1), or -1: a level shot (an arrow) where it meets
   * its body (`strikesBody`: struck within its circle and under its height, it flew through a boss's arms and crown
   * and struck a small foe it went by); any other there or within its circle, at any height.
   */
  private strikes(e: Enemy, from: THREE.Vector3): number {
    const ahead = _ahead.copy(this.vel).setLength(this.point);
    const body = strikesBody(e, _stepFrom.copy(from).add(ahead), _stepTo.copy(this.pos).add(ahead), this.radius * 0.5);
    if (this.level) return body;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, r = e.radius + this.radius;
    const circle = this.swept ? entry(from.x, from.z, dx, dz, e.pos.x, e.pos.z, r) : (this.distanceSq(e.pos.x, e.pos.z, from.x, from.z) < r * r ? 1 : -1);
    // (ducked, it's struck only where what's left of it stands over the ground: entities/evade.ts)
    if (circle < 0 || e.ducked > 0) return body;
    return body < 0 ? circle : Math.min(body, circle);
  }

  findTarget(): Enemy | null {
    let best: Enemy | null = null, bd = 49;
    const fwd = this.vel;
    for (const e of G.enemies) {
      if (!e.alive || this.ignore.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd && dx * fwd.x + dz * fwd.z > 0) { bd = d; best = e; }
    }
    return best;
  }

  private distanceSq(x: number, z: number, px: number, pz: number): number {
    if (!this.swept) return (this.pos.x - x) ** 2 + (this.pos.z - z) ** 2;
    const dx = this.pos.x - px, dz = this.pos.z - pz, lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / lengthSq)) : 0;
    return (px + dx * t - x) ** 2 + (pz + dz * t - z) ** 2;
  }

  expire(): false {
    this.onExpire?.(this);
    burst(this.pos, { count: 6, color: this.color, speed: 2, life: 0.3, size: 0.2 });
    return this.kill();
  }

  kill(): false {
    // (once: a shot its flight ended may still strike the foe it went through first)
    if (!this.alive) return false;
    this.alive = false;
    G.scene.remove(this.mesh);
    release(this.light);
    return false;
  }
}

export function spawnProjectile(opts: ProjectileOpts): Projectile {
  const p = new Projectile(opts);
  G.projectiles.push(p);
  return p;
}

export function updateProjectiles(dt: number): void {
  const list = G.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].update(dt)) list.splice(i, 1);
  }
}

export function clearProjectiles(): void {
  for (const p of G.projectiles) if (p.alive) p.kill();
  G.projectiles.length = 0;
}
