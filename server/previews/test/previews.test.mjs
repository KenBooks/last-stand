// The previews service (previews.mjs) on a port of its own, its builds in a folder of the test's: what it takes,
// what it turns away, who may write, what it serves and how, and what it prunes. Archives are packed by the
// workflow's own packer (scripts/preview/tar.mjs) or by hand, for what it must turn away.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { header, packFolder } from '../../../scripts/preview/tar.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const SCRATCH = join(ROOT, '.tmp', `previews-test-${process.pid}`);
const DATA = join(SCRATCH, 'data');
const TOKEN = 'test-token';
let server;
let base;

before(async () => {
  mkdirSync(DATA, { recursive: true });
  const { start } = await import('../previews.mjs');
  server = await start(0, { DATA, PREVIEWS_TOKEN: TOKEN, KEEP: '2', DISK_MAX: String(64 << 20) });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  // (the folder this test made, and nothing else)
  rmSync(SCRATCH, { recursive: true, force: true });
});

const sha = (seed) => seed.repeat(40).slice(0, 40);
const auth = (token = TOKEN) => (token ? { authorization: `Bearer ${token}` } : {});

/** A build folder like Vite's, packed: its page says which commit it is. */
async function packedBuild(commit, extra = {}) {
  const dir = join(SCRATCH, `site-${commit}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), `<!doctype html><p>${commit}</p>`);
  writeFileSync(join(dir, 'assets', 'index-AbC_12.js'), `console.log(${JSON.stringify(commit)});\n`.repeat(200));
  writeFileSync(join(dir, 'sw.js'), '// worker');
  for (const [name, contents] of Object.entries(extra)) writeFileSync(join(dir, name), contents);
  const file = `${dir}.tar.gz`;
  await packFolder(dir, file);
  return readFileSync(file);
}

const putBuild = (number, commit, body, token = TOKEN) => fetch(
  `${base}/pr-preview/api/pr-${number}/${commit.slice(0, 7)}?sha=${commit}`,
  { method: 'PUT', body, headers: auth(token) },
);
const putJson = (number, value, token = TOKEN) => fetch(`${base}/pr-preview/api/pr-${number}/latest.json`, {
  method: 'PUT', body: JSON.stringify(value), headers: auth(token),
});
const get = (path, headers = {}) => fetch(`${base}${path}`, { headers, redirect: 'manual' });

test('answers its health without the token', async () => {
  assert.equal(await (await get('/pr-preview/health')).text(), 'ok');
});

test('takes a build with the token alone, and serves it at once', async () => {
  const commit = sha('a1');
  const body = await packedBuild(commit);
  assert.equal((await putBuild(7, commit, body, '')).status, 401);
  assert.equal((await putBuild(7, commit, body, 'wrong')).status, 401);
  const put = await putBuild(7, commit, body);
  assert.equal(put.status, 201);
  assert.equal((await put.json()).folder, commit.slice(0, 7));
  const page = await get(`/pr-preview/pr-7/${commit.slice(0, 7)}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  assert.match(await page.text(), new RegExp(commit));
  const metadata = await (await get(`/pr-preview/pr-7/${commit.slice(0, 7)}/preview-metadata.json`)).json();
  assert.equal(metadata.headSha, commit);
});

