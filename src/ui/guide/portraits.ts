// The guide's portraits: each foe's own model and each hero's in his starting gear (entities/models), drawn once into a
// picture by a small WebGL renderer of the guide's own. The game's renderer never sees these models, so it links no
// program for them (the root's "shaders compile at load"). They're made behind the lobby a piece a frame, as the
// heroes are (game/behind.ts, `queuePortraitsBehind` from main.ts once its warm-ups are done): the renderer, each
// model (a hero's in his build's own pieces), its compile waited on (`compileAsync`, in parallel where the browser can),
// and its draw copied into a canvas of its own the guide's places are drawn from (`made`: shown the frame it's drawn,
// where a PNG encoded first held each picture back a few frames more; Victor on #665: "model renders take 5-10sec to
// appear"). While the guide is open they're made first (`stepPortraits`), the ones it shows before the others. Made all at once as the guide opened, they held it up
// 330 ms and then 90 to 110 ms a picture (from Victor's review of #665: "lags for 1-2sec"; `npm run lab -- guide`).
// A production build keeps them in the browser's storage for its own build (`CACHE`), so a later visit makes none.
// Opened before they're made, the guide shows a picture as it comes, the ones it shows first (`hurryPortrait`).
// The library's Brother Hollis is pictured here too, first, for his talk's card (ui/talk.ts): another of him built on
// the library's book, looking up at the one he talks to, head and shoulders by a candle in the dim library
// (`scholarStaged`; from play, "lets have an actual picture of him, of his actual face").
import * as THREE from 'three';
import { foeLoaded, loadFoe } from '../../entities/bosses';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { CLASSES, CLASS_IDS } from '../../data/classes/index';
import { buildModel, modelSteps } from '../../entities/models/index';
import { gearOf, makeItem } from '../../loot/items';
import { disposeGeometries } from '../../entities/models/rig';
import { buildFirst, buildLater, buildOnly, finishNow, queued } from '../../game/behind';
import { perfClock } from '../perfHud';
import { QUALITY } from '../../data/quality';
import { qualityLevel } from '../../core/quality';
import type { Model, Profile } from '../../types';
import { buildScholar, scholarBook } from '../../entities/models/scholar';

declare const __BUILD__: { ref: string; time: string };

/** the pictures' size (px): shown at up to half of it, crisp on a screen of 2 pixels a css px */
const SIZE = 320;
/** where the camera stands: how far round from the foe's front (rad) and how far above level it looks down (rad) */
const VIEW = { round: 0.55, down: 0.12, fov: 28 };
/** the build's key behind the lobby */
const JOB = 'guide portraits';
/** the browser's store the pictures are kept in, a production build's alone (a dev build's models change under it) */
const CACHE = { db: 'last-stand-guide', store: 'portraits', on: !import.meta.env.DEV && typeof indexedDB !== 'undefined' };

/** how much of a frame the pictures may take while the guide is open (ms, and the most pieces): made only behind the
 *  lobby, 2 ms a frame after the heroes and never while the fight's warm-up ran, a first visit's guide showed one
 *  picture 20 s after it opened and most of them after a minute (from play: "icons not loading in guide") */
export const WHILE_OPEN = { ms: 8, most: 40 };

/** a harness's planted faults: each picture drawn and encoded at once, as they were (`remakeAllNow`); the pictures not
 *  made while the guide is open, only behind the lobby, as they were (`lab guide --canary=slow`); the next try at
 *  `failNext`'s picture failing, as one came back empty in play and the talk card showed a drawing (`lab talk`) */
export const portraitPlant = { allAtOnce: false, notWhileOpen: false, failNext: null as Who | null };

/** Whose picture: a foe's id, `hero:` and a class's id, or the library's scholar. */
export type Who = EnemyId | `hero:${string}` | 'scholar';

/** each picture made: a canvas of its own (`SIZE` square) every place showing it is drawn from */
const made = new Map<Who, HTMLCanvasElement>();
const waiting = new Map<Who, ((pic: HTMLCanvasElement | null) => void)[]>();
/** the pictures still to make, the first made next */
let pending: Who[] = [];
let renderer: THREE.WebGLRenderer | null = null;
/** a picture couldn't be drawn here (no WebGL): every foe shows its glyph */
let failed = false;
/** the browser's store read (once) and the rest queued */
let started = false;

