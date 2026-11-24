// `lab village --only lensZoomOutsideYard` (#811, from the owner: "implement zoom on RMB in village when not in training
// grounds"): the hero stood on the square, outside the training yard, over the shoulder and through the eyes, the
// right mouse button held: the camera's lens must narrow (`lensNow` under `ZOOMED`, its field of view with it), and
// let go, come back (over `BACK`); then in the yard's middle, where the button casts, held: no zoom. Said: the lens
// in each case and the camera's field of view held. `canary` holds the button with the hero armed everywhere (the button
// casting there, the lens never allowed), which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { lensNow, viewMode, type ViewMode } from '../../../src/core/renderer';
import { yardToWorld } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { armedEverywhere } from '../../../src/game/village';

/** the views V goes through, at most */
const VIEWS_ROUND = 3;

/** the lens held narrower than this counts as zoomed, wider than `BACK` as back */
const ZOOMED = 0.65;
const BACK = 0.95;
/** the frames the button is held, and let go */
const HELD = 45;
const LET_GO = 60;
/** where he stands on the square, outside the yard */
const SQUARE: [number, number] = [0, 4.5];

/** What the check found, as the village's checks report it. */
interface Checked { lines: string[]; problems: string[]; caught: boolean | null; moments: Pictured[] }

/** The game's view made `view` as the player makes it, by V (the game keeps the view it was last given by it). */
async function pressViewTo(lab: Lab, view: ViewMode): Promise<void> {
  for (let press = 0; press < VIEWS_ROUND && viewMode() !== view; press++) {
    await lab.step(1, () => ({ keys: ['v'] }));
    await lab.step(1);
  }
  if (viewMode() !== view) throw new Error(`lens: V never brought the ${view} view (it shows ${viewMode()})`);
}

/** The hero stood at (x, z), still, in view `view`, settled. */
async function standIn(lab: Lab, [x, z]: [number, number], view: ViewMode): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await pressViewTo(lab, view);
  await lab.step(LET_GO);
}

/** The lens held, the field of view then, the lens let go, and those moments pictured where they're asked for. */
interface Held { held: number; fov: number; after: number; moments: Pictured[] }

/** The lens as the button is held, the camera's field of view then, and the lens after it's let go. */
async function holdAndLetGo(lab: Lab, canary: boolean, label?: string): Promise<Held> {
  armedEverywhere(canary);
  await lab.step(HELD, () => ({ m2: true }));
  const held = lensNow();
  armedEverywhere(false);
  const fov = G.camera.fov;
  const moments: Pictured[] = [];
  if (label) moments.push(await lab.screen(`${label}, the right button held`));
  await lab.step(LET_GO);
  if (label) moments.push(await lab.screen(`${label}, let go`));
  return { held, fov, after: lensNow(), moments };
}

/** The lens zooming on the right button outside the yard, in both close views, and not in the yard. */
export async function lensZoomOutsideYard(lab: Lab, canary: boolean): Promise<Checked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = viewMode();
  try {
    for (const view of ['third', 'first'] as const) {
      await standIn(lab, SQUARE, view);
      const label = canary ? undefined : `on the square, ${view === 'third' ? 'over the shoulder' : 'through the eyes'}`;
      const result = await holdAndLetGo(lab, canary, label);
      const { held, fov, after } = result;
      moments.push(...result.moments);
      lines.push(`lens: on the square ${view}, held ${held.toFixed(2)} (field of view ${fov.toFixed(1)}°), let go ${after.toFixed(2)}`);
      if (held > ZOOMED) problems.push(`lens: on the square ${view}, the right button held zoomed only to ${held.toFixed(2)}`);
      if (after < BACK) problems.push(`lens: on the square ${view}, let go it stayed at ${after.toFixed(2)}`);
    }
    await standIn(lab, yardToWorld(0, 0), 'third');
    const { held } = await holdAndLetGo(lab, false);
    lines.push(`lens: in the yard third, held ${held.toFixed(2)} (the button casts there)`);
    if (held < BACK) problems.push(`lens: in the yard the right button zoomed to ${held.toFixed(2)}`);
  } finally {
    await pressViewTo(lab, was);
    await lab.step(LET_GO);
  }
  if (!canary) return { lines, problems, caught: null, moments };
  return { lines, problems: [], caught: problems.some((problem) => problem.includes('zoomed only')), moments };
}
