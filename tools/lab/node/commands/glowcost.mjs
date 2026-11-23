// `npm run lab -- glowcost`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab glowcost`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the worn gear\'s rarity glow takes of a frame (the same frame drawn with it and, in turns within one '
    + 'page, off by the setting and on plain gear: the whole frame by the engine\'s GPU clock, each side proven by '
    + 'its pixels; `--scenes` the hero alone in each view, a party of four, the hall of heroes, a fight; `--cpu` the '
    + 'frame\'s work on a slowed CPU, with and without the glow\'s material copies; `--canary` the frame drawn twice)',
  help: 'what the worn gear\'s rarity glow takes of a frame: the same frame drawn with it and, in turns within one '
    + 'page, off by the setting and on plain gear, the whole frame timed by the engine\'s GPU clock and its work on '
    + 'the CPU by the browser\'s clock, each side proven by its pixels',
  options: {
    scenes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first', 'party', 'hall', 'fight'],
      default: 'top,third,first',
      help: 'the scenes: the hero alone in a view (top, third, first), a party of four close up, the hall of '
        + 'heroes, a fight (the biome\'s foes round him)',
    },
    biome: { kind: 'choice', usage: 'biome', choices: ['crypt', 'forest'], default: 'crypt', help: 'the biome' },
    level: {
      kind: 'choice',
      usage: 'level',
      choices: ['high', 'medium', 'low', 'verylow'],
      default: 'high',
      help: 'the quality level drawn at (with --boot of the same level, the heroes built at its detail too)',
    },
    rarity: { ...SETUP_OPTIONS.rarity, default: 'legendary' },
    rounds: { kind: 'number', usage: 'n', default: '12', help: 'the rounds of turns, each of 6 frames a side' },
    cpu: {
      kind: 'number',
      usage: 'n',
      default: '0',
      help: 'the frame\'s work timed on the CPU too, slowed this many times (1: as it is, 4: a mid-range '
        + 'phone, 6: a low-end one; 0: not timed), on a screen the GPU keeps up with',
    },
    canary: { kind: 'switch', help: 'draw the frame twice: it must read at least 1.6 times once' },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (!(options.rounds >= 1)) throw labError(`glowcost --rounds: ${options.rounds} is not a count of rounds`);
  },
  async each(side, options) {
    // (the hall leaves the run for the lobby: last, whatever the order asked)
    const scenes = [...options.scenes].sort((a, b) => (a === 'hall') - (b === 'hall'));
    const reports = [];
    for (const scene of scenes) {
      const { biome, level, rounds, rarity } = options;
      const command = { scene, biome, level, rounds, rarity, canary: Boolean(options.canary), cpu: options.cpu };
      reports.push(await side.command('glowCost', command));
    }
    return {
      text: reports.map((report) => report.text).join('\n'),
      problems: reports.flatMap((report) => report.problems),
      moments: reports.flatMap((report) => report.moments ?? []),
    };
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('glowcost'));
  },
  textOf: asText,
  problemsOf: problemsIn,
};
