// The Chronicle's lectern left of the hall's door: the save slots: its object, what the hero walks to and uses (its
// use, `chronicle`, is registered by its owner, game/villageUses.ts). Read by data/village.ts with every other place's
// file in this folder.
import { CHRONICLE, type VillageObject } from '../village';

/** Its object, made as data/village.ts lists every place's (its spots read then, once the plan is made). */
export const place = (): VillageObject => ({
  // (stood before it on the porch, as the chest's on the other side)
  id: 'chronicle', use: 'chronicle', at: [CHRONICLE.x, CHRONICLE.z], reach: 2.2, stand: [CHRONICLE.x, CHRONICLE.z + 1.2],
  label: 0.85, tall: 1.9, name: 'Chronicle', verb: 'Save slots',
});
