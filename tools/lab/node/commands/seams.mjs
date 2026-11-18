// `npm run lab -- seams`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab seams`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s sewn seams as he moves (every point two skinned pieces share as built, a sleeve\'s top in its '
    + 'armhole, followed standing, walking, attacking and through each skill: the pieces over 2 mm apart there an '
    + 'open seam, and their normals over 6 degrees apart as built a line in the light)',
  help: 'the hero\'s sewn seams as he moves (a sleeve\'s top in its armhole): every point two skinned pieces of '
    + 'him share as built, followed standing, walking, attacking and through each skill\'s cast, and how far apart '
    + 'the pieces are there as drawn (over 2 mm, an open seam: the body seen through it)',
  options: {
    each: { kind: 'switch', help: 'list every seam\'s worst gap, not the four worst' },
    canary: { kind: 'switch', help: 'plant a fault the measure must catch: a sewn piece moved 1 cm for a frame' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('seams', { each: Boolean(options.each), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
