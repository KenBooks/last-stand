// The guide's portraits: each foe's own model and each hero's in his starting gear (entities/models), drawn once into a
// picture by a small WebGL renderer of the guide's own. The game's renderer never sees these models, so it links no
// program for them (the root's "shaders compile at load"). They're made behind the lobby a piece a frame, as the
// heroes are (game/behind.ts, `queuePortraitsBehind` from main.ts once its warm-ups are done): the renderer, each
// model (a hero's in his build's own pieces), its compile waited on (`compileAsync`, in parallel where the browser can)
// and its picture encoded off the page's thread (`toBlob`). Made all at once as the guide opened, they held it up
// 330 ms and then 90 to 110 ms a picture (from Victor's review of #665: "lags for 1-2sec"; `npm run lab -- guide`).
// A production build keeps them in the browser's storage for its own build (`CACHE`), so a later visit makes none.
// Opened before they're made, the guide shows a picture as it comes, the ones it shows first (`hurryPortrait`).
import * as THREE from 'three';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { CLASSES, CLASS_IDS } from '../../data/classes/index';
import { buildModel, modelSteps } from '../../entities/models/index';
import { gearOf, makeItem } from '../../loot/items';
import { disposeGeometries } from '../../entities/models/rig';
import { buildFirst, buildLater, finishNow, queued } from '../../game/behind';
import { perfClock } from '../perfHud';
import type { Model, Profile } from '../../types';

declare const __BUILD__: { ref: string; time: string };

/** the pictures' size (px): shown at up to half of it, crisp on a screen of 2 pixels a css px */
const SIZE = 320;
/** where the camera stands: how far round from the foe's front (rad) and how far above level it looks down (rad) */
const VIEW = { round: 0.55, down: 0.12, fov: 28 };
/** the build's key behind the lobby */
const JOB = 'guide portraits';
/** the browser's store the pictures are kept in, a production build's alone (a dev build's models change under it) */
const CACHE = { db: 'last-stand-guide', store: 'portraits', on: !import.meta.env.DEV && typeof indexedDB !== 'undefined' };

/** set while a harness's planted fault runs (`remakeAllNow`): each picture drawn and encoded at once, as they were */
const portraitPlant = { allAtOnce: false };

/** Whose picture: a foe's id, or `hero:` and a class's id. */
export type Who = EnemyId | `hero:${string}`;

const made = new Map<Who, string>();
const waiting = new Map<Who, ((url: string | null) => void)[]>();
/** the pictures still to make, the first made next */
let pending: Who[] = [];
let renderer: THREE.WebGLRenderer | null = null;
/** a picture couldn't be drawn here (no WebGL): every foe shows its glyph */
let failed = false;
/** the browser's store read (once) and the rest queued */
let started = false;

/** Each piece's name and time (ms, by `perfClock`: a harness's, `lab guide`, reads the browser's own), the latest
 *  `PIECES_KEPT`: what the slowest is made of. */
export const portraitPieces: { what: string; ms: number }[] = [];
const PIECES_KEPT = 2000;
/** `work` done as a piece named `what`, its time kept. */
function piece<T>(what: string, work: () => T): T {
  const at = perfClock.now();
  try { return work(); } finally {
    portraitPieces.push({ what, ms: perfClock.now() - at });
    if (portraitPieces.length > PIECES_KEPT) portraitPieces.shift();
  }
}

/** A build in pieces, each piece timed as `what`'s. */
function* timedSteps<T>(what: string, steps: Generator<void, T, undefined>): Generator<void, T, undefined> {
  for (;;) {
    const next = piece(what, () => steps.next());
    if (next.done) return next.value;
    yield;
  }
}

/** Every picture the guide shows: the foes', the bosses' and the heroes'. */
function everyone(): Who[] {
  const foes = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => !ENEMIES[id].dummy);
  return [...foes.filter((id) => !ENEMIES[id].boss), ...foes.filter((id) => ENEMIES[id].boss), ...CLASS_IDS.map((id) => `hero:${id}` as Who)];
}

