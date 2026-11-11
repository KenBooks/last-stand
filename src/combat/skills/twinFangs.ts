// Twin Fangs: a weapon in each hand. An instant lunge at the aim and two quick crossing strikes, right
// then left, each hitting hard in a narrow arc in front.
import * as THREE from 'three';
import { schedule } from '../../core/timers';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Player } from '../../entities/player';
import { FANGS } from '../../data/balance';
import { tunable } from '../../core/tuning';

type Def = Needs<'damage' | 'range' | 'arc'>;

/** how far short of the aim the lunge stops (the strikes reach the rest), and how far it goes at most (m) */
const SHORT = 1.3, MAX_LUNGE = 2.2;
// (its timing, the lunge's and the strikes', which the model's 'flurry' keys its cuts to: `lab --tune twinFangs.apart=0.1`)
tunable('twinFangs', FANGS);

function strike(player: Player, def: Def, i: number): void {
  if (!player.alive) return;
  const facing = player.facing;
  // the right blade cuts down from high on the right, the left one mirrors it, each marked by the trail it leaves
  // alone (fx/swingTrail.ts)
  const s = i === 0 ? 1 : -1;
  // (each cut drives what it kills along it, and down: it comes from high)
  if (sweep(player, def, facing, { knock: 1.2, swing: s, lift: 0.12 })) { sfx.fangBite(i); addShake(0.1 + i * 0.05); }
}

const skill: InstantSkill = {
  anim: 'flurry',
  hits: (def) => [{ per: 'cut', base: (def as Def).damage, type: 'physical', note: 'two cuts, each on every foe it reaches' }],
  // (its lunge cast in Bull Rush's charge rides on it: the cuts land as it runs, `Player.startDash`)
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const p = player.pos;
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    const dir = d > 1e-3 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    // closes in on the aim, but never runs past it
    const lunge = Math.min(MAX_LUNGE, Math.max(0, d - SHORT));
    sfx.fangs(FANGS.first, FANGS.apart);
    player.startDash(dir, lunge / FANGS.lunge, FANGS.lunge, { anim: 'flurry', hold: FANGS.hold });
    [FANGS.first, FANGS.first + FANGS.apart].forEach((at, i) => schedule(at, () => strike(player, def, i)));
  },
};

export default skill;
