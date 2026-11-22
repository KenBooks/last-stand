// Shader program lifetime. three.js deletes a compiled program as soon as the last
// material using it is disposed. Spell and enemy materials are short-lived, so every
// cast or wave recompiled its shaders: a 10-30 ms hitch, worse on ANGLE / Metal.
// The set of distinct programs is small and bounded, so we keep all of them for the
// whole session, and compile the known ones up front (warmUp) before the first frame.
import { AHEAD, pipelinesReady } from '../engine/pipelinesAside';
import * as THREE from 'three';
import { G } from '../state';
import { CROWD_LAYER } from './layers';
import { drawnInShadowsOnly } from '../world/culling';
import { perfClock } from './perfClock';

const pinned = new WeakSet<object>();
const known: { name: string; key: string[] }[] = [];
let compiled = 0, loaded = false;
/** Programs compiled after loading, described for the perf report (what differs from the nearest known one). */
export const lateCompiles: string[] = [];

/** Programs that failed to link on this device, each with the driver's word on it: WebGL's, so none now. */
export const shaderErrors: string[] = [];

/** For a performance report as it's put together: nothing now (it asked each WebGL program whether it linked). */
export function auditPrograms(_renderer: THREE.WebGLRenderer, _mostMs: number): void {}

/** Take one extra reference on every program not seen yet, so it is never released. */
export function pinPrograms(renderer: THREE.WebGLRenderer, context?: () => string): void {
  for (const p of renderer.info.programs ?? []) {
    if (pinned.has(p)) continue;
    pinned.add(p);
    p.usedTimes++;
    compiled++;
    const key = p.cacheKey.split(',');
    // (an unnamed material's program by its kind: three's shader for it, `depth` a shadow caster's)
    const kind = p.name || key[0];
    // (a warm-up's after loading, the heroes' made when needed, isn't late: nothing was drawn waiting for it)
    if (loaded && behind) atLoad++;
    else if (loaded) lateCompiles.push(`${ownerOf(renderer, p)} (${kind}) ${context?.() ?? ''} | ${describeNew(p.name, key)}`);
    known.push({ name: p.name, key });
  }
}

/** Which scene object renders with program `p` (for the report): material type and object path. */
function ownerOf(renderer: THREE.WebGLRenderer, p: THREE.WebGLProgram): string {
  // (a shadow pass's material is three's own, on no object: the ledger, in dev builds, saw what it was drawing)
  const drawn = programsMade.find((entry) => entry.program === p);
  let found = drawn && drawn.owner !== '?' ? `drawing ${drawn.owner}` : 'unknown owner (shadow / post pass?)';
  G.scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      if ((renderer.properties.get(m) as { currentProgram?: unknown }).currentProgram !== p) continue;
      const path: string[] = [];
      for (let a: THREE.Object3D | null = o; a && a !== G.scene; a = a.parent) path.unshift(a.name || a.type);
      found = `${m.type}${m.name ? ` "${m.name}"` : ''} on ${path.join(' > ')}`;
    }
  });
  return found;
}

/** A program as three made it, for the lab (`lab programs`): the loading step showing as it was made, whether
 *  `compile()` made it (the warm-ups' compile) or a draw, the material's type and what it was made for (its
 *  material and object, as `ownerOf` says it; three names a program after its material's name alone), the draws
 *  that used it since, and what uses it: the scene's top-level object (by name, else type) of each object compiled
 *  or drawn with it, so a program the foes alone use is told from one the lobby shares. Its shaders' GLSL as three
 *  gave it, which three's own program drops once linked (what `lab programs --cost` compiles again). */
export interface ProgramMade {
  program: THREE.WebGLProgram; step: string; byCompile: boolean; type: string; owner: string; draws: number;
  users: Set<string>; vertex: string; fragment: string;
}
/** Every program three's WebGL renderer made, for the lab: none now (nothing records them). */
export const programsMade: ProgramMade[] = [];

/** whether the warm-up behind the lobby is on (game/warmup.ts warmTheRest): its programs are the boot's */
let behind = false;
export function behindTheLobby(on: boolean): void { behind = on; }

