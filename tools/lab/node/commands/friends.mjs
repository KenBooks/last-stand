// `npm run lab -- friends`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab friends`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'co-op\'s friends end to end, three games against a saves service and a relay of the lab\'s own (a friend '
    + 'code asked and accepted, a friend\'s room joined from the list, an invite joined from its toast, a room kept '
    + 'from friends shown with no Join, every picture\'s text checked for text drawn over other text; `--canary` a '
    + 'request counted as a friendship, a hidden room shown and the room\'s cards laid out as before #700\'s review)',
  help: 'co-op\'s friends end to end, three games against a saves service and a co-op relay of the lab\'s own: '
    + 'cloud save accounts made by each page\'s passkey, a friend code typed and its request accepted from its row, '
    + 'a friend\'s private room shown online in the list and joined from it, a friend invited from the room and '
    + 'the invite joined from its toast, a room kept from friends shown with no Join; pictures in out/friends/<screen>',
  options: {
    canary: {
      kind: 'switch',
      help: 'start the saves service counting a request as a friendship and showing hidden rooms, and lay the room\'s '
        + 'cards out with their text run on',
    },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    // (a saves service and a relay of the lab's own: their packages installed by npm ci --prefix server/saves and
    // server/relay)
    const { runFriends } = await import('../friends.mjs');
    return runFriends(side, { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
