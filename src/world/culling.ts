// Instanced meshes culled cell by cell. three culls an instanced mesh only whole, by the sphere round all its
// instances: the forest's trees, thicket, grass and ferns were drawn whole in every view and in the shadow map, and
// half the top-down frame's 1.3 M triangles lay outside the view of the pass that drew them (`npm run lab -- draws`).
// Here a mesh's instances are sorted into cells by where they stand, and as the scene is drawn the cells in the
// camera's view are packed to the front of its instances: one draw a mesh as before, of what is in view. (Split into
// meshes of their own, a cell each, they cut as many triangles but drew 45 to 60 times more a frame.) What casts a
// shadow casts it from a copy of its own, drawn by the shadow map alone, of the instances in the map's box.
import * as THREE from 'three';
import { TAU } from '../util';
import { WEBGPU } from '../core/webgpu';

/** The cell an instance standing `at` (in its mesh's frame), the `i`th, is in. */
export type CellOf = (at: THREE.Vector3, i: number) => string | number;

/** A cell of a mesh's instances: where they start in its sorted list and how many, the sphere round them in the
 *  mesh's frame, and whether they were in view when last packed. */
interface Cell { start: number; count: number; sphere: THREE.Sphere; shown: boolean }

/** A mesh culled by its cells, with every instance's matrix and colour sorted by cell. */
interface Culled { mesh: THREE.InstancedMesh; matrices: Float32Array; colors: Float32Array | null; cells: Cell[] }

const culled: Culled[] = [];

/** What the shadow map alone draws, hidden from every other pass and shown while it draws (`cullWhileDrawn`). */
const shadowOnly = new Set<THREE.Mesh>();

/** `mesh` drawn by the shadow map alone: a shadow caster that draws nothing in the frame (drawn there, a biome's
 *  baked caster was 16k triangles a frame for nothing). */
export function inShadowsOnly(mesh: THREE.Mesh): void {
  mesh.visible = false;
  shadowOnly.add(mesh);
}

/** Whether the shadow map alone draws `mesh` (`inShadowsOnly`). */
export const drawnInShadowsOnly = (mesh: THREE.Mesh): boolean => shadowOnly.has(mesh);

/** `mesh` let go of by the shadow map (`inShadowsOnly`), as what it belonged to is disposed. */
export function outOfShadowsOnly(mesh: THREE.Mesh): void {
  shadowOnly.delete(mesh);
}

/** Work done round each draw of the shadow map, as its render's matrices stand: each before it, with the render's
 *  camera, and what it returns after it (`aroundShadows`). */
type AroundShadows = (camera: THREE.Camera) => () => void;
const aroundShadow = new Set<AroundShadows>();

/** `around` run round each draw of the shadow map (a hero's shadow cast as one, `models/castAsOne.ts`); the returned
 *  function lets go of it. */
export function aroundShadows(around: AroundShadows): () => void {
  aroundShadow.add(around);
  return () => aroundShadow.delete(around);
}

/** Work done round each render of a view on WebGPU, a camera of the scene's that isn't a light's (`aroundViews`). */
const aroundView = new Set<AroundShadows>();

/** `around` run round each render of the scene by a camera that isn't a light's (a hero's parts drawn as one,
 *  `models/drawAsOne.ts`); the returned function lets go of it. A shadow drawn inside such a render runs its own
 *  (`aroundShadows`) within it. */
export function aroundViews(around: AroundShadows): () => void {
  aroundView.add(around);
  return () => aroundView.delete(around);
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _c = new THREE.Color(), _sphere = new THREE.Sphere();

/** A mesh of `mesh`'s geometry and material casting its shadow, every instance of it, drawn by the shadow map alone. */
function shadowCasterOf(mesh: THREE.InstancedMesh): THREE.InstancedMesh {
  const caster = new THREE.InstancedMesh(mesh.geometry, mesh.material, mesh.count);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _m);
    caster.setMatrixAt(i, _m);
    if (!mesh.instanceColor) continue;
    mesh.getColorAt(i, _c);
    caster.setColorAt(i, _c);
  }
  caster.name = `${mesh.name}: shadows`;
  caster.castShadow = true;
  caster.computeBoundingSphere();
  inShadowsOnly(caster);
  return caster;
}

/**
 * `mesh` culled cell by cell from now on, its instances sorted into cells by `cellOf` (`eachInstance`, `ringSector`,
 * `gridCell`). Returns what to add to the scene: the mesh, and when it casts a shadow, the copy that casts it in its
 * place (its instances outside the shadow map's box let go by `trimShadowCasters`).
 */
