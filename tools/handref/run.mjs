// `npm run handref`: the game's hands sculpted in Node and drawn beside the reference fist in its studio, scored by
// their outlines, in a few seconds (`README.md`).
//   npm run handref -- [--build heavy|plain] [--open] [--size 240]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { build } from 'rolldown';

const OUT = 'tools/handref/out';
const BUNDLE = `${OUT}/ourHand.mjs`;
const REFERENCE = `${OUT}/reference-fist.json`;
/** what the game's modules reach for in a page as they load, stood in for so they load in Node */
const PAGE_STAND_INS = [
  "globalThis.location = { search: '', hostname: '', href: '' };",
  "globalThis.document = { cookie: '', documentElement: { dataset: {} }, createElement: () => ({ style: {} }) };",
  'globalThis.self = globalThis;',
  'globalThis.window = globalThis;',
  'globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };',
].join('\n');

/** The command line's value after `--name`, or `fallback`. */
function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

/** `ourHand.ts` bundled with the game's code it reaches, for Node. */
async function bundle() {
  await build({
    input: 'tools/handref/ourHand.ts',
    platform: 'node',
    logLevel: 'silent',
    transform: { define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env': '{}' } },
    output: { file: BUNDLE, format: 'esm', banner: PAGE_STAND_INS },
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(REFERENCE)) {
    throw new Error(`no ${REFERENCE}: make it once with tools/handref/handref.py --json (README.md)`);
  }
  await bundle();
  const buildName = option('build', 'heavy');
  const shape = process.argv.includes('--open') ? ['--open'] : [];
  execFileSync('node', [BUNDLE, '--build', buildName, ...shape], { stdio: 'inherit' });
  const hand = `${OUT}/ours-${buildName}-${shape.length ? 'open' : 'shut'}.json`;
  const studio = ['tools/handref/studio.mjs', REFERENCE, hand, '--size', option('size', '240')];
  execFileSync('node', studio, { stdio: 'inherit' });
}

await main();
