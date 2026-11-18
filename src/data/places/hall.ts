// The hall of heroes on its terrace, used inside before the plinths (game/hall.ts): its object, what the hero walks to
// and uses (its use, `heroes`, is registered by its owner, game/villageUses.ts). Read by data/village.ts with every
// other place's file in this folder.
import { HALL, TERRACE, type VillageObject } from '../village';

/** Its object, made as data/village.ts lists every place's (its spots read then, once the plan is made). */
export const place = (): VillageObject => ({
  // (inside, before the plinths: walked in through its door)
  id: 'hall', use: 'heroes', at: [TERRACE.x, HALL.daisZ - 0.6], reach: 3.4, stand: [TERRACE.x, HALL.daisZ + 1.4],
  label: 1.4, tall: 3.0,
  name: 'Hall of Heroes', verb: 'Choose your hero',
});
