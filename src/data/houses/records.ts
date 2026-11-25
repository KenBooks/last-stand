// The house of records (its room built by world/houses/records.ts): its cottage, its room's size and what stands in it
// to use. Read by data/houses.ts with every other house's file in this folder.
import type { House } from '../houses';

declare module '../houses' {
  interface RoomIds { records: true }
}

/**
 * The places the house of records shows trophies at (each kind's in the order a trophy takes them where its data names
 * none; world/houses/records.ts says where each stands): four shields on the back wall, the two by the tapestry first,
 * then the two outer; six stands in the trophy cabinet against the east wall, two a shelf, its middle shelf first.
 * Every place is built whether a trophy takes it or not, as a mount or a stand waiting. The bosses to come take theirs
 * by name (`TrophyDef.place`): the Rootmother `wall-outer-left`, the Stag of Ash `wall-outer-right`, the Bell-Warden
 * `shelf-middle-right`, the Ossuary Cantor `shelf-top-left`.
 */
export const TROPHY_PLACES = {
  wall: ['wall-inner-left', 'wall-inner-right', 'wall-outer-left', 'wall-outer-right'],
  cabinet: ['shelf-middle-left', 'shelf-middle-right', 'shelf-top-left', 'shelf-top-right', 'shelf-low-left',
    'shelf-low-right'],
} as const;

export const HOUSE: House = {
  // (the cottage nearest the notice board, beside the Thornwood's road: from play, its pick)
  id: 'records', cottage: 0, name: 'House of Records', half: [4.6, 3.6], high: 3.3,
  objects: ([rx, rz]) => [
    // (the great ledger on its lectern, before the trophies)
    { id: 'ledger', use: 'records', at: [0, -0.9], reach: 1.9, stand: [0, 0.4], label: 1.45, tall: 1.6,
      name: 'Great Ledger', verb: 'Read the records' },
    // (the Chronicle's own lectern, at home here: the save slots, as the one on the hall's porch)
    { id: 'roomChronicle', use: 'chronicle', at: [-rx + 0.9, rz - 1.6], reach: 1.7, stand: [-rx + 2.0, rz - 1.6],
      label: 1.5, tall: 1.6, name: 'Chronicle', verb: 'Save slots' },
  ],
};
