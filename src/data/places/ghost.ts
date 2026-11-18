// The ghost by the training yard's gate: the training grounds (game/ghost.ts): its object, what the hero walks to and
// uses (its use, `training`, is registered by its owner, game/villageUses.ts). Read by data/village.ts with every other
// place's file in this folder.
import { GHOST, type VillageObject } from '../village';

/** Its object, made as data/village.ts lists every place's (its spots read then, once the plan is made). */
export const place = (): VillageObject => ({
  // (stood before it, on the road's side)
  id: 'ghost', use: 'training', at: [GHOST.x, GHOST.z], reach: 2.4,
  stand: [GHOST.x + Math.sin(GHOST.facing) * 1.5, GHOST.z + Math.cos(GHOST.facing) * 1.5], label: 2.0, tall: 2.0,
  name: 'Sparring Shade', verb: 'Enter the training grounds',
});
