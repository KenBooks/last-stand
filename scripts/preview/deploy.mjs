// The aggregated gh-pages artifact deployed to Pages, waiting for that deployment's own status. actions/deploy-pages
// names a deployment by the run's commit, which on a workflow_run is main's head for every preview publish: Pages
// answered its status with an older deployment's "succeed" five seconds in, so the step went on before Pages served
// anything, the probes ran out (#329 on 2026-11-06), and the publish job's deploy was overtaken by the building job's
// still in flight, its build never served. Here each deployment is named by the gh-pages commit it deploys.

/** The artifact upload-pages-artifact made in this run. */
export const ARTIFACT = 'github-pages';

/** Pages' final states other than success (deploy-pages' list). */
const FAILED = ['deployment_failed', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost'];

/** The id of this run's `github-pages` artifact, or null. */
export async function artifactId(github, repo, runId) {
  const { data } = await github.rest.actions.listWorkflowRunArtifacts({ ...repo, run_id: runId, name: ARTIFACT });
  return data.artifacts.find((artifact) => artifact.name === ARTIFACT)?.id ?? null;
}

/** The deployment's status, or '' when it couldn't be read (asked again). */
async function statusOf(github, repo, id) {
  try {
    const { data } = await github.request('GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}', {
      ...repo,
      pages_deployment_id: id,
    });
    return data.status ?? '';
  } catch {
    return '';
  }
}

/** Artifact `artifact` deployed as `version` (unique to it): whether Pages reported it live within `timeout` ms,
 *  asked every `every` ms. A deployment that doesn't finish in time is cancelled. */
export async function deployPages({ github, repo, artifact, version, idToken, sleep, now, every, timeout, log }) {
  const { data } = await github.request('POST /repos/{owner}/{repo}/pages/deployments', {
    ...repo,
    artifact_id: artifact,
    pages_build_version: version,
    oidc_token: idToken,
  });
  const id = data.id ?? data.status_url?.split('/').pop() ?? version;
  log(`Pages deployment ${id} created for gh-pages ${version}`);
  const start = now();
  let last = '';
  while (now() - start < timeout) {
    await sleep(every);
    const status = await statusOf(github, repo, id);
    const seconds = (now() - start) / 1000;
    if (status !== last) log(`Pages deployment ${id}: ${status || 'status unreadable'} after ${seconds} s`);
    last = status;
    if (status === 'succeed') return true;
    if (FAILED.includes(status)) return false;
  }
  log(`Pages deployment ${id} didn't finish within ${timeout / 1000} s: cancelled`);
  await github
    .request('POST /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}/cancel', {
      ...repo,
      pages_deployment_id: id,
    })
    .catch(() => {});
  return false;
}
