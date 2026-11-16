// The village's houses walked into (world/rooms.ts builds their rooms, game/rooms.ts takes the hero in and out): which
// cottage each is, its room's size and what stands in it to use, and the trophies the house of records hangs for the
// bosses beaten. A room is a small place of its own, shown in the village's stead as the hall of heroes' room is: the
// village is the heaviest place to draw, and a house seen open from it would add its inside to every frame there.
// A room's frame: x across it, z from its back wall (-) to its door (+), its middle at the origin, its floor at 0.
import type { EnemyId } from './enemies';
import { COTTAGES, type VillageObject } from './village';

export type RoomId = 'records' | 'tavern' | 'library' | 'merchant';
export const ROOM_IDS: readonly RoomId[] = ['records', 'tavern', 'library', 'merchant'];

/** A house: the cottage it is (its index in `COTTAGES`), its name, its room's inner half width and depth and height to
 *  its beams (m). Its door is the cottage's own, the middle of the room's front wall inside. */
export interface House { id: RoomId; cottage: number; name: string; half: [number, number]; high: number }

export const HOUSES: Record<RoomId, House> = {
  // (the cottage nearest the notice board, beside the Thornwood's road: from play, its pick)
  records: { id: 'records', cottage: 0, name: 'The House of Records', half: [4.6, 3.6], high: 3.3 },
  // (the cottage east of the square, its door on the road to the Crypt's portal, where a party passes on its way to a
  // run: from play, the owner's pick on the village's map)
  tavern: { id: 'tavern', cottage: 5, name: 'The Ember & Oak', half: [5.4, 4.0], high: 3.2 },
  // (the cottage south of the square, between the campfire and the training yard: where a new hero learns, the yard
  // a few steps off; its door toward the square. From play: "add library to one of the village houses")
  library: { id: 'library', cottage: 4, name: 'The Library', half: [5.6, 4.2], high: 3.8 },
  // (the cottage on the Thornwood's road by the campfire, where a party passes on its way to the portal and back: from
  // play, "add merchant in another house... sell gear in exchange for other gear")
  merchant: { id: 'merchant', cottage: 3, name: "Odo's Wares", half: [4.6, 3.8], high: 3.2 },
};

/** Brother Hollis's reading table in the library (world/library.ts): where his chair stands (x, z in the room's frame)
 *  and how it's turned (rad about y: 0 faces +z, the door), towards the room's middle, so he's seen from the door. */
export const SCHOLAR_DESK = { x: -2.9, z: 0.6, turn: 0.5 };

/** How far in from the room's front wall a hero comes in (m), and how far out from the cottage's door he comes out. */
export const ENTER_IN = 1.9;
export const EXIT_OUT = 1.3;

/** Where house `id`'s door is in the village (the middle of its face, on the ground), and the way out of it (rad about y:
 *  0 faces +z). */
export function houseDoor(id: RoomId): { x: number; z: number; facing: number } {
  const c = COTTAGES[HOUSES[id].cottage];
  // (as `doorOf` in world/villagePlan.ts: the cottage's door, its face 0.15 m out from the plaster)
  const out = (4.6 / 2 + 0.15) * c.size;
  return { x: c.x + Math.sin(c.facing) * out, z: c.z + Math.cos(c.facing) * out, facing: c.facing };
}

/** Where a hero leaving house `id` stands outside, and the way he faces: out from its door. */
export function outsideOf(id: RoomId): { x: number; z: number; facing: number } {
  const d = houseDoor(id);
  return { x: d.x + Math.sin(d.facing) * EXIT_OUT, z: d.z + Math.cos(d.facing) * EXIT_OUT, facing: d.facing };
}

/** Where a hero coming into room `id` stands, facing in (-z: rad about y, 0 faces +z). */
export function insideOf(id: RoomId): { x: number; z: number; facing: number } {
  return { x: 0, z: HOUSES[id].half[1] - ENTER_IN, facing: Math.PI };
}

