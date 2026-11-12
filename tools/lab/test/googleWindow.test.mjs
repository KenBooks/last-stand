// Sign-in window transport: tab binding, cancellation and fallback without opening a real browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { googleReply, openGoogleWindow } from '../../../src/loot/googleWindow.ts';

/** A synchronous browser window and same-origin channel, with timers advanced only by the test. */
function fixture({ blocked = false, unavailable = false } = {}) {
  const channels = [];
  const timers = new Map();
  const navigations = [];
  const popup = { opener: {}, document: { body: {} }, location: {
    replace: (url) => navigations.push(url),
  }, close() { this.closed = true; } };
  class Channel {
    constructor(name) {
      if (unavailable) throw new Error('Unavailable');
      this.name = name;
      this.sent = [];
      channels.push(this);
    }
    postMessage(value) { this.sent.push(value); }
    close() { this.closed = true; }
  }
  const scope = {
    window: { open: () => blocked ? null : popup },
    BroadcastChannel: Channel,
    crypto,
    URL,
    URLSearchParams,
    location: { href: 'https://game.example/subpath/?server=private' },
    setTimeout: (callback) => { timers.set(callback, callback); return callback; },
    clearTimeout: (callback) => timers.delete(callback),
  };
  const open = runInNewContext(`const googleReply = ${googleReply.toString()};
    (${openGoogleWindow.toString()})`, scope);
  const controller = new AbortController();
  return { open: () => open(controller.signal), controller, popup, channels, timers, navigations };
}

test('opens before any await, severs opener and uses a unique channel without the nonce or server query', async () => {
  const page = fixture();
  const opened = page.open();
  assert.equal(page.popup.opener, null);
  assert.match(opened.returnPath, /^\/subpath\/google-signin.html\?attempt=[a-f0-9]{48}$/);
  assert.equal(page.channels.length, 1);
  opened.navigate('https://accounts.google.com/');
  assert.deepEqual(page.navigations, ['https://accounts.google.com/']);
  page.channels[0].onmessage({ data: { fragment: '#cloud-google=' + 'A'.repeat(32) } });
  assert.equal((await opened.result).code, 'A'.repeat(32));
  assert.equal(page.channels[0].closed, true);
  assert.equal(page.timers.size, 0);
  assert.equal(page.channels[0].sent[0].type, 'close');
  const other = fixture();
  const second = other.open();
  assert.notEqual(page.channels[0].name, other.channels[0].name);
  second.close();
  assert.equal(await second.result, null);
});

test('cancellation ignores malformed/late messages and closes resources', async () => {
  const page = fixture();
  const opened = page.open();
  for (const data of [null, 'untrusted', {}, { fragment: '#cloud-google=bad' }, { fragment: 42 }]) {
    page.channels[0].onmessage({ data });
    assert.notEqual(page.channels[0].closed, true);
  }
  page.controller.abort();
  assert.equal(await opened.result, null);
  opened.navigate('https://accounts.google.com/');
  assert.equal(page.navigations.length, 0);
  page.channels[0].onmessage({ data: { fragment: '#cloud-google=' + 'B'.repeat(32) } });
  assert.equal(page.channels[0].sent.length, 1);
  assert.equal(page.popup.closed, true);
});

test('blocked windows and unavailable channels fall back; timeout and provider cancellation clean up', async () => {
  for (const options of [{ blocked: true }, { unavailable: true }]) {
    const page = fixture(options);
    assert.equal(page.open(), null);
    assert.ok(page.channels.every((channel) => channel.closed));
  }
  const expired = fixture();
  const opened = expired.open();
  [...expired.timers.values()][0]();
  assert.equal((await opened.result).error, 'expired');
  const cancelled = fixture();
  const attempt = cancelled.open();
  cancelled.channels[0].onmessage({ data: { fragment: '#cloud-google-error=cancelled' } });
  assert.equal((await attempt.result).error, 'cancelled');
});

test('reply parsing rejects mixed, oversized and hostile fragments', () => {
  for (const fragment of ['#cloud-google=<script>', '#other=thing', '#cloud-google=' + 'a'.repeat(513),
    '#cloud-google=' + 'a'.repeat(32) + '&cloud-google-error=cancelled']) {
    assert.equal(googleReply(fragment), null);
  }
});

test('the lightweight return page clears its URL, relays only the code, acknowledges and closes', () => {
  const source = readFileSync(new URL('../../../public/google-signin.html', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<script[^>]+src=/);
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = { status: {}, close: {} };
  const sent = [];
  let listener;
  let closed = false;
  let cleared = false;
  runInNewContext(script, {
    location: { search: '?attempt=' + 'a'.repeat(48), hash: '#cloud-google=' + 'b'.repeat(32),
      pathname: '/subpath/google-signin.html' },
    history: { replaceState() { cleared = true; } },
    document: { getElementById: (id) => elements[id] },
    window: { close() { closed = true; } },
    BroadcastChannel: class {
      postMessage(value) { assert.ok(cleared); sent.push(value); }
      set onmessage(callback) { listener = callback; }
      close() {}
    },
    URLSearchParams,
    setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  assert.equal(sent[0].fragment, '#cloud-google=' + 'b'.repeat(32));
  assert.deepEqual(Object.keys(sent[0]), ['fragment']);
  listener({ data: { type: 'close' } });
  assert.equal(closed, true);
  assert.match(elements.status.textContent, /return to your game/);
});
