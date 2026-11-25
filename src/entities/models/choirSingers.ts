// The Ossuary Cantor's choir (entities/cantor.ts, `CANTOR.choir`): ghostly singers standing in a ring round it, risen
// out of the floor as the ring's warning and sinking back as it fades, swaying, their hooded faces turned in to the
// Cantor and wailing. A look alone: they touch nothing, and shots pass through them (added light is no solid).
//
// They're the Bell-Warden's ghosts' own shroud and face (models/bellGhosts.ts), each part an instanced mesh of every
// singer in an additive material lit by its instance's colour, as the ghosts' tails are: the program the guards'
// ghosts compile with their warm-up, so nothing compiles in the fight. Two draws for the whole choir.
import * as THREE from 'three';
import { additive } from '../../core/materials';
import { faceGeometry, shroudGeometry } from './bellGhosts';

/** the singers' pale grave light, how much of the shroud and the face shows, and their size against a ghost's */
const LIGHT = 0xb8f0d8, SHROUD_SEE = 0.3, FACE_SEE = 0.95, BODY = 0.9, FACE = 3.2, SIZE = 1.9;
/** how high a singer floats once risen (m, its middle), how deep under the floor it starts, its sway's (m, rad/s) */
const FLOAT = 1.25, UNDER = -2.4, BOB = 0.12, BOB_RATE = 1.3, SWAY = 0.1;

/** A choir of `count` singers in the scene: posed each frame by `pose`, taken away by `dispose`. */
export function choirSingers(scene: THREE.Object3D, count: number) {
  const shroud = shroudGeometry(), face = faceGeometry();
  const shroudMat = additive(LIGHT, BODY, SHROUD_SEE), faceMat = additive(0xeefff6, FACE, FACE_SEE);
  const meshes = [new THREE.InstancedMesh(shroud, shroudMat, count), new THREE.InstancedMesh(face, faceMat, count)];
  const colour = new THREE.Color();
  for (const mesh of meshes) {
    mesh.name = 'choir singers';
    mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, colour.setScalar(0));
    scene.add(mesh);
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
  const _p = new THREE.Vector3();

  /**
   * The singers posed round (x, z) on a ring of `radius` m at time `t`: risen `up` of the way out of the floor (0..1),
   * their light `light` (0..1).
   */
  function pose(x: number, z: number, radius: number, up: number, light: number, t: number): void {
    const rise = 1 - (1 - up) ** 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      // (each its own sway and bob, and a moment later out of the floor than the one before it, round the ring)
      const own = Math.min(1, Math.max(0, rise * 1.35 - (i % 4) * 0.08));
      const y = UNDER + (FLOAT - UNDER) * own + Math.sin(t * BOB_RATE + i * 1.7) * BOB;
      _p.set(x + Math.sin(a) * radius, y, z + Math.cos(a) * radius);
      // (facing in, to the Cantor, leaning a little as it sways)
      _q.setFromEuler(_e.set(0.12, a + Math.PI, Math.sin(t * 0.9 + i) * SWAY, 'YXZ'));
      _m.compose(_p, _q, _s.setScalar(SIZE * (0.92 + (i % 3) * 0.05)));
      const lit = light * own;
      for (const mesh of meshes) {
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, colour.setScalar(lit));
      }
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  function dispose(): void {
    for (const mesh of meshes) {
      scene.remove(mesh);
      mesh.dispose();
    }
    shroud.dispose();
    face.dispose();
    shroudMat.dispose();
    faceMat.dispose();
  }

  return { pose, dispose, meshes };
}

/** A choir as made: posed and taken away. */
export type Choir = ReturnType<typeof choirSingers>;
