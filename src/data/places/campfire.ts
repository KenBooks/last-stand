// The campfire, where a party gathers to play together (ui/coop.ts): its object, what the hero walks to and uses (its
// use, `coop`, is registered by its owner, game/villageUses.ts). Read by data/village.ts with every other place's file
// in this folder.
import { CAMPFIRE, type VillageObject } from '../village';

/** Its object, made as data/village.ts lists every place's (its spots read then, once the plan is made). */
export const place = (): VillageObject => ({
  id: 'campfire', use: 'coop', at: CAMPFIRE, reach: 2.8, stand: [CAMPFIRE[0] + 1.9, CAMPFIRE[1] - 0.4], label: 0.6, tall: 1.8,
  name: 'Campfire', verb: 'Play together',
});
