// The library (its room built by world/houses/library.ts): its cottage, its room's size, what stands in it to use,
// and where its scholar sits. Read by data/houses.ts with every other house's file in this folder.
import type { House } from '../houses';
import type { VillageObject } from '../village';

declare module '../houses' {
  interface RoomIds { library: true }
}

/** Brother Hollis's reading table in the library (world/houses/library.ts): where his chair stands (x, z in the room's
 *  frame) and how it's turned (rad about y: 0 faces +z, the door), towards the room's middle, so he's seen from the
 *  door. */
export const SCHOLAR_DESK = { x: -2.9, z: 0.6, turn: 0.5 };

/** which of his rounds Brother Hollis goes on that can be switched off (world/scholarRounds.ts): dusting a case, off for
 *  now, from play: "Remove dusting for Hollis, just have it disabled for now. Only picking books." Off, he never dusts
 *  and his cloth isn't built; its code, its lab part and its guide's words are kept for it to come back. */
export const SCHOLAR_DOES = { dust: false };

/** Brother Hollis at his reading table: talked to across it. */
function scholar(): Omit<VillageObject, 'room'> {
  const { x, z, turn } = SCHOLAR_DESK, c = Math.cos(turn), s = Math.sin(turn);
  return { id: 'scholar', use: 'talk', at: [x + s * 0.1, z + c * 0.1], reach: 2.4,
    stand: [x + s * 1.45, z + c * 1.45], label: 1.62, tall: 1.5, name: 'Brother Hollis', verb: 'Talk' };
}

export const HOUSE: House = {
  // (the cottage south of the square, between the campfire and the training yard: where a new hero learns, the yard
  // a few steps off; its door toward the square. From play: "add library to one of the village houses")
  id: 'library', cottage: 4, name: 'Library', half: [5.6, 4.2], high: 3.8,
  objects: ([, lz]) => [
    // (the library's great book on its lectern before the back wall's shelves: the in-game guide)
    { id: 'codex', use: 'guide', at: [0, -lz + 1.6], reach: 1.9, stand: [0, -lz + 2.9], label: 1.55, tall: 1.7,
      name: 'Codex of Wardenhollow', verb: 'Read the guide' },
    scholar(),
  ],
};
