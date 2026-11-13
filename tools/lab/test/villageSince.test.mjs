// `lab village --since`: which checks a change can touch (node/villageSince.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkNames, checksByModule, checksSince } from '../node/villageSince.mjs';

const SOURCE = readFileSync(new URL('../page/village.ts', import.meta.url), 'utf8');
const NAMES = checkNames(SOURCE);
const MODULES = checksByModule(SOURCE);

test('village --since: the checks are read off the module that lists them', () => {
  assert.ok(NAMES.length > 90, `${NAMES.length} checks`);
  for (const name of ['hallWallsOneByOne', 'shadowsOnMove', 'fogOneGrey', 'hallBuiltBehind']) {
    assert.ok(NAMES.includes(name), name);
  }
  assert.deepEqual(MODULES.get('villageShadowsOnMove'), ['shadowsOnMove']);
  assert.ok(MODULES.get('villageFogPast').includes('fogOneGrey'));
});

test('village --since: a note or a test runs nothing, the fog its own checks, the village itself every check', () => {
  const notes = checksSince(['src/core/AGENTS.md', 'tools/lab/test/check.test.mjs'], NAMES, MODULES);
  assert.deepEqual(notes.names, []);
  assert.equal(notes.all, false);

  const fog = checksSince(['src/core/sight.ts'], NAMES, MODULES);
  assert.equal(fog.all, false);
  assert.ok(fog.names.includes('fogHoldsSteady') && fog.names.includes('sightBlacksOut'));
  assert.ok(!fog.names.includes('shadowsOnMove') && !fog.names.includes('heroChosenQuick'));
  assert.ok(fog.names.length < NAMES.length / 2, `${fog.names.length} of ${NAMES.length}`);

  const own = checksSince(['tools/lab/page/villageShadowsOnMove.ts'], NAMES, MODULES);
  assert.deepEqual(own.names, ['shadowsOnMove']);

  const whole = checksSince(['src/core/AGENTS.md', 'src/game/village.ts'], NAMES, MODULES);
  assert.equal(whole.all, true);
  assert.deepEqual(whole.names, NAMES);
});

test('village --since: the checks chosen come in the suite\'s order, each once', () => {
  const both = checksSince(['src/world/meadow.ts', 'src/core/sight.ts', 'src/core/sight.ts'], NAMES, MODULES);
  assert.deepEqual(both.names, NAMES.filter((name) => both.names.includes(name)));
  assert.equal(new Set(both.names).size, both.names.length);
});
