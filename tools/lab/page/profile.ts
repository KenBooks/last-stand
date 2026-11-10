// `lab profile`: the game's own profiler (src/perf/profiler.ts, the pause menu's Profile this spot) run where the hero
// stands, as a player's device runs it: each part of the frame taken out and put back in turns, each frame waited out
// on the GPU and timed by the browser's clock (the page's stands still within a lab frame). Its canary is a part of
// its own, the frame drawn twice, which must read at least `CANARY_LEAST` times the frame once. Its result is sent
// as the Performance tab's Send sends it, to a traces service of the lab's own (`send`), and read back there.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { QualityLevel } from '../../../src/data/quality';
import type { ViewMode } from '../../../src/core/renderer';
import * as quality from '../../../src/core/quality';
import { G } from '../../../src/state';
import {
  CANARY_PART, PROFILE_TURNS, ProfileCancelled, profile, profileLines, type ProfileOptions,
} from '../../../src/perf/profiler';
import { standIn } from './light';
import { WEBGPU } from '../../../src/core/webgpu';
import { recorder, type Slow } from '../../../src/perf/recorder';
import { packTrace, sendTrace } from '../../../src/perf/upload';

export interface ProfileCommand {
  biome: BiomeId;
  view: ViewMode;
  /** where the hero stands (x, z; the set-up's spot off the dais when not given) */
  at?: [number, number];
  /** the quality level put to use first (as the page has it when not given) */
  level?: QualityLevel;
  /** the rounds of turns a part (the game's own when not given) */
  rounds?: number;
  canary: boolean;
  /** the traces service its result is sent to (the lab's own: node/tracesService.mjs), none to send nothing */
  send?: string;
}

/** the frame drawn twice must read at least this many times once */
const CANARY_LEAST = 1.6;

/** The canary's problems: its part must have read the frame drawn twice as about twice once. */
function canaryProblems(found: Awaited<ReturnType<typeof profile>>): string[] {
  const twice = found.parts.find((part) => part.name === CANARY_PART);
  if (!twice || !(twice.off > 0)) return ['canary: the frame drawn twice was never timed'];
  const read = twice.on / twice.off;
  if (read < CANARY_LEAST) return [`canary: the frame drawn twice read ${read.toFixed(2)} times once`];
  return [];
}

/** the most programs a profile may compile (the plain colour's: one for each kind of mesh it's drawn over) */
const COMPILED_MOST = 8;
/** on WebGPU, the most pipelines it may make: the plain colour's, one for each material's own vertex nodes and each
 *  vertex layout it's drawn over (12 to 16 in the forest), each once (`holdPipelines`: three made them again at
 *  every turn, letting them go as the part was put back) */
const PIPELINES_MOST = 24;

/** the page's part the lab gives the profiler: work done in each frame while it's shown, which the frame's interval
 *  as the browser shows it must see (`ProfileOptions.pageParts`: the game's are its panels and the pause menu) */
const PAGE_CANARY = { name: 'canary: 30 ms of work a frame', work: 30, least: 20 };

/** The page's canary part and the work it does each frame it's shown. */
function pageCanary(clock: () => number): Pick<ProfileOptions, 'pageParts' | 'eachPageFrame'> {
  let working = false;
  const part = {
    name: PAGE_CANARY.name,
    change: (on: boolean) => {
      working = on;
    },
  };
  const work = () => {
    if (!working) return;
    const end = clock() + PAGE_CANARY.work;
    while (clock() < end) {
      // (the frame's own work, as a panel's painting would be)
    }
  };
  return { pageParts: [part], eachPageFrame: work };
}

/** The page canary's problems: the frame's interval as shown must have read its work. */
function pageCanaryProblems(found: Awaited<ReturnType<typeof profile>>): string[] {
  const part = found.shown?.parts.find((cost) => cost.name === PAGE_CANARY.name);
  if (!part) return ['page canary: the page\'s parts were never timed'];
  const read = part.on - part.off;
  if (read >= PAGE_CANARY.least) return [];
  return [`page canary: ${PAGE_CANARY.work} ms of work a frame read ${read.toFixed(1)} ms`];
}

/** the frames a cancelled profile draws before it's cancelled */
const CANCEL_AFTER = 20;

