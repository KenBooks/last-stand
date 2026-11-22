// The house of records (its room built by world/houses/records.ts): its cottage, its room's size and what stands in it
// to use. Read by data/houses.ts with every other house's file in this folder.
import type { House } from '../houses';

declare module '../houses' {
  interface RoomIds { records: true }
}

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
