// `npm run lab -- check`: its command line (help, options) (node/commands/AGENTS.md).
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab check`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'runs every hero\'s checks of a change to how they move side by side (`--ab`: against main, its side kept '
    + 'once it has run; each gait scenario from three starts, its turns at other points of a stride, as a frame\'s '
    + 'change anywhere sends a scenario\'s later strides elsewhere: judge a change on the counts over all of them, '
    + 'each side\'s in the log; a page kept from job to job where that was shown to change nothing, `--reuse=false` '
    + 'and `--like` to show it again; `--plan` the jobs\' order and end, `--only` some of them)',
  help: 'the checks of a change to how the heroes move, every hero\'s, side by side in sessions of their own: the '
    + 'gait (its steps listed, no films), the stops, the ranges and the run\'s form for each hero, the ranger\'s '
    + 'feet and carry, the warrior\'s basic attack through the eyes with each weapon each way he holds it (a row '
    + 'with the canaries, a short and a long pause) and his other skills with each weapon that takes them, and '
    + 'each of his skills cast through the eyes for its light and flashes, on each way\'s first weapon, every '
    + 'swing of each weapon stepped between its keys, and the foes his charge sweeps up; each report in '
    + 'tools/lab/out/check/<command>-<hero>.txt (runs in this process, not the server)',
  options: {
    classes: { kind: 'list', usage: 'a,b', help: 'the heroes (warrior, mage, ranger by default)' },
    commands: {
      kind: 'list',
      usage: 'a,b',
      choices: [
        'gait', 'stops', 'range', 'form', 'feet', 'carry', 'eyes', 'cast', 'swing', 'rush', 'hits', 'log', 'village',
      ],
      help: 'the commands (gait, stops, range, form, feet, carry, eyes, cast, swing, rush, hits, log by default; '
        + 'village: the village\'s checks in shards side by side, 8 unless --shards says, only when named)',
    },
    jobs: {
      kind: 'number',
      usage: 'n',
      help: 'how many sessions side by side (a core in three, at most 8; asked for, as many as said: 16 on a '
        + 'PC lent whole)',
    },
    shards: {
      kind: 'number',
      usage: 'n',
      help: 'how many shards the village\'s checks run in (8 by default, at most 24), each about as long as '
        + 'the others by the checks\' measured times',
    },
    share: {
      kind: 'text',
      usage: 'k/n',
      help: 'this PC\'s share of the jobs, every n-th from the k-th: one check on two PCs at once, 1/2 here '
        + 'and 2/2 on the lent one',
    },
    starts: {
      kind: 'number',
      usage: 'n',
      help: 'how many moments each gait scenario starts from, its counts added up (5 by default, at most 8)',
    },
    reuse: {
      kind: 'switch',
      help: 'each session\'s page kept for its next job of the same side and hero (=false: a page booted for each '
        + 'job, to show the reports come out the same)',
    },
    only: {
      kind: 'text',
      usage: 'text',
      help: 'only the jobs whose name has this in it, or any of these (eyes-warrior-dual: the eyes\' jobs with '
        + 'two weapons; hits,gait-warrior-run)',
    },
    plan: {
      kind: 'switch',
      help: 'run nothing: the order the sessions would take the jobs in and when each would be done, by what each '
        + 'took last time (tools/lab/out/check/durations.json)',
    },
    like: {
      kind: 'text',
      usage: 'dir',
      help: 'every report compared line by line with the one of its name in dir (a copy of an earlier check\'s '
        + 'tools/lab/out/check), how each run went aside: fails on any that differs',
    },
    ab: COMMON_OPTIONS.ab,
    fresh: COMMON_OPTIONS.fresh,
  },
};
