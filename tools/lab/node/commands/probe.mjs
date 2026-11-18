// `npm run lab -- probe`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { labError } from '../errors.mjs';
import { REPO } from '../paths.mjs';
import { probeFiles } from '../probeFiles.mjs';
import { fixtureFrom, picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** A probe module's path relative to the repo, with forward slashes; throws unless it's a file under the repo. */
function probePath(file) {
  const path = relative(REPO, resolve(REPO, file));
  if (path.startsWith('..') || isAbsolute(path)) throw labError(`probe: ${file} is not under the repo`);
  if (!existsSync(join(REPO, path))) throw labError(`probe: there is no ${file}`);
  return path.split('\\').join('/');
}

/** `lab probe`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'runs a measure of your own on the lab\'s clock and set-ups',
  help: 'a probe module of your own: its default export takes the lab and the options (tools/lab/README.md)',
  argument: 'module',
  open: true,
  options: {
    setup: { kind: 'switch', help: 'set the run up first (=false: the probe sets up itself)' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    probePath(options._[0]);
  },
  async each(side, options) {
    const path = probePath(options._[0]);
    if (!side.isRepo) {
      for (const file of probeFiles(REPO, path)) {
        mkdirSync(dirname(join(side.root, file)), { recursive: true });
        cpSync(join(REPO, file), join(side.root, file));
      }
    }
    const fixture = options.setup === false ? null : fixtureFrom(options);
    return side.probe(path, options, fixture);
  },
  finish(results, options, session) {
    const name = basename(options._[0]).replace(/\.[^.]+$/, '');
    return textWithMoments(results, session.outFor(join('probes', name)), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
