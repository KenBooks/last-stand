// The WebGPU node builds of a boot (tools/stalls `--builds`): the page's record shared out among the boot's steps,
// each step's new shaders counted from the first build that made them, and the report's lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildsBySteps, withBuilds } from '../builds.mjs';
import { bootText } from '../report.mjs';

/** A build as the page records it (`NodeBuild` in src/core/webgpu.ts). */
const build = (at, fields = {}) => ({
  at, ms: 2, by: 'compile', reused: false, object: 'stump', material: 'MeshStandardMaterial', shadow: false,
  vertex: 0, fragment: 1, newBytes: 0, ...fields,
});

test('asks the game for its node builds by the page\'s address', () => {
  assert.equal(withBuilds('http://127.0.0.1:5199/?renderer=webgpu'), 'http://127.0.0.1:5199/?renderer=webgpu&builds=');
  assert.equal(withBuilds('http://127.0.0.1:5199/'), 'http://127.0.0.1:5199/?builds=');
});

test('shares the builds out among the steps, each shader new only where first made', () => {
  const builds = [
    build(10, { newBytes: 4096 }),
    build(20, { reused: true }),
    build(120, { object: 'hero mage', vertex: 2, fragment: 1, newBytes: 2048, by: 'draw' }),
    build(130, { object: 'hero mage', shadow: true, vertex: 3, fragment: 4, newBytes: 1024 }),
  ];
  const steps = [{ from: 0, ms: 100 }, { from: 100, ms: 100 }, { from: 200, ms: 50 }];
  const [first, second, third] = buildsBySteps(builds, steps);
  assert.equal(first.count, 2);
  assert.equal(first.reused, 1);
  assert.equal(first.shaders, 2);
  assert.equal(first.kb, 4);
  assert.deepEqual(first.kinds, [{ name: 'stump / MeshStandardMaterial', count: 2, shaders: 2, kb: 4 }]);
  // (the fragment shader 1 was made in the first step: only the vertex shader 2 is new to the mage's build)
  assert.equal(second.shaders, 3);
  assert.equal(second.byDraw, 1);
  assert.equal(second.ms, 4);
  assert.deepEqual(second.kinds.map((kind) => kind.name), [
    'hero mage / MeshStandardMaterial',
    'hero mage / MeshStandardMaterial (shadow)',
  ]);
  assert.equal(third, null);
});

test('lists a step\'s builds in the boot\'s report', () => {
  const builds = buildsBySteps([build(10, { newBytes: 2048, by: 'draw' })], [{ from: 0, ms: 100 }])[0];
  const step = {
    name: 'Conjuring spells', from: 0, ms: 100, frames: { count: 0, worst: [] },
    longTasks: { count: 0, ms: 0, longest: 0 }, programs: { count: 0, ms: 0 }, work: [], builds,
  };
  const findings = {
    clockFound: true, steps: [step], revealedAt: null, painted: null, maps: null, exit: null,
    files: { count: 1, bytes: 1024, later: 0, largest: [] },
    goneAt: null, warmAt: null, pressedAt: null, warmUps: [], lobby: null,
  };
  const text = bootText({ name: 'x', notes: [], findings });
  assert.match(text, /node builds: 1 \(0 reusing another's shaders, 1 at a draw\), 2 new shaders \(2 kB of WGSL\)/);
  assert.match(text, /the most new WGSL: 1 stump \/ MeshStandardMaterial \(2 new, 2 kB\)/);
});
