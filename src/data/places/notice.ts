// The notice board by the Thornwood's road: how to play: its object, what the hero walks to and uses (its use, `help`,
// is registered by its owner, game/villageUses.ts). Read by data/village.ts with every other place's file in this
// folder.
import { NOTICE, type VillageObject } from '../village';

/** Its object, made as data/village.ts lists every place's (its spots read then, once the plan is made). */
export const place = (): VillageObject => ({
  id: 'notice', use: 'help', at: [NOTICE.x, NOTICE.z], reach: 2.4,
  stand: [NOTICE.x + Math.sin(NOTICE.facing) * 1.4, NOTICE.z + Math.cos(NOTICE.facing) * 1.4], label: 0.95, tall: 2.6,
  name: 'Notice board', verb: 'How to play',
});
