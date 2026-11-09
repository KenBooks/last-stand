// The stalls harness's command line (tools/stalls): its options, read and checked before anything starts, so a
// misspelt one or a bad value stops it before a build or a browser.
import { SCENARIOS, STOW_PRESS_MS, SWEEP_ITEM_MS } from './scenarios.mjs';
import { WEBGPU_CACHE } from './webgpuCache.mjs';
import { AUTOPLAY } from './autoplay.mjs';
import { liveCss, partsOf, VARIANTS } from './variants.mjs';
import { LISTED_LEAST, LISTED_MS, LOBBY_LISTED_MS } from './analyze.mjs';

/** the options a switch is (`--name`, `--name=false`); every other takes a value (`--name value`, `--name=value`) */
const SWITCHES = new Set([
  'headed', 'perf', 'js', 'angle', 'dawn', 'builds', 'passes', 'paints', 'links', 'film', 'film-logo', 'cold-return',
  'warm-behind', 'change-hero', 'stale-wind',
  'help',
]);
/** the views the game is played in (core/renderer.ts `VIEWS`, in the order V steps through them), and the
 *  battlegrounds (data/biomes.ts) */
export const VIEWS = ['top', 'third', 'first'];
const BIOMES = ['forest', 'crypt'];
/** the heroes (data/classes), and the most items a stash holds (data/balance.ts `RUN.bagLimit`) */
const HEROES = ['mage', 'warrior', 'ranger'];
/** the scenario that boots the game rather than playing it (`boot.mjs`), and how long it watches the lobby once
 *  revealed unless the command says (s) */
export const BOOT = 'boot';
const BOOT_SECONDS = 3;
const STASH_MOST = 60;
/** the quality levels (data/quality.ts `QUALITY_ORDER`), and Auto's as its cookie keeps it (`core/quality.ts`:
 *  `low@518400`) */
const QUALITIES = ['high', 'medium', 'low'];
const AUTO = new RegExp(`^(${QUALITIES.join('|')})@\\d+$`);
/** a key's tap (ms: `scenarios.mjs`'s): presses can't come closer together */
const TAP_LEAST = 90;
/** how many times `--resize` goes and comes back unless the command says (the owner's report: full screen and back,
 *  which the exit must follow however often) */
const TRIPS = 5;

