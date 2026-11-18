// tools/lab ui `sitHint`: the prompt to sit (src/ui/sitHint.ts), "E Sit" in the village's objects' prompt, shown over
// a seat the cursor has outlined (from play: "when pointing at object to sit on, we need to display a hint like E
// Sit"). The mouse is put over the lobby's seat nearest the hero, as a player points at it: the seat outlined at once
// (`SIT.look`), the prompt shown and within the window; then put on the floor beside him, and the prompt gone. The
// canary makes the shown prompt clear (its alpha 0), which must be caught as not shown.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { SIT } from '../../../src/entities/sitting';
import { sitHintLabel } from '../../../src/ui/sitHint';
import { seatStands, seatTopAt, type Seat } from '../../../src/world/seats';
import { groundHeight } from '../../../src/world/ground';
import type { Lab } from './lab';
import { startOff } from './sit';

/** frames the mouse rests on the seat: past `SIT.look` at 60 a second, and a few for the prompt to follow */
const REST_FRAMES = Math.round(SIT.look * 60) + 4;
/** frames after the mouse leaves it, for the hint to go */
const LEAVE_FRAMES = 4;
/** how far a seat may be from the hero to be pointed at (m): within `SIT.reach`, a metre to spare (the lobby's nearest
 *  on the screen is 10.3 m off) */
const NEAR = SIT.reach - 1;
/** how high over the floor a fire is pointed at (m), as `lab sit` points at one */
const FIRE_AIM = 0.4;
/** how far the hint's box may reach past the window and still be within it (css px: rounding) */
const SLACK = 0.5;

/** What the state found: lines for its report, and its problems. */
interface Found {
  lines: string[];
  problems: string[];
}

/** the seat pointed at, and whether the canary hid the hint */
let pointed: Seat | null = null;
let hidden = false;

/** Whether the prompt is drawn this frame: placed on the screen and not clear. */
function hintVisible(): boolean {
  const label = sitHintLabel();
  return !!label && label.shown && label.alpha > 0;
}

/** The point of a seat the mouse is put over: its middle, on its top (a fire's a little over the floor). */
function seatMiddle(seat: Seat): THREE.Vector3 {
  const x = (seat.ax + seat.bx) / 2;
  const z = (seat.az + seat.bz) / 2;
  const y = seat.ground ? groundHeight(x, z) + FIRE_AIM : seatTopAt(seat, x, z);
  return new THREE.Vector3(x, y, z);
}

/** Whether a point of the world shows within the window. */
function onScreen(point: THREE.Vector3): boolean {
  const ndc = point.clone().project(G.camera);
  return Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9 && ndc.z < 1;
}

/** The standing seat nearest the hero that shows on the screen, within reach. */
function nearestSeat(): Seat | null {
  const from = G.player.pos;
  const seats = G.arena.seats.filter((seat) => seatStands(seat) && onScreen(seatMiddle(seat)));
  const near = seats.filter((seat) => seatMiddle(seat).setY(from.y).distanceTo(from) < NEAR);
  near.sort((a, b) => seatMiddle(a).distanceTo(from) - seatMiddle(b).distanceTo(from));
  return near[0] ?? null;
}

/** frames he stands where he's put before the seat is pointed at */
const PLACED_FRAMES = 30;

/** Puts him off the seat nearest him, facing it, where none shows on the screen within reach (the village's lobby
 *  opens on its square, the campfire's logs out of sight). */
async function standBySeat(lab: Lab): Promise<void> {
  const from = G.player.pos;
  const seats = G.arena.seats.filter(seatStands);
  seats.sort((a, b) => seatMiddle(a).distanceTo(from) - seatMiddle(b).distanceTo(from));
  if (!seats[0]) return;
  const { at, facing } = startOff(seats[0]);
  G.player.place(new THREE.Vector3(at[0], groundHeight(at[0], at[1]), at[1]), facing);
  await lab.step(PLACED_FRAMES);
}

/** Rests the mouse on the nearest seat for longer than it takes to outline it. */
export async function openSitHint(lab: Lab): Promise<void> {
  if (!nearestSeat()) await standBySeat(lab);
  pointed = nearestSeat();
  hidden = false;
  if (!pointed) return;
  lab.aim = seatMiddle(pointed);
  await lab.step(REST_FRAMES);
}

/** The hint shown and within the window, with the seat outlined (the canary hides it first). */
export function sitHintShown(canary: boolean): Found {
  if (!pointed) {
    const seats = G.arena.seats;
    const standing = seats.filter(seatStands);
    const shown = standing.filter((seat) => onScreen(seatMiddle(seat)));
    const nearest = Math.min(...shown.map((seat) => seatMiddle(seat).setY(G.player.pos.y).distanceTo(G.player.pos)));
    const line = `  sit hint: no seat in reach on the screen (${seats.length} seats, ${standing.length} standing, `
      + `${shown.length} on the screen, the nearest ${nearest.toFixed(1)} m off)`;
    return { lines: [line], problems: ['sitHint: no seat to point at'] };
  }
  const hint = sitHintLabel();
  if (canary && hint) {
    hint.alpha = 0;
    hidden = true;
  }
  const shown = hintVisible();
  const problems: string[] = [];
  if (!G.player.sitting.pointed) problems.push('sitHint: the seat pointed at was never outlined');
  if (!shown) problems.push('sitHint: the hint to sit isn\'t shown with a seat outlined');
  const lines = [`  sit hint: ${shown ? 'shown' : 'not shown'} over a seat outlined`];
  if (!hint || !shown) return { lines, problems };
  const box = hint.box;
  const within = box.x >= -SLACK && box.y >= -SLACK
    && box.x + box.w <= innerWidth + SLACK && box.y + box.h <= innerHeight + SLACK;
  if (!within) problems.push('sitHint: the hint to sit reaches past the window');
  lines.push(`  sit hint: drawn at ${Math.round(box.x)},${Math.round(box.y)} `
    + `${Math.round(box.w)}x${Math.round(box.h)} of ${innerWidth}x${innerHeight}`);
  return { lines, problems };
}

/** Puts the mouse on the floor beside him, for the hint to go. */
export async function closeSitHint(lab: Lab): Promise<void> {
  const hint = sitHintLabel();
  if (hidden && hint) hint.alpha = 1;
  lab.aim = G.player.pos.clone().add(new THREE.Vector3(0.5, 0, 0.5));
  await lab.step(LEAVE_FRAMES);
}

/** The hint gone once the mouse left the seat. */
export function sitHintClosed(): Found {
  const gone = !hintVisible();
  const lines = [`  sit hint: ${gone ? 'gone' : 'still shown'} with the mouse off the seat`];
  return { lines, problems: gone ? [] : ['sitHint: the hint to sit stayed with the mouse off the seat'] };
}
