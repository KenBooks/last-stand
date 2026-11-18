// `npm run lab -- denied`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab denied`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the sound a press that casts nothing makes (#572: a skill pressed while it cools, held, mashed no faster '
    + 'than its throttle, short of energy, a channel short of energy, an aimed skill let go while it cools: each '
    + 'heard once as a knock or a fizzle; ready, in free casting and for a partner\'s copy, nothing; `--canary` '
    + 'breaks the throttle)',
  help: 'the sound a press that casts nothing makes (#572): a skill on a key pressed while it cools (a knock, '
    + 'once), held down while it cools (once), mashed while it cools (no more often than the player\'s throttle, '
    + 'and not muted), short of energy (a fizzle), ready (none, and it casts) and in free casting (none); a channel '
    + 'held short of energy, an aimed skill let go while it cools, and a partner\'s copy (none)',
  options: {
    canary: {
      kind: 'switch',
      help: 'break the throttle, which the mashing must catch',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('denied', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
