// Which builds a publish run publishes (find.mjs): its own, the ones a cancelled publish left, and never one whose
// pr.json the API doesn't back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findItems, newestFinished } from '../find.mjs';
import { pagesApi } from '../pages.mjs';
import { REPO, fakeGithub, pr, run } from './fakes.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

/** What a build's artifact says: { runId: claim }; a build missing from it has no pr.json. */
const artifacts = (claims) => async (build) => ({ claim: claims[build.id] ?? null, site: `/runs/${build.id}/site` });

/** findItems over a fake API, its items reduced to { number, mode, id }. */
async function itemsOf(setup, { trigger, claims = {} } = {}) {
  const github = fakeGithub(setup);
  const items = await findItems({
    github,
    repo: REPO,
    pages: pagesApi(github, REPO),
    trigger,
    fetchArtifact: artifacts(claims),
    log: () => {},
  });
  return items.map(({ number, mode, id }) => ({ number, mode, id }));
}

/** One PR at `SHA_A` with build 10, gh-pages' latest.json for it as given. */
const onePr = (latestJson) => ({
  pulls: [pr(7, SHA_A)],
  runs: [run(10, SHA_A)],
  pages: { 'pr-preview/pr-7/latest.json': latestJson },
});

const latest = (sha, state, runId) => ({
  headSha: sha,
  state,
  folder: sha.slice(0, 7),
  run: `https://github.com/owner/game/actions/runs/${runId}`,
});

test('the build that triggered the run is published', async () => {
  const items = await itemsOf(
    onePr(latest(SHA_A, 'building', 10)),
    { trigger: run(10, SHA_A), claims: { 10: { number: 7, action: 'synchronize' } } },
  );
  assert.deepEqual(items, [{ number: 7, mode: 'publish', id: 10 }]);
});

test('a build whose publish was cancelled is caught up by the next run', async () => {
  const items = await itemsOf(
    {
      pulls: [pr(7, SHA_A), pr(8, SHA_B)],
      runs: [run(10, SHA_A), run(11, SHA_B)],
      pages: {
        'pr-preview/pr-7/latest.json': latest(SHA_A, 'building', 10),
        'pr-preview/pr-8/latest.json': latest(SHA_B, 'building', 11),
      },
    },
    { trigger: run(11, SHA_B), claims: { 10: { number: 7, action: 'opened' }, 11: { number: 8, action: 'opened' } } },
  );
  assert.deepEqual(items, [
    { number: 8, mode: 'publish', id: 11 },
    { number: 7, mode: 'publish', id: 10 },
  ]);
});

test('a dispatched run catches up without a trigger, and leaves what is published', async () => {
  const items = await itemsOf(
    {
      pulls: [pr(7, SHA_A), pr(8, SHA_B), pr(9, SHA_C)],
      runs: [run(10, SHA_A), run(11, SHA_B), run(12, SHA_C)],
      pages: {
        'pr-preview/pr-7/latest.json': latest(SHA_A, 'ready', 10),
        'pr-preview/pr-8/latest.json': latest(SHA_B, 'failed', 11),
        // published at the preview's root, before #299
        'pr-preview/pr-9/preview-metadata.json': { headSha: SHA_C },
      },
    },
    { claims: { 10: { number: 7 }, 11: { number: 8 }, 12: { number: 9 } } },
  );
  assert.deepEqual(items, []);
});

test('a build deployed but not served yet is published again by the next run, its own included', async () => {
  const unserved = onePr(latest(SHA_A, 'unserved', 10));
  const caughtUp = await itemsOf(unserved, { claims: { 10: { number: 7 } } });
  assert.deepEqual(caughtUp, [{ number: 7, mode: 'publish', id: 10 }]);
  const again = await itemsOf(unserved, { trigger: run(10, SHA_A), claims: { 10: { number: 7, action: 'opened' } } });
  assert.deepEqual(again, [{ number: 7, mode: 'publish', id: 10 }]);
});

test("a build a catch-up published isn't published again when its own run comes", async () => {
  const items = await itemsOf(
    onePr(latest(SHA_A, 'ready', 10)),
    { trigger: run(10, SHA_A), claims: { 10: { number: 7, action: 'opened' } } },
  );
  assert.deepEqual(items, []);
});

test('a build of a commit the PR has moved past is skipped', async () => {
  const items = await itemsOf(
    { pulls: [pr(7, SHA_B)], runs: [run(10, SHA_A)] },
    { trigger: run(10, SHA_A), claims: { 10: { number: 7, action: 'synchronize' } } },
  );
  assert.deepEqual(items, []);
});