export function cullInCells(mesh: THREE.InstancedMesh, cellOf: CellOf): THREE.InstancedMesh[] {
  const byCell = new Map<string | number, number[]>();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _m);
    const key = cellOf(_p.setFromMatrixPosition(_m), i);
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push(i);
  }
  const caster = mesh.castShadow ? shadowCasterOf(mesh) : null;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const from = mesh.instanceMatrix.array, fromColors = mesh.instanceColor?.array;
  const matrices = new Float32Array(mesh.count * 16);
  const colors = fromColors ? new Float32Array(mesh.count * 3) : null;
  const cells: Cell[] = [];
  let at = 0;
  for (const indices of byCell.values()) {
    const sphere = new THREE.Sphere().makeEmpty();
    cells.push({ start: at, count: indices.length, sphere, shown: true });
    for (const i of indices) {
      matrices.set(from.subarray(i * 16, i * 16 + 16), at * 16);
      if (colors) colors.set(fromColors!.subarray(i * 3, i * 3 + 3), at * 3);
      sphere.union(_sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(_m.fromArray(from, i * 16)));
      at++;
    }
  }
  (from as Float32Array).set(matrices);
  // (on WebGPU the usage stays static: three refreshes a mesh of dynamic instances in full at every draw, where a new
  // version of them is enough for it to see they changed)
  if (!WEBGPU) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) {
    (fromColors as Float32Array).set(colors);
    if (!WEBGPU) mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }
  mesh.castShadow = false;
  mesh.computeBoundingSphere();
  culled.push({ mesh, matrices, colors, cells });
  return caster ? [mesh, caster] : [mesh];
}

/** `attribute` sent to the GPU as far as `length` floats into it. */
function sendUpTo(attribute: THREE.BufferAttribute, length: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, length);
  attribute.needsUpdate = true;
}

/** `c`'s cells in view packed to the front of its mesh's instances; hidden when none is. */
function pack(c: Culled): void {
  const { mesh, matrices, colors } = c;
  const to = mesh.instanceMatrix.array as Float32Array, toColors = mesh.instanceColor?.array as Float32Array;
  let n = 0;
  for (const cell of c.cells) {
    if (!cell.shown) continue;
    to.set(matrices.subarray(cell.start * 16, (cell.start + cell.count) * 16), n * 16);
    if (colors) toColors.set(colors.subarray(cell.start * 3, (cell.start + cell.count) * 3), n * 3);
    n += cell.count;
  }
  mesh.count = n;
  mesh.visible = n > 0;
  if (!n) return;
  sendUpTo(mesh.instanceMatrix, n * 16);
  if (mesh.instanceColor) sendUpTo(mesh.instanceColor, n * 3);
}

const shown = (o: THREE.Object3D | null): boolean => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};

const _frustum = new THREE.Frustum(), _viewProjection = new THREE.Matrix4();
/** Each culled mesh `camera` sees packed with its cells in that camera's view, or all of them while the mesh isn't
 *  frustum-culled (the boot's warm-up draws everything). Packed again only when its cells in view change. */
function cullFor(camera: THREE.Camera): void {
  _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_viewProjection, THREE.WebGLCoordinateSystem, camera.reversedDepth);
  for (const c of culled) {
    // (not for a pass that can't see it, the first person's arms: packed for their camera, packed again for the
    // world's the next frame)
    if (!camera.layers.test(c.mesh.layers) || !shown(c.mesh.parent)) continue;
    let changed = false;
    for (const cell of c.cells) {
      const inView = !c.mesh.frustumCulled
        || _frustum.intersectsSphere(_sphere.copy(cell.sphere).applyMatrix4(c.mesh.matrixWorld));
      if (inView !== cell.shown) changed = true;
      cell.shown = inView;
    }
    if (changed) pack(c);
  }
}

/** The shadow-only casters shown and the work round a shadow map's draw run, for a draw by `camera`; returns what
 *  puts them back. */
function intoShadow(camera: THREE.Camera): () => void {
  // (a biome's still shadows draw its own casters alone: a hero's shadow cast as one, shown for them, stayed in the
  // braziers' shadow where he stood, and compiled a point light's skinned program mid-fight)
  const casters = stillOf ? [...shadowOnly].filter((caster) => isUnder(caster, stillOf!)) : [...shadowOnly];
  for (const caster of casters) caster.visible = true;
  const after = stillOf ? [] : [...aroundShadow].map((around) => around(camera));
  return () => {
    for (const undo of after) undo();
    for (const caster of casters) caster.visible = false;
  };
}

/** Culls the meshes culled in cells as `renderer` draws `scene`: each render's camera's cells in view packed before
 *  it draws (after the scene's matrices are updated), and the shadow casters shown only while the shadow map draws. */
export function cullWhileDrawn(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  const shadows = renderer.shadowMap;
  if (!shadows.render) {
    shadowsAsRenders(scene);
    return;
  }
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    before.apply(scene, args);
    cullFor(args[2]);
  };
  const draw = shadows.render.bind(shadows);
  shadows.render = (lights, scene, camera) => {
    const back = intoShadow(camera);
    try {
      draw(lights, scene, camera);
    } finally {
      back();
    }
  };
}

