// The trees a measure serves (tools/stalls/serve.mjs): a URL split into its tree and the query asked of its page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEntry } from '../serve.mjs';

test('splits a query off this tree and a commit', () => {
  assert.deepEqual(splitEntry('this'), { tree: 'this', query: '' });
  assert.deepEqual(splitEntry('this?farDetail=0'), { tree: 'this', query: '?farDetail=0' });
  assert.deepEqual(splitEntry('ref:main?a=1&b=2'), { tree: 'ref:main', query: '?a=1&b=2' });
});

test('leaves any other URL whole, its query its own', () => {
  const url = 'https://victorzakharov.github.io/last-stand/?farDetail=0';
  assert.deepEqual(splitEntry(url), { tree: url, query: '' });
});
