// Savage Fists: the warrior with both hands empty (#400). Punches, the lead hand then the rear in turn, each striking
// what stands close before him, restoring Energy and building a stack of Frenzy as it lands (combat/frenzy.ts): less
// reach and less in a blow than a weapon's cut, more of them a second, and quicker the more Frenzy he has. (At full
// Frenzy every third blow was a two-fisted hammer, taken out: from play, "lets remove two handed strike under
// freenzy, it makes no sense, practically".)
// With a shield and no weapon the free hand punches alone (its style's tuning, lighter, and no Frenzy).
import { particles, col } from '../../fx/particles';
import { addShake, rollView } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { CLEAN_HIT, FRENZY } from '../../data/balance';
import { gainFrenzy } from '../frenzy';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

/** how far the view through the eyes rolls with a punch's shoulders as it lands (rad) */
const ROLL = { jab: 0.018, cross: 0.04 };

/** casts whose punch is already heard (its air starts with the punch and peaks as the fist lands) */
const thrown = new WeakSet<object>();

/** The colour of what flies off a blow at `frenzy` stacks: dust and sweat, hotter, then embers. */
export function heatOf(frenzy: number): number {
  return frenzy >= FRENZY.cap ? 0xff5a2a : frenzy >= FRENZY.slam ? 0xffa060 : 0xd8c8b0;
}

/** Where a fist lands on a foe: a puff of dust and sweat knocked off it (a blade's sparks are steel's), embers with
 *  the Frenzy hot. */
/** A punch's share of its damage on a foe whose edge is `gap` m from his middle: its clean hit's (`CLEAN_HIT`) at
 *  the end of the arm's reach, else whole. */
export const cleanHit = (gap: number): number => (gap >= CLEAN_HIT.from && gap <= CLEAN_HIT.to ? 1 + CLEAN_HIT.bonus : 1);

export function fistMark(e: Enemy, frenzy = 0, n = 5): void {
  const hot = heatOf(frenzy);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(1, 3.5);
    particles.glow.spawn({
      x: e.pos.x, y: e.height * 0.6, z: e.pos.z, vx: Math.cos(a) * s, vy: rand(0.5, 2.5), vz: Math.sin(a) * s,
      life: rand(0.15, 0.3), size: rand(0.05, 0.1), sizeEnd: 0, color: col(hot, 1.1), colorEnd: col(0x5a4a3a, 0.2),
      gravity: 9, drag: 3,
    });
  }
}

const skill: InstantSkill = {
  anim: 'punch',
  hits: (def) => [
    { per: 'foe', base: (def as Def).damage, type: 'physical' },
    { per: 'clean hit', base: (def as Def).damage * (1 + CLEAN_HIT.bonus), type: 'physical', note: 'at arm\'s length' },
  ],
  charging(player, _def, k) {
    const c = player.casting;
    // (through his own eyes the view tips with his shoulders as they turn behind the blow, a cross's further than a
    // jab's: the frame held dead level, the arm went out from a body that never moved)
    if (player.local) rollView(((player.model.swing ?? 1) > 0 ? -ROLL.jab : ROLL.cross) * k * k);
    if (c && !thrown.has(c)) { thrown.add(c); sfx.punch(c.fireAt - c.t, -(player.model.swing ?? 1)); }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    // the way the body (and so the punch) faces, which turned to the target during the cast
    const facing = player.facing, dir = { x: Math.sin(facing), z: Math.cos(facing) };
    const heat = player.frenzy;
    // (a straight blow: what it kills goes back along it, struck through its middle; a clean hit at arm's length lands
    // harder, and throws twice the spray)
    const hits = sweep(player, def, facing, {
      knock: def.knock, blow: { dir, lift: 0.2 }, scale: cleanHit,
      mark: (e, k) => fistMark(e, heat, 5 * (k > 1 ? 2 : 1)),
    });
    if (!hits) return;
    // (heavier as the Frenzy rises, a grunt now and then with a blow at high Frenzy)
    const hot = heat / FRENZY.cap;
    sfx.punchLand(-(player.model.swing ?? 1), hot);
    if (hot >= 0.5 && Math.random() < 0.3) sfx.grunt(hot);
    addShake(0.05);
    if (player.sandbox) return;
    player.energy = Math.min(player.stats.maxEnergy, player.energy + (def.gain ?? 0) * hits);
    gainFrenzy(player, def.frenzy ?? 0);
  },
};

export default skill;
