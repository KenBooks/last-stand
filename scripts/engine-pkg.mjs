// Checks the engine's build (src/engine/pkg, Bulwark's wasm-bindgen output) names the Bulwark commit it was built
// from: `pkg/BUILT_FROM` holds that commit's full id, and a branch that changes the build changes it too. The build's
// glue is generated (its names are places in the wasm's function table, renumbered by every build), so its diff
// says nothing and a conflict in it is settled by building again, never by merging its lines: the stamp is what a
// reviewer reads. `node scripts/engine-pkg.mjs [base]` (base: origin/main by default).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** the engine's build, as the repository holds it */
export const PKG = 'src/engine/pkg/';
/** the file that names the Bulwark commit the build was made from */
export const STAMP = `${PKG}BUILT_FROM`;
const FULL_ID = /^[0-9a-f]{40}$/;

/** What's wrong with a stamp's text (empty when it names a commit by its full id). */
export function stampProblems(text) {
  const id = text.trim();
  if (FULL_ID.test(id)) return [];
  return [`${STAMP} must hold the Bulwark commit's full id (40 hex digits), not "${id}"`];
}

/** What's wrong with a branch's changed files: the build changed without its stamp. */
export function changeProblems(changed) {
  const built = changed.filter((file) => file.startsWith(PKG) && file !== STAMP);
  if (built.length === 0 || changed.includes(STAMP)) return [];
  const named = built.join(', ');
  return [`the engine's build changed (${named}) but ${STAMP} didn't: write the Bulwark commit it was built from`];
}

/** The files changed since where the branch left `base`. */
function changedSince(base) {
  const since = execFileSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' }).trim();
  const listed = execFileSync('git', ['diff', '--name-only', since, 'HEAD'], { encoding: 'utf8' });
  return listed.split('\n').filter(Boolean);
}

function main() {
  const base = process.argv[2] ?? 'origin/main';
  const problems = [...stampProblems(readFileSync(STAMP, 'utf8')), ...changeProblems(changedSince(base))];
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(`the engine's build names Bulwark ${readFileSync(STAMP, 'utf8').trim().slice(0, 12)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
