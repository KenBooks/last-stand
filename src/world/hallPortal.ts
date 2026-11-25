// The hall of heroes' doorway, as `doorways.ts` culls by it: its walls and roof hide the village from within but for
// what the doorway shows (looking out of the hall at the square, three's view culling drew the fountain, the yard's
// dummies and the village's objects behind its walls, 555 draws and the render 11.9 ms of a frame's CPU, from play, a
// perf report "looking at plaza from hall"), and from outside its room and the heroes on its dais are seen through
// the doorway alone (facing the hall from the square, the room and the heroes were 128 of the frame's 429 draws, all
// drawn whatever the doorway showed of them). Its windows are openings too, seen through both ways as the doorway is:
// their glass shows what's past it (from play, "make hall windows semi transparent, so they actually show what's
// outside behind them").
import * as THREE from 'three';
import { fadedWhole } from '../core/seeThrough';
import { SIGHT, nearDoorAt, seesIntoRoom } from '../core/sight';
import { HALL, TERRACE, inHall } from '../data/village';
import type { Doorway } from './doorways';
import { hallWindows } from './village';

/** the hall's room inside its walls (its least x and z, its most): while he sees any of it from outside, its roof
 *  is gone whole and its front wall may be, and the room is drawn whole */
const HALL_ROOM = [TERRACE.x - HALL.inHalf, HALL.wall, TERRACE.x + HALL.inHalf, HALL.inFront] as const;

/** Whether he stands in the hall by its door, its front wall opened whole for what he sees out to. */
function byDoorInside(): boolean {
  const from = SIGHT.uSightFrom.value;
  return inHall(from.x, from.y) && nearDoorAt(TERRACE.x, HALL.inFront) > 0;
}

/** The hall's doorway (`cutaway`: its roof and front wall, cut away when the camera isn't under them). */
export function hallDoorway(cutaway: readonly THREE.Object3D[]): Doorway {
  return {
    name: 'the hall of heroes',
    sill: new THREE.Vector3(TERRACE.x, TERRACE.high, HALL.door),
    out: new THREE.Vector3(0, 0, 1),
    half: HALL.doorHalf,
    high: HALL.doorHigh,
    depth: HALL.door - HALL.inFront,
    // (its walls and roof with it)
    box: new THREE.Box3(
      new THREE.Vector3(TERRACE.x - HALL.half, -1, HALL.wall - 1),
      new THREE.Vector3(TERRACE.x + HALL.half, 12, HALL.door + 0.5),
    ),
    room: new THREE.Box3(
      new THREE.Vector3(TERRACE.x - HALL.inHalf, -Infinity, HALL.wall),
      new THREE.Vector3(TERRACE.x + HALL.inHalf, Infinity, HALL.inFront),
    ),
    // (from its floor up, a hair past its walls' inner faces)
    inside: new THREE.Box3(
      new THREE.Vector3(TERRACE.x - HALL.inHalf - 0.05, TERRACE.high - 0.3, HALL.wall - 0.05),
      new THREE.Vector3(TERRACE.x + HALL.inHalf + 0.05, 12, HALL.inFront + 0.05),
    ),
    // (cut away, or thinned to a ghost, what's beyond them shows)
    // (nor while he stands before its door and its front wall is opened whole for it: taken as whole, the
    // room past the doorway's own view wasn't drawn, and the meadow showed through the thinned wall in the
    // room's far corners, from play "do you [see the] slanted roof effect")
    whole: () => cutaway.every((part) => part.visible) && !fadedWhole('hallFront') && !fadedWhole('hallRoof')
      && !seesIntoRoom(HALL_ROOM) && !byDoorInside(),
    windows: hallWindows(),
    wallsSaid: () => `roof and front shown ${cutaway.every((part) => part.visible)}, `
      + `front thinned ${fadedWhole('hallFront')}, roof thinned ${fadedWhole('hallRoof')}`,
  };
}