/** What the parts change, as text: the pixel ratio, the objects shown, those casting shadows, the lights' reach. */
function sceneState(): string {
  let shown = 0;
  let casting = 0;
  let reach = 0;
  G.scene.traverse((object) => {
    if (object.visible) shown += 1;
    if (object.castShadow) casting += 1;
    if (object instanceof THREE.PointLight) reach += object.distance;
  });
  return `pixel ratio ${G.renderer.getPixelRatio()}, ${shown} shown, ${casting} casting, reach ${reach.toFixed(3)}`;
}

/** A profile cancelled after a few frames: it must stop, every part put back and the game's frames let go. */
async function cancelProblems(lab: Lab): Promise<string[]> {
  const before = sceneState();
  const clock = window.__labClock;
  let frames = 0;
  const cancelled = () => frames >= CANCEL_AFTER;
  const counted = () => {
    frames += 1;
  };
  const stopped = await profile({ cancelled, onProgress: counted, clock: clock.realNow, nextFrame: clock.realFrame })
    .then(() => false, (error: unknown) => error instanceof ProfileCancelled);
  const problems: string[] = [];
  if (!stopped) problems.push('cancel: the profile ran on to its end');
  if (frames !== CANCEL_AFTER) problems.push(`cancel: ${frames} frames drawn, not ${CANCEL_AFTER}`);
  const after = sceneState();
  if (after !== before) problems.push(`cancel: the scene was left changed (${before} before, ${after} after)`);
  const start = lab.player.pos.clone();
  const redrawn = await redrawnWithoutThreesLoop(lab, () => lab.step(30, () => ({ keys: ['w'] })));
  if (lab.player.pos.distanceTo(start) < 0.5) problems.push('cancel: the game\'s frames were left held');
  if (!redrawn) problems.push('the scene\'s picture stuck as the hero walked, three\'s own loop held (WebGPU)');
  return problems;
}

/** the screen's middle the walk is read in (css px about the window's middle) */
const MIDDLE = { width: 400, height: 300 };
/** the levels two pixels must differ by, summed over red, green and blue, to count as changed */
const CHANGED_LEVELS = 12;
/** the least share of the middle's pixels a walk must change: with the scene's picture stuck, 9% changed (the labels
 *  and the HUD over it); drawn afresh, 92 to 95% */
const WALK_CHANGES = 0.5;

/** The screen's middle as the browser shows it, its pixels (the canvas and the page's UI over it). */
async function middleShown(): Promise<Uint8ClampedArray> {
  const clip = { x: (innerWidth - MIDDLE.width) / 2, y: (innerHeight - MIDDLE.height) / 2, ...MIDDLE };
  const image = new Image();
  image.src = await window.__labScreenshot!(clip);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}

/** The share of two pictures' pixels that differ by over `CHANGED_LEVELS`. */
function changedShare(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let changed = 0;
  for (let at = 0; at < before.length; at += 4) {
    const red = Math.abs(before[at] - after[at]);
    const green = Math.abs(before[at + 1] - after[at + 1]);
    const blue = Math.abs(before[at + 2] - after[at + 2]);
    if (red + green + blue > CHANGED_LEVELS) changed += 1;
  }
  return changed / (before.length / 4);
}

/** three's animation loop as `redrawnWithoutThreesLoop` holds it (`Renderer._animation`) */
interface ThreesLoop {
  setContext(context: object): void;
  getContext(): object;
  stop(): void;
  start(): void;
}

/** a context whose frames never come: three's loop asks it for its next frame and never runs again */
const NEVER = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => undefined };

/**
 * Whether the game's own frames draw the scene afresh on WebGPU with three's own animation loop held, which begins a
 * node frame at each of the browser's frames (a pass draws its scene once a node frame): `walk` run with it held, the
 * share of the screen's middle that changed. A phone's game went on with the scene's picture stuck (from play:
 * "everything stuck, but not frozen", the view moving once the profiler started), as main's does here (9% changed);
 * now each game frame begins a node frame of its own (`renderWebGPU`). True on WebGL, which has no node frames.
 */
