// The game's own hand sculpted in Node for the hand reference's studio (`handref.py`): no browser and no boot, so a
// change to its sculpt is seen in seconds. Bundled and run by `npm run handref` (`run.mjs`); writes
// `out/ours-<build>-<pose>.json`: the skin's vertices and triangles and the joints that set the hand's frame.
import { writeFileSync, mkdirSync } from 'node:fs';
import * as THREE from 'three';
import { sculptedSide } from '../../src/entities/models/hands';
import { HAND_BUILDS } from '../../src/entities/models/build';

/** The command line: `--build heavy|plain`, `--open` for the open sculpt (the shut one by default), `--out <dir>`,
 *  `--tune name.field=v,...;...` the game's tunables set first (`src/core/tuning.ts`), `--tag <name>` in its file's
 *  name. */
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

/** A joint's place in the hand's own space. */
function placeOf(joint: THREE.Object3D): number[] {
  return joint.getWorldPosition(new THREE.Vector3()).toArray();
}

/** The game's tunables set as `--tune` says: `fistShape.strike=88;shutFill.curl=0.9`. */
function tuneAs(tunes: string): void {
  const set = (globalThis as { __tune?: (path: string, value: number[]) => void }).__tune;
  if (!set) throw new Error('the game registered no tunables: the bundle is not a dev one');
  for (const each of tunes.split(';').filter(Boolean)) {
    const [path, value] = each.split('=');
    set(path, value.split(',').map(Number));
  }
}

const buildName = option('build', 'heavy');
tuneAs(option('tune', ''));
const closed = !process.argv.includes('--open');
const outDir = option('out', 'tools/handref/out');
const build = HAND_BUILDS[buildName];
if (!build) throw new Error(`no hand build ${buildName}: ${Object.keys(HAND_BUILDS).join(', ')}`);
// the right hand, as the reference's
const { shape, hand } = sculptedSide(Number(option('side', '-1')), build, closed);
hand.vis.updateMatrixWorld(true);
const skin = shape.skin;
const index = skin.index ? Array.from(skin.index.array) : [...Array(skin.attributes.position.count).keys()];
const joints = {
  wrist: [0, 0, 0],
  index: placeOf(hand.f[0].j[0]),
  middle: placeOf(hand.f[1].j[0]),
  little: placeOf(hand.f[3].j[0]),
};
mkdirSync(outDir, { recursive: true });
const tag = option('tag', '');
const file = `${outDir}/ours-${buildName.toLowerCase()}-${closed ? 'shut' : 'open'}${tag ? `-${tag}` : ''}.json`;
writeFileSync(file, JSON.stringify({ positions: Array.from(skin.attributes.position.array), index, joints }));
console.log(`${file}: ${index.length / 3} triangles`);
