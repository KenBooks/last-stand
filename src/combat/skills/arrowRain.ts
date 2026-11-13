// Hailfletch: arrows raining on the ground at the aim for as long as the key is held. The ranger stands his ground and
// shoots one arrow after another high over the spot, each posed as any shot (drawn, loosed, the next taken from the
// quiver); each one splits at the top of its flight into a shower of `missiles` arrows fanning out from there and
// coming down together on spots anywhere in the area, then the next arrow goes up. (Its sheaf spread over the next
// shot's time, the rain was a steady drizzle that read as nothing to do with the shots.) Each arrow strikes the foe it
// falls on, if any, for `damage`: a foe may take several or none (hit as a whole area, it didn't matter where they
// fell), and stays in it; one that comes down on a prop goes into its top (off it, if it's stone), the rest into the
// floor (off it on stone: fx/stuckArrows). The area follows the aim at a walk, and what's in the air when the key is let
// go still comes down.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { evades } from '../../entities/evade';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { addEffect, shockwave } from '../../fx/effects';
import { burst, debris } from '../../fx/particles';
import { additive } from '../../core/materials';
import { floorPatch, lay } from '../../fx/floorPatch';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { arrowGeometry, ARROW } from '../../entities/models/bow';
import { clamp, rand, smooth } from '../../util';
import { arrowBlow, arrowMat, arrowMesh, intoGround, intoProp, intoFoe, intoWater, inWater, FWD, streakGeo, streakMat } from './ranger';
import type { Obstacle } from '../../types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';
import type { ChannelSkill, Needs } from './types';

type Def = Needs<'damage' | 'radius' | 'range' | 'missiles'>;

const LEAF = 0xb4cc7b;
/** a falling arrow strikes a foe its point comes down through within this of its body (m) */
const STRIKE = 0.3;
/** a volley: its draw, and what follows the loose (the follow-through, the next arrow from the quiver), s at no cast speed */
const DRAW = 0.9, AFTER = 0.8;
/** a volley's angle above level off the bow (rad), how high over the area its arrow splits (m above the ground: at 8.5 the
 *  split was off the top of the top-down view, and the shower came out of nowhere) and its flight up there (s) */
const PITCH = 0.45, SPLIT_H = 5.5, RISE = 0.4;
/** how far apart a shower's arrows leave the split (s, all of them within it), how they come down (m/s at the split,
 *  gathering speed at m/s²: slow out of the burst, so the split is seen) */
const SPREAD = 0.12, FALL_V0 = 6, FALL_A = 45;
/** the most arrows in the air at once from one rain (two showers) */
const MAX_FALLING = 64;
/** how fast the area follows the aim (m/s) */
const FOLLOW = 3.5;

/** a volley's arrow on its way up: a curve from the bow (leaving along the shot) to where it splits over the area */
interface Rising { mesh: THREE.Mesh; p0: THREE.Vector3; c: THREE.Vector3; p1: THREE.Vector3; t: number }
/** a shower's arrow: from the split (its point at `from`) straight down to `to`, `len` away, once its `wait` is up */
interface Falling { from: THREE.Vector3; to: THREE.Vector3; dir: THREE.Vector3; len: number; wait: number; t: number; /** props it fell past */ past?: Set<Obstacle> }
/** a volley's shower: its arrows still coming down */
interface Shower { arrows: Falling[] }

interface RainState {
  player: Player; def: Def;
  /** the area's middle on the floor */
  center: THREE.Vector3;
  /** the volley under way: its time, whether it's loosed, and (the first only, with no arrow on the string) the seconds
   *  taking one from the quiver first */
  cyc: number; loosed: boolean; fetch: number;
  rising: Rising[]; showers: Shower[];
  done: boolean;
  /** its effect was cleared (a run starting): nothing more is shown */
  gone: boolean;
  /** the foes that have seen it coming (each judged once a channel: entities/evade.ts) */
  judged: Set<Enemy>;
}

/** a streak's longest (m) */
const STREAK = 2;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _sc = new THREE.Vector3();

/** The volley's time at the hero's cast speed. */
const pace = (p: Player): number => 1 + p.stats.castSpeed / 100;

