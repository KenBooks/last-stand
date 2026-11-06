// What the previews service keeps of a PR beside its builds, as the scripts write it: its latest.json, which the
// stable page goes by, and the stable page itself (`.github/preview-index.html`, main's copy).
import fs from 'node:fs';

/** A commit's folder in a preview: its seven characters. */
export const COMMIT_FOLDER = /^[0-9a-f]{7}$/;

/** States latest.json ends a build in; `building` still waits for its publish. */
export const SETTLED = ['ready', 'failed'];

/** latest.json: { headSha, state: building | ready | failed, folder, since?, run }. */
export function latestJson({ sha, state, folder, since, run }) {
  const latest = { headSha: sha, state, folder: COMMIT_FOLDER.test(folder ?? '') ? folder : null };
  if (since) latest.since = since;
  latest.run = run;
  return latest;
}

/** The PR's stable page (`.github/preview-index.html`, main's copy) filled in. */
export function stablePage(template, { repo, number, folder }) {
  return template
    .replaceAll('__REPO__', repo)
    .replaceAll('__PR__', String(number))
    .replaceAll('__FOLDER__', folder ?? '');
}

/** A JSON file's contents, or null when it's missing or unreadable. */
export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
