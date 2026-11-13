// `lab village --cold --only portalAtNight`: a portal's Enter pressed at night with the fight's programs still cold, as
// a first visit's or a new build's is (from play, "when using a portal to the main game, it hangs": in real Chrome at
// midnight, 38 s and then 11 s with no frame, where noon took 3 s). Every lit program is made for two casting point
// lights. By night the lamps' two cast, and a biome drawn in the village's place to warm it brought its own two: that
// one draw made every lit program for four and linked them inside it (38 s of its `drawMs`). Read here: the most point
// lights casting at any render from the press on, and the programs the run's first frames compile, none. The lab's GPU
// cache answers quickly, so the time isn't the measure (`tools/stalls/walks/portal.js` reads it). `canary` leaves
// another pooled light casting, which must be found.
import * as THREE from 'three';
import { realWait } from './lab';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { isWarm } from '../../../src/game/warm';
import { villageObject } from '../../../src/game/village';
import { pooledLights } from '../../../src/fx/lights';
import { groundHeight } from '../../../src/world/ground';
import type { LightsChecked } from './villageLights';

/** the hour held, midnight, when the lamps cast */
const MIDNIGHT = 0;
/** frames for the lamps to take the casting lights, and the run's first frames read */
const SETTLE = 60;
const READ_FRAMES = 60;
/** the fight's warm-up runs in the browser's tasks, which the lab's frames leave no room for: a frame and this long in
 *  turn (ms), for this long at the most (s) */
const WARM_POLL_MS = 50;
const WARM_MOST_S = 150;
/** the pool's spare the canary leaves casting */
const CANARY_LIGHT = 7;

/** the point lights casting that every lit program is made for (`src/world/AGENTS.md`) */
const CASTING = 2;

/** The point lights in the scene that three counts as casting: on, and shown all the way up. */
function castingNow(): number {
  let casting = 0;
  G.scene.traverseVisible((object) => {
    const light = object as THREE.PointLight;
    if (light.isPointLight && light.castShadow) casting++;
  });
  return casting;
}

/** Every render of the scene watched till the undoing returned is called: the most point lights casting at one. */
function watchRenders(): { most: () => number; stop: () => void } {
  const renderer = G.renderer;
  const render = renderer.render;
  let most = 0;
  renderer.render = (scene, camera) => {
    if (scene === G.scene) most = Math.max(most, castingNow());
    render.call(renderer, scene, camera);
  };
  return { most: () => most, stop: () => { renderer.render = render; } };
}

/** The programs the renderer holds now. */
const programsNow = (): number => G.renderer.info.programs?.length ?? 0;

/** A frame at a time with the browser's tasks between them, until the run has begun. */
async function untilTheRun(lab: Lab): Promise<void> {
  const from = window.__labClock.realNow();
  while (G.mode !== 'run') {
    if (window.__labClock.realNow() - from > WARM_MOST_S * 1000) {
      throw new Error(`lab: village: the run never began within ${WARM_MOST_S} s of Enter`);
    }
    await lab.step(1);
    await realWait(WARM_POLL_MS);
  }
}

/** Enter pressed at midnight, the fight cold: the run's first frames compile nothing. */
export async function portalAtNight(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (isWarm('fight')) {
    const line = 'portal at night: not measured, the fight is warm already (run it with --cold)';
    return { lines: [line], problems: [], caught: canary ? false : null, moments: [] };
  }
  holdHour(MIDNIGHT);
  const stand = villageObject('crypt')?.stand;
  if (!stand) throw new Error('lab: village: no portal to the crypt to stand at');
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(stand[0], groundHeight(stand[0], stand[1]), stand[1]), 0);
  await lab.step(SETTLE);
  if (G.arena.village.night <= 0.01) throw new Error('lab: village: midnight never fell');
  const spare = pooledLights()[CANARY_LIGHT];
  if (canary) spare.castShadow = true;
  const before = programsNow();
  const renders = watchRenders();
  document.querySelector<HTMLButtonElement>('#btn-start')!.click();
  lab.drawing = true;
  try {
    await untilTheRun(lab);
    const warmed = programsNow();
    await lab.step(READ_FRAMES);
    const late = programsNow() - warmed;
    const most = renders.most();
    const line = `portal at night: the warm-up made ${warmed - before} programs, the run's first frames ${late}; `
      + `at most ${most} point lights casting at a render (its programs are made for ${CASTING})`;
    const wrong = late > 0 || most > CASTING;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
  } finally {
    renders.stop();
    lab.drawing = false;
    spare.castShadow = false;
    holdHour(null);
  }
}
