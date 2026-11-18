// `npm run lab -- envcost`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab envcost`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the environment\'s lookups take of the GPU (the frame with the scene\'s environment and without, in '
    + 'turns within one page; with `--ab` each commit against itself)',
  help: 'what the environment\'s lookups take of the GPU: the frame drawn with the scene\'s environment and '
    + 'without it, in turns within one page (a run\'s load is both sides\'), the hero standing in each biome and '
    + 'view; with --ab, each commit timed against itself',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third',
      help: 'the views: top, third, first',
    },
    rounds: { kind: 'number', usage: 'n', default: '8', help: 'the rounds of turns, each of 6 renders a side' },
    canary: {
      kind: 'switch',
      help: 'draw the frame twice with the environment: it must read at least 1.6 times the frame without',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (!(options.rounds >= 1)) throw labError(`envcost --rounds: ${options.rounds} is not a count of rounds`);
  },
  async each(side, options) {
    const reports = [];
    for (const biome of options.biomes) {
      for (const view of options.views) {
        const command = { biome, view, rounds: options.rounds, canary: Boolean(options.canary) };
        reports.push(await side.command('envCost', command));
      }
    }
    return {
      text: reports.map((report) => report.text).join('\n'),
      problems: reports.flatMap((report) => report.problems),
    };
  },
  textOf: asText,
  problemsOf: problemsIn,
};
