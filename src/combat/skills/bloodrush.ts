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
      }
      if (player.local) kickFov(6);
      // dust thrown up behind and red streaks of his heat streaming off him
      if ((dust -= G.dt) <= 0) {
        dust = 0.04;
        smokePuff({ x: p.x - dir.x * 0.4, y: 0, z: p.z - dir.z * 0.4 }, { count: 1, color: DUST, alpha: 0.4, size: 0.5, sizeEnd: 1.6, life: 0.7, speed: 0.6 });
        decal(p, { type: 'scorch', size: 0.6, life: 2, opacity: 0.35 });
      }
      for (let i = 0; i < 3; i++) particles.glow.spawn({
        x: p.x + rand(-0.3, 0.3), y: rand(0.6, 1.6), z: p.z + rand(-0.3, 0.3),
        vx: -dir.x * rand(5, 9), vy: rand(0, 0.8), vz: -dir.z * rand(5, 9),
        life: rand(0.12, 0.22), size: rand(0.03, 0.06), sizeEnd: 0, color: col(0xff8050, 1.6), colorEnd: col(0x601008, 0.2),
      });
      hurtPropsIn(player, p.x, p.z, REACH, PROP_DAMAGE.trample, struck);
      for (const e of G.enemies) {
        if (!e.alive || hit.has(e) || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > REACH + e.radius) continue;
        hit.add(e);
        if (evades(e, player, { kind: 'rush', x: p.x, z: p.z, way: dir, half: REACH })) continue;
        // (struck along the dash as he passes: what it kills is thrown on that way)
        const dealt = hitEnemy(e, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', knock: 3, from: p, blow: { dir, lift: 0.3 } });
        fistMark(e, player.frenzy, 8);
        sfx.bullHit();
        if (player.local) addShake(0.12);
        if (dealt > 0 && !player.sandbox && built < (def.frenzyMost ?? Infinity)) { built++; gainFrenzy(player, def.frenzy ?? 0); }
      }
    } });
  },
};

export default skill;
