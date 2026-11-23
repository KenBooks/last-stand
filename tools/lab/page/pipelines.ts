// `lab pipelines`: the engine's scene pipelines the boot asks for, step by step and by kind, against those the
// lobby's frames draw with (`PIPELINES_ASKED` in src/engine/pipelinesAside.ts). The loading screen waits for every
// pipeline asked under it: an Adreno 810's boot waited out its whole 12 s budget at "Warming the hearth" with 34
// still compiling (trace DMDE-1E1R), so one asked for and never drawn is boot time for nothing. The lobby must have
// drawn with some of them (else nothing was measured), and the loading screen wait for at most `UNDER_LOADING_MOST`
// before its last step: the engine made all 48 of its lit pipelines as it started, at 4 samples, and all 48 again
// at a phone's one, 152 asked there and 128 of them never drawn; 47 once each was made as it was first asked for
// (Bulwark c9e506c). `--canary` forgets what was drawn and draws no frame: every pipeline must then read as never
// drawn.
import * as aside from '../../../src/engine/pipelinesAside';
import type { PipelineAsked } from '../../../src/engine/pipelinesAside';
import { loadingSteps } from '../../../src/ui/loading';
import type { Lab, Report } from './lab';

/** The census, where the tree keeps one (a tree before it: none, as an A/B's other side may be). */
const census = (): PipelineAsked[] | undefined => (aside as { PIPELINES_ASKED?: PipelineAsked[] }).PIPELINES_ASKED;

/** The options `lab pipelines` takes. */
export interface PipelinesOptions {
  frames: number;
  canary: boolean;
}

/** How many of a kind were asked for, and how many of those a pass has set since. */
interface Tally { asked: number; drawn: number }

/** the most scene pipelines asked for before the boot's last step (66 at High, cold: the lobby's own, the
 *  fight's and what stands hidden in the scene, all asked for as they're built) */
const UNDER_LOADING_MOST = 80;

/** the name of the time after the boot's last step was shown */
const IN_LAST_STEP = 'in the last step and after it';

/** The loading step `at` fell in (the last shown at or before it). */
function stepAt(at: number): string {
  let step = 'before the first step';
  for (const shown of loadingSteps) {
    if (shown.at <= at) step = shown.label;
  }
  return step;
}

/** The pipelines asked for, by step and then kind, those of the last step and after under one name. */
function tallied(asked: readonly PipelineAsked[], lastStepAt: number): Map<string, Map<string, Tally>> {
  const steps = new Map<string, Map<string, Tally>>();
  for (const pipeline of asked) {
    const step = pipeline.at >= lastStepAt ? IN_LAST_STEP : stepAt(pipeline.at);
    const kinds = steps.get(step) ?? new Map<string, Tally>();
    steps.set(step, kinds);
    const tally = kinds.get(pipeline.kind) ?? { asked: 0, drawn: 0 };
    kinds.set(pipeline.kind, tally);
    tally.asked++;
    if (pipeline.drawn) tally.drawn++;
  }
  return steps;
}

/** A line for each step: its pipelines by kind, asked and drawn. */
function stepLines(steps: Map<string, Map<string, Tally>>): string[] {
  const lines: string[] = [];
  for (const [step, kinds] of steps) {
    const parts = [...kinds].map(([kind, tally]) => `${kind} ${tally.asked} (${tally.drawn} drawn)`);
    lines.push(`  ${step}: ${parts.join(', ')}`);
  }
  return lines;
}

/** `frames` of the lobby, drawn (the canary: what was drawn forgotten, and none stepped: the lab draws some of its
 *  frames with its drawing off). */
async function lobbyFrames(lab: Lab, frames: number, canary: boolean): Promise<void> {
  if (canary) {
    for (const pipeline of census() ?? []) pipeline.drawn = false;
    return;
  }
  lab.drawing = true;
  try {
    await lab.step(frames);
  } finally {
    lab.drawing = false;
  }
}

/** `lab pipelines`: what the boot asked for, step by step, and what `frames` of the lobby drew with. */
export async function pipelinesCensus(lab: Lab, options: PipelinesOptions): Promise<Report> {
  const lastStep = loadingSteps[loadingSteps.length - 1];
  if (!lastStep) return { text: 'no loading steps: the boot was never seen', problems: ['no loading steps'] };
  const kept = census();
  if (!kept) return { text: 'a tree before the census of pipelines (PIPELINES_ASKED)', problems: [] };
  const asked = kept.slice();
  await lobbyFrames(lab, options.frames, options.canary);
  // (what the loading screen waited for: asked before its last step, the lobby's own lit then)
  const underLoading = asked.filter((pipeline) => pipeline.at < lastStep.at);
  const drawn = asked.filter((pipeline) => pipeline.drawn);
  const unseen = underLoading.filter((pipeline) => !pipeline.drawn);
  // (what the lobby's frames draw with, first asked for in the boot's last step: that step waits for each with
  // nothing else left to do, where one asked for as its thing is built compiles beside the steps between)
  const drawnLate = asked.filter((pipeline) => pipeline.at >= lastStep.at && pipeline.drawn);
  const lines = [
    `${asked.length} scene pipelines asked for by the end of the boot, ${underLoading.length} of them before its `
      + `last step ("${lastStep.label}"); ${options.canary ? 'no' : options.frames} frames of the lobby drawn`,
    'by step and kind (asked, of them drawn since):',
    ...stepLines(tallied(asked, lastStep.at)),
    `asked before the last step and never drawn in the lobby: ${unseen.length} of ${underLoading.length}`,
    ...stepLines(tallied(unseen, lastStep.at)),
    `drawn in the lobby and first asked for in the boot's last step: ${drawnLate.length}`,
  ];
  const problems: string[] = [];
  if (options.canary) {
    lines.push('(the canary: what was drawn forgotten, and no frame stepped)');
    problems.push(drawn.length === 0
      ? `the canary: none of the ${asked.length} read as drawn, as planted`
      : `the canary missed: ${drawn.length} read as drawn with no frame drawn`);
  } else if (drawn.length === 0) {
    problems.push('the lobby drew with none of the pipelines asked for: nothing was measured');
  }
  if (drawnLate.length > 0 && !options.canary) {
    problems.push(`${drawnLate.length} pipelines the lobby draws with were first asked for in the boot's last `
      + 'step, which waits for them: what draws with them is to be handed to the engine as it is built');
  }
  if (underLoading.length > UNDER_LOADING_MOST) {
    problems.push(`${underLoading.length} scene pipelines asked for under the loading screen, over its `
      + `${UNDER_LOADING_MOST}: ${unseen.length} of them never drawn in the lobby`);
  }
  return { text: lines.join('\n'), problems };
}
