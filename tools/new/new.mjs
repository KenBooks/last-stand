// `npm run new -- <kind> <id> [--like <sibling>]`: starts a piece of content (a foe, a boss, a house, a place, a
// screen, a lab command) as a copy of a sibling's files under its own id, and says what is left to do
// (tools/new/README.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS } from './kinds.mjs';
import { copiesFor, copyProblem, idProblem, marked, renamed } from './scaffold.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The repo's files, as the scaffold reads them: paths from the root, `/` between folders. */
const REPO_FILES = {
  exists: (/** @type {string} */ file) => fs.existsSync(path.join(ROOT, file)),
  list: (/** @type {string} */ folder) => fs.readdirSync(path.join(ROOT, folder)).sort(),
};

/** The command line's usage, with every kind and its default sibling. */
function usage() {
  const kinds = Object.entries(KINDS).map(([name, kind]) => `  ${name.padEnd(12)} like ${kind.like}`);
  return ['usage: npm run new -- <kind> <id> [--like <sibling>]', '', 'kinds:', ...kinds].join('\n');
}

/** Stops with a message and the usage. @param {string} message @returns {never} */
function fail(message) {
  console.error(`${message}\n\n${usage()}`);
  process.exit(1);
}

/** The command line read: the kind, the id and the sibling. @param {string[]} args */
function readArgs(args) {
  const likeAt = args.indexOf('--like');
  const like = likeAt >= 0 ? args[likeAt + 1] : undefined;
  const rest = likeAt >= 0 ? args.filter((_, i) => i !== likeAt && i !== likeAt + 1) : args;
  if (rest.length !== 2) {
    fail('a kind and an id');
  }
  const [kindName, id] = rest;
  const kind = KINDS[kindName];
  if (!kind) {
    fail(`no kind "${kindName}"`);
  }
  return { kindName, kind, id, like: like ?? kind.like };
}

/**
 * Writes one copy, renamed and marked.
 * @param {import('./scaffold.mjs').Copy} copy
 * @param {string} like
 * @param {string} id
 */
function write(copy, like, id) {
  const text = fs.readFileSync(path.join(ROOT, copy.from), 'utf8');
  const target = path.join(ROOT, copy.to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, marked(copy.to, renamed(text, like, id), like));
}

function main() {
  const { kindName, kind, id, like } = readArgs(process.argv.slice(2));
  const problem = idProblem(id) ?? copyProblem(kind, like, id, REPO_FILES);
  if (problem) {
    fail(problem);
  }
  const copies = copiesFor(kind, like, id, REPO_FILES);
  for (const copy of copies) {
    write(copy, like, id);
    console.log(`wrote ${copy.to} (from ${copy.from})`);
  }
  console.log(`\nA new ${kindName}, "${id}", as a copy of ${like}. Left to do:`);
  for (const step of kind.todo) {
    console.log(`  - ${step.replaceAll('{id}', id)}`);
  }
  console.log('\nnpm run typecheck names each file still marked from the copy.');
}

main();
