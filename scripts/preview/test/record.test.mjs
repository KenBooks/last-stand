// After the deploy (record.mjs): a build is ready only once Pages serves its probes and its metadata; the comments
// (comments.mjs) and the gh-pages commits (git.mjs) say what came of each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MARKER, duration, itemMessage, progressMessage, say } from '../comments.mjs';
import { commitChanges, commitMessage } from '../git.mjs';
import { recordItems, waitServed } from '../record.mjs';
import { REPO, fakeGithub, readJsonFile, tempDir, writeFiles } from './fakes.mjs';

const SHA = '1234567'.padEnd(40, 'a');
const FOLDER_URL = 'https://site.test/pr-preview/pr-7/1234567';

/** A site that serves `files` (url: body) from the `from`th request on; everything else is a 404. */
function site(files, { from = 1 } = {}) {
  let requests = 0;
  return async (url) => {
    requests += 1;
    const body = requests >= from ? files[url] : undefined;
    return { ok: body !== undefined, text: async () => body };
  };
}

const served = (sha = SHA) => ({
  [`${FOLDER_URL}/served-3.txt`]: `${sha}\n`,
  [`${FOLDER_URL}/served-4.txt`]: `${sha}\n`,
  [`${FOLDER_URL}/preview-metadata.json`]: JSON.stringify({ headSha: sha }),
});

async function wait(fetch, probes = 6, onProbe = undefined) {
  let slept = 0;
  const ok = await waitServed({
    onProbe,
    fetch,
    sleep: async () => { slept += 1; },
    folderUrl: FOLDER_URL,
    sha: SHA,
    probes,
    every: 5000,
    log: () => {},
  });
  return { ok, slept };
}

test('a build is ready once a probe and its metadata are served', async () => {
  // probes 1 and 2 are 404s (as the CDN may have cached them), the third is served
  assert.deepEqual(await wait(site(served())), { ok: true, slept: 2 });
});

test('each probe is told before it is asked for, so the comment can say how long Pages has been waited for', async () => {
  const told = [];
  await wait(site(served()), 6, async (probe) => { told.push(probe); });
  assert.deepEqual(told, [1, 2, 3]);
});

test('a probe served with an older build behind it is not ready', async () => {
  const files = { ...served(), [`${FOLDER_URL}/preview-metadata.json`]: JSON.stringify({ headSha: 'old' }) };
  assert.equal((await wait(site(files))).ok, false);
});

test('a build never served is not ready, after every probe', async () => {
  assert.deepEqual(await wait(site({}), 4), { ok: false, slept: 4 });
});

test('a network error counts as not served yet', async () => {
  let calls = 0;
  const flaky = async (url) => {
    calls += 1;
    if (calls === 1) throw new Error('ECONNRESET');
    return site(served())(url);
  };
  assert.equal((await wait(flaky)).ok, true);
});

test('latest.json records each folder build ready or unserved, and each failed build', async (t) => {
  const pagesDir = tempDir(t);
  writeFiles(pagesDir, { 'pr-preview/pr-8/latest.json': JSON.stringify({ folder: 'abcdef0' }) });
  const shaB = 'b'.repeat(40);
  const results = await recordItems({
    pagesDir,
    origin: 'https://site.test',
    deployed: true,
    staged: [
      { number: 7, sha: SHA, run: 'r7', layout: 'folder' },
      { number: 8, sha: shaB, run: 'r8', layout: 'folder' },
      { number: 9, state: 'removed' },
    ],
    failed: [{ number: 10, sha: 'c'.repeat(40), run: 'r10' }],
    probe: async (url) => url === FOLDER_URL,
  });
  assert.deepEqual(results.map(({ number, state }) => ({ number, state })), [
    { number: 7, state: 'ready' },
    { number: 8, state: 'unserved' },
    { number: 10, state: 'build-failed' },
  ]);
  const latest = (number) => readJsonFile(path.join(pagesDir, 'pr-preview', `pr-${number}`, 'latest.json'));
  assert.deepEqual(latest(7), { headSha: SHA, state: 'ready', folder: '1234567', run: 'r7' });
  // the stable page stays on the last build that was served, the new one named as pending (not settled: the next
  // publish run checks it again)
  assert.deepEqual(latest(8), { headSha: shaB, state: 'unserved', folder: 'abcdef0', pending: 'bbbbbbb', run: 'r8' });
  assert.equal(latest(10).state, 'failed');
});