/** each option's value and what it does, for the usage */
const HELP = {
  url: ['a,b', 'the game at these URLs (production, a PR preview), each in turn; `this` this tree, built and served '
    + '(as it is with none); `ref:<git ref>` a commit, exported, built and served alike (`ref:HEAD~2`); either '
    + 'with a query asked of its page (`this,this?castAsOne=0`: a switch of the game\'s in turns, one build)'],
  scenario: ['name', `what the player does: ${Object.keys(SCENARIOS).join(', ')} (fight by default); ${BOOT}: the `
    + 'game loaded as a first visit, then a return, each step of its loading timed; '
    + `${WEBGPU_CACHE}: whether Chrome's cache serves a WebGPU page's pipelines as it loads again (a page of its own); `
    + `${AUTOPLAY}: whether the loading screen's exit is heard under Chrome's own autoplay policy (opened, reloaded, `
    + 'clicked and reloaded, a new tab)'],
  seconds: ['n', `how long the scenario plays (45 by default; ${BOOT}: the lobby watched once revealed, `
    + `${BOOT_SECONDS})`],
  listed: ['ms', `each frame this long or longer listed with what was busy through it (${LISTED_LEAST} or more: `
    + `300 by default; ${BOOT}: the lobby's frames from its reveal to Start, ${LOBBY_LISTED_MS} by default)`],
  variants: ['a,b', 'changes tried on the page, each a measure of its own (a+b: both together): '
    + `${Object.keys(VARIANTS).join(', ')} (base)`],
  rounds: ['n', 'the variants measured in turn this many times over in one page, each one\'s styles put on as it runs '
    + '(variants that only add styles), and compared by their medians (1 by default: a fresh Chrome for each)'],
  view: ['name', `the view it's played in: ${VIEWS.join(', ')} (V pressed in the lobby, its panels shown again; top; `
    + `${BOOT}: its end pictured in it, V pressed in the fight it started)`],
  biome: ['name', `the battleground: ${BIOMES.join(', ')} (forest by default; ${BOOT}: the game's own pick, `
    + 'where given its every visit\'s, so two variants\' end pictures show the same)'],
  cast: ['key@ms', 'boot: its end pictured with this key held this long (a skill cast: 600 ms by default), its '
    + 'look seen in the picture'],
  hero: ['name', `the hero chosen in the lobby: ${HEROES.join(', ')} (a first boot's by default; ${BOOT}: chosen `
    + 'on its first visit\'s hero screen)'],
  stash: ['n', `the hero's stash filled with this many items, copies of his own (0 to ${STASH_MOST}: 0 by default)`],
  'item-ms': ['ms', `how long a sweep over the stash stays over each item (${SWEEP_ITEM_MS} by default)`],
  'press-ms': ['ms', `how often stow presses Space (${STOW_PRESS_MS} by default)`],
  scale: ['n', 'the screen\'s scaling, as the OS sets it (a report\'s devicePixelRatio: 1 by default)'],
  'cpu-slowdown': ['n', 'the page\'s CPU slowed this many times, as a phone\'s (CDP\'s throttling: 1 by default)'],
  'stall-blow': ['ms', 'boot: the page held up this long once in the logo blow\'s first frames, as a fast machine '
    + 'stalled by the GPU busy elsewhere (0 by default)'],
  'stall-lobby': ['ms', 'boot: each of the lobby\'s frames held up this long for a second after its reveal, the '
    + 'canary of its frames a second (0 by default)'],
  'cold-return': ['', 'boot: the first visit leaves without pressing Start, so the return finds its maps kept and the '
    + 'fight\'s programs not in the GPU\'s cache (a visit that never fought, a deploy that changed a shader)'],
  'warm-behind': ['', 'boot: Start never pressed, the lobby watched till the fight has warmed behind it and 5 s after, '
    + 'as a player who stays in the lobby meets it'],
  'change-hero': ['', 'boot: the return presses Change hero, not Start, and watches the other heroes warm under the '
    + 'loading bar and the hall of heroes open (trace FD2V-NB48), every frame held from the press listed'],
  film: ['', 'boot: the loading screen\'s exit filmed, the screen\'s frames as the trace caught them, and any frame '
    + 'unlike those either side of it found (a flicker)'],
  'film-logo': ['', 'boot: --film at the window\'s full size, and its frames from the reveal on cut to the lobby\'s '
    + 'logo (`out/logo-N.png`): the particles landing and the logo taking over from them'],
  'blink-exit': ['n', 'boot: the loading screen hidden for a frame this many times as it leaves, the canary of the '
    + 'film\'s flickers (0 by default)'],
  resize: ['WxH', 'boot: the window taken to this size and back as the loading screen shows (`--trips` times, the '
    + 'first as its exit is made ready), and where the exit draws checked at each of its draws against where the '
    + 'letters, the lobby\'s logo and the window are (`windFit.mjs`)'],
  trips: ['n', `boot, with --resize: how many times the window goes to its size and comes back (${TRIPS} by default)`],
  'stale-wind': ['', 'boot, with --resize: the exit placed once and never again (each place it sets after its first '
    + 'ignored), the canary of its check'],
  auto: ['level@px', 'Auto\'s quality as a device settled it, a report\'s Quality line (`low@518400`: Low, at most '
    + '0.52 Mpx; by default a boot\'s own and a scenario\'s the High preset)'],
  window: ['WxH', 'the page\'s size in css px, as a report\'s `window` (1536x864 by default)'],
  headed: ['', 'a Chrome window on the screen, as a player has it (headless by default)'],
  perf: ['', 'the performance overlay shown, as a player sending its report has it'],
  js: ['', 'the page\'s JS sampled (V8\'s profiler): a frame\'s by function, each phase (this tree built unminified, '
    + 'its functions named from its source maps)'],
  angle: ['', 'ANGLE\'s own work on the GPU process traced too: a shader compiled at a draw (D3DCompile), a program '
    + 'linked or read back from the cache'],
  dawn: ['', 'Dawn\'s own work traced too (WebGPU, `?renderer=webgpu`): its shaders translated and compiled, its '
    + 'pipelines made, and what it read back from its cache'],
  builds: ['', `${BOOT}: the WebGPU node builds each step made (\`?builds\`, \`recordNodeBuilds\` in `
    + 'src/core/webgpu.ts): how many, the new shaders and their WGSL (each a compile of Chrome\'s on every visit), '
    + 'the kinds with the most'],
  passes: ['', 'the compositor\'s frames traced as it drew them: each phase\'s render passes and quads a frame'],
  paints: ['', 'the page\'s paints traced: each phase\'s a frame, by the element painted'],
  links: ['', 'every Skia program built: when, how long, the tasks it was built in, the page\'s changes just before'],
  'js-under': ['name', 'with `--js`, a measure\'s JS a frame under this function, by what it calls (the name as listed, '
    + 'or the function\'s own: `_renderObjectDirect`)'],
  before: ['expr', 'this expression run on the page (and awaited) just before its end is pictured: a change made to '
    + 'see what it does, as a material or a pass switched off'],
  read: ['expr', 'this expression read off the page once a visit or a scenario is done (a boot: its fight warm), '
    + 'written to `out/read-N.json`: something the page keeps of its own'],
  help: ['', 'this'],
};

