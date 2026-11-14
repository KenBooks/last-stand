// The weapon as the eyes frame it (tools/lab `sheet`, through the eyes): where it comes into the frame, where its tip
// is, how it leans on the screen, how wide it's drawn, and how much of the frame the weapon and the arm holding it
// cover, read off the frame as it's drawn (the eye's rays through the screen). A rest is matched to a reference's
// screenshots by these numbers, not by eye: handed over as matching Vermintide 2's, a rest leaning in, twice as wide
// and with its head out of the frame failed half of what its screenshots show.
import * as THREE from 'three';
import type { Lab } from './lab';
import { drawnSolid } from './onScreen';
import { pickGrid } from './pickGrid';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';

/** the grid of the eye's rays the cover is counted on, across and down (match.mjs `OUTLINE_GRID` draws a
 *  reference's outlines on one of its size) */
const GRID_ACROSS = 96;
const GRID_DOWN = 54;
/** what a cell of the grid shows (`Framed.cells`): nothing of the hero's, his weapon, his arm or fist */
const SHOWS = { none: '0', weapon: '1', arm: '2' } as const;
/** what the pick of a cell finds (page/pickGrid.ts: the index of the group drawn there, of [weapon, arm]) */
const PICKED = { none: -1, weapon: 0, arm: 1 } as const;
/** the points along the weapon from its grip to its tip, projected to find its part in the frame */
const ALONG = 64;
/** where along its part in the frame the weapon's width is read (shares of it from where it comes in): the middle
 *  reading is its width, so a guard or a head across one doesn't count (read at one place, a sword's crossguard was
 *  its width) */
const WIDTH_AT = [0.3, 0.5, 0.7];
/** the step the width is felt out in (a share of the frame's width), and the widest it's followed */
const WIDTH_STEP = 0.002;
const WIDTH_MOST = 0.3;
/** where a weapon's head starts: the share of its length from its butt end to its tip (a maul's head, an axe's bit,
 *  a blade's point) */
export const HEAD_FROM = 0.8;
/** how near an edge (a share of the frame) the weapon's way in is said to come in over it */
const EDGE = 0.02;

/** A place on the screen: across (0 its left edge, 1 its right) and down (0 its top, 1 its bottom). */
export interface Place {
  x: number;
  y: number;
}

/** A part of the screen, its edges as `Place`'s. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The weapon as framed. */
export interface Framed {
  /** where its part in the frame starts (from its butt end), and over which edge it comes in (none: its end is in) */
  from: Place;
  edge: 'bottom' | 'right' | 'left' | 'top' | null;
  /** its tip, and whether that's in the frame; and the farthest of it the frame shows (its tip, or where it leaves) */
  tip: Place;
  tipIn: boolean;
  far: Place;
  /** its lean on the screen from upright (degrees), out towards its own side's edge or in towards the middle */
  lean: number;
  out: boolean;
  /** how wide it's drawn along its part in the frame (a share of the frame's width) */
  wide: number;
  /** the shares of the frame the weapon covers, and the arm and fist holding it */
  weaponCover: number;
  armCover: number;
  /** the part of the frame the weapon covers (its head's reach into it with its haft's: the line alone left a
   *  head out of the frame unseen) */
  box: Box;
  /** the share of the frame its head covers (`HEAD_FROM` on), and the part of the frame it's in (none out of it):
   *  the owner's first ask of a maul through the eyes was its head in the frame */
  headCover: number;
  headBox: Box | null;
  /** what each cell of the grid of rays shows, row by row from the top left (`SHOWS`), and the grid's size: the
   *  weapon's and the fist's outlines, matched to a reference's (one number at a time, a fit matched every
   *  number with the blade out of the frame and the hand in it) */
  cells: string;
  grid: { across: number; down: number };
}

const sight = new THREE.Raycaster();

/** The camera the hero's arms are drawn with: their own (renderer.ts `drawArms`), or the world's (an older tree's
 *  has no other). What it shows of them is where they're seen: through the world's, a weapon drawn through a
 *  narrower view of its own was measured where it isn't. */
export function armsLens(): THREE.PerspectiveCamera {
  return renderer.armsCamera?.() ?? (G.camera as THREE.PerspectiveCamera);
}

/** Where a point of the world is on the screen, and whether it's ahead of the camera. */
function placeOf(world: THREE.Vector3): Place & { ahead: boolean } {
  const lens = armsLens();
  const ahead = lens.worldToLocal(world.clone()).z < 0;
  const ndc = world.clone().project(lens);
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, ahead };
}

const inFrame = (place: Place & { ahead: boolean }) =>
  place.ahead && place.x >= 0 && place.x <= 1 && place.y >= 0 && place.y <= 1;

/** The meshes drawn in the camera's view under `root`, not under any of `besides`. */
function drawnUnder(root: THREE.Object3D, besides: THREE.Object3D[] = []): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const walk = (object: THREE.Object3D): void => {
    if (besides.includes(object)) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.layers.test(armsLens().layers) && drawnSolid(mesh)) meshes.push(mesh);
    for (const child of object.children) walk(child);
  };
  walk(root);
  return meshes;
}

