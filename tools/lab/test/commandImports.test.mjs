// Every module a command imports by a relative path is there (node/commands/): a command's heavier modules are
// imported as it runs, so a wrong path showed only when that command was run (`ui`, `profile`, `recorder` and
// `cloud --google` asked for `./tracesService.mjs` and `./googleWindow.mjs`, left beside them as the commands were
// split out of node/, where those modules still are), and none names itself (`cloud` and `rooms` asked for
// `./cloud.mjs` and `./rooms.mjs`, which beside them are the commands' own modules: "runCloud is not a function").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMMANDS_DIR = new URL('../node/commands/', import.meta.url);
/** a relative module named by a static `from '...'` or a dynamic `import('...')` */
const RELATIVE_IMPORT = /(?:from\s+|import\(\s*)'(\.{1,2}\/[^']+)'/g;

/** The relative modules `source` imports. */
function relativeImports(source) {
  return [...source.matchAll(RELATIVE_IMPORT)].map((match) => match[1]);
}

/** Each command module's relative imports that aren't there, or are the module itself, as `module -> path`. */
function missingImports() {
  const missing = [];
  for (const name of readdirSync(COMMANDS_DIR).filter((file) => file.endsWith('.mjs'))) {
    const source = readFileSync(new URL(name, COMMANDS_DIR), 'utf8');
    for (const path of relativeImports(source)) {
      const target = new URL(path, COMMANDS_DIR);
      const itself = target.href === new URL(name, COMMANDS_DIR).href;
      if (itself || !existsSync(fileURLToPath(target))) missing.push(`${name} -> ${path}`);
    }
  }
  return missing;
}

test('every module a command imports by a relative path is there', () => {
  assert.deepEqual(missingImports(), []);
});

test('relative imports are read from both forms, and nothing else', () => {
  const source = [
    "import { a } from '../a.mjs';",
    "const { b } = await import('./b.mjs');",
    "import { c } from 'node:fs';",
  ].join('\n');
  assert.deepEqual(relativeImports(source), ['../a.mjs', './b.mjs']);
});
