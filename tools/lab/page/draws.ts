// `lab draws`: one frame's draw calls, by what drew them (tools/lab). The crowd of foes `crowd` times stands before the
// hero in the biome and view the set-up asks for, and one frame is drawn with each of the renderer's draw calls
// recorded: the pass it was in (the scene's, the shadow map's, the frame's post and overlays), the geometry and the
// material it drew. Its lists: the geometries drawn most often (one drawn many times a frame, a fern or a rock, is
// one an instanced mesh would draw once), the geometries that drew the most triangles (what the GPU's vertices cost),
// and the scene's draws by their material's look (draws of one look, a merge of what doesn't move would make one).
// And the triangles drawn for nothing: an instanced mesh's instances outside the view of the pass that drew them (the
// camera's, or the shadow map's box), as three.js culls an instanced mesh only whole, by the sphere round all of it.
// And the draws that drew nothing: an instanced mesh of no instances, a geometry of nothing in its range, each the
// renderer's work for a draw on the CPU. And through the eyes, what the arms' own camera drew (renderer.ts
// `drawArms`): the hero's arms and what they hold alone, anything else drawn over the frame at the arms' narrower view
// a problem (the crowds' bodies' own meshes were on the arms' layer, and a foe within reach was drawn huge over the
// frame). `--canary` stands seven boxes of one geometry before the hero, which must come out as seven draws of it,
// seven instanced boxes, four of them far behind the camera, which must come out as four drawn outside the view, an
// instanced mesh of none, which must come out as a draw of nothing, and through the eyes a box on the arms' layer
// before them, which must come out as drawn by the arms' camera though it isn't the hero's. And what the hero's own
// draws cost three: a draw in another material than the one before has all its uniforms sent again, some 20 us on a
// desktop where a draw in the same material takes 4, so a hero's cost is the materials he draws in (the mage's 77
// scene draws merged into 46 took as long). The hero's switches in the frame, his materials and programs are listed,
// over `HERO_SWITCHES` a problem; the canary gives ten of his meshes materials of their own, which must come out
// over it.
import * as THREE from 'three';
import type { Lab, Fixture, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { WEBGPU } from '../../../src/core/webgpu';
import { crowdPlaces, CROWD_FACING, CROWD_SPOT } from './crowd';
import { foesAt } from './death';
import * as swingTrail from '../../../src/fx/swingTrail';
import { armsLens } from './inFrame';

export interface DrawsOptions {
  fixture: Fixture;
  /** how many foes stand before the hero (38 by default, the most a wave keeps alive; 0: none) */
  count?: number;
  /** how many rows each list shows */
  rows?: number;
  /** the biome (as the page has it when not given) */
  biome?: BiomeId;
  canary: boolean;
}

/** the frames run before the one recorded: the camera's glide in and the foes' first frames come to rest */
const SETTLE_FRAMES = 30;
const ROWS = 16;
/** the most draws in another material than the one before a hero may make a frame, scene and shadow maps together,
 *  in any gear (in the forest lobby with all their armour the warrior makes 31, the mage 33, the ranger 34, their
 *  looks drawn from palettes, `models/palette.ts`; each look in its own material, the mage made 58) */
const HERO_SWITCHES = 37;
/** how many of the hero's meshes the canary gives a material of their own */
const CANARY_MATERIALS = 10;
const CANARY_BOXES = 7;
/** the canary's instanced boxes put far behind the camera, and how far (m) */
const CANARY_OFF = 4;
const CANARY_AWAY = 500;
/** how far before the eyes (m) the canary's box on the arms' layer stands: within their camera's reach */
const CANARY_ARMS_AHEAD = 1.5;

/** a frame's passes: the scene's, the arms' own camera's over it (through the eyes), the shadow map's, and after them
 *  (the post, the overlays) */
type Pass = 'scene' | 'arms' | 'shadow' | 'other';
const PASSES: Pass[] = ['scene', 'arms', 'shadow', 'other'];
/** the passes that draw the world, whose triangles the GPU's vertices cost */
const WORLD_PASSES: Pass[] = ['scene', 'arms', 'shadow'];
const noDraws = (): Record<Pass, number> => ({ scene: 0, arms: 0, shadow: 0, other: 0 });

/** What one geometry cost the frame: its draws in each pass, the vertices and triangles each drew, those of them
 *  outside the view of the pass that drew them, in each pass, and what drew it. */
interface Drawn {
  geometry: THREE.BufferGeometry;
  draws: Record<Pass, number>;
  vertices: number;
  triangles: number;
  off: Record<Pass, number>;
  objects: Set<THREE.Object3D>;
  material: THREE.Material;
  object: THREE.Object3D;
}

/** The scene's draws of one material's look, and the geometries they drew. */
interface Look {
  draws: number;
  geometries: Set<THREE.BufferGeometry>;
}

/** One frame's draws: by geometry, the scene's by look, and the objects the arms' own camera drew, with their draws. */
interface FrameDraws {
  geometries: Map<THREE.BufferGeometry, Drawn>;
  looks: Map<string, Look>;
  arms: Map<THREE.Object3D, number>;
  /** the hero's draws, in the order drawn: each one's material, and whether it was another than the draw before's */
  hero: HeroDraw[];
}

/** One draw of the hero's: its material and program, and whether the draw before it (anyone's) was in another. */
interface HeroDraw {
  material: THREE.Material;
  program: number;
  switched: boolean;
}

/** The vertices a draw of `geometry` (by `object`) ran: its range, times its instances. */
function verticesOf(geometry: THREE.BufferGeometry, object: THREE.Object3D): number {
  const vertices = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const range = Math.min(vertices, geometry.drawRange.count);
  const instanced = object as THREE.InstancedMesh;
  const shared = geometry as THREE.InstancedBufferGeometry;
  const instances = instanced.isInstancedMesh ? instanced.count
    : shared.isInstancedBufferGeometry ? shared.instanceCount : 1;
  return range * instances;
}

/** The triangles a draw of `geometry` (by `object`) drew: none but a mesh's (a point or a line is none). */
function trianglesOf(geometry: THREE.BufferGeometry, object: THREE.Object3D): number {
  if (!(object as THREE.Mesh).isMesh) return 0;
  return Math.floor(verticesOf(geometry, object) / 3);
}

const _frustum = new THREE.Frustum();
const _viewing = new THREE.Matrix4();
const _instance = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

/** How many of `object`'s instances of `geometry` lie outside `camera`'s view, each by its own bounding sphere: drawn
 *  for nothing. None for an object that isn't an instanced mesh. */
function instancesOff(object: THREE.Object3D, geometry: THREE.BufferGeometry, camera: THREE.Camera): number {
  const instanced = object as THREE.InstancedMesh;
  if (!instanced.isInstancedMesh) return 0;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  _frustum.setFromProjectionMatrix(_viewing.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let off = 0;
  for (let i = 0; i < instanced.count; i++) {
    instanced.getMatrixAt(i, _instance);
    _instance.premultiply(instanced.matrixWorld);
    _sphere.copy(geometry.boundingSphere!).applyMatrix4(_instance);
    if (!_frustum.intersectsSphere(_sphere)) off++;
  }
  return off;
}

/** A material as the lists show it: its type, and its colour (or its name). */
export function lookOf(material: THREE.Material): string {
  const colour = (material as THREE.MeshStandardMaterial).color;
  const look = material.name || (colour ? `#${colour.getHexString()}` : '');
  return `${material.type.replace(/Material$/, '')}${look ? ` ${look}` : ''}`;
}

/** The pass a draw by `camera` of `scene` is in: the scene drawn by any camera but the game's is the arms' own over
 *  it, no scene the shadow map. */
function passOf(camera: THREE.Camera, scene: THREE.Scene | null): Pass {
  if (scene === null) return 'shadow';
  if (scene !== G.scene) return 'other';
  return camera === G.camera ? 'scene' : 'arms';
}

/** A draw as WebGPU's backend is given it (three's `RenderObject`, as far as this reads it). */
interface RenderObject {
  object: THREE.Object3D;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  camera: THREE.Camera;
  scene: THREE.Scene;
}

/** WebGPU's backend, its draw as this hooks it. */
interface DrawingBackend {
  draw(renderObject: RenderObject, info: unknown): void;
}

/** The pass a WebGPU draw is in: its shadow maps are drawn from the scene by the light's camera (WebGL's are drawn
 *  with no scene). */
function webgpuPassOf(drawn: RenderObject): Pass {
  const shadowed = drawn.scene === G.scene && drawn.camera !== G.camera
    && (drawn.camera as THREE.OrthographicCamera).isOrthographicCamera;
  return passOf(drawn.camera, shadowed ? null : drawn.scene);
}

/** Records every draw call until `stop()`: what was drawn, and the record. On WebGPU, each draw its backend is given
 *  (`backend.draw`, a `RenderObject` a draw: WebGL's `renderBufferDirect` isn't there). */
function recordDraws(): { record: FrameDraws; stop(): void } {
  const record: FrameDraws = { geometries: new Map(), looks: new Map(), arms: new Map(), hero: [] };
  if (WEBGPU) {
    const backend = (G.renderer as unknown as { backend: DrawingBackend }).backend;
    const draw = backend.draw;
    backend.draw = function (drawn, info) {
      recordDraw(record, webgpuPassOf(drawn), drawn.camera, drawn.geometry, drawn.material, drawn.object);
      draw.call(this, drawn, info);
    };
    return { record, stop: () => { backend.draw = draw; } };
  }
  const gl = G.renderer;
  const own = gl.renderBufferDirect.bind(gl);
  let before: THREE.Material | null = null;
  gl.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    const pass = passOf(camera, scene);
    recordDraw(record, pass, camera, geometry, material, object);
    own(camera, scene, geometry, material, object, group);
    if (pass !== 'other' && heros(object)) {
      record.hero.push({ material, program: programOf(material), switched: material !== before });
    }
    before = material;
  };
  return { record, stop: () => { gl.renderBufferDirect = own; } };
}

/** One draw call into the record: by its geometry, by its look in the scene's pass, by its object in the arms'. */
function recordDraw(record: FrameDraws, pass: Pass, camera: THREE.Camera, geometry: THREE.BufferGeometry,
  material: THREE.Material, object: THREE.Object3D): void {
  let drawn = record.geometries.get(geometry);
  if (!drawn) {
    drawn = { geometry, draws: noDraws(), vertices: 0, triangles: 0, off: noDraws(), objects: new Set(), material,
      object };
    record.geometries.set(geometry, drawn);
  }
  drawn.draws[pass]++;
  if (pass === 'arms') record.arms.set(object, (record.arms.get(object) ?? 0) + 1);
  drawn.vertices = verticesOf(geometry, object);
  drawn.triangles = trianglesOf(geometry, object);
  const instances = (object as THREE.InstancedMesh).count;
  if (instances) drawn.off[pass] += (instancesOff(object, geometry, camera) * drawn.triangles) / instances;
  drawn.objects.add(object);
  if (pass === 'scene') {
    drawn.material = material;
    const key = lookOf(material);
    const look = record.looks.get(key) ?? { draws: 0, geometries: new Set() };
    look.draws++;
    look.geometries.add(geometry);
    record.looks.set(key, look);
  }
}

/** An object's place in the scene as names (or types), from the scene down: `crowd mossback`, `forest > Group`. */
export function placeOf(object: THREE.Object3D): string {
  const path: string[] = [];
  for (let at: THREE.Object3D | null = object; at && at !== G.scene; at = at.parent) {
    path.unshift(at.name || at.type);
  }
  return path.slice(0, 2).join(' > ') + (path.length > 2 ? ' > …' : '');
}

/** A sum over `passes` of a record by pass. */
const sumOf = (byPass: Record<Pass, number>, passes: Pass[]): number =>
  passes.reduce((sum, pass) => sum + byPass[pass], 0);
/** A geometry's draws in all its passes. */
const drawsOf = (drawn: Drawn): number => sumOf(drawn.draws, PASSES);
/** The triangles a geometry drew in the frame, in the scene, the arms' pass and the shadows. */
const trianglesIn = (drawn: Drawn): number => drawn.triangles * sumOf(drawn.draws, WORLD_PASSES);

/** A geometry's row: its draws (and each pass's), the triangles, its material, and what drew it. */
function geometryRow(drawn: Drawn): string {
  const passes = PASSES.filter((pass) => drawn.draws[pass]).map((pass) => `${drawn.draws[pass]} ${pass}`).join(', ');
  const objects = drawn.objects.size > 1 ? `, ${drawn.objects.size} objects` : '';
  return `  ${String(drawsOf(drawn)).padStart(4)} (${passes})  ${trianglesIn(drawn)} triangles (${drawn.triangles} `
    + `each)  ${lookOf(drawn.material)}  ${drawn.object.type} in ${placeOf(drawn.object)}${objects}`;
}

/** The triangles a geometry drew outside the view of the pass that drew them, in the passes that draw the world. */
const offIn = (drawn: Drawn): number => Math.round(sumOf(drawn.off, WORLD_PASSES));

/** A geometry's row of what it drew outside the view: in the scene and in the shadow map (and the arms' pass if it
 *  drew there), of all it drew in each. */
function offRow(drawn: Drawn): string {
  const of = (pass: Pass) => `${Math.round(drawn.off[pass])} of ${drawn.triangles * drawn.draws[pass]} in the ${pass}`;
  const passes = WORLD_PASSES.filter((pass) => pass !== 'arms' || drawn.draws.arms).map(of).join(', ');
  return `  ${String(offIn(drawn)).padStart(7)} (${passes})  ${lookOf(drawn.material)}  `
    + `${drawn.object.type} in ${placeOf(drawn.object)}`;
}

/** Whether a geometry's draws drew nothing in the passes that draw the world (a draw after them, a full-screen
 *  pass's, is one triangle). */
const drewNothing = (drawn: Drawn): boolean => drawn.vertices === 0 && sumOf(drawn.draws, WORLD_PASSES) > 0;

/** Why a draw of `drawn` drew nothing: an instanced mesh holding no instance, or its geometry's range empty. */
function nothingWhy(drawn: Drawn): string {
  const instanced = drawn.object as THREE.InstancedMesh;
  const shared = drawn.geometry as THREE.InstancedBufferGeometry;
  const empty = instanced.isInstancedMesh ? instanced.count === 0
    : shared.isInstancedBufferGeometry && shared.instanceCount === 0;
  return `${drawn.geometry.type}, ${empty ? 'no instances' : 'nothing in its range'}`;
}

/** The draws that drew nothing, alike ones together: their draws (each pass's), how many geometries, why, the
 *  material and what drew them. */
function nothingRows(geometries: Drawn[], rows: number): string[] {
  const alike = new Map<string, { draws: Record<Pass, number>; geometries: number }>();
  for (const drawn of geometries.filter(drewNothing)) {
    const key = `${nothingWhy(drawn)}  ${lookOf(drawn.material)}  ${drawn.object.type} in ${placeOf(drawn.object)}`;
    const sum = alike.get(key) ?? { draws: noDraws(), geometries: 0 };
    for (const pass of PASSES) sum.draws[pass] += drawn.draws[pass];
    sum.geometries++;
    alike.set(key, sum);
  }
  const draws = (sum: { draws: Record<Pass, number> }) => sumOf(sum.draws, PASSES);
  return [...alike].sort((a, b) => draws(b[1]) - draws(a[1])).slice(0, rows).map(([key, sum]) => {
    const passes = PASSES.filter((pass) => sum.draws[pass]).map((pass) => `${sum.draws[pass]} ${pass}`).join(', ');
    return `  ${String(draws(sum)).padStart(4)} (${passes}), ${sum.geometries} geometries  ${key}`;
  });
}

/** The local hero's swing trails' meshes, in the scene though they're his (none on a tree without `swingTrailsOf`). */
function heroTrails(): THREE.Object3D[] {
  const trails = swingTrail as Partial<typeof swingTrail>;
  return trails.swingTrailsOf?.(G.player.model) ?? [];
}

/** Whether `object` is the local hero's: his model's root or under it, or a trail of his weapons. */
function heros(object: THREE.Object3D): boolean {
  if (heroTrails().includes(object)) return true;
  for (let up: THREE.Object3D | null = object; up; up = up.parent) {
    if (up === G.player.model.root) return true;
  }
  return false;
}

/** The id of the program `material` was last drawn with (-1 before its first draw). */
function programOf(material: THREE.Material): number {
  const held = G.renderer.properties.get(material) as { currentProgram?: { id: number } };
  return held.currentProgram?.id ?? -1;
}

/** How many of the hero's draws were in another material than the draw before. */
const switchesOf = (record: FrameDraws): number => record.hero.filter((draw) => draw.switched).length;

/** The hero's draws in the frame's world passes, as three pays for them: his switches of material, his materials and
 *  his programs. */
function heroRow(record: FrameDraws): string {
  const materials = new Set(record.hero.map((draw) => draw.material)).size;
  const programs = new Set(record.hero.map((draw) => draw.program)).size;
  return `the hero: ${record.hero.length} draws in the scene and its shadow maps, ${switchesOf(record)} of them in `
    + `another material than the draw before (each has every uniform sent again), in ${materials} materials and `
    + `${programs} programs`;
}

/** The problems of the hero's switches: over `most`, or (the canary's, ten meshes in materials of their own) not
 *  over it. */
function heroProblems(record: FrameDraws, most: number, canary: boolean): string[] {
  const switches = switchesOf(record);
  if (canary) {
    if (switches > most) return [];
    return [`the canary's hero, ${CANARY_MATERIALS} of his meshes in materials of their own, came out as ${switches} `
      + `switches of material: not over ${most}`];
  }
  if (switches <= most) return [];
  return [`the hero switches material ${switches} times a frame: over ${most} (a material more on him is a switch `
    + 'more in each pass that draws it)'];
}


/** Ten of the hero's meshes shown given a copy of their material each (the canary's): as many switches more. */
function plantMaterials(): void {
  let left = CANARY_MATERIALS;
  G.player.model.root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (left === 0 || !mesh.isMesh || Array.isArray(mesh.material)) return;
    const copy = mesh.material.clone();
    copy.onBeforeCompile = mesh.material.onBeforeCompile;
    copy.customProgramCacheKey = mesh.material.customProgramCacheKey;
    mesh.material = copy;
    left--;
  });
}

