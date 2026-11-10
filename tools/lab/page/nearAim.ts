// `lab nearaim`: the hero's aim as a foe stands under the crosshair near him, in each close view. The crosshair
// aims at what its ray meets first, and the hero aims from his own place at that point; the camera stands behind and
// beside him, so a point on a foe hugging him is beside him, and his aim wheeled 75 degrees to it and back as its
// paw crossed the crosshair: Void Lance's whole beam with it, 3 to 4 flashes a second (#482). A training dummy is
// stood under the crosshair at depths from abreast of the hero to well ahead of him, and at each the aim's way from
// the hero is held to the way the camera looks, the dummy still the foe aimed at. `canary` takes the aim's least
// distance off (`aim.near` in `src/core/input.ts`), which third person must show.
import * as THREE from 'three';
import type { Fixture, Lab, Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import { input } from '../../../src/core/input';
import { G } from '../../../src/state';

/** What `lab nearaim` is given: the set-up, the close views, and whether the canary runs. */
export interface NearAimOptions { fixture: Fixture; views: ViewMode[]; canary: boolean }

/** how far ahead of the hero, the way the camera looks, the dummy stands under the crosshair (m) */
const DEPTHS = [0, 0.5, 1, 1.5, 2.5, 4, 7];
/** the most the aim's way from the hero may be off the camera's (degrees) */
const OFF_MOST = 10;
/** the depths a view must have met the dummy at, at the least, and one of them this near (m): else nothing was
 *  measured */
const MET_LEAST = 3;
const MET_NEAR = 1.5;
/** the frames a dummy is given to rise, and the frames run before the aim is read */
const RISE_FRAMES = 300;
const SETTLE_FRAMES = 3;

/** The aim with the dummy at one depth: whether the crosshair met it, and the aim's way off the camera's. */
interface Aimed { depth: number; met: boolean; off: number; far: number }

/** The way the camera looks across the floor, and the crosshair's ray. */
function crosshairRay(): { forward: THREE.Vector3; ray: THREE.Ray } {
  const direction = G.camera.getWorldDirection(new THREE.Vector3());
  const forward = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  return { forward, ray: new THREE.Ray(G.camera.getWorldPosition(new THREE.Vector3()), direction) };
}

/** The point of the floor under the crosshair's ray `depth` ahead of the hero the way the camera looks; null where
 *  the ray is never there. */
function spotAt(depth: number): THREE.Vector3 | null {
  const { forward, ray } = crosshairRay();
  const toHero = ray.origin.clone().sub(G.player.pos);
  const along = (depth - toHero.dot(forward)) / ray.direction.dot(forward);
  if (!(along > 0)) return null;
  return ray.at(along, new THREE.Vector3()).setY(0);
}

/** The aim read with a dummy stood under the crosshair `depth` ahead of the hero, on a set-up of its own. */
async function aimedAt(lab: Lab, fixture: Fixture, depth: number): Promise<Aimed | null> {
  await lab.setup(fixture);
  const spot = spotAt(depth);
  if (!spot) return null;
  const dummy = lab.spawnFoe('dummy', spot);
  await lab.until(() => dummy.spawning <= 0, RISE_FRAMES, 'the dummy never rose');
  await lab.step(SETTLE_FRAMES);
  const hero = G.player;
  const way = new THREE.Vector3(hero.aim.x - hero.pos.x, 0, hero.aim.z - hero.pos.z);
  const off = THREE.MathUtils.radToDeg(way.angleTo(crosshairRay().forward));
  return { depth, met: input.foe === dummy, off, far: way.length() };
}

/** One view's lines and problems. */
function judged(view: ViewMode, aimed: Aimed[]): { lines: string[]; problems: string[] } {
  const lines = aimed.map(({ depth, met, off, far }) => {
    const what = met ? 'the dummy' : 'not the dummy';
    return `${view}, ${depth.toFixed(1)} m ahead: met ${what}, the aim ${far.toFixed(1)} m off, ${off.toFixed(1)}° `
      + 'off the camera\'s way';
  });
  const met = aimed.filter((each) => each.met);
  const problems = met.filter((each) => each.off > OFF_MOST)
    .map((each) => `${view}: a foe under the crosshair ${each.depth.toFixed(1)} m ahead turned the aim `
      + `${each.off.toFixed(0)}° off the camera's way (at most ${OFF_MOST}°)`);
  if (met.length < MET_LEAST || !met.some((each) => each.depth <= MET_NEAR)) {
    problems.push(`${view}: the crosshair met the dummy at ${met.length} depths, none near: nothing measured`);
  }
  return { lines, problems };
}

/** `lab nearaim`: a dummy under the crosshair at each depth in each close view, the aim's way read at each. */
export async function nearAim(lab: Lab, options: NearAimOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const tune = options.canary ? { ...options.fixture.tune, 'aim.near': [0] } : options.fixture.tune;
  for (const view of options.views) {
    const aimed: Aimed[] = [];
    for (const depth of DEPTHS) {
      const read = await aimedAt(lab, { ...options.fixture, view, tune }, depth);
      if (read) aimed.push(read);
    }
    const found = judged(view, aimed);
    lines.push(...found.lines);
    problems.push(...found.problems);
  }
  lines.push(...problems.map((problem) => `! ${problem}`));
  if (!options.canary) return { text: lines.join('\n'), problems };
  const caught = problems.some((problem) => problem.includes('turned the aim'));
  lines.push(`canary: the aim on a foe beside the hero ${caught ? 'caught' : 'went unseen'}`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: the aim wheeled to a foe beside him unseen'] };
}
