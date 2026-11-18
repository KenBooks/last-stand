// Odo's Wares, the merchant's shop (its room built by world/houses/merchant.ts): its cottage, its room's size and what
// stands in it to use. Read by data/houses.ts with every other house's file in this folder.
import type { House } from '../houses';

declare module '../houses' {
  interface RoomIds { merchant: true }
}

export const HOUSE: House = {
  // (the cottage on the Thornwood's road by the campfire, where a party passes on its way to the portal and back: from
  // play, "add merchant in another house... sell gear in exchange for other gear")
  id: 'merchant', cottage: 3, name: "Odo's Wares", half: [4.6, 3.8], high: 3.2,
  objects: ([, mz]) => [
    // (the merchant behind his counter across the back of his shop: gear for gear)
    { id: 'shopCounter', use: 'merchant', at: [0, -mz + 1.5], reach: 2.0, stand: [0, -mz + 2.6], label: 1.9,
      tall: 2.0, name: 'Odo the Merchant', verb: 'Trade gear' },
  ],
};
