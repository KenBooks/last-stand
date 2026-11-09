// The devices `perf --device` plays (node/devices.mjs): each one's GPU played by this one drawing its screen at more
// pixels, its own size in css px kept, so the page lays out as it does there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES, screenPlaying } from '../node/devices.mjs';

/** Pixels a screen draws: its css size times its ratio, each way. */
const pixelsOf = (screen) => screen.width * screen.ratio * screen.height * screen.ratio;

test('a device is played at its gpu factor times its own pixels, its css size kept', () => {
  for (const [name, device] of Object.entries(DEVICES)) {
    const played = screenPlaying(device);
    assert.equal(played.width, device.screen.width, name);
    assert.equal(played.height, device.screen.height, name);
    const times = pixelsOf(played) / pixelsOf(device.screen);
    assert.ok(Math.abs(times - device.gpu) / device.gpu < 0.01, `${name}: ${times} times its pixels`);
  }
});

test('every device fits the 4070 Ti\'s largest drawing buffer (16384 a side)', () => {
  for (const [name, device] of Object.entries(DEVICES)) {
    const played = screenPlaying(device);
    assert.ok(played.width * played.ratio <= 16384 && played.height * played.ratio <= 16384, name);
  }
});