/** The first of `meshes` the eye's ray through `place` meets, if any. */
function metAt(place: Place, meshes: THREE.Mesh[]): THREE.Intersection | undefined {
  const lens = armsLens();
  sight.layers.mask = lens.layers.mask;
  sight.setFromCamera(new THREE.Vector2(place.x * 2 - 1, 1 - place.y * 2), lens);
  return sight.intersectObjects(meshes, false)[0];
}

/** The edge of the frame `place` lies on, if it's within `EDGE` of one. */
function edgeOf(place: Place): Framed['edge'] {
  if (place.y >= 1 - EDGE) return 'bottom';
  if (place.x >= 1 - EDGE) return 'right';
  if (place.x <= EDGE) return 'left';
  if (place.y <= EDGE) return 'top';
  return null;
}

/** How wide `meshes` are drawn across the screen line `way` (aspect-corrected, normalized) at `at`. */
function widthAt(at: Place, way: THREE.Vector2, meshes: THREE.Mesh[]): number {
  const aspect = armsLens().aspect;
  // (square to the weapon's line on the screen, `n` a share of the frame's width; read in shares of its height, a
  // width came out the aspect times too wide)
  const across = new THREE.Vector2(-way.y, way.x);
  const stepOf = (n: number): Place => ({ x: at.x + across.x * n, y: at.y - across.y * n * aspect });
  let wide = 0;
  for (const side of [1, -1]) {
    for (let n = side * WIDTH_STEP; Math.abs(n) <= WIDTH_MOST; n += side * WIDTH_STEP) {
      if (!metAt(stepOf(n), meshes)) break;
      wide += WIDTH_STEP;
    }
  }
  return wide;
}

/** The cover of the frame: the shares of it the eye's rays meet `weapon` and `arm` on first, the part of it they
 *  meet the weapon in, and what each ray meets (`Framed.cells`). */
/** What the grid of rays found: the shares of it the weapon, its head and the arm cover, the boxes round the
 *  weapon and its head, and each cell. */
interface Cover {
  weapon: number;
  head: number;
  arm: number;
  box: Box;
  headBox: Box | null;
  cells: string;
}

/** `box` widened to the grid's cell `i`, `j`. */
function widened(box: Box, i: number, j: number): void {
  box.left = Math.min(box.left, i / GRID_ACROSS);
  box.right = Math.max(box.right, (i + 1) / GRID_ACROSS);
  box.top = Math.min(box.top, j / GRID_DOWN);
  box.bottom = Math.max(box.bottom, (j + 1) / GRID_DOWN);
}

/** The grid's cells through `weapon` and `arm` (drawn once, page/pickGrid.ts; a ray through each cell the weapon
 *  shows, for whether it's its head); `onHead` says whether a point of the weapon is on its head. */
function coverOf(lab: Lab, weapon: THREE.Mesh[], arm: THREE.Mesh[], onHead: (point: THREE.Vector3) => boolean):
  Cover {
  const shows = pickGrid(lab, armsLens(), [weapon, arm], GRID_ACROSS, GRID_DOWN);
  let onWeapon = 0;
  let onHeadCount = 0;
  let onArm = 0;
  const box = { left: 1, top: 1, right: 0, bottom: 0 };
  const headBox = { left: 1, top: 1, right: 0, bottom: 0 };
  const cells: string[] = new Array(GRID_ACROSS * GRID_DOWN).fill(SHOWS.none);
  for (let i = 0; i < GRID_ACROSS; i++) {
    for (let j = 0; j < GRID_DOWN; j++) {
      const shown = shows[j * GRID_ACROSS + i];
      if (shown === PICKED.none) continue;
      if (shown === PICKED.arm) {
        onArm++;
        cells[j * GRID_ACROSS + i] = SHOWS.arm;
        continue;
      }
      cells[j * GRID_ACROSS + i] = SHOWS.weapon;
      onWeapon++;
      widened(box, i, j);
      const hit = metAt({ x: (i + 0.5) / GRID_ACROSS, y: (j + 0.5) / GRID_DOWN }, weapon);
      if (!hit || !onHead(hit.point)) continue;
      onHeadCount++;
      widened(headBox, i, j);
    }
  }
  const rays = GRID_ACROSS * GRID_DOWN;
  return {
    weapon: onWeapon / rays,
    head: onHeadCount / rays,
    arm: onArm / rays,
    box,
    headBox: onHeadCount ? headBox : null,
    cells: cells.join(''),
  };
}

/** The end of `weapon` (its meshes, under `grip`) behind its grip: the lowest of it along the grip's length, world. */
function buttOf(grip: THREE.Object3D, weapon: THREE.Mesh[]): THREE.Vector3 {
  let lowest = 0;
  const corner = new THREE.Vector3();
  for (const mesh of weapon) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox!;
    for (let k = 0; k < 8; k++) {
      corner.set(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & 4 ? max.z : min.z);
      lowest = Math.min(lowest, grip.worldToLocal(mesh.localToWorld(corner)).y);
    }
  }
  return grip.localToWorld(new THREE.Vector3(0, lowest, 0));
}

