// `npm run lab -- merchant`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab merchant`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'Odo\'s prices against the drop rates (no rarity sold from a wave where trading beats playing for it, none '
    + 'above epic) and his trade at his counter (the screen within the window, its three steps lit in turn and the '
    + 'stash dimmed till a ware is chosen, the legendary not offered, Auto-fill cheapest paying with rares, his full '
    + 'stock, a trade one common short held off and refused, one with enough made and saved, the stock one fewer, his '
    + 'restock after three runs; Odo pictured close and over the shoulder); `--canary` puts the piece bought back in '
    + 'his stock and leaves the stash dimmed with a ware chosen.',
  help: "Odo's trade at his counter: the screen within the window and his full stock, a trade one common short "
    + 'held off and refused, one with enough made (the gear given gone, his piece in the stash, the stock one '
    + 'fewer, saved), and his restock after three runs',
  options: {
    canary: { kind: 'switch', help: 'put the piece bought back in his stock, which must be caught' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('merchant', { canary: Boolean(options.canary) });
  },
  // (its moments written: the shop and the trade screen)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('merchant'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