/** Where the area goes: the aim, no further than the skill's range, inside the arena. */
function aimOf(p: Player, def: Def, out: THREE.Vector3): THREE.Vector3 {
  out.set(p.aim.x - p.pos.x, 0, p.aim.z - p.pos.z);
  if (out.length() > def.range) out.setLength(def.range);
  out.add(p.pos); out.y = 0;
  const R = G.arena.radius - 1, r = Math.hypot(out.x, out.z);
  if (r > R) { out.x *= R / r; out.z *= R / r; }
  return out;
}

/** A volley loosed: its arrow up off the bow towards where it splits over the area. */
function loose(s: RainState): void {
  if (s.gone) return;
  const p = s.player, p0 = p.castPoint, yaw = p.shotHeading(p0, s.center);
  const u = _a.set(Math.sin(yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(yaw) * Math.cos(PITCH));
  const p1 = new THREE.Vector3(s.center.x, groundHeight(s.center.x, s.center.z) + SPLIT_H, s.center.z);
  const mesh = arrowMesh(); mesh.position.copy(p0); mesh.quaternion.setFromUnitVectors(FWD, u);
  G.scene.add(mesh);
  s.rising.push({ mesh, p0: p0.clone(), c: p0.clone().addScaledVector(u, p0.distanceTo(p1) * 0.55), p1, t: 0 });
  sfx.bow();
}

/** It splits into its shower: from the split, each arrow to a spot anywhere in the area as it is now, all of them leaving
 *  within SPREAD. */
function split(s: RainState, at: THREE.Vector3): void {
  burst(at, { count: 26, color: LEAF, speed: 4, up: 0, life: 0.4, size: 0.1, gravity: 1, drag: 3 });
  burst(at, { count: 8, color: 0xf3f0d0, speed: 1.5, up: 0, life: 0.25, size: 0.16, gravity: 0, drag: 4 });
  sfx.split();
  const R = s.def.radius, arrows: Falling[] = [];
  for (let i = 0; i < s.def.missiles; i++) {
    const a = rand(0, Math.PI * 2), d = R * Math.sqrt(Math.random());
    const to = new THREE.Vector3(s.center.x + Math.cos(a) * d, 0, s.center.z + Math.sin(a) * d);
    to.y = groundHeight(to.x, to.z);
    const from = at.clone().add(_b.set(rand(-0.15, 0.15), rand(-0.1, 0.1), rand(-0.15, 0.15)));
    arrows.push({ from, to, dir: to.clone().sub(from).normalize(), len: from.distanceTo(to), wait: rand(0, SPREAD), t: -1 });
  }
  s.showers.push({ arrows });
}

/** The foe a falling arrow's point at `p` is coming down through: within STRIKE of its body and between its feet and its top. */
/** The prop a falling arrow's point has come down into, if any (not one it has fallen past: in its circle, beside what it draws). */
function propAt(p: THREE.Vector3, past: Set<Obstacle> | undefined): Obstacle | null {
  for (const o of G.arena.obstacles) if (p.y < o.h && !past?.has(o) && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < o.r * o.r) return o;
  return null;
}

function struck(p: THREE.Vector3): Enemy | null {
  for (const e of G.enemies) {
    if (!e.alive || e.invulnerable) continue;
    const y0 = e.obj.position.y;
    if (p.y > y0 + e.height || p.y < y0 - 0.2) continue;
    if ((e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2 < (e.radius + STRIKE) ** 2) return e;
  }
  return null;
}

const skill: ChannelSkill<RainState> = {
  channel: true, anim: 'bow',
  hits: (def) => [{ per: 'arrow', base: (def as Def).damage, type: 'physical', note: `${(def as Def).missiles} arrows a volley` }],
  warm: () => { const st = new THREE.InstancedMesh(streakGeo, streakMat, 1); st.count = 1; return [new THREE.Mesh(floorPatch(0.9, 1, 1, 8), additive(LEAF, 1.2, 0.5)), arrowMesh(), st]; },
  start(player, rawDef) {
    const def = rawDef as Def;
    const q = player.cls.quiver;
    const s: RainState = { player, def, center: aimOf(player, def, new THREE.Vector3()), cyc: 0, loosed: false,
      fetch: q && !player.nocked ? q.fetch / pace(player) : 0, rising: [], showers: [], done: false, gone: false, judged: new Set() };
    // the area on the floor, and the showers' arrows as they fall (one instanced mesh)
    const ringMat = additive(LEAF, 1.2, 0), fillMat = additive(LEAF, 0.35, 0);
    const ringGeo = floorPatch(def.radius * 0.95, def.radius, 1, 256), fillGeo = floorPatch(0, def.radius, 1, 128);
    const ring = new THREE.Mesh(ringGeo, ringMat), fill = new THREE.Mesh(fillGeo, fillMat);
    ring.frustumCulled = fill.frustumCulled = false;
    const area = new THREE.Group(); area.add(ring, fill);
    const laid = new THREE.Vector2(Infinity, Infinity);
    const rain = new THREE.InstancedMesh(arrowGeometry(), arrowMat, MAX_FALLING);
    rain.count = 0; rain.frustumCulled = false; rain.name = 'arrow rain';
    const streaks = new THREE.InstancedMesh(streakGeo, streakMat, MAX_FALLING + 4);
    streaks.count = 0; streaks.frustumCulled = false;
    G.scene.add(area, rain, streaks);
    shockwave(s.center, { color: LEAF, intensity: 1.1, from: def.radius * 0.4, to: def.radius, life: 0.45 });
    let fade = 0;
    addEffect({
      update(dt) {
        fade = s.done ? Math.max(0, fade - dt * 2.5) : Math.min(1, fade + dt * 4);
        ringMat.opacity = 0.55 * fade; fillMat.opacity = 0.18 * fade;
        area.position.set(s.center.x, 0, s.center.z);
        if (Math.hypot(laid.x - s.center.x, laid.y - s.center.z) > 0.01) { lay(ringGeo, s.center.x, s.center.z, 0.07); lay(fillGeo, s.center.x, s.center.z, 0.06); laid.set(s.center.x, s.center.z); }
        // the volleys' arrows on their way up, each splitting into its shower at the top
        let ns = 0;
        for (let i = s.rising.length - 1; i >= 0; i--) {
          const r = s.rising[i], k = Math.min(1, (r.t += dt) / RISE);
          // (a quadratic from the bow: off it along the shot, bending over towards the split)
          const pt = _a.copy(r.p0).multiplyScalar((1 - k) ** 2).addScaledVector(r.c, 2 * k * (1 - k)).addScaledVector(r.p1, k * k);
          _b.subVectors(r.c, r.p0).multiplyScalar(1 - k).add(_d.subVectors(r.p1, r.c).multiplyScalar(k)).normalize();
          r.mesh.position.copy(pt); r.mesh.quaternion.setFromUnitVectors(FWD, _b);
          // (its streak behind it, from its point)
          streaks.setMatrixAt(ns++, _m.compose(_d.copy(pt).addScaledVector(_b, ARROW / 2), r.mesh.quaternion, _sc.set(1, 1, Math.min(STREAK, r.t * 20))));
          if (k >= 1) { G.scene.remove(r.mesh); s.rising.splice(i, 1); split(s, r.p1); }
        }
        // the showers coming down, and into the ground
        let n = 0;
        for (let j = s.showers.length - 1; j >= 0; j--) {
          const sh = s.showers[j];
          for (let i = sh.arrows.length - 1; i >= 0; i--) {
            const f = sh.arrows[i];
            if (f.t < 0) { if ((f.wait -= dt) > 0) continue; f.t = 0; }
            f.t += dt;
            const along = Math.min(f.len, FALL_V0 * f.t + FALL_A * f.t * f.t / 2);
            _a.copy(f.from).addScaledVector(f.dir, along);
            // into the first foe its point comes down through (the arrow's in it: gone), else into the ground
            const hit = struck(_a);
            // (its speed as it comes down)
            const vel = _d.copy(f.dir).multiplyScalar(FALL_V0 + FALL_A * f.t);
            // (one that sees the rain coming may blink out from under it, the arrow falling on past)
            const seen = hit && !s.judged.has(hit) && s.judged.add(hit);
            if (seen && evades(hit, player, { kind: 'area', x: s.center.x, z: s.center.z, half: def.radius })) continue;
            if (hit) {
              hitEnemy(hit, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', from: { x: f.from.x, z: f.from.z }, blow: arrowBlow(hit, _a, vel, 0.7) });
              intoFoe(hit, _a, vel);
              burst(_a, { count: 6, color: 0xd3bf8d, speed: 2, life: 0.2, size: 0.07 });
              sfx.boltHit();
              sh.arrows.splice(i, 1);
              continue;
            }
            if (inWater(_a)) {
              intoWater(_a, vel);
              if (Math.random() < 0.3) sfx.thud();
              sh.arrows.splice(i, 1);
              continue;
            }
            const prop = along < f.len ? propAt(_a, f.past) : null;
            if (prop && !intoProp(prop, _a, vel)) (f.past ??= new Set()).add(prop);
            else if (prop) {
              hurtPropsIn(player, _a.x, _a.z, 0.3, PROP_DAMAGE.bolt);
              if (Math.random() < 0.3) sfx.thud();
              sh.arrows.splice(i, 1);
              continue;
            }
            if (along >= f.len) {
              intoGround(f.to.clone(), vel);
              debris(f.to, { count: 3, color: 0x4a3a28, speed: 1.4, size: 0.07, life: 0.5 });
              if (Math.random() < 0.3) sfx.thud();
              hurtPropsIn(player, f.to.x, f.to.z, 0.3, PROP_DAMAGE.bolt);
              sh.arrows.splice(i, 1);
              continue;
            }
            if (n >= rain.instanceMatrix.count) continue;
            // (its streak back up towards the split from its point, and the arrow's middle half an arrow behind its point)
            _q.setFromUnitVectors(FWD, f.dir);
            streaks.setMatrixAt(ns++, _m.compose(_a, _q, _sc.set(1, 1, Math.min(STREAK, along))));
            rain.setMatrixAt(n++, _m.compose(_a.addScaledVector(f.dir, -ARROW / 2), _q, _one));
          }
          if (!sh.arrows.length) s.showers.splice(j, 1);
        }
        rain.count = n; rain.instanceMatrix.needsUpdate = true;
        streaks.count = ns; streaks.instanceMatrix.needsUpdate = true;
        return !s.done || fade > 0 || s.rising.length > 0 || s.showers.length > 0;
      },
      dispose() {
        s.gone = s.done = true;
        G.scene.remove(area, rain, streaks);
        for (const r of s.rising) G.scene.remove(r.mesh);
        s.rising.length = 0; s.showers.length = 0;
        ringMat.dispose(); fillMat.dispose(); ringGeo.dispose(); fillGeo.dispose(); rain.dispose(); streaks.dispose();
      },
    });
    return s;
  },
  tick(player, rawDef, dt, s) {
    // the area follows the aim at a walk
    const to = aimOf(player, rawDef as Def, _b), dx = to.x - s.center.x, dz = to.z - s.center.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) { const k = Math.min(1, FOLLOW * dt / d); s.center.x += dx * k; s.center.z += dz * k; }
    // volley after volley: (the first arrow from the quiver,) drawn, loosed, the next one taken and nocked
    const sp = pace(player), D = DRAW / sp, A = AFTER / sp;
    s.cyc += dt;
    if (s.fetch && !s.loosed && s.cyc >= s.fetch) player.nocked = 1;
    if (!s.loosed && s.cyc >= s.fetch + D) { s.loosed = true; player.nocked = 0; loose(s); }
    if (s.loosed && s.cyc >= s.fetch + D + A) { s.cyc -= s.fetch + D + A; s.fetch = 0; s.loosed = false; player.nocked = 1; }
  },
  stop(_player, _def, s) { s.done = true; },
  pose(player, _def, s, action) {
    const sp = pace(player), D = DRAW / sp, A = AFTER / sp, c = s.cyc - s.fetch;
    // (as a shot is posed: the hand at the quiver first, then the draw, then what follows the loose)
    if (s.fetch) action.fetch = Math.min(1, s.cyc / s.fetch);
    if (c < 0) { action.draw = 0; action.t = 0; }
    else if (!s.loosed) { action.draw = Math.min(1, c / D); action.t = 0.55 * action.draw; }
    else { action.draw = 1; action.loosed = c - D; action.t = 0.55 + 0.45 * Math.min(1, (c - D) / A); }
    // (drawn near level and lifted to the volley's angle as the string comes back, the trunk bending back at the waist:
    // raised before the draw, the draw arm's shoulder went past its range as the hand took the string)
    const after = s.loosed ? Math.min(1, (c - D) / A) : 0;
    action.pitch = PITCH * (s.loosed ? 1 - smooth(clamp(after / 0.6, 0, 1)) : smooth(clamp(((action.draw ?? 0) - 0.3) / 0.7, 0, 1)));
    action.yaw = player.shotHeading(player.castPoint, s.center);
    action.arrows = 1; action.fan = 0;
  },
};

export default skill;
