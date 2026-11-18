import { defineConfig, transformWithOxc, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { pwa } from './scripts/pwa.ts';

// Inline the tiny gesture handler so loading-screen clicks need no network-loaded module to be ready.
const bootFullScreen = () => ({
  name: 'boot-full-screen',
  async transformIndexHtml() {
    const file = fileURLToPath(new URL('./src/ui/bootFullScreen.ts', import.meta.url));
    const source = `${readFileSync(file, 'utf8').replace(/^export /gm, '')}\ninstallBootFullScreen();`;
    const { code } = await transformWithOxc(source, file);
    return [{ tag: 'script', attrs: { id: 'boot-fullscreen' }, children: `(() => {\n${code}\n})();`,
      injectTo: 'head' as const }];
  },
});

// The page's panels, each a file of its own (src/ui/html/<id>.html), put back where index.html names it
// (`<!-- part: id -->`) as the page is served or built: the page the browser gets is the page as one file was. 53 of
// 300 PRs touched index.html for their own panel; a panel's markup in its own file touches no one else's.
const HTML_PARTS = fileURLToPath(new URL('./src/ui/html/', import.meta.url));
const PART = /^ {2}<!-- part: ([\w-]+) -->$/gm;

// The screens of their own, a folder each (src/ui/screens/<id>/, ui/screens.ts): every one's markup goes where
// index.html's `<!-- screens -->` line stands and every one's styles (`_<name>.scss`) where the stylesheets' index has
// its `// screens` line, each in its folder's name's order, so a new screen is a folder and touches no list.
const SCREENS = fileURLToPath(new URL('./src/ui/screens/', import.meta.url));
const SCREENS_HTML = /^ {2}<!-- screens -->$/m;
const SCREENS_SCSS = /^\/\/ screens$/m;
/** Each screen folder's files whose names `pick` takes, as paths from src/ui/screens/, in their folders' order. */
const screenFiles = (pick: (name: string) => boolean): string[] => readdirSync(SCREENS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .flatMap((dir) => readdirSync(`${SCREENS}${dir}`).filter(pick).sort().map((name) => `${dir}/${name}`));
/** Every screen's panels' markup, as index.html takes it. */
const screensHtml = (): string => screenFiles((name) => name.endsWith('.html'))
  .map((file) => readFileSync(`${SCREENS}${file}`, 'utf8').replace(/\r?\n$/, ''))
  .join('\n');
/** Every screen's stylesheet, `@use`d where the stylesheets' index asks (each found from its folder). */
const screensScss = (): string => screenFiles((name) => name.startsWith('_') && name.endsWith('.scss'))
  .map((file) => `@use '../screens/${file.replace(/\/_/, '/').replace(/\.scss$/, '')}';`)
  .join('\n');

/** The stylesheets' index with every screen's styles where its `// screens` line stands. */
const screenStyles = (): Plugin => ({
  name: 'screen-styles',
  enforce: 'pre',
  transform(code, id) {
    if (!slash(id).endsWith('/src/ui/styles/index.scss')) return;
    return code.replace(SCREENS_SCSS, screensScss());
  },
});
const htmlParts = (): Plugin => ({
  name: 'html-parts',
  transformIndexHtml: {
    order: 'pre',
    handler: (html: string) => html
      .replace(PART, (_line, id: string) => readFileSync(`${HTML_PARTS}${id}.html`, 'utf8').replace(/\r?\n$/, ''))
      .replace(SCREENS_HTML, () => screensHtml()),
  },
  // (a part changed reloads the page, as index.html itself does)
  handleHotUpdate({ file, server }) {
    const part = slash(file).startsWith(slash(HTML_PARTS));
    const screenPart = slash(file).startsWith(slash(SCREENS)) && file.endsWith('.html');
    if (!part && !screenPart) return;
    server.ws.send({ type: 'full-reload' });
    return [];
  },
});

// ez-tree (procedural trees) from its source, not its build, which carries its bark and leaf pictures inlined: its
// texture module is swapped for a stub (src/world/ezTreeTextures.ts), so none of them ship
const slash = (p: string): string => p.split('\\').join('/').toLowerCase();
const EZ_TREE = fileURLToPath(new URL('./node_modules/@dgreenheck/ez-tree/src/lib/', import.meta.url)).split('\\').join('/');
const ezTreeTextures = () => ({
  name: 'ez-tree-textures',
  enforce: 'pre' as const,
  resolveId(source: string, importer?: string) {
    if (source === './textures' && importer && slash(importer).startsWith(slash(EZ_TREE))) return fileURLToPath(new URL('./src/world/ezTreeTextures.ts', import.meta.url));
    return null;
  },
});

// three's async compile (WebGPU) works a constant 8 ms before it yields a frame: its build is made to read how long
// from a global the game sets (core/webgpu.ts `compileSlice`: 40 ms under the loading screen and the fight's loading
// bar, where its 8 ms kept the GPU's compilers a third busy). A production build's alone: the dev server's
// pre-bundled three keeps its 8 ms.
const COMPILE_SLICE = '>= _compileYieldInterval;';
const threeCompileSlice = () => ({
  name: 'three-compile-slice',
  transform(code: string, id: string) {
    if (!/three[\\/]build[\\/]three\.webgpu\.js$/.test(id)) return null;
    if (!code.includes(COMPILE_SLICE)) throw new Error(`three-compile-slice: three's build has no '${COMPILE_SLICE}'`);
    return { code: code.replace(COMPILE_SLICE, '>= (globalThis.__compileSliceMs ?? _compileYieldInterval);'), map: null };
  },
});

// what the pause menu shows as the build: commit (a PR preview's head, set by its workflow) and time
function buildInfo(): { ref: string; time: string } {
  let sha = process.env.BUILD_SHA;
  try { sha ||= execSync('git rev-parse HEAD').toString().trim(); } catch { /* no git */ }
  const pr = process.env.BUILD_PR ? `PR #${process.env.BUILD_PR} · ` : '';
  return { ref: `${pr}${sha ? sha.slice(0, 7) : 'local'}`, time: new Date().toISOString() };
}
const BUILD = buildInfo();

/** `version.json` beside the page, the build as `__BUILD__` has it: the pause menu reads it from the host to say whether
 *  it runs the newest build (src/ui/buildStatus.ts, #587). The dev server answers it too, with its own. */
function buildVersion(): Plugin {
  const source = JSON.stringify(BUILD);
  return {
    name: 'last-stand-version',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/version.json')) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(source);
      });
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source }); },
  };
}

