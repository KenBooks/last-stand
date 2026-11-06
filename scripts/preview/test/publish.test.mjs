// A publish run's work (publish.mjs) against the real previews service (server/previews), started on a port of its
// own with its store in a temp folder: a build sent and served, the stable page and latest.json beside it, a newer
// push never overtaken, failures said, closed PRs removed; and the comments (comments.mjs) that say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MARKER, duration, itemMessage, progressMessage, say } from '../comments.mjs';
import { markBuilding, publishItems } from '../publish.mjs';
import { previewServer } from '../server.mjs';
import { REPO, fakeGithub, pr, tempDir, writeFiles } from './fakes.mjs';

const TOKEN = 'test-token';
const SHA_A = 'a1b2c3d'.padEnd(40, 'a');
const SHA_B = 'b2c3d4e'.padEnd(40, 'b');
const RUN = (id) => `https://github.com/owner/game/actions/runs/${id}`;
const TEMPLATE = '<p>stable __PR__ of __REPO__, last __FOLDER__</p>';
let service;
let origin;
let data;

before(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-service-'));
  const { start } = await import('../../../server/previews/previews.mjs');
  service = await start(0, { DATA: data, PREVIEWS_TOKEN: TOKEN, KEEP: '3' });
  origin = `http://127.0.0.1:${service.address().port}`;
});

after(() => {
  service?.close();
  fs.rmSync(data, { recursive: true, force: true });
});

const serverWith = (token = TOKEN) => previewServer({ origin, token, fetch });
const text = async (url) => (await fetch(url)).text();

/** A downloaded artifact's site: the build in its commit's folder. */
function siteOf(t, sha, files = {}) {
  const site = tempDir(t);
  const folder = sha.slice(0, 7);
  writeFiles(site, {
    [`${folder}/index.html`]: `<p>${sha}</p>`,
    [`${folder}/assets/index-x.js`]: 'console.log(1);\n'.repeat(100),
    ...files,
  });
  return site;
}

/** publishItems over `items`, with the stages each was told: { results, stages }. */
async function publishAll(t, items, { github = fakeGithub({ pulls: [pr(7, SHA_A)] }), server = serverWith() } = {}) {
  const stages = [];
  const results = await publishItems({
    github,
    repo: REPO,
    server,
    items,
    template: TEMPLATE,
    scratch: tempDir(t),
    onStage: async (item, stage, detail) => stages.push(`#${item.number} ${stage}${detail ? `: ${detail}` : ''}`),
    log: () => {},
  });
  return { results, stages };
}

const publishOf = (t, number, sha, runId) => ({ id: runId, mode: 'publish', number, sha, run: RUN(runId), site: siteOf(t, sha) });

test('a building push says so, linking the build before it', async () => {
  const server = serverWith();
  await markBuilding({ server, number: 7, sha: SHA_A, since: '2026-11-06T10:00:00Z', run: RUN(9), template: TEMPLATE, repo: 'owner/game' });
  assert.deepEqual(await server.latest(7), { headSha: SHA_A, state: 'building', folder: null, since: '2026-11-06T10:00:00Z', run: RUN(9) });
  assert.equal(await text(server.stableUrl(7)), '<p>stable 7 of owner/game, last </p>');
});

