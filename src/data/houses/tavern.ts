// The tavern, the Ember & Oak (its room built by world/houses/tavern.ts): its cottage, its room's size and what stands
// in it to use. Read by data/houses.ts with every other house's file in this folder.
import type { House } from '../houses';
import { BAR, KEEPER, KEEPER_SPOT } from '../tavern';

declare module '../houses' {
  interface RoomIds { tavern: true }
}

export const HOUSE: House = {
  // (the cottage east of the square, its door on the road to the Crypt's portal, where a party passes on its way to a
  // run: from play, the owner's pick on the village's map)
  id: 'tavern', cottage: 5, name: 'Ember & Oak', half: [5.4, 4.0], high: 3.2,
  objects: ([tx, tz]) => [
    // (the round table by the hearth, a map on it: Play together, the room flow the campfire opens)
    { id: 'partyTable', use: 'coop', at: [-tx + 2.2, -tz + 2.4], reach: 2.1, stand: [-tx + 2.2, -tz + 3.9],
      label: 1.25, tall: 1.4, name: 'Party Table', verb: 'Play together' },
    // (a board by the door, its notices the parties forming: the same)
    { id: 'partyBoard', use: 'coop', at: [tx - 0.15, tz - 1.7], reach: 1.8, stand: [tx - 1.3, tz - 1.7],
      label: 1.75, tall: 2.2, name: 'Party Board', verb: 'Play together' },
    // (the keeper behind his bar: talked to across it, a free ale poured)
    { id: 'keeper', use: 'talk', at: [KEEPER_SPOT.x, KEEPER_SPOT.z], reach: 2.2, stand: [BAR.x - 0.95, KEEPER_SPOT.z],
      label: 1.95, tall: 2.0, name: KEEPER.name, verb: 'Talk' },
  ],
};
