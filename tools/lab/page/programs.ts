// `lab programs`: the programs the boot compiled, read from the game's ledger of them (`watchPrograms` in
// `src/core/shaders.ts`, dev builds alone: the boot's programs are made before any command can watch). How many each
// loading step made, and how (the warm-ups' `compile()`, or a draw: a program a draw makes is linked as it's drawn, the
// page held up meanwhile); each kind, with the fields of its key that set its programs apart (`programKeys.ts`); the
// programs no draw ever used (compiled for nothing: the boot's time spent on them is lost) and those a draw made,
// each named; and those made after the reveal (the lab's set-up). On a first visit the boot spends 94 s of ANGLE's
// threads compiling (the stalls' boot measure), so which programs there are, and why, decides what can go; `--cost`
// times each one's compile alone (`programCost.ts`). `--canary` warms a box of a kind nothing else is, which must
// be listed as compiled and drawn, and one on a layer no camera sees, which must be listed as never drawn. The
// performance report's count of the programs compiled after loading must be the ledger's (`lateCounted`).
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import { ENEMIES } from '../../../src/data/enemies';
import { sceneTarget } from '../../../src/core/renderer';
import { markLoaded, programsCompiledInGame, programsMade, warmUp, type ProgramMade } from '../../../src/core/shaders';
import { apartText, fieldsOf, kindOf, kindsApart, type KindApart } from './programKeys';
import { LEAST_LIMITS, limitsReport } from './programLimits';
import { cacheCanary, costs, lightsText, longestText, partsText, summedText, type ProgramCost } from './programCost';

export interface ProgramsOptions {
  canary: boolean;
  cost: boolean;
  /** each program's uniforms, attributes and samplers held to a phone's least (`programLimits.ts`) */
  limits: boolean;
}

/** the step a program made after the boot is listed under (`watchPrograms`'s) */
const AFTER = 'after the reveal';
/** the most fields listed setting a kind's programs apart, and the most kinds of program listed in each list */
const APART_SHOWN = 6;
const LISTED = 12;
/** a layer no camera of the game's sees (the canary's unseen box) */
const UNSEEN_LAYER = 30;

/** A program by its kind and its material's own key, as the lists group them. */
function groupOf({ program, type }: ProgramMade): string {
  const custom = fieldsOf(program.cacheKey).get('custom');
  return `${kindOf(type, program.cacheKey)}${custom === 'none' ? '' : ` ${custom}`}`;
}

