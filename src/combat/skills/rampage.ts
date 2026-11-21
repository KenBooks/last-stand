// Rampage: the warrior with both hands empty (#400). Held, a flurry of punches as he walks on, the lead hand and the
// rear in turn, each striking what stands within `range` before him: `damage` a second at its own pace, quicker for
// his casting speed and his Frenzy as every attack is (`Player.haste`). Each blow that lands builds a stack of Frenzy,
// and none decays while it's held (`SkillDef.frenzyHolds`, combat/frenzy.ts). It builds as it's held: 5% more damage
// and 5% more Energy drained for each second, up to half as much again (`RAMPAGE`).
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { gainFrenzy } from '../frenzy';
import { CLEAN_HIT, FRENZY, RAMPAGE } from '../../data/balance';
import { sweep } from './cleave';
import { cleanHit, fistMark, punchDrive, punchSharp } from './savageFists';
import type { ChannelSkill, Needs } from './types';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

interface RampageState {
  /** blows thrown so far, and the time into the next (s, at his haste's pace) */
  blows: number; into: number;
  /** how long it has been held (s) */
  held: number;
}

/** how much more of its damage and its drain Rampage has, held `held` s */
const builtUp = (held: number): number => 1 + Math.min(RAMPAGE.most, RAMPAGE.perSecond * held);

/** a blow every this long at the skill's own pace (s); the share of a blow's time it lands at */
const PACE = 0.2, LANDS = 0.5;

const skill: ChannelSkill<RampageState> = {
  anim: 'rampage',
  channel: true,
  // (each blow its share of the damage a second at the skill's own pace, thrown faster at a higher casting speed)
  hits(rawDef, stats) {
    const def = rawDef as Def;
    const rate = (1 + stats.castSpeed / 100) / PACE, top = 1 + RAMPAGE.most, clean = 1 + CLEAN_HIT.bonus;
    const most = `${Math.round(RAMPAGE.most * 100)}%`, each = `${Math.round(RAMPAGE.perSecond * 100)}%`;
    // (each from its first blow's to its most, held long: a blow partway between falls inside it)
    const held = Math.round(RAMPAGE.most / RAMPAGE.perSecond);
    const built = `at its most, held ${held} s: ${each} more each second held, up to ${most}`;
    return [
      { per: 'blow', base: def.damage * PACE * top, least: 1 / top, rate, type: 'physical', note: built },
      { per: 'clean blow', base: def.damage * PACE * top * clean, least: 1 / top, rate, type: 'physical', note: "at arm's length" },
    ];
  },
  start: () => ({ blows: 0, into: 0, held: 0 }),
  drainScale: (st) => builtUp(st.held),
  pose(_player, _def, st, action) { action.beat = st.blows + st.into / PACE; },
  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    const before = st.into, land = PACE * LANDS;
    st.held += dt;
    // (each blow heard as it's thrown, its air peaking as it lands)
    if (before === 0) sfx.punch(land / player.haste, st.blows % 2 ? 1 : -1);
    st.into += dt * player.haste;
    if (before < land && st.into >= land) {
      const heat = player.frenzy, way = { x: Math.sin(player.facing), z: Math.cos(player.facing) };
      const hits = sweep(player, { ...def, damage: def.damage * PACE * builtUp(st.held) }, player.facing, {
        knock: def.knock, blow: { dir: way, lift: 0.2 }, scale: cleanHit, sharp: punchSharp(punchDrive(player, player.facing)), mark: (e, k) => fistMark(e, heat, k > 1 ? 8 : 4),
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
