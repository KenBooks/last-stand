// `lab naga`'s checker's output read back (node/nagaCheck.mjs): a line a refused stage, and what was checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readChecked } from '../node/nagaCheck.mjs';

test('each refused stage and the totals are read from the checker\'s lines', () => {
  const output = [
    'fault\tlit with hooks 14\tvs_raw\tLAYER_PART=0\tits constants (naga\'s pass)\tExpressionAlreadyInScope([245])',
    'fault\tthe canary\tvs_main\tdefaults\tits constants (naga\'s pass)\tExpressionAlreadyInScope([11])',
    'checked\t43\t252',
    '',
  ].join('\r\n');
  const { faults, modules, stages } = readChecked(output);
  assert.equal(modules, 43);
  assert.equal(stages, 252);
  assert.equal(faults.length, 2);
  assert.equal(faults[0].label, 'lit with hooks 14');
  assert.equal(faults[0].entry, 'vs_raw');
  assert.equal(faults[0].constants, 'LAYER_PART=0');
  assert.equal(faults[1].said, 'ExpressionAlreadyInScope([11])');
});

test('a checker that said nothing read as nothing checked', () => {
  assert.deepEqual(readChecked(''), { faults: [], modules: 0, stages: 0 });
});
