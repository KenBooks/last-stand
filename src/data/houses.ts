// The village's houses walked into, a file each in data/houses/ (world/houses/ builds their rooms, game/rooms.ts takes
// the hero in and out): which cottage each is, its room's size and what stands in it to use, and the trophies the
// house of records hangs for the bosses beaten. A room is a small place of its own, shown in the village's stead as the hall of heroes' room is: the
// village is the heaviest place to draw, and a house seen open from it would add its inside to every frame there.
// A room's frame: x across it, z from its back wall (-) to its door (+), its middle at the origin, its floor at 0.
import { FOE_ENTRIES, type EnemyId } from './enemies';
import { COTTAGES, type VillageObject } from './village';
import { TROPHY_PLACES } from './houses/records';

/** The houses' ids, each declared by its file in data/houses/ (`declare module '../houses'`): a new house is a file
 *  there and one in world/houses/, and touches no list. */
export interface RoomIds {}
export type RoomId = keyof RoomIds;

/** A house: the cottage it is (its index in `COTTAGES`), its name, its room's inner half width and depth and height to
 *  its beams (m), and what stands in its room to use (`objects`, in the room's frame, given its half width and depth).
 *  Its door is the cottage's own, the middle of the room's front wall inside. */
export interface House {
  id: RoomId; cottage: number; name: string; half: [number, number]; high: number;
  objects?: (half: [number, number]) => Omit<VillageObject, 'room'>[];
}

const HOUSE_FILES = import.meta.glob<House>('./houses/*.ts', { eager: true, import: 'HOUSE' });
export const HOUSES = Object.fromEntries(Object.values(HOUSE_FILES).map((h) => [h.id, h])) as Record<RoomId, House>;
/** every house, in its file's name's order (a co-op state says the house a hero is in by its index here: the order is
 *  part of the protocol, net/protocol.ts) */
export const ROOM_IDS: readonly RoomId[] = Object.values(HOUSE_FILES).map((h) => h.id);

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
      reach: 2.0, stand: [s.x, s.z], label: 1.75, tall: 2.3, name: HOUSES[id].name, verb: 'Enter',
    };
  });
  const way = (id: RoomId): VillageObject => {
    const z = HOUSES[id].half[1];
    return {
      id: `${id}Out`, use: 'leave', room: id, at: [0, z - 0.2], reach: 1.4, stand: [0, z - 1.0], label: 2.25, tall: 2.2,
      name: 'Door', verb: 'Leave',
    };
  };
  const inside = ROOM_IDS.flatMap((id) => (HOUSES[id].objects?.(HOUSES[id].half) ?? []).map((o) => ({ ...o, room: id })));
  return [...doors, ...ROOM_IDS.map(way), ...inside];
})();

/**
 * A trophy the house of records shows for a boss beaten, keyed by the boss's enemy id: its name (its brass plate's),
 * where it's shown (`kind`: mounted on a shield on the back wall, or set on a stand in the trophy cabinet), the place it
 * takes (one of `TROPHY_PLACES`' of its kind, data/houses/records.ts; left out, the first free one), its colour (hex)
 * and a second one. Its model is its own file in world/trophies/ (`<boss id>.ts`, a small mesh of its own: never the
 * boss's lazy chunk, entities/bosses/, which the village never loads); a boss with none there is shown by its kind's
 * plain one in its colours. A boss with no `trophy` in its file in data/foes/ shows nothing; a new boss adds its
 * `trophy` there and its model there, and touches neither the room nor its places.
 */
export interface TrophyDef { name: string; kind: TrophyKind; place?: TrophyPlace; colour: number; trim: number }
/** where a trophy is shown: mounted on the back wall, or in the trophy cabinet */
export type TrophyKind = 'wall' | 'cabinet';
export type TrophyPlace = (typeof TROPHY_PLACES)[TrophyKind][number];

export const TROPHIES = Object.fromEntries(
  Object.entries(FOE_ENTRIES).filter(([, entry]) => entry.trophy).map(([id, entry]) => [id, entry.trophy]),
) as Partial<Record<EnemyId, TrophyDef>>;

/**
 * Each trophy's place: its own where it names one, else the first of its kind's places no other has, in the folder's
 * order (a place named twice, or a kind with no place left, is a mistake in the data: thrown as the game loads).
 */
export const TROPHY_AT = ((): Partial<Record<EnemyId, TrophyPlace>> => {
  const at: Partial<Record<EnemyId, TrophyPlace>> = {};
  const taken = new Set<TrophyPlace>();
  const entries = Object.entries(TROPHIES) as [EnemyId, TrophyDef][];
  for (const [boss, def] of entries.filter(([, d]) => d.place)) {
    if (taken.has(def.place!)) throw new Error(`Trophy place ${def.place} named twice (${boss})`);
    if (!(TROPHY_PLACES[def.kind] as readonly string[]).includes(def.place!)) {
      throw new Error(`Trophy place ${def.place} isn't a ${def.kind} place (${boss})`);
    }
    taken.add(def.place!);
    at[boss] = def.place;
  }
  for (const [boss, def] of entries.filter(([, d]) => !d.place)) {
    const free = TROPHY_PLACES[def.kind].find((p) => !taken.has(p));
    if (!free) throw new Error(`No ${def.kind} place left for ${boss}'s trophy (data/houses/records.ts)`);
    taken.add(free);
    at[boss] = free;
  }
  return at;
})();
