// A check's reports against another check's (tools/lab, `lab check --like <dir>`): every report of the same name
// compared line by line, what says how the run went aside (a boot's time, a side read back from the cache, the
// command's time), so a change to how a check runs is shown to leave every result as it was.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeDifferences } from './compare.mjs';

/** the lines that say how a run went, not what it found: a side booted or read back, and the command's time */
const RUN_NOTES = [
  /^\S.*: booted the \w+.*\(\d+(\.\d+)? s(: [^)]*)?\)$/,
  /^\S.*: as it ran \S+ \(kept in .*\)$/,
  /^\(\d+(\.\d+)? s\)$/,
];

/** the lines timed by the browser's own clock, which no two runs agree on: a frame's pose's time (`range`), and its
 *  failure past 20 ms */
const CLOCKED = [/ ms a frame\b/];

/** A report's lines with those that say how its run went taken out, and those timed by the browser's clock. */
export function resultLines(text) {
  const result = (line) => !RUN_NOTES.some((note) => note.test(line)) && !CLOCKED.some((timed) => timed.test(line));
  return String(text).split('\n').filter(result);
}

/** The reports (`<command>-<hero>.txt`) in `dir`, by name. */
function reportsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.txt')).sort();
}

/**
 * Each of `names` (reports in `dir`) against the one of the same name in `like`: `{ name, same, text }`, `text` the
 * lines that differ (compare.mjs), or that `like` has none of that name.
 */
export function compareReports(dir, like, names = reportsIn(dir)) {
  return names.map((name) => {
    const theirs = join(like, name);
    if (!existsSync(theirs)) return { name, same: false, text: `${name}: none in ${like}` };
    const before = resultLines(readFileSync(theirs, 'utf8')).join('\n');
    const after = resultLines(readFileSync(join(dir, name), 'utf8')).join('\n');
    if (before === after) return { name, same: true, text: `${name}: the same` };
    return { name, same: false, text: `${name}:\n${describeDifferences('like', before, 'this check', after)}` };
  });
}
