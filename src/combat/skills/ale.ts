// The Ember & Oak's ale (data/tavern.ts), drunk as the keeper slides it across the bar: every hero knows it off his
// bar (`Player.skillOf`), so a co-op partner's game replays the cast and shows the drink. Drinking is the hero's
// model's (models/flask.ts, its `ale` beats: the mug off the bar, three long swallows, the mouth wiped); here are its
// sounds, timed from the cast as it fires at its start, and its one touch after: a contented breath, foam flecks
// at his lips and an "Ahh". It grants nothing.
import { schedule } from '../../core/timers';
import { sfx } from '../../core/audio';
import { floatText } from '../../ui/floaters';
import { particles, col } from '../../fx/particles';
import { G } from '../../state';
import { ALE_BEATS } from '../../data/tavern';
import { rand } from '../../util';
import type { InstantSkill } from './types';
import type { Player } from '../../entities/player';

/** how near the local hero a partner drinks for his game to play the sounds (m) */
const HEARD_WITHIN = 10;

/** whether `player` still drinks the ale (a stagger or his leaving cuts it short, and its sounds with it) */
const drinking = (player: Player): boolean => !!player.casting?.skill.def.ale;

const skill: InstantSkill = {
  anim: 'drink',
  cast(player, def) {
    const heard = player.local || (!!G.player && player.pos.distanceTo(G.player.pos) < HEARD_WITHIN);
    const long = def.castTime, fired = def.fireAt ?? 0;
    const at = (share: number): number => Math.max(0, (share - fired) * long);
    for (const share of ALE_BEATS.gulps) schedule(at(share), () => { if (heard && drinking(player)) sfx.aleGulp(); });
    schedule(at(ALE_BEATS.sigh), () => {
      if (!drinking(player)) return;
      if (heard) sfx.aleSigh();
      floatText(player.pos.x, 2.2, player.pos.z, 'Ahh!', 'info', '#f0c060');
      // (a few flecks of foam off his lips as he wipes them)
      // (his mouth: a man's height to the lips, a hand before his face)
      const f = player.facing, mouth = { x: player.pos.x + Math.sin(f) * 0.12, y: player.obj.position.y + 1.6, z: player.pos.z + Math.cos(f) * 0.12 };
      for (let i = 0; i < 8; i++) {
        particles.glow.spawn({
          x: mouth.x + rand(-0.05, 0.05), y: mouth.y + rand(-0.02, 0.04), z: mouth.z + rand(-0.05, 0.05),
          vx: rand(-0.3, 0.3), vy: rand(0.1, 0.5), vz: rand(-0.3, 0.3), life: rand(0.4, 0.8), size: rand(0.012, 0.022),
          sizeEnd: 0, color: col(0xfff4e0, 0.7), colorEnd: col(0xffe8c0, 0.1), gravity: 1.5, drag: 1,
        });
      }
    });
  },
};

export default skill;
