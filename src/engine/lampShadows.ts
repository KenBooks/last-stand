// The lamps' shadows on the engine: for each lamp of the village, the depth of what stands still round it drawn into
// six maps, the faces of a cube round it (Bulwark's gpu/lamps.rs), which the lit shader reads as the game's own reads
// its atlas (core/lamps.ts `lampShadowAt`). Asked for where the game asks three for its atlas (world/lampAtlas.ts
// `bakeLampShadows`), and drawn a lamp a frame at the head of the frames after, so no frame waits on all of them.
// From play, of the lamps shining through every wall and post: "and lights have no shadows".
import * as THREE from 'three';
import { lampList, LAMPS_MOST } from '../core/lamps';
import type { Core } from './core';
import { GLOBALS, projectionOf } from './globals';

/** what's nearer a lamp than this casts nothing (m): `NEAR` in world/lampAtlas.ts, `LAMP_NEAR` in the engine's lit.wgsl */
const LAMP_NEAR = 0.3;
/** the faces of the cube round a lamp, in the maps' order: the way each looks and its up (world/lampAtlas.ts `FACES`,
 *  the lit shader's `lamp_reaches`) */
const FACES: { axis: THREE.Vector3; up: THREE.Vector3 }[] = [
  { axis: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
  { axis: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  { axis: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
];

const at = new THREE.Vector3(), ahead = new THREE.Vector3(), centre = new THREE.Vector3();
const projection = new THREE.Matrix4(), faceView = new THREE.Matrix4();
const sphere = new THREE.Sphere();

export class LampShadows {
  /** what casts into the lamps' shadows: the game's own choice (world/lampAtlas.ts `casts`) */
  private casters: THREE.Mesh[] = [];
  /** the lamps whose faces are still to draw, in turn */
  private waiting: number[] = [];
  /** the lamps whose faces are drawn: their lights read them */
  private drawn = new Set<number>();
  private camera = new THREE.PerspectiveCamera(90, 1, LAMP_NEAR, 1);
  /** how far a lamp reaches in the frame's own loop, which reads its faces that far (`lightCache.ts`; set by the
   *  bridge) */
  reachOf: (lamp: number, reach: number) => number = (_lamp, reach) => reach;
  /** how many lamps were last asked for */
  private asked = 0;

  constructor(private core: Core) {}

  /** The first `lamps` lamps' shadows asked for, of `casters` as they stand (their world matrices made). A lamp
   *  drawn before keeps its maps in use until it's drawn again. */
  ask(casters: THREE.Mesh[], lamps: number): void {
    this.casters = casters;
    this.asked = Math.min(lamps, LAMPS_MOST);
    this.waiting = Array.from({ length: this.asked }, (_, lamp) => lamp);
  }

  /** Every lamp's faces to draw again, none read meanwhile: the lamps reach another distance in the frame's loop
   *  now, and a face's depth is laid out by how far its lamp reaches. */
  again(): void {
    this.drawn.clear();
    this.waiting = Array.from({ length: this.asked }, (_, lamp) => lamp);
  }

  /** A lamp's place among the maps (its own number), or -1 while its faces aren't drawn. */
  slot(lamp: number): number {
    return this.drawn.has(lamp) ? lamp : -1;
  }

  /** How many lamps' shadows are drawn, and how many wait. */
  now(): { drawn: number; waiting: number } {
    return { drawn: this.drawn.size, waiting: this.waiting.length };
  }

  /**
   * The next waiting lamp's six faces drawn, at the head of a frame: `record` writes a caster's record as a frame's
   * walk would (the frame's own records are written after, over these). The casters in the lamp's reach are written
   * once for its six faces; each face's view goes where the sun's does in the globals, which the frame writes again.
   */
  step(record: (mesh: THREE.Mesh) => void): void {
    const lamp = this.waiting.shift();
    if (lamp === undefined) return;
    const core = this.core, place = (1 + lamp * 2) * 4;
    at.fromArray(lampList, place);
    // (as far as its light is read: the lit shader takes the faces' far plane from the light's own reach)
    const reach = this.reachOf(lamp, lampList[place + 3]);
    if (!(reach > LAMP_NEAR)) return;
    core.count = core.boneFloats = 0;
    for (const mesh of this.casters) {
      if (!inReach(mesh, reach)) continue;
      record(mesh);
    }
    const camera = this.camera;
    camera.far = reach;
    camera.updateProjectionMatrix();
    camera.position.copy(at);
    for (const [k, { axis, up }] of FACES.entries()) {
      camera.up.copy(up);
      camera.lookAt(ahead.copy(at).add(axis));
      camera.updateMatrixWorld();
      core.freshViews();
      faceView.multiplyMatrices(projectionOf(camera, projection), camera.matrixWorldInverse)
        .toArray(core.globals, GLOBALS.shadowView);
      at.toArray(core.globals, GLOBALS.camPos);
      core.engine.bake_lamp_face(lamp * FACES.length + k, core.count);
    }
    core.freshViews();
    core.count = core.boneFloats = 0;
    this.drawn.add(lamp);
  }
}

/** Whether `mesh` may stand within `reach` of the lamp at `at`: by its geometry's sphere where it stands; a mesh of
 *  instances (the posts, the trunks) is left to the engine, which culls each. */
function inReach(mesh: THREE.Mesh, reach: number): boolean {
  if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return true;
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  sphere.copy(geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
  return centre.copy(sphere.center).distanceTo(at) < reach + sphere.radius;
}
