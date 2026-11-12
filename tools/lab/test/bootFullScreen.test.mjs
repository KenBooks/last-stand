// The initial HTML's fullscreen listener, before the game or its controls exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installBootFullScreen } from '../../../src/ui/bootFullScreen.ts';

class Key extends Event {
  constructor(key) {
    super('keydown');
    this.key = key;
  }
}

class Pointer extends Event {
  constructor(type, pointerType) {
    super(type);
    this.pointerType = pointerType;
  }
}

/** A page with only its document element: no game bundle, controls, or input system. */
function page({ cookie = '', standalone = false, fullscreen = false, webdriver = false, search = '' } = {}) {
  class Element extends EventTarget {
    fullButton = false;
    closest(selector) { return this.fullButton && selector.includes('#btn-full') ? this : null; }
  }
  const window = new Element();
  const requests = [];
  let answer = () => Promise.resolve();
  const document = {
    cookie, fullscreenEnabled: true, fullscreenElement: null,
    documentElement: {
      requestFullscreen(options) {
        requests.push(options);
        return answer();
      },
    },
  };
  runInNewContext(`(${installBootFullScreen.toString()})();`, {
    window, document, navigator: { webdriver }, location: { search }, URLSearchParams,
    matchMedia: (query) => ({ matches: query.includes('fullscreen') ? fullscreen : standalone }),
    Element, KeyboardEvent: Key, PointerEvent: Pointer,
  });
  return { window, requests, state: window.__bootFullScreen, answer: (next) => { answer = next; } };
}

test('a loading-screen mouse press requests fullscreen before any game code exists', async () => {
  const boot = page();
  boot.window.dispatchEvent(new Pointer('pointerdown', 'mouse'));
  assert.equal(boot.requests.length, 1);
  assert.equal(boot.requests[0].navigationUI, 'hide');
  assert.ok(boot.state.pending);
  await boot.state.pending;
  assert.equal(boot.state.entered, true);
  assert.equal(boot.state.pending, null);
});

test('touch waits for the activating lift; Escape does not enter fullscreen', () => {
  const boot = page();
  boot.window.dispatchEvent(new Pointer('pointerdown', 'touch'));
  boot.window.dispatchEvent(new Key('Escape'));
  assert.equal(boot.requests.length, 0);
  boot.window.dispatchEvent(new Pointer('pointerup', 'touch'));
  assert.equal(boot.requests.length, 1);
});

test('a refused request retries, while an outstanding request is not duplicated', async () => {
  const boot = page();
  boot.answer(() => Promise.reject(new Error('activation refused')));
  boot.window.dispatchEvent(new Key('Enter'));
  boot.window.dispatchEvent(new Pointer('pointerdown', 'mouse'));
  assert.equal(boot.requests.length, 1);
  await Promise.resolve();
  assert.equal(boot.state.pending, null);
  boot.answer(() => Promise.resolve());
  boot.window.dispatchEvent(new Pointer('pointerdown', 'mouse'));
  assert.equal(boot.requests.length, 2);
  await boot.state.pending;
  boot.window.dispatchEvent(new Key('Enter'));
  assert.equal(boot.requests.length, 2);
});

test('boot handoff removes listeners without losing a request already in flight', async () => {
  const boot = page();
  let accept;
  boot.answer(() => new Promise((resolve) => { accept = resolve; }));
  boot.window.dispatchEvent(new Key('Enter'));
  const pending = boot.state.pending;
  boot.state.stop();
  boot.window.dispatchEvent(new Key('Enter'));
  assert.equal(boot.requests.length, 1);
  accept();
  await pending;
  assert.equal(boot.state.entered, true);
});

test('a standalone app enters on the first press, including after a reload', async () => {
  for (let visit = 0; visit < 2; visit += 1) {
    const boot = page({ standalone: true });
    boot.window.dispatchEvent(new Pointer('pointerdown', 'mouse'));
    assert.equal(boot.requests.length, 1);
    await boot.state.pending;
    assert.equal(boot.state.entered, true);
  }
});

test('a fullscreen control owns its click instead of entering on pointerdown', () => {
  const boot = page();
  boot.window.fullButton = true;
  boot.window.dispatchEvent(new Pointer('pointerdown', 'mouse'));
  assert.equal(boot.requests.length, 0);
  boot.window.fullButton = false;
  boot.window.dispatchEvent(new Pointer('pointerdown', 'mouse'));
  assert.equal(boot.requests.length, 1);
});

for (const [label, options] of [
  ['saved opt-out', { cookie: 'other=x; last-stand-auto-full-screen=off' }],
  ['fullscreen display mode', { fullscreen: true }],
  ['automation', { webdriver: true }],
  ['visit opt-out', { search: '?fullscreen=0' }],
]) {
  test(`early fullscreen respects ${label}`, () => {
    const boot = page(options);
    boot.window.dispatchEvent(new Pointer('pointerdown', 'mouse'));
    assert.equal(boot.requests.length, 0);
  });
}