/** Whether `camera` is a light's shadow camera in `scene`, each camera looked up once. */
function shadowCameraTest(scene: THREE.Scene): (camera: THREE.Camera) => boolean {
  const known = new WeakMap<THREE.Camera, boolean>();
  return (camera) => {
    let is = known.get(camera);
    if (is === undefined) {
      is = false;
      scene.traverse((part) => {
        const light = part as THREE.Light & { shadow?: THREE.LightShadow };
        if (light.isLight && light.shadow?.camera === camera) is = true;
      });
      known.set(camera, is);
    }
    return is;
  };
}

/**
 * WebGPU's renderer draws each shadow map as a render of the scene by the light's camera, nested in the frame's own,
 * with no shadow map's `render` to wrap: so the shadow-only casters are shown, and the work round a shadow's draw run,
 * between the scene's hooks round such a render. Hidden there, the biomes' baked casters and the trees' shadow
 * copies cast nothing, and each piece of a hero cast on its own (125 draws of the sun's 173 a lobby frame). The
 * cells are packed for the views alone: the culled meshes cast nothing, and packed for each shadow camera too, every
 * one was packed and sent to the GPU twice a frame.
 */
function shadowsAsRenders(scene: THREE.Scene): void {
  const isShadow = shadowCameraTest(scene);
  const backs: (() => void)[] = [];
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    before.apply(scene, args);
    const camera = args[2];
    if (!isShadow(camera)) {
      cullFor(camera);
      const after = [...aroundView].map((around) => around(camera));
      backs.push(() => {
        for (const undo of after) undo();
      });
      return;
    }
    backs.push(intoShadow(camera));
  };
  const after = scene.onAfterRender;
  scene.onAfterRender = (...args) => {
    after.apply(scene, args);
    backs.pop()?.();
  };
}

const NOTHING = (): void => {};

/** the biome whose still shadows are being drawn (`drawingStill`) */
let stillOf: THREE.Object3D | null = null;

/** Whether `object` hangs under `root`. */
function isUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at === root) return true;
  return false;
}

/** `draw` run as `biome`'s still shadows are drawn (`drawStillShadows` in `props.ts`): the shadow map shows only the
 *  casters it alone draws that stand in the biome, and runs no work round its draw (`aroundShadows`). */
export function drawingStill(biome: THREE.Object3D, draw: () => void): void {
  stillOf = biome;
  try {
    draw();
  } finally {
    stillOf = null;
  }
}

/** Whether a biome's still shadows are being drawn (`drawingStill`). */
export const isDrawingStill = (): boolean => stillOf !== null;

const _box = new THREE.Frustum();
/** Lets go of the instances of `group`'s shadow casters outside the box of the shadow map `camera` draws (placed for
 *  the group's biome), which cast into nothing: the ring's trees beyond the clearing, 45% of them. */
export function trimShadowCasters(group: THREE.Group, camera: THREE.OrthographicCamera): void {
  camera.updateMatrixWorld();
  _box.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  group.updateMatrixWorld(true);
  for (const mesh of shadowOnly) {
    const caster = mesh as THREE.InstancedMesh;
    if (!caster.isInstancedMesh || !group.getObjectById(caster.id)) continue;
    if (!caster.geometry.boundingSphere) caster.geometry.computeBoundingSphere();
    // (kept in order, each moved down over those let go)
    let kept = 0;
    for (let i = 0; i < caster.count; i++) {
      caster.getMatrixAt(i, _m);
      _sphere.copy(caster.geometry.boundingSphere!).applyMatrix4(_m).applyMatrix4(caster.matrixWorld);
      if (!_box.intersectsSphere(_sphere)) continue;
      caster.setMatrixAt(kept, _m);
      if (caster.instanceColor) {
        caster.getColorAt(i, _c);
        caster.setColorAt(kept, _c);
      }
      kept++;
    }
    caster.count = kept;
    caster.instanceMatrix.needsUpdate = true;
    if (caster.instanceColor) caster.instanceColor.needsUpdate = true;
    caster.computeBoundingSphere();
  }
}

/** `cullInCells`' cells of one instance each: for few large things (the trees). */
export const eachInstance: CellOf = (_at, i) => i;

/** `cullInCells`' cells for what stands round the arena: `sectors` slices of the ring round its middle. */
export const ringSector = (sectors: number): CellOf => (at) =>
  Math.floor(((Math.atan2(at.z, at.x) / TAU + 1) % 1) * sectors) % sectors;

/** `cullInCells`' cells for what's spread over the floor: squares of `size` m. */
export const gridCell = (size: number): CellOf => (at) => `${Math.floor(at.x / size)},${Math.floor(at.z / size)}`;
