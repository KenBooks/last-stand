// Raise Shield: hold the shield up. While held, Player.tryBlock blocks every frontal hit (for def.block times the
// block amount), each block with its own sound. Raised, it shows and plays nothing of its own: the hero's pose is the
// sign (from the owner's review of #527: "remove sound from raising the shield, remove visual effect also"; a gold
// ward stood before him, flaring on each block, and a tap of stone played as he raised it).
import type { ChannelSkill } from './types';

const skill: ChannelSkill<Record<string, never>> = {
  anim: 'block',
  channel: true,
  start: () => ({}),
  tick: () => undefined,
  stop: () => undefined,
};

export default skill;