/** Each piece's name, when it began and how long it took (ms, by `perfClock`: a harness's, `lab guide`, reads the
 *  browser's own), the latest `PIECES_KEPT`: what the slowest is made of, and where a late one waited. */
export const portraitPieces: { what: string; at: number; ms: number; waited?: boolean }[] = [];
/** when each picture's compile was done, when its draw was sent to the card and the card had done it, and when it was
 *  drawn into its canvas (by `perfClock`), for a harness (`lab guide`) */
export const portraitTimes = new Map<Who, { compiled: number; sent: number; onCard: number; drawn: number }>();
const PIECES_KEPT = 2000;
/** `work` done as a piece named `what`, its time kept. */
function piece<T>(what: string, work: () => T): T {
  const at = perfClock.now();
  try { return work(); } finally {
    portraitPieces.push({ what, at, ms: perfClock.now() - at });
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
function guides(): Who[] {
  const foes = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => !ENEMIES[id].dummy);
  return [...foes.filter((id) => !ENEMIES[id].boss), ...foes.filter((id) => ENEMIES[id].boss), ...CLASS_IDS.map((id) => `hero:${id}` as Who)];
}
/** Every picture made: the scholar's first (his talk's card shows it), then the guide's. */
const everyone = (): Who[] => ['scholar', ...guides()];

/** The pictures not made yet, of every foe, boss and hero the guide shows (a harness's: `lab guide`). */
export const portraitsLeft = (): Who[] => guides().filter((id) => !made.has(id));

/** A picture made already, or null. */
export const portraitMade = (id: Who): HTMLCanvasElement | null => made.get(id) ?? null;

/** `pic` drawn into `into` (a place in the guide showing it), filling it. */
export function drawPortrait(into: HTMLCanvasElement, pic: HTMLCanvasElement): void {
  if (into.width !== SIZE) into.width = into.height = SIZE;
  const ctx = into.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(pic, 0, 0);
}

/** A canvas of the pictures' size holding what `from` shows now. */
function copied(from: CanvasImageSource): HTMLCanvasElement {
  const pic = document.createElement('canvas');
  pic.width = pic.height = SIZE;
  pic.getContext('2d')?.drawImage(from, 0, 0, SIZE, SIZE);
  return pic;
}

/** `id`'s picture, as it's made behind the lobby (or at once if it is); null where none can be made. */
export function portrait(id: Who): Promise<HTMLCanvasElement | null> {
  const have = made.get(id);
  if (have || failed) return Promise.resolve(have ?? null);
  startPortraits();
  return new Promise((done) => waiting.set(id, [...(waiting.get(id) ?? []), done]));
}

/** `id`'s picture made before the others (a page showing it opened), the build behind the lobby moved to the front. */
export function hurryPortrait(id: Who): void {
  if (!made.has(id)) own = id;
  const at = pending.indexOf(id);
  if (at > 0) { pending.splice(at, 1); pending.unshift(id); }
  buildFirst(JOB);
}

/** the page's own picture while it's being made: no other picture's compile is started until it's drawn (started
 *  beside it, theirs ran on the card ahead of its draw, and the Twins' pages showed theirs 200 to 330 ms after
 *  their compiles, `lab guide`) */
let own: Who | null = null;

/** `id`'s picture tried again, first, after a try came back empty (a talk's card waits on with a spinner). */
export function retryPortrait(id: Who): void {
  if (made.has(id)) return;
  failed = false;
  started = true;
  if (!pending.includes(id)) pending.unshift(id);
  requeue();
  hurryPortrait(id);
}

/** A harness's: `id`'s picture forgotten, to be made again as if it never had been (`lab talk`). */
export function forgetPortrait(id: Who): void {
  made.delete(id);
  portraitTimes.delete(id);
  started = true;
  if (!pending.includes(id)) pending.unshift(id);
  requeue();
}

/** The pictures made while the guide is open, ahead of everything built behind the lobby and whatever holds it
 *  (called each frame it's open, from main.ts): the player is looking at them. */
export function stepPortraits(): void {
  if (portraitPlant.notWhileOpen) return;
  startPortraits();
  buildOnly(JOB, WHILE_OPEN);
}

/** `ids`' pictures made before the others (the entries the guide's list shows), in their order. */
export function hurryPortraits(ids: Who[]): void {
  const first = ids.filter((id) => pending.includes(id));
  if (!first.length) return;
  pending = [...first, ...pending.filter((id) => !first.includes(id))];
  buildFirst(JOB);
}

/** A harness's: every picture forgotten, to be made again as on a first visit (`lab guide`). */
export function forgetPortraits(): void {
  // (the guide's alone: the scholar's, first in the queue, made long before any guide is opened in play, was made
  // again ahead of the guide's and held its pictures back, a page's own 284 ms after its opening)
  for (const id of guides()) made.delete(id);
  portraitTimes.clear();
  pending = [...(made.has('scholar') ? [] : ['scholar' as Who]), ...guides()];
  started = true;
  requeue();
}

/** The pictures queued to be made behind the lobby before the guide is opened, where the level makes them there
 *  (`portraitsBehind`): called each frame the lobby shows. */
export function queuePortraitsBehind(): void {
  if (QUALITY[qualityLevel()].portraitsBehind) startPortraits();
}

/** The pictures queued to be made (once; those the browser kept are read first). */
export function startPortraits(): void {
  if (started || failed) return;
  started = true;
  void kept().then(() => {
    pending = everyone().filter((id) => !made.has(id));
    if (pending.length && !queued(JOB)) buildLater(JOB, steps(), () => undefined);
  });
}

/** A picture made: kept, and given to whoever waits for it. */
function settle(id: Who, pic: HTMLCanvasElement | null): void {
  if (pic) made.set(id, pic);
  for (const done of waiting.get(id) ?? []) done(pic);
  waiting.delete(id);
}

/** A picture being made: its model staged, its textures still to send, and whether the browser has compiled it
 *  (waited on out of the queue: the build queued again as it's done). */
interface Making {
  id: Who;
  root: THREE.Object3D;
  /** its meshes shown, their buffers still to send (a batch a piece: `BUFFERS_A_PIECE`) */
  meshes: THREE.Mesh[];
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  textures: THREE.Texture[];
  /** each of its materials' maps and the small copy it's drawn with here */
  swaps: Swap[];
  compiled: boolean;
}
/** the pictures being made, their compiles running side by side: one at a time, each waited for in turn, every
 *  picture was drawn 24 s after the guide opened (`lab guide`, the lab's browser at below normal priority, where a
 *  compile took up to 12 s); 4 at a time, 8 to 10; 6, the page's own waited behind the others' compiles */
let making: Making[] = [];
/** the picture drawn, waiting for the card to have drawn it before it's copied (nothing else drawn meanwhile: the
 *  renderer's canvas holds it) */
let copying: { m: Making; sync: WebGLSync | null } | null = null;
/** how many are made side by side (a page's own picture is started whatever the count) */
const SIDE_BY_SIDE = 4;

/** The build queued again behind the lobby (what the browser was doing for it is done). */
function requeue(): void {
  if (!queued(JOB) && (pending.length || making.length || copying)) buildLater(JOB, steps(), () => undefined);
}

/** `m` done with, its picture (or none) given to whoever waits for it. */
function finished(m: Making, pic: HTMLCanvasElement | null): void {
  making = making.filter((x) => x !== m);
  if (own === m.id) own = null;
  pending = pending.filter((who) => who !== m.id);
  try { m.scene.remove(m.root); disposeGeometries(m.root); } catch { /* let go as it is */ }
  settle(m.id, pic);
}

/** The pictures made, a piece at a time: the renderer, each model (a hero's in his build's own pieces), its staging,
 *  its compile asked for, its textures sent a piece each, and its draw, copied into its own canvas. Up to
 *  `SIDE_BY_SIDE` are made at once, their compiles running side by side, the first wanted (`pending`'s order) started
 *  and drawn first. While the browser compiles them and nothing else is left to do, the build leaves the queue
 *  (nothing behind the lobby waits on it) and comes back as one is done. The renderer is let go after the last. */
function* steps(): Generator<void, void, undefined> {
  for (;;) {
    pending = pending.filter((id) => !made.has(id) || making.some((m) => m.id === id));
    if (!pending.length && !making.length && !copying) break;
    // (one compiled, the first wanted: drawn)
    const order = (m: Making): number => { const i = pending.indexOf(m.id); return i < 0 ? 1e9 : i; };
    // (one drawn, copied once the card has drawn it: copied at once, the page's paint waited 135 to 214 ms for the
    // card's first draw with a program just compiled, behind the other pictures' compiles)
    if (copying) {
      const c = copying, r = renderer!;
      const gl = r.getContext() as WebGL2RenderingContext;
      if (!c.sync || gl.getSyncParameter(c.sync, gl.SYNC_STATUS) === gl.SIGNALED) {
        copying = null;
        try {
          if (c.sync) gl.deleteSync(c.sync);
          const pic = piece(`${c.m.id}: copied`, () => copied(r.domElement));
          const times = portraitTimes.get(c.m.id);
          if (times) times.onCard = times.drawn = perfClock.now();
          // (kept for a later visit, encoded off the page's thread: nothing waits on it)
          if (CACHE.on && !portraitPlant.allAtOnce) pic.toBlob((blob) => { if (blob) keep(c.m.id, blob); }, 'image/png');
          piece(`${c.m.id}: let go`, () => finished(c.m, pic));
        } catch (err) {
          console.warn(`guide: no portrait of ${c.m.id}`, err);
          finished(c.m, null);
        }
        yield;
        continue;
      }
    }
    // (its meshes' buffers sent a batch a piece once it's compiled, each batch drawn alone: sent by its draw, the
    // scholar's held it 72 ms)
    const buffering = copying ? undefined : making.filter((m) => m.compiled && !m.textures.length && m.meshes.length).sort((x, y) => order(x) - order(y))[0];
    if (buffering) {
      const batch = takeBatch(buffering.meshes);
      piece(`${buffering.id}: buffers sent`, () => drawnAlone(renderer!, buffering, batch));
      yield;
      continue;
    }
    const ready = copying ? undefined : making.filter((m) => m.compiled && !m.textures.length && !m.meshes.length).sort((x, y) => order(x) - order(y))[0];
    if (ready) {
      const r = renderer!;
      try {
        if (portraitPlant.allAtOnce) {
          // (the canary: drawn and encoded at once, as they were)
          piece(`${ready.id}: drawn and encoded at once`, () => { r.render(ready.scene, ready.camera); r.domElement.toDataURL('image/png'); });
          copying = { m: ready, sync: null };
        } else {
          piece(`${ready.id}: drawn`, () => {
            withSmall(ready.swaps, () => r.render(ready.scene, ready.camera));
            const gl = r.getContext() as WebGL2RenderingContext;
            copying = { m: ready, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) };
            gl.flush();
            const times = portraitTimes.get(ready.id);
            if (times) times.sent = perfClock.now();
          });
        }
      } catch (err) {
        console.warn(`guide: no portrait of ${ready.id}`, err);
        copying = null;
        finished(ready, null);
      }
      if (!portraitPlant.allAtOnce) yield;
      continue;
    }
    // (the next wanted not started yet: the first wanted's (a page's own) started now, and its textures sent, before
    // another is started; another started if there's room)
    const sending = making.filter((m) => m.textures.length).sort((x, y) => order(x) - order(y))[0];
    const next = pending.find((id) => !made.has(id) && !making.some((m) => m.id === id));
    const firstWaits = sending && order(sending) === 0;
    const ownMaking = making.some((m) => m.id === own);
    if (next && (next === pending[0] || (making.length < SIDE_BY_SIDE && !firstWaits && !ownMaking))) {
      try {
        if (portraitPlant.failNext === next) { portraitPlant.failNext = null; throw new Error('a planted failure'); }
        if (!renderer) { renderer = piece('the renderer made', makeRenderer); yield; }
        let root: THREE.Object3D, scene: THREE.Scene, camera: THREE.PerspectiveCamera;
        if (next === 'scholar') {
          ({ root, scene, camera } = piece(`${next}: built and staged`, scholarStaged));
        } else {
          const model: Model = yield* timedSteps(`${next}: its model built`, modelOf(next));
          yield;
          root = model.root;
          // (a frame each, its staging, its small textures and its compile asked for: in one, the mage's were 31 ms of
          // a frame behind the lobby, past `lab behind`'s 30)
          ({ scene, camera } = piece(`${next}: staged and framed`, () => staged(model)));
        }
        yield;
        const swaps = piece(`${next}: its textures made small`, () => smallTextures(root));
        yield;
        const m: Making = { id: next, root, meshes: meshesOf(root), scene, camera, textures: [...new Set(swaps.map((w) => w.small))], swaps, compiled: false };
        making.push(m);
        if (portraitPlant.allAtOnce) {
          // (the canary's: compiled as it's drawn, its textures and buffers sent then too)
          m.compiled = true;
          m.textures = [];
          m.meshes = [];
        } else {
          const r = renderer;
          const asked = perfClock.now();
          const compiled = (): void => {
            m.compiled = true;
            portraitTimes.set(next, { compiled: perfClock.now(), sent: Infinity, onCard: Infinity, drawn: Infinity });
            portraitPieces.push({ what: `${next}: its compile waited for (the browser's, not the page's)`, at: asked, ms: perfClock.now() - asked, waited: true });
            requeue();
          };
          // (its commands sent at once, so the browser can start on it while this context waits)
          piece(`${next}: its compile asked for`, () => { void r.compileAsync(scene, camera).then(compiled, compiled); r.getContext().flush(); });
        }
      } catch (err) {
        console.warn(`guide: no portrait of ${next}`, err);
        if (!renderer) { failed = true; for (const who of pending) settle(who, null); pending = []; making = []; return; }
        pending = pending.filter((who) => who !== next);
        settle(next, null);
      }
      yield;
      continue;
    }
    // (a texture sent to the card, the first wanted's first, while they compile: sent by its first draw, a hero's held
    // it 33 to 81 ms)
    if (sending) {
      const texture = sending.textures.shift()!;
      const img = texture.image as { width?: number; height?: number; data?: unknown } | null;
      piece(`${sending.id}: a texture sent (${img?.width ?? '?'}x${img?.height ?? '?'}${img?.data ? ', data' : ''})`, () => renderer!.initTexture(texture));
      yield;
      continue;
    }
    // (a picture drawn waits for the card: looked at again next frame)
    if (copying) { yield; continue; }
    // (nothing to do till the browser has compiled one: queued again then)
    return;
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
  // (no shader's log read back as it's first used: a read waits on the browser's work, other pictures' compiles)
  r.debug.checkShaderErrors = false;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  return r;
}

/** Whose model built: a foe's in one piece, or a hero's in his build's own pieces, holding his class's starting gear. */
function* modelOf(id: Who): Generator<void, Model, undefined> {
  if (!id.startsWith('hero:')) {
    // (a boss's code is loaded at its wave: loaded here first, its picture a frame or more later)
    let here = foeLoaded(id as EnemyId);
    if (!here) void loadFoe(id as EnemyId).then(() => { here = true; });
    while (!here) yield;
    return buildModel(ENEMIES[id as EnemyId].model);
  }
  const cls = CLASSES[id.slice('hero:'.length)];
  const model = yield* modelSteps(cls.model);
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) equipped[g.slot] = makeItem({ slot: g.slot, rarity: g.rarity, ilvl: g.ilvl, cls });
  model.setGear?.(gearOf(cls, equipped));
  return model;
}

