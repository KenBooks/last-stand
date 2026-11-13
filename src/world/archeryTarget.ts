// The archery target by the training yard's gate (data/village.ts `TARGET`), the training grounds' way in: a round
// straw boss, its face painted in red and white rings, leant back on a three-legged easel (two front legs splayed, one
// behind), a few arrows standing in it. Low-poly and faceted, every part one mesh in one vertex-coloured material that
// stands free as the notice board does (`prop`), so it's one draw and one program, compiled with the village at boot.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TARGET } from '../data/village';
import { seeThrough } from '../core/seeThrough';
import { groundHeight } from './ground';
import type { Obstacle } from '../types';

/** the boss: its radius, thickness, the height of its middle, how far it leans back (rad) and how far forward of the
 *  easel's foot it stands (m), and the facets round it */
const BOSS = { r: 0.55, deep: 0.18, y: 1.25, lean: 0.2, forward: 0.1, sides: 14 };
/** the face's bands from the middle out, alternately red and white, each band's outer edge (m) */
const BANDS = [0.11, 0.2, 0.29, 0.38, 0.47, BOSS.r];
const RED = 0xa8392c, WHITE = 0xe6ddc8, STRAW = 0xc9a868, STRAW_BACK = 0xa88a52;
/** the easel's wood, weathered pale, and its legs' thickness (m) */
const WOOD = 0xb89a76, LEG = 0.07;
/** where the easel's legs meet over the boss, its front feet (x either side) and its back foot (local m: +z the face's way) */
const EASEL = { top: new THREE.Vector3(0, 2.02, -0.4), front: new THREE.Vector3(0.6, 0, 0.3), back: new THREE.Vector3(0, 0, -1.0) };
/** the ledge the boss rests on: its height (top), depth and middle along z */
const LEDGE = { top: 0.69, high: 0.07, deep: 0.12, z: 0.13, wide: 1.05 };
/** the arrows: where each stands in the face (x, y on it from its middle), its tilt off square (rad, about x and y),
 *  and its fletching's colour */
const ARROWS: readonly { at: [number, number]; tilt: [number, number]; fletch: number }[] = [
  { at: [0.02, 0.03], tilt: [0.05, -0.12], fletch: WHITE },
  { at: [0.2, 0.22], tilt: [-0.18, 0.2], fletch: 0x1c1a18 },
  { at: [-0.13, -0.16], tilt: [0.12, -0.25], fletch: 0x1c1a18 },
  { at: [0.27, -0.1], tilt: [-0.05, 0.3], fletch: WHITE },
];
/** an arrow's shaft out of the straw (m), its radius, and its fletching's length and height */
const SHAFT = { out: 0.52, r: 0.011, fletch: 0.15, vane: 0.05 };
const SHAFT_WOOD = 0x8a6a46;

/** `geometry` unindexed, every vertex `hex` (a colour of the page's, turned to the working space). */
function coloured(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const c = new THREE.Color(hex), n = g.attributes.position.count, rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return g;
}

/** A square beam `thick` across from `a` to `b`. */
function beam(a: THREE.Vector3, b: THREE.Vector3, thick: number): THREE.BufferGeometry {
  const along = b.clone().sub(a);
  const g = new THREE.BoxGeometry(thick, along.length(), thick);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** The boss and its painted face, built facing +z about its own middle. */
function boss(): THREE.BufferGeometry[] {
  const { r, deep, sides } = BOSS;
  const parts: THREE.BufferGeometry[] = [];
  // (open at its ends: the face and the back are their own discs, never in one plane with a cap)
  parts.push(coloured(new THREE.CylinderGeometry(r, r, deep, sides, 1, true).rotateX(Math.PI / 2), STRAW));
  parts.push(coloured(new THREE.CircleGeometry(r, sides).rotateY(Math.PI).translate(0, 0, -deep / 2), STRAW_BACK));
  BANDS.forEach((outer, k) => {
    const inner = k ? BANDS[k - 1] : 0;
    const band = inner ? new THREE.RingGeometry(inner, outer, sides) : new THREE.CircleGeometry(outer, sides);
    parts.push(coloured(band.translate(0, 0, deep / 2), k % 2 ? WHITE : RED));
  });
  for (const { at: [x, y], tilt: [ax, ay], fletch } of ARROWS) {
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(ax, ay, 0));
    const at = new THREE.Vector3(x, y, deep / 2 - 0.04);
    // (its head buried in the straw: the shaft starts 4 cm in)
    const shaft = new THREE.CylinderGeometry(SHAFT.r, SHAFT.r, SHAFT.out, 5).rotateX(Math.PI / 2)
      .translate(0, 0, SHAFT.out / 2).applyQuaternion(turn).translate(at.x, at.y, at.z);
    parts.push(coloured(shaft, SHAFT_WOOD));
    // two vanes crossed at its end
    for (const spin of [0, Math.PI / 2]) {
      const vane = new THREE.BoxGeometry(0.004, SHAFT.vane, SHAFT.fletch).translate(0, 0, SHAFT.out - SHAFT.fletch / 2 - 0.02)
        .rotateZ(spin + Math.PI / 4).applyQuaternion(turn).translate(at.x, at.y, at.z);
      parts.push(coloured(vane, fletch));
    }
  }
  return parts;
}

/** The archery target stood by the yard's gate in `scene`, kept off by an obstacle; returns its mesh. */
export function buildArcheryTarget(scene: THREE.Object3D, obstacles: Obstacle[]): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  // the boss leant back on its ledge
  const lean = new THREE.Matrix4().makeRotationX(-BOSS.lean).setPosition(0, BOSS.y, BOSS.forward);
  for (const part of boss()) parts.push(part.applyMatrix4(lean));
  // the easel: two front legs splayed from the top, one behind, a cap over where they meet, the ledge across the front legs
  const { top, front, back } = EASEL;
  for (const s of [-1, 1]) parts.push(coloured(beam(top, front.clone().setX(s * front.x), LEG), WOOD));
  parts.push(coloured(beam(top, back, LEG), WOOD));
  parts.push(coloured(new THREE.BoxGeometry(0.12, 0.08, 0.12).translate(top.x, top.y, top.z), WOOD));
  parts.push(coloured(new THREE.BoxGeometry(LEDGE.wide, LEDGE.high, LEDGE.deep)
    .translate(0, LEDGE.top - LEDGE.high / 2, LEDGE.z), WOOD));
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingSphere();
  const material = seeThrough(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 'prop');
  material.name = 'archery target';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'archery target';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.position.set(TARGET.x, groundHeight(TARGET.x, TARGET.z), TARGET.z);
  mesh.rotation.y = TARGET.facing;
  scene.add(mesh);
  obstacles.push({ x: TARGET.x, z: TARGET.z, r: 0.5, h: 1.8 });
  return mesh;
}
