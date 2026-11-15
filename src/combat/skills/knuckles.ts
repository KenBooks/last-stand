// Bare Knuckles: the warrior with both hands empty. Quick straight punches, the left then the right, each striking
// what stands close before him and restoring energy as it lands: less reach and less in a blow than a weapon's cut,
// more of them a second.
import { particles, col } from '../../fx/particles';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

/** casts whose punch is already heard (its air starts with the punch and peaks as the fist lands) */
const thrown = new WeakSet<object>();

/** Where a fist lands on a foe: a puff of dust and sweat knocked off it (a blade's sparks are steel's). */
export function fistMark(e: Enemy, n = 5): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(1, 3.5);
    particles.glow.spawn({
      x: e.pos.x, y: e.height * 0.6, z: e.pos.z, vx: Math.cos(a) * s, vy: rand(0.5, 2.5), vz: Math.sin(a) * s,
      life: rand(0.15, 0.3), size: rand(0.05, 0.1), sizeEnd: 0, color: col(0xd8c8b0, 1.1), colorEnd: col(0x5a4a3a, 0.2), gravity: 9, drag: 3,
    });
  }
}

const skill: InstantSkill = {
  anim: 'punch',
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical' }],
  charging(player) {
    const c = player.casting;
    if (c && !thrown.has(c)) { thrown.add(c); sfx.punch(c.fireAt - c.t, -(player.model.swing ?? 1)); }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    // the way the body (and so the punch) faces, which turned to the target during the cast
    const facing = player.facing;
    // (a straight blow: what it kills goes back along it, struck through its middle)
    const blow = { dir: { x: Math.sin(facing), z: Math.cos(facing) }, lift: 0.2 };
    const hits = sweep(player, def, facing, { knock: def.knock, blow, mark: fistMark });
    if (hits) {
      sfx.punchLand(-(player.model.swing ?? 1));
      addShake(0.05);
      if (!player.sandbox) player.energy = Math.min(player.stats.maxEnergy, player.energy + (def.gain ?? 0) * hits);
    }
  },
};

export default skill;