/** Field-level diff against the closest known program of the same kind. */
function describeNew(name: string, key: string[]): string {
  let best: string[] | null = null, bestD = Infinity;
  for (const k of known) {
    if (k.name !== name || k.key.length !== key.length) continue;
    let d = 0;
    for (let i = 0; i < key.length; i++) if (key[i] !== k.key[i]) d++;
    if (d < bestD) { bestD = d; best = k.key; }
  }
  if (!best) return `no similar program; key starts ${key.slice(0, 3).join(',').slice(0, 80)}`;
  return key.map((v, i) => (v !== best![i] ? `[${i}] ${best![i].slice(0, 30)} -> ${v.slice(0, 30)}` : '')).filter(Boolean).join('; ');
}

/** Once the game is shown: nothing now (it logged every WebGL program that failed to link). */
export function checkPrograms(_renderer: THREE.WebGLRenderer): void {}

let atLoad = 0;
/** Call once loading is done; later compiles are counted as in-game hitches. */
export function markLoaded(): void { atLoad = compiled; loaded = true; }
/** Shader programs compiled since loading finished (each one was a frame hitch). */
export const programsCompiledInGame = (): number => compiled - atLoad;

/** What `compile` gives back: the materials of the scene it made programs for. */
type Compiled = Set<THREE.Material>;
/**
 * `compile` run with what no pass draws with its own material left out (put back after, where it was): the crowds'
 * bodies' own meshes, which their crowd draws (models/crowd.ts), and the casters the shadow map alone draws
 * (world/culling.ts: their shadows' programs are `compileShadows`'). three's compile makes a program for every mesh
 * of the scene whatever its layer or whether it's shown (17 lit programs compiled for nothing, `lab programs`; and
 * the biomes' baked casters', one).
 */
function withoutUndrawn(root: THREE.Object3D, compile: () => Compiled): Compiled {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (undrawn(o) && o.parent) out.push(o);
  });
  return without(out, compile);
}

/** Whether no pass draws `o` with its own material (`withoutUndrawn`): a crowd's body's own mesh, or a caster the
 *  shadow map alone draws. */
const undrawn = (o: THREE.Object3D): boolean => o.layers.mask === 1 << CROWD_LAYER || drawnInShadowsOnly(o as THREE.Mesh);

/** a step of a warm-up waited for: the next task, or behind the lobby the frame after the next (`WarmUp.step`) */
type Step = () => Promise<void>;
const nextTask: Step = () => new Promise((r) => setTimeout(r));

/** How a warm-up goes (`warmUp`). */
export interface WarmUp {
  /** added to the scene for the draw alone, and taken away after (compiled with the scene where `compile` is left
   *  out): the lobby's frames mustn't draw what isn't linked yet, as three would link it there, the frame waiting */
  objects?: THREE.Object3D[];
  /** what's compiled, as the scene lights it (a part of the fight, behind the lobby: the lobby's own are warm);
   *  left out, the whole scene and `objects` */
  compile?: THREE.Object3D[];
  /** left out of it: what the lobby doesn't show (the other biomes), warmed behind it */
  leaveOut?: THREE.Object3D[];
  /** compiled with it, besides the scene's: what passes of their own draw (the outline's), its materials' links
   *  waited for with the rest */
  also?: () => Compiled;
  /** drawn alone, whatever the camera sees, on the warm-ups' layer (every light is on it too: their counts are the
   *  scene's, `lightThePasses` in renderer.ts), into a pixel of the target: the programs the draws make are the
   *  scene's, and its fragments none (a whole lobby drawn again for each part held its frames up); left out, the
   *  whole scene unculled */
  drawn?: THREE.Object3D[];
  /** shown in place of `hide` for the draw alone (a biome the lobby doesn't show, for its shadows' programs, made as
   *  they're drawn: one in place of the other, so the lights counted are as many) */
  swap?: Swap;
  /** called just before the draw: what the lobby's frames mustn't draw before its programs are linked brought in (a
   *  foe seated in its crowd, which draws it whatever the camera sees) */
  show?: () => void;
  /** `show` undone: on WebGPU what it brings in is shown for the compile's walk of the scene alone (a crowd with
   *  no foe seated draws nothing, and its pipelines were made at the draw: the fight's 2.6 s) */
  hide?: () => void;
  /** awaited before the uploads, given the textures the compiled materials draw with (their maps, still coming) */
  before?: (textures: Set<THREE.Texture>) => Promise<void>;
  /** told how much of the warm-up is done, 0 to 1 (the share each step takes is a guess: the links, most) */
  progress?: (share: number) => void;
  /** awaited between its steps (each root's compile, a slice of uploads, each program's uniforms read, the draw):
   *  behind the lobby, a frame each; left out, they run back to back, the loading screen's way */
  step?: Step;
  /** given up on, nothing drawn (`cold`), where a program isn't linked this long after its commands were done (ms):
   *  one not from the GPU's cache, behind the lobby (compiled cold behind it, a return's lobby drew 3 frames a second) */
  giveUpMs?: number;
  /** with `step`, the most programs compiled and not linked yet before its compile waits for them (`fewLinking`):
   *  left out, every program of its roots is handed to the GPU's process at once */
  linkingMost?: number;
  /** how a wait for links asks again (left out, `step`, else every 4 ms): under a loading bar a frame, as its `step`
   *  goes on in the same task for a slice */
  poll?: Step;
}