/** `made` counted by `keyOf`, the most first, `LISTED` of them as `name count`, and how many groups were left out. */
function countedText(made: ProgramMade[], keyOf: (entry: ProgramMade) => string): string {
  const counts = new Map<string, number>();
  for (const entry of made) counts.set(keyOf(entry), (counts.get(keyOf(entry)) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, LISTED).map(([name, count]) => `${name} ${count}`);
  const left = sorted.length - shown.length;
  return `${shown.join('; ')}${left > 0 ? `; and ${left} more` : ''}`;
}

/** What uses a program, as the lists group them: the foes (every foe's kind, by name) as one, the rest by name, in
 *  order. */
function usersOf({ users }: ProgramMade): string {
  const foe = (user: string): boolean => user in ENEMIES || user.startsWith('crowd ');
  const foes = [...users].filter(foe);
  const rest = [...users].filter((user) => !foe(user)).sort();
  return [...(foes.length ? ['foes'] : []), ...rest].join(' + ') || 'nothing';
}

/** Each step's programs: how many, and how many of them a draw made. */
function stepsText(made: ProgramMade[]): string {
  const steps = [...new Set(made.map((entry) => entry.step))];
  const pieces = steps.map((step) => {
    const ofStep = made.filter((entry) => entry.step === step);
    const byDraw = ofStep.filter((entry) => !entry.byCompile).length;
    return `${step} ${ofStep.length} (${byDraw} by a draw)`;
  });
  return pieces.join('; ');
}

/** A kind's line: how many, and the fields that set its programs apart; a kind of one, what it was made for. */
function kindText({ kind, count, apart }: KindApart, made: ProgramMade[]): string {
  if (count === 1) {
    const one = made.find((entry) => kindOf(entry.type, entry.program.cacheKey) === kind);
    return `    ${kind}: 1, for ${one?.owner ?? '?'}`;
  }
  const shown = apart.slice(0, APART_SHOWN).map(apartText);
  const more = apart.length > shown.length ? `; and ${apart.length - shown.length} more fields` : '';
  return `    ${kind}: ${count}${shown.length ? `, set apart by ${shown.join('; ')}${more}` : ''}`;
}

/** `made`, `LISTED` of them, each with its step and what it was made for, one a line under `title`. */
function eachText(title: string, made: ProgramMade[]): string[] {
  const shown = made.slice(0, LISTED).map((entry) => `      ${entry.step}: ${groupOf(entry)}, for ${entry.owner}`);
  const left = made.length - shown.length;
  return made.length ? [`    ${title}:`, ...shown, ...(left > 0 ? [`      and ${left} more`] : [])] : [];
}

/** The listing of `made`, the boot's programs. */
function listing(made: ProgramMade[]): string[] {
  const kinds = kindsApart(made.map(({ program, type }) => ({
    kind: kindOf(type, program.cacheKey),
    fields: fieldsOf(program.cacheKey),
  })));
  const unused = made.filter((entry) => entry.draws === 0);
  const byDraw = made.filter((entry) => !entry.byCompile);
  return [
    `the boot's programs: ${made.length}, by step: ${stepsText(made)}`,
    `  by kind (${kinds.length}):`,
    ...kinds.map((kind) => kindText(kind, made)),
    `  by what uses them (the scene's top-level objects): ${countedText(made, usersOf)}`,
    `  never drawn: ${unused.length}${unused.length ? `: ${countedText(unused, groupOf)}` : ''}`,
    ...eachText('each', unused),
    `  made by a draw: ${byDraw.length}${byDraw.length ? `: ${countedText(byDraw, groupOf)}` : ''}`,
    ...eachText('each', byDraw),
  ];
}

/** A box of `material` before the hero, on `layer`. */
function boxOf(material: THREE.Material, layer: number): THREE.Mesh {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  const way = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  box.position.copy(G.player.pos).addScaledVector(way, 2).setY(0.5);
  box.layers.set(layer);
  return box;
}

/** The canary: a warm-up as the boot's with a box of a kind nothing else is (sheen and iridescence), which must be
 *  listed as compiled and drawn, and a toon box on a layer no camera sees, which must be listed as never drawn.
 *  Drawn as the boot draws (the lab draws nothing unless a command asks). */
async function canary(lab: Lab): Promise<Report> {
  const drawn = boxOf(new THREE.MeshPhysicalMaterial({ sheen: 1, iridescence: 1, color: 0xff00ff }), 0);
  const unseen = boxOf(new THREE.MeshToonMaterial({ color: 0x00ffff }), UNSEEN_LAYER);
  const before = programsMade.length;
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), { objects: [drawn, unseen] });
  } finally {
    lab.drawing = drawing;
    for (const box of [drawn, unseen]) {
      box.geometry.dispose();
      (box.material as THREE.Material).dispose();
    }
  }
  const made = programsMade.slice(before);
  const physical = made.find((entry) => entry.type === 'MeshPhysicalMaterial');
  const toon = made.find((entry) => entry.type === 'MeshToonMaterial');
  const problems: string[] = [];
  if (!physical?.byCompile || !(physical.draws > 0)) {
    problems.push('the canary\'s drawn box wasn\'t listed compiled and drawn');
  }
  if (!toon?.byCompile || toon.draws !== 0) {
    problems.push('the canary\'s unseen box wasn\'t listed compiled and never drawn');
  }
  const text = `the canary: ${made.length} programs warmed, the drawn box's drawn ${physical?.draws ?? 0} times, the `
    + `unseen box's ${toon?.draws ?? 'not'} (${problems.length ? 'missed' : 'caught'})`;
  return { text, problems };
}

/**
 * The performance report's count of the programs compiled after loading (`programsCompiledInGame`: each a hitch, as
 * it says) against the ledger's made after the reveal, both leaving out the warm-ups': they must agree. (A new
 * build's lobby, its fight's programs not yet warm, counted every program the boot made: the load was marked only once
 * the fight's were warm, `markLoaded`. `--cold` boots as that lobby shows.)
 */
