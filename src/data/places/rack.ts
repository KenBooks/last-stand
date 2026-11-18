// The weapons rack before the yard's fence, where a party sets up a duel (game/duel.ts): its object, what the hero
// walks to and uses (its use, `pvp`, is registered by its owner, game/villageUses.ts). Read by data/village.ts with
// every other place's file in this folder.
import { RACK, type VillageObject } from '../village';

/** Its object, made as data/village.ts lists every place's (its spots read then, once the plan is made). */
export const place = (): VillageObject => ({
  // (stood before its swords, on the square's side)
  id: 'rack', use: 'pvp', at: [RACK.x, RACK.z], reach: 2.2,
  stand: [RACK.x + Math.sin(RACK.facing) * 1.4, RACK.z + Math.cos(RACK.facing) * 1.4], label: 1.72, tall: 1.8,
  name: 'Weapons Rack', verb: 'Set up a duel',
});
