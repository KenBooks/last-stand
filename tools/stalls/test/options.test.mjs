// The stalls harness's command line (tools/stalls/options.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOptions, usage } from '../options.mjs';

test('fills in the defaults', () => {
  const options = readOptions([]);
  assert.deepEqual(options, {
    urls: [],
    scenario: 'fight',
    seconds: 45,
    listed: 300,
    variants: ['base'],
    rounds: 1,
    itemMs: 250,
    pressMs: 200,
    view: 'top',
    biome: 'forest',
    hero: null,
    cast: null,
    stash: 0,
    stops: null,
    scale: 1,
    cpuSlowdown: 1,
    touch: false,
    gpuMemory: null,
    stallBlow: 0,
    stallLobby: 0,
    blinkExit: 0,
    auto: null,
    window: { width: 1536, height: 864 },
    resize: null,
    trips: 5,
    staleWind: false,
    headed: false,
    perf: false,
    js: false,
    jsUnder: null,
    angle: false,
    dawn: false,
    builds: false,
    passes: false,
    paints: false,
    links: false,
    before: null,
    read: null,
    coldReturn: false,
    warmBehind: false,
    changeHero: false,
    returning: false,
    film: false,
    filmBoot: false,
    filmLogo: false,
    help: false,
  });
});

test('reads values either way, and switches', () => {
  const argv = ['--url', 'https://a/,https://b/', '--seconds=20', '--variants', 'base,cpuCanvas', '--headed'];
  const options = readOptions(argv);
  assert.deepEqual(options.urls, ['https://a/', 'https://b/']);
  assert.equal(options.seconds, 20);
  assert.deepEqual(options.variants, ['base', 'cpuCanvas']);
  assert.equal(options.headed, true);
  assert.equal(readOptions(['--links=false']).links, false);
  assert.equal(readOptions(['--scenario', 'lobby']).scenario, 'lobby');
  assert.equal(readOptions(['--view', 'first']).view, 'first');
  assert.equal(readOptions(['--biome=crypt']).biome, 'crypt');
  assert.equal(readOptions(['--scenario', 'boot']).biome, null);
  assert.equal(readOptions(['--scenario', 'boot', '--biome', 'crypt']).biome, 'crypt');
  assert.equal(readOptions(['--scale', '1.25']).scale, 1.25);
  assert.equal(readOptions(['--hero', 'warrior']).hero, 'warrior');
  assert.deepEqual(readOptions(['--cast', '3']).cast, { key: '3', ms: 600 });
  assert.deepEqual(readOptions(['--cast=2@900']).cast, { key: '2', ms: 900 });
  assert.equal(readOptions(['--stash=40']).stash, 40);
  assert.deepEqual(readOptions(['--window', '1536x695']).window, { width: 1536, height: 695 });
  assert.equal(readOptions(['--listed', '40']).listed, 40);
  const resized = readOptions(['--scenario', 'boot', '--resize', '1920x1080', '--trips=2', '--stale-wind']);
  assert.deepEqual(resized.resize, { width: 1920, height: 1080 });
  assert.equal(resized.trips, 2);
  assert.equal(resized.staleWind, true);
  const read = readOptions(['--scenario', 'boot', '--read', 'window.__builds']);
  assert.equal(read.read, 'window.__builds');
  assert.equal(readOptions(['--scenario', 'storm', '--read', 'window.__builds']).read, 'window.__builds');
  const logo = readOptions(['--scenario', 'boot', '--film-logo']);
  assert.equal(logo.film, true);
  assert.equal(logo.filmLogo, true);
});

test('refuses what it doesn\'t know and bad values', () => {
  assert.throws(() => readOptions(['--secs', '5']), /no option --secs/);
  assert.throws(() => readOptions(['fight']), /"fight" is no option/);
  assert.throws(() => readOptions(['--scenario', 'boss']), /no scenario boss/);
  assert.throws(() => readOptions(['--variants', 'base,gpu']), /no variant gpu/);
  assert.throws(() => readOptions(['--variants', 'stillGlow+gpu']), /no variant gpu/);
  assert.throws(() => readOptions(['--rounds', '0']), /--rounds must be a whole number, 1 or more/);
  assert.throws(() => readOptions(['--item-ms', '5']), /--item-ms must be a number of ms, 16 or more/);
  assert.equal(readOptions(['--item-ms', '100']).itemMs, 100);
  assert.throws(() => readOptions(['--rounds', '3', '--variants', 'base,cpuCanvas']), /cpuCanvas runs a script/);
  assert.equal(readOptions(['--rounds', '3', '--variants', 'base,stillGlow+noTooltip']).rounds, 3);
  assert.deepEqual(readOptions(['--variants', 'base,stillGlow+noTooltip']).variants, ['base', 'stillGlow+noTooltip']);
  assert.throws(() => readOptions(['--seconds', '0']), /--seconds must be a number over 0/);
  assert.throws(() => readOptions(['--seconds']), /--seconds needs a value/);
  assert.throws(() => readOptions(['--view', 'eyes']), /no view eyes/);
  assert.throws(() => readOptions(['--biome', 'swamp']), /no biome swamp/);
  assert.throws(() => readOptions(['--scale', '0']), /--scale must be a number over 0/);
  assert.throws(() => readOptions(['--hero', 'bard']), /no hero bard/);
  assert.throws(() => readOptions(['--stash', '61']), /--stash must be a whole number from 0 to 60/);
  assert.throws(() => readOptions(['--window', '1536']), /--window must be a size in css px/);
  assert.throws(() => readOptions(['--listed', '10']), /--listed must be a number of ms, 20 or more/);
  assert.throws(() => readOptions(['--resize', '1920x1080']), /--resize is the boot scenario's/);
  assert.throws(() => readOptions(['--builds']), /--builds is the boot scenario's/);
  assert.throws(() => readOptions(['--scenario', 'boot', '--resize', 'full']), /--resize must be a size in css px/);
  assert.throws(() => readOptions(['--scenario', 'boot', '--trips', '0']), /--trips must be a whole number/);
  assert.throws(() => readOptions(['--scenario', 'boot', '--stale-wind']), /--stale-wind is a canary of --resize/);
});

test('the usage lists every option', () => {
  const names = ['url', 'scenario', 'seconds', 'variants', 'rounds', 'view', 'biome', 'hero', 'stash', 'scale'];
  const boot = ['resize', 'trips', 'stale-wind'];
  for (const name of [...names, 'window', ...boot, 'item-ms', 'headed', 'perf', 'links', 'help']) {
    assert.match(usage(), new RegExp(`--${name}\\b`));
  }
});

test('a function to break down samples the JS', () => {
  const options = readOptions(['--scenario', 'lobby', '--js-under', '_renderObjectDirect']);
  assert.equal(options.js, true);
  assert.equal(options.jsUnder, '_renderObjectDirect');
});
