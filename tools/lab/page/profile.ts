// `lab profile`: the game's own profiler (src/perf/profiler.ts, the pause menu's Profile this spot) run where the hero
// stands, as a player's device runs it: each part of the frame taken out and put back in turns, each frame waited out
// on the GPU and timed by the browser's clock (the page's stands still within a lab frame). Its canary is a part of
// its own, the frame drawn twice, which must read at least `CANARY_LEAST` times the frame once. Its result is sent
// as the Performance tab's Send sends it, to a traces service of the lab's own (`send`), and read back there.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { QualityLevel } from '../../../src/data/quality';
import type { ViewMode } from '../../../src/core/renderer';
import * as quality from '../../../src/core/quality';
import { G } from '../../../src/state';
import {
  CANARY_PART, PROFILE_TURNS, ProfileCancelled, profile, profileLines, type Profile, type ProfileOptions,
} from '../../../src/perf/profiler';
import { standAt } from './draws';
import { recorder, type Slow } from '../../../src/perf/recorder';
import { packTrace, sendTrace } from '../../../src/perf/upload';
import { clearSpent, SINK, stickAt } from '../../../src/fx/stuckArrows';
import { groundHeight } from '../../../src/world/ground';
import { RUST } from '../../../src/engine';
import { holdFrames } from '../../../src/core/frameLoop';

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
  /** spent arrows stood in the ground round him first: what keeping them costs, its part `the spent arrows` */
  arrows?: number;
  /** in the lobby's village instead, as `draws --village` stands him there (`at` there, the square by default) */
  village: boolean;
  /** with `village`, the hour it's lit for (the page's own when not given) */
  hour?: number;
}


/** how far round the hero the planted arrows stand (m): about what the top view shows round him */
const ARROWS_REACH = 9;

/** `count` spent arrows stood in the ground round the hero, spread evenly over a disc (a sunflower's spiral), leaning
 *  as an arrow that came down from a shot does. */
