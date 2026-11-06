// The gh-pages checkout committed and pushed as the bot.
import { execFileSync } from 'node:child_process';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

/** One PR's line is the commit's subject; several are its body. */
export function commitMessage(lines) {
  if (lines.length === 1) return `Preview PR ${lines[0]}\n`;
  return `Preview ${lines.length} PRs\n\n${lines.join('\n')}\n`;
}

/** Everything in the checkout staged: the paths that changed. */
export function stageAll(dir) {
  git(dir, 'add', '-A');
  return git(dir, 'diff', '--cached', '--name-only').split('\n').filter(Boolean);
}

/** The staged change committed (`lines` say what it is) and, unless `push` is false, pushed to gh-pages. */
export function commit(dir, lines, { push = true } = {}) {
  git(dir, 'config', 'user.name', 'github-actions[bot]');
  git(dir, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  execFileSync('git', ['-C', dir, 'commit', '-F', '-'], { input: commitMessage(lines), encoding: 'utf8' });
  if (push) git(dir, 'push', 'origin', 'HEAD:gh-pages');
}

/** Stage, commit and push when anything changed: the paths that did. */
export function commitChanges(dir, lines, options) {
  const changed = stageAll(dir);
  if (changed.length > 0) commit(dir, lines, options);
  return changed;
}

/** The commit the checkout is at: what a deploy of it is named by, unique to each push. */
export const headCommit = (dir) => git(dir, 'rev-parse', 'HEAD').trim();