/** The usage: the command and each option. */
export function usage() {
  const lines = ['npm run stalls -- [options]', ''];
  for (const [name, [value, help]] of Object.entries(HELP)) {
    const head = `  --${name}${value ? ` ${value}` : ''}`;
    lines.push(`${head.padEnd(18)} ${help}`);
  }
  return lines.join('\n');
}

/** The options as written: `--name value` or `--name=value`, a switch alone. Throws at one it doesn't know. */
function readWritten(argv) {
  const written = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`stalls: ${JSON.stringify(argv[i])} is no option (they start --)`);
    const [name, inline] = argv[i].slice(2).split(/=(.*)/s);
    if (!(name in HELP)) throw new Error(`stalls: no option --${name} (${Object.keys(HELP).join(', ')})`);
    if (SWITCHES.has(name)) {
      written[name] = inline !== 'false';
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === '') throw new Error(`stalls: --${name} needs a value (${HELP[name][0]})`);
    written[name] = value;
  }
  return written;
}

/** A size written `WxH` (css px) for `--name`, as `{ width, height }`; throws at anything else. */
function sizeOf(written, name) {
  const match = /^(\d+)x(\d+)$/.exec(written);
  if (!match) throw new Error(`stalls: --${name} must be a size in css px, WxH (${JSON.stringify(written)})`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * The command line read and checked: the URLs (none: this tree built and served), the scenario, its length in
 * seconds, the variants, and the switches. Throws, saying what was wrong.
 */
/** how long `--cast` holds its key before the picture, unless it says (ms) */
const CAST_MS = 600;

/** A `--cast` written as `key` or `key@ms`: the key a skill is cast by, and how long it's held for the picture. */
function castOf(written) {
  const [key, ms] = String(written).split('@');
  if (!key) throw new Error(`--cast: a key to hold, as 2 or 2@900, not "${written}"`);
  return { key, ms: Number(ms ?? CAST_MS) };
}

export function readOptions(argv) {
  const written = readWritten(argv);
  const options = {
    urls: written.url ? written.url.split(',').filter(Boolean) : [],
    scenario: written.scenario ?? 'fight',
    seconds: Number(written.seconds ?? (written.scenario === BOOT ? BOOT_SECONDS : 45)),
    listed: Number(written.listed ?? (written.scenario === BOOT ? LOBBY_LISTED_MS : LISTED_MS)),
    variants: (written.variants ?? 'base').split(','),
    rounds: Number(written.rounds ?? 1),
    view: written.view ?? 'top',
    biome: written.biome ?? (written.scenario === BOOT ? null : 'forest'),
    hero: written.hero ?? null,
    cast: written.cast === undefined ? null : castOf(written.cast),
    stash: Number(written.stash ?? 0),
    itemMs: Number(written['item-ms'] ?? SWEEP_ITEM_MS),
    pressMs: Number(written['press-ms'] ?? STOW_PRESS_MS),
    scale: Number(written.scale ?? 1),
    cpuSlowdown: Number(written['cpu-slowdown'] ?? 1),
    stallBlow: Number(written['stall-blow'] ?? 0),
    stallLobby: Number(written['stall-lobby'] ?? 0),
    blinkExit: Number(written['blink-exit'] ?? 0),
    auto: written.auto ?? null,
    window: sizeOf(written.window ?? '1536x864', 'window'),
    resize: written.resize === undefined ? null : sizeOf(written.resize, 'resize'),
    trips: Number(written.trips ?? TRIPS),
    staleWind: written['stale-wind'] === true,
    headed: written.headed === true,
    perf: written.perf === true,
    js: written.js === true || written['js-under'] !== undefined,
    jsUnder: written['js-under'] ?? null,
    angle: written.angle === true,
    dawn: written.dawn === true,
    builds: written.builds === true,
    passes: written.passes === true,
    paints: written.paints === true,
    links: written.links === true,
    before: written.before ?? null,
    read: written.read ?? null,
    coldReturn: written['cold-return'] === true,
    warmBehind: written['warm-behind'] === true,
    changeHero: written['change-hero'] === true,
    film: written.film === true || written['film-logo'] === true,
    filmLogo: written['film-logo'] === true,
    help: written.help === true,
  };
  const own = [BOOT, WEBGPU_CACHE, AUTOPLAY];
  if (!SCENARIOS[options.scenario] && !own.includes(options.scenario)) {
    throw new Error(`stalls: no scenario ${options.scenario} (${[...Object.keys(SCENARIOS), ...own].join(', ')})`);
  }
  const unknown = options.variants.flatMap(partsOf).find((part) => !VARIANTS[part]);
  if (unknown !== undefined) throw new Error(`stalls: no variant ${unknown} (${Object.keys(VARIANTS).join(', ')})`);
  if (!VIEWS.includes(options.view)) throw new Error(`stalls: no view ${options.view} (${VIEWS.join(', ')})`);
  if (options.biome !== null && !BIOMES.includes(options.biome)) throw new Error(`stalls: no biome ${options.biome} (${BIOMES.join(', ')})`);
  if (options.hero !== null && !HEROES.includes(options.hero)) {
    throw new Error(`stalls: no hero ${options.hero} (${HEROES.join(', ')})`);
  }
  if (!(Number.isInteger(options.stash) && options.stash >= 0 && options.stash <= STASH_MOST)) {
    throw new Error(`stalls: --stash must be a whole number from 0 to ${STASH_MOST}`);
  }
  if (!(options.seconds > 0)) throw new Error('stalls: --seconds must be a number over 0');
  if (!(options.itemMs >= 16)) throw new Error('stalls: --item-ms must be a number of ms, 16 or more (a frame)');
  if (!(options.pressMs > TAP_LEAST)) {
    throw new Error(`stalls: --press-ms must be a number of ms, over ${TAP_LEAST} (a key's tap)`);
  }
  if (!(options.scale > 0)) throw new Error('stalls: --scale must be a number over 0');
  if (!(options.cpuSlowdown >= 1)) throw new Error('stalls: --cpu-slowdown must be a number, 1 or more');
  if (!(options.stallBlow >= 0)) throw new Error('stalls: --stall-blow must be a number of ms, 0 or more');
  if (!(options.stallLobby >= 0)) throw new Error('stalls: --stall-lobby must be a number of ms, 0 or more');
  if (!(Number.isInteger(options.blinkExit) && options.blinkExit >= 0)) {
    throw new Error('stalls: --blink-exit must be a whole number, 0 or more');
  }
  if (options.auto !== null && !AUTO.test(options.auto)) {
    const levels = QUALITIES.join(', ');
    throw new Error(`stalls: --auto must be a level and the most pixels, level@px (${levels}: low@518400)`);
  }
  if (options.resize && options.scenario !== BOOT) throw new Error(`stalls: --resize is the ${BOOT} scenario's`);
  if (options.builds && options.scenario !== BOOT) throw new Error(`stalls: --builds is the ${BOOT} scenario's`);
  if (!(Number.isInteger(options.trips) && options.trips >= 1)) {
    throw new Error('stalls: --trips must be a whole number, 1 or more');
  }
  if (options.staleWind && !options.resize) throw new Error('stalls: --stale-wind is a canary of --resize\'s check');
  if (!(options.listed >= LISTED_LEAST)) {
    throw new Error(`stalls: --listed must be a number of ms, ${LISTED_LEAST} or more`);
  }
  if (!(Number.isInteger(options.rounds) && options.rounds >= 1)) {
    throw new Error('stalls: --rounds must be a whole number, 1 or more');
  }
  const scripted = options.variants.find((variant) => liveCss(variant) === null);
  if (options.rounds > 1 && scripted !== undefined) {
    throw new Error(`stalls: --rounds takes variants that only add styles (${scripted} runs a script of its own)`);
  }
  return options;
}
