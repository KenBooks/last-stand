// Checks the lists marked as kept sorted (`// sorted` on the line before a list's opening line, `<!-- sorted -->` before
// a Markdown list): every entry in alphabetical order, case aside. A list every PR appends to has every PR adding at
// its end, the same lines, and two such PRs conflict; added in their alphabetical place, two entries rarely touch.
// `npm run check:sorted` checks every tracked file.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CODE_MARK = /^\s*\/\/ sorted\s*$/;
const DOC_MARK = /^\s*<!-- sorted -->\s*$/;
const TEXT = /\.(ts|mjs|js|scss|md|html)$/;

const indentOf = (line) => line.match(/^\s*/)[0].length;
const blank = (line) => line.trim() === '';
const comment = (line) => /^\s*(\/\/|\/\*|\*|<!--)/.test(line);

/** The name an entry is sorted by: a quoted string's text, a key before its colon, a bullet's text. */
function keyOf(line) {
  const text = line.trim().replace(/^- /, '').replace(/^\| /, '');
  const quoted = text.match(/^['"`]([^'"`]*)['"`]/);
  if (quoted) return quoted[1].toLowerCase();
  const named = text.match(/^\**`?([\w$.-]+)/);
  return (named ? named[1] : text).toLowerCase();
}

/** A code list after its mark: the entries at its first entry's indent, up to the line that closes it. */
function codeEntries(lines, open) {
  const entries = [];
  let indent = -1;
  for (let i = open + 1; i < lines.length; i++) {
    const line = lines[i];
    if (blank(line) || comment(line)) continue;
    if (indent < 0) indent = indentOf(line);
    if (indentOf(line) < indent) break;
    if (indentOf(line) === indent) entries.push({ at: i, key: keyOf(line) });
  }
  return entries;
}

/** A Markdown list after its mark: its top-level bullets, up to the first line that is no part of it. */
function docEntries(lines, mark) {
  const entries = [];
  let indent = -1;
  for (let i = mark + 1; i < lines.length; i++) {
    const line = lines[i];
    if (blank(line)) break;
    if (indent < 0) indent = indentOf(line);
    if (indentOf(line) === indent && line.trim().startsWith('- ')) entries.push({ at: i, key: keyOf(line) });
    else if (indentOf(line) <= indent) break;
  }
  return entries;
}

/** Every marked list of `text` out of order, as `line: after "a" comes "b"`. */
export function unsortedIn(text) {
  const lines = text.split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    let entries = null;
    if (CODE_MARK.test(lines[i])) entries = codeEntries(lines, i + 1);
    else if (DOC_MARK.test(lines[i])) entries = docEntries(lines, i);
    if (!entries) continue;
    for (let k = 1; k < entries.length; k++) {
      const before = entries[k - 1];
      const entry = entries[k];
      if (entry.key < before.key) found.push(`${entry.at + 1}: "${entry.key}" comes after "${before.key}"`);
    }
  }
  return found;
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((path) => TEXT.test(path) && existsSync(path));
}

function main() {
  let failed = 0;
  for (const path of trackedFiles()) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes('sorted')) continue;
    for (const problem of unsortedIn(text)) {
      console.log(`${path}:${problem}`);
      failed++;
    }
  }
  if (failed) {
    console.log(`\n${failed} entr${failed === 1 ? 'y' : 'ies'} out of order: add each in its alphabetical place`);
    process.exit(1);
  }
  console.log('every marked list is sorted');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
