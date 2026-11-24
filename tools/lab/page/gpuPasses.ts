// `lab passes`: what each of the frame's passes takes of the GPU, as the engine times them within one frame
// (src/perf/gpuParts.ts, Bulwark's gpu/parts.rs): every pass stamped at its start and its end, and the scene drawn as
// a pass for each run of its draws of one kind by one shader, so the rows add up to the frame broken down; beside it
// the frame as it is, by the engine's GPU clock (`timedRenders`). `--features` times each of the lit shading's parts
// (the lights, the sun's shadow, the fog, the maps...) in the whole frame, each taken out and put back in turns
// (`costInTurns`: the engine's own switches, `frameParts` in src/perf/sceneParts.ts, no pipeline made anew).
// Its canary takes the bloom out and reads the frame broken down again: the bloom's passes must fall to under
// `CANARY_MOST` of what they read, and the frame's passes found again with it. (Under three this read three's
// timestamps, every render call named by what it drew; the engine replaced three's drawing, and they read nothing.)
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { QualityLevel } from '../../../src/data/quality';
import type { ViewMode } from '../../../src/core/renderer';
import { render } from '../../../src/core/renderer';
import * as quality from '../../../src/core/quality';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { gpuParts, gpuPartsLines, type GpuParts } from '../../../src/perf/gpuParts';
import { frameParts } from '../../../src/perf/sceneParts';
import { costInTurns, medianOf, sure, timedRenders, TURNS } from './gpuTurns';
import { standAt } from './draws';

export interface PassesCommand {
  biome: BiomeId;
  view: ViewMode;
  at?: [number, number];
  level?: QualityLevel;
  frames?: number;
  /** each part of the lit shading timed in the whole frame too, taken out in turns */
  features?: boolean;
  /** the game paused as its pause menu pauses it (`G.paused`: no update, the same scene drawn): a phone's GPU took
   *  11.5 ms a frame paused and 24 in the lobby, the same view and level (traces N5TH-2XC9, R5FJ-9TNN) */
  paused?: boolean;
  /** in the lobby's village instead, as `draws --village` stands him there (`at` there, the square by default) */
  village: boolean;
  /** with `village`, the hour it's lit for (the page's own when not given) */
  hour?: number;
  canary: boolean;
}

/** the frames the frame as it is is timed over when the command doesn't say */
const FRAMES = 30;
/** the most of what the bloom's passes read that they may read with the bloom taken out (the engine keeps a fifth
 *  of them: 0.17 ms of 0.78 at 2880 by 1800 at 2) */
const CANARY_MOST = 0.5;
/** how the bloom's passes are named among the parts */
const BLOOM = /bloom/i;
/** the frame's parts that are the lit shading's own, by their names (`frameParts`) */
const SHADING = /^the (lit shading|point lights|sun's shadow|lamps' shadows|normal, roughness|fog)/;

/** The browser's next frame, by its own clock (the lab's page clock stands still within a frame). */
function browserFrame(): Promise<void> {
  return window.__labClock.realFrame();
}

/** What the bloom's passes read in a breakdown (ms). */
function bloomOf(found: GpuParts): number {
  return found.parts.filter((part) => BLOOM.test(part.name)).reduce((all, part) => all + part.ms, 0);
}

/** The canary: the frame broken down again with the bloom taken out; its line, and a problem unless the bloom's
 *  passes fell to under `CANARY_MOST` of what they read with it. */
async function canaryLine(found: GpuParts): Promise<Report> {
  const withIt = bloomOf(found);
  const kept = RUST.tune.bloom;
  RUST.tune.bloom = 0;
  let without: GpuParts | undefined;
  try {
    without = await gpuParts(render, browserFrame);
  } finally {
    RUST.tune.bloom = kept;
  }
  if (!without) return { text: '  the canary: not timed', problems: ['canary: the frame without bloom not timed'] };
  const left = bloomOf(without);
  const read = `${withIt.toFixed(2)} ms with it, ${left.toFixed(2)} without`;
  const caught = withIt > 0 && left <= CANARY_MOST * withIt;
  const text = `  the canary: the bloom taken out, its passes ${read}`;
  return { text, problems: caught ? [] : [`canary: the bloom taken out, its passes read ${read}`] };
}

/** Each part of the lit shading timed in the whole frame, taken out and put back in turns, as lines. */
async function featureLines(): Promise<string[]> {
  const lines = ['  the lit shading\'s parts, each taken out of the whole frame in turns (what it takes, ± how far '
    + 'it may be off):'];
  for (const part of frameParts().filter((one) => SHADING.test(one.name))) {
    try {
      const cost = await costInTurns(part.change, render, TURNS);
      if (!cost) continue;
      const said = sure(cost) ? '' : ', not told apart from nothing';
      lines.push(`    ${part.name}: ${cost.takes.toFixed(2)} ± ${cost.error.toFixed(2)} ms${said}`);
    } finally {
      part.restore?.();
    }
  }
  return lines;
}

/** ` at h:00` for a village held at an hour, or nothing */
function hourOf(command: PassesCommand): string {
  return command.hour === undefined ? '' : ` at ${command.hour}:00`;
}

export async function gpuPasses(lab: Lab, command: PassesCommand): Promise<Report> {
  if (command.level) quality.useQuality(command.level);
  await standAt(lab, command);
  G.paused = command.paused === true;
  // (pictured as the browser shows it: an A/B's sides compared pixel by pixel, a cost cut keeping the look)
  const pictured = await lab.screen('the frame timed');
  const drawing = lab.drawing;
  lab.drawing = true;
  const lines = [`${command.village ? `the village${hourOf(command)}` : G.arena.biome} ${command.view}, `
    + `${quality.qualityLevel()}, ${innerWidth * devicePixelRatio}x${innerHeight * devicePixelRatio} drawn`
    + (command.paused ? ', paused' : '')];
  const problems: string[] = [];
  try {
    const whole = medianOf(await timedRenders(render, command.frames ?? FRAMES));
    const found = await gpuParts(render, browserFrame);
    if (!found || !(whole > 0)) {
      problems.push('nothing was timed: the engine\'s GPU clock gave no times');
    } else {
      lines.push(...gpuPartsLines(found, whole).map((line) => `  ${line}`));
      if (command.canary) {
        const canary = await canaryLine(found);
        lines.push(canary.text);
        problems.push(...canary.problems);
      }
    }
    if (command.features) lines.push(...await featureLines());
  } finally {
    lab.drawing = drawing;
    G.paused = false;
  }
  return { text: lines.join('\n'), problems, moments: [pictured] };
}
