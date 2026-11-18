// `npm run lab -- scenecost`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab scenecost`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what each kind of work in the scene pass takes of the GPU at the screen\'s own pixels and a level\'s '
    + 'other settings (the point lights, their shadows, the sun\'s, the environment, the lit shading, what\'s '
    + 'see-through, the particles, the hero, each taken out in turns, each row with how far it may be off and "within '
    + 'the noise" where it says nothing: run it with the GPU loaded, `--screen 2880x1800@2`, or a strong GPU reads '
    + 'its idle clock\'s wander; `--each` each see-through mesh alone; `--hero` the hero\'s parts and a change of '
    + 'nothing; `--frame` the whole frame by the browser\'s clock, HDR\'s output and MSAA)',
  help: 'what each part of the scene pass takes of the GPU at the screen\'s own pixels and a level\'s other '
    + 'settings: the point lights, their shadows, the sun\'s, the environment, the lit shading, what\'s see-through, '
    + 'the particles, the hero, each taken out in turns within one page',
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
      default: 'top',
      help: 'the views: top, third, first',
    },
    level: {
      kind: 'choice',
      usage: 'level',
      choices: ['high', 'medium', 'low', 'verylow'],
      default: 'low',
      help: 'the quality level whose settings the scene takes, its pixels all the screen\'s',
    },
    rarity: SETUP_OPTIONS.rarity,
    rounds: { kind: 'number', usage: 'n', default: '6', help: 'the rounds of turns, each of 6 renders a side' },
    canary: { kind: 'switch', help: 'draw the scene twice: it must read at least 1.6 times once' },
    each: { kind: 'switch', help: 'time each see-through or cut-out mesh alone too, the costliest listed' },
    hero: {
      kind: 'switch',
      help: 'time the hero\'s parts alone too: his head, his hands, his cloth, the rest of him and the shadows '
        + 'he casts, the glow of his gear (with --rarity), '
        + 'with what a change of nothing reads (the measure\'s noise)',
    },
    frame: {
      kind: 'switch',
      help: 'time the whole frame too, by the browser\'s clock with the GPU waited for: HDR\'s output (a WebGPU '
        + 'copy the GPU\'s timer can\'t see) and the level\'s MSAA, each on and off in turns',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (!(options.rounds >= 1)) throw labError(`scenecost --rounds: ${options.rounds} is not a count of rounds`);
  },
  async each(side, options) {
    const reports = [];
    for (const biome of options.biomes) {
      for (const view of options.views) {
        const { level, rounds } = options;
        const { canary, each, frame, hero } = options;
        const switches = {
          canary: Boolean(canary),
          each: Boolean(each),
          frame: Boolean(frame),
          hero: Boolean(hero),
        };
        const command = { biome, view, level, rounds, rarity: options.rarity, ...switches };
        reports.push(await side.command('sceneCost', command));
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
