// `npm run lab -- village`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { REPO } from '../paths.mjs';
import { villageSince } from '../villageSince.mjs';
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab village`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the lobby\'s village as a player walks it: every object usable from its stand, walks and ways, the grass '
    + 'and the lamps by quality, the light at midnight, the fog from above, the hall and the houses (`--only`; in '
    + 'full in `commands/village.md`)',
  variants: {
    '--only signpostsReadable': 'the signposts, each arm pointing where its name leads, each post off the paving, the '
      + 'paths and what stands, each arm read face on from the paving near it (`--canary` turns an arm and stands a '
      + 'post in a road)',
  },
  help: "the lobby's village as a player walks it: every object usable from its stand, casting in the yard alone, "
    + "no walk out past the palisade or along a way out, the stair up to the hall, the first visit's training ticked "
    + "step by step with the portal shut till it's done or skipped, and no program compiled as the hour changes",
  options: {
    canary: {
      kind: 'switch',
      help: "a fault planted for each check (an object's stand moved, the yard read outside it, a hero put past the "
        + 'palisade, the stair walked at beside it, the notice board left unread, a new material at noon): all '
        + 'must be found',
    },
    only: {
      kind: 'text',
      usage: 'names',
      help: 'only the checks whose names have any of these in them (lampsAlike,hallWalls): the whole takes minutes',
    },
    shard: {
      kind: 'text',
      usage: 'k/n',
      help: 'the k-th of n shards of the checks asked for, every n-th from the k-th (lab check --commands village '
        + 'runs them side by side)',
    },
    times: { kind: 'switch', help: 'each check\'s time by the browser\'s clock, in lines after the rest' },
    since: {
      kind: 'text',
      usage: 'ref',
      help: 'only the checks the files changed since this ref can touch (origin/main; node/villageSince.mjs says '
        + 'which): while working on a change; the whole suite before a push (lab check --commands village)',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (!options.since) return;
    if (options.only) throw labError('village --since: it chooses the checks itself; no --only');
    const chosen = villageSince(options.since, REPO);
    for (const line of chosen.why) console.log(`lab: village --since ${options.since}: ${line}`);
    if (!chosen.all && chosen.names.length === 0) {
      throw labError(`village --since ${options.since}: nothing changed that a check reads`);
    }
    const said = chosen.all ? 'every check' : `${chosen.names.length} checks: ${chosen.names.join(', ')}`;
    console.log(`lab: village --since ${options.since}: ${said}`);
    // (each by its whole name: `only` takes any name with one of these in it)
    options.only = chosen.all ? undefined : chosen.names.join(',');
  },
  each(side, options) {
    const { only, shard } = options;
    return side.command('village', { canary: Boolean(options.canary), only, shard, times: Boolean(options.times) });
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('village'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