test('nothing is probed when the deploy failed', async (t) => {
  const pagesDir = tempDir(t);
  let probed = false;
  const results = await recordItems({
    pagesDir,
    origin: 'https://site.test',
    deployed: false,
    staged: [{ number: 7, sha: SHA, run: 'r7', layout: 'folder' }],
    failed: [],
    probe: async () => { probed = true; return true; },
  });
  assert.equal(probed, false);
  assert.equal(results[0].state, 'undeployed');
  const latest = readJsonFile(path.join(pagesDir, 'pr-preview', 'pr-7', 'latest.json'));
  assert.equal(latest.state, 'unserved');
});

test('each item gets the comment its result calls for', () => {
  const links = { origin: 'https://site.test', thisRun: 'https://run' };
  const publish = { number: 7, mode: 'publish', sha: SHA, run: 'https://build' };
  const ready = itemMessage(publish, { state: 'ready', link: `${FOLDER_URL}/` }, links);
  assert.match(ready, /ready for `1234567a+`/);
  assert.match(ready, /\[Open preview\]\(https:\/\/site\.test\/pr-preview\/pr-7\/1234567\/\)/);
  assert.match(ready, /\[pr-7\/\]\(https:\/\/site\.test\/pr-preview\/pr-7\/\)/);
  const unserved = itemMessage(publish, { state: 'unserved', link: `${FOLDER_URL}/` }, links);
  assert.match(unserved, /published `1234567a+`; GitHub Pages deployed it but wasn't serving it yet/);
  assert.match(unserved, /\(https:\/\/site\.test\/pr-preview\/pr-7\/1234567\/\)/);
  assert.doesNotMatch(unserved, /failed/);
  assert.match(itemMessage(publish, { state: 'undeployed' }, links), /publication failed[\s\S]*https:\/\/run/);
  assert.match(itemMessage(publish, undefined, links), /publication failed/);
  assert.match(itemMessage({ ...publish, mode: 'failed' }, undefined, links), /build failed[\s\S]*https:\/\/build/);
  assert.equal(itemMessage({ number: 7, mode: 'remove' }, { state: 'removed' }, links), '**PR preview:** removed.');
});

test('a publish under way is a checklist: stages done, the one under way with where it is, those to come', () => {
  const deploying = progressMessage({
    sha: SHA, build: 'https://build', run: 'https://run', stage: 'deploying', detail: 'queued, 20 s',
  });
  assert.match(deploying, /publishing `1234567a+`/);
  assert.deepEqual(deploying.split('\n').filter((line) => line.startsWith('- ')), [
    '- ✅ Built ([its run](https://build))',
    '- ✅ Copied onto gh-pages',
    '- ⏳ **Deploying to GitHub Pages**: queued, 20 s',
    '- ⬜ Served by GitHub Pages',
  ]);
  assert.match(deploying, /\[Watch it publish\]\(https:\/\/run\)/);
  const staging = progressMessage({ sha: SHA, build: 'b', run: 'r', stage: 'staging' });
  assert.match(staging, /- ⏳ \*\*Copying it onto gh-pages\*\*\n- ⬜ Deployed to GitHub Pages/);
  assert.deepEqual([duration(0), duration(44.6), duration(60), duration(125)], ['0 s', '45 s', '1 min 00 s', '2 min 05 s']);
});

test("the sticky comment is the bot's marked one, edited; else a new one", async () => {
  const comments = {
    7: [
      { id: 1, user: { type: 'User' }, body: `quoted ${MARKER}` },
      { id: 2, user: { type: 'Bot' }, body: `old\n${MARKER}` },
    ],
  };
  const github = fakeGithub({ comments });
  await say(github, REPO, 7, 'new');
  await say(github, REPO, 8, 'first');
  assert.deepEqual(github.writes, [
    { update: { ...REPO, comment_id: 2, body: `new\n${MARKER}` } },
    { create: { ...REPO, issue_number: 8, body: `first\n${MARKER}` } },
  ]);
});

test("one PR's line is the commit's subject; several are its body", () => {
  assert.equal(commitMessage(['#7: publish abc']), 'Preview PR #7: publish abc\n');
  assert.equal(commitMessage(['#7: remove', '#8: remove']), 'Preview 2 PRs\n\n#7: remove\n#8: remove\n');
});

test('a checkout is committed only when something changed', (t) => {
  const dir = tempDir(t);
  execFileSync('git', ['init', '-q', dir]);
  writeFiles(dir, { 'pr-preview/pr-7/latest.json': '{}' });
  assert.deepEqual(commitChanges(dir, ['#7: ready abc'], { push: false }), ['pr-preview/pr-7/latest.json']);
  assert.deepEqual(commitChanges(dir, ['#7: ready abc'], { push: false }), []);
  const log = execFileSync('git', ['-C', dir, 'log', '--format=%s %an'], { encoding: 'utf8' });
  assert.equal(log.trim(), 'Preview PR #7: ready abc github-actions[bot]');
  assert.ok(fs.existsSync(path.join(dir, '.git')));
});
