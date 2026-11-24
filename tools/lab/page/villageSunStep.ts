// `lab village`'s sun's step: what the frame draws when the sun has moved far enough for its kept shadow map to be
// drawn again (`world/arena.ts`, about every 20 s by the player's clock). From play, "FPS is not stable, even on high
// end hardware": under three that frame drew the scene a second time into a pixel and every still light's shadow cube
// with the sun's map, 870 draws and 4.1M triangles where its neighbours drew 450 and 0.2M, the arena's stage 28 to
// 41 ms of it on a phone's CPU (`lab perf --village --throttle 4`) and 5 to 40 ms in players' reports (traces
// 0BAM-GTXN, KAW8-MQ8M, Y8YJ-N70H). Under the engine it reads the engine's own counts: the sun's map is kept while
// what casts into it and its view stand as they stood (Bulwark's `shadow_mark`), and the lamps' maps of what stands
// still are drawn once, a lamp a frame (`engine/lampShadows.ts`): the step's frame draws the sun's map and no lamp's.
// Then the frame as the step left the lamps' maps against every one of them drawn again at that moment. `canary` asks
// for every lamp's map at the step: their faces must be counted.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { render } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { changedShare } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given for the place to settle at an hour */
const SETTLE = 30;
/** the hours the sun is stepped from, by day and by night (the lamps' maps are kept then too) */
const HOURS = [10, 0];
/** how far the hour is moved for a step (h): past an eighth of a unit of the sun's place, well short of a new look */
const STEP_HOURS = 0.25;
/** the frames watched after the hour moves, and beside it (after `BESIDE_AFTER` frames: the first after a frame drawn
 *  alone draws the sun's map whole) */
const WATCHED = 4;
const BESIDE_AFTER = 2;
/** the share of the step's triangles in the sun's map past which a frame beside it drew the map whole */
const WHOLE_SHARE = 0.6;
/** the most draws the step's frame may make in the scene's pass over a frame beside it */
const SCENE_OVER = 4;
/** where he stands, on the square among its lamps, and where he stood before the step */
const STAND: [number, number] = [-4, 4];
const STOOD: [number, number] = [2, 3];
/** the most of the frame that may differ between the lamps' maps as the step left them and all drawn again */
const MOST_CHANGED = 0.002;
/** the most frames drawn for every lamp's map to be drawn again, a lamp a frame (24 lamps and a place's own 4) */
const AGAIN_FRAMES = 40;

/** What a frame drew, by the engine's counts: the scene's pass, the sun's map (its draws and triangles: a map kept
 *  draws its movers alone over a copy of it, the hero idling among them, so its draws read alike whether it's drawn
 *  whole or not), the lamps' maps of what stands still (faces) and of the movers (faces), and the scene's triangles. */
export interface Drawn {
  scene: number;
  sun: number;
  sunTriangles: number;
  still: number;
  movers: number;
  triangles: number;
}

/** The engine's bridge, which a village check needs. */
function bridge(): NonNullable<typeof RUST.bridge> {
  if (!RUST.bridge) throw new Error('lab: village: the engine is not drawing');
  return RUST.bridge;
}

/** What the engine's last frame drew. */
function lastDrawn(): Drawn {
  const stats = bridge().stats;
  return {
    scene: stats.draws, sun: stats.shadowDraws, sunTriangles: stats.shadowTriangles, still: stats.lampFaces,
    movers: stats.moverFaces, triangles: stats.triangles,
  };
}

/** The most of each count of `a` and `b`. */
function mostOf(a: Drawn, b: Drawn): Drawn {
  return {
    scene: Math.max(a.scene, b.scene), sun: Math.max(a.sun, b.sun), sunTriangles: Math.max(a.sunTriangles, b.sunTriangles),
    still: Math.max(a.still, b.still), movers: Math.max(a.movers, b.movers), triangles: Math.max(a.triangles, b.triangles),
  };
}

/** What each of `frames` frames drew, each into `all`; returns the most of each count a frame drew. */
export async function busiestFrame(lab: Lab, frames: number, all: Drawn[] = []): Promise<Drawn> {
  const drawing = lab.drawing;
  lab.drawing = true;
  let busiest: Drawn | null = null;
  try {
    for (let frame = 0; frame < frames; frame++) {
      await lab.step(1);
      const now = lastDrawn();
      all.push(now);
      busiest = busiest ? mostOf(busiest, now) : now;
    }
  } finally {
    lab.drawing = drawing;
  }
  return busiest ?? lastDrawn();
}

