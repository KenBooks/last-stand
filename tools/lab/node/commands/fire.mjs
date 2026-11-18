// `npm run lab -- fire`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab fire`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each biome\'s fire as the player meets it (read from beside it with its own light and without: how tall '
    + 'and wide it burns, its light and hue from its base up, what of it is blown out white, its tongues, the smoke '
    + 'over it, how it moves and swells, its flashes on the screen; its flames alone from round them, turning with '
    + 'the camera or holding their shape; the plants over it; from above, the flames over the logs in it; the '
    + 'see-through hole cutting it in two; `--cost` what its flames take of the GPU, `--levels` at each quality level '
    + 'within one page; pictured beside it, alone, from above, round it and in the game\'s views)',
  help: 'each biome\'s fire as the player meets it: read from beside it with its own light and without, how tall '
    + 'and wide it burns, its light and hue from its base up, what of it is blown out white, its tongues, the smoke '
    + 'over it, how it moves and swells, and the flashes it makes on the screen; its flames from round them, '
    + 'whether they turn with the camera; the plants over it; pictured beside it, alone, from above, round it and '
    + 'in the game\'s views: tools/lab/out/fire',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    seconds: { kind: 'number', usage: 's', default: '2', help: 'how long the fire is read for' },
    cost: {
      kind: 'switch',
      help: 'time what its flames take of the GPU in the top-down view, drawn and not in turns (its times differ '
        + 'from run to run, as the machine\'s load does)',
    },
    levels: {
      kind: 'switch',
      help: 'with --cost, its flames timed alone at each quality level in turn within one page, from beside them '
        + '(the look left unread, nothing pictured): on a commit whose fire is the same at every '
        + 'level, the rows\' spread is the noise',
    },
    canary: {
      kind: 'switch',
      help: 'plant the faults the measures must catch: a still flame, one drawn white, none drawn, a strobe on the '
        + 'screen, flames showing the same face from behind, a plant over the fire, and with --cost the flames '
        + 'drawn four times over',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (!(options.seconds > 0)) throw labError(`fire --seconds: ${options.seconds} is not a length of time`);
    if (options.levels && !options.cost) throw labError('fire --levels times the flames: it needs --cost');
  },
  async each(side, options) {
    // (a biome at a time, each on its own: its pictures sent back with it)
    const reports = [];
    for (const biome of options.biomes) {
      const command = {
        biome,
        seconds: options.seconds,
        cost: Boolean(options.cost),
        levels: Boolean(options.levels),
        canary: Boolean(options.canary),
      };
      reports.push(await side.command('fire', command));
    }
    return {
      text: reports.map((report) => report.text).join('\n'),
      problems: reports.flatMap((report) => report.problems),
      moments: reports.flatMap((report) => report.moments),
    };
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('fire'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
