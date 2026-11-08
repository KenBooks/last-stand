// Maelstrom: a roaming firestorm that pulls enemies in and lashes them with lightning (its look: fx/firestorm.ts).
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { addEffect, lightning } from '../../fx/effects';
import { Firestorm, warmFirestorm } from '../../fx/firestorm';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import type { InstantSkill, Needs } from './types';
import { rand } from '../../util';
import { addField } from '../../entities/corpse';
import { GRAVITY, type Field } from '../../entities/ragdoll';
import { groundHeight } from '../../world/ground';
import { swingWay } from '../fling';

const FIRE = 0xff8a3c, LASH = 0xffc070;
/** its light's peak, coming and going with its fade (at full from the first frame, it lit the scene at once), and its
 *  height over the ground: up in the funnel's wide top, above the head (at 2.5 m, just ahead of the eyes as it rose,
 *  it lit what stood before them orange) */
const LIGHT = 16, LIGHT_Y = 3.8;
/** the damage's ticks (s); the lashes of lightning at the foes in it, at most this often (s) and at most this many at once:
 *  a lash at every tick flashed 3 to 4 times a second, and 3 a second is a photosensitivity hazard */
const TICK = 0.25, LASH_EVERY = 0.7, LASHED = 2;
/** it rises out of the ground and sinks back into it over these (s) */
const RISE = 0.35, SINK = 0.45;
/** the fallen it whirls round it as its ribbons turn (from +z towards +x): this fast (m/s), drawn in to a ring this
 *  share of its radius, held up its funnel this high over the floor (m) and higher nearer its middle, gripped this
 *  hard (/s) with this much of their weight borne, out to this share of its radius. When it sinks they fly off. */
const WHIRL = 6.5, RING = 0.55, LIFT = 1.1, LIFT_MID = 1.6, GRIP = 3, BEAR = 0.92, REACH = 1.5;

/** The whirl of a storm at `pos` going `vel`, as strong as `strength` says (its fade), on the fallen. */
function whirl(pos: THREE.Vector3, vel: THREE.Vector3, radius: number, strength: () => number): Field {
  return {
    accel(p, v, out) {
      const k = strength(), dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz), reach = radius * REACH;
      if (k <= 0.01 || d > reach) return false;
      const ox = d > 1e-3 ? dx / d : 1, oz = d > 1e-3 ? dz / d : 0;
      // round it (and with it as it goes), drawn to its ring, the turn's own pull inwards given as it goes round
      const inward = (d - radius * RING) * 2.5, round = v.x * oz - v.z * ox;
      const wantX = vel.x + oz * WHIRL - ox * inward, wantZ = vel.z - ox * WHIRL - oz * inward;
      const height = groundHeight(pos.x, pos.z) + LIFT + LIFT_MID * (1 - d / reach);
      const centre = (round * round) / Math.max(0.5, d);
      out.x += ((wantX - v.x) * GRIP - ox * centre) * k;
      out.z += ((wantZ - v.z) * GRIP - oz * centre) * k;
      out.y += (GRAVITY * BEAR + ((height - p.y) * 2.5 - v.y) * GRIP) * k;
      return true;
    },
  };
}

const skill: InstantSkill = {
  anim: 'cast',
  hits: (def) => [{ per: 'tick', base: (def.damage ?? 0) * TICK, rate: 1 / TICK, type: 'lightning', note: `for ${def.duration} s` }],
  warm: warmFirestorm,
  cast(player, rawDef, target) {
    const def = rawDef as Needs<'damage' | 'radius' | 'duration' | 'speed' | 'pull'>;
    const dir = new THREE.Vector3(target.x - player.pos.x, 0, target.z - player.pos.z);
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    dir.normalize();
    const pos = player.pos.clone().addScaledVector(dir, 1.8);
    const storm = new Firestorm(def.radius, G.scene);
    const light = flash({ color: FIRE, intensity: 0, distance: 10, life: 1, hold: def.duration, follow: () => new THREE.Vector3(pos.x, storm.group.position.y + LIGHT_Y, pos.z) });
    const hush = sfx.maelstrom(def.duration);
    storm.burst(pos.x, pos.z);

    let t = 0, tick = 0, lash = LASH_EVERY, strength = 0;
    const vel = dir.clone().multiplyScalar(def.speed);
    const calm = addField(whirl(pos, vel, def.radius, () => strength));
    addEffect({
      update(dt) {
        t += dt;
        const left = def.duration - t;
        const grow = THREE.MathUtils.smoothstep(Math.min(t / RISE, left / SINK + 0.4), 0, 1);
        const fade = Math.min(1, t / 0.3) * THREE.MathUtils.clamp(left / SINK, 0, 1);
        pos.addScaledVector(dir, def.speed * dt);
        const R = G.arena.radius - 1, r = Math.hypot(pos.x, pos.z);
        if (r > R) { pos.x *= R / r; pos.z *= R / r; }
        storm.update(dt, pos.x, pos.z, Math.max(0.15, grow), fade);
        light.peak = LIGHT * fade;
        strength = fade;

        // pull
        for (const e of G.enemies) {
          if (!e.alive || e.boss) continue;
          const dx = pos.x - e.pos.x, dz = pos.z - e.pos.z, d = Math.hypot(dx, dz);
          if (d < def.radius * 1.6 && d > 0.3) {
            e.knock.x += (dx / d) * def.pull * dt * 4 * (1 - (e.def.knockbackResist || 0));
            e.knock.z += (dz / d) * def.pull * dt * 4 * (1 - (e.def.knockbackResist || 0));
          }
        }

        // damage ticks, and now and then a lash of lightning from its wall at the foes in it
        tick += dt;
        lash += dt;
        if (tick >= TICK && t < def.duration - 0.2) {
          tick -= TICK;
          const inside = G.enemies.filter((e) => e.alive && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < def.radius + e.radius);
          hurtPropsIn(player, pos.x, pos.z, def.radius, PROP_DAMAGE.zone * TICK);
          // (what it kills burns, and goes round with it)
          for (const e of inside) {
            const blow = { dir: swingWay(pos, e.pos, 1, 1, -0.3), lift: 0.6, style: 'burn' as const };
            hitEnemy(e, def.damage * TICK, { by: player, skill: def, tags: def.tags, type: 'lightning', silent: true, blow });
          }
          if (inside.length && lash >= LASH_EVERY) {
            lash = 0;
            const ground = storm.group.position.y;
            for (const e of inside.sort(() => Math.random() - 0.5).slice(0, LASHED)) {
              const from = storm.pointOn(pos.x, ground, pos.z, rand(1.8, 3), Math.atan2(e.pos.z - pos.z, e.pos.x - pos.x));
              const to = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
              lightning(from, to, { color: LASH, intensity: 3.5, width: 0.05, branches: 1 });
            }
            sfx.zap();
          }
        }
        return t < def.duration;
      },
      dispose() {
        hush?.();
        calm();
        storm.dispose(G.scene);
        release(light);
      },
    });
  },
};

export default skill;
