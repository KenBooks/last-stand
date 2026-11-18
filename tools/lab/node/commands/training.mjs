// `npm run lab -- training`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/**
 * `runTrainingCoop` (trainingCoop.mjs), imported as the command runs: it loads co-op's link (coop.mjs),
 * which the command line, reading every command, never needs.
 */
async function runTrainingCoop(...args) {
  const { runTrainingCoop: run } = await import('../trainingCoop.mjs');
  return run(...args);
}

/** `lab training`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'Training grounds (#405): attempted-wave persistence/migration, the village\'s ghost talked to and its '
    + 'card\'s battleground and wave controls, harmless projections, no rewards or records, repeat and leave; '
    + '`--canary` plants ordinary damage and a solid ghost.',
  help: 'training grounds: reached-wave saves and migration, host choices, harmless holograms, no rewards, '
    + 'repeat and leave; includes a normal-run damage control',
  options: {
    coop: { kind: 'switch', help: 'two real peers: host unlocks, immunity, rewards, repeat and leave' },
    canary: { kind: 'switch', help: 'plant ordinary damage in training and verify it is detected' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    if (options.coop) return runTrainingCoop(side, options);
    return side.command('training', { canary: Boolean(options.canary) });
  },
  // (its moments written: the ghost's card at the yard's gate, the projections, the wave cleared)
  finish(results, options, session) {
    if (options.coop) return results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
    return textWithMoments(results, session.outFor('training'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
