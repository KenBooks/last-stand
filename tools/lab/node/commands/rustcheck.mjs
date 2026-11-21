// `npm run lab -- rustcheck`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab rustcheck`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the first play of the preview of the Rust engine found wrong, each held as a check on the page a '
    + 'player gets (the plain address): the engine drawing and offered alone, every shown object where its '
    + 'position puts it, the shelter of the hall set in the village and gone in a fight, a house walked into, out '
    + 'of and into again with no frame held and three drawing nothing of its own, a canvas nothing has drawn on '
    + 'taken as a map, every foe of a fight drawn, and each skill on the keys of the hero held with nothing of it '
    + 'left undrawn (`--class` whose; run it for each)',
  help: 'the Rust engine held to what the first play of its preview found wrong',
  options: {
    biome: { kind: 'choice', choices: ['crypt', 'forest'], usage: 'crypt|forest', help: 'the fight\'s biome (forest)' },
    room: { kind: 'text', usage: 'id', help: 'the house walked into and out of (library)' },
    foes: { kind: 'number', usage: 'n', help: 'foes stood before the hero in the fight (6)' },
    ...COMMON_OPTIONS,
  },
  check(options) {
    // (the engine's page, on the address a player gets: `RENDERER_QUERIES` in side.mjs)
    options.renderer = 'rust';
  },
  async each(side, options) {
    const command = {
      biome: options.biome ?? 'forest',
      room: options.room ?? 'library',
      foes: Math.round(options.foes ?? 6),
    };
    return side.command('rustCheckHere', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('rustcheck'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
