// `npm run lab -- tiles`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithSheetsByGroup } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab tiles`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'how big each repeated map\'s tile comes out on each surface of a biome, in metres along u and v, how '
    + 'stretched and its pixels a metre (a surface\'s UVs decide it: size a map\'s repeat by it); `--pictures` shows '
    + 'each surface as the player meets it',
  help: 'how big each repeated map\'s tile comes out on each surface of a biome: the metres a tile covers along u '
    + 'and v over the surface\'s triangles (the middle, a tenth to nine tenths of its area), how stretched it is '
    + 'and the map\'s pixels a metre',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    maps: { kind: 'list', usage: 'a,b', help: 'the maps, by their recipe\'s name (every repeated map by default)' },
    pictures: {
      kind: 'switch',
      help: 'each surface pictured as the player meets it: its point nearest the arena\'s middle, at a hero\'s height, '
        + 'from 2 m out, a sheet a biome',
    },
    canary: {
      kind: 'switch',
      help: 'a board 2 m by 0.5 m laid in each biome, its map repeated twice along u (it must read 1 m by 0.5 m)',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      biomes: options.biomes,
      maps: options.maps,
      pictures: Boolean(options.pictures),
      canary: Boolean(options.canary),
    };
    return side.command('tiles', command);
  },
  finish(results, options, session) {
    return textWithSheetsByGroup(results, session.outFor('tiles'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
