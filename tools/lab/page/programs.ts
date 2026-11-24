// `lab programs`: the engine's scene pipelines, what sets them apart (the engine's census of them, `PIPELINES_ASKED`
// in src/engine/pipelinesAside.ts, each with the descriptor it was asked for by). How many of each kind (whole, after
// the depth, depth first, shadow, sprites), each shader's count, and what else sets them apart (their targets, depth,
// samples, culling); how many were never drawn, and how many were first asked for in play (`programsCompiledInGame`,
// the performance report's count, against the census's own). A pipeline compiled is a pipeline the loading screen
// waits for, so which there are, and why, decides what can go; `lab pipelines` says them step by step. `--cost` times
// each one's compile alone (`programCost.ts`), `--limits` holds what the engine's device asks of a GPU to what every
// device gives (`programLimits.ts`). `--canary` hands the engine a box of a blending, side and depth nothing else has
// together, never shown (it must be listed asked for and never drawn), then shows one of another such blending (it
// must be listed drawn). (Under three this read three's WebGL programs from a ledger of the game's, dev builds alone:
// the engine replaced them, and the ledger read nothing.)
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import { programsCompiledInGame } from '../../../src/core/shaders';
import {
  AHEAD, DEVICE_ASKED, PIPELINES, PIPELINES_ASKED, engineDevice, type PipelineAsked,
} from '../../../src/engine/pipelinesAside';
import { cacheCanary, costs, longestText, summedText, unsaltedText } from './programCost';
import { limitsReport } from './programLimits';

export interface ProgramsOptions {
  canary: boolean;
  cost: boolean;
  /** the engine's device's asked limits held to every device's (`programLimits.ts`) */
  limits: boolean;
}

/** the most of a kind listed in each list */
const LISTED = 12;
/** frames drawn after the canary's boxes are handed over, for the shown one to be drawn */
const CANARY_FRAMES = 3;

/** A shader stage of a descriptor, and a descriptor, as this reads them. */
interface Stage { module?: { label?: string }; entryPoint?: string; targets?: ({ format?: string } | null)[] }
interface Descriptor {
  vertex?: Stage;
  fragment?: Stage;
  depthStencil?: { format?: string; depthCompare?: string; depthWriteEnabled?: boolean };
  multisample?: { count?: number };
  primitive?: { cullMode?: string; topology?: string };
}

/** What sets a pipeline apart, field by field, as the lists count them. */
const FIELDS: Record<string, (descriptor: Descriptor) => string> = {
  shader: (d) => `${d.vertex?.module?.label ?? '?'}.${d.vertex?.entryPoint ?? '?'} / `
    + `${d.fragment?.entryPoint ?? 'none'}`,
  targets: (d) => d.fragment?.targets?.map((target) => target?.format ?? 'none').join(',') || 'none',
  depth: (d) => `${d.depthStencil?.format ?? 'none'} ${d.depthStencil?.depthCompare ?? ''}`
    + `${d.depthStencil?.depthWriteEnabled ? ' written' : ''}`,
  samples: (d) => `${d.multisample?.count ?? 1}`,
  culling: (d) => d.primitive?.cullMode ?? 'none',
  topology: (d) => d.primitive?.topology ?? 'triangle-list',
};

/** `asked` counted by `keyOf`, the most first, `LISTED` of them as `name count`, and how many were left out. */
function countedText(asked: readonly PipelineAsked[], keyOf: (pipeline: PipelineAsked) => string): string {
  const counts = new Map<string, number>();
  for (const pipeline of asked) counts.set(keyOf(pipeline), (counts.get(keyOf(pipeline)) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, LISTED).map(([name, count]) => `${name} ${count}`);
  const left = sorted.length - shown.length;
  return `${shown.join('; ')}${left > 0 ? `; and ${left} more` : ''}`;
}

/** A pipeline's field `name` (`FIELDS`). */
const fieldOf = (name: string) => (pipeline: PipelineAsked): string => FIELDS[name](pipeline.descriptor as Descriptor);

/** The census as lines: by kind, by each field that sets them apart, those never drawn. */
function listing(asked: readonly PipelineAsked[]): string[] {
  const unseen = asked.filter((pipeline) => !pipeline.drawn);
  return [
    `the engine's scene pipelines: ${asked.length}, by kind: ${countedText(asked, (pipeline) => pipeline.kind)}`,
    ...Object.keys(FIELDS).map((name) => `  by ${name}: ${countedText(asked, fieldOf(name))}`),
    `  never drawn: ${unseen.length}${unseen.length ? `: ${countedText(unseen, (pipeline) => pipeline.kind)}` : ''}`,
  ];
}

/**
 * The performance report's count of the pipelines first asked for in play (`programsCompiledInGame`) against the
 * engine's own (`PIPELINES.late`): one reads the other, so they agree unless the report reads something else again
 * (it read three's programs, 0 under the engine whatever was compiled).
 */
function lateCounted(): Report {
  const counted = programsCompiledInGame();
  const text = `the performance report's pipelines first asked for in play: ${counted}; the engine's: `
    + `${PIPELINES.late}`;
  const problems = counted === PIPELINES.late
    ? []
    : [`the performance report counts ${counted} pipelines first asked for in play, the engine ${PIPELINES.late}`];
  return { text, problems };
}

/** A box of `material` before the hero. */
function boxOf(material: THREE.Material): THREE.Mesh {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  const way = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  box.position.copy(G.player.pos).addScaledVector(way, 2).setY(0.5);
  return box;
}

/** The canary's blendings, each with a side and depth writing no other material has together. */
function canaryMaterials(): THREE.Material[] {
  const backAdded = { side: THREE.BackSide, depthWrite: true, blending: THREE.AdditiveBlending };
  const multiplied = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, transparent: true };
  return [
    new THREE.MeshBasicMaterial({ color: 0xff00ff, ...backAdded }),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, ...multiplied, side: THREE.BackSide, depthWrite: true }),
  ];
}

