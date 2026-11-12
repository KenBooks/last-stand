// `lab village --only staffAtNight`: the staff's crystal as he stands idle by night (from play, "bug at night, mage's
// staff flickers too bright at times during its idle pulsing, thought we had a test for that": that test, `hall
// --glow`, reads the hall alone, whose own lights the crystal was tuned under). Beside a street lamp, by the campfire
// and on the open square, from each view: a box round the staff's tip frame by frame, its brightest frame against its
// median, how much of it is near white, how far its light moves in one frame, and its flashes in any second. `canary`
// polishes the crystal as it was and lights it full, whose facets mirror what's bright round it.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMPFIRE, VILLAGE_OBJECTS } from '../../../src/data/village';
import { holdHour } from '../../../src/game/clock';
import { viewMode, type ViewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { worstFlashing } from './flashes';
import { boxRound, glowOf, glowingGemsUnder, lightAsMain, medianOf, type FrameGlow } from './hallGlow';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the views read, the frames given to settle and read (a whole turn of the crystal, some 3 s, and more), the box
 *  (m) */
const VIEWS: ViewMode[] = ['third', 'top'];
const SETTLE = 60;
const FRAMES = 300;
const BOX = 0.5;
/** how far from a lamp's post he stands (m) */
const BESIDE_LAMP = 1.2;
/** the most its brightest frame may be against its median, of it near white, its mean's move in one frame against its
 *  median, and the flashes in a second */
const PEAK_MOST = 1.6;
const NEAR_WHITE_MOST = 0.06;
const JUMP_MOST = 0.25;
const FLASHES_MOST = 2;

/** Where he's read from: a name and a place on the floor. */
type Spot = [string, number, number];

/** A lamp beside the square, by the campfire and on the open square. */
function spots(): Spot[] {
  const lanterns = G.arena.village?.lanterns;
  if (!lanterns?.length) throw new Error('lab: village: no street lamps');
  const lamp = lanterns[0];
  const stand = VILLAGE_OBJECTS.find((object) => object.id === 'campfire')?.stand;
  if (!stand) throw new Error('lab: village: the campfire has no stand');
  return [
    ['beside a lamp', lamp.x + BESIDE_LAMP, lamp.z],
    ['by the campfire', stand[0], stand[1]],
    ['on the square', CAMPFIRE[0] + 8, CAMPFIRE[1] + 8],
  ];
}

/** The crystal's box frame by frame as he stands at `spot`. */
async function glowsAt(lab: Lab, tip: THREE.Object3D, spot: Spot): Promise<FrameGlow[]> {
  const [, x, z] = spot;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  const glows: FrameGlow[] = [];
  const point = new THREE.Vector3();
  let frame = 0;
  await lab.step(FRAMES, undefined, () => {
    G.player.model.root.updateMatrixWorld(true);
    tip.getWorldPosition(point);
    glows.push(glowOf(drawFrame(lab, boxRound(point, BOX)), frame));
    frame++;
  });
  return glows;
}

/** What's wrong with `glows`, and a line of them. */
function judged(name: string, glows: FrameGlow[]): { line: string; caught: string[] } {
  const means = glows.map((glow) => glow.mean);
  const median = medianOf(means);
  const brightest = Math.max(...means);
  const white = Math.max(...glows.map((glow) => glow.nearWhite));
  let jump = 0;
  for (let at = 1; at < means.length; at++) jump = Math.max(jump, Math.abs(means[at] - means[at - 1]));
  const flashes = worstFlashing(means.map((mean) => [mean]), 1 / 60).most;
  const peak = brightest / Math.max(median, 1e-4);
  const jumpShare = jump / Math.max(median, 1e-4);
  const line = `${name}: median ${median.toFixed(3)}, brightest ${brightest.toFixed(3)} (${peak.toFixed(2)}x), `
    + `near white ${(white * 100).toFixed(1)}%, a frame's move ${(jumpShare * 100).toFixed(0)}%, flashes ${flashes}`;
  const caught: string[] = [];
  if (peak > PEAK_MOST) caught.push(`${peak.toFixed(2)}x its median`);
  if (white > NEAR_WHITE_MOST) caught.push(`${(white * 100).toFixed(1)}% near white`);
  if (jumpShare > JUMP_MOST) caught.push(`moved ${(jumpShare * 100).toFixed(0)}% in a frame`);
  if (flashes > FLASHES_MOST) caught.push(`${flashes} flashes a second`);
  return { line, caught };
}

/** The crystal at each spot from each view, by midnight. */
export async function staffAtNight(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const tip = G.player.model.tip;
  const gems = tip ? glowingGemsUnder(tip) : [];
  if (!tip || !gems.length) {
    return { lines: ['the staff\'s crystal: this hero carries none'], problems: [], caught: null, moments: [] };
  }
  const kept = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const putBack = canary ? lightAsMain(gems) : (): void => undefined;
  holdHour(0);
  try {
    for (const view of VIEWS) {
      await viewBy(lab, view);
      for (const spot of spots()) {
        const name = `${spot[0]}, ${view}`;
        const { line, caught } = judged(name, await glowsAt(lab, tip, spot));
        lines.push(line);
        if (caught.length) problems.push(`the staff ${name}: ${caught.join(', ')}`);
        if (!canary) moments.push(await lab.screen(name, []));
      }
    }
  } finally {
    putBack();
    holdHour(null);
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments };
}
