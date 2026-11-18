// The lab's code a command runs on an A/B's other side, which keys its kept result (node/labCode.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  globbedModules, labCodeOf, pageCallsIn, partsOf, partsReached, runtimeImports,
} from '../node/labCode.mjs';

test('the modules imported at run time, types left out', () => {
  const text = [
    "import * as THREE from 'three';",
    "import { a, type B } from './a';",
    "import type { C } from './c';",
    "export { d } from './d';",
    "export type { E } from './e';",
    "import './f';",
    'async function g() {',
    "  const { h } = await import('./h');",
    '}',
  ].join('\n');
  assert.deepEqual(runtimeImports(text), ['./a', './d', './f', './h']);
});

test('a file\'s top-level parts by name, each with its doc comment, the imports apart', () => {
  const text = [
    "import { x } from './x.mjs';",
    '',
    '/** the first */',
    'const FIRST = 1;',
    '/**',
    ' * Uses the first.',
    ' */',
    'export function second() {',
    '  return FIRST;',
    '}',
    'function third() {}',
  ].join('\n');
  const parts = partsOf(text);
  assert.deepEqual([...parts.keys()], [null, 'FIRST', 'second', 'third']);
  assert.match(parts.get('second'), /Uses the first[\s\S]*return FIRST/);
  assert.deepEqual(partsReached(parts, 'second()'), [parts.get('FIRST'), parts.get('second')]);
});

test('the page functions a command\'s work calls by name', () => {
  const texts = ["return side.command('gait', { frames });", "side.command(\n  'liveStart', fixture)", 'side.probe(path)'];
  assert.deepEqual(pageCallsIn(texts), ['gait', 'liveStart']);
});

test('the gait keyed on its own page modules and the boot, not on another command\'s', () => {
  const { files, texts } = labCodeOf('gait');
  const own = ['tools/lab/page/lab.ts', 'tools/lab/page/commands/gait.ts', 'tools/lab/page/gait.ts'];
  for (const file of [...own, 'tools/lab/node/side.mjs']) assert.ok(files.includes(file), file);
  const others = ['tools/lab/page/ui.ts', 'tools/lab/page/commands/ui.ts', 'tools/lab/page/hood.ts', 'tools/lab/page'];
  for (const file of [...others, 'tools/lab/node/coop.mjs', 'tools/lab/node/optionKit.mjs']) {
    assert.ok(!files.includes(file), file);
  }
  assert.ok(texts.some((text) => /side\.command\('gait'/.test(text)), 'its work, node/commands/gait.mjs');
  assert.ok(texts.some((text) => /function asText/.test(text)), 'the command kit\'s parts it reaches');
  assert.ok(!texts.some((text) => /function textWithPictureFiles/.test(text)), 'not the parts it doesn\'t');
  assert.ok(!texts.some((text) => /side\.command\('ui'/.test(text)), 'not another command\'s');
  assert.ok(texts.some((text) => /function labClock/.test(text)), 'the clock every page runs first');
});

test('a command whose work calls a page function from another module keyed on it', () => {
  // (co-op's pages are called from coop.mjs, which coop's module imports as it runs)
  const { files } = labCodeOf('coop');
  assert.ok(files.includes('tools/lab/node/coop.mjs'));
});

test('the modules a page module globs, those outside page/ left out', () => {
  const text = [
    "const STATES = import.meta.glob<{ default: Steps }>('./uiStates/*.ts');",
    "const log = import.meta.glob<Log>('../../../src/ui/battleLog.ts');",
  ].join('\n');
  const found = globbedModules('tools/lab/page/ui.ts', text);
  assert.ok(found.includes('tools/lab/page/uiStates/lobby.ts'));
  assert.ok(found.every((path) => path.startsWith('tools/lab/page/uiStates/') && path.endsWith('.ts')), found);
});

test('ui keyed on its states, a module each, and what they import', () => {
  const { files } = labCodeOf('ui');
  const own = ['tools/lab/page/ui.ts', 'tools/lab/page/uiStates/lobby.ts', 'tools/lab/page/uiStates/pause.ts'];
  for (const file of [...own, 'tools/lab/page/uiKit.ts', 'tools/lab/page/uiPause.ts']) {
    assert.ok(files.includes(file), file);
  }
});

test('a command with no page entry of its own keyed on every page module', () => {
  assert.ok(labCodeOf('probe').files.includes('tools/lab/page'));
});
