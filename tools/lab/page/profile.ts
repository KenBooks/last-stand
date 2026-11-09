// `lab profile`: the game's own profiler (src/perf/profiler.ts, the pause menu's Profile this spot) run where the hero
// stands, as a player's device runs it: each part of the frame taken out and put back in turns, each frame waited out
// on the GPU and timed by the browser's clock (the page's stands still within a lab frame). Its canary is a part of
// its own, the frame drawn twice, which must read at least `CANARY_LEAST` times the frame once.
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { QualityLevel } from '../../../src/data/quality';
import type { ViewMode } from '../../../src/core/renderer';
import * as quality from '../../../src/core/quality';
import { CANARY_PART, PROFILE_TURNS, canProfile, profile, profileLines } from '../../../src/perf/profiler';
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
    const found = await profile({ turns, canary: command.canary, clock: window.__labClock.realNow });
    const problems = command.canary ? canaryProblems(found) : [];
    if (!(found.frame > 0)) problems.push('the frame read 0 ms: nothing was timed');
    const name = `${command.biome} ${command.view}, ${quality.qualityLevel()}`;
    return { text: [name, ...profileLines(found).map((line) => `  ${line}`)].join('\n'), problems };
  } finally {
    lab.drawing = drawing;
    if (command.level) quality.useQuality(level, budget);
  }
}
