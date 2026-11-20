// The dashboard as the service serves it: an Angular app built from web/ into dist/ (web/angular.json), read once at
// a start. Its pages are never cached; its scripts and styles are named by their content's hash (`main-HQ45FZQC.js`)
// and cached for good. Nothing inline: the page's script and stylesheet are files, and the <style> elements Angular's
// components add carry a nonce made fresh for each response, which the CSP names (web/src/index.html's ngCspNonce).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = join(import.meta.dirname, 'dist');
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
/** A file named by its content's hash, as the build names its scripts and styles (the note's own style isn't). */
const HASHED = /-[A-Za-z0-9_]{8}\.(js|css)$/;

/** The dashboard's sections a browser may open by their address: the app answers each (web/src/app/app.routes.ts).
 *  The same paths asked for as JSON are the API's. */
export const PAGES = new Set(['/traces', '/traces/reports']);

/** What the build made, or null when it wasn't built (the service still takes and serves traces as JSON). */
function load() {
  if (!existsSync(join(DIST, 'index.html'))) return null;
  const files = new Map();
  for (const name of readdirSync(DIST)) {
    const type = TYPES[extname(name)];
    if (type) files.set(name, { type, body: readFileSync(join(DIST, name)), hashed: HASHED.test(name) });
  }
  return {
    viewer: readFileSync(join(DIST, 'index.html'), 'utf8'),
    note: readFileSync(join(DIST, 'note.html'), 'utf8'),
    files,
  };
}
const built = load();

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whether the page was built. */
export const pageBuilt = () => built !== null;

/** The dashboard, its script, stylesheet and components' styles allowed by `nonce` (base64, made per response). */
export const viewerPage = (nonce) => built.viewer.replaceAll('{{nonce}}', nonce);

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

/** A built script or style by its file name under /traces/, or undefined (only what the build made). */
export const asset = (name) => built?.files.get(name);
