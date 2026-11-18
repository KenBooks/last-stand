// COMMANDS.md's list of the commands (tools/lab), made from their modules (node/commands/<name>.mjs): a line each, its
// `summary` (its `help` when it has none) and its variants'. `npm run lab -- docs` writes it, and a lab test fails
// while the file holds another: a new command is a module of its own, and no one writes its line by hand.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAB } from './codeStamp.mjs';
import { labError } from './errors.mjs';
import { commandHead } from './options.mjs';

/** the file the list is in */
export const COMMANDS_DOC = join(LAB, 'COMMANDS.md');
/** the line the list starts after */
export const LIST_START = '<!-- made by `npm run lab -- docs` from each command\'s module: edit those, not this list -->';
/** the line it ends before */
export const LIST_END = '<!-- end of the list `npm run lab -- docs` makes -->';

/** A command's note in full, when it has one (`commands/<name>.md`), linked unless its summary links it already. */
function noteLink(name, summary) {
  const note = `commands/${name}.md`;
  if (!existsSync(join(LAB, note)) || summary.includes(note)) return '';
  return ` (in full: [\`${note}\`](${note}))`;
}

/** A command's lines in the list: its own, then each variant's (`cloud --google`). */
function linesOf(name, command) {
  const summary = command.summary ?? command.help;
  const lines = [`- \`${commandHead(name, command)}\`: ${summary}${noteLink(name, summary)}`];
  for (const [variant, text] of Object.entries(command.variants ?? {})) lines.push(`- \`${name} ${variant}\`: ${text}`);
  return lines;
}

/** The list of `commands` (by name, as options.mjs reads them), in their order, `help` itself left out. */
export function listOf(commands) {
  const named = Object.entries(commands).filter(([name]) => name !== 'help');
  return named.flatMap(([name, command]) => linesOf(name, command)).join('\n');
}

/** `text` (COMMANDS.md) with the list between its marks made again from `commands`. */
export function withList(text, commands) {
  const start = text.indexOf(LIST_START);
  const end = text.indexOf(LIST_END);
  if (start < 0 || end < start) throw labError(`COMMANDS.md has lost the marks round its list (${LIST_START})`);
  const before = text.slice(0, start + LIST_START.length);
  return `${before}\n${listOf(commands)}\n${text.slice(end)}`;
}

/** COMMANDS.md as it is (`text`) and as its list would be made now (`made`). */
export function commandsDoc(commands) {
  const text = readFileSync(COMMANDS_DOC, 'utf8');
  return { text, made: withList(text, commands) };
}

/** Writes COMMANDS.md's list again from `commands`; returns what it did, to say. */
export function writeCommandsDoc(commands) {
  const { text, made } = commandsDoc(commands);
  if (made === text) return 'COMMANDS.md\'s list of the commands is up to date';
  writeFileSync(COMMANDS_DOC, made);
  return `COMMANDS.md\'s list of the commands made again (${Object.keys(commands).length} commands)`;
}
