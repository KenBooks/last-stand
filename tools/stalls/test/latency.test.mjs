// The input's lag (tools/stalls `--scenario latency`): the probe's samples said in a line, and their quantiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latencyLine, quantile } from '../latency.mjs';

test('a quantile is the sorted value at its share, the last for the whole', () => {
  const values = [30, 10, 20, 40];
  assert.equal(quantile(values, 0.5), 30);
  assert.equal(quantile(values, 0), 10);
  assert.equal(quantile(values, 1), 40);
  assert.ok(Number.isNaN(quantile([], 0.5)));
});

test('the line gives each wait its median and 90th percentile', () => {
  const samples = [
    { toFrame: 5, toDone: 20 },
    { toFrame: 6, toDone: 22 },
    { toFrame: 7, toDone: 150 },
  ];
  const line = latencyLine({ samples, error: '' });
  assert.equal(line, 'input lag over 3 presses: to the frame that read it median 6.0 ms, p90 7.0; '
    + 'to the GPU done with it median 22.0 ms, p90 150.0');
});

test('a page with no probe, or no WebGL 2 canvas, says why it measured nothing', () => {
  assert.equal(latencyLine(undefined), 'input lag not measured: no probe');
  assert.equal(latencyLine({ samples: [], error: 'no WebGL 2 canvas' }), 'input lag not measured: no WebGL 2 canvas');
});