/** A material's map, and the small copy a picture is drawn with in its place. */
interface Swap { material: THREE.Material; key: string; small: THREE.Texture }

/** the most a picture's texture is across (px): the picture is 320 px, its model a part of it */
const SMALL = 256;
/** each texture's small copy, made once (the game's textures are shared by every model of a kind) */
const smallOf = new WeakMap<THREE.Texture, THREE.Texture>();

/** `t` drawn small, or `t` itself where it's small already or not a picture the page can draw (a data texture). */
function small(t: THREE.Texture): THREE.Texture {
  const have = smallOf.get(t);
  if (have) return have;
  const img = t.image as { width?: number; height?: number } | null;
  const drawable = typeof HTMLCanvasElement !== 'undefined' && (img instanceof HTMLCanvasElement
    || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)
    || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) || img instanceof HTMLImageElement);
  let made = t;
  if (drawable && img?.width && img.height && Math.max(img.width, img.height) > SMALL) {
    const k = SMALL / Math.max(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d')?.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
    made = t.clone();
    made.source = new THREE.Source(c);
    made.needsUpdate = true;
  }
  smallOf.set(t, made);
  return made;
}

/** Every map of what's shown of `root`, each with its small copy (made here, once for each texture). The game's
 *  textures are canvases as large as 2048 px, shared by its own renderer: the guide's context read each back to send it
 *  (the Voidling's first, 338 ms in one frame), where a picture shows them a few dozen pixels across. */
