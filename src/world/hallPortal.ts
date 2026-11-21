// The hall of heroes' doorway, as `doorways.ts` culls by it: its walls and roof hide the village from within but for
// what the doorway shows (looking out of the hall at the square, three's view culling drew the fountain, the yard's
// dummies and the village's objects behind its walls, 555 draws and the render 11.9 ms of a frame's CPU, from play, a
// perf report "looking at plaza from hall"), and from outside its room and the heroes on its dais are seen through
// the doorway alone (its windows are too high, their panes show nothing: facing the hall from the square, the room
// and the heroes were 128 of the frame's 429 draws, all drawn whatever the doorway showed of them).
import * as THREE from 'three';
import { fadedWhole } from '../core/seeThrough';
import { HALL, TERRACE } from '../data/village';
import type { Doorway } from './doorways';

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
    whole: () => cutaway.every((part) => part.visible) && !fadedWhole('hallFront') && !fadedWhole('hallRoof'),
    wallsSaid: () => `roof and front shown ${cutaway.every((part) => part.visible)}, `
      + `front thinned ${fadedWhole('hallFront')}, roof thinned ${fadedWhole('hallRoof')}`,
  };
}