/** What a warm-up shows in place of what (`WarmUp.swap`), and on WebGPU the scene's look it's shown with (`look`:
 *  put on, returning its undoing): there a pipeline is keyed by the scene's environment and fog too, so the hall of
 *  heroes compiled in the biome's look was built again in its own at its first frames (a first visit's 6 s hold).
 *  `alone`, put on as it's drawn and returning its undoing, leaves it the casting lights it will have when shown: every
 *  lit program is made for two, and more in the draw made them all afresh inside it. */
export interface Swap { show: THREE.Object3D; hide: THREE.Object3D; look?: () => () => void; alone?: () => () => void }

/** What a warm-up took (ms): its compile and its draw (each one task, the compile with `step` in slices of a few ms,
 *  `compileStepMs` its longest), its wait for the maps it draws with (`WarmUp.before`) and their uploads, and the wait
 *  for its programs' links (the GPU's process's work: long where no program came from a cache, a first visit's); and
 *  whether it was given up on as cold (`WarmUp.giveUpMs`: nothing drawn). */
export interface WarmedUp {
  compileMs: number; compileStepMs: number; mapsMs: number; uploadsMs: number; linksMs: number; drawMs: number;
  cold: boolean;
}

/** `run` with `out` taken out of their parents' lists (put back after, where they were): nothing else sees them go. */
function without<T>(out: THREE.Object3D[], run: () => T): T {
  const places = out.filter((o) => o.parent).map((o) => ({ parent: o.parent!, at: o.parent!.children.indexOf(o), o }));
  for (const { parent, at } of [...places].sort((a, b) => b.at - a.at)) parent.children.splice(at, 1);
  try {
    return run();
  } finally {
    for (const { parent, at, o } of [...places].sort((a, b) => a.at - b.at)) parent.children.splice(at, 0, o);
  }
}

/** A mesh (or line, or points) of a scene a stepped compile makes the programs of: lit where a pass draws it with its
 *  own material, its shadows' wherever it is. */
interface ToCompile {
  object: THREE.Object3D;
  lit: boolean;
}

/** What of `root` has a material (`leaveOut` and all under it passed over), each lit unless it or what it's under
 *  is drawn by no pass with its own (`undrawn`, as `withoutUndrawn` leaves it out). */
function toCompile(root: THREE.Object3D, leaveOut: Set<THREE.Object3D>, lit = true, into: ToCompile[] = []): ToCompile[] {
  if (leaveOut.has(root)) return into;
  const drawn = lit && !undrawn(root);
  if ((root as THREE.Mesh).material) into.push({ object: root, lit: drawn });
  for (const child of root.children) toCompile(child, leaveOut, drawn, into);
  return into;
}

/** `objects` as three's compile walks what it's handed: each alone (what's under it is in the list itself), and no
 *  light counted (three counts the lights of what it's handed on top of the scene's, which are counted from the scene
 *  itself, as for a whole scene's compile). A plain object, not a three.js one: each of those draws random numbers. */
function asLot(objects: THREE.Object3D[]): THREE.Object3D {
  const lot = {
    traverse: (visit: (o: THREE.Object3D) => void): void => {
      for (const o of objects) visit(o);
    },
    traverseVisible: (): void => {},
  };
  return lot as unknown as THREE.Object3D;
}