test('sends built assets compressed and kept a year, the worker checked each time', async () => {
  const folder = sha('a1').slice(0, 7);
  const plain = await get(`/pr-preview/pr-7/${folder}/assets/index-AbC_12.js`, { 'accept-encoding': 'identity' });
  const packed = await get(`/pr-preview/pr-7/${folder}/assets/index-AbC_12.js`, { 'accept-encoding': 'gzip, br' });
  assert.equal(packed.headers.get('content-encoding'), 'br');
  assert.equal(packed.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.ok(Number(packed.headers.get('content-length')) < Number(plain.headers.get('content-length')) / 4);
  // (fetch unpacks it: the same text either way)
  assert.equal(await packed.text(), await plain.text());
  const worker = await get(`/pr-preview/pr-7/${folder}/sw.js`);
  assert.equal(worker.headers.get('cache-control'), 'no-cache');
  assert.match(worker.headers.get('content-type'), /javascript/);
  const again = await get(`/pr-preview/pr-7/${folder}/sw.js`, { 'if-none-match': worker.headers.get('etag') });
  assert.equal(again.status, 304);
});

test('turns away what isn\'t a build of plain files', async () => {
  const commit = sha('b2');
  const link = Buffer.concat([header('evil', { type: '2' }), Buffer.alloc(1024)]);
  const climb = Buffer.concat([header('../../etc/x', { size: 0 }), Buffer.alloc(1024)]);
  const hidden = Buffer.concat([header('.git/config', { size: 0 }), Buffer.alloc(1024)]);
  for (const archive of [link, climb, hidden]) assert.equal((await putBuild(8, commit, gzipSync(archive))).status, 400);
  assert.equal((await putBuild(8, commit, Buffer.from('not gzip'))).status, 400);
  const cut = (await packedBuild(commit)).subarray(0, 200);
  assert.equal((await putBuild(8, commit, cut)).status, 400);
  // a folder that isn't the commit's
  const wrong = await fetch(`${base}/pr-preview/api/pr-8/abcdef0?sha=${commit}`, {
    method: 'PUT', body: await packedBuild(commit), headers: auth(),
  });
  assert.equal(wrong.status, 400);
  assert.equal((await get('/pr-preview/pr-8/')).status, 404, 'nothing was kept of PR 8');
});

test('stores latest.json as the stable page reads it, and nothing else', async () => {
  const latest = { headSha: sha('a1'), state: 'ready', folder: sha('a1').slice(0, 7), run: 'https://github.com/x/y/actions/runs/1' };
  assert.equal((await putJson(7, latest, '')).status, 401);
  assert.equal((await putJson(7, { ...latest, state: 'whatever' })).status, 400);
  assert.equal((await putJson(7, { ...latest, run: 'https://evil.example/' })).status, 400);
  assert.equal((await putJson(7, latest)).status, 200);
  const served = await get('/pr-preview/pr-7/latest.json');
  assert.equal(served.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await served.json(), latest);
  const page = await fetch(`${base}/pr-preview/api/pr-7/index.html`, { method: 'PUT', body: '<p>stable</p>', headers: auth() });
  assert.equal(page.status, 200);
  assert.equal(await (await get('/pr-preview/pr-7/')).text(), '<p>stable</p>');
  assert.equal((await get('/pr-preview/pr-7')).headers.get('location'), '/pr-preview/pr-7/');
});

test('keeps each PR\'s newest builds; a pruned one\'s page goes to the stable page', async () => {
  for (const seed of ['c3', 'd4']) assert.equal((await putBuild(7, sha(seed), await packedBuild(sha(seed)))).status, 201);
  const newest = { headSha: sha('d4'), state: 'ready', folder: sha('d4').slice(0, 7), run: 'https://github.com/x/y/actions/runs/3' };
  assert.equal((await putJson(7, newest)).status, 200);
  const { previews } = await (await get('/pr-preview/api/previews', auth())).json();
  const seven = previews.find((preview) => preview.number === 7);
  assert.deepEqual(seven.folders.map((kept) => kept.folder), [sha('d4').slice(0, 7), sha('c3').slice(0, 7)]);
  const pruned = `/pr-preview/pr-7/${sha('a1').slice(0, 7)}/`;
  const opened = await get(pruned, { accept: 'text/html' });
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.get('location'), '/pr-preview/pr-7/');
  assert.equal((await get(`${pruned}assets/index-AbC_12.js`)).status, 404);
});

test('never prunes the build latest.json sends the stable page to, till it names another', async () => {
  const named = { headSha: sha('d4'), state: 'ready', folder: sha('d4').slice(0, 7), run: 'https://github.com/x/y/actions/runs/2' };
  assert.equal((await putJson(9, named)).status, 200);
  for (const seed of ['d4', 'e5', 'f6']) assert.equal((await putBuild(9, sha(seed), await packedBuild(sha(seed)))).status, 201);
  const folders = async () => (await (await get('/pr-preview/api/previews', auth())).json())
    .previews.find((preview) => preview.number === 9).folders.map((kept) => kept.folder);
  assert.deepEqual(await folders(), [sha('f6').slice(0, 7), sha('e5').slice(0, 7), sha('d4').slice(0, 7)]);
  assert.equal((await putJson(9, { ...named, headSha: sha('f6'), folder: sha('f6').slice(0, 7) })).status, 200);
  assert.deepEqual(await folders(), [sha('f6').slice(0, 7), sha('e5').slice(0, 7)]);
});

test('a build sent again replaces its folder whole', async () => {
  const commit = sha('d4');
  assert.equal((await putBuild(7, commit, await packedBuild(commit, { 'extra.txt': 'new' }))).status, 201);
  assert.equal(await (await get(`/pr-preview/pr-7/${commit.slice(0, 7)}/extra.txt`)).text(), 'new');
});

test('never serves what it keeps beside a build, or a path out of it', async () => {
  const folder = sha('d4').slice(0, 7);
  assert.equal((await get(`/pr-preview/pr-7/${folder}/.encoded/sw.js.br`)).status, 404);
  // (a dot-dot is resolved before it's read: it never leaves /pr-preview, nor a path out of the store)
  assert.equal((await get('/pr-preview/%2e%2e/%2e%2e/etc/passwd')).status, 404);
  assert.equal((await get(`/pr-preview/pr-7/${folder}/..%2F..%2Fx`)).status, 400);
  assert.equal((await get('/pr-preview/api/previews')).status, 401);
  assert.equal((await fetch(`${base}/pr-preview/pr-7/latest.json`, { method: 'PUT', body: '{}' })).status, 405);
});

test('a closed PR\'s previews go, and its page goes to the game', async () => {
  const removed = await fetch(`${base}/pr-preview/api/pr-7`, { method: 'DELETE', headers: auth() });
  assert.equal(removed.status, 200);
  const opened = await get(`/pr-preview/pr-7/${sha('d4').slice(0, 7)}/`, { accept: 'text/html' });
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.get('location'), 'https://last-stand.cc/');
});
