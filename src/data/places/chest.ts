// The stash's chest at the hall's entrance (world/village.ts builds it): its object, what the hero walks to and uses
// (its use, `stash`, is registered by its owner, game/villageUses.ts). Read by data/village.ts with every other place's
// file in this folder.
import { CHEST, type VillageObject } from '../village';

/** Its object, made as data/village.ts lists every place's (its spots read then, once the plan is made). */
export const place = (): VillageObject => ({
  // (stood before it, on the porch)
  id: 'chest', use: 'stash', at: [CHEST.x, CHEST.z], reach: 2.2, stand: [CHEST.x, CHEST.z + 1.3], label: 0.03, tall: 1.4,
  name: 'Stash', verb: 'Open the stash',
});
