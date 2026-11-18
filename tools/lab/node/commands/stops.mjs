// `npm run lab -- stops`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab stops`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero coming to a stop from a run as a person stops (runs let go at different points of a stride, on '
    + 'level ground, drawn and by the dais\'s edges: the steps once still, a foot put out and drawn back, steps back, '
    + 'a foot on another level than the body\'s or stepped onto one once still, `--trace`, `--only`)',
  help: 'the hero coming to a stop from a run, judged as a person stops: the steps once still, a foot put out and '
    + 'drawn back, a step back, a foot off the body\'s level, on level ground and by the dais\'s edge',
  options: {
    scenarios: {
      kind: 'list',
      usage: 'a,b',
      choices: ['level', 'drawn', 'edgeOut', 'edgeIn', 'edgeSlant', 'edgeAlong', 'edgeShot'],
      help: 'the scenarios (all by default): level, drawn, edgeOut, edgeIn, edgeSlant, edgeAlong, edgeShot',
    },
    frames: { kind: 'switch', help: 'list every stop: where it rested, each step after the keys were let go' },
    trace: { kind: 'switch', help: 'with --frames, each frame of each stop along the way from where it rested' },
    only: { kind: 'text', usage: 'name', help: 'only the stops whose names contain this (d 23, 12 cm out)' },
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  each(side, options) {
    const listed = { frames: Boolean(options.frames), trace: Boolean(options.trace) };
    return side.command('stops', { scenarios: options.scenarios, only: options.only, ...listed });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