test('a build is sent, served at its folder, and the stable page goes to it', async (t) => {
  const { results, stages } = await publishAll(t, [publishOf(t, 7, SHA_A, 10)]);
  assert.equal(results[0].state, 'ready');
  assert.equal(results[0].link, `${origin}/pr-preview/pr-7/a1b2c3d/`);
  assert.ok(results[0].seconds >= 0 && results[0].files === 2);
  assert.match(stages[0], /^#7 uploading: \d+\.\d MB packed$/);
  assert.equal(stages[1], '#7 serving');
  assert.equal(await text(results[0].link), `<p>${SHA_A}</p>`);
  const server = serverWith();
  assert.deepEqual(await server.latest(7), { headSha: SHA_A, state: 'ready', folder: 'a1b2c3d', run: RUN(10) });
  assert.equal(await text(server.stableUrl(7)), '<p>stable 7 of owner/game, last a1b2c3d</p>');
});

test("a build whose PR moved on is kept, but never takes the newer push's place", async (t) => {
  const github = fakeGithub({ pulls: [pr(7, SHA_B)] });
  const { results } = await publishAll(t, [publishOf(t, 7, SHA_A, 11)], { github });
  assert.equal(results[0].state, 'superseded');
  assert.equal((await serverWith().latest(7)).run, RUN(10), 'latest.json is still the one before');
  assert.equal(itemMessage({ mode: 'publish', number: 7, sha: SHA_A }, results[0], { server: serverWith() }), null);
});

test('a failed build is said so, the stable page still linking the last that built', async (t) => {
  const failed = { id: 12, mode: 'failed', number: 7, sha: SHA_B, run: RUN(12), site: null };
  const { results } = await publishAll(t, [failed], { github: fakeGithub({ pulls: [pr(7, SHA_B)] }) });
  assert.equal(results[0].state, 'build-failed');
  assert.deepEqual(await serverWith().latest(7), { headSha: SHA_B, state: 'failed', folder: 'a1b2c3d', run: RUN(12) });
});

test('a build without its commit folder, or a service that turns it away, fails that item alone', async (t) => {
  const site = tempDir(t);
  writeFiles(site, { 'index.html': '<p>built for the root</p>' });
  const old = { id: 13, mode: 'publish', number: 8, sha: SHA_B, run: RUN(13), site };
  const github = fakeGithub({ pulls: [pr(7, SHA_A), pr(8, SHA_B)] });
  const { results } = await publishAll(t, [old, publishOf(t, 7, SHA_A, 14)], { github });
  assert.equal(results[0].state, 'failed');
  assert.match(results[0].why, /no `b2c3d4e\/` folder/);
  assert.equal(results[1].state, 'ready');
  const refused = await publishAll(t, [publishOf(t, 7, SHA_A, 15)], { github, server: serverWith('wrong') });
  assert.equal(refused.results[0].state, 'failed');
  assert.match(refused.results[0].why, /401/);
});

test("a closed PR's previews are removed", async (t) => {
  const { results } = await publishAll(t, [{ id: 0, mode: 'remove', number: 7 }]);
  assert.deepEqual(results, [{ number: 7, state: 'removed' }]);
  assert.equal(await serverWith().latest(7), null);
  assert.equal((await fetch(serverWith().stableUrl(7), { redirect: 'manual' })).status, 404);
});

test('the checklist ticks off each stage, the one under way with where it is', () => {
  const message = progressMessage({ sha: SHA_A, build: RUN(1), run: RUN(2), stage: 'serving' });
  assert.match(message, /- ✅ Built \(\[its run\]\(.*runs\/1\)\)\n- ✅ Sent to the preview server\n- ⏳ \*\*Checking/);
  assert.match(message, /\[Watch it publish\]\(.*runs\/2\)/);
  assert.equal(duration(125), '2 min 05 s');
});

test('what came of each item is said on its PR, in its one sticky comment', async () => {
  const server = serverWith();
  const ready = itemMessage(
    { mode: 'publish', number: 7, sha: SHA_A },
    { state: 'ready', link: `${origin}/pr-preview/pr-7/a1b2c3d/`, seconds: 3.2 },
    { server, thisRun: RUN(3) },
  );
  assert.match(ready, /ready for `a1b2c3d.*` \(3 s to send and serve\)/);
  assert.match(ready, new RegExp(`\\[pr-7/\\]\\(${origin}/pr-preview/pr-7/\\)`));
  const failed = itemMessage({ mode: 'publish', number: 7, sha: SHA_A }, { state: 'failed', why: 'boom' }, { server, thisRun: RUN(3) });
  assert.match(failed, /publication failed: boom\.\n\n\[Open workflow run\]\(.*runs\/3\)/);
  const github = fakeGithub({ comments: { 7: [{ id: 5, user: { type: 'Bot' }, body: `old\n${MARKER}` }] } });
  await say(github, REPO, 7, 'new');
  await say(github, REPO, 8, 'first');
  assert.deepEqual(github.writes.map((write) => Object.keys(write)[0]), ['update', 'create']);
  assert.equal(github.writes[0].update.body, `new\n${MARKER}`);
});
