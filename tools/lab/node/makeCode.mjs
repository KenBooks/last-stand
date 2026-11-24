// A made thing's file as the game takes it (`lab join make`, src/dev/agentMakes.ts): a TypeScript or JavaScript
// module that exports `build(kit)`, its types taken off and its imports and exports turned into the plain form the
// page runs without a loader (CommonJS: `require('three')` is answered there with the game's own three, and nothing
// else is). The file isn't type checked here, only parsed: a syntax error is said with its line before anything is
// sent, and `npm run typecheck` checks a file kept under `tools/lab/examples`.
import { readFileSync } from 'node:fs';
import { labError } from './errors.mjs';

/** the names a made thing goes by in the game */
export const MAKE_NAME = /^[\w-]{1,40}$/;

/** `source` (the text of `file`) as the module text the game runs. Throws naming the first syntax error. */
export async function moduleText(source, file) {
  const { default: ts } = await import('typescript');
  const out = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const wrong = out.diagnostics?.find((each) => each.category === ts.DiagnosticCategory.Error);
  if (wrong) {
    const text = ts.flattenDiagnosticMessageText(wrong.messageText, ' ');
    const line = wrong.file ? wrong.file.getLineAndCharacterOfPosition(wrong.start ?? 0).line + 1 : 0;
    throw labError(`make: ${file}${line ? `:${line}` : ''}: ${text}`);
  }
  if (!/\bexports\.(build|default)\b/.test(out.outputText)) {
    throw labError(`make: ${file} exports no build(kit): export function build(kit: MakeKit) { ... }`);
  }
  return out.outputText;
}

/** What the `make` step is sent for `name` from `file`, placed by the command's options if they say where. */
export async function makeArgs(name, file, options) {
  if (!name || !MAKE_NAME.test(name)) throw labError('make takes a name (letters, digits, - and _): join make <name> --file path');
  if (!file) throw labError('make needs its module: join make <name> --file path/to/thing.ts');
  const args = { name, code: await moduleText(readFileSync(file, 'utf8'), file) };
  if (options.at) {
    const at = options.at.map(Number);
    if (at.length !== 3 || at.some((n) => !Number.isFinite(n))) throw labError('--at is three numbers, x,y,z (m)');
    args.at = at;
  }
  if (options.turn !== undefined) args.turn = options.turn;
  return args;
}

/** A made thing as a line: its name, where it stands, what it holds. */
export function madeLine(thing) {
  const size = `${thing.meshes} meshes, ${thing.triangles} triangles`;
  const moves = thing.updaters ? `, ${thing.updaters} updater${thing.updaters === 1 ? '' : 's'}` : '';
  const state = thing.error ? `  [its updaters stopped: ${thing.error}]` : thing.shown === false ? '  [hidden: not this place]' : '';
  return `${thing.name}: in ${thing.place} at ${thing.at.join(', ')} (${size}${moves})${state}`;
}
