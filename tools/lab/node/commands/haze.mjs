// `npm run lab -- haze`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab haze`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s held weapons\' light through the eyes (each way he looks: their surface blown out near white, '
    + 'their bloom past it, and the frame round them darkened by the adaptation to them)',
  help: 'the hero\'s held weapons\' light through the eyes (or his hands\', or over the shoulder: --part, --view): '
    + 'the frame drawn with them and without, each with the '
    + 'grade\'s adaptation and without it; their surface near white (glare over 5% of it is a problem), their '
    + 'bloom past it (over 0.5% of the frame), and any pixel outside their own darkened by their light (the '
    + 'adaptation to a bright area spread round them as a veil; over 0.5% of the frame): tools/lab/out/haze (the '
    + 'frame, and its map: glare yellow, bloom pink, haze red)',
  options: {
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome (the forest by default)',
    },
    part: {
      kind: 'choice',
      choices: ['weapons', 'hands'],
      usage: 'weapons|hands',
      help: 'what\'s measured: the held weapons (by default), or the hands (the mage\'s glowing one)',
    },
    view: {
      kind: 'choice',
      choices: ['first', 'third'],
      usage: 'first|third',
      help: 'the view: through the eyes (by default), or over the shoulder',
    },
    facings: {
      kind: 'list',
      usage: 'a,b',
      default: '0,90,180,270',
      help: 'the ways the hero looks, degrees (0 is +z)',
    },
    pictures: { kind: 'switch', help: 'picture each frame and its haze (=false: the numbers alone)' },
    canary: {
      kind: 'switch',
      help: 'plant the faults the measures must catch: the frame with the weapons drawn at 0.8 of its exposure '
        + '(a haze), and the weapons lit white (a glare and its bloom)',
    },
    gear: SETUP_OPTIONS.gear,
    weapon: SETUP_OPTIONS.weapon,
    at: SETUP_OPTIONS.at,
    rarity: SETUP_OPTIONS.rarity,
    ...COMMON_OPTIONS,
  },
  check(options) {
    const wrong = options.facings.find((facing) => !Number.isFinite(Number(facing)));
    if (wrong !== undefined) throw labError(`haze --facings: ${wrong} is not a number of degrees`);
  },
  each(side, options) {
    const command = {
      biome: options.biome ?? 'forest',
      part: options.part ?? 'weapons',
      view: options.view ?? 'first',
      facings: options.facings.map(Number),
      gear: options.gear,
      weapon: options.weapon,
      at: options.at,
      rarity: options.rarity,
      pictures: options.pictures !== false,
      canary: Boolean(options.canary),
    };
    return side.command('haze', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('haze'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