function smallTextures(root: THREE.Object3D): Swap[] {
  const swaps: Swap[] = [];
  const seen = new Set<THREE.Material>();
  root.traverseVisible((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const [key, v] of Object.entries(m)) {
        if ((v as THREE.Texture | null)?.isTexture) swaps.push({ material: m, key, small: small(v as THREE.Texture) });
      }
    }
  });
  return swaps;
}

/** `draw` done with every map swapped for its small copy, and each put back after (the materials are the game's own:
 *  they're never left changed between its frames). */
function withSmall(swaps: Swap[], draw: () => void): void {
  const kept = swaps.map((w) => (w.material as unknown as Record<string, unknown>)[w.key]);
  for (const w of swaps) (w.material as unknown as Record<string, unknown>)[w.key] = w.small;
  try { draw(); } finally {
    swaps.forEach((w, i) => { (w.material as unknown as Record<string, unknown>)[w.key] = kept[i]; });
  }
}

/** how many vertices' buffers a piece sends (each batch drawn alone, `drawnAlone`) */
const BUFFERS_A_PIECE = 12000;

/** Every mesh shown of `root`. */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh); });
  return found;
}

/** The next meshes from `left`, up to `BUFFERS_A_PIECE` vertices (one at least). */
function takeBatch(left: THREE.Mesh[]): THREE.Mesh[] {
  const batch: THREE.Mesh[] = [];
  let vertices = 0;
  while (left.length && (!batch.length || vertices + left[0].geometry.attributes.position.count <= BUFFERS_A_PIECE)) {
    const mesh = left.shift()!;
    vertices += mesh.geometry.attributes.position.count;
    batch.push(mesh);
  }
  return batch;
}

