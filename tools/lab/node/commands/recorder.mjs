// `npm run lab -- recorder`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab recorder`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the always-on performance recorder costs a frame in a fight (its calls timed against 0.05 ms a '
    + 'frame), the trace a send would make of it, sent to a traces service of the lab\'s own and read back with its '
    + 'token',
  help: 'what the always-on performance recorder (src/perf) costs a frame: a fight played with the foes coming '
    + 'and every frame drawn, each of its calls timed by the browser\'s clock against a budget of 0.05 ms a '
    + 'frame; then the trace a send would make of it, packed, gzipped and read back as lab trace reports it',
  options: {
    frames: { kind: 'number', usage: 'n', help: 'the frames played and timed (300 by default)' },
    canary: { kind: 'switch', help: 'each frame\'s recording made 0.2 ms slower: it must break the budget' },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.frames !== undefined && !(options.frames >= 60)) throw labError('recorder --frames: 60 or more');
  },
  async each(side, options) {
    // (a traces service of the lab's own, for the page's origin: the trace sent and read back as a report goes)
    const { checkSent, startTracesService } = await import('../tracesService.mjs');
    const service = await startTracesService(new URL(side.url).origin);
    try {
      const command = { frames: Math.round(options.frames ?? 300), canary: Boolean(options.canary), send: service.url };
      return await checkSent(await side.command('recorder', command), service);
    } finally {
      await service.close();
    }
  },
  textOf: asText,
  problemsOf: problemsIn,
};
