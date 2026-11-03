import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pwa } from './scripts/pwa.ts';

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

/** three's builds: its core and WebGL renderer, which every page loads, and its WebGPU renderer and node language,
 *  which only `?renderer=webgpu` does (core/webgpu.ts; its addons go with whatever imports them) */
const THREE_BUILD = /node_modules[\\/]three[\\/]build[\\/]three\.(core|module)\.js/;
const WEBGPU_BUILD = /node_modules[\\/]three[\\/]build[\\/]three\.(webgpu|tsl)\.js/;

export default defineConfig({
  base: './',              // relative asset paths so dist/ works on any static host (e.g. GitHub Pages)
  plugins: [ezTreeTextures(), threeCompileSlice(), pwa()],
  resolve: { alias: { 'ez-tree': EZ_TREE + 'index.js' } },
  // (served from its source as it is, not pre-bundled: the dev server's pre-bundling is esbuild's and never meets the
  // stub above, so every dev boot fetched and decoded all of ez-tree's pictures)
  optimizeDeps: { exclude: ['ez-tree'] },
  define: { __BUILD__: JSON.stringify(buildInfo()) },       // app icons + offline service worker
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
  server: { port: 5173, open: false },
});
