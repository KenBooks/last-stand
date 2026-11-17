// Savage Fists: the warrior with both hands empty (#400). Punches, the lead hand then the rear in turn, each striking
// what stands close before him, restoring Energy and building a stack of Frenzy as it lands (combat/frenzy.ts): less
// reach and less in a blow than a weapon's cut, more of them a second, and quicker the more Frenzy he has. At
// `FRENZY.hammer` stacks every `FRENZY.third` blow is a two-fisted hammer brought down on what's before him, heavier.
// With a shield and no weapon the free hand punches alone (its style's tuning, lighter, and no Frenzy).
import { particles, col, smokePuff } from '../../fx/particles';
import { shockwave } from '../../fx/effects';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { FRENZY } from '../../data/balance';
import { gainFrenzy } from '../frenzy';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

/** casts whose punch is already heard (its air starts with the punch and peaks as the fist lands) */
const thrown = new WeakSet<object>();
/** each hero's blows so far (a hammer every `FRENZY.third` at full Frenzy), and the form of each cast (1 a hammer) */
const blows = new WeakMap<Player, number>(), forms = new WeakMap<object, number>();

/** The colour of what flies off a blow at `frenzy` stacks: dust and sweat, hotter, then embers. */
export function heatOf(frenzy: number): number {
  return frenzy >= FRENZY.cap ? 0xff5a2a : frenzy >= FRENZY.slam ? 0xffa060 : 0xd8c8b0;
}

/** Where a fist lands on a foe: a puff of dust and sweat knocked off it (a blade's sparks are steel's), embers with
 *  the Frenzy hot. */
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

/** This cast's form, chosen as it begins: a hammer every `FRENZY.third` blow at full Frenzy, else a punch (0). */
function formOf(player: Player): number {
  const c = player.casting;
  if (!c) return 0;
  let form = forms.get(c);
  if (form === undefined) {
    const n = (blows.get(player) ?? 0) + 1;
    blows.set(player, n);
    form = player.frenzy >= FRENZY.hammer && n % FRENZY.third === 0 ? 1 : 0;
    forms.set(c, form);
  }
  return form;
}

const skill: InstantSkill = {
  anim: 'punch',
  hits: (def) => [
    { per: 'foe', base: (def as Def).damage, type: 'physical' },
    { per: 'hammer', base: (def as Def).damage * FRENZY.hammerK, type: 'physical', note: `one blow in ${FRENZY.third} at ${FRENZY.hammer} Frenzy` },
  ],
  pose(player, _def, action) { action.form = formOf(player); },
  charging(player) {
    const c = player.casting;
    formOf(player);
    if (c && !thrown.has(c)) { thrown.add(c); sfx.punch(c.fireAt - c.t, -(player.model.swing ?? 1)); }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    const hammer = formOf(player) === 1;
    // the way the body (and so the punch) faces, which turned to the target during the cast
    const facing = player.facing, dir = { x: Math.sin(facing), z: Math.cos(facing) };
    // (a straight blow: what it kills goes back along it, struck through its middle; a hammer drives it down)
    const blow = hammer ? { dir, lift: -0.3, at: 0.9 } : { dir, lift: 0.2 };
    const tuned = hammer ? { ...def, damage: def.damage * FRENZY.hammerK, arc: def.arc * 1.4 } : def;
    const heat = player.frenzy;
    const hits = sweep(player, tuned, facing, { knock: hammer ? def.knock * 3 : def.knock, blow, mark: (e) => fistMark(e, heat, hammer ? 10 : 5) });
    if (hammer) {
      const at = { x: player.pos.x + dir.x * 1.3, y: 0, z: player.pos.z + dir.z * 1.3 };
      shockwave(at, { color: heatOf(heat), intensity: 1, from: 0.2, to: 1.6, life: 0.25 });
      smokePuff(at, { count: 5, color: 0x2a241c, alpha: 0.45, size: 0.6, sizeEnd: 1.6, speed: 2 });
    }
    if (!hits) return;
    sfx.punchLand(-(player.model.swing ?? 1));
    addShake(hammer ? 0.18 : 0.05);
    if (player.sandbox) return;
    player.energy = Math.min(player.stats.maxEnergy, player.energy + (def.gain ?? 0) * hits);
    gainFrenzy(player, def.frenzy ?? 0);
  },
};

export default skill;
