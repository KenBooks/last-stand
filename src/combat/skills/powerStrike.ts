// Power Strike: a second and a half of gathering strength around the weapon, then a crushing overhead blow.
import * as THREE from 'three';
import { addEffect, shockwave, groundFlash, crackDecal, decal } from '../../fx/effects';
import { particles, col, debris, smokePuff } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';
import { blastCorpses } from '../../entities/corpse';
import { propTopAt, wallTopAt } from '../../world/collision';
import { groundHeight } from '../../world/ground';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock' | 'color'>;

/** casts whose charge-up already started (to play its sound once) */
const charged = new WeakSet<object>();

/** where the blow lands ahead of him over open ground (m), and the step its way is read in */
const LANDS = 2.2;
const STEP = 0.1;
/** a prop or the wall standing this much over the floor stops the blow (m): the model's stop lands the weapon on it */
const STANDS = 0.25;
/** the size of the blow's mark stopped short on something, of its own */
const STOPPED_SIZE = 0.35;

/** How far ahead along `dir` the blow lands (m): `LANDS`, or short of the first prop or stretch of the arena's wall
 *  in its way, which the weapon comes down on (models/warrior.ts `landHeight`). Landed 2.2 m ahead whatever stood
 *  there, its shockwave and cracks showed on the far side of the wall and inside a pillar. */
function reachBefore(p: THREE.Vector3, dir: THREE.Vector3): number {
  for (let d = STEP; d <= LANDS; d += STEP) {
    const x = p.x + dir.x * d, z = p.z + dir.z * d;
    if (Math.max(propTopAt(x, z), wallTopAt(x, z)) > groundHeight(x, z) + STANDS) return Math.max(STEP, d - STEP);
  }
  return LANDS;
}

const skill: InstantSkill = {
  anim: 'chop',
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical' }],
  charging(player, rawDef, k, dt) {
    const def = rawDef as Def;
    const c = player.casting;
    if (c && !charged.has(c)) {
      charged.add(c);
      // (a cast cut short, a guard broken under it, lets its sound sink away: watched, as nothing says a cast ended)
      const quiet = sfx.strikeCharge(c.fireAt - c.t);
      if (quiet) addEffect({ update: () => { if (c.fired) return false; if (player.casting === c) return true; quiet(); return false; }, dispose() {} });
    }
    // keep turning towards the aim while charging
    c?.target.copy(player.aim);
    // motes stream into the weapon (each of two), faster and hotter as the charge builds
    const tips = [player.castPoint], off = player.model.offTip;
    if (off) tips.push(off.getWorldPosition(new THREE.Vector3()));
    const n = Math.random() < dt * (30 + k * 90) * tips.length ? 1 + Math.floor(k * 2) : 0;
    for (let i = 0; i < n; i++) {
      const tip = tips[Math.floor(Math.random() * tips.length)];
      const a = Math.random() * Math.PI * 2, r = rand(0.9, 1.6), y = rand(-0.6, 0.8);
      const life = rand(0.25, 0.45);
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      particles.glow.spawn({
        x: tip.x + ox, y: tip.y + y, z: tip.z + oz, vx: -ox / life, vy: -y / life, vz: -oz / life,
        life, size: rand(0.06, 0.12) * (1 + k), sizeEnd: 0.02, color: col(k > 0.8 ? 0xffffff : def.color, 2 + k * 2), colorEnd: col(0xff7020, 1),
      });
    }
    if (k > 0.85 && Math.random() < dt * 20) {
      const p = player.pos;
      smokePuff({ x: p.x, y: 0, z: p.z }, { count: 1, color: 0x2a241c, alpha: 0.35, size: 0.5, sizeEnd: 1.4, life: 0.6, speed: 1.2, rise: 0.2 });
    }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    const p = player.pos;
    // the way the body (and so the blow) faces
    const facing = player.facing;
    const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    // (the chop's one mark on its way down is the trail its blade leaves, fx/swingTrail.ts)
    const reach = reachBefore(p, dir);
    const c = new THREE.Vector3(p.x + dir.x * reach, 0, p.z + dir.z * reach);
    // (stopped short on a prop or the wall, the blow's mark is as small as the room before it: full size, its cracks
    // spread round his feet and its ring over the wall and past it)
    const k = reach < LANDS ? STOPPED_SIZE : 1;
    shockwave(c, { color: def.color, intensity: 2.5, from: 0.3 * k, to: 3.2 * k, life: 0.45 });
    shockwave(c, { color: 0xffffff, intensity: 1.2, from: 0.2 * k, to: 2 * k, life: 0.3 });
    groundFlash(c, { color: def.color, intensity: 1.6, radius: 2.4 * k, life: 0.35 });
    crackDecal(c, { size: 3.6 * k, color: 0xffa050, intensity: 1.8, life: 3 });
    decal(c, { type: 'scorch', size: 2.6 * k, life: 7 });
    debris(c, { count: 30, speed: 8 });
    smokePuff(c, { count: 12, color: 0x2a241c, size: 1.2, sizeEnd: 3.4, speed: 3 });
    flash({ color: def.color, intensity: 26, distance: 10, life: 0.4, pos: { x: c.x, y: 1.2, z: c.z } });
    addShake(0.75);
    sfx.strike(k);
    // the chop drives what it kills down into the floor ahead, high on the body; the bodies lying round where it
    // lands are thrown up by the blow through the floor
    sweep(player, def, facing, { knock: def.knock, blow: { dir: { x: dir.x, z: dir.z }, lift: -0.45, at: 0.95, force: 1.25 } });
    blastCorpses(c, 3.4, 7, { lift: 1.1 });
  },
};

export default skill;
