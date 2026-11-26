// `npm run lab -- tavern`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';
import { labError } from '../errors.mjs';

/** `lab tavern`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the tavern\'s keeper and his ale (`--class`: his tasks run and pictured; talked to by E, the card within '
    + 'the window and a free beer its first reply; the beer poured and slid across, waiting on the bar, taken up by E and '
    + 'put down or drunk by its choice, standing still with W held or sat on a bar stool, the mug in his hand and its rim '
    + 'at his lips at each swallow; the ale\'s health boost through a run; his shirt\'s stripes across its seams; every '
    + 'mug accounted for every '
    + 'frame, taken empty, set down, collected, washed, dried and shelved, running out of clean mugs and of all of them; '
    + 'his planted feet never sliding, his hands never jumping, his body never in a counter, no mug in the air; the '
    + 'drink through the eyes, the mug in view at every beat; engine pipeline requests on the frames drawn; '
    + '`--parts eyes,seated,touch,cost,boost` for focused checks; `--canary` plants regressions; '
    + 'in co-op `coop --scenarios tavern`; in full in `commands/tavern.md`)',
  help: "the tavern's keeper and his ale: his tasks, the beer poured, slid across and drunk standing still, every mug "
    + 'accounted for every frame, his feet, hands and body against the counters, and the drink through the eyes',
  options: {
    canary: { kind: 'switch', help: 'the ale made a cast he may walk through, which must be caught' },
    looks: { kind: 'switch', help: 'the keeper pictured from the angles of Kenneth\'s round 3 alone (page/keeperLooks.ts)' },
    round5: {
      kind: 'switch',
      help: 'with --looks: round 5\'s moments alone as the player sees them; with --canary too, as they were before it',
    },
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: ['eyes', 'seated', 'touch', 'cost', 'boost'],
      help: 'run only the named checks: first-person or seated drinking, touch buttons, room costs, or ale in a run',
    },
    ...COMMON_OPTIONS,
  },
  check({ parts, looks, round5, canary }) {
    if (parts && (looks || round5)) throw labError('tavern: --parts cannot be combined with --looks or --round5');
    if (parts?.includes('cost') && canary) throw labError('tavern: the cost check has no separate canary');
  },
  each(side, options) {
    const { canary, looks, round5, parts } = options;
    return side.command('tavern', { canary: Boolean(canary), looks: Boolean(looks), round5: Boolean(round5), parts });
  },
  // (its moments written: the keeper's tasks, the talk, the steps of a mug's round, the drink and its first person)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('tavern'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
  countsCompiles: true,
};
