// The warm-ups and the count of what was compiled late. The engine draws the game and compiles its pipelines
// aside (`engine/pipelinesAside.ts`): a warm-up hands it what a part would draw and waits for them, before the
// first frame that shows it. (three's own programs were pinned and listed here while three drew the scene.)
import { AHEAD, LATE_PIPELINES, PIPELINES, pipelinesReady } from '../engine/pipelinesAside';
import * as THREE from 'three';

let loaded = false;
/** The engine's pipelines first asked for in play, each described, for the perf report: the engine draws the game,
 *  and three's renderer, its host alone, compiles no program (`engine/pipelinesAside.ts`). */
export const lateCompiles: string[] = LATE_PIPELINES;

/** Programs that failed to link on this device, each with the driver's word on it: WebGL's, so none now. */
export const shaderErrors: string[] = [];

/** whether the warm-up behind the lobby is on (game/warmup.ts warmTheRest): its programs are the boot's */
let behind = false;
export function behindTheLobby(on: boolean): void {
  behind = on;
  PIPELINES.behind = on;
}

/** Call once loading is done; later compiles are counted as in-game hitches. */
export function markLoaded(): void { loaded = true; }
/** The engine's pipelines first asked for in play, once the loading screens were done with (each a thing left out
 *  of frames while it compiles, the GPU's process busy with it). */
export const programsCompiledInGame = (): number => PIPELINES.late;

/** a step of a warm-up waited for: the next task, or behind the lobby the frame after the next (`WarmUp.step`) */
type Step = () => Promise<void>;

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
  also?: () => Set<THREE.Material>;
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

/** What a warm-up shows in place of what (`WarmUp.swap`). `alone`, put on as it's drawn and returning its undoing,
 *  leaves it the casting lights it will have when shown: every lit program is made for two, and more in the draw made
 *  them all afresh inside it. */
export interface Swap { show: THREE.Object3D; hide: THREE.Object3D; alone?: () => () => void }

/** What a warm-up took (ms): its compile and its draw (each one task, the compile with `step` in slices of a few ms,
 *  `compileStepMs` its longest), its wait for the maps it draws with (`WarmUp.before`) and their uploads, and the wait
 *  for its programs' links (the GPU's process's work: long where no program came from a cache, a first visit's); and
 *  whether it was given up on as cold (`WarmUp.giveUpMs`: nothing drawn). */
export interface WarmedUp {
  compileMs: number; compileStepMs: number; mapsMs: number; uploadsMs: number; linksMs: number; drawMs: number;
  cold: boolean;
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
