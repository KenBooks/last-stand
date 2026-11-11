// Event-queue delay must distinguish late delivery from bad clocks without retaining any key value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyDeliveryDelay } from '../../../src/core/keyDelivery.ts';

test('timely keys and a queued multi-second burst keep their dispatch delay', () => {
  assert.equal(keyDeliveryDelay(100, 104), 4);
  assert.equal(keyDeliveryDelay(100, 6100), 6000);
});

test('missing, future, epoch, and non-finite timestamps are not reported as delayed delivery', () => {
  for (const stamped of [0, 200, Date.now(), NaN, Infinity]) assert.equal(keyDeliveryDelay(stamped, 100), 0);
});