function lateCounted(later: ProgramMade[]): Report {
  const counted = programsCompiledInGame();
  const text = `the performance report's programs compiled after load: ${counted}; the ledger's made after the `
    + `reveal: ${later.length}`;
  const problems = counted === later.length
    ? []
    : [`the performance report counts ${counted} programs compiled after load, the ledger ${later.length}`];
  return { text, problems };
}

/** The late count's canary: a box of a kind nothing else is (matcap) drawn before the hero, a program made by a
 *  draw, and the load marked again after it, as #275 marked it late: the report then misses the box's program, which
 *  must be found. */
async function lateCanary(lab: Lab): Promise<Report> {
  const box = boxOf(new THREE.MeshMatcapMaterial({ color: 0xffff00 }), 0);
  G.scene.add(box);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(1);
  } finally {
    lab.drawing = drawing;
    box.removeFromParent();
    box.geometry.dispose();
    (box.material as THREE.Material).dispose();
  }
  markLoaded();
  const report = lateCounted(programsMade.filter((entry) => entry.step === AFTER));
  const caught = report.problems.length > 0;
  const text = `the late count's canary: a box drawn, the load marked after it: ${report.text} `
    + `(${caught ? 'caught' : 'missed'})`;
  return {
    text,
    problems: caught ? [] : ['the late count\'s canary: a program drawn before the load was marked again went unseen'],
  };
}

/** Each step's programs' compile, summed by what uses them: what the step's warm-up waits for its links on. */
function stepsCostText(measured: ProgramCost[]): string[] {
  const steps = [...new Set(measured.map(({ entry }) => entry.step))];
  return steps.map((step) => {
    const ofStep = measured.filter(({ entry }) => entry.step === step);
    const total = ofStep.reduce((sum, { ms }) => sum + ms, 0);
    return `    ${step} ${ofStep.length}: ${(total / 1000).toFixed(1)} s: ${summedText(ofStep, usersOf, LISTED)}`;
  });
}

/** What compiling each of `made` costs, alone (`programCost.ts`), and the cache's canary. */
async function costReport(made: ProgramMade[]): Promise<Report> {
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  const measured = await costs(gl, made);
  const total = measured.reduce((sum, { ms }) => sum + ms, 0);
  const canaryReport = cacheCanary(gl, measured);
  const lines = [
    `compiled again alone, salted so no cache answers: ${measured.length} programs, ${(total / 1000).toFixed(1)} s `
      + 'in all (the CPU a first visit spends on them, several at once)',
    `  by kind: ${summedText(measured, groupOf, LISTED)}`,
    `  by what uses them: ${summedText(measured, usersOf, LISTED)}`,
    '  each step\'s, by what uses them:',
    ...stepsCostText(measured),
    `  by the point lights they're lit by: ${lightsText(measured)}`,
    '  the longest:',
    ...longestText(measured, groupOf),
    await partsText(G.renderer, G.scene, G.camera),
    canaryReport.text,
  ];
  return { text: lines.join('\n'), problems: canaryReport.problems, counts: { 'compile ms': Math.round(total) } };
}

export async function programs(lab: Lab, options: ProgramsOptions): Promise<Report> {
  const boot = programsMade.filter((entry) => entry.step !== AFTER);
  const later = programsMade.filter((entry) => entry.step === AFTER);
  const unwatched = (G.renderer.info.programs ?? []).length - programsMade.length;
  const problems: string[] = [];
  if (boot.length === 0) problems.push('no program in the ledger: the game\'s watchPrograms recorded nothing');
  if (unwatched > 0) problems.push(`${unwatched} programs made before watchPrograms: the ledger missed them`);
  const laterText = later.length ? `: ${countedText(later, groupOf)}` : '';
  const late = lateCounted(later);
  problems.push(...late.problems);
  const lines = [...listing(boot), `made after the reveal (the lab's set-up): ${later.length}${laterText}`, late.text];
  const counts: Record<string, number> = { programs: boot.length };
  if (options.cost) {
    const report = await costReport(boot);
    lines.push(report.text);
    problems.push(...report.problems);
    Object.assign(counts, report.counts);
  }
  if (options.limits) {
    const report = limitsReport(LEAST_LIMITS, options.canary);
    lines.push(report.text);
    problems.push(...report.problems);
  }
  if (options.canary) {
    for (const report of [await lateCanary(lab), await canary(lab)]) {
      lines.push(report.text);
      problems.push(...report.problems);
    }
  }
  return { text: lines.join('\n'), problems, counts };
}
