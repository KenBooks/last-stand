// The lab's command line (tools/lab): its commands, the options each takes, and the help made from them. An option
// is checked as it's read, so a misspelt one or a bad value stops the command at once, before anything boots.
import { readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { labError } from './errors.mjs';
import { COMMON_OPTIONS, SETUP_OPTIONS } from './optionKit.mjs';

/**
 * How an option's value is read:
 * - `switch`: `--name` is true, `--name=false` false;
 * - `text`: `--name value` or `--name=value`;
 * - `list`: comma-separated text, as a list (each one of `choices`, when it has them);
 * - `number`: a finite number;
 * - `pair`: two numbers, `x,z`;
 * - `numbers`: comma-separated numbers, as many as `count` says or in `each`s (any count without them),
 *   `0.2,-0.4,-0.5`;
 * - `choice`: one of `choices`;
 * - `ref`: a switch that may name a commit (`--ab`, `--ab=165246d`);
 * - `screen`: a window's size in css px and the screen's pixel ratio, `1280x720@3` (`@1` when it's left out);
 * - `screens`: two of them, `3840x2160@1,1280x720@3`.
 */
const KINDS = [
  'switch', 'text', 'list', 'number', 'pair', 'numbers', 'choice', 'ref', 'screen', 'screens', 'screenList',
];

/**
 * Every command in `folder`, a module each (`<name>.mjs`, its default export), by name in the order of their
 * names. Throws at a module whose export has no `help` or no `options`, which the command line reads.
 */
export async function commandsIn(folder) {
  const files = readdirSync(folder).filter((file) => file.endsWith('.mjs')).sort();
  const modules = await Promise.all(files.map((file) => import(pathToFileURL(join(folder, file)).href)));
  const commands = {};
  for (let i = 0; i < files.length; i++) {
    const command = modules[i].default;
    if (typeof command?.help !== 'string' || !command.options) {
      throw labError(`${files[i]}: a command's module exports no command (its help and options)`);
    }
    commands[basename(files[i], '.mjs')] = command;
  }
  return commands;
}

/** where the commands are, a module each */
export const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'commands');

/**
 * The commands, a module each in `node/commands/` (node/commands/AGENTS.md): what each does (`help`, and its line in
 * COMMANDS.md, `summary`), what it takes after its name (`argument`), and its options. A command that is `open`
 * passes options it doesn't know on (`--name` or `--name=value`) to what it runs. What each does on a side is in the
 * same module (commands.mjs).
 */
export const COMMANDS = await commandsIn(COMMANDS_DIR);

/** The distance between two words in single-letter edits (Levenshtein's). */
export function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const replaced = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      row.push(Math.min(previous[j] + 1, row[j - 1] + 1, replaced));
    }
    previous = row;
  }
  return previous[b.length];
}

