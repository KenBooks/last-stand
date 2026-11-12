// The lab's command line read and checked (node/options.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, parseCommandLine, usage } from '../node/options.mjs';

test('fills in the defaults and reads each kind of value', () => {
  const { command, options } = parseCommandLine(['sheet', '--states', 'stand,full', '--at=3,-4.5', '--facing', '1.5']);
  assert.equal(command, 'sheet');
  assert.deepEqual(options.states, ['stand', 'full']);
  assert.deepEqual(options.views, ['lobby', 'top', 'third', 'front', 'left', 'back']);
  assert.equal(options.tag, 'latest');
  assert.deepEqual(options.at, [3, -4.5]);
  assert.equal(options.facing, 1.5);
});

test('reads switches, =false and a commit for --ab', () => {
  assert.equal(parseCommandLine(['carry', '--canary']).options.canary, true);
  assert.equal(parseCommandLine(['carry', '--nocked=false']).options.nocked, false);
  assert.equal(parseCommandLine(['carry', '--ab']).options.ab, true);
  assert.equal(parseCommandLine(['carry', '--ab=165246d']).options.ab, '165246d');
  // (a switch never takes the next word: it's the command's argument)
  assert.deepEqual(parseCommandLine(['probe', '--setup', 'x.ts']).options._, ['x.ts']);
});

test('suggests the option or command meant', () => {
  assert.throws(() => parseCommandLine(['carry', '--canry']), /lab: carry takes no --canry \(did you mean canary\?\)$/);
  assert.throws(() => parseCommandLine(['shet']), /did you mean sheet\?/);
  assert.throws(() => parseCommandLine(['sheet', '--zzz']), /takes no --zzz; it takes --states/);
});

test('reads a screen, its pixel ratio 1 when left out', () => {
  assert.deepEqual(parseCommandLine(['sheet', '--screen', '1280x720@3']).options.screen,
    { width: 1280, height: 720, ratio: 3 });
  assert.deepEqual(parseCommandLine(['sheet', '--screen=844x390@2.75']).options.screen,
    { width: 844, height: 390, ratio: 2.75 });
  assert.deepEqual(parseCommandLine(['sheet', '--screen', '1024x700']).options.screen,
    { width: 1024, height: 700, ratio: 1 });
  assert.throws(() => parseCommandLine(['sheet', '--screen', '1280x720@0']), /--screen: a size and pixel ratio/);
  assert.throws(() => parseCommandLine(['sheet', '--screen', '1280*720']), /--screen: a size and pixel ratio/);
});

test('reads two renderers, and takes no --ab, --screens or --renderer with them', () => {
  assert.deepEqual(parseCommandLine(['village', '--renderers', 'webgl,webgpu']).options.renderers, ['webgl', 'webgpu']);
  assert.throws(() => parseCommandLine(['village', '--renderers', 'webgl']), /--renderers: two of them/);
  assert.throws(() => parseCommandLine(['village', '--renderers', 'webgl,vulkan']), /--renderers/);
  assert.throws(() => parseCommandLine(['village', '--renderers', 'webgl,webgpu', '--ab']), /takes no --ab/);
  assert.throws(() => parseCommandLine(['village', '--renderers=webgl,webgpu', '--renderer=webgpu']), /no --renderer/);
});

test('reads two screens, and takes no --ab or --screen with them', () => {
  assert.deepEqual(parseCommandLine(['probe', 'x.ts', '--screens', '3840x2160@1,1280x720@3']).options.screens,
    [{ width: 3840, height: 2160, ratio: 1 }, { width: 1280, height: 720, ratio: 3 }]);
  assert.deepEqual(parseCommandLine(['sheet', '--screens=1920x1080,960x540@2']).options.screens,
    [{ width: 1920, height: 1080, ratio: 1 }, { width: 960, height: 540, ratio: 2 }]);
  assert.throws(() => parseCommandLine(['sheet', '--screens', '1920x1080']), /--screens: two sizes/);
  assert.throws(() => parseCommandLine(['sheet', '--screens', '1920x1080,a']), /--screens: two sizes/);
  assert.throws(() => parseCommandLine(['sheet', '--screens', '1920x1080,960x540', '--ab']), /takes no --ab/);
  assert.throws(() => parseCommandLine(['sheet', '--screens', '1920x1080,960x540', '--screen', '800x600']),
    /takes no --screen/);
});

test('refuses bad values', () => {
  assert.throws(() => parseCommandLine(['sheet', '--at', '12']), /--at: two numbers/);
  assert.throws(() => parseCommandLine(['sheet', '--facing', '0x10']), /--facing: a number/);
  assert.throws(() => parseCommandLine(['sheet', '--facing', '']), /--facing: a number/);
  assert.throws(() => parseCommandLine(['sheet', '--view', 'side']), /--view: top, third, first/);
  assert.throws(() => parseCommandLine(['carry', '--canary=yes']), /--canary: true or false/);
  assert.throws(() => parseCommandLine(['sheet', '--tag']), /--tag needs a value/);
});

test('checks what follows the command', () => {
  assert.throws(() => parseCommandLine(['probe']), /probe needs its module/);
  assert.throws(() => parseCommandLine(['carry', 'now']), /carry takes no "now"/);
  assert.equal(parseCommandLine(['eval', 'lab.player', '.nocked']).options._.join(' '), 'lab.player .nocked');
});

test('a probe gets the options it was given that the lab does not know', () => {
  const { options } = parseCommandLine(['probe', 'x.ts', '--frames=30', '--fast', '--slow=false']);
  assert.equal(options.frames, '30');
  assert.equal(options.fast, true);
  assert.equal(options.slow, false);
});

test('an option given again: --tune joined, any other refused', () => {
  const twice = ['eyes', 'tempest', '--tune', 'a.b=1', '--tune=a.c=2,3'];
  assert.equal(parseCommandLine(twice).options.tune, 'a.b=1;a.c=2,3');
  assert.throws(() => parseCommandLine(['carry', '--class', 'ranger', '--class', 'mage']),
    /--class given twice \("ranger", then "mage"\)/);
});

test('no command is the help', () => {
  assert.equal(parseCommandLine([]).command, 'help');
  assert.equal(parseCommandLine(['--help']).command, 'help');
});

test('the help fits the width it is made for', () => {
  for (const line of usage().split('\n')) assert.ok(line.length <= 116, line);
});

test('edit distance', () => {
  assert.equal(editDistance('canary', 'canry'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('views', 'views'), 0);
});
