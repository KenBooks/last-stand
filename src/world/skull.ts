// A skull without its jaw, sculpted as a distance field (models/sdf.ts) and meshed with surface nets: the cranium,
// the brow, the cheekbones and the upper jaw with its teeth, the eye sockets and the nose cut out of them. Its
// hollows are darkened in its vertex colours (the field asked along each normal: a socket's walls close in), as the
// game's light leaves a socket as pale as the brow round it. Faces +z, its lowest point at y 0.
import * as THREE from 'three';
import { ellipsoid, fieldOf, IDENTITY, type Part, type Shape } from '../entities/models/sdf';
import { surfaceNets } from '../entities/models/surfaceNets';

/** the grid it's meshed on (m): at 3 mm a skull was 31k triangles, 24 of them 750k; at 8 mm 4356 */
const CELL = 0.008;
/** the grid Low's skulls are meshed on (m): the crypt's 24 were 104k triangles a pass at 8 mm, a phone's lobby on
 *  Low drawing 490k in all (`lab draws --biome crypt --count 0 --boot low@508717`) */
export const COARSE_CELL = 0.016;
/** how much larger than a man's it's drawn, to read from the camera's height */
const SIZE = 1.25;
/** the steps (m) the field is asked at along a vertex's normal for its hollows, and how dark the deepest go */
const OCCLUSION_STEP = 0.006;
const OCCLUSION_STEPS = 5;
const DARKEST = 0.6;

/** Everything below `y` (a half-space, to cut the skull's base flat). */
function below(y: number): Shape {
  return { distance: (_x, py) => py - y, centre: [0, 0, 0], radius: Infinity };
}

/** the sculpt's parts (m, a man's skull): what's joined, then what's cut away */
function skullParts(): Part[] {
  const parts: Part[] = [];
  const join = (shape: Shape, blend: number) => parts.push({ shape, frame: IDENTITY, blend, bones: [] });
  const cut = (shape: Shape, blend: number) => parts.push({ shape, frame: IDENTITY, blend, cut: true, bones: [] });
  const sides = [-1, 1];
  // the cranium, its base and the brow ridge over the eyes
  join(ellipsoid(0, 0.092, -0.012, 0.07, 0.07, 0.092), 0.001);
  join(ellipsoid(0, 0.04, -0.03, 0.052, 0.03, 0.06), 0.02);
  join(ellipsoid(0, 0.084, 0.066, 0.056, 0.015, 0.022), 0.012);
  // the upper jaw, the cheekbones and their arches back to the ears
  join(ellipsoid(0, 0.046, 0.054, 0.041, 0.04, 0.042), 0.02);
  for (const s of sides) {
    join(ellipsoid(s * 0.047, 0.057, 0.042, 0.02, 0.017, 0.028), 0.012);
    join(ellipsoid(s * 0.057, 0.054, 0.006, 0.006, 0.006, 0.032), 0.012);
  }
  // the teeth: a row round the jaw's front, each its own bump
  join(ellipsoid(0, 0.018, 0.058, 0.032, 0.011, 0.03), 0.008);
  for (let i = 0; i < 10; i++) {
    const a = (i / 9 - 0.5) * 2.4;
    join(ellipsoid(Math.sin(a) * 0.031, 0.01, 0.056 + Math.cos(a) * 0.03, 0.0048, 0.008, 0.0048), 0.002);
  }
  // the eye sockets, the nose and the hollows at the temples
  for (const s of sides) {
    cut(ellipsoid(s * 0.027, 0.066, 0.09, 0.019, 0.018, 0.036), 0.006);
    cut(ellipsoid(s * 0.074, 0.074, 0.018, 0.012, 0.022, 0.03), 0.016);
  }
  cut(ellipsoid(0, 0.038, 0.096, 0.009, 0.015, 0.026), 0.004);
  cut(below(0.002), 0.002);
  return parts;
}

/** The skull's geometry (positions, normals, vertex colours), made once. */
export function skullGeometry(cell = CELL): THREE.BufferGeometry {
  const field = fieldOf(skullParts());
  const box = new THREE.Box3(new THREE.Vector3(-0.09, -0.01, -0.12), new THREE.Vector3(0.09, 0.18, 0.13));
  const net = surfaceNets(field, box, cell);
  const colours = new Float32Array(net.positions.length);
  for (let v = 0; v < net.positions.length; v += 3) {
    const shade = 1 - DARKEST * occlusion(field, net.positions, net.normals, v);
    colours.set([shade, shade, shade], v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(net.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(net.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.setIndex(new THREE.BufferAttribute(net.index, 1));
  g.normalizeNormals();
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0).scale(SIZE, SIZE, SIZE);
  g.computeBoundingSphere();
  return g;
}

/** How high `g` must be lifted, turned by `q` and scaled by `scale`, to rest on the ground: its lowest point's depth
 *  below its origin. */
export function restingLift(g: THREE.BufferGeometry, q: THREE.Quaternion, scale: number): number {
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  let lowest = Infinity;
  for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, v.fromBufferAttribute(pos, i).applyQuaternion(q).y);
  return -lowest * scale;
}

/** How closed in the surface is at vertex `v` (0 open to 1 in a hollow): the field asked out along its normal, each
 *  step nearer to the surface than its length a share of the dark. */
function occlusion(field: (x: number, y: number, z: number) => number, p: Float32Array, n: Float32Array, v: number):
  number {
  const length = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1;
  let closed = 0;
  let weight = 1;
  let total = 0;
  for (let i = 1; i <= OCCLUSION_STEPS; i++) {
    const h = i * OCCLUSION_STEP;
    const d = field(p[v] + n[v] * h / length, p[v + 1] + n[v + 1] * h / length, p[v + 2] + n[v + 2] * h / length);
    closed += weight * Math.max(0, h - d) / h;
    total += weight;
    weight *= 0.7;
  }
  return Math.min(1, closed / total * 1.6);
}

/** The skulls drawn, each with its two geometries, swapped by the quality level (`setSkullDetail`). */
interface Drawn {
  meshes: THREE.Mesh[];
  full: THREE.BufferGeometry;
  coarse: THREE.BufferGeometry;
}
const drawn: Drawn[] = [];
/** whether the level wants the coarse skulls (Low's `coarseProps`) */
let coarseWanted = false;

/** Shows `meshes` (a mesh and its shadow's copy) at `full`'s detail or `coarse`'s as the level has it. The swap is
 *  a geometry's alone, of the same attributes: no program changes. */
export function skullsDrawn(meshes: THREE.Mesh[], full: THREE.BufferGeometry, coarse: THREE.BufferGeometry): void {
  drawn.push({ meshes, full, coarse });
  setSkullDetail(coarseWanted);
}

/** The skulls drawn at their coarse detail (Low) or their full. */
export function setSkullDetail(coarse: boolean): void {
  coarseWanted = coarse;
  for (const skulls of drawn) {
    for (const mesh of skulls.meshes) mesh.geometry = coarse ? skulls.coarse : skulls.full;
  }
}