/** A picture made already (an object URL), or null. */
export const portraitMade = (id: Who): string | null => made.get(id) ?? null;

/** `id`'s picture, as it's made behind the lobby (or at once if it is); null where none can be made. */
export function portrait(id: Who): Promise<string | null> {
  const have = made.get(id);
  if (have || failed) return Promise.resolve(have ?? null);
  queuePortraitsBehind();
  return new Promise((done) => waiting.set(id, [...(waiting.get(id) ?? []), done]));
}

/** `id`'s picture made before the others (a page showing it opened), the build behind the lobby moved to the front. */
export function hurryPortrait(id: Who): void {
  const at = pending.indexOf(id);
  if (at > 0) { pending.splice(at, 1); pending.unshift(id); }
  buildFirst(JOB);
}

/** The pictures queued to be made behind the lobby (once; those the browser kept are read first). */
export function queuePortraitsBehind(): void {
  if (started || failed) return;
  started = true;
  void kept().then(() => {
    pending = everyone().filter((id) => !made.has(id));
    if (pending.length && !queued(JOB)) buildLater(JOB, steps(), () => undefined);
  });
}

/** A picture made: kept, and given to whoever waits for it. */
function settle(id: Who, url: string | null): void {
  if (url) made.set(id, url);
  for (const done of waiting.get(id) ?? []) done(url);
  waiting.delete(id);
}

/** The picture being made: its model staged, its textures still to send, and how far the browser has come with its
 *  compile and its encoding (each waited on out of the queue: the build queued again as it's done). */
interface Making {
  id: Who;
  model: Model;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  textures: THREE.Texture[];
  compiled: boolean;
  drawn: boolean;
  encoded: boolean;
  blob: Blob | null;
}
let making: Making | null = null;

/** The build queued again behind the lobby (what the browser was doing for it is done). */
function requeue(): void {
  if (!queued(JOB) && (pending.length || making)) buildLater(JOB, steps(), () => undefined);
}

/** The pictures made, a piece at a time: the renderer, each model (a hero's in his build's own pieces), its staging,
 *  its textures sent a piece each, its draw, and its picture. While the browser compiles it and encodes its picture,
 *  off the page's thread, the build leaves the queue (nothing behind the lobby waits on it) and comes back as each is
 *  done. The renderer is let go after the last. */
function* steps(): Generator<void, void, undefined> {
  while (pending.length || making) {
    const id = making?.id ?? pending[0];
    try {
      if (!making) {
        if (made.has(id)) { pending = pending.filter((who) => who !== id); continue; }
        if (!renderer) { renderer = piece('the renderer made', makeRenderer); yield; }
        const model: Model = yield* timedSteps(`${id}: its model built`, modelOf(id));
        yield;
        const { scene, camera } = piece(`${id}: staged and framed`, () => staged(model));
        yield;
        const m: Making = { id, model, scene, camera, textures: texturesOf(model.root), compiled: false, drawn: false, encoded: false, blob: null };
        making = m;
        const r = renderer;
        const compiled = (): void => { m.compiled = true; requeue(); };
        if (!portraitPlant.allAtOnce) piece(`${id}: its compile asked for`, () => r.compileAsync(scene, camera).then(compiled, compiled));
      }
      const m = making, r = renderer!;
      // (its textures sent to the card a piece each while it compiles: sent by its first draw, a hero's held it 33 to
      // 81 ms)
      while (m.textures.length && !portraitPlant.allAtOnce) {
        const texture = m.textures.shift()!;
        piece(`${id}: a texture sent`, () => r.initTexture(texture));
        yield;
      }
      if (!m.compiled && !portraitPlant.allAtOnce) return;
      let url: string | null = null;
      if (portraitPlant.allAtOnce) {
        // (the canary: drawn and encoded at once, as they were)
        url = piece(`${id}: drawn and encoded at once`, () => { r.render(m.scene, m.camera); return r.domElement.toDataURL('image/png'); });
      } else {
        if (!m.drawn) {
          m.drawn = true;
          piece(`${id}: drawn`, () => {
            r.render(m.scene, m.camera);
            r.domElement.toBlob((b) => { m.blob = b; m.encoded = true; requeue(); }, 'image/png');
          });
        }
        if (!m.encoded) return;
        if (m.blob) { url = URL.createObjectURL(m.blob); keep(id, m.blob); }
      }
      piece(`${id}: let go`, () => { m.scene.remove(m.model.root); disposeGeometries(m.model.root); });
      making = null;
      settle(id, url);
    } catch (err) {
      console.warn(`guide: no portrait of ${id}`, err);
      making = null;
      if (!renderer) { failed = true; for (const who of pending) settle(who, null); pending = []; return; }
      settle(id, null);
    }
    pending = pending.filter((who) => who !== id);
    yield;
  }
  // (its context let go: a second WebGL context held for nothing is memory a phone hasn't)
  piece('the renderer let go', () => { renderer?.dispose(); renderer?.forceContextLoss(); renderer = null; });
}