/** the most of a stepped compile run in one task (ms, by `perfClock`), and its first lot's objects: a lot under a
 *  quarter of the slice doubles the next, one over the slice halves it. Each lot walks the whole scene for its lights
 *  (three's compile), so where the programs come from a cache (a return) lots of a fixed two dozen were 1 s more of a
 *  boot with the CPU 4 times slower; where they're compiled afresh one object may take tens of ms. */
const COMPILE_SLICE_MS = 40;
const COMPILE_FIRST_LOT = 16;

/** The next lot's size after one of `size` objects took `took` ms. */
function nextLot(size: number, took: number): number {
  if (took < COMPILE_SLICE_MS / 4) return size * 2;
  if (took > COMPILE_SLICE_MS) return Math.max(1, Math.floor(size / 2));
  return size;
}

/**
 * `scene`'s programs (`leaveOut` left out) compiled now for `target`, ahead of the warm-up that will draw them, and
 * those of `objects` (out of the scene) as the scene lights them: the GPU's threads link them meanwhile, and the
 * warm-up's compile finds them made. A few dozen of the scene's objects a lot, lit by the scene's lights alone, as the
 * whole scene's compile lit them (`asLot`), the page let go between lots once `COMPILE_SLICE_MS` has gone: compiled
 * at once, the village's and the lobby's made one task of 3.2 and 2.4 s each in a first visit's boot with the CPU 4
 * times slower (`npm run stalls -- --scenario boot --cpu-slowdown 4 --js --url "this?village=1"`), and a phone's
 * loading screen stood still as long. Each of `objects` is compiled whole, its own lights counted with the scene's.
 */
export async function compileAhead(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, leaveOut: THREE.Object3D[], objects: THREE.Object3D[] = []): Promise<void> {
  const all = toCompile(scene, new Set(leaveOut));
  let since = perfClock.now();
  /** `run` with the target and `leaveOut` out of the scene, as a compile of it was; the page let go after it once the
   *  slice has gone; the time (ms) `run` took */
  const step = async (run: () => void): Promise<number> => {
    const start = perfClock.now();
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    try {
      without(leaveOut, run);
    } finally {
      renderer.setRenderTarget(prev);
    }
    const end = perfClock.now();
    if (end - since >= COMPILE_SLICE_MS) {
      await nextTask();
      since = perfClock.now();
    }
    return end - start;
  };
  let size = COMPILE_FIRST_LOT;
  for (let i = 0; i < all.length;) {
    const lot = all.slice(i, i + size);
    i += lot.length;
    const lit = lot.filter((o) => o.lit).map((o) => o.object);
    const took = await step(() => {
      if (lit.length > 0) renderer.compile(asLot(lit), camera, scene);
    });
    size = nextLot(size, took);
  }
  for (const root of objects) {
    await step(() => {
      withoutUndrawn(root, () => renderer.compile(root, camera, scene));
    });
  }
}

/** the longest a warm-up waits for the engine's pipelines to compile (ms) */
const PIPELINES_WAIT_MOST = 15000;

/**
 * A warm-up: what it would draw (`how.drawn`, its `objects`, its swap's place) handed to the engine, whose pipelines
 * for it compile aside while the bar runs, and waited for: first met as a skill was cast, each was compiled in that
 * frame. Nothing of the scene is three's to compile or draw: the engine's own pipelines are made as it boots, and it
 * takes each mesh as it's first shown (src/engine).
 */
export async function warmUp(_renderer: THREE.WebGLRenderer, _scene: THREE.Scene, _camera: THREE.Camera, _target: THREE.WebGLRenderTarget, how: WarmUp = {}): Promise<WarmedUp> {
  AHEAD.prepare?.([...(how.drawn ?? []), ...(how.objects ?? []), ...(how.swap ? [how.swap.show] : [])]);
  await pipelinesReady(PIPELINES_WAIT_MOST);
  // (left as a warm-up leaves it: what it shows to draw, hidden again)
  how.hide?.();
  how.progress?.(1);
  await how.step?.();
  return { compileMs: 0, compileStepMs: 0, mapsMs: 0, uploadsMs: 0, linksMs: 0, drawMs: 0, cold: false };
}
