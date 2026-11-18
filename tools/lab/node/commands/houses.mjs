// `npm run lab -- houses`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab houses`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the village\'s houses walked into and out of by E held at their doors in each view (a tap taking him '
    + 'nowhere, the prompt naming the house and filling; no two faces round a door inside in one plane; the room '
    + 'shown, the village and the yard\'s dummies not, every frame drawn and no program compiled, its cut away walls, '
    + 'a walk held in by its back wall, the trophies for the bosses beaten alone, the ledger\'s card within the '
    + 'window, the party table opening Play together, the library\'s Codex opening the guide, its scholar talked to '
    + 'and his card within the window, out before the cottage\'s door, the yard\'s dummies still on their spots, and '
    + 'the square and yard pictured after); `--canary` compiles a program going in, keeps the dummies in the room\'s '
    + 'walls, leaves the room drawn going out, makes the hold a press, lays a sheet in the door frame, makes the talk '
    + 'card wider than the window and lets the room\'s zoom go (from above in a room, the wheel out and in kept to '
    + 'its range, his own zoom given back out of it). `coop --scenarios houses`: the guest goes into the tavern, the '
    + 'host\'s game shows his name over its door, a dot at it on the minimap and his name under it on the map, all '
    + 'gone as he comes out (`node/coopHouses.mjs`, `page/coopHouses.ts`; `--canary` takes the marker away).',
  help: "the village's houses walked into and out of by E at their doors, in each view: the room shown in the "
    + "village's stead with no program compiled and the yard's dummies gone, its cut away walls, a walk held in "
    + "by its back wall, the house of records' trophies for the bosses beaten alone and its ledger's card, the "
    + "tavern's party table opening Play together, and out again before the cottage's door",
  options: {
    canary: {
      kind: 'switch',
      help: 'compile a program going in and leave the room drawn going out, which must be caught',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('houses', { canary: Boolean(options.canary) });
  },
  // (its moments written: each room as it shows in each view)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('houses'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