/** What the arms' own camera drew that isn't the hero's, alike places together: each place's draws and objects. */
function strangers(record: FrameDraws): Map<string, { draws: number; objects: number }> {
  const alike = new Map<string, { draws: number; objects: number }>();
  for (const [object, draws] of record.arms) {
    if (heros(object)) continue;
    const key = `${object.type} in ${placeOf(object)}`;
    const sum = alike.get(key) ?? { draws: 0, objects: 0 };
    sum.draws += draws;
    sum.objects++;
    alike.set(key, sum);
  }
  return alike;
}

/** The rows of what the arms' own camera drew: the hero's, then each place of what isn't his, the most draws first. */
function armsRows(record: FrameDraws, rows: number): string[] {
  const own = [...record.arms].filter(([object]) => heros(object));
  const ownDraws = own.reduce((sum, [, draws]) => sum + draws, 0);
  const strangerRow = ([place, { draws, objects }]: [string, { draws: number; objects: number }]) =>
    `  ${String(draws).padStart(4)}, ${objects} objects  ${place}, not the hero's`;
  const others = [...strangers(record)].sort((a, b) => b[1].draws - a[1].draws).slice(0, rows).map(strangerRow);
  return [`  ${String(ownDraws).padStart(4)}, ${own.length} objects  the hero's`, ...others];
}