async function redrawnWithoutThreesLoop(lab: Lab, walk: () => Promise<unknown>, canary = false): Promise<boolean> {
  if (!WEBGPU) {
    await walk();
    return true;
  }
  const renderer = G.renderer as unknown as { _animation: ThreesLoop; _nodes: { nodeFrame: NodeFrame } };
  const loop = renderer._animation;
  const nodeFrame = renderer._nodes.nodeFrame;
  const context = loop.getContext();
  loop.setContext(NEVER);
  // (the canary: no node frame begun at all, the game's own neither, as main drew with three's loop held)
  if (canary) nodeFrame.update = () => undefined;
  try {
    // (its frame asked before it was held comes once more, and asks the context that never answers)
    await lab.step(2);
    const before = await middleShown();
    await walk();
    return changedShare(before, await middleShown()) >= WALK_CHANGES;
  } finally {
    delete (nodeFrame as Partial<NodeFrame>).update;
    loop.stop();
    loop.setContext(context);
    loop.start();
  }
}

/** three's node frame as the canary holds it */
interface NodeFrame {
  update(): void;
}

/** The redraw's canary (`--canary`): with no node frame begun, the walk must read the scene's picture stuck. */
async function redrawCanaryProblems(lab: Lab): Promise<string[]> {
  if (!WEBGPU) return [];
  const redrawn = await redrawnWithoutThreesLoop(lab, () => lab.step(30, () => ({ keys: ['s'] })), true);
  return redrawn ? ['canary: the scene\'s picture held with no node frame begun went unseen'] : [];
}

/** `lines` sent to the traces service at `base` as the Performance tab's Send sends a profile (`sendProfile` in
 *  src/perf/consent.ts, which sends to the game's own service: this module runs on an A/B's other commit too, whose
 *  `sendProfile` takes no service of the lab's), and the line the lab finds its code by. */
async function sentProfile(lines: string[], base: string): Promise<Report> {
  const slow: Slow = {
    scene: 'profile', verdict: null, tookMs: 0, at: performance.now(), snapshot: recorder.snapshot(), profile: lines,
  };
  const sent = await sendTrace(await packTrace(slow), base);
  if ('code' in sent) return { text: `  sent to the traces service: ${sent.code}`, problems: [] };
  return { text: '', problems: [`the profile couldn't be sent: ${sent.error}`] };
}

/** `lab profile`, one place: the frame's parts timed as the pause menu's profiler times them. */
export async function profileHere(lab: Lab, command: ProfileCommand): Promise<Report> {
  const level = quality.qualityLevel();
  const budget = quality.qualityBudget();
  if (command.level) quality.useQuality(command.level);
  await standIn(lab, { biome: command.biome, view: command.view, facing: 0, at: command.at, fresh: true });
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    const turns = command.rounds ? { ...PROFILE_TURNS, rounds: command.rounds } : PROFILE_TURNS;
    const clock = window.__labClock;
    const page = pageCanary(clock.realNow);
    const options = { turns, canary: command.canary, clock: clock.realNow, nextFrame: clock.realFrame, ...page };
    const found = await profile(options);
    const problems = command.canary ? canaryProblems(found) : [];
    if (!(found.frame > 0)) problems.push('the frame read 0 ms: nothing was timed');
    problems.push(...pageCanaryProblems(found));
    // (a commit from before WebGPU was profiled names no renderer: an A/B runs this module there too)
    const onWebGPU = (found.renderer ?? 'WebGL').startsWith('WebGPU');
    const most = onWebGPU ? PIPELINES_MOST : COMPILED_MOST;
    if (found.compiled > most) {
      const what = onWebGPU ? 'pipelines made' : 'programs compiled';
      problems.push(`${found.compiled} ${what}: a part changes the scene's programs (most ${most})`);
    }
    problems.push(...await cancelProblems(lab));
    if (command.canary) problems.push(...await redrawCanaryProblems(lab));
    const name = `${command.biome} ${command.view}, ${quality.qualityLevel()}`;
    const lines = profileLines(found);
    const text = [name, ...lines.map((line) => `  ${line}`)];
    if (command.send) {
      const sent = await sentProfile(lines, command.send);
      text.push(sent.text);
      problems.push(...sent.problems);
    }
    return { text: text.join('\n'), problems };
  } finally {
    lab.drawing = drawing;
    if (command.level) quality.useQuality(level, budget);
  }
}
