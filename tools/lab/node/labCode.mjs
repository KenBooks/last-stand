// The lab's code a command runs on an A/B's other side (tools/lab), for the key its result is kept under
// (sideCache.mjs): its page modules (`page/lab.ts`, the page functions its work calls, `page/commands/<fn>.ts`, and
// what they import or glob in turn: `ui`'s states, `page/uiStates/`), its own module (`node/commands/<name>.mjs`),
// the parts of `node/commandKit.mjs` it reaches and the modules it imports, how a page boots (`node/side.mjs`) and the scripts every page runs first
// (`node/browser.mjs`). Keyed on all of `page/` and the lab's tables whole, every lab PR (a measure added, a command's
// options) ran main's side of every job of a check again.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { labError } from './errors.mjs';
import { REPO } from './paths.mjs';

const PAGE = 'tools/lab/page';
const NODE = 'tools/lab/node';
/** the commands' modules, a file each (node/commands/AGENTS.md) */
const NODE_COMMANDS = `${NODE}/commands`;
/** the functions the commands call on the page, a file each (page/commands/AGENTS.md) */
const PAGE_COMMANDS = `${PAGE}/commands`;
/** what the commands share of their work: keyed by the parts of it a command reaches, not whole */
const COMMAND_KIT = `${NODE}/commandKit.mjs`;
/** the options the commands share: only how the command line reads them, whose values the key holds already */
const OPTION_KIT = `${NODE}/optionKit.mjs`;
/** a page function called by name (`side.command('gait', ...)`), and its name */
const PAGE_CALL = /\.command\(\s*'(\w+)'/g;

/** The code every command's side runs whatever it is: how its page boots (kept whole). */
const BOOT_FILES = [`${NODE}/side.mjs`];

/** a top-level declaration, and the name it declares */
const DECLARATION = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+|class\s+|const\s+|let\s+)(\w+)/;
/** a static import or re-export at run time (not `import type`), and its module; or a bare `import '...'` */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)[^;'"]*?from\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/gm;
/** a dynamic `import('...')`, and its module */
const DYNAMIC_IMPORT = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;
/** a Vite `import.meta.glob('./folder/*.ts')` (with or without its type), and its pattern */
const GLOB_IMPORT = /\bimport\.meta\.glob(?:<[^>]*>)?\(\s*['"](\.[^'"]+)['"]/g;

const read = (path) => readFileSync(join(REPO, path), 'utf8');
const mentions = (text, name) => new RegExp(`\\b${name}\\b`).test(text);

/** The relative modules `text` imports at run time, as written (`import type` and `export type` left out). */
export function runtimeImports(text) {
  const found = [];
  for (const match of text.matchAll(STATIC_IMPORT)) found.push(match[1] ?? match[2]);
  for (const match of text.matchAll(DYNAMIC_IMPORT)) found.push(match[1]);
  return found;
}

/**
 * A file's top-level parts by the name each declares (a function, a class, a `const` or a `let`), each with the doc
 * comment over it and every line up to the next part; `null` holds what comes before the first (the imports).
 */
export function partsOf(text) {
  const parts = new Map();
  let name = null;
  let lines = [];
  let docOpen = false;
  const flush = () => {
    parts.set(name, [parts.get(name), ...lines].filter((part) => part !== undefined).join('\n'));
    lines = [];
  };
  for (const line of text.split('\n')) {
    const declared = line.match(DECLARATION)?.[1];
    if (line.startsWith('/**')) {
      flush();
      name = undefined;
      docOpen = true;
    } else if (declared) {
      if (!docOpen) flush();
      name = declared;
      docOpen = false;
    }
    lines.push(line);
  }
  flush();
  parts.delete(undefined);
  return parts;
}

/** The parts of `parts` that `seed` mentions by name, and those they mention in turn: their texts, in file order. */
export function partsReached(parts, seed) {
  const reached = new Set();
  const queue = [seed];
  while (queue.length) {
    const text = queue.shift();
    for (const [name, body] of parts) {
      if (name === null || reached.has(name) || !mentions(text, name)) continue;
      reached.add(name);
      queue.push(body);
    }
  }
  return [...parts.keys()].filter((name) => reached.has(name)).map((name) => parts.get(name));
}

/** A page module's path from an import of it in `from` (both relative to the repo), or null outside `page/`. */
function pageModule(from, specifier) {
  const path = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (!path.startsWith(`${PAGE}/`)) return null;
  const candidates = [path, `${path}.ts`, `${path}/index.ts`].filter((candidate) => candidate.endsWith('.ts'));
  return candidates.find((candidate) => existsSync(join(REPO, candidate))) ?? null;
}

/** A glob's pattern (`*` any part of a name) as a regular expression its file names are matched by. */
function globPattern(name) {
  const escaped = name.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('[^/]*')}$`);
}

/**
 * The page modules `text` (in the file `from`) loads through `import.meta.glob` (`./uiStates/*.ts`: `ui`'s states),
 * as paths relative to the repo; a glob reaching outside `page/` (the game's own modules) left out.
 */
export function globbedModules(from, text) {
  const found = [];
  for (const match of text.matchAll(GLOB_IMPORT)) {
    const path = posix.normalize(posix.join(posix.dirname(from), match[1]));
    const folder = posix.dirname(path);
    if (!folder.startsWith(`${PAGE}/`) && folder !== PAGE) continue;
    if (!existsSync(join(REPO, folder))) continue;
    const named = globPattern(posix.basename(path));
    const files = readdirSync(join(REPO, folder)).filter((file) => named.test(file)).sort();
    found.push(...files.map((file) => `${folder}/${file}`));
  }
  return found;
}

/** The page modules `entries` (`{ from, text }`: a text as if in the file `from`) import, and theirs in turn. */
function pageClosure(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const { from, text } = queue.shift();
    const imported = runtimeImports(text).map((specifier) => pageModule(from, specifier));
    for (const path of [...imported, ...globbedModules(from, text)]) {
      if (!path || seen.has(path)) continue;
      seen.add(path);
      queue.push({ from: path, text: read(path) });
    }
  }
  return [...seen];
}

/** The page functions `texts` call by name (`side.command('gait', ...)`), each once. */
export function pageCallsIn(texts) {
  const calls = new Set();
  for (const text of texts) for (const match of text.matchAll(PAGE_CALL)) calls.add(match[1]);
  return [...calls];
}

/**
 * The page code a command's work runs, as files: `lab.ts`, the modules of the page functions it calls (`calls`), and
 * every page module those import; all of `page/` for one that calls none by name (a probe's, a co-op's own pages).
 */
function pageCodeOf(calls) {
  const modules = calls.map((call) => `${PAGE_COMMANDS}/${call}.ts`).filter((path) => existsSync(join(REPO, path)));
  if (!modules.length) return [PAGE];
  const roots = [`${PAGE}/lab.ts`, ...modules];
  const closure = pageClosure(roots.map((from) => ({ from, text: read(from) })));
  return [...new Set([...roots, ...closure])];
}

/** The relative modules `text` imports names from, each with those names. */
function namedImports(text) {
  const imports = [];
  for (const match of text.matchAll(/^import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/gm)) {
    const names = match[1].split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter(Boolean);
    imports.push({ names, specifier: match[2] });
  }
  return imports;
}

/**
 * The code of the Node module at `path` that `seed` reaches: the parts it mentions (`partsReached`), and every
 * relative module they import a name from, whole.
 */
function nodeCodeReached(path, seed) {
  const text = read(path);
  const texts = [seed, ...partsReached(partsOf(text), seed)];
  const used = texts.join('\n');
  const modules = namedImports(text)
    .filter(({ names }) => names.some((name) => mentions(used, name)))
    .map(({ specifier }) => posix.join(posix.dirname(path), specifier));
  return { texts, modules };
}

/**
 * The lab's code `command` runs on an A/B's other side: texts (the parts of files it reaches), and files whole (paths
 * relative to the repo, a folder for everything in it); their contents key its kept result.
 */
export function labCodeOf(command) {
  const work = workOf(command);
  const modules = nodeClosure(work.modules).filter((path) => path !== OPTION_KIT);
  const page = pageCodeOf(pageCallsIn([...work.texts, ...modules.map(read)]));
  const browser = read(`${NODE}/browser.mjs`);
  const scripts = browser.match(/^export const PAGE_SCRIPTS = .*$/m)?.[0] ?? browser;
  const boot = nodeCodeReached(`${NODE}/browser.mjs`, `${scripts}\ngpuArgs`);
  const files = new Set([...page, ...modules, ...BOOT_FILES]);
  return { texts: [...work.texts, ...boot.texts], files: [...files].sort() };
}

/**
 * A command's work on the Node side: its module's text and the parts of the command kit it reaches (texts), and the
 * relative modules those import (paths relative to the repo), the option kit aside.
 */
function workOf(command) {
  const path = `${NODE_COMMANDS}/${command}.mjs`;
  if (!existsSync(join(REPO, path))) throw labError(`no command ${command} (${path})`);
  const text = read(path);
  const imported = runtimeImports(text).map((specifier) => posix.join(NODE_COMMANDS, specifier));
  const kit = imported.includes(COMMAND_KIT) ? nodeCodeReached(COMMAND_KIT, text) : { texts: [text], modules: [] };
  const others = imported.filter((module) => module !== COMMAND_KIT && module !== OPTION_KIT);
  return { texts: kit.texts, modules: [...others, ...kit.modules] };
}

/** The Node modules `modules` are (paths relative to the repo), and every relative module they import in turn. */
function nodeClosure(modules) {
  const seen = new Set();
  const queue = [...modules];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path) || !existsSync(join(REPO, path))) continue;
    seen.add(path);
    const imported = runtimeImports(read(path)).filter((specifier) => specifier.endsWith('.mjs'));
    queue.push(...imported.map((specifier) => posix.join(posix.dirname(path), specifier)));
  }
  return [...seen];
}
