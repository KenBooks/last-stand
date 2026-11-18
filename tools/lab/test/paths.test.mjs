// Where the lab lives (node/paths.mjs): each tree's own server port, and a tree named whatever its spelling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameTree, treePort } from '../node/paths.mjs';

const MAIN = 'G:/Git/gd-clone';
const WORKTREE = 'G:/Git/gd-clone/.claude/worktrees/idle-glance-013185';

test("a tree's port is its own, the same every time, and clear of Vite's", () => {
  assert.equal(treePort(WORKTREE), treePort(WORKTREE));
  assert.notEqual(treePort(MAIN), treePort(WORKTREE));
  for (const root of [MAIN, WORKTREE]) {
    assert.ok(treePort(root) >= 5200 && treePort(root) < 6000, `${root}: ${treePort(root)}`);
  }
});

test('a tree is the same tree however its path is spelt', () => {
  assert.ok(sameTree(WORKTREE, `${WORKTREE}/`));
  assert.ok(!sameTree(MAIN, WORKTREE));
  if (process.platform === 'win32') {
    assert.ok(sameTree(MAIN, MAIN.toUpperCase()));
    assert.equal(treePort(MAIN), treePort(MAIN.toLowerCase()));
  }
});