/** The objects to use outside the houses (their doors) and in their rooms (`room`: used only in it). */
export const HOUSE_OBJECTS: readonly VillageObject[] = (() => {
  const doors = ROOM_IDS.map((id): VillageObject => {
    const d = houseDoor(id), s = outsideOf(id);
    // (its name over the door's lintel, a hair out from it)
    return {
      id: `${id}Door`, use: 'enter', room: undefined, into: id, at: [d.x + Math.sin(d.facing) * 0.35, d.z + Math.cos(d.facing) * 0.35],
      // (its prompt on the door's leaf, under the sign over it: at the head, the two stood one on the other, from play)
      reach: 2.0, stand: [s.x, s.z], label: 1.75, tall: 2.3, name: HOUSES[id].name, verb: 'Go in',
    };
  });
  const way = (id: RoomId): VillageObject => {
    const z = HOUSES[id].half[1];
    return {
      id: `${id}Out`, use: 'leave', room: id, at: [0, z - 0.2], reach: 1.4, stand: [0, z - 1.0], label: 2.25, tall: 2.2,
      name: 'Door', verb: 'Go out',
    };
  };
  const [rx, rz] = HOUSES.records.half, [tx, tz] = HOUSES.tavern.half;
  const [, lz] = HOUSES.library.half, [, mz] = HOUSES.merchant.half;
  return [
    ...doors, ...ROOM_IDS.map(way),
    // (the great ledger on its lectern, before the trophies)
    { id: 'ledger', use: 'records', room: 'records', at: [0, -0.9], reach: 1.9, stand: [0, 0.4], label: 1.45, tall: 1.6,
      name: 'Great Ledger', verb: 'Read the records' },
    // (the Chronicle's own lectern, at home here: the save slots, as the one on the hall's porch)
    { id: 'roomChronicle', use: 'chronicle', room: 'records', at: [-rx + 0.9, rz - 1.6], reach: 1.7, stand: [-rx + 2.0, rz - 1.6],
      label: 1.5, tall: 1.6, name: 'Chronicle', verb: 'Save slots' },
    // (the round table by the hearth, a map on it: Play together, the room flow the campfire opens)
    { id: 'partyTable', use: 'coop', room: 'tavern', at: [-tx + 2.2, -tz + 2.4], reach: 2.1, stand: [-tx + 2.2, -tz + 3.9],
      label: 1.25, tall: 1.4, name: 'Party Table', verb: 'Play together' },
    // (a board by the door, its notices the parties forming: the same)
    { id: 'partyBoard', use: 'coop', room: 'tavern', at: [tx - 0.15, tz - 1.7], reach: 1.8, stand: [tx - 1.3, tz - 1.7],
      label: 1.75, tall: 2.2, name: 'Party Board', verb: 'Play together' },
    // (the library's great book on its lectern before the back wall's shelves: the in-game guide)
    { id: 'codex', use: 'guide', room: 'library', at: [0, -lz + 1.6], reach: 1.9, stand: [0, -lz + 2.9], label: 1.55, tall: 1.7,
      name: 'Codex of Wardenhollow', verb: 'Read the guide' },
    // (Brother Hollis at his reading table: talked to across it)
    (() => {
      const { x, z, turn } = SCHOLAR_DESK, c = Math.cos(turn), s = Math.sin(turn);
      return { id: 'scholar', use: 'talk', room: 'library', at: [x + s * 0.1, z + c * 0.1], reach: 2.4,
        stand: [x + s * 1.45, z + c * 1.45], label: 1.62, tall: 1.5, name: 'Brother Hollis', verb: 'Talk' } satisfies VillageObject;
    })(),
    // (the merchant behind his counter across the back of his shop: gear for gear)
    { id: 'shopCounter', use: 'merchant', room: 'merchant', at: [0, -mz + 1.5], reach: 2.0, stand: [0, -mz + 2.6], label: 1.9,
      tall: 2.0, name: 'Odo the Merchant', verb: 'Trade gear' },
  ];
})();

/**
 * A trophy the house of records hangs for a boss beaten, keyed by the boss's enemy id: its name, its look (`TrophyLook`
 * in world/rooms.ts: a new boss may have one of its own, or take `crest`, a shield in its colours that needs nothing
 * else), its colour (hex) and a second one. A boss with no entry hangs nothing; a boss being built (the Bell-Warden,
 * the Rootmother) needs only its entry here.
 */
export interface TrophyDef { name: string; look: TrophyLook; colour: number; trim: number }
export type TrophyLook = 'mask' | 'antlers' | 'crest';

export const TROPHIES: Partial<Record<EnemyId, TrophyDef>> = {
  // (the Hollow Colossus's cracked face, its violet glow gone dim in the eyes)
  colossus: { name: "The Hollow Colossus's Mask", look: 'mask', colour: 0xd8d0c4, trim: 0xb070ff },
  // (the Elder Thornheart's crown of thorned antlers, a green heartwood knot at its root)
  thornheart: { name: "The Elder Thornheart's Crown", look: 'antlers', colour: 0xb89068, trim: 0x7aff50 },
  // (the Bell-Warden's crest: cracked bronze and its toll's pale light)
  bellwarden: { name: "The Bell-Warden's Crest", look: 'crest', colour: 0xa0702e, trim: 0xc8d8ff },
};