function plantArrows(lab: Lab, count: number): void {
  const at = lab.player.pos;
  for (let k = 0; k < count; k++) {
    const r = ARROWS_REACH * Math.sqrt((k + 0.5) / count), a = k * 2.39996;
    const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
    const tip = new THREE.Vector3(x, groundHeight(x, z), z);
    const way = new THREE.Vector3(Math.cos(a * 3), -2, Math.sin(a * 3)).normalize();
    stickAt(tip, way, SINK.ground);
  }
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

/** the start of the lit shading's own parts' names (`src/perf/shadingParts.ts`): each changes the lit pipelines, made
 *  once by its first frame */
const SHADING_PART = 'the lit shading\'s ';

/** The programs (WebGPU's pipelines) a profile made, less those the lit shading's own parts made, as they're meant
 *  to: the frame's parts must keep the scene's. */
function compiledByFrameParts(found: Profile): number {
  const own = found.parts.filter(makesItsOwn);
  return found.compiled - own.reduce((sum, part) => sum + (part.compiled ?? 0), 0);
}

/** the engine's parts that draw with pipelines of their own, made once by their first frame and waited for before
 *  they're timed (`partPipelinesMade` in src/perf/profiler.ts): the depth drawn first taken out draws each opaque
 *  thing whole, and the grass in it draws its blades into the depth, and the engine makes each pipeline only as a
 *  place is first asked for (Bulwark c9e506c: 15 and 12 in the lab's village, over the 24 the rest may make); at Low
 *  and Very low the lit shader's part draws with the shader made for the plain levels, a pipeline of its own for
 *  each of the scene's (#824: 72 in the forest over the shoulder, which failed every profile at Very low) */
const OWN_PIPELINES = [
  'the scene\'s depth drawn first',
  'the grass left out of the depth drawn first',
  'the lit shader whole',
];

/** Whether a part's pipelines are its own, meant (the lit shading's own parts, the depth drawn first's). */
function makesItsOwn(part: Profile['parts'][number]): boolean {
  if (part.name.startsWith(SHADING_PART)) return true;
  return OWN_PIPELINES.some((name) => part.name.startsWith(name));
}

/** the page's part the lab gives the profiler: work done in each frame while it's shown, which the frame's interval
 *  as the browser shows it must see (`ProfileOptions.pageParts`: the game's are its panels and the pause menu). An
 *  interval steps by the display's refresh, so its least is half the work: on a 144 Hz screen the 30 ms read 25 to
 *  29 (6.9 ms a refresh), on the lent laptop's 60 Hz one 16.8 to 18 (33.4 against 16.6), where a least of 20 failed
 *  every run; unseen, it reads about 0 */
const PAGE_CANARY = { name: 'canary: 30 ms of work a frame', work: 30, least: 15 };

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

/** A profile cancelled after a few frames: it must stop, every part put back and the game's frames let go (the walk
 *  after it pictured where its picture stuck). */
async function cancelProblems(lab: Lab, canary: boolean): Promise<{ problems: string[]; moments: Pictured[] }> {
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
  const walk = await redrawnWithoutThreesLoop(lab, () => lab.step(30, () => ({ keys: ['w'] })));
  const share = `${Math.round(walk.changed * 100)}% of the screen's middle changed`;
  if (lab.player.pos.distanceTo(start) < 0.5) problems.push('cancel: the game\'s frames were left held');
  if (canary) problems.push(...await stuckCanaryProblems(lab));
  if (walk.changed >= WALK_CHANGES) return { problems, moments: [] };
  problems.push(`the scene's picture stuck as the hero walked, three's own loop held (WebGPU): ${share}`);
  return { problems, moments: [walkMoment(walk)] };
}

/** The stuck walk's canary: the walk with the game's frames held, as a profile that never let them go leaves them
 *  (`holdFrames`), which must read as stuck. (`lab.drawing` off holds three's draws alone: the engine drew on, and
 *  such a walk read 84% changed.) */
async function stuckCanaryProblems(lab: Lab): Promise<string[]> {
  const heldWalk = () => {
    holdFrames(true);
    return lab.step(30, () => ({ keys: ['w'] }));
  };
  try {
    const walk = await redrawnWithoutThreesLoop(lab, heldWalk);
    if (walk.changed < WALK_CHANGES) return [];
    return [`canary: a walk with the game's frames held read ${Math.round(walk.changed * 100)}% changed, not stuck`];
  } finally {
    holdFrames(false);
  }
}

/** the screen's middle the walk is read in (css px about the window's middle) */
const MIDDLE = { width: 400, height: 300 };
/** the levels two pixels must differ by, summed over red, green and blue, to count as changed */
const CHANGED_LEVELS = 12;
/** the least share of the middle's pixels a walk must change: with the scene's picture stuck, 9% changed of the
 *  screen as shown (the labels and the HUD over it); drawn afresh, 92 to 95% */
const WALK_CHANGES = 0.5;

/** The screen's middle as the browser showed it: the picture, and its pixels. */
interface Shown {
  png: string;
  pixels: Uint8ClampedArray;
}

/**
 * The screen's middle as the browser shows it (the canvas and the page's UI over it), as the player sees it. On the
 * lent 4080 laptop the engine's frame reached the screen black (the game's own warning: "the frame is black: every
 * pixel of 1920x1080, 3 checks in a row"), the HUD alone over it, its work all done (`lab rust` there read as here
 * but for its times): every profile there failed as stuck, rightly. Read from the canvas itself it was black too.
 */
async function middleShown(): Promise<Shown> {
  const clip = { x: (innerWidth - MIDDLE.width) / 2, y: (innerHeight - MIDDLE.height) / 2, ...MIDDLE };
  const png = await window.__labScreenshot!(clip);
  const image = new Image();
  image.src = png;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return { png, pixels: context.getImageData(0, 0, image.width, image.height).data };
}

/** The walk's two pictures of the screen's middle, as a moment of the report: where the picture stuck, what it
 *  showed before and after. */
function walkMoment(walk: Walked): Pictured {
  const tile = (png: string) => ({ view: 'screen' as const, png, ...MIDDLE });
  return {
    label: 'the walk with three\'s loop held: before, after',
    tiles: [tile(walk.before.png), tile(walk.after.png)],
    notes: [`${Math.round(walk.changed * 100)}% changed`],
  };
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

/** a walk's pictures of the screen's middle and the share of it that changed */
interface Walked {
  before: Shown;
  after: Shown;
  changed: number;
}

/** a context whose frames never come: three's loop asks it for its next frame and never runs again */
const NEVER = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => undefined };

/**
 * Whether the game's own frames draw the scene afresh on WebGPU with three's own animation loop held, which begins a
 * node frame at each of the browser's frames (a pass draws its scene once a node frame): `walk` run with it held, the
 * share of the screen's middle that changed. A phone's game went on with the
 * scene's picture stuck (from play: "everything stuck, but not frozen", the view moving once the profiler started),
 * as main's does here (9% changed); now each game frame begins a node frame of its own (`renderWebGPU`). After a
 * level's change the sun's shadow map resized left it stuck too, 0% changed (`apply` in core/quality.ts).
 */
async function redrawnWithoutThreesLoop(lab: Lab, walk: () => Promise<unknown>): Promise<Walked> {
  const renderer = G.renderer as unknown as { _animation: ThreesLoop };
  const loop = renderer._animation;
  const context = loop.getContext();
  loop.setContext(NEVER);
  try {
    // (its frame asked before it was held comes once more, and asks the context that never answers)
    await lab.step(2);
    const before = await middleShown();
    await walk();
    const after = await middleShown();
    return { before, after, changed: changedShare(before.pixels, after.pixels) };
  } finally {
    loop.stop();
    loop.setContext(context);
    loop.start();
  }
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

/** the most of the browser's frames an engine's profile may wait through with nothing drawn, and the least the
 *  canary's must: a GPU left idle between timed frames clocks down, and a phone's same frame read 36 ms and 10 */
const IDLE_MOST = 0.1;
const IDLE_CANARY_LEAST = 0.3;

/** The problems of a profile's idle frames on the Rust engine: too many, or, with the canary, a profile that draws
 *  nothing between its timed frames (as it did) not read as idle. */
async function idleProblems(found: Awaited<ReturnType<typeof profile>>,
  options: Parameters<typeof profile>[0] & { canary?: boolean }): Promise<string[]> {
  if (found.idle === undefined) return [];
  const problems: string[] = [];
  const share = (idle: number): string => `${(idle * 100).toFixed(0)}%`;
  if (found.idle > IDLE_MOST) problems.push(`the GPU idle in ${share(found.idle)} of the profile's frames (most ${share(IDLE_MOST)})`);
  if (!options?.canary) return problems;
  const left = await profile({ ...options, canary: false, parts: [], idleBetween: true });
  if (!((left.idle ?? 0) >= IDLE_CANARY_LEAST)) {
    problems.push(`canary: nothing drawn between timed frames read idle in ${share(left.idle ?? 0)} of them`);
  }
  return problems;
}

/** The engine's tuned numbers a profile left other than it found them (`before`), as `key a -> b`. */
function tuneLeft(before: Record<string, number>): string[] {
  const now = RUST.tune as unknown as Record<string, number>;
  const left: string[] = [];
  for (const key of Object.keys(before)) {
    if (now[key] !== before[key]) left.push(`${key} ${before[key]} -> ${now[key]}`);
  }
  return left;
}

/** The problems of the engine's tuned numbers after a profile: each must be as the game had it before (a part whose
 *  "with" is the old way, `fieldsPlaced` and `overCleared`, left the game on that way). With the canary, a part
 *  planted that leaves `overCleared` at its "with" must be caught. */
async function tuneProblems(before: Record<string, number>,
  options: Parameters<typeof profile>[0] & { canary?: boolean }): Promise<string[]> {
  const left = tuneLeft(before);
  const problems = left.length ? [`the engine's tuned numbers left changed by the profile: ${left.join(', ')}`] : [];
  if (!options.canary) return problems;
  const planted = {
    name: 'canary: a tuned number put back as its "with"',
    change: (on: boolean) => { RUST.tune.overCleared = on ? 0 : 1; },
  };
  const turns = { rounds: 1, frames: 1, settle: 0 };
  await profile({ ...options, canary: false, parts: [planted], turns, pageParts: undefined });
  if (tuneLeft(before).length === 0) problems.push('canary: a part leaving overCleared changed was not caught');
  Object.assign(RUST.tune, before);
  return problems;
}

/** `lab profile`, one place: the frame's parts timed as the pause menu's profiler times them. */
export async function profileHere(lab: Lab, command: ProfileCommand): Promise<Report> {
  const level = quality.qualityLevel();
  const budget = quality.qualityBudget();
  if (command.level) quality.useQuality(command.level);
  await standAt(lab, command);
  if (command.arrows) plantArrows(lab, command.arrows);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    const turns = command.rounds ? { ...PROFILE_TURNS, rounds: command.rounds } : PROFILE_TURNS;
    const clock = window.__labClock;
    const page = pageCanary(clock.realNow);
    const options = { turns, canary: command.canary, clock: clock.realNow, nextFrame: clock.realFrame, ...page };
    const tuned = { ...RUST.tune } as unknown as Record<string, number>;
    const found = await profile(options);
    const problems = command.canary ? canaryProblems(found) : [];
    problems.push(...await tuneProblems(tuned, options));
    if (!(found.frame > 0)) problems.push('the frame read 0 ms: nothing was timed');
    problems.push(...(await idleProblems(found, options)));
    problems.push(...pageCanaryProblems(found));
    // (a commit from before WebGPU was profiled names no renderer: an A/B runs this module there too)
    // (the Rust engine's are WebGPU's pipelines too: a part that draws its fields into the depth first makes theirs)
    const onWebGPU = /^WebGPU|Rust engine/.test(found.renderer ?? 'WebGL');
    const most = onWebGPU ? PIPELINES_MOST : COMPILED_MOST;
    const compiled = compiledByFrameParts(found);
    if (compiled > most) {
      const what = onWebGPU ? 'pipelines made' : 'programs compiled';
      problems.push(`${compiled} ${what}: a part changes the scene's programs (most ${most})`);
    }
    const cancel = await cancelProblems(lab, command.canary);
    problems.push(...cancel.problems);
    const hour = command.hour === undefined ? '' : ` at ${command.hour}:00`;
    const place = command.village ? `the village${hour}` : command.biome;
    const name = `${place} ${command.view}, ${quality.qualityLevel()}`;
    const lines = profileLines(found);
    const text = [name, ...lines.map((line) => `  ${line}`)];
    if (command.send) {
      const sent = await sentProfile(lines, command.send);
      text.push(sent.text);
      problems.push(...sent.problems);
    }
    return { text: text.join('\n'), problems, moments: cancel.moments };
  } finally {
    lab.drawing = drawing;
    if (command.arrows) clearSpent();
    if (command.level) quality.useQuality(level, budget);
  }
}
