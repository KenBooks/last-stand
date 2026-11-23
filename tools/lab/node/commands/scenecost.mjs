// `npm run lab -- scenecost`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, fixtureFrom, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab scenecost`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what each kind of work in the frame takes of the GPU at the screen\'s own pixels and a level\'s '
    + 'other settings, by the engine\'s clock (its own parts, the profile\'s: the point lights and lamps, the sun\'s '
    + 'shadow, the lit shading and its parts, the bloom, the depth drawn first...; and the particles, the hero, the '
    + 'grass, what\'s cut out or blended, each taken out in turns, each row with how far it may be off and "within '
    + 'the noise" where it says nothing: run it with the GPU loaded, `--screen 2880x1800@2`, or a strong GPU reads '
    + 'its idle clock\'s wander; `--each` each see-through mesh alone; `--hero` the hero\'s parts and a change of '
    + 'nothing; `--frame` the level\'s MSAA; `--biomes village` the lobby\'s village where he stands, its own parts '
    + 'too: its largest parts, the hall\'s heroes)',
  help: 'what each part of the frame takes of the GPU at the screen\'s own pixels and a level\'s other settings, '
    + 'by the engine\'s clock: its own parts (the lights, the shadows, the lit shading, the bloom...), the particles, '
    + 'the hero, what\'s cut out or blended, each taken out in turns within one page',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest', 'village'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest, or village (the lobby\'s, where --at and --facing stand him: the square, '
        + 'facing the hall, by default)',
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
    at: SETUP_OPTIONS.at,
    facing: SETUP_OPTIONS.facing,
    tune: SETUP_OPTIONS.tune,
    hour: {
      kind: 'number',
      usage: 'h',
      help: 'in the village, the hour it\'s lit for (0 to 24: by night its lamps are lit, two casting shadows)',
    },
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
      help: 'time the level\'s MSAA too, on and off in turns (WebGPU draws 1 or 4 samples a pixel: the engine '
        + 'draws 2 as one, and says so)',
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
        const place = { at: options.at, facing: options.facing, hour: options.hour, tune: fixtureFrom(options).tune };
        const command = { biome, view, level, rounds, rarity: options.rarity, ...place, ...switches };
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
