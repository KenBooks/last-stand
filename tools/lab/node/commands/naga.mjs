// `npm run lab -- naga`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';
import { CANARY, CANARY_LABEL, checkModules } from '../nagaCheck.mjs';
import { OUT } from '../paths.mjs';

/** the most refusals listed in full, and the most stages named in one */
const LISTED = 12;
const STAGES_NAMED = 6;

/** `stages` named, the first `STAGES_NAMED` of them. */
function named(stages) {
  const more = stages.length > STAGES_NAMED ? '...' : '';
  return `${stages.slice(0, STAGES_NAMED).join(', ')}${more}`;
}

/** `faults` of one module, step and saying as one line each: their entry points and constants listed. */
function grouped(faults) {
  const groups = new Map();
  for (const fault of faults) {
    const key = `${fault.label}\t${fault.step}\t${fault.said}`;
    if (!groups.has(key)) groups.set(key, { fault, stages: [] });
    groups.get(key).stages.push(`${fault.entry || 'the module'} (${fault.constants || 'read'})`);
  }
  return [...groups.values()].map(({ fault, stages }) => `${fault.label}: refused at ${fault.step} for `
    + `${stages.length} stage(s), ${named(stages)}\n    ${fault.said}`);
}

/** The page's modules (`made`) checked on `side` as Firefox's WebGPU takes them: a report. */
async function checked(side, made, canary) {
  const folder = join(OUT, 'naga', side.name.replace(/[^\w.-]+/g, '-'));
  const canaryCode = readFileSync(CANARY, 'utf8');
  const { faults, modules, stages } = await checkModules(folder, made.modules, canaryCode);
  const isCanary = (fault) => fault.label === CANARY_LABEL;
  const pages = faults.filter((fault) => !isCanary(fault) || canary);
  const canaryCaught = faults.some(isCanary);
  const problems = grouped(pages);
  if (!canaryCaught) {
    problems.push('the canary went through: the checker refused nothing it must, so it checks nothing');
  }
  const lines = [
    `shader modules the page made: ${made.made}, ${made.modules.length} codes of them`,
    `checked by naga (as Firefox's WebGPU: its constants' pass, HLSL, MSL, SPIR-V), each lit shader made both ways: `
      + `${modules} modules, ${stages} stages`,
    `the canary: ${canaryCaught ? 'refused, as it must be' : 'went through'}`,
    pages.length === 0 ? 'refused: none' : `refused: ${pages.length} stage(s)`,
    ...problems.slice(0, LISTED).map((problem) => `  ${problem}`),
    `the modules as checked: ${folder}`,
  ];
  return { text: lines.join('\n'), problems, counts: { refused: pages.length, stages } };
}

/** `lab naga`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'every shader module the page made (the engine\'s, its looks\' joined and alone, three\'s) checked by '
    + 'naga as Firefox\'s WebGPU takes each stage (its pipeline constants\' pass, HLSL, MSL, SPIR-V), each lit '
    + 'shader made both ways (the plain levels\' too): what Chrome compiles and Firefox refuses, which no other '
    + 'command sees (#938)',
  help: 'every shader module the page\'s WebGPU devices made by the lobby, with the constants each pipeline gave '
    + 'it, checked by tools/lab/naga (naga 30, built by cargo the first time): read, validated, its constants run '
    + 'through naga\'s pass and written as HLSL, MSL and SPIR-V, Firefox\'s on Windows, macOS and Linux. Chrome '
    + 'compiles with Tint, so a stage naga refuses is drawn in every page the lab boots: the meadow blades were '
    + 'refused in Firefox at every level (report V1T3-G00X). Its canary (tools/lab/naga/canary.wgsl) is always '
    + 'checked and must be refused',
  options: {
    canary: {
      kind: 'switch',
      help: 'count the canary\'s refusal as the page\'s: the command must then fail',
    },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    const made = await side.command('naga', {});
    return checked(side, made, Boolean(options.canary));
  },
  textOf: asText,
  problemsOf: problemsIn,
};