test("a pr.json naming another PR is believed only if that PR's head is the commit built", async () => {
  // a fork's build claims PR 8, whose head is another commit: nothing is published for it
  const items = await itemsOf(
    { pulls: [pr(7, SHA_A), pr(8, SHA_B)], runs: [run(10, SHA_A)], pages: {} },
    { trigger: run(10, SHA_A), claims: { 10: { number: 8, action: 'opened' } } },
  );
  assert.deepEqual(items, []);
});

test('a pr.json without a whole positive PR number is skipped', async () => {
  for (const number of [0, -3, 1.5, '7', null]) {
    const items = await itemsOf(
      onePr(latest(SHA_A, 'ready', 9)),
      { trigger: run(10, SHA_A), claims: { 10: { number, action: 'opened' } } },
    );
    assert.deepEqual(items, [], `number ${JSON.stringify(number)}`);
  }
});

test('a failed build, or one without its pr.json, is said to have failed on its open PR', async () => {
  const failed = await itemsOf({ pulls: [pr(7, SHA_A)], runs: [run(10, SHA_A, { conclusion: 'failure' })] });
  assert.deepEqual(failed, [{ number: 7, mode: 'failed', id: 10 }]);
  const noClaim = await itemsOf({ pulls: [pr(7, SHA_A)], runs: [run(10, SHA_A)] });
  assert.deepEqual(noClaim, [{ number: 7, mode: 'failed', id: 10 }]);
});

test('cancelled and skipped builds publish nothing of their own', async () => {
  for (const conclusion of ['cancelled', 'skipped']) {
    const trigger = run(10, SHA_A, { conclusion });
    const items = await itemsOf({ pulls: [pr(7, SHA_A)], runs: [trigger] }, { trigger, claims: { 10: { number: 7 } } });
    assert.deepEqual(items, [], conclusion);
  }
});

test('a PR closed unmerged has its preview removed; a merged one is left for production', async () => {
  const closedRun = run(10, SHA_A);
  const unmerged = await itemsOf(
    { pulls: [pr(7, SHA_A, { state: 'closed' })], runs: [closedRun] },
    { trigger: closedRun, claims: { 10: { number: 7, action: 'closed' } } },
  );
  assert.deepEqual(unmerged, [{ number: 7, mode: 'remove', id: 10 }]);
  const merged = await itemsOf(
    { pulls: [pr(7, SHA_A, { state: 'closed', merged: true })], runs: [closedRun] },
    { trigger: closedRun, claims: { 10: { number: 7, action: 'closed' } } },
  );
  assert.deepEqual(merged, []);
});

test('a removal that was lost is caught up from what gh-pages still holds', async () => {
  const items = await itemsOf({
    pulls: [pr(7, SHA_A, { state: 'closed' }), pr(8, SHA_B, { state: 'closed', merged: true })],
    pages: { 'pr-preview': 'dir', 'pr-preview/pr-7': 'dir', 'pr-preview/pr-8': 'dir', 'pr-preview/index.html': 'x' },
  });
  assert.deepEqual(items, [{ number: 7, mode: 'remove', id: 0 }]);
});

test('the newest finished build is caught up, unless a newer one is still running', () => {
  const older = run(10, SHA_A, { createdAt: '2026-10-31T16:00:00Z' });
  const newer = run(11, SHA_A, { createdAt: '2026-10-31T16:05:00Z' });
  const running = run(12, SHA_A, { status: 'in_progress', conclusion: null, createdAt: '2026-10-31T16:09:00Z' });
  const cancelled = run(13, SHA_A, { conclusion: 'cancelled', createdAt: '2026-10-31T16:10:00Z' });
  assert.equal(newestFinished([older, newer])?.id, 11);
  assert.equal(newestFinished([older, newer, cancelled])?.id, 11);
  assert.equal(newestFinished([older, newer, running]), null);
  assert.equal(newestFinished([cancelled]), null);
});

test("two builds of one PR's head publish once, the newest", async () => {
  const items = await itemsOf(
    { pulls: [pr(7, SHA_A)], runs: [run(10, SHA_A, { createdAt: '2026-10-31T16:00:00Z' })] },
    { trigger: run(14, SHA_A), claims: { 10: { number: 7, action: 'opened' }, 14: { number: 7, action: 'reopened' } } },
  );
  assert.deepEqual(items, [{ number: 7, mode: 'publish', id: 14 }]);
});
