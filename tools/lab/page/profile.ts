// `lab profile`: the game's own profiler (src/perf/profiler.ts, the pause menu's Profile this spot) run where the hero
// stands, as a player's device runs it: each part of the frame taken out and put back in turns, each frame waited out
// on the GPU and timed by the browser's clock (the page's stands still within a lab frame). Its canary is a part of
// its own, the frame drawn twice, which must read at least `CANARY_LEAST` times the frame once.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { QualityLevel } from '../../../src/data/quality';
import type { ViewMode } from '../../../src/core/renderer';
import * as quality from '../../../src/core/quality';
import { G } from '../../../src/state';
import {
  CANARY_PART, PROFILE_TURNS, ProfileCancelled, canProfile, profile, profileLines, type ProfileOptions,
} from '../../../src/perf/profiler';
import { standIn } from './light';

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
  await lab.step(30, () => ({ keys: ['w'] }));
  if (lab.player.pos.distanceTo(start) < 0.5) problems.push('cancel: the game\'s frames were left held');
  return problems;
}

/** `lab profile`, one place: the frame's parts timed as the pause menu's profiler times them. */
export async function profileHere(lab: Lab, command: ProfileCommand): Promise<Report> {
  if (!canProfile()) return { text: 'the profiler times WebGL\'s frames alone', problems: [] };
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
    if (found.compiled > COMPILED_MOST) {
      problems.push(`${found.compiled} programs compiled: a part changes the scene's programs (most ${COMPILED_MOST})`);
    }
    problems.push(...await cancelProblems(lab));
    const name = `${command.biome} ${command.view}, ${quality.qualityLevel()}`;
    return { text: [name, ...profileLines(found).map((line) => `  ${line}`)].join('\n'), problems };
  } finally {
    lab.drawing = drawing;
    if (command.level) quality.useQuality(level, budget);
  }
}
