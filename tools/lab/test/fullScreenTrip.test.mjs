// Fullscreen state around an external dialog, with browser activation/refusal played without native UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { fullScreenTrip } from '../../../src/ui/fullScreenTrip.ts';

/** Browser fullscreen requests, exits and input listeners, without an actual display or keyboard lock. */
function fixture({ fullscreen = true, denied = false, exitDenied = false, deferred = false } = {}) {
  const listeners = new Map();
  const document = new EventTarget();
  const window = new EventTarget();
  let requests = 0;
  let exits = 0;
  let resumes = 0;
  let complete = null;
  class Element {
    manual = false;
    closest() { return this.manual; }
    requestFullscreen() {
      requests++;
      if (denied) return Promise.reject(new Error('User activation required'));
      const enter = () => {
        document.fullscreenElement = this;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      if (deferred) return new Promise((resolve) => { complete = () => { enter(); resolve(); }; });
      enter();
      return Promise.resolve();
    }
  }
  class Keyboard extends Event {
    constructor(key) { super('keydown'); this.key = key; }
  }
  class Pointer extends Event {
    constructor(type, pointerType) { super(type); this.pointerType = pointerType; }
  }
  const root = new Element();
  document.fullscreenElement = fullscreen ? root : null;
  window.focus = () => {};
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, fn, options) => { listeners.set(type, fn); add(type, fn, options); };
  window.removeEventListener = (type, fn, options) => { listeners.delete(type); remove(type, fn, options); };
  const begin = runInNewContext(`let previousTrip = null; (${fullScreenTrip.toString()})`, {
    document, window, Element, KeyboardEvent: Keyboard, PointerEvent: Pointer,
  });
  const leave = async () => {
    exits++;
    if (exitDenied) return false;
    document.fullscreenElement = null;
    return true;
  };
  return { begin: () => begin(leave, () => { resumes++; }), window, document, listeners, root,
    complete: () => complete(), immediate: () => { deferred = false; },
    counts: () => ({ requests, exits, resumes }), permit: () => { denied = false; },
    key: (key) => window.dispatchEvent(new Keyboard(key)),
    pointer: (type, kind) => window.dispatchEvent(new Pointer(type, kind)),
    manual: () => { const target = new Element(); target.manual = true; listeners.get('pointerdown')({ target }); } };
}

test('exits before opening and restores the same fullscreen element exactly once on completion', async () => {
  const page = fixture();
  const trip = page.begin();
  await trip.ready;
  assert.equal(page.document.fullscreenElement, null);
  assert.equal(page.counts().exits, 1);
  trip.finish();
  await Promise.resolve();
  assert.equal(page.document.fullscreenElement, page.root);
  trip.finish();
  assert.deepEqual(page.counts(), { exits: 1, requests: 1, resumes: 1 });
  assert.equal(page.listeners.size, 0);
});

test('a windowed start stays windowed, and redirect fallback does not restore before leaving the page', async () => {
  for (const fullscreen of [false, true]) {
    const page = fixture({ fullscreen });
    const trip = page.begin();
    await trip.ready;
    trip.finish(!fullscreen);
    assert.equal(page.counts().requests, 0);
    assert.equal(page.counts().exits, fullscreen ? 1 : 0);
    assert.equal(page.counts().resumes, 1);
    assert.equal(page.listeners.size, 0);
  }
});

test('refused restoration retries on the next mouse/touch/key gesture and removes listeners', async () => {
  for (const gesture of ['mouse', 'touch', 'key']) {
    const page = fixture({ denied: true });
    const trip = page.begin();
    await trip.ready;
    trip.finish();
    await Promise.resolve();
    assert.equal(page.counts().requests, 1);
    page.permit();
    if (gesture === 'key') page.key('Enter');
    else page.pointer(gesture === 'mouse' ? 'pointerdown' : 'pointerup', gesture);
    await Promise.resolve();
    assert.equal(page.document.fullscreenElement, page.root);
    assert.equal(page.counts().requests, 2);
    assert.equal(page.listeners.size, 0);
  }
});

test('Escape and manual fullscreen controls cancel the pending retry instead of fighting the user', async () => {
  for (const manual of [false, true]) {
    const page = fixture({ denied: true });
    const trip = page.begin();
    await trip.ready;
    trip.finish();
    await Promise.resolve();
    if (manual) page.manual();
    else page.key('Escape');
    page.permit();
    page.key('Enter');
    assert.equal(page.counts().requests, 1);
    assert.equal(page.listeners.size, 0);
  }
});

test('a refused exit blocks popup opening and leaves the original fullscreen state intact', async () => {
  const page = fixture({ exitDenied: true });
  const trip = page.begin();
  await assert.rejects(trip.ready, /Could not leave fullscreen/);
  trip.finish();
  assert.equal(page.document.fullscreenElement, page.root);
  assert.equal(page.counts().requests, 0);
});

test('a new sign-in cancels a prior pending retry and preserves its original fullscreen intent', async () => {
  const page = fixture({ denied: true });
  const first = page.begin();
  await first.ready;
  first.finish();
  await Promise.resolve();
  const next = page.begin();
  await next.ready;
  page.permit();
  page.key('Enter');
  assert.equal(page.document.fullscreenElement, null, 'old retry must not enter behind the next popup');
  next.finish();
  await Promise.resolve();
  assert.equal(page.document.fullscreenElement, page.root);
  assert.equal(page.listeners.size, 0);
});

test('a new sign-in waits for an in-flight restore and exits again before its popup can open', async () => {
  const page = fixture({ deferred: true });
  const first = page.begin();
  await first.ready;
  first.finish();
  const next = page.begin();
  assert.equal(page.counts().exits, 1);
  page.complete();
  await next.ready;
  assert.equal(page.counts().exits, 2);
  assert.equal(page.document.fullscreenElement, null);
  page.immediate();
  next.finish();
  await Promise.resolve();
  assert.equal(page.document.fullscreenElement, page.root);
});