/** The canary: a box handed to the engine and never shown (listed asked for, never drawn), then a box of another
 *  blending shown before the hero (listed asked for and drawn). */
async function canary(lab: Lab): Promise<Report> {
  const [unseen, shown] = canaryMaterials().map(boxOf);
  const before = PIPELINES_ASKED.length;
  AHEAD.prepare?.([unseen]);
  const handed = PIPELINES_ASKED.length;
  G.scene.add(shown);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(CANARY_FRAMES);
  } finally {
    lab.drawing = drawing;
    shown.removeFromParent();
    for (const box of [unseen, shown]) {
      box.geometry.dispose();
      (box.material as THREE.Material).dispose();
    }
  }
  const ofUnseen = PIPELINES_ASKED.slice(before, handed);
  const ofShown = PIPELINES_ASKED.slice(handed);
  const problems: string[] = [];
  if (!ofUnseen.length || ofUnseen.some((pipeline) => pipeline.drawn)) {
    problems.push('the canary\'s unseen box wasn\'t listed asked for and never drawn');
  }
  if (!ofShown.some((pipeline) => pipeline.drawn)) problems.push('the canary\'s shown box wasn\'t listed drawn');
  const drawnOf = (asked: PipelineAsked[]): number => asked.filter((pipeline) => pipeline.drawn).length;
  const text = `the canary: the unseen box asked for ${ofUnseen.length} pipelines (${drawnOf(ofUnseen)} drawn), the `
    + `shown box ${ofShown.length} (${drawnOf(ofShown)} drawn) (${problems.length ? 'missed' : 'caught'})`;
  return { text, problems };
}

/** What compiling each pipeline costs, alone (`programCost.ts`), and the cache's canary. */
async function costReport(asked: readonly PipelineAsked[]): Promise<Report> {
  const device = engineDevice();
  if (!device) return { text: 'compiled again: no engine device', problems: ['--cost: the engine has no device'] };
  const measured = await costs(device, asked);
  const total = measured.reduce((sum, { ms }) => sum + ms, 0);
  const canaryReport = await cacheCanary(device, measured, `canary ${Date.now()}`);
  const lines = [
    `compiled again alone, one after another, their shaders salted so no cache answers: ${measured.length} `
      + `pipelines, ${(total / 1000).toFixed(1)} s in all (the GPU's process's time on them; the game compiles them `
      + 'several at once)',
    ...unsaltedText(asked),
    `  by kind: ${summedText(measured, (pipeline) => pipeline.kind)}`,
    `  by shader: ${summedText(measured, fieldOf('shader'))}`,
    `  by samples: ${summedText(measured, fieldOf('samples'))}`,
    '  the longest:',
    ...longestText(measured),
    canaryReport.text,
  ];
  const problems = [...canaryReport.problems];
  if (!measured.length) problems.push('--cost: no pipeline compiled again (no shader\'s code kept)');
  return { text: lines.join('\n'), problems, counts: { 'compile ms': Math.round(total) } };
}

export async function programs(lab: Lab, options: ProgramsOptions): Promise<Report> {
  const asked = PIPELINES_ASKED.slice();
  const problems: string[] = [];
  if (asked.length === 0) problems.push('no pipeline in the engine\'s census: nothing was asked for');
  const late = lateCounted();
  problems.push(...late.problems);
  const lines = [...listing(asked), late.text];
  const counts: Record<string, number> = { pipelines: asked.length };
  if (options.cost) {
    const report = await costReport(asked);
    lines.push(report.text);
    problems.push(...report.problems);
    Object.assign(counts, report.counts);
  }
  if (options.limits) {
    const report = limitsReport(DEVICE_ASKED, engineDevice(), options.canary);
    lines.push(report.text);
    problems.push(...report.problems);
  }
  if (options.canary) {
    const report = await canary(lab);
    lines.push(report.text);
    problems.push(...report.problems);
  }
  return { text: lines.join('\n'), problems, counts };
}