/** ` (did you mean x?)` when one of `names` is a slip of `word` away, else nothing. */
function suggestion(word, names) {
  const ranked = names
    .map((name) => ({ name, distance: editDistance(word, name) }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  if (!best || best.distance > Math.max(1, Math.floor(word.length / 3))) return '';
  return ` (did you mean ${best.name}?)`;
}

/** A screen written as `WxH@ratio` (the ratio may be left out: 1), or null when it isn't one. */
function screenFrom(text) {
  const match = /^(\d+)x(\d+)(?:@(\d+\.?\d*|\.\d+))?$/.exec(text ?? '');
  if (!match) return null;
  const screen = { width: Number(match[1]), height: Number(match[2]), ratio: match[3] ? Number(match[3]) : 1 };
  return screen.width > 0 && screen.height > 0 && screen.ratio > 0 ? screen : null;
}

/** A number written in full (`12`, `-0.5`), or NaN: Number() also takes '', ' ' and '0x10'. */
function numberFrom(text) {
  return /^\s*-?(\d+\.?\d*|\.\d+)(e-?\d+)?\s*$/i.test(text) ? Number(text) : NaN;
}

/** An option's value as its kind reads it; throws saying what was wrong. */
function readValue(name, spec, text) {
  const wrong = (expected) => labError(`--${name}: ${expected}, not ${JSON.stringify(text)}`);
  switch (spec.kind) {
    case 'switch':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      throw wrong('true or false');
    case 'ref':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      if (text === '') throw wrong('a commit');
      return text;
    case 'text':
      if (!text) throw wrong('a value');
      return text;
    case 'switchOrText':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      if (!text) throw wrong('true, false or a value');
      return text;
    case 'list': {
      const items = text.split(',').map((item) => item.trim()).filter(Boolean);
      if (items.length === 0) throw wrong('a comma-separated list');
      const unknown = items.find((item) => spec.choices && !spec.choices.includes(item));
      if (unknown !== undefined) throw wrong(`some of ${spec.choices.join(', ')}${suggestion(unknown, spec.choices)}`);
      return items;
    }
    case 'number': {
      const value = numberFrom(text);
      if (!Number.isFinite(value)) throw wrong('a number');
      return value;
    }
    case 'pair': {
      const values = text.split(',').map(numberFrom);
      if (values.length !== 2 || !values.every(Number.isFinite)) throw wrong('two numbers, x,z');
      return values;
    }
    case 'numbers': {
      const values = text.split(',').map(numberFrom);
      if (!values.every(Number.isFinite)) throw wrong('comma-separated numbers');
      if (spec.count !== undefined && values.length !== spec.count) throw wrong(`${spec.count} numbers, ${spec.usage}`);
      if (spec.each !== undefined && values.length % spec.each !== 0) {
        throw wrong(`numbers in ${spec.each}s, ${spec.usage}`);
      }
      return values;
    }
    case 'choice':
      if (!spec.choices.includes(text)) throw wrong(spec.choices.join(', '));
      return text;
    case 'screen': {
      const screen = screenFrom(text);
      if (!screen) throw wrong('a size and pixel ratio, 1280x720@3');
      return screen;
    }
    case 'screens': {
      const screens = text.split(',').map(screenFrom);
      if (screens.length !== 2 || screens.includes(null)) {
        throw wrong('two sizes and pixel ratios, 3840x2160@1,1280x720@3');
      }
      return screens;
    }
    case 'screenList': {
      const screens = (text ?? '').split(',').map(screenFrom);
      if (screens.includes(null)) throw wrong('sizes and pixel ratios, 1920x1080@1.25,1536x864@1.25');
      return screens;
    }
    default:
      throw new Error(`option --${name} has an unknown kind ${spec.kind} (one of ${KINDS.join(', ')})`);
  }
}

/** An option an open command doesn't know, passed on: `--name` true, `--name=false` false, else its text. */
function passedOn(text) {
  if (text === undefined || text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

/** Throws at options that can't go together: `--screens` names both sides' screens, and runs this tree alone. */
function checkTogether(options) {
  if (options.insets && !options.screen && !options.screens) {
    throw labError('--insets are a screen\'s: give its --screen (or --screens)');
  }
  if (!options.screens) return;
  if (options.ab) throw labError('--screens compares this tree on two screens: it takes no --ab');
  if (options.screen) throw labError('--screens names both screens: it takes no --screen');
}

/** whether an option's kind takes the argument after it as its value (`--count 3`; `--ab` and `--profile` don't) */
const takesNext = (spec) => !['switch', 'ref', 'switchOrText'].includes(spec.kind);

/** An option's value as it's given again: joined to the first by its separator (`joins`: `--tune a --tune b` reads
 *  as `a;b`), else refused. (A second `--tune` once replaced the first unsaid, and five runs measured a tuning that
 *  wasn't asked for.) */
function givenAgain(name, spec, first, value) {
  if (first === undefined) return value;
  if (spec.joins) return `${first}${spec.joins}${value}`;
  throw labError(`--${name} given twice (${JSON.stringify(first)}, then ${JSON.stringify(value)})`);
}

/**
 * Reads a command line (the arguments after `lab`): the command, its options by name (each read as its kind says,
 * defaults filled in) and the words after the command, under `_`. Throws, saying what was wrong, at an unknown
 * command, an option the command doesn't take, or a bad value.
 */
export function parseCommandLine(argv) {
  const [command = 'help', ...rest] = argv;
  const name = command === '--help' || command === '-h' ? 'help' : command;
  const definition = COMMANDS[name];
  if (!definition) {
    const known = Object.keys(COMMANDS);
    throw labError(`no command ${name}${suggestion(name, known)}; the commands: ${known.join(', ')}`);
  }
  const specs = definition.options;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const argument = rest[i];
    if (!argument.startsWith('--')) {
      options._.push(argument);
      continue;
    }
    const [optionName, text] = argument.slice(2).split(/=(.*)/s);
    const spec = specs[optionName];
    if (!spec) {
      if (definition.open) {
        options[optionName] = passedOn(text);
        continue;
      }
      const known = Object.keys(specs);
      const guess = suggestion(optionName, known);
      const takes = guess || !known.length ? '' : `; it takes ${known.map((option) => `--${option}`).join(', ')}`;
      throw labError(`${name} takes no --${optionName}${guess}${takes}`);
    }
    if (text === undefined && takesNext(spec)) {
      if (i + 1 >= rest.length) throw labError(`--${optionName} needs a value (${spec.usage ?? spec.kind})`);
      options[optionName] = givenAgain(optionName, spec, options[optionName], readValue(optionName, spec, rest[++i]));
    } else {
      options[optionName] = givenAgain(optionName, spec, options[optionName], readValue(optionName, spec, text));
    }
  }
  for (const [optionName, spec] of Object.entries(specs)) {
    if (options[optionName] === undefined && spec.default !== undefined) {
      options[optionName] = readValue(optionName, spec, spec.default);
    }
  }
  checkTogether(options);
  if (definition.argument && !definition.mayOmit && options._.length === 0) {
    throw labError(`${name} needs its ${definition.argument}`);
  }
  if (!definition.argument && options._.length > 0) {
    throw labError(`${name} takes no ${JSON.stringify(options._[0])} (options start with --)`);
  }
  return { command: name, options };
}

/** the help's width, and the column its descriptions start at */
const HELP_WIDTH = 116;
const HELP_COLUMN = 28;

/** `head`, then `text` from the help's column, wrapped to its width under that column. */
function helpEntry(head, text) {
  const lines = [];
  let line = `${head.padEnd(HELP_COLUMN - 1)} `;
  let empty = true;
  for (const word of text.split(' ')) {
    if (!empty && line.length + 1 + word.length > HELP_WIDTH) {
      lines.push(line);
      line = ' '.repeat(HELP_COLUMN);
      empty = true;
    }
    line += empty ? word : ` ${word}`;
    empty = false;
  }
  lines.push(line);
  return lines.join('\n');
}

/** An option's entry in the help: `--name usage`, then what it does, and its default. */
function optionEntry(name, spec) {
  const value = !takesNext(spec) && spec.usage ? spec.usage : spec.usage ? ` ${spec.usage}` : '';
  const fallback = spec.default ? ` (${spec.default})` : '';
  return helpEntry(`      --${name}${value}`, `${spec.help}${fallback}`);
}

/** A command's head in the help and COMMANDS.md: its name, and what it takes after it (`<what>`, `[what]`). */
export function commandHead(name, definition) {
  if (!definition.argument) return name;
  return definition.mayOmit ? `${name} [${definition.argument}]` : `${name} <${definition.argument}>`;
}

/** The help, made from `COMMANDS`: each command with its own options, then the ones the commands share. */
export function usage() {
  const shared = new Set([...Object.keys(SETUP_OPTIONS), ...Object.keys(COMMON_OPTIONS)]);
  const lines = ['npm run lab -- <command> [options]', ''];
  for (const [name, definition] of Object.entries(COMMANDS)) {
    if (name === 'help') continue;
    lines.push(helpEntry(`  ${commandHead(name, definition)}`, definition.help));
    for (const [optionName, spec] of Object.entries(definition.options)) {
      if (!shared.has(optionName)) lines.push(optionEntry(optionName, spec));
    }
    if (definition.open) lines.push(helpEntry('      --name[=value]', 'any other option is passed to the probe'));
  }
  lines.push('', '  the set-up (sheet, carry, probe):');
  for (const [name, spec] of Object.entries(SETUP_OPTIONS)) lines.push(optionEntry(name, spec));
  lines.push('  every command run on a page (sheet, carry, probe, eval):');
  for (const [name, spec] of Object.entries(COMMON_OPTIONS)) lines.push(optionEntry(name, spec));
  lines.push(
    '',
    'With npm run lab:serve up, each command\'s page is booted ahead of it. Every command runs on a page booted for',
    'it, so it gives the same result every time. The exit status is 1 when it failed or found a problem (an error',
    'in the page, a canary the measure missed).',
  );
  return lines.join('\n');
}
