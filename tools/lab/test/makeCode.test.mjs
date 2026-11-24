// A made thing's file as the game takes it (node/makeCode.mjs, `lab join make`): its types off, its `build` exported
// in the plain form the page runs, a file that doesn't parse or exports no build said before anything is sent. The
// thing built and drawn in a game is checked by `lab invite`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { madeLine, makeArgs, moduleText } from '../node/makeCode.mjs';
import { REPO } from '../node/paths.mjs';

const EXAMPLE = join(REPO, 'tools', 'lab', 'examples', 'beacon.ts');

/** `code` run as the page runs it, `three` answered with `THREE`; its exports. */
function run(code, THREE = {}) {
  const module = { exports: {} };
  const required = (id) => {
    if (id === 'three') return THREE;
    throw new Error(`asked for ${id}`);
  };
  new Function('exports', 'require', 'module', code)(module.exports, required, module);
  return module.exports;
}

test('the example becomes a module the page runs, asking for three alone', async () => {
  const code = await moduleText(readFileSync(EXAMPLE, 'utf8'), EXAMPLE);
  assert.equal(typeof run(code).build, 'function');
  assert.doesNotMatch(code, /agentMakes/, 'a type\'s import is gone');
});

test('types are taken off, and a default export is a build too', async () => {
  const source = 'export default function (kit: { n: number }): number { return kit.n * 2; }';
  assert.equal(run(await moduleText(source, 'thing.ts')).default({ n: 21 }), 42);
});

test('a file that does not parse is said with its line, one with no build is refused', async () => {
  await assert.rejects(moduleText('export function build(kit) {\n  return (;\n}', 'thing.ts'), /thing\.ts:2: /);
  await assert.rejects(moduleText('export const size = 1;', 'thing.ts'), /exports no build/);
});

test('make takes a name and a file, a place of three numbers and a turn', async () => {
  const args = await makeArgs('beacon', EXAMPLE, { at: ['1', '0', '-2.5'], turn: 0.5 });
  assert.deepEqual({ name: args.name, at: args.at, turn: args.turn }, { name: 'beacon', at: [1, 0, -2.5], turn: 0.5 });
  assert.equal('at' in await makeArgs('beacon', EXAMPLE, {}), false);
  await assert.rejects(makeArgs('a b', EXAMPLE, {}), /name/);
  await assert.rejects(makeArgs('beacon', undefined, {}), /--file/);
  await assert.rejects(makeArgs('beacon', EXAMPLE, { at: ['1', '2'] }), /three numbers/);
});

test('a made thing is a line: where it stands, what it holds, and what stopped it', () => {
  const thing = { name: 'beacon', place: 'village', at: [1, 0, 2], meshes: 2, triangles: 48, updaters: 1, shown: true };
  assert.equal(madeLine(thing), 'beacon: in village at 1, 0, 2 (2 meshes, 48 triangles, 1 updater)');
  assert.match(madeLine({ ...thing, updaters: 0, error: 'TypeError: x' }), /triangles\)  \[its updaters stopped: TypeError: x\]$/);
  assert.match(madeLine({ ...thing, shown: false }), /\[hidden: not this place\]$/);
});