/** The lists: the geometries drawn most often, those that drew the most triangles, those that drew the most outside
 *  the view, the draws that drew nothing, and the scene's looks; through the eyes, what the arms' camera drew. */
function lists(record: FrameDraws, rows: number): string[] {
  const geometries = [...record.geometries.values()];
  const often = [...geometries].sort((a, b) => drawsOf(b) - drawsOf(a)).slice(0, rows).map(geometryRow);
  const heavy = [...geometries].sort((a, b) => trianglesIn(b) - trianglesIn(a)).slice(0, rows).map(geometryRow);
  const unseen = geometries.filter((drawn) => offIn(drawn) > 0).sort((a, b) => offIn(b) - offIn(a)).slice(0, rows)
    .map(offRow);
  const looks = [...record.looks].sort((a, b) => b[1].draws - a[1].draws).slice(0, rows)
    .map(([look, { draws, geometries: drew }]) => `  ${String(draws).padStart(4)}  ${look}  (${drew.size} geometries)`);
  return [
    'the geometries drawn most often:', ...often,
    'the geometries that drew the most triangles:', ...heavy,
    'the geometries that drew the most triangles outside the view (an instanced mesh\'s instances beyond the camera '
      + 'of the pass that drew them, the scene\'s or the shadow map\'s):', ...unseen,
    'the draws that drew nothing (the renderer\'s work for a draw each, on the CPU: an instanced mesh of none never '
      + 'reaches the GPU, and the perf overlay counts no draw of it), alike ones together:',
    ...nothingRows(geometries, rows),
    'the scene\'s draws by their material\'s look:', ...looks,
    ...(record.arms.size ? ['what the arms\' own camera drew over the frame (the hero\'s arms and what they hold '
      + 'alone):', ...armsRows(record, rows)] : []),
  ];
}

