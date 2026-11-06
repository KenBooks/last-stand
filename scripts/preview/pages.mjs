// What gh-pages holds for a PR's preview: its folder, its latest.json, read from a checkout or through GitHub's API.
import fs from 'node:fs';
import path from 'node:path';

/** A commit's folder in a preview: its seven characters. */
export const COMMIT_FOLDER = /^[0-9a-f]{7}$/;

/** States latest.json ends a build in: anything else (`building`, `unserved`: published, Pages not serving it yet)
 *  is still waiting for a publish, which the next publish run makes. */
export const SETTLED = ['ready', 'failed'];

export const previewPath = (number) => `pr-preview/pr-${number}`;

export const previewDir = (pagesDir, number) => path.join(pagesDir, 'pr-preview', `pr-${number}`);

/** A JSON file's contents, or null when it's missing or unreadable. */
export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** gh-pages through the API, as the stable page reads it: never the CDN, and nothing else writes it meanwhile. */
export function pagesApi(github, { owner, repo }) {
  const get = async (filePath) => {
    try {
      const { data } = await github.rest.repos.getContent({ owner, repo, path: filePath, ref: 'gh-pages' });
      return data;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  return {
    /** A file's JSON, or null. */
    async json(filePath) {
      const file = await get(filePath);
      if (!file?.content) return null;
      try {
        return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      } catch {
        return null;
      }
    },
    /** A directory's entries, empty when it isn't there. */
    async list(dirPath) {
      const entries = await get(dirPath);
      return Array.isArray(entries) ? entries : [];
    },
  };
}

export const latestOf = (pages, number) => pages.json(`${previewPath(number)}/latest.json`);

/** Whether PR `number`'s head `sha` is published: latest.json records it ready or failed, or (a build from before
 *  #299, published at the preview's root) the root's metadata names it. */
export async function isPublished(pages, number, sha) {
  const latest = await latestOf(pages, number);
  if (latest?.headSha === sha && SETTLED.includes(latest.state)) return true;
  const root = await pages.json(`${previewPath(number)}/preview-metadata.json`);
  return root?.headSha === sha;
}

/** latest.json, which the stable page reads: { headSha, state, folder, pending?, since?, run }. */
export function writeLatest(dir, { sha, state, folder, pending, since, run }) {
  fs.mkdirSync(dir, { recursive: true });
  const latest = { headSha: sha, state, folder: folder || null };
  if (pending) latest.pending = pending;
  if (since) latest.since = since;
  latest.run = run;
  writeJson(path.join(dir, 'latest.json'), latest);
}

/** The folder latest.json last sent the stable page to, or ''. */
export function previousFolder(dir) {
  return readJson(path.join(dir, 'latest.json'))?.folder ?? '';
}

/** The PR's stable page (`.github/preview-index.html`, main's copy) filled in. */
export function stablePage(template, { repo, number, folder }) {
  return template
    .replaceAll('__REPO__', repo)
    .replaceAll('__PR__', String(number))
    .replaceAll('__FOLDER__', folder);
}

/** Everything at a preview's top level but its commits' folders (and latest.json, when `keepLatest`) goes:
 *  what a build published at the root before #299 left. */
export function clearRoot(dir, { keepLatest }) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (COMMIT_FOLDER.test(name)) continue;
    if (keepLatest && name === 'latest.json') continue;
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}
