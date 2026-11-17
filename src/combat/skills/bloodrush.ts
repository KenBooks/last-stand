// Bloodrush: the warrior with both hands empty (#400). An instant, reckless dash of `range` m along the aim, low and
// shoulder first, through a line of foes: each it meets is struck once as he passes, and none is carried (Bull Rush's
// is a weapon's charge, carrying what it meets). Each foe struck builds a stack of Frenzy, up to `frenzyMost` a dash
// (combat/frenzy.ts).
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { evades } from '../../entities/evade';
import { shockwave, decal } from '../../fx/effects';
import { particles, col, smokePuff, debris } from '../../fx/particles';
import { addShake, kickFov } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { hurtPropsIn, PROP_DAMAGE, type Prop } from '../../world/destructible';
import { gainFrenzy } from '../frenzy';
import { fistMark } from './savageFists';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'range' | 'speed'>;

/** the push-off before it goes, and the stop after it (s): with its run (`range` / `speed`, 0.27 s) Bull Rush's shares
 *  of its whole, so the model's charge legs keyed to those carry it (models/warrior.ts `chargeLegs`) */
const BRACE = 0.1, HOLD = 0.27;
/** it meets what comes within this of its middle, past the foe's size (m) */
const REACH = 1.1;
const DUST = 0x2a241c, BLOOD = 0xff3a1a;
/** blood as it shows (linear: drops dark, the mist a little brighter), drawn blended, not as light: from play, "blood
 *  rush need a visual efffect to indicate some hint on blood" (its trail was orange sparks and dust) */
const GORE = { drop: 0x9a0808, mist: 0xa81414 };

/**
 * Blood thrown from `at` along `dir` (flat): `count` drops flung on and up that fall and lie a moment where they land,
 * and a puff of red mist hanging where they left. Blended, so it reads as blood whatever the light, and adds no light.
 */
function bloodSpray(at: { x: number; y: number; z: number }, dir: THREE.Vector3, count: number): void {
  for (let i = 0; i < count; i++) {
    const s = rand(2, 6), side = rand(-1.6, 1.6);
    particles.smoke.spawn({
      x: at.x + rand(-0.12, 0.12), y: at.y + rand(-0.15, 0.15), z: at.z + rand(-0.12, 0.12),
      vx: dir.x * s - dir.z * side, vy: rand(0.5, 3.5), vz: dir.z * s + dir.x * side,
      life: rand(0.8, 1.2), size: rand(0.06, 0.13), sizeEnd: 0.05, color: col(GORE.drop), alpha: 0.95, gravity: 16, drag: 0.6,
    });
  }
  smokePuff(at, { count: 5, color: GORE.mist, alpha: 0.55, size: 0.45, sizeEnd: 1.3, life: 0.6, speed: 1.2, rise: 0.2 });
}

/** The way covered by `u` of the dash: nothing while it braces, then flat out, slowing over its last fifth. */
function pace(brace: number): (u: number) => number {
  return (u) => {
    if (u <= brace) return 0;
    const x = (u - brace) / (1 - brace);
    return x < 0.8 ? x / 0.9 : (0.8 + (x - 0.8) * (1 - (x - 0.8) / 0.4)) / 0.9;
  };
}

const skill: InstantSkill = {
  anim: 'bloodrush',
  dashes: true,
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical', note: 'each foe it passes through, once' }],
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const dir = new THREE.Vector3(target.x - player.pos.x, 0, target.z - player.pos.z);
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    dir.normalize();
    const run = def.range / def.speed, dur = BRACE + run;
    const hit = new Set<Enemy>(), struck = new Set<Prop>();
    let built = 0, launched = false, dust = 0;
    sfx.bullRush(BRACE, run);
    player.startDash(dir, def.range / dur, dur, { anim: 'bloodrush', hold: HOLD, pace: pace(BRACE / dur), step: () => {
      const p = player.pos, d = player.dash;
      if (!d || d.t < BRACE || d.t > d.dur) return;
      if (!launched) {
        launched = true;
        const back = { x: p.x - dir.x * 0.4, y: 0, z: p.z - dir.z * 0.4 };
        shockwave(back, { color: BLOOD, intensity: 1, from: 0.2, to: 1.4, life: 0.25 });
        debris(back, { count: 8, speed: 4 });
        smokePuff(back, { count: 6, color: DUST, alpha: 0.5, size: 0.7, sizeEnd: 2, speed: 2.5 });
        sfx.bullLaunch();
        bloodSpray({ x: p.x, y: 1.1, z: p.z }, dir, 8);
      }
      if (player.local) kickFov(6);
      // dust thrown up behind, and a red haze of his blood streaming off him, a drop now and then falling from it (no
      // glowing sparks: red light read as embers, not blood)
      if ((dust -= G.dt) <= 0) {
        dust = 0.04;
        smokePuff({ x: p.x - dir.x * 0.4, y: 0, z: p.z - dir.z * 0.4 }, { count: 1, color: DUST, alpha: 0.4, size: 0.5, sizeEnd: 1.6, life: 0.7, speed: 0.6 });
        decal(p, { type: 'scorch', size: 0.6, life: 2, opacity: 0.35 });
        particles.smoke.spawn({
          x: p.x - dir.x * 0.3 + rand(-0.2, 0.2), y: rand(0.8, 1.5), z: p.z - dir.z * 0.3 + rand(-0.2, 0.2),
          vx: -dir.x * rand(2, 4), vy: rand(0, 0.4), vz: -dir.z * rand(2, 4),
          life: rand(0.35, 0.55), size: rand(0.35, 0.55), sizeEnd: 1.1, color: col(GORE.mist), alpha: 0.42, drag: 3,
        });
        particles.smoke.spawn({
          x: p.x + rand(-0.25, 0.25), y: rand(0.9, 1.4), z: p.z + rand(-0.25, 0.25),
          vx: -dir.x * rand(1, 3), vy: rand(0, 1), vz: -dir.z * rand(1, 3),
          life: 0.9, size: rand(0.05, 0.09), sizeEnd: 0.04, color: col(GORE.drop), alpha: 0.95, gravity: 16, drag: 0.6,
        });
      }
      hurtPropsIn(player, p.x, p.z, REACH, PROP_DAMAGE.trample, struck);
      for (const e of G.enemies) {
        if (!e.alive || hit.has(e) || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > REACH + e.radius) continue;
        hit.add(e);
        if (evades(e, player, { kind: 'rush', x: p.x, z: p.z, way: dir, half: REACH })) continue;
        // (struck along the dash as he passes: what it kills is thrown on that way)
        const dealt = hitEnemy(e, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', knock: 3, from: p, blow: { dir, lift: 0.3 } });
        fistMark(e, player.frenzy, 8);
        // (blood thrown on from what he hit, along his way)
        bloodSpray({ x: e.pos.x, y: e.height * 0.6, z: e.pos.z }, dir, 22);
        sfx.bullHit();
        if (player.local) addShake(0.12);
        if (dealt > 0 && !player.sandbox && built < (def.frenzyMost ?? Infinity)) { built++; gainFrenzy(player, def.frenzy ?? 0); }
      }
    } });
  },
};

export default skill;