/** The frame's draws in each pass, those that drew nothing, and its triangles in the scene and shadows, and of them
 *  outside the view. */
function totalsOf(record: FrameDraws): string {
  const sum = { ...noDraws(), nothing: 0, triangles: 0, off: 0 };
  for (const drawn of record.geometries.values()) {
    for (const pass of PASSES) sum[pass] += drawn.draws[pass];
    if (drewNothing(drawn)) sum.nothing += drawsOf(drawn);
    sum.triangles += trianglesIn(drawn);
    sum.off += offIn(drawn);
  }
  const arms = sum.arms ? `, ${sum.arms} by the arms' own camera` : '';
  return `${sum.scene} draws in the scene${arms}, ${sum.shadow} in its shadow map, ${sum.other} after it, `
    + `${sum.nothing} of them of nothing; ${sum.triangles} triangles in the scene and shadows, ${sum.off} of them `
    + `outside the view; ${record.geometries.size} geometries`;
}

/** The scene's objects as the frame updates their matrices: all of them, those whose own matrix is made again each
 *  frame, and of those the ones off the camera's layer (a crowd's bodies' own meshes, models/crowd.ts: only what reads
 *  them needs them). */
function objectsOf(): string {
  let all = 0, auto = 0, hidden = 0;
  G.scene.traverse((object) => {
    all++;
    if (!object.matrixAutoUpdate) return;
    auto++;
    if (!object.layers.isEnabled(0)) hidden++;
  });
  return `${all} objects in the scene, ${auto} made again each frame (${hidden} of them off the camera's layer)`;
}