/** three's builds: its core and WebGL renderer, which every page loads, and its WebGPU renderer and node language,
 *  which only `?renderer=webgpu` does (core/webgpu.ts; its addons go with whatever imports them) */
const THREE_BUILD = /node_modules[\\/]three[\\/]build[\\/]three\.(core|module)\.js/;
const WEBGPU_BUILD = /node_modules[\\/]three[\\/]build[\\/]three\.(webgpu|tsl)\.js/;

export default defineConfig({
  base: './',              // relative asset paths so dist/ works on any static host (e.g. GitHub Pages)
  plugins: [htmlParts(), screenStyles(), bootFullScreen(), ezTreeTextures(), threeCompileSlice(), buildVersion(), pwa()],
  resolve: { alias: { 'ez-tree': EZ_TREE + 'index.js' } },
  // (a screen's styles, in its own folder, take the theme and the mixins by name as every other stylesheet does)
  css: { preprocessorOptions: { scss: { loadPaths: [fileURLToPath(new URL('./src/ui/styles/', import.meta.url))] } } },
  // (served from its source as it is, not pre-bundled: the dev server's pre-bundling is esbuild's and never meets the
  // stub above, so every dev boot fetched and decoded all of ez-tree's pictures)
  optimizeDeps: { exclude: ['ez-tree'] },
  // (`__DEV_TOOLS__`: the developer mode, src/dev, built in. Only a PR preview's Docker build sets BUILD_PREVIEW
  // (server/game-preview/Dockerfile); production's build doesn't, and its bundle has none of the mode)
  define: { __BUILD__: JSON.stringify(BUILD), __DEV_TOOLS__: JSON.stringify(process.env.BUILD_PREVIEW === '1') },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // (groups, not `manualChunks`: rolldown's manual chunk took three's WebGPU build into `three` with the rest)
      output: {
        codeSplitting: {
          groups: [
            // (its dependencies left out: they'd take three's core, which every page loads, along)
            { name: 'three-webgpu', test: WEBGPU_BUILD, priority: 2, includeDependenciesRecursively: false },
            { name: 'three', test: THREE_BUILD, priority: 1 },
          ],
        },
      },
    },
  },
  // the tools' output is never the game's: the lab and stalls keep their browsers' profiles there (`tools/lab/out/tmp`),
  // and watched, a profile's locked file (its cookies) crashed the dev server with EBUSY as a lab command ran
  server: { port: 5173, open: false, watch: { ignored: ['**/tools/*/out/**'] } },
});
