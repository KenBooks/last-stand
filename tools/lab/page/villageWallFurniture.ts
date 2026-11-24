// `lab village --only wallFurnitureCut` (#748: "bookshelves, furniture, and other objects placed against or behind walls
// should not be visible through the walls" from above): every room, the camera put outside each of its four walls in
// turn (2 m past it, high over the room as the view from above is), and what stands against each wall (`againstWall`
// in world/rooms.ts, gathered as "against the <side> wall") shown exactly while its wall is. (A lantern's light on such
// a wall is moved onto the room's group as it's built, so cutting the wall puts out no light; the room's lights are
// the lamps', out of its group by the time this runs, so they aren't counted here.) Said: each room's walls cut.
// `canary` shows a cut wall's things again after the cut, which must be found.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { HOUSES, ROOM_IDS, type RoomId } from '../../../src/data/houses';

/** where the camera stands, in a room's own space, outside each wall: past it, and over the room as from above */
const OUTSIDE = 2;
const ABOVE = 8;
/** the walls a room's things stand against */
const SIDES = ['back', 'front', 'west', 'east'] as const;

/** What the check found, as the village's checks report it. */
interface Checked { lines: string[]; problems: string[]; caught: boolean | null }

/** The eye outside wall `side` of room `id`, in the world. */
function eyeOutside(id: RoomId, side: (typeof SIDES)[number]): THREE.Vector3 {
  const [hx, hz] = HOUSES[id].half;
  const local = {
    back: new THREE.Vector3(0, ABOVE, -hz - OUTSIDE),
    front: new THREE.Vector3(0, ABOVE, hz + OUTSIDE),
    west: new THREE.Vector3(-hx - OUTSIDE, ABOVE, 0),
    east: new THREE.Vector3(hx + OUTSIDE, ABOVE, 0),
  }[side];
  const room = G.arena.rooms![id];
  room.group.updateMatrixWorld(true);
  return room.group.localToWorld(local);
}

/** Every room's wall furniture going with its wall (one shown again after the cut, with `canary`). */
export function wallFurnitureCut(canary: boolean): Checked {
  const lines: string[] = [];
  const problems: string[] = [];
  let planted = false;
  for (const id of ROOM_IDS) {
    const room = G.arena.rooms![id];
    room.showAll();
    const cut: string[] = [];
    for (const side of SIDES) {
      room.cutAway(eyeOutside(id, side));
      const holder = room.group.getObjectByName(`against the ${side} wall`);
      if (canary && holder && !planted) {
        holder.visible = true;
        planted = true;
      }
      const wallCut = room.cutNow().includes(side);
      if (wallCut) cut.push(side);
      if (holder && holder.visible === wallCut) {
        problems.push(`wall furniture: ${id}'s things against its ${side} wall ${wallCut ? 'shown with it cut' : 'hidden'}`);
      }
    }
    room.showAll();
    lines.push(`wall furniture: ${id}, walls cut in turn ${cut.join(', ') || 'none'}, what stands against each going with it`);
  }
  if (!canary) return { lines, problems, caught: null };
  return { lines, problems: [], caught: problems.some((problem) => problem.includes('shown with it cut')) };
}
