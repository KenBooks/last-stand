// The traces page as the service serves it: built by Vite from web/ into dist/ (web/vite.config.ts), read once at
// a start. The two pages are never cached; their scripts and styles are named by their content's hash under
// /traces/assets/ and cached for good. Nothing inline, so the CSP allows the page's own files and nothing else.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = join(import.meta.dirname, 'dist');
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/** What the build made, or null when it wasn't built (the service still takes and serves traces as JSON). */
function load() {
  if (!existsSync(join(DIST, 'index.html'))) return null;
  const assets = new Map();
  for (const name of readdirSync(join(DIST, 'assets'))) {
    const type = TYPES[extname(name)];
    if (type) assets.set(name, { type, body: readFileSync(join(DIST, 'assets', name)) });
  }
  return {
    viewer: readFileSync(join(DIST, 'index.html'), 'utf8'),
    note: readFileSync(join(DIST, 'note.html'), 'utf8'),
    assets,
  };
}
const built = load();

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whether the page was built. */
export const pageBuilt = () => built !== null;

/** The page to browse the traces. */
export const viewerPage = () => built.viewer;

/** A short page for a browser that isn't signed in, or whose link didn't hold; or, with `next` (a path on this
 *  site), one that has just signed in and moves on there at once (its own navigation, so it carries the new
 *  cookie). */
export function notePage(heading, text, next = '') {
  let html = built.note.replace('{{heading}}', escape(heading)).replace('{{text}}', escape(text));
  if (next) {
    const refresh = `<meta http-equiv="refresh" content="0; url=${escape(next)}">`;
    html = html.replace('</head>', `  ${refresh}\n</head>`);
  }
  return html;
}

/** A built script or style by its file name under /traces/assets/, or undefined (only what the build made). */
export const asset = (name) => built?.assets.get(name);
