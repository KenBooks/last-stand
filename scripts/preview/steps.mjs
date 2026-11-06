// pr-preview.yml's steps, each called from actions/github-script with what it gives (github, context, core, exec).
// They read the workflow's environment (PREVIEW_ORIGIN: the previews service; PREVIEWS_TOKEN: its secret) and pass
// what's to publish between steps in a file under RUNNER_TEMP; what they do is in the modules beside this one,
// which the tests drive.
import fs from 'node:fs';
import path from 'node:path';
import { buildingMessage, itemMessage, progressMessage, say } from './comments.mjs';
import { findItems } from './find.mjs';
import { readJson } from './latest.mjs';
import { markBuilding, publishItems } from './publish.mjs';
import { previewServer } from './server.mjs';

const env = (name) => process.env[name] ?? '';
const workspace = (...parts) => path.join(env('GITHUB_WORKSPACE'), ...parts);
const temp = (...parts) => path.join(env('RUNNER_TEMP'), ...parts);
const template = () => fs.readFileSync(workspace('trusted', '.github', 'preview-index.html'), 'utf8');
const runUrl = (context) => `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
const itemsFile = () => temp('preview-items.json');

/** The previews service, as the workflow's environment names it. */
export function serverFromEnv() {
  const origin = env('PREVIEW_ORIGIN').replace(/\/$/, '');
  if (!/^https:\/\/[^/]+$/.test(origin)) throw new Error(`PREVIEW_ORIGIN must be an https origin, not ${origin || 'unset'}`);
  if (!env('PREVIEWS_TOKEN')) throw new Error('PREVIEWS_TOKEN is unset: the preview server\'s secret (pr-preview environment)');
  return previewServer({ origin, token: env('PREVIEWS_TOKEN'), fetch });
}

/** The open PR whose head is `sha`, or undefined. */
async function openPrFor(github, repo, sha) {
  const prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', per_page: 100 });
  return prs.find((pr) => pr.head.sha === sha);
}

/** A comment not updated never fails the job. */
async function sayQuietly({ github, context, core }, number, message) {
  try {
    await say(github, context.repo, number, message);
  } catch (error) {
    core.warning(`the comment on #${number} wasn't updated: ${error.message}`);
  }
}

// ---- the building job ----

/** The open PR the build is for marked as building, its comment and stable page saying so; nothing once the build
 *  is done (the publish's by then: "building" would overwrite its link). */
export async function markBuildingPr({ github, context, core }) {
  const run = context.payload.workflow_run;
  const { data: build } = await github.rest.actions.getWorkflowRun({ ...context.repo, run_id: run.id });
  if (build.status === 'completed') {
    core.info('build already finished');
    return;
  }
  const pr = await openPrFor(github, context.repo, run.head_sha);
  if (!pr) return;
  await markBuilding({
    server: serverFromEnv(),
    number: pr.number,
    sha: run.head_sha,
    since: run.created_at,
    run: run.html_url,
    template: template(),
    repo: env('GITHUB_REPOSITORY'),
  });
  await sayQuietly({ github, context, core }, pr.number, buildingMessage({ sha: run.head_sha, run: run.html_url }));
}

// ---- the publish job ----

/** gh writes the artifact's plain files inside `dir`, never a link or a path out of it. */
async function downloadArtifact(exec, repo, build) {
  const dir = temp('runs', String(build.id));
  const args = ['run', 'download', String(build.id), '--repo', `${repo.owner}/${repo.repo}`, '--name', 'pr-preview'];
  await exec.exec('gh', [...args, '--dir', dir], { ignoreReturnCode: true });
  return { claim: readJson(path.join(dir, 'pr.json')), site: path.join(dir, 'site') };
}

export async function findPublish({ github, context, core, exec }) {
  const repo = context.repo;
  const server = serverFromEnv();
  core.info(`previews served from ${server.origin}`);
  const items = await findItems({
    github,
    repo,
    store: server,
    trigger: context.payload.workflow_run,
    fetchArtifact: (build) => downloadArtifact(exec, repo, build),
    log: (line) => core.info(line),
  });
  fs.writeFileSync(itemsFile(), JSON.stringify(items));
  core.setOutput('count', String(items.length));
}

/** Each item published, removed or said to have failed on the service, and each PR's comment saying what came of
 *  it: as it goes (the publish's checklist) and once done. */
export async function publish({ github, context, core }) {
  const items = readJson(itemsFile()) ?? [];
  const server = serverFromEnv();
  const scratch = temp('archives');
  fs.mkdirSync(scratch, { recursive: true });
  const thisRun = runUrl(context);
  const onStage = async (item, stage, detail) => {
    const message = progressMessage({ sha: item.sha, build: item.run, run: thisRun, stage, detail });
    await sayQuietly({ github, context, core }, item.number, message);
  };
  const results = await publishItems({
    github,
    repo: context.repo,
    server,
    items,
    template: template(),
    scratch,
    onStage,
    log: (line) => core.info(line),
  });
  for (const [i, item] of items.entries()) {
    const message = itemMessage(item, results[i], { server, thisRun });
    if (message) await sayQuietly({ github, context, core }, item.number, message);
  }
  const failed = results.filter((result) => result.state === 'failed');
  if (failed.length > 0) core.setFailed(`${failed.length} preview(s) not published: ${failed.map((r) => `#${r.number}`).join(', ')}`);
}
