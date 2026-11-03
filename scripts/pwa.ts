// Vite build plugin for the installable, offline game (PWA):
// - renders the PNG app icons from public/icon.svg (the repo keeps no binary assets),
// - links the Apple touch icon (iOS ignores the manifest's icons),
// - writes sw.js, a service worker that precaches every built file a WebGL page loads, so the game runs offline.
// The worker's cache name comes from a hash of the build, so each deploy installs a fresh cache;
// the page is served network-first, so a plain reload shows a new deploy.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { Plugin, Rollup } from 'vite';

// Pages' page for a missing path (public/404.html): never the game's, so never precached
const NOT_FOUND = '404.html';
const ICONS: [file: string, size: number][] = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];

export function pwa(): Plugin {
  let base = './';
  let publicDir = 'public';   // (the config's, not the working directory's: the lab builds other commits' trees)
  return {
    name: 'last-stand-pwa',
    apply: 'build',
    enforce: 'post',   // after Vite has emitted index.html, so the build hash covers it
    configResolved(config) { base = config.base; publicDir = config.publicDir; },
    transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }, injectTo: 'head' }],
    generateBundle(_options, bundle) {
      const svg = readFileSync(join(publicDir, 'icon.svg'));
      for (const [fileName, size] of ICONS) {
        const source = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
        this.emitFile({ type: 'asset', fileName, source });
      }
      const webgpuOnly = webgpuOnlyChunks(bundle);
      const files = [...new Set([...Object.keys(bundle), ...ICONS.map(([f]) => f), ...readdirSync(publicDir)])]
        .filter((f) => !f.endsWith('.map') && f !== NOT_FOUND && !webgpuOnly.has(f)).sort();
      const html = bundle['index.html'];
      const version = createHash('sha256').update(files.join('\n')).update(html && 'source' in html ? html.source : '').digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(version, files) });
    },
  };
}

/** three's WebGPU build, as `vite.config.ts` puts it in a chunk of its own */
const WEBGPU_BUILD = /three[\\/]build[\\/]three\.(webgpu|tsl)\.js$/;

/**
 * The chunks only a WebGPU page (`?renderer=webgpu`) loads: three's WebGPU build, what can't run without it (each chunk
 * importing it, as the meshlets' pipeline and the point lights' loop do), and what only those import. Precached, an
 * install downloaded them all in the background (about 900 kB) for a renderer no player chooses yet; a WebGPU page
 * fetches them from the network.
 */
function webgpuOnlyChunks(bundle: Rollup.OutputBundle): Set<string> {
  const chunks = Object.values(bundle).filter((file): file is Rollup.OutputChunk => file.type === 'chunk');
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const needsWebgpu = new Map<string, boolean>();
  const needs = (chunk: Rollup.OutputChunk): boolean => {
    if (!needsWebgpu.has(chunk.fileName)) {
      needsWebgpu.set(chunk.fileName, false);
      const own = chunk.moduleIds.some((id) => WEBGPU_BUILD.test(id));
      const imported = chunk.imports.some((name) => byName.has(name) && needs(byName.get(name)!));
      needsWebgpu.set(chunk.fileName, own || imported);
    }
    return needsWebgpu.get(chunk.fileName)!;
  };
  const roots = chunks.filter((chunk) => needs(chunk));
  const reached = (from: Rollup.OutputChunk[], skip: (chunk: Rollup.OutputChunk) => boolean): Set<string> => {
    const seen = new Set<string>();
    const queue = from.filter((chunk) => !skip(chunk));
    while (queue.length) {
      const chunk = queue.pop()!;
      if (seen.has(chunk.fileName)) continue;
      seen.add(chunk.fileName);
      for (const name of [...chunk.imports, ...chunk.dynamicImports]) {
        const next = byName.get(name);
        if (next && !skip(next)) queue.push(next);
      }
      for (const asset of [...chunk.viteMetadata?.importedCss ?? [], ...chunk.viteMetadata?.importedAssets ?? []]) {
        seen.add(asset);
      }
    }
    return seen;
  };
  const entries = chunks.filter((chunk) => chunk.isEntry);
  const webgl = reached(entries, (chunk) => needs(chunk));
  const webgpu = reached(roots, () => false);
  return new Set([...webgpu].filter((name) => !webgl.has(name)));
}

function serviceWorker(version: string, files: string[]): string {
  return `// Last Stand service worker, generated at build time by scripts/pwa.ts.
// Everything the game needs is precached at install, so it runs offline. The page itself comes from
// the network when it can (a plain reload shows a new deploy), the hashed files from the cache.
// A new deploy's worker takes over at once; the previous build's cache stays, so a page still
// running the old build can load its remaining chunks.
const SCOPE = new URL(self.registration.scope).pathname;
// The caches are the origin's, shared by every scope's worker (production's scope holds the PR previews', each with a
// worker of its own), so each worker's are named by its scope and it deletes only its own. Named alike, each preview
// visited deleted all but two, production's among them, and an app left on a preview build pruned since met Pages' 404.
const OWN = 'last-stand:' + SCOPE + ':';
const CACHE = OWN + '${version}';
// (every scope's, named before they were kept apart)
const LEGACY = /^last-stand-[0-9a-f]{12}$/;
const FONTS = 'last-stand-fonts';
const FILES = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};
const PAGE_WAIT = 4000;   // ms before a slow network gives way to the cached page

self.addEventListener('install', (e) => {
  // revalidated: the HTTP cache (Pages: max-age=600) may still hold the previous build's page
  const reqs = FILES.map((f) => new Request(f, { cache: 'no-cache' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(reqs)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // caches.keys() lists in creation order: keep this build's and the one before it (production's last unnamed one
    // when it has none); a preview leaves the unnamed ones to production
    const names = await caches.keys();
    const own = names.filter((k) => k.startsWith(OWN));
    const legacy = SCOPE.includes('/pr-preview/') ? [] : names.filter((k) => LEGACY.test(k));
    const keep = new Set([CACHE, own.filter((k) => k !== CACHE).pop() ?? legacy[legacy.length - 1]]);
    for (const k of [...own, ...legacy]) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// the page asks which build's cache this worker serves (ui/pwa.ts: is the page older?)
self.addEventListener('message', (e) => { if (e.data === 'cache') e.ports[0]?.postMessage(CACHE); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(font(req)); return; }
  if (url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return;
  // PR previews live under the production scope but have workers of their own
  if (url.pathname.slice(SCOPE.length).startsWith('pr-preview/')) return;
  e.respondWith(req.mode === 'navigate' ? page(req) : file(req));
});

// the page: from the network (revalidated past the HTTP cache), the cached copy when offline or slow
async function page(req) {
  const net = fetch(req, { cache: 'no-cache' });
  net.catch(() => {});
  try {
    const r = await Promise.race([net, new Promise((res) => setTimeout(res, PAGE_WAIT))]);
    if (r && r.ok) return r;
  } catch { /* offline */ }
  const hit = await caches.open(CACHE).then((c) => c.match('./'));
  return hit || net;
}

// built files: from any build's cache (ignoreVary: module scripts send an Origin header the precache
// requests lacked; ignoreSearch: built files never vary), else the network
async function file(req) {
  const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
  return hit || fetch(req);
}

// fonts: from the cache when there, refreshed from the network in the background
async function font(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}
`;
}
