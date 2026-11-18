// The lab's commands as the session runs them (tools/lab): those with work to do on a side, each a module in
// node/commands/ with its options (read and checked by options.mjs), and the pages a check may run each on.
import { COMMANDS as EVERY_COMMAND } from './options.mjs';

/** the set-up from the options, and a `--quality` read, which the session and `live` take from here too */
export { fixtureFrom, qualityOf } from './commandKit.mjs';

/** Whether a command (`[name, command]`) runs on a page: has work to do on a side. */
const runsOnAPage = ([, command]) => typeof command.each === 'function';

/**
 * The commands that run on a page, by name, from their modules in `node/commands/` (options.mjs `COMMANDS`):
 * - `check(options)`, when there is one, throws at what's wrong with them before anything boots;
 * - `each(side, options, session)` runs it on one side (its page booted) and returns its result;
 * - `finish(results, options, session)`, when there is one, puts the sides' results together as text (else each
 *   side's text is shown under its name): `results` pairs each turn (`session.turnsFor`: its `name`, and the
 *   `filePrefix` its files' names start with) with its result;
 * - `textOf(result)` is the result as text, which an A/B compares line by line;
 * - `problemsOf(result)` the problems it found, which fail the command;
 * - `countsOf(result)`, when there is one, what it counted by name, which a check adds up over a hero's jobs;
 * - `pictures(before, after)` pairs the pictures an A/B compares, for a command that takes them;
 * - `countsCompiles`, for a command that counts the shaders compiled after loading: a check runs it on a kept page
 *   only while the page has compiled nothing since it loaded (side.mjs `ready`);
 * - `keepsPage` (true, `'own'`, or either by the options), for a command a check may run on a page jobs before it
 *   ran on (`pageKind`), each of its set-ups in a check building the hero afresh from the boot's storage in a run of
 *   its own (`afresh`): one whose results were shown to be the same there as on a page booted for each job, with
 *   `lab check --reuse=false` and `--like`. True: a page any such command ran on; `'own'`: one its own jobs alone ran
 *   on (on a page kept from the gait's and the eyes' jobs, Twin Fangs' blows dealt 10 to 40 more; a cast after
 *   other casts, once the biomes' emitters started again at each set-up, src/world/runPhase.ts). `log` runs on pages
 *   of its own: it lists the game's clock, which runs on through its cases there (each set-up afresh starts it again),
 *   and its cases follow on from each other.
 */
export const COMMANDS = Object.fromEntries(Object.entries(EVERY_COMMAND).filter(runsOnAPage));

/**
 * The pages a check may run `command` with `options` on, as its `keepsPage` says: `'shared'`, a page any command
 * that shares pages ran on; the command's name, a page its own jobs alone ran on; or null, a page booted for it.
 */
export function pageKind(command, options) {
  const keeps = COMMANDS[command]?.keepsPage;
  const says = typeof keeps === 'function' ? keeps(options) : keeps;
  if (says === 'own') return command;
  return says ? 'shared' : null;
}
