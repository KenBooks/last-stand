// The guide's portraits: each foe's own model and each hero's in his starting gear (entities/models), built and drawn
// once into a picture by a small
// WebGL renderer of the guide's own, a foe a frame, and kept for the visit. The game's renderer never sees these
// models, so it compiles nothing for them (the root's "shaders compile at load"); this renderer compiles in parallel
// where the browser can (`compileAsync`), and is dropped with its context once every asked-for picture is made.
import * as THREE from 'three';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { CLASSES } from '../../data/classes/index';
import { buildModel } from '../../entities/models/index';
import { gearOf, makeItem } from '../../loot/items';
import type { Model, Profile } from '../../types';
import { disposeGeometries } from '../../entities/models/rig';

/** the pictures' size (px): shown at up to half of it, crisp on a screen of 2 pixels a css px */
const SIZE = 320;
/** where the camera stands: how far round from the foe's front (rad) and how far above level it looks down (rad) */
const VIEW = { round: 0.55, down: 0.12, fov: 28 };

const made = new Map<Who, string>();
const waiting = new Map<Who, ((url: string | null) => void)[]>();
const queue: Who[] = [];
let renderer: THREE.WebGLRenderer | null = null;
let running = false;
/** a picture couldn't be drawn here (no WebGL2, a model that wouldn't build): every foe shows its glyph */
let failed = false;

/** Whose picture: a foe's id, or `hero:` and a class's id. */
export type Who = EnemyId | `hero:${string}`;

/** A picture made already (a data URL), or null. */
export const portraitMade = (id: Who): string | null => made.get(id) ?? null;

/** Foe `id`'s picture, made if it isn't yet (a frame or so a foe, after those asked for before it); null where none
 *  can be made. */
export function portrait(id: Who): Promise<string | null> {
  const have = made.get(id);
  if (have || failed) return Promise.resolve(have ?? null);
  return new Promise((done) => {
    const list = waiting.get(id);
    if (list) { list.push(done); return; }
    waiting.set(id, [done]);
    queue.push(id);
    if (!running) void run();
  });
}

/** Asks for `id`'s picture before the others waiting (the foe whose page just opened). */
export function hurryPortrait(id: Who): void {
  const at = queue.indexOf(id);
  if (at > 0) { queue.splice(at, 1); queue.unshift(id); }
}

const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));

async function run(): Promise<void> {
  running = true;
  while (queue.length) {
    await frame();
    const id = queue.shift()!;
    let url: string | null = null;
    try { url = await draw(id); } catch (err) { console.warn(`guide: no portrait of ${id}`, err); }
    if (url) made.set(id, url);
    for (const done of waiting.get(id) ?? []) done(url);
    waiting.delete(id);
  }
  running = false;
  // (its context let go: a second WebGL context held for nothing is memory a phone hasn't)
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
}

function ensureRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch (err) {
    failed = true;
    throw err;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

/** The lights a portrait is drawn by: a warm key from the front right, a cool rim from behind, a dim fill. */
function lights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a1e14, 1.1));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 2.2);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
}

/** The box round what's shown of `root` (a hero's model holds every piece of gear he could wear, hidden). */
function shownBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3(), part = new THREE.Box3();
  root.traverseVisible((o) => {
    const geo = (o as THREE.Mesh).geometry;
    if (!(o as THREE.Mesh).isMesh || !geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    box.union(part.copy(geo.boundingBox!).applyMatrix4(o.matrixWorld));
  });
  return box;
}

/** Whose model built: a foe's, or a hero's holding his class's starting gear. */
function build(id: Who): Model {
  if (!id.startsWith('hero:')) return buildModel(ENEMIES[id as EnemyId].model);
  const cls = CLASSES[id.slice('hero:'.length)];
  const model = buildModel(cls.model);
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) equipped[g.slot] = makeItem({ slot: g.slot, rarity: g.rarity, ilvl: g.ilvl, cls });
  model.setGear?.(gearOf(cls, equipped));
  return model;
}

/** Foe `id`'s model built, at rest, framed head to feet from a little round its front and drawn: a PNG data URL. */
async function draw(id: Who): Promise<string> {
  const r = ensureRenderer();
  const model = build(id);
  // (a moment into its idle, so it stands as it does in the fight)
  for (let i = 0; i < 3; i++) model.animate({ t: 0.4 + i * 0.1, dt: 0.1, phase: 0, move: 0, action: null, hit: 0, dead: -1 });
  const scene = new THREE.Scene();
  lights(scene);
  scene.add(model.root);
  model.root.updateMatrixWorld(true);
  const box = shownBox(model.root);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.05, 200);
  // (far enough that the taller of its height and its width fills the frame, with a margin)
  const fit = Math.max(size.y, Math.hypot(size.x, size.z) * 0.85) * 0.56;
  const dist = fit / Math.tan(THREE.MathUtils.degToRad(VIEW.fov / 2));
  camera.position.set(
    mid.x + Math.sin(VIEW.round) * Math.cos(VIEW.down) * dist,
    mid.y + Math.sin(VIEW.down) * dist,
    mid.z + Math.cos(VIEW.round) * Math.cos(VIEW.down) * dist,
  );
  camera.lookAt(mid);
  await r.compileAsync(scene, camera);
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(model.root);
  disposeGeometries(model.root);
  return url;
}
