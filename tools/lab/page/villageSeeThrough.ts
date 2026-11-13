// `lab village`'s props' hole (`core/seeThrough.ts`): the frame drawn with it and held shut, the hero beside a cottage
// over the shoulder, the wall running from the camera to him: nothing of it beside him may come apart (from play, by
// the terrace's wall and a cottage, "should not see through here, because I'm in the front"); and the hero behind a
// cottage from above, its roof over him: the hole must open where it hides him. `canary` holds the hole round, as it
// was, which must take the wall beside him apart.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { holdPropHole } from '../../../src/core/seeThrough';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { COTTAGES } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** how far off the cottage's wall he stands beside it and behind it (m), and the frames he's given to settle */
const BESIDE = 0.5;
const BEHIND = 0.9;
const SETTLE = 30;
/** how much wider and taller than his own box on screen the part of the frame his is (a share of each side) */
const PAD = 0.15;
/** how far a channel may move and still be the same */
const SAME = 1.5 / 255;
/** the most of the frame outside him the hole may change beside the wall, and the least of him it must open behind
 *  the roof */
const MOST_BESIDE = 0.002;
const LEAST_BEHIND = 0.05;

/** A box of the canvas in its pixels, from its bottom left. */
export interface PixelBox { left: number; bottom: number; right: number; top: number }

/** The hero's box on screen (his body and what he holds), padded by `PAD`. */
function heroOnScreen(canvas: Canvas): PixelBox {
  const box = new THREE.Box3().setFromObject(G.player.obj);
  const screen = new THREE.Box2();
  for (let corner = 0; corner < 8; corner++) {
    const at = new THREE.Vector3(
      corner & 1 ? box.max.x : box.min.x,
      corner & 2 ? box.max.y : box.min.y,
      corner & 4 ? box.max.z : box.min.z,
    ).project(G.camera);
    screen.expandByPoint(new THREE.Vector2(((at.x + 1) / 2) * canvas.width, ((at.y + 1) / 2) * canvas.height));
  }
  const padX = (screen.max.x - screen.min.x) * PAD;
  const padY = (screen.max.y - screen.min.y) * PAD;
  return {
    left: screen.min.x - padX,
    right: screen.max.x + padX,
    bottom: screen.min.y - padY,
    top: screen.max.y + padY,
  };
}

/** The share of the pixels inside `box` (or outside it) whose light moved between `a` and `b`. */
export function changedShare(a: Canvas, b: Canvas, box: PixelBox, inside: boolean): number {
  let changed = 0;
  let counted = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const inBox = x >= box.left && x <= box.right && y >= box.bottom && y <= box.top;
      if (inBox !== inside) continue;
      const at = (y * a.width + x) * 4;
      const moved = Math.max(
        Math.abs(a.pixels[at] - b.pixels[at]),
        Math.abs(a.pixels[at + 1] - b.pixels[at + 1]),
        Math.abs(a.pixels[at + 2] - b.pixels[at + 2]),
      );
      counted++;
      if (moved > SAME) changed++;
    }
  }
  return changed / Math.max(counted, 1);
}

/** A cottage's way from its middle: across it (its side walls' way out) and along it (its door's). */
function cottageWays(index: number): { across: THREE.Vector3; along: THREE.Vector3 } {
  const facing = COTTAGES[index].facing;
  return {
    across: new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing)),
    along: new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)),
  };
}

/** The hero stood at `at` facing `facing`, the camera behind him, let settle; whether he stood there. */
export async function standAt(lab: Lab, at: THREE.Vector3, facing: number): Promise<boolean> {
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, facing);
  faceCamera(facing);
  await lab.step(SETTLE);
  return Math.hypot(G.player.pos.x - at.x, G.player.pos.z - at.z) < 0.2;
}

/** The frame drawn with the props' hole as the game opens it (or held round, `across` 1), and the same frame drawn
 *  again with it held shut (a frame stepped between, the grass and the water moved over 60% of it). */
async function withAndWithout(lab: Lab, across: number | null): Promise<{ open: Canvas; shut: Canvas }> {
  try {
    holdPropHole(false, across);
    await lab.step(1);
    const open = drawFrame(lab);
    holdPropHole(true);
    return { open, shut: drawFrame(lab) };
  } finally {
    holdPropHole(false);
  }
}

/** The share of the frame outside him the hole changes, the hero beside cottage 0's side wall over the shoulder, its
 *  wall running from the camera to him; or null where he couldn't stand. */
async function besideTheWall(lab: Lab, canary: boolean): Promise<number | null> {
  const cottage = COTTAGES[0];
  const { across } = cottageWays(0);
  const out = (COTTAGE.w / 2) * cottage.size + BESIDE;
  const at = new THREE.Vector3(cottage.x, 0, cottage.z).addScaledVector(across, out);
  await viewBy(lab, 'third');
  if (!(await standAt(lab, at, cottage.facing))) return null;
  const { open, shut } = await withAndWithout(lab, canary ? 1 : null);
  return changedShare(open, shut, heroOnScreen(open), false);
}

/** The share of him the hole opens, the hero behind cottage 0 from above, its roof between him and the camera; or
 *  null where he couldn't stand. */
async function behindTheRoof(lab: Lab): Promise<number | null> {
  const cottage = COTTAGES[0];
  const { along } = cottageWays(0);
  const out = (COTTAGE.d / 2) * cottage.size + BEHIND;
  const at = new THREE.Vector3(cottage.x, 0, cottage.z).addScaledVector(along, -out);
  await viewBy(lab, 'top');
  // (facing away from the cottage, the camera behind him over its roof)
  if (!(await standAt(lab, at, cottage.facing + Math.PI))) return null;
  const { open, shut } = await withAndWithout(lab, null);
  return changedShare(open, shut, heroOnScreen(open), true);
}

/** A share as a percentage, or why there is none. */
const percent = (share: number | null): string => share === null ? 'no stand' : `${(share * 100).toFixed(2)}%`;

/** The props' hole beside a wall and behind a roof, by night as by day (from play, at night). */
export async function propHoleWhereHidden(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(12);
  const kept = viewMode();
  try {
    const beside = await besideTheWall(lab, canary);
    const behind = await behindTheRoof(lab);
    const line = `props' hole: beside a cottage's wall over the shoulder, the frame outside him it changes `
      + `${percent(beside)} (at most ${MOST_BESIDE * 100}%); behind its roof from above, the share of him it opens `
      + `${percent(behind)} (at least ${LEAST_BEHIND * 100}%)`;
    const apart = beside === null || beside > MOST_BESIDE;
    if (canary) return { lines: [line], problems: [], caught: apart, moments: [] };
    const problems: string[] = [];
    if (apart) problems.push(`${line}: the wall beside him came apart`);
    if (behind === null || behind < LEAST_BEHIND) problems.push(`${line}: the roof over him stayed whole`);
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    holdHour(null);
    await viewBy(lab, kept);
  }
}
