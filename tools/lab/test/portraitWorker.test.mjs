// Exercise the generated service worker, including install downloads and on-demand portrait caching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { pwa } from '../../../scripts/pwa.ts';

test('portraits are excluded from install downloads and cached only after a successful request', async () => {
  const emitted = [];
  const plugin = pwa();
  plugin.configResolved({ base: './', publicDir: resolve('public') });
  plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) }, {}, {
    'index.html': { type: 'asset', fileName: 'index.html', source: '<html>game</html>' },
    'assets/portrait-mage-01-hash.webp': { type: 'asset', fileName: 'assets/portrait-mage-01-hash.webp' },
    'assets/portrait-warrior-01-hash.webp': { type: 'asset', fileName: 'assets/portrait-warrior-01-hash.webp' },
    'assets/game.js': { type: 'asset', fileName: 'assets/game.js' },
  });
  const worker = emitted.find((file) => file.fileName === 'sw.js').source;
  const handlers = new Map();
  const cached = new Map();
  const installed = [];
  const fetched = [];
  let offline = false;
  const cache = {
    async addAll(requests) { installed.push(...requests.map((request) => request.url)); },
    async put(request, response) { cached.set(request.url, response.clone()); },
    async match(request) { return cached.get(request.url)?.clone(); },
  };
  runInNewContext(worker, {
    self: {
      registration: { scope: 'https://example.com/game/' },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {},
    },
    location: { origin: 'https://example.com' },
    URL,
    Request: class ScopedRequest extends Request {
      constructor(url, options) { super(new URL(url, 'https://example.com/game/'), options); }
    },
    caches: { open: async () => cache, match: (request) => cache.match(request) },
    fetch: async (request) => {
      if (offline) throw new Error('offline');
      fetched.push(request.url);
      return new Response('portrait bytes');
    },
  });
  let installing;
  handlers.get('install')({ waitUntil: (promise) => { installing = promise; } });
  await installing;
  assert(installed.some((url) => url.endsWith('/assets/game.js')));
  assert(!installed.some((url) => url.includes('/assets/portrait-')));
  assert.equal(fetched.length, 0);
  const request = new Request('https://example.com/game/assets/portrait-mage-01-hash.webp');
  let reply;
  const fetchEvent = () => handlers.get('fetch')({ request, respondWith: (promise) => { reply = promise; } });
  fetchEvent();
  assert.equal(await (await reply).text(), 'portrait bytes');
  assert.deepEqual(fetched, [request.url]);
  offline = true;
  fetchEvent();
  assert.equal(await (await reply).text(), 'portrait bytes');
  assert.equal(fetched.length, 1);
});