/** the canary's box on the arms' layer */
const ARMS_CANARY = 'canary on the arms\' layer';

/** Whether the arms are drawn by their own camera this frame (through the eyes, renderer.ts `drawArms`). */
const ownArmsCamera = (): boolean => armsLens() !== G.camera;

/** Through the eyes, a box of its own geometry on the arms' own layer stood within their camera's reach before the
 *  eyes, not the hero's (the canary's), or none in another view. */
function armsBox(material: THREE.Material, way: THREE.Vector3): THREE.Mesh | null {
  if (!ownArmsCamera()) return null;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), material);
  box.name = ARMS_CANARY;
  box.position.copy(G.player.pos).addScaledVector(way, CANARY_ARMS_AHEAD).setY(G.camera.position.y);
  box.layers.mask = armsLens().layers.mask;
  G.scene.add(box);
  return box;
}

/** Seven boxes of one geometry stood before the hero, and seven instanced boxes of another, `CANARY_OFF` of them far
 *  behind the camera, and through the eyes a box on the arms' layer (the canary's); returns what takes them away. */
function plantBoxes(): () => void {
  const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const instancedGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  const way = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  const ahead = (i: number) => G.player.pos.clone().addScaledVector(way, 2 + i * 0.4).setY(0.5);
  const boxes = Array.from({ length: CANARY_BOXES }, (_, i) => {
    const box = new THREE.Mesh(geometry, material);
    box.name = 'canary box';
    box.position.copy(ahead(i));
    G.scene.add(box);
    return box;
  });
  const instanced = new THREE.InstancedMesh(instancedGeometry, material, CANARY_BOXES);
  instanced.name = 'canary instances';
  const behind = G.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-CANARY_AWAY).add(G.camera.position);
  for (let i = 0; i < CANARY_BOXES; i++) {
    const at = i < CANARY_OFF ? behind : ahead(i).setY(0.9);
    instanced.setMatrixAt(i, new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
  }
  G.scene.add(instanced);
  // (drawn though it holds none: three culls an instanced mesh of none by its empty sphere)
  const emptyGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const empty = new THREE.InstancedMesh(emptyGeometry, material, 1);
  empty.name = 'canary of nothing';
  empty.count = 0;
  empty.frustumCulled = false;
  G.scene.add(empty);
  const onArms = armsBox(material, way);
  return () => {
    for (const box of boxes) G.scene.remove(box);
    G.scene.remove(instanced, empty);
    if (onArms) {
      G.scene.remove(onArms);
      onArms.geometry.dispose();
    }
    geometry.dispose();
    instancedGeometry.dispose();
    emptyGeometry.dispose();
    material.dispose();
  };
}

