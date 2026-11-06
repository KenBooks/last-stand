// The Pages deploy (deploy.mjs): named by the gh-pages commit, waited for by its own status, never another's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACT, artifactId, deployPages } from '../deploy.mjs';
import { REPO } from './fakes.mjs';

const VERSION = 'f'.repeat(40);

/** Pages as the API shows it: each deployment's statuses in turn, by name (the last one repeats). An unnamed
 *  deployment's status is 'succeed', as Pages answered for an older deployment of the same name. */
function fakePages(statuses) {
  const asked = { created: [], cancelled: [] };
  const seen = {};
  const request = async (route, params) => {
    if (route === 'POST /repos/{owner}/{repo}/pages/deployments') {
      asked.created.push(params);
      return { data: { id: params.pages_build_version } };
    }
    if (route.endsWith('/cancel')) {
      asked.cancelled.push(params.pages_deployment_id);
      return { data: {} };
    }
    const id = params.pages_deployment_id;
    const list = statuses[id];
    if (!list) return { data: { status: 'succeed' } };
    seen[id] = (seen[id] ?? -1) + 1;
    const status = list[Math.min(seen[id], list.length - 1)];
    if (status instanceof Error) throw status;
    return { data: { status } };
  };
  return { asked, github: { request } };
}

/** deployPages on a fake clock, 5 s a check: { live, seconds, asked }. */
async function deploy(statuses, { timeout = 60000 } = {}) {
  const { asked, github } = fakePages(statuses);
  let clock = 0;
  const live = await deployPages({
    github,
    repo: REPO,
    artifact: 42,
    version: VERSION,
    idToken: 'oidc',
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
    every: 5000,
    timeout,
    log: () => {},
  });
  return { live, seconds: clock / 1000, asked };
}

test('a deploy is named by the commit it deploys, and waited for until that deployment succeeds', async () => {
  const statuses = ['deployment_queued', 'deployment_in_progress', 'succeed'];
  const { live, seconds, asked } = await deploy({ [VERSION]: statuses });
  assert.equal(live, true);
  assert.equal(seconds, 15);
  assert.deepEqual(asked.created, [{ ...REPO, artifact_id: 42, pages_build_version: VERSION, oidc_token: 'oidc' }]);
});

test('an unreadable status is asked again', async () => {
  const { live, seconds } = await deploy({ [VERSION]: [new Error('502'), 'succeed'] });
  assert.equal(live, true);
  assert.equal(seconds, 10);
});

test('a failed deployment is not live', async () => {
  assert.equal((await deploy({ [VERSION]: ['deployment_in_progress', 'deployment_failed'] })).live, false);
});

test('a deployment still running at the timeout is cancelled', async () => {
  const { live, asked } = await deploy({ [VERSION]: ['deployment_in_progress'] }, { timeout: 20000 });
  assert.equal(live, false);
  assert.deepEqual(asked.cancelled, [VERSION]);
});

test("this run's github-pages artifact is the one deployed", async () => {
  const github = {
    rest: {
      actions: {
        listWorkflowRunArtifacts: async ({ run_id, name }) => ({
          data: { artifacts: run_id === 9 && name === ARTIFACT ? [{ id: 42, name: ARTIFACT }] : [] },
        }),
      },
    },
  };
  assert.equal(await artifactId(github, REPO, 9), 42);
  assert.equal(await artifactId(github, REPO, 8), null);
});
