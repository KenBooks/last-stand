// pr-preview.yml's steps, each called from actions/github-script with what it gives (github, context, core, exec).
// They read the workflow's environment and pass state between steps in files under RUNNER_TEMP; what they do is in
// the modules beside this one, which the tests drive.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { needsDeploy, openPrFor, stageBuilding } from './building.mjs';
import { buildingMessage, itemMessage, publishingMessage, say } from './comments.mjs';
import { findItems } from './find.mjs';
import { artifactId, deployPages } from './deploy.mjs';
import { commitChanges, headCommit } from './git.mjs';
import { pagesApi, readJson } from './pages.mjs';
import { recordItems, waitServed } from './record.mjs';
import { stageItems } from './stage.mjs';

const env = (name) => process.env[name] ?? '';
const workspace = (...parts) => path.join(env('GITHUB_WORKSPACE'), ...parts);
const temp = (...parts) => path.join(env('RUNNER_TEMP'), ...parts);
const pagesDir = () => workspace('pages');
const template = () => fs.readFileSync(workspace('trusted', '.github', 'preview-index.html'), 'utf8');
const runUrl = (context) => `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
const files = { items: () => temp('preview-items.json'), staged: () => temp('preview-staged.json') };

/** Where Pages serves the site, as its settings have it (a custom domain's, `https://last-stand.cc`, once one is set:
 *  the github.io URL then answers with a redirect, and the probes read that and failed); SITE_ORIGIN, if set, wins. */
export async function siteOrigin(github, repo) {
  let origin = env('ASKED_ORIGIN');
  if (!origin) {
    try {
      origin = (await github.rest.repos.getPages(repo)).data.html_url ?? '';
    } catch {
      origin = '';
    }
  }
  return (origin || `https://${repo.owner}.github.io/${repo.repo}`).replace(/\/$/, '');
}

// ---- the building job ----

/** The open PR the build is for, its comment saying so; none once the build is done (the publish's then). */
export async function findBuildingPr({ github, context, core }) {
  const run = context.payload.workflow_run;
  // this job can wait for a runner (or the group) longer than a quick build takes: "building" would overwrite the
  // publish's link
  const { data: build } = await github.rest.actions.getWorkflowRun({ ...context.repo, run_id: run.id });
  if (build.status === 'completed') {
    core.info('build already finished');
    core.setOutput('number', '');
    return;
  }
  const pr = await openPrFor(github, context.repo, run.head_sha);
  core.setOutput('number', String(pr?.number ?? ''));
  if (pr) await say(github, context.repo, pr.number, buildingMessage({ sha: run.head_sha, run: run.html_url }));
}

export function markBuilding({ context, core }) {
  const run = context.payload.workflow_run;
  const number = Number(env('PR_NUMBER'));
  stageBuilding({
    pagesDir: pagesDir(),
    number,
    sha: run.head_sha,
    since: run.created_at,
    run: run.html_url,
    template: template(),
    repo: env('GITHUB_REPOSITORY'),
  });
  const changed = commitChanges(pagesDir(), [`#${number}: building ${run.head_sha}`]);
  core.setOutput('deploy', String(needsDeploy(changed)));
}

// ---- both jobs ----

/** This run's Pages artifact deployed, named by the gh-pages commit checked out, and waited for until Pages
 *  reports that deployment live (deploy.mjs says why not actions/deploy-pages). */
export async function deployStaged({ github, context, core }) {
  const repo = context.repo;
  const artifact = await artifactId(github, repo, context.runId);
  if (!artifact) {
    core.setFailed('no github-pages artifact in this run');
    return;
  }
  const live = await deployPages({
    github,
    repo,
    artifact,
    version: headCommit(pagesDir()),
    idToken: await core.getIDToken(),
    sleep,
    now: Date.now,
    every: Number(env('DEPLOY_CHECK_SECONDS')) * 1000,
    timeout: Number(env('DEPLOY_TIMEOUT_MINUTES')) * 60 * 1000,
    log: (line) => core.info(line),
  });
  if (!live) core.setFailed('Pages did not deploy the artifact');
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
  const origin = await siteOrigin(github, repo);
  core.exportVariable('SITE_ORIGIN', origin);
  core.info(`Pages serves the site at ${origin}`);
  const items = await findItems({
    github,
    repo,
    pages: pagesApi(github, repo),
    trigger: context.payload.workflow_run,
    fetchArtifact: (build) => downloadArtifact(exec, repo, build),
    log: (line) => core.info(line),
  });
  fs.writeFileSync(files.items(), JSON.stringify(items));
  fs.writeFileSync(files.staged(), '[]');
  core.setOutput('count', String(items.length));
  core.setOutput('stage', String(items.some((item) => item.mode !== 'failed')));
  // from here the comment links this run, which the deploy and the probes still take minutes of
  for (const item of items.filter((each) => each.mode === 'publish')) {
    await say(github, repo, item.number, publishingMessage({ sha: item.sha, run: runUrl(context) }));
  }
}

export function stagePublish({ core }) {
  const items = readJson(files.items());
  const staged = stageItems({
    pagesDir: pagesDir(),
    items,
    origin: env('SITE_ORIGIN'),
    template: template(),
    repo: env('GITHUB_REPOSITORY'),
    keepFolders: Number(env('KEEP_FOLDERS')),
    probes: Number(env('PROBES')),
    now: new Date(),
  });
  const lines = items
    .filter((item) => item.mode !== 'failed')
    .map((item) => `#${item.number}: ${item.mode} ${item.sha ?? ''}`.trimEnd());
  const changed = commitChanges(pagesDir(), lines);
  // written once pushed: what's removed or at the root is done then
  fs.writeFileSync(files.staged(), JSON.stringify(staged));
  core.setOutput('changed', String(changed.length > 0));
}

export async function recordPublish({ core }) {
  const items = readJson(files.items());
  const staged = readJson(files.staged()) ?? [];
  const deploy = env('DEPLOY');
  const results = await recordItems({
    pagesDir: pagesDir(),
    staged,
    failed: items.filter((item) => item.mode === 'failed'),
    deployed: deploy !== 'failure' && deploy !== 'cancelled',
    origin: env('SITE_ORIGIN'),
    probe: (folderUrl, sha) => waitServed({
      fetch,
      sleep,
      folderUrl,
      sha,
      probes: Number(env('PROBES')),
      every: Number(env('PROBE_EVERY_SECONDS')) * 1000,
      log: (line) => core.info(line),
    }),
  });
  // latest.json is read by the stable page from the branch: no deploy needed (Pages' copy is its fallback alone)
  commitChanges(pagesDir(), results.map((result) => `#${result.number}: ${result.state} ${result.sha}`));
  const done = staged.filter((entry) => entry.state).concat(results);
  fs.writeFileSync(files.staged(), JSON.stringify(done));
  // deployed but not served yet: Pages catching up, which the next publish run checks again (not a failure)
  const unserved = results.filter((result) => result.state === 'unserved').length;
  if (unserved > 0) core.warning(`${unserved} build(s) deployed but not served yet: the next publish checks again`);
  const undeployed = results.filter((result) => result.state === 'undeployed').length;
  if (undeployed > 0) core.setFailed(`${undeployed} build(s) not deployed`);
}

export async function commentPublish({ github, context }) {
  const repo = context.repo;
  const results = new Map((readJson(files.staged()) ?? []).map((result) => [result.number, result]));
  const links = { origin: env('SITE_ORIGIN'), thisRun: runUrl(context) };
  for (const item of readJson(files.items()) ?? []) {
    await say(github, repo, item.number, itemMessage(item, results.get(item.number), links));
  }
}
