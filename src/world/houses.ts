// The houses' rooms, each built by its file in world/houses/ (its `build`, of the rooms' kit in world/rooms.ts; its
// cottage, size and what's used in it are its file in data/houses/): a new house is a file in each folder, and touches
// no list. Built once at boot, each into a group of its own, hidden till shown (`Arena.showRoom`).
import * as THREE from 'three';
import { ROOM_IDS, type RoomId } from '../data/houses';
import type { Room } from './rooms';

/** each house's room's builder, by its file's name (its `RoomId`) */
const BUILDERS = import.meta.glob<(group: THREE.Group) => Room>('./houses/*.ts', { eager: true, import: 'build' });

/** The builder of house `id`'s room. */
function builderOf(id: RoomId): (group: THREE.Group) => Room {
  const build = BUILDERS[`./houses/${id}.ts`];
  if (!build) throw new Error(`No room for house "${id}": world/houses/${id}.ts exports its \`build\``);
  return build;
}

/** Every house's room built, each into a group of its own (hidden till shown), `pause` awaited before each. */
export async function buildRooms(pause: () => Promise<void>): Promise<Record<RoomId, Room>> {
  const rooms = {} as Record<RoomId, Room>;
  for (const id of ROOM_IDS) {
    // (a room a task: built at once, the four were one task of 1.4 s in a boot with the CPU 4 times slower)
    await pause();
    const group = new THREE.Group();
    group.name = `room ${id}`;
    rooms[id] = builderOf(id)(group);
  }
  return rooms;
}
