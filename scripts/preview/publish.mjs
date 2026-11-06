// What a publish run does with each item find.mjs found, on the previews service (server.mjs): a build packed and
// sent, read back at its public address, then the stable page and latest.json sent to it; a failed build said so;
// a closed PR's previews removed. And the building job's own: latest.json saying `building`. Only files are sent:
// nothing from a build runs here.
import fs from 'node:fs';
import path from 'node:path';
import { latestJson, stablePage } from './latest.mjs';
import { packFolder } from './tar.mjs';

/** PR `number`'s preview marked as building `sha`: the stable page links the previous build meanwhile (#292). */
export async function markBuilding({ server, number, sha, since, run, template, repo }) {
  const previous = (await server.latest(number))?.folder ?? null;
  await server.putPage(number, stablePage(template, { repo, number, folder: previous }));
  await server.putLatest(number, latestJson({ sha, state: 'building', folder: previous, since, run }));
}

/** A failed build said so on its stable page, which still links the last one that built. */
async function recordFailed({ server, item, template, repo }) {
  const previous = (await server.latest(item.number))?.folder ?? null;
  const name = `${repo.owner}/${repo.repo}`;
  await server.putPage(item.number, stablePage(template, { repo: name, number: item.number, folder: previous }));
  await server.putLatest(item.number, latestJson({ sha: item.sha, state: 'failed', folder: previous, run: item.run }));
  return { number: item.number, sha: item.sha, state: 'build-failed' };
}

/** Whether PR `number`'s head is still `sha`: a newer push's own publish says what's newest, not this one. */
async function stillHead(github, repo, number, sha) {
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  return pr.state === 'open' && pr.head.sha === sha;
}

/** Build `item` sent and checked, `onStage(stage, detail)` told as it goes: what it came to. */
async function publishBuild({ github, repo, server, item, template, scratch, onStage }) {
  const folder = item.sha.slice(0, 7);
  const site = path.join(item.site, folder);
  const result = { number: item.number, sha: item.sha };
  if (!fs.existsSync(path.join(site, 'index.html'))) {
    // (a branch from before #299 builds for the preview's root: rebased onto main, it builds a folder)
    return { ...result, state: 'failed', why: `the build has no \`${folder}/\` folder: rebase the PR onto main` };
  }
  const archive = path.join(scratch, `pr-${item.number}-${folder}.tar.gz`);
  const { bytes } = await packFolder(site, archive);
  await onStage('uploading', `${(bytes / 1048576).toFixed(1)} MB packed`);
  const started = Date.now();
  const sent = await server.putBuild(item.number, item.sha, archive);
  const seconds = (Date.now() - started) / 1000;
  fs.rmSync(archive, { force: true });
  await onStage('serving');
  const link = server.folderUrl(item.number, item.sha);
  if (!(await server.served(item.number, item.sha))) {
    return { ...result, state: 'failed', link, why: `it was sent, but ${link} doesn't serve it` };
  }
  const timing = { bytes, files: sent.files, seconds };
  if (!(await stillHead(github, repo, item.number, item.sha))) return { ...result, state: 'superseded', link, ...timing };
  const name = `${repo.owner}/${repo.repo}`;
  await server.putPage(item.number, stablePage(template, { repo: name, number: item.number, folder }));
  await server.putLatest(item.number, latestJson({ sha: item.sha, state: 'ready', folder, run: item.run }));
  return { ...result, state: 'ready', link, ...timing };
}

/** Each of `items` done in turn: what each came to, { number, sha?, state, link?, why? }. A failure on one is said
 *  on it and the rest still go. */
export async function publishItems({ github, repo, server, items, template, scratch, onStage, log }) {
  const results = [];
  for (const item of items) {
    try {
      if (item.mode === 'remove') {
        await server.remove(item.number);
        results.push({ number: item.number, state: 'removed' });
      } else if (item.mode === 'failed') {
        results.push(await recordFailed({ server, item, template, repo }));
      } else {
        const told = (stage, detail) => onStage(item, stage, detail);
        results.push(await publishBuild({ github, repo, server, item, template, scratch, onStage: told }));
      }
    } catch (error) {
      log(`PR #${item.number}: ${error.message}`);
      results.push({ number: item.number, sha: item.sha, state: 'failed', why: error.message });
    }
    const last = results.at(-1);
    log(`PR #${item.number}: ${last.state}${last.seconds ? ` (sent in ${last.seconds.toFixed(1)} s)` : ''}`);
  }
  return results;
}