function makeRenderer(): THREE.WebGLRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(SIZE, SIZE, false);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  return r;
}

/** Whose model built: a foe's in one piece, or a hero's in his build's own pieces, holding his class's starting gear. */
function* modelOf(id: Who): Generator<void, Model, undefined> {
  if (!id.startsWith('hero:')) return buildModel(ENEMIES[id as EnemyId].model);
  const cls = CLASSES[id.slice('hero:'.length)];
  const model = yield* modelSteps(cls.model);
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) equipped[g.slot] = makeItem({ slot: g.slot, rarity: g.rarity, ilvl: g.ilvl, cls });
  model.setGear?.(gearOf(cls, equipped));
  return model;
}

/** Every texture what's shown of `root` is drawn with, once each. */
function texturesOf(root: THREE.Object3D): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  root.traverseVisible((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) found.add(v as THREE.Texture);
    }
  });
  return [...found];
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

/** The model at rest, a moment into its idle, in a scene of its own, and a camera framing it head to feet from a
 *  little round its front. */
function staged(model: Model): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
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
  return { scene, camera };
}

/** A harness's planted fault (`lab guide --canary`): every picture forgotten and made again at once, in this task, as
 *  the guide made them before they were made behind the lobby. */
export function remakeAllNow(): void {
  made.clear();
  pending = everyone();
  if (making && !pending.includes(making.id)) pending.unshift(making.id);
  started = true;
  portraitPlant.allAtOnce = true;
  try {
    if (!queued(JOB)) buildLater(JOB, steps(), () => undefined);
    finishNow(JOB);
  } finally { portraitPlant.allAtOnce = false; }
}

// --- kept in the browser for the build -------------------------------------------------------------------------------

/** the build's own key: its commit and time (a new deploy's models may differ) */
const buildKey = (): string => `${__BUILD__.ref}@${__BUILD__.time}`;

function openStore(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(CACHE.db, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(CACHE.store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** The pictures this build kept on an earlier visit, made object URLs; another build's let go. */
async function kept(): Promise<void> {
  if (!CACHE.on) return;
  const db = await openStore();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(CACHE.store, 'readwrite');
      const store = tx.objectStore(CACHE.store);
      const req = store.openCursor();
      const prefix = `${buildKey()}|`;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith(prefix) && cursor.value instanceof Blob) settle(key.slice(prefix.length) as Who, URL.createObjectURL(cursor.value));
        else cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
  db.close();
}

/** A picture kept for this build's later visits. */
function keep(id: Who, blob: Blob): void {
  if (!CACHE.on) return;
  void openStore().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(CACHE.store, 'readwrite');
      tx.objectStore(CACHE.store).put(blob, `${buildKey()}|${id}`);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    } catch { db.close(); }
  });
}
