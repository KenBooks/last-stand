// `lab village --only hallWallsFlush`: nothing of the hall's long walls juts into the room further than the engine's
// house rule takes as the wall's own. The rule opens a wall looked over into the room, but not what stands more than
// `INSIDE_ROOM` (5 cm, Bulwark's seen.wgsl) in from the room's edge: that is hung in the room (the back wall's
// banners), kept whole before the wall's ghost. The windows' sills jutted 15 cm in, and from above the wall opened
// round them, the sills left lying in the air (from play, "when thinning the wall, window sills left behind"). Each
// vertex of each long wall's meshes is read in the world against the wall's inner face. `canary` hangs a block 15 cm
// into the room in the east wall's material.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { seeValue } from '../../../src/core/seeThrough';
import { HALL, TERRACE } from '../../../src/data/village';
import type { LightsChecked } from './villageLights';

/** the most a wall's part may jut into the room (m): under the engine's `INSIDE_ROOM` of 5 cm, with room for a ray
 *  meeting the wall aslant, which reads a part's depth longer */
const MOST_IN = 0.02;
/** how far the canary's block juts in (m), and its size */
const CANARY_IN = 0.15;
const CANARY_SIZE = 0.3;

/** A long wall: its kind's name, and the way into the room from its inner face (-1: in along -x, the east wall). */
interface LongWall { kind: 'hallWest' | 'hallEast'; inward: number }

const WALLS: LongWall[] = [
  { kind: 'hallWest', inward: 1 },
  { kind: 'hallEast', inward: -1 },
];

/** The meshes drawn in `kind`'s material, found by its value on the material (`material.seeThrough`). */
function meshesOf(kind: LongWall['kind']): THREE.Mesh[] {
  const value = seeValue(kind);
  const meshes: THREE.Mesh[] = [];
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as { seeThrough?: unknown } | undefined;
    if (mesh.isMesh && material?.seeThrough === value) meshes.push(mesh);
  });
  return meshes;
}

/** The wall's inner face (x). */
function innerFace(wall: LongWall): number {
  return TERRACE.x - wall.inward * HALL.inHalf;
}

/** How far the furthest vertex of `meshes` lies in from `wall`'s inner face (m; under 0, none in), and where. */
function furthestIn(meshes: THREE.Mesh[], wall: LongWall): { depth: number; at: THREE.Vector3 } {
  const face = innerFace(wall);
  const world = new THREE.Vector3();
  let depth = -Infinity;
  const at = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      world.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      const inside = (world.x - face) * wall.inward;
      if (inside > depth) {
        depth = inside;
        at.copy(world);
      }
    }
  }
  return { depth, at };
}

/** The canary's block, 15 cm into the room off the east wall in its material, at the hall's middle. */
function canaryBlock(material: THREE.Material | THREE.Material[]): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(CANARY_SIZE, CANARY_SIZE, CANARY_SIZE);
  const block = new THREE.Mesh(geometry, material);
  const east = WALLS[1];
  block.position.set(innerFace(east) + east.inward * (CANARY_IN - CANARY_SIZE / 2), TERRACE.high + 3, -24);
  return block;
}

/** The hall's long walls flush with the room's edge. */
export function hallWallsFlush(canary: boolean): LightsChecked {
  const lines: string[] = [];
  const problems: string[] = [];
  let caught = false;
  for (const wall of WALLS) {
    const meshes = meshesOf(wall.kind);
    let planted: THREE.Mesh | null = null;
    if (canary && wall.kind === 'hallEast' && meshes.length > 0) {
      planted = canaryBlock(meshes[0].material);
      G.scene.add(planted);
      meshes.push(planted);
    }
    const { depth, at } = furthestIn(meshes, wall);
    if (planted) {
      G.scene.remove(planted);
      planted.geometry.dispose();
    }
    const where = `${at.x.toFixed(2)},${at.y.toFixed(2)},${at.z.toFixed(2)}`;
    const line = `${wall.kind}: ${meshes.length} meshes, the furthest into the room ${(depth * 100).toFixed(1)} cm`
      + ` at ${where} (at most ${MOST_IN * 100} cm)`;
    lines.push(line);
    if (meshes.length === 0) problems.push(`${wall.kind}: no mesh of the wall found`);
    if (depth > MOST_IN) {
      caught = true;
      problems.push(`${line}: kept as hung in the room when the wall opens`);
    }
  }
  if (canary) return { lines, problems: [], caught, moments: [] };
  return { lines, problems, caught: null, moments: [] };
}
