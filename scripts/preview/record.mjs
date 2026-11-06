// After the deploy: each build is ready only once Pages serves it, read from its probe files (a 404 the CDN caches
// lands on a probe, never on the build's own files, where it would stand 10 minutes), and latest.json says so.
import { previewDir, previousFolder, writeLatest } from './pages.mjs';
import { probeFile } from './stage.mjs';

/** The body at `url`, or null when it can't be read (a 404 included). Redirects are followed. */
async function bodyOf(fetch, url) {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/** Whether Pages serves the build of `sha` at `folderUrl`: its probes are asked for in turn, `every` ms apart. */
export async function waitServed({ fetch, sleep, folderUrl, sha, probes, every, log }) {
  for (let probe = 1; probe <= probes; probe++) {
    if ((await bodyOf(fetch, `${folderUrl}/${probeFile(probe)}`))?.trim() === sha) {
      const metadata = await bodyOf(fetch, `${folderUrl}/preview-metadata.json`);
      let got = '';
      try {
        got = JSON.parse(metadata ?? '{}').headSha ?? '';
      } catch {
        got = '';
      }
      if (got === sha) {
        log(`Pages serves ${folderUrl}/ (probe ${probe})`);
        return true;
      }
      log(`Pages serves the probe but not the build's metadata (${got || 'nothing'})`);
      return false;
    }
    await sleep(every);
  }
  log(`Pages didn't serve ${folderUrl}/ within ${(probes * every) / 1000} s`);
  return false;
}

/** latest.json for a build: ready sends the stable page to its folder; failed and unserved leave it at the last
 *  one, an unserved build's own folder named as `pending` (published, Pages not serving it yet). */
export function recordBuild(pagesDir, { number, sha, run, state }) {
  const dir = previewDir(pagesDir, number);
  const own = sha.slice(0, 7);
  const folder = state === 'ready' ? own : previousFolder(dir);
  writeLatest(dir, { sha, state, folder, pending: state === 'unserved' ? own : '', run });
}

/** What a folder build came to: `ready` once served; `unserved` when deployed but not served yet, or `undeployed`
 *  when the deploy failed, both recorded `unserved` (not settled: the next publish run checks it again). */
const outcome = (deployed, served) => {
  if (served) return 'ready';
  return deployed ? 'unserved' : 'undeployed';
};

/** Each folder build probed and recorded, each failed build recorded: what each came to, with its link. */
export async function recordItems({ pagesDir, staged, failed, deployed, origin, probe }) {
  const results = [];
  for (const entry of staged.filter((built) => built.layout === 'folder')) {
    const folderUrl = `${origin}/pr-preview/pr-${entry.number}/${entry.sha.slice(0, 7)}`;
    const served = deployed && (await probe(folderUrl, entry.sha));
    const state = outcome(deployed, served);
    recordBuild(pagesDir, { ...entry, state: state === 'ready' ? 'ready' : 'unserved' });
    results.push({ number: entry.number, sha: entry.sha, state, link: `${folderUrl}/` });
  }
  for (const item of failed) {
    recordBuild(pagesDir, { ...item, state: 'failed' });
    results.push({ number: item.number, sha: item.sha, state: 'build-failed' });
  }
  return results;
}