/** The canary's problems: its boxes not seven draws of their geometry, its instanced boxes behind the camera not read
 *  as drawn outside the view. */
function canaryProblems(record: FrameDraws): string[] {
  const problems: string[] = [];
  const geometries = [...record.geometries.values()];
  const boxes = geometries.find((drawn) => drawn.object.name === 'canary box');
  if (!boxes || boxes.draws.scene !== CANARY_BOXES) {
    problems.push(`the canary's ${CANARY_BOXES} boxes came out as ${boxes?.draws.scene ?? 0} draws of their geometry`);
  }
  const instanced = geometries.find((drawn) => drawn.object.name === 'canary instances');
  const perBox = instanced ? instanced.triangles / CANARY_BOXES : 0;
  const offScene = instanced && perBox ? Math.round(instanced.off.scene / perBox) : 0;
  if (offScene !== CANARY_OFF) {
    problems.push(`the canary's ${CANARY_OFF} instanced boxes behind the camera came out as ${offScene} outside `
      + 'the view');
  }
  const empty = geometries.find((drawn) => drawn.object.name === 'canary of nothing');
  if (!empty || !drewNothing(empty) || !nothingWhy(empty).endsWith('no instances')) {
    problems.push('the canary\'s instanced mesh of no instances didn\'t come out as a draw of nothing');
  }
  const armsCanary = [...record.arms.keys()].some((object) => object.name === ARMS_CANARY && !heros(object));
  if (ownArmsCamera() && !armsCanary) {
    problems.push('the canary\'s box on the arms\' layer didn\'t come out as drawn by their camera, not the hero\'s');
  }
  return problems;
}

