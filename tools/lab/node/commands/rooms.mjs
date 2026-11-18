// `npm run lab -- rooms`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab rooms`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'Play together\'s rooms end to end against a co-op relay of the lab\'s own (server/relay on localhost; '
    + 'once: `npm ci --prefix server/relay`), the command\'s page hosting and a partner\'s joining, every step their '
    + 'own clicks and typing (a public room opened from the create page, listed in the partner\'s browser with its '
    + 'host, name, map and size, joined from its row, the relay counting two, gone once its host left; a password '
    + 'room listed locked, its password nowhere in the list, a wrong password turned away with the dialog asking for '
    + 'it, the right one let in; a private room never listed, joined by its code; both pages pictured at `--screen` '
    + 'in `out/rooms/<screen>`; `--canary` starts the relay letting any password in and listing private rooms)',
  help: 'Play together\'s rooms end to end against a co-op relay of the lab\'s own (server/relay on localhost): a '
    + 'public room opened from the create page, listed in a partner\'s browser and joined from its row, gone once '
    + 'its host left; a password room listed locked, a wrong password turned away and the right one let in; a '
    + 'private room never listed, joined by its code; pictures in out/rooms/<screen>',
  options: {
    canary: { kind: 'switch', help: 'start the relay letting any password in and listing private rooms' },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    // (a relay of the lab's own, server/relay: its packages installed by npm ci --prefix server/relay)
    const { runRooms } = await import('./rooms.mjs');
    return runRooms(side, { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
