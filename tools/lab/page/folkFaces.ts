// tools/lab `talk`'s read of the village folk's portraits (src/ui/guide/folkPortraits.ts): each of the folk built and
// staged as his card's picture is, and how far his head and his eyes are turned off the camera (from play: "Have him
// look straight"; "Real picture of their face, looking at camera": Brother Hollis's head was three-quarters round and his
// eyes off to the side, at the one he talked to). Its canary turns the head off the camera after staging.
import * as THREE from 'three';
import { FOLK, folkStaged, type FolkId } from '../../../src/ui/guide/folkPortraits';

/** how far off the camera a portrait's head may face, and each eye look (deg: "a few degrees off for life") */
export const FACE_OFF_MOST = { head: 6, eyes: 8 };

/** A portrait's look: how far his head faces off the camera, and the furthest of his eyes (deg); null where he can't
 *  be built yet (his room never built). */
export interface FaceRead { head: number; eyes: number; eyeCount: number }

/** `id` built and staged as his picture is (`turned`: his head turned that far round after, the canary's), read. */
export function faceRead(id: FolkId, turned = 0): FaceRead | null {
  const folk = FOLK[id], building = folk.sitter();
  if (!building) return null;
  let step = building.next();
  while (!step.done) step = building.next();
  const sitter = step.value;
  const { camera } = folkStaged(sitter, folk.backdrop);
  if (turned) { sitter.head.rotateY(THREE.MathUtils.degToRad(turned)); sitter.head.updateWorldMatrix(false, true); }
  const off = (o: THREE.Object3D) => {
    const at = o.getWorldPosition(new THREE.Vector3());
    const facing = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld);
    return THREE.MathUtils.radToDeg(facing.angleTo(camera.position.clone().sub(at)));
  };
  const read = { head: off(sitter.head), eyes: Math.max(0, ...sitter.eyes.map(off)), eyeCount: sitter.eyes.length };
  sitter.root.removeFromParent();
  return read;
}

/** What's wrong with `id`'s portrait's look, and its line. */
export function faceChecked(id: FolkId, name: string): { line: string; problems: string[] } {
  const read = faceRead(id), problems: string[] = [];
  if (!read) return { line: `${name}'s portrait: not built (his room never was)`, problems: [`${name}'s portrait couldn't be built`] };
  if (read.head > FACE_OFF_MOST.head) problems.push(`${name}'s portrait: his head ${read.head.toFixed(1)}° off the camera (at most ${FACE_OFF_MOST.head})`);
  if (read.eyes > FACE_OFF_MOST.eyes) problems.push(`${name}'s portrait: an eye ${read.eyes.toFixed(1)}° off the camera (at most ${FACE_OFF_MOST.eyes})`);
  if (read.eyeCount < 2) problems.push(`${name}'s portrait: ${read.eyeCount} eyes found`);
  return { line: `${name}'s portrait: his head ${read.head.toFixed(1)}° off the camera, his eyes at most ${read.eyes.toFixed(1)}° (${read.eyeCount} read)`, problems };
}

/** The canary: `id`'s head turned 30° off the camera after staging, which must be found. */
export function faceCanary(id: FolkId, name: string): { line: string; problems: string[] } {
  const read = faceRead(id, 30);
  const caught = !!read && read.head > FACE_OFF_MOST.head;
  return { line: `canary: ${name}'s portrait with his head turned 30° ${caught ? 'caught' : 'went unseen'} (${read ? read.head.toFixed(1) : '?'}°)`,
    problems: caught ? [] : [`canary: ${name}'s portrait with his head turned went unseen`] };
}
