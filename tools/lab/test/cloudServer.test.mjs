// A link may choose a co-op relay, but may not choose where the player's cloud token and save are sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudServerHttp } from '../../../src/loot/cloudServer.ts';

test('the configured saves host is independent of a co-op server link', () => {
  const built = 'wss://ls.wellscoped.dev';
  assert.equal(cloudServerHttp(built, null), 'https://ls.wellscoped.dev');
  for (const link of ['https://collector.example', 'wss://collector.example',
    'https://localhost.evil.example', 'https://user:pass@localhost',
    'http://localhost/steal', 'http://localhost?token=1', 'javascript:alert(1)']) {
    assert.equal(cloudServerHttp(built, link), 'https://ls.wellscoped.dev', link);
  }
});

test('a dev build can point saves at the local lab service', () => {
  assert.equal(cloudServerHttp('wss://ls.wellscoped.dev', 'http://127.0.0.1:8791'), 'http://127.0.0.1:8791');
  assert.equal(cloudServerHttp('wss://ls.wellscoped.dev', 'ws://localhost:8791'), 'http://localhost:8791');
});
