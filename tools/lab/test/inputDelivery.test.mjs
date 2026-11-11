// Input can stop before DOM dispatch or inside a capturing UI handler; preserve that distinction without keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputDelivery } from '../../../src/core/inputDelivery.ts';

test('a lively page with no arriving keys differs from a UI swallowing keys', () => {
  const delivery = new InputDelivery();
  delivery.sample(0, true);
  delivery.pointer();
  assert.match(delivery.sample(1000, true), /down 0, up 0, handled 0, editing 0, pointer 1/);
  delivery.capture(true);
  delivery.capture(false);
  assert.match(delivery.sample(2000, true), /down 1, up 1, handled 0/);
  delivery.capture(true);
  delivery.accept(false, 5);
  assert.match(delivery.sample(3000, true), /down 1, up 0, handled 1, editing 0, pointer 0, delay 5 ms/);
});

test('manual capture excludes old counts and distinguishes editing and delayed delivery', () => {
  const delivery = new InputDelivery();
  delivery.capture(true);
  delivery.sample(0, false);
  delivery.capture(true);
  delivery.sample(100, true);
  delivery.accept(true, 5000);
  assert.equal(delivery.sample(500, true), null);
  assert.match(delivery.sample(1000, true), /down 1, up 0, handled 1, editing 1, pointer 0, delay 5000 ms/);
  delivery.sample(1100, false);
  assert.equal(delivery.sample(1200, false), null);
});

test('movement without clicks retains its rate and delay independently of keyboard input', () => {
  const delivery = new InputDelivery();
  delivery.sample(0, true);
  for (let i = 0; i < 5; i++) delivery.move(i * 200);
  assert.match(delivery.sample(1000, true), /pointer 0, delay 0 ms, moves 5, move delay 800 ms/);
  assert.match(delivery.sample(2000, true), /moves 0, move delay 0 ms/);
});

test('Stop retains the last partial second including a recovered input burst', () => {
  const delivery = new InputDelivery();
  delivery.sample(0, false);
  delivery.capture(true);
  delivery.accept(false, 5000);
  delivery.move(800);
  assert.match(delivery.sample(200, true, true), /down 1, up 0, handled 1.*delay 5000 ms, moves 1, move delay 800 ms/);
});