/**
 * The right hand's weapon as the eyes frame it (`Model.tip`, a joint on its grip), with the world matrices up to date;
 * none if the model's tip isn't on a grip or no part of it is in the frame. Its line is followed from its butt end
 * (from the grip, a hand in the frame read as where its haft came into it). Throws if a part of it is in the frame
 * but no ray met it there: a measure that saw nothing.
 */
export function framed(lab: Lab): Framed | null {
  const tip = lab.model.tip;
  const grip = tip?.parent;
  if (!tip || !grip || grip === lab.model.root) return null;
  // (no weapon in hand, its meshes hidden: the mage with no staff, #402)
  if (!grip.visible) return null;
  const weapon = drawnUnder(grip);
  const from = buttOf(grip, weapon);
  const to = tip.getWorldPosition(new THREE.Vector3());
  const seen: Place[] = [];
  for (let n = 0; n <= ALONG; n++) {
    const place = placeOf(from.clone().lerp(to, n / ALONG));
    if (inFrame(place)) seen.push(place);
  }
  if (seen.length < 2) return null;
  const first = seen[0];
  const last = seen[seen.length - 1];
  const aspect = armsLens().aspect;
  const way = new THREE.Vector2((last.x - first.x) * aspect, first.y - last.y).normalize();
  const lean = (Math.atan2(Math.abs(way.x), way.y) * 180) / Math.PI;
  const out = Math.sign(way.x) === Math.sign(first.x - 0.5);
  const arm = drawnUnder(lab.joints.shoulderR, [grip]);
  const spots = WIDTH_AT.map((share) => seen[Math.round((seen.length - 1) * share)]);
  if (!spots.some((spot) => metAt(spot, weapon))) {
    throw new Error('lab: the weapon is in the frame, but no ray through it met its meshes: the measure saw nothing');
  }
  const wide = spots.map((spot) => widthAt(spot, way, weapon)).sort((a, b) => a - b)[1];
  // (a point's share of the way from the butt end to the tip, along the grip's length)
  const butt = grip.worldToLocal(from.clone()).y;
  const length = grip.worldToLocal(to.clone()).y - butt;
  const onHead = (point: THREE.Vector3) => (grip.worldToLocal(point.clone()).y - butt) / length >= HEAD_FROM;
  const cover = coverOf(lab, weapon, arm, onHead);
  // (a weapon wider than a cell covers one: none is a pick that drew nothing, as one did while the lab held its draws)
  if (wide > 1 / GRID_ACROSS && cover.weapon === 0) {
    throw new Error('lab: the weapon is in the frame, but no cell of the grid shows it: the measure saw nothing');
  }
  const tipPlace = placeOf(to);
  // (a tip well in the frame has its head round it: no ray meeting it there is a measure that saw nothing)
  const wellIn = tipPlace.x > EDGE && tipPlace.x < 1 - EDGE && tipPlace.y > EDGE && tipPlace.y < 1 - EDGE;
  if (inFrame(tipPlace) && wellIn && !cover.headBox) {
    throw new Error('lab: the weapon\'s tip is in the frame, but no ray met its head: the measure saw nothing');
  }
  return {
    from: first,
    edge: edgeOf(first),
    tip: tipPlace,
    tipIn: inFrame(tipPlace),
    far: last,
    lean,
    out,
    wide,
    weaponCover: cover.weapon,
    armCover: cover.arm,
    box: cover.box,
    headCover: cover.head,
    headBox: cover.headBox,
    cells: cover.cells,
    grid: { across: GRID_ACROSS, down: GRID_DOWN },
  };
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** `framed`'s numbers as a line of the sheet. */
export function describeFramed(seen: Framed): string {
  const comesIn = seen.edge ? `in over the ${seen.edge} edge` : 'its butt end in the frame';
  const tip = seen.tipIn ? `${percent(seen.tip.x)} across, ${percent(seen.tip.y)} down` : 'out of the frame';
  const head = seen.headBox
    ? `its head covering ${percent(seen.headCover)} (${percent(seen.headBox.left)} to ${percent(seen.headBox.right)} `
      + `across, ${percent(seen.headBox.top)} to ${percent(seen.headBox.bottom)} down)`
    : 'its head out of the frame';
  return `the weapon as framed: ${comesIn} ${percent(seen.from.x)} across, ${percent(seen.from.y)} down; `
    + `its tip ${tip}; leaning ${seen.lean.toFixed(0)}° ${seen.out ? 'out' : 'in'}; `
    + `${(seen.wide * 100).toFixed(1)}% of the frame wide; covering ${percent(seen.weaponCover)} of the frame `
    + `(${percent(seen.box.left)} to ${percent(seen.box.right)} across, ${percent(seen.box.top)} to `
    + `${percent(seen.box.bottom)} down), ${head}, the arm and fist ${percent(seen.armCover)}`;
}