/** `m`'s scene drawn with only `batch` of its meshes shown, under its small textures, so their buffers are sent; the
 *  rest shown again after. */
function drawnAlone(r: THREE.WebGLRenderer, m: Making, batch: THREE.Mesh[]): void {
  const hidden: THREE.Mesh[] = [];
  const keep = new Set(batch);
  m.root.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh && !keep.has(o as THREE.Mesh)) hidden.push(o as THREE.Mesh); });
  for (const mesh of hidden) mesh.visible = false;
  try { withSmall(m.swaps, () => r.render(m.scene, m.camera)); } finally { for (const mesh of hidden) mesh.visible = true; }
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

/** The scholar's portrait: where the one he talks to stands (his frame: ahead of him), how far the camera is from
 *  his face (m) and how far round from that man (rad), its field of view, how far below the top of his cap it aims
 *  (m: his face, beard and shoulders in the frame's 0.5 m), how much higher than that the camera stands (m), and how
 *  long he's posed for his look up to settle (s, in steps). Aimed at his head's joint, at his neck, the oval held his
 *  chest and cut his head off. */
const SCHOLAR_SHOT = { talker: new THREE.Vector3(0.15, 0, 1.5), distance: 0.95, round: 0.28, fov: 30, below: 0.2, above: 0.06, settle: 3, step: 0.05 };

