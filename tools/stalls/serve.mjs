// The trees a measure serves (tools/stalls): this tree's production build, built as `npm run build` builds it (into
// an output folder of the tool's own, so `dist` is left alone), and another commit's, exported as the lab's A/B
// exports one (`tools/lab/node/commits.mjs`: no worktree, its packages this tree's), each served by Vite's preview
// server on a port of its own.
import { build, preview } from 'vite';
import { join } from 'node:path';
import { exportCommit, exportedTreePaths } from '../lab/node/commits.mjs';

/** the port the preview servers try first (the next free one is taken if it's in use) */
const PORT = 4790;
/** the URL that stands for this tree, built and served (`--url this,https://...`: it beside production) */
export const THIS_TREE = 'this';
/** what a URL that stands for another commit starts with (`--url this,ref:HEAD~2`) */
export const REF = 'ref:';

/**
 * Builds the tree at `root` into `outDir`/dist and serves it; with `named`, unminified and with its source maps, so
 * the page's sampled JS is named as it's written (`--js`); `exported` is the repo whose packages an exported tree
 * uses. Returns its URL, the build's folder and `close`.
 */
async function serveBuild(root, outDir, { named = false, exported = null } = {}) {
  const distDir = join(outDir, 'dist');
  const naming = named ? { minify: false, sourcemap: true } : {};
  const tree = {
    root,
    configFile: join(root, 'vite.config.ts'),
    configLoader: 'runner',
    logLevel: 'warn',
    ...(exported ? { plugins: [exportedTreePaths(root, exported)] } : {}),
  };
  await build({ ...tree, build: { outDir: distDir, emptyOutDir: true, ...naming } });
  const server = await preview({
    ...tree,
    build: { outDir: distDir },
    preview: { port: PORT, strictPort: false, open: false },
  });
  return {
    url: server.resolvedUrls.local[0],
    distDir,
    close: () => server.close(),
  };
}

/** Commit `ref` exported (`exportCommit`), or why it couldn't be, as the stalls' error. */
function exportOf(repo, outDir, ref) {
  try {
    return exportCommit(repo, outDir, ref);
  } catch (error) {
    throw new Error(`stalls: --url ${REF}${ref}: ${error.message.replace(/^--ab: /, '')}`);
  }
}

/**
 * A URL as the command line names it, split into the tree it names and the query asked of its page:
 * `this?farDetail=0` is this tree's page with `?farDetail=0` (a switch of the game's measured in turns with the
 * page as it is, one build served for both). Any other URL is its own tree.
 */
export function splitEntry(entry) {
  const at = entry.indexOf('?');
  const tree = at < 0 ? entry : entry.slice(0, at);
  if (tree !== THIS_TREE && !tree.startsWith(REF)) return { tree: entry, query: '' };
  return { tree, query: at < 0 ? '' : entry.slice(at) };
}

/**
 * Serves each tree `urls` name: `this` (`repo`'s tree, built into `outDir`/dist) and `ref:<git ref>` (that commit,
 * exported into `outDir`/commits and built there), each with any query after it (`splitEntry`). Returns each such
 * URL's served one (`urlOf`), the name each URL is reported by (`nameOf`: a commit's by its ref and sha, and the
 * query asked of it), the served trees' builds by URL (`builds`), and `close`.
 */
export async function serveTrees(urls, repo, outDir, { named = false } = {}) {
  const served = new Map();
  for (const { tree: entry } of new Set(urls.map(splitEntry))) {
    if (served.has(entry)) continue;
    if (entry === THIS_TREE) {
      served.set(entry, { ...(await serveBuild(repo, outDir, { named })), name: 'this tree' });
    } else if (entry.startsWith(REF)) {
      const ref = entry.slice(REF.length);
      const { sha, dir } = exportOf(repo, outDir, ref);
      const tree = await serveBuild(dir, dir, { named, exported: repo });
      served.set(entry, { ...tree, name: `${ref} (${sha.slice(0, 7)})` });
    }
  }
  const urlOf = (entry) => {
    const { tree, query } = splitEntry(entry);
    const page = served.get(tree);
    return page ? `${page.url}${query}` : entry;
  };
  // (each URL asked for, a served tree's under its name and query)
  const asked = urls.map((entry) => ({ entry, page: served.get(splitEntry(entry).tree) })).filter(({ page }) => page);
  const names = new Map(asked.map(({ entry, page }) => [urlOf(entry), `${page.name}${splitEntry(entry).query}`]));
  return {
    urlOf,
    nameOf: (url) => names.get(url) ?? url,
    builds: new Map(asked.map(({ entry, page }) => [urlOf(entry), page.distDir])),
    close: () => Promise.all([...served.values()].map((tree) => tree.close())),
  };
}
