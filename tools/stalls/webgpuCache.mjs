// Whether Chrome's cache serves a WebGPU page's pipelines when it loads again (tools/stalls, `--scenario
// webgpu-cache`): a page of the tool's own makes a few render pipelines out of a long shader and is loaded three times
// in one Chrome, each load traced for Dawn's work (`--dawn`'s). Its DXC compiles on the loads after the first are what
// the cache didn't serve. Each way of asking for the pipelines (`WAYS`) is loaded in a Chrome of its own, so the
// first load of each is cold. The game's returns compiled every one of its pipelines again (docs/research/webgpu.md).
import { readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { startChrome } from './chrome.mjs';
import { startTrace } from './trace.mjs';
import { within } from './within.mjs';

/** the scenario's name (`--scenario webgpu-cache`) */
export const WEBGPU_CACHE = 'webgpu-cache';

/** how many times each way's page is loaded: once cold, then again in the same Chrome */
const LOADS = 3;
/** how many pipelines the page makes unless its way says (`pipelines=`), each its own shader (a seed of its own) */
const PIPELINES = 8;
/** how many lines of arithmetic each shader's fragment stage runs unless its way says (`lines=`): enough for DXC to
 *  take tens of ms over it */
const SHADER_LINES = 400;
/** how long a load is given to make its pipelines (ms) */
const LOAD_MS = 60_000;
/** Dawn's trace events for a shader compiled by DXC and for a shader module's backend compile (cached or not) */
const DXC = 'CompileShaderDXC';
const BACKEND_COMPILE = 'ShaderModuleD3D12::Compile';

/** The ways of asking for the pipelines, each a query of the page's: as three asks (async, its device with every
 *  feature the adapter has), with no features asked, made at once (`createRenderPipeline`), and as many as a game
 *  makes (the cache kept a few MB of the game's?). */
const WAYS = {
  'as three asks': 'async=1&features=all',
  'no features': 'async=1&features=none',
  'made at once': 'async=0&features=all',
  'as many as a game': 'async=1&features=all&pipelines=200',
};

/** The page's script: a device asked for as `features` says, `PIPELINES` pipelines made (async or at once), each
 *  load's time to make them all kept in `window.__made` (ms), an error in `window.__failed`. */
function pageScript() {
  return `
const query = new URLSearchParams(location.search);
const pipelines = Number(query.get('pipelines') ?? ${PIPELINES});
const lines = Number(query.get('lines') ?? ${SHADER_LINES});
const body = (seed) => {
  const steps = [];
  for (let i = 0; i < lines; i++) {
    const scale = (1.1 + i * 0.013).toFixed(3);
    steps.push(\`v = fract(sin(v * \${scale} + vec4f(\${seed}.0, \${i}.0, 0.5, 1.5)) * 43758.5);\`);
  }
  return steps.join('\\n  ');
};
const shader = (seed) => \`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(f32(i % 2u), f32(i / 2u), 0.0, 1.0);
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  var v = p;
  \${body(seed)}
  return v;
}\`;
async function make() {
  const adapter = await navigator.gpu.requestAdapter();
  const requiredFeatures = query.get('features') === 'all' ? [...adapter.features] : [];
  const device = await adapter.requestDevice({ requiredFeatures });
  const start = performance.now();
  const made = [];
  for (let seed = 0; seed < pipelines; seed++) {
    const module = device.createShaderModule({ code: shader(seed) });
    const descriptor = {
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
    };
    made.push(query.get('async') === '1'
      ? device.createRenderPipelineAsync(descriptor)
      : Promise.resolve(device.createRenderPipeline(descriptor)));
  }
  await Promise.all(made);
  await device.queue.onSubmittedWorkDone();
  window.__made = performance.now() - start;
}
make().catch((error) => { window.__failed = String(error); });`;
}

/** Serves the test page on a free port of localhost (a secure context, where WebGPU is). Returns its URL and
 *  `close`. */
function servePage() {
  const html = `<!doctype html><meta charset="utf-8"><title>webgpu cache</title>`
    + `<script type="module">${pageScript()}</script>`;
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://localhost:${port}/`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

/** Dawn's `name` events in `events`: how many, and their time in all (ms). */
function countOf(events, name) {
  const found = events.filter((event) => event.ph === 'W' && event.name === name);
  return { count: found.length, ms: found.reduce((sum, event) => sum + event.dur / 1000, 0) };
}

/** One load of `page` (the first a `goto`, the rest reloads), traced: how long its pipelines took to make and its
 *  DXC compiles and backend compiles. */
async function tracedLoad(browser, page, url, first) {
  const trace = await startTrace(browser, { dawn: true });
  if (first) await page.goto(url);
  else await page.reload();
  const done = page.waitForFunction(() => window.__made !== undefined || window.__failed !== undefined);
  if (!(await within(done, LOAD_MS))) throw new Error(`stalls: ${url} made no pipelines in ${LOAD_MS} ms`);
  const failed = await page.evaluate(() => window.__failed);
  if (failed) throw new Error(`stalls: ${url}: ${failed}`);
  const madeMs = await page.evaluate(() => window.__made);
  const events = await trace.stop();
  return { madeMs, dxc: countOf(events, DXC), compiles: countOf(events, BACKEND_COMPILE) };
}

/** The size of Chrome's WebGPU cache on disk in `profile` (MB): what its pipelines' compiled shaders came to. */
function cacheMb(profile) {
  const folder = join(profile, 'Default', 'DawnWebGPUCache');
  const bytes = readdirSync(folder).reduce((sum, name) => sum + statSync(join(folder, name)).size, 0);
  return bytes / 1024 / 1024;
}

/** Each of `ways`' pages (a name to its query) loaded `LOADS` times in a Chrome of its own (`outDir` holds its
 *  profile). */
async function measureWays(url, outDir, ways) {
  const results = [];
  for (const [way, query] of Object.entries(ways)) {
    console.log(`measuring ${way}: ${LOADS} loads`);
    const chrome = await startChrome({ outDir });
    try {
      const page = await chrome.browser.contexts()[0].newPage();
      const loads = [];
      for (let load = 0; load < LOADS; load++) {
        loads.push(await tracedLoad(chrome.browser, page, `${url}?${query}`, load === 0));
      }
      results.push({ way, query, loads, cacheMb: cacheMb(chrome.profile) });
    } finally {
      await chrome.close();
    }
  }
  return results;
}

/** A way's loads as lines: each load's time to make the pipelines, its DXC compiles and its backend compiles. */
function wayLines({ way, query, loads, cacheMb: mb }) {
  const lines = [`${way} (?${query}), its cache ${mb.toFixed(1)} MB on disk:`];
  loads.forEach((load, index) => {
    const which = index === 0 ? 'cold' : `again ${index}`;
    lines.push(`  ${which.padEnd(8)} pipelines made in ${load.madeMs.toFixed(0)} ms; `
      + `${load.dxc.count} DXC compiles (${load.dxc.ms.toFixed(0)} ms), `
      + `${load.compiles.count} backend compiles (${load.compiles.ms.toFixed(0)} ms)`);
  });
  return lines;
}

/** The report: each way's loads, and whether its loads after the first compiled with DXC again. */
export function webgpuCacheText(results) {
  const lines = [`each way's page loaded ${LOADS} times in a Chrome of its own (${PIPELINES} pipelines of `
    + `${SHADER_LINES} lines each unless its query says):`];
  for (const result of results) {
    lines.push(...wayLines(result));
    const again = result.loads.slice(1).reduce((sum, load) => sum + load.dxc.count, 0);
    const served = again ? `compiled again on its reloads (${again} DXC compiles)` : 'served from the cache';
    lines.push(`  -> ${served}`);
  }
  return lines.join('\n');
}

/** Runs the scenario: the page served, each way measured (`WAYS`, or each of `queries`: `--url "?pipelines=40"`),
 *  the report returned (`outDir` holds the profiles). */
export async function measureWebgpuCache(outDir, queries = []) {
  const asked = Object.fromEntries(queries.map((query) => [query, query.replace(/^\?/, '')]));
  const page = await servePage();
  try {
    return webgpuCacheText(await measureWays(page.url, outDir, queries.length ? asked : WAYS));
  } finally {
    await page.close();
  }
}
