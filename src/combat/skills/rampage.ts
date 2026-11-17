// Rampage: the warrior with both hands empty (#400). Held, a flurry of punches as he walks on, the lead hand and the
// rear in turn, each striking what stands within `range` before him: `damage` a second at its own pace, quicker for
// his casting speed and his Frenzy as every attack is (`Player.haste`). Each blow that lands builds a stack of Frenzy,
// and none decays while it's held (`SkillDef.frenzyHolds`, combat/frenzy.ts).
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { gainFrenzy } from '../frenzy';
import { FRENZY } from '../../data/balance';
import { sweep } from './cleave';
import { fistMark } from './savageFists';
import type { ChannelSkill, Needs } from './types';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

interface RampageState {
  /** blows thrown so far, and the time into the next (s, at his haste's pace) */
  blows: number; into: number;
}

/** a blow every this long at the skill's own pace (s); the share of a blow's time it lands at */
const PACE = 0.2, LANDS = 0.5;

const skill: ChannelSkill<RampageState> = {
  anim: 'rampage',
  channel: true,
  // (each blow its share of the damage a second at the skill's own pace, thrown faster at a higher casting speed)
  hits(rawDef, stats) {
    const def = rawDef as Def;
    return [{ per: 'blow', base: def.damage * PACE, rate: (1 + stats.castSpeed / 100) / PACE, type: 'physical', note: 'thrown faster at a higher casting speed and with Frenzy' }];
  },
  start: () => ({ blows: 0, into: 0 }),
  pose(_player, _def, st, action) { action.beat = st.blows + st.into / PACE; },
  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    const before = st.into, land = PACE * LANDS;
    // (each blow heard as it's thrown, its air peaking as it lands)
    if (before === 0) sfx.punch(land / player.haste, st.blows % 2 ? 1 : -1);
    st.into += dt * player.haste;
    if (before < land && st.into >= land) {
      const heat = player.frenzy, way = { x: Math.sin(player.facing), z: Math.cos(player.facing) };
      const hits = sweep(player, { ...def, damage: def.damage * PACE }, player.facing, {
        knock: def.knock, blow: { dir: way, lift: 0.2 }, mark: (e) => fistMark(e, heat, 4),
      });
      if (hits) {
        sfx.punchLand(st.blows % 2 ? 1 : -1, heat / FRENZY.cap);
        if (heat >= FRENZY.cap / 2 && Math.random() < 0.25) sfx.grunt(heat / FRENZY.cap);
        if (player.local) addShake(0.04);
        if (!player.sandbox) gainFrenzy(player, def.frenzy ?? 0);
      }
    }
    if (st.into >= PACE) {
      st.into -= PACE;
      st.blows++;
      sfx.punch(Math.max(0, land - st.into) / player.haste, st.blows % 2 ? 1 : -1);
    }
  },
  stop() {},
};

export default skill;
