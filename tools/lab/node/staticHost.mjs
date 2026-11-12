// A static host for a production build (tools/lab `pwa`), as GitHub Pages serves the game: its files under a path,
// kept by the browser for 10 minutes and revalidated by their ETag, what it serves swapped at once, as a deploy
// swaps it, builds put in folders under it as PR previews are, and a path it has nothing for answered with the
// build's own 404.html, as Pages answers it. Pages answers from 127.0.0.1 here, a secure context, so the game's
// offline worker registers.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

/** what each kind of file is served as */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};
/** how long the browser keeps a file before it revalidates it (s), as Pages has it */
const MAX_AGE = 600;

/** A file's ETag: its content's hash. */
const etagOf = (body) => `"${createHash('sha1').update(body).digest('hex')}"`;

export class StaticHost {
  /** `base`: the path the build is served under (`/last-stand/`, as Pages has it) */
  constructor(base) {
    this.base = base;
    this.root = null;
    this.rewrite = null;
    this.server = null;
    /** builds served in folders under the base (a PR preview's), by their folder's path under it */
    this.folders = new Map();
    this.notFoundPage = true;
    /** how long a page (an .html file) is held back before it's answered (ms): a slow network's */
    this.pageDelay = 0;
  }

  /** Holds every page back `ms` before answering it from now on (0: at once), as a slow network does. */
  slowPages(ms) {
    this.pageDelay = ms;
  }

  /** Serves the build in `root` at `folder` under the base too (`pr-preview/pr-1/aaaaaaa/`), until `unmount`. */
  mount(folder, root) {
    this.folders.set(folder, root);
  }

  /** Stops serving the build at `folder`, as a preview's folder is pruned. */
  unmount(folder) {
    this.folders.delete(folder);
  }

  /** `on`: a path with nothing is answered with the build's 404.html when it has one (Pages'), else a plain 404. */
  answerMissingWithPage(on) {
    this.notFoundPage = on;
  }

  /** Serves the build in `root` from now on; `rewrite(text)`, when given, changes its page as it's served. */
  serve(root, rewrite = null) {
    this.root = root;
    this.rewrite = rewrite;
  }

  /** Starts answering on a free port of 127.0.0.1; resolves to the build's address. */
  start() {
    this.server = http.createServer((request, response) => this.answer(request, response));
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${this.server.address().port}${this.base}`));
    });
  }

  close() {
    this.server?.closeAllConnections();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  /** The file a request's path names in the build served, or null (outside it, or none). */
  fileOf(url) {
    const path = decodeURIComponent(new URL(url, 'http://host').pathname);
    if (!path.startsWith(this.base)) return null;
    let root = this.root;
    let relative = path.slice(this.base.length);
    for (const [folder, folderRoot] of this.folders) {
      if (!relative.startsWith(folder)) continue;
      root = folderRoot;
      relative = relative.slice(folder.length);
    }
    return fileIn(root, relative || 'index.html');
  }

  /** The build's 404.html, which Pages serves for a path it has nothing for, or null. */
  notFoundFile() {
    return this.notFoundPage ? fileIn(this.root, '404.html') : null;
  }

  /** Its body as served: the page rewritten when asked. */
  bodyOf(file) {
    const body = readFileSync(file);
    if (!this.rewrite || extname(file) !== '.html') return body;
    return Buffer.from(this.rewrite(body.toString()));
  }

  answer(request, response) {
    const file = this.root ? this.fileOf(request.url) : null;
    if (!file) {
      this.answerMissing(response);
      return;
    }
    const body = this.bodyOf(file);
    const etag = etagOf(body);
    const headers = { 'Cache-Control': `max-age=${MAX_AGE}`, ETag: etag };
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers);
      response.end();
      return;
    }
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const send = () => {
      if (response.destroyed) return;
      response.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': body.length });
      response.end(body);
    };
    if (this.pageDelay && extname(file) === '.html') setTimeout(send, this.pageDelay);
    else send();
  }

  answerMissing(response) {
    const page = this.notFoundFile();
    if (!page) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
      return;
    }
    const body = readFileSync(page);
    response.writeHead(404, { 'Content-Type': TYPES['.html'], 'Content-Length': body.length });
    response.end(body);
  }
}

/** The file `relative` names in the build in `root`, or null (outside it, or none). */
function fileIn(root, relative) {
  if (!root) return null;
  const file = normalize(join(root, relative.endsWith('/') ? `${relative}index.html` : relative));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return null;
  return file;
}