/** The dim library behind him: a warm glow up to his left (his candle's side), the shelves' rows dark across it. */
function libraryBackdrop(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(40, 36, 4, 56, 56, 110);
  glow.addColorStop(0, '#6a4220');
  glow.addColorStop(0.45, '#2a180c');
  glow.addColorStop(1, '#0c0806');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  // (the shelves: their boards, and the books' spines between them, faint)
  for (const y of [30, 62, 94]) {
    g.fillStyle = 'rgba(0, 0, 0, .45)';
    g.fillRect(0, y, 128, 3);
    for (let x = 0; x < 128; x += 5 + ((x * 7) % 4)) {
      g.fillStyle = `rgba(${90 + ((x * 13) % 60)}, ${40 + ((x * 7) % 30)}, 20, .16)`;
      g.fillRect(x, y - 22 + ((x * 3) % 5), 3 + ((x * 5) % 3), 22 - ((x * 3) % 5));
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Another of Brother Hollis, built on the library's book, posed looking up at the one he talks to, in a scene of
 *  his own: lit by a warm key from his candle's side, a cool rim from behind, a dim warm fill; a camera on his face
 *  from just round that man, his shoulders in. */
function scholarStaged(): { root: THREE.Object3D; scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const book = scholarBook();
  if (!book) throw new Error('the scholar was never seated: no book to build him on');
  const s = buildScholar(book);
  const scene = new THREE.Scene();
  scene.background = libraryBackdrop();
  scene.add(s.root);
  s.root.updateMatrixWorld(true);
  for (let t = 0; t < SCHOLAR_SHOT.settle; t += SCHOLAR_SHOT.step) s.update(SCHOLAR_SHOT.step, SCHOLAR_SHOT.talker, true, 0);
  s.root.updateMatrixWorld(true);
  scene.add(new THREE.HemisphereLight(0xffd8b0, 0x1a1008, 0.55));
  const key = new THREE.DirectionalLight(0xffc890, 2.8);
  key.position.set(1.4, 2.4, 1.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.4);
  rim.position.set(-1.6, 2.2, -1.8);
  scene.add(rim);
  const cap = s.root.getObjectByName('scholar cap')!;
  const box = new THREE.Box3().setFromObject(cap);
  const top = box.getCenter(new THREE.Vector3()).setY(box.max.y);
  const toward = SCHOLAR_SHOT.talker.clone().sub(top).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), SCHOLAR_SHOT.round);
  const aim = top.clone().setY(top.y - SCHOLAR_SHOT.below);
  const camera = new THREE.PerspectiveCamera(SCHOLAR_SHOT.fov, 1, 0.05, 20);
  camera.position.copy(aim).addScaledVector(toward, SCHOLAR_SHOT.distance).setY(aim.y + SCHOLAR_SHOT.above);
  camera.lookAt(aim);
  return { root: s.root, scene, camera };
}

/** Where the pictures' making stands, for a harness (`lab guide`): what's still to make, the one being made and how
 *  far the browser has come with it, and whether the build is queued behind the lobby. */
export function portraitState(): string {
  const m = making.map((x) => `${x.id} (compiled ${x.compiled}, textures left ${x.textures.length})`).join(', ') || 'none';
  return `to make: ${pending.join(', ') || 'none'}; being made: ${m}; queued: ${queued(JOB)}`;
}

/** A harness's planted fault (`lab guide --canary`): every picture forgotten and made again at once, in this task, as
 *  the guide made them before they were made behind the lobby. */
export function remakeAllNow(): void {
  made.clear();
  pending = everyone();
  started = true;
  portraitPlant.allAtOnce = true;
  // (those already in flight drawn at once too, their compiles not waited for)
  for (const m of making) { m.compiled = true; m.textures = []; }
  if (copying) copying.sync = null;
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

/** The pictures this build kept on an earlier visit, each drawn into its canvas; another build's let go. */
async function kept(): Promise<void> {
  if (!CACHE.on) return;
  const db = await openStore();
  if (!db) return;
  const found: [Who, Blob][] = [];
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
        if (key.startsWith(prefix) && cursor.value instanceof Blob) found.push([key.slice(prefix.length) as Who, cursor.value]);
        else cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
  db.close();
  // (decoded off the page's thread)
  await Promise.all(found.map(async ([id, blob]) => {
    try { settle(id, copied(await createImageBitmap(blob))); } catch { /* left to be made again */ }
  }));
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