/** The problem of what the arms' own camera drew over the frame that isn't the hero's (but the canary's box). */
function strangerProblems(record: FrameDraws): string[] {
  const found = [...strangers(record)].filter(([place]) => !place.includes(ARMS_CANARY));
  if (!found.length) return [];
  const places = found.map(([place, { draws }]) => `${place} (${draws} draws)`).join(', ');
  return [`through the eyes, the arms' own camera drew what isn't the hero's over the frame, at their view: ${places}`];
}

/** One frame drawn with its draw calls recorded, after the set-up's frames have settled. */
async function recordedFrame(lab: Lab): Promise<FrameDraws> {
  // (the frames drawn: the lab skips the draws of a command that reads none)
  lab.drawing = true;
  try {
    await lab.step(SETTLE_FRAMES);
    const recording = recordDraws();
    try {
      await lab.step(1);
    } finally {
      recording.stop();
    }
    return recording.record;
  } finally {
    lab.drawing = false;
  }
}

export async function draws(lab: Lab, options: DrawsOptions): Promise<Report> {
  const count = options.count ?? 38;
  if (options.biome && G.arena.biome !== options.biome) G.arena.setBiome(options.biome);
  G.arena.restoreProps();
  const facing = options.fixture.facing ?? (CROWD_FACING * Math.PI) / 180;
  await lab.setup({ ...options.fixture, at: options.fixture.at ?? CROWD_SPOT, facing });
  if (count > 0) await foesAt(lab, crowdPlaces(count, G.player.pos, G.player.facing), Array(count).fill(1));
  const unplant = options.canary ? plantBoxes() : () => {};
  // (on a fresh boot, as every command's is: nothing is put back)
  if (options.canary) plantMaterials();
  let record: FrameDraws;
  try {
    record = await recordedFrame(lab);
  } finally {
    unplant();
  }
  const foes = `${count} ${count === 1 ? 'foe' : 'foes'}`;
  const view = options.fixture.view ?? 'top';
  const head = `${G.player.cls.id}, ${foes}, ${G.arena.biome}, ${view} view: ${totalsOf(record)}; ${objectsOf()}`;
  const problems = [
    ...strangerProblems(record),
    ...heroProblems(record, HERO_SWITCHES, options.canary),
    ...(options.canary ? canaryProblems(record) : []),
  ];
  return { text: [head, heroRow(record), ...lists(record, options.rows ?? ROWS)].join('\n'), problems };
}
