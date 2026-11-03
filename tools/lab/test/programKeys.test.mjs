// A three.js program's cache key read by field, and the programs of a kind set apart by what differs
// (page/programKeys.ts): the fields' names held to the installed three's own code, which joins the key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { FLAGS, PARAMETERS, apartText, fieldsOf, kindOf, kindsApart } from '../page/programKeys.ts';

/** three's code that joins a program's key */
function programsSource() {
  const three = createRequire(import.meta.url).resolve('three');
  return readFileSync(join(three, '../../src/renderers/webgl/WebGLPrograms.js'), 'utf8');
}

/** The body of the function `name` in `source`, to the next function's start. */
function bodyOf(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `three has no ${name}`);
  const end = source.indexOf('\tfunction ', start + 1);
  return source.slice(start, end);
}

test('the parameters and flags are those three joins a key from, in its order', () => {
  const source = programsSource();
  const parameters = [...bodyOf(source, 'getProgramCacheKeyParameters').matchAll(/array\.push\( parameters\.(\w+) \)/g)]
    .map((match) => match[1]);
  assert.deepEqual(parameters, PARAMETERS);
  const masks = bodyOf(source, 'getProgramCacheKeyBooleans').split('array.push( _programLayers.mask )').slice(0, 2);
  const flags = masks.map((mask) => {
    const set = [...mask.matchAll(/if \( parameters\.(\w+)(?: > 0)? \)\s+_programLayers\.enable\( (\d+) \)/g)];
    // (by bit: r187 sets bits 24 and 25 before 20)
    const byBit = set.sort((a, b) => Number(a[2]) - Number(b[2]));
    byBit.forEach((match, bit) => assert.equal(Number(match[2]), bit));
    return byBit.map((match) => match[1].replace(/^numLightProbeGrids$/, 'lightProbeGrids'));
  });
  assert.deepEqual(flags, FLAGS);
});

/** A key as three joins it: `head`, the parameters (each `0` but those in `values`), the masks, the output colour
 *  space and the material's own key. */
function keyOf(head, values, masks, custom) {
  const parameters = PARAMETERS.map((name) => values[name] ?? '0');
  return [...head, ...parameters, ...masks, 'srgb', custom].join(',');
}

test('reads a key by field: the shader with its defines, each parameter, the flags set and the material\'s key', () => {
  // (envMap is the first mask's bit 4, skinning the second's bit 5)
  const key = keyOf(['physical', 'USE_X', '1'], { numPointLights: '15', precision: 'highp' }, [16, 32], 'entityfx');
  const fields = fieldsOf(key);
  assert.equal(fields.get('shader'), 'physical,USE_X,1');
  assert.equal(fields.get('numPointLights'), '15');
  assert.equal(fields.get('precision'), 'highp');
  assert.equal(fields.get('flag envMap'), 'on');
  assert.equal(fields.get('flag skinning'), 'on');
  assert.equal(fields.get('flag fog'), undefined);
  assert.equal(fields.get('output'), 'srgb');
  assert.equal(fields.get('custom'), 'entityfx');
  assert.equal(kindOf('MeshPhysicalMaterial', key), 'MeshPhysicalMaterial (physical)');
  const raw = fieldsOf('12,13,blur');
  assert.deepEqual([...raw], [['shader', '12,13'], ['custom', 'blur']]);
  // (three's own key for a material that keys nothing is left out, and what's added to it kept)
  assert.equal(fieldsOf(keyOf(['basic'], {}, [0, 0], 'onBeforeCompile() {}')).get('custom'), 'none');
  assert.equal(fieldsOf(keyOf(['basic'], {}, [0, 0], 'onBeforeCompile() {}|seethrough')).get('custom'), '|seethrough');
});

test('sets a kind\'s programs apart by the fields that differ among them, the most varied first', () => {
  const program = (custom, masks) => ({ kind: 'standard', fields: fieldsOf(keyOf(['standard'], {}, masks, custom)) });
  const programs = [
    program('entityfx', [0, 0]),
    program('entityfx', [0, 32]),
    program('entityfx-near', [0, 0]),
    { kind: 'basic', fields: fieldsOf(keyOf(['basic'], {}, [0, 0], '')) },
  ];
  const [standard, basic] = kindsApart(programs);
  assert.equal(standard.kind, 'standard');
  assert.equal(standard.count, 3);
  const apart = standard.apart.map(apartText);
  assert.deepEqual(apart, ['custom (entityfx 2, entityfx-near 1)', 'flag skinning (off 2, on 1)']);
  assert.deepEqual(basic, { kind: 'basic', count: 1, apart: [] });
});
