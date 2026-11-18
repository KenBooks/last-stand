// The kinds of content `npm run new` starts: where each one's files sit, the sibling copied by default, and what is
// left to do once they're copied (tools/new/AGENTS.md).

/**
 * A kind of content: its files, one path a template of `{id}`, and what is left once they're copied.
 * @typedef {object} Kind
 * @property {string} like the sibling copied when `--like` isn't given
 * @property {string[]} files each file's path, `{id}` standing for the content's id (a path ending in `/` is a folder)
 * @property {string[]} optional of `files`, those a sibling may have none of (a place with no build of its own)
 * @property {string[]} todo what is left to do once the files are copied, in the order to do it
 */

/** Every kind `npm run new` starts, by the name given on its command line. @type {Record<string, Kind>} */
export const KINDS = {
  boss: {
    like: 'thornheart',
    files: ['src/data/foes/{id}.ts', 'src/entities/bosses/{id}.ts'],
    optional: [],
    todo: [
      'its stats, guide words and trophy in src/data/foes/{id}.ts, its model in src/entities/bosses/{id}.ts',
      'the biome it ends: its `boss` in src/data/biomes.ts',
      'its phases and moves through enemyAI\'s fx (src/entities/AGENTS.md); loaded at its wave (game/bossReady.ts)',
      'a sound of its own, if any: src/core/sounds/<name>.ts',
    ],
  },
  foe: {
    like: 'imp',
    files: ['src/data/foes/{id}.ts', 'src/entities/foes/{id}.ts'],
    optional: [],
    todo: [
      'its stats, guide words and trophy in src/data/foes/{id}.ts',
      'its model: a builder in src/entities/models/, registered by src/entities/foes/{id}.ts',
      'the biomes it fights in: their rosters in src/data/biomes.ts',
      'a sound of its own, if any: src/core/sounds/<name>.ts',
    ],
  },
  house: {
    like: 'records',
    files: ['src/data/houses/{id}.ts', 'src/world/houses/{id}.ts'],
    optional: ['src/world/houses/{id}.ts'],
    todo: [
      'a cottage no other house takes (`cottage` in src/data/houses/{id}.ts), its room\'s size and its objects',
      'its room built by src/world/houses/{id}.ts, from the rooms\' kit (src/world/rooms.ts)',
      'the rooms\' indices moved: a line of its own in net/protocol.ts\'s PARTS (src/net/AGENTS.md)',
      'each object\'s use registered by its owner (`villageUse`, src/game/villageUses.ts)',
      'its lane and back stop in the lab\'s walk through every room (tools/lab/page/houses.ts)',
    ],
  },
  'lab-command': {
    like: 'eval',
    files: ['tools/lab/node/commands/{id}.mjs'],
    optional: [],
    todo: [
      'its options and work in tools/lab/node/commands/{id}.mjs (tools/lab/node/commands/AGENTS.md)',
      'its page side, a module for each function it calls: tools/lab/page/commands/ (its AGENTS.md)',
      'its line in COMMANDS.md: npm run lab -- docs',
    ],
  },
  place: {
    like: 'notice',
    files: ['src/data/places/{id}.ts', 'src/world/places/{id}.ts'],
    optional: ['src/world/places/{id}.ts'],
    todo: [
      'its spot on the village\'s plan (src/data/village.ts), read by src/data/places/{id}.ts',
      'its use registered by its owner (`villageUse`, src/game/villageUses.ts)',
      'a build of its own, if any: src/world/places/{id}.ts (`build(kit)`, src/world/placeKit.ts)',
      'what the village\'s checks see of it: npm run lab -- village --since origin/main',
    ],
  },
  screen: {
    like: 'talk',
    files: ['src/ui/screens/{id}/'],
    optional: [],
    todo: [
      'its module, markup and styles in src/ui/screens/{id}/ (src/ui/AGENTS.md); it registers itself (`screen`)',
      'what opens it, and Esc closing it if it\'s a dialog (`dialog`, src/ui/dialogs.ts)',
      'its fit on every screen: a ui state of its own (tools/lab/page/uiStates/), npm run lab -- ui --screens',
    ],
  },
};
