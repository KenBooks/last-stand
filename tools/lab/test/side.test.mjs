// The dev server of a tree (node/side.mjs): what it never watches (`unwatched`), from the tree's root alone, and the
// mouse's button fields as the page sends them (`buttonFields`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootAddress, bootOf, bootText, buttonFields, unwatched } from '../node/side.mjs';

const MAIN = 'G:\\Git\\gd-clone';
const WORKTREE = 'G:\\Git\\gd-clone\\.claude\\worktrees\\hall-staff-glow';

test("scratch, other checkouts and the harnesses' output are left alone", () => {
  for (const path of ['.tmp\\probe.ts', '.claude\\worktrees\\x\\src\\main.ts', 'tools\\lab\\out\\vite\\a.js', 'dist']) {
    assert.equal(unwatched(MAIN, `${MAIN}\\${path}`), true, path);
  }
});

test('the game and the lab page are watched', () => {
  for (const path of ['src\\game\\hall.ts', 'tools\\lab\\page\\hallGlow.ts', 'index.html', 'tools\\lab\\outer.ts']) {
    assert.equal(unwatched(MAIN, `${MAIN}\\${path}`), false, path);
  }
});

test('a worktree under .claude watches its own source', () => {
  assert.equal(unwatched(WORKTREE, `${WORKTREE}\\src\\game\\hall.ts`), false);
  assert.equal(unwatched(WORKTREE, `${WORKTREE}\\.tmp\\probe.ts`), true);
});

test('forward slashes and another case of the root alike', () => {
  assert.equal(unwatched(MAIN, 'g:/Git/gd-clone/src/state.ts'), false);
  assert.equal(unwatched(MAIN, 'g:/Git/gd-clone/.tmp/a.ts'), true);
});

test("the left button's press and release alone, as the lab always sent them", () => {
  assert.deepEqual(buttonFields('mousePressed'), { button: 'left', buttons: 1, clickCount: 1 });
  assert.deepEqual(buttonFields('mouseReleased'), { button: 'left', buttons: 0, clickCount: 1 });
  assert.deepEqual(buttonFields('mouseMoved'), { button: 'none', buttons: 0 });
});

test('another button pressed, and moved while held', () => {
  assert.deepEqual(buttonFields('mousePressed', 'middle', 4), { button: 'middle', buttons: 4, clickCount: 1 });
  assert.deepEqual(buttonFields('mouseMoved', 'left', 4), { button: 'none', buttons: 4 });
  assert.deepEqual(buttonFields('mouseReleased', 'right', 0), { button: 'right', buttons: 0, clickCount: 1 });
});

test('a boot on WebGL by default, its address the plain one', () => {
  const boot = bootOf({});
  assert.equal(boot.renderer, 'webgl');
  assert.equal(bootAddress('http://localhost:5173/', boot), 'http://localhost:5173/');
  assert.equal(bootText(boot), '');
});

test('--renderer opens the address the pause menu would, and says so after the hero', () => {
  const url = 'http://localhost:5173/';
  assert.equal(bootAddress(url, bootOf({ renderer: 'webgpu' })), `${url}?renderer=webgpu`);
  assert.equal(bootAddress(url, bootOf({ renderer: 'meshlets' })), `${url}?renderer=webgpu&meshlets=1`);
  assert.equal(bootText(bootOf({ renderer: 'meshlets', cold: true })), ', cold on meshlets');
});