/** Every lamp's map of what stands still asked again (a canary's plant). */
export const askLampsAgain = (): void => bridge().lampShadowsAgain();

/** Thousands, rounded. */
const thousands = (count: number): string => `${Math.round(count / 1000)}k`;

const said = (drawn: Drawn): string => `${drawn.scene} draws in the scene (${thousands(drawn.triangles)} triangles), `
  + `${drawn.sun} in the sun's map (${thousands(drawn.sunTriangles)}), ${drawn.still} lamps' faces of what stands `
  + `still, ${drawn.movers} of the movers (the most of each a frame drew)`;

/** The hero stood at `spot`. */
export function standAt([x, z]: [number, number]): void {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
}

/**
 * The frame now, the lamps' maps as they were left, against the frame with every one drawn again: the share that
 * changed, at one moment (the frames between are drawn at the same time: the grass and the water move).
 */
export function leftAgainstDrawnAgain(lab: Lab): number {
  const left = drawFrame(lab);
  askLampsAgain();
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let frame = 0; frame < AGAIN_FRAMES && bridge().lampShadowsNow().waiting > 0; frame++) render();
  } finally {
    lab.drawing = drawing;
  }
  const waiting = bridge().lampShadowsNow().waiting;
  if (waiting > 0) throw new Error(`lab: village: ${waiting} lamps' maps still waiting after ${AGAIN_FRAMES} frames`);
  return changedShare(left, drawFrame(lab));
}

/** The sun stepped by day and by night: its frame draws the sun's map again, and nothing else twice. */
export async function sunStepDrawsItsMap(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  let caught = false;
  try {
    for (const hour of HOURS) {
      holdHour(hour);
      standAt(STOOD);
      await lab.step(SETTLE);
      // (a frame drawn: the maps hold his shadow where he stands, as a player's do at a step)
      drawFrame(lab);
      await busiestFrame(lab, BESIDE_AFTER);
      const besideFrames: Drawn[] = [];
      const beside = await busiestFrame(lab, WATCHED, besideFrames);
      holdHour(hour + STEP_HOURS);
      if (canary) askLampsAgain();
      const step = await busiestFrame(lab, WATCHED);
      const line = `the sun stepped at ${hour}:00: ${said(step)}; a frame beside it: ${said(beside)}`;
      lines.push(line);
      // (a frame beside it drew the map whole where it drew as many triangles as the step's whole draw, near enough:
      // the movers alone, over a copy, are a fifth of it)
      const whole = besideFrames.filter((frame) => frame.sunTriangles > step.sunTriangles * WHOLE_SHARE).length;
      if (whole > 0) {
        problems.push(`${line}: the sun's map drawn whole on ${whole} of ${besideFrames.length} frames beside it`);
      } else if (step.sunTriangles <= beside.sunTriangles) {
        problems.push(`${line}: the sun's map wasn't drawn again (the measure's own)`);
      }
      const twice = step.scene > beside.scene + SCENE_OVER;
      const lamps = step.still > 0;
      if (twice) problems.push(`${line}: the scene drawn again for it`);
      if (lamps) problems.push(`${line}: the lamps' maps of what stands still drawn again for it`);
      caught ||= lamps;
      await lab.step(2);
      standAt(STAND);
      await lab.step(SETTLE);
      const changed = leftAgainstDrawnAgain(lab);
      const share = (of: number): string => `${(of * 100).toFixed(2)}%`;
      const kept = `at ${hour}:00, walked off after the sun's step, the frame as it left the lamps' maps `
        + `against all drawn again: ${share(changed)} changed`;
      lines.push(kept);
      if (changed > MOST_CHANGED) problems.push(`${kept}: over ${share(MOST_CHANGED)}`);
    }
  } finally {
    holdHour(null);
    await lab.step(SETTLE);
  }
  if (canary) return { lines, problems: [], caught, moments: [] };
  return { lines, problems, caught: null, moments: [] };
}
