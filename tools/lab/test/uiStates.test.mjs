// `lab ui`'s states, a module each (page/uiStates/<state>.ts), read by the command's module as text
// (node/commands/ui.mjs `uiStatesIn`): every module a state, in its `order`, the lobby's before the run's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UI_STATES, UI_STATES_DIR, uiStatesIn } from '../node/commands/ui.mjs';
import { OUT } from '../node/paths.mjs';

/** A folder of its own under the lab's out/, for modules a test writes, emptied first. */
function scratchFolder(name) {
  const folder = join(OUT, 'test', `${name}-${process.pid}`);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  return folder;
}

/** A state module's text at `order`, a run's state when `inRun`. */
function stateText(order, inRun = false) {
  const run = inRun ? '  inRun: true,\n' : '';
  return `const STATE: Steps = {\n  order: ${order},\n${run}  open: () => undefined,\n};\nexport default STATE;\n`;
}

test('the states are the modules in page/uiStates, each once, by their names', () => {
  const files = readdirSync(UI_STATES_DIR).filter((file) => file.endsWith('.ts'));
  const names = files.map((file) => file.slice(0, -'.ts'.length));
  assert.deepEqual([...UI_STATES].sort(), names.sort());
  assert.equal(new Set(UI_STATES).size, UI_STATES.length);
  assert.equal(UI_STATES[0], 'lobby');
});

test('every state module default-exports its steps, and the lobby\'s states run before the run\'s', () => {
  let runStarted = '';
  for (const state of UI_STATES) {
    const text = readFileSync(join(UI_STATES_DIR, `${state}.ts`), 'utf8');
    assert.match(text, /^export default STATE;$/m, `${state} exports its steps`);
    const inRun = /^\s*inRun: true,$/m.test(text);
    if (inRun) runStarted ||= state;
    else assert.equal(runStarted, '', `${state}, a lobby state, runs after ${runStarted}, a run's`);
  }
  assert.ok(runStarted, 'a state in the run');
});

test('a folder\'s states read in their order, two at one place or one with none refused', () => {
  const folder = scratchFolder('uiStatesIn');
  try {
    writeFileSync(join(folder, 'alpha.ts'), stateText(30, true));
    writeFileSync(join(folder, 'zeta.ts'), stateText(10));
    writeFileSync(join(folder, 'mid.ts'), stateText(20));
    assert.deepEqual(uiStatesIn(folder), ['zeta', 'mid', 'alpha']);
    writeFileSync(join(folder, 'twin.ts'), stateText(20));
    assert.throws(() => uiStatesIn(folder), /mid and twin are both at order 20|twin and mid are both at order 20/);
    writeFileSync(join(folder, 'twin.ts'), 'export default {};\n');
    assert.throws(() => uiStatesIn(folder), /twin\.ts has 0 `order: n` lines/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
