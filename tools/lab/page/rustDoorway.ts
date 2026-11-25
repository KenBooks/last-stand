// A doorway in a wall gone whole: its frame and its leaves stay, a ghost. From play, stood in the hall of heroes
// with its front wall gone whole round him: "can we not completely thin doors? because they are obstacles, players
// will not know why they cannot move", "completely thinning the wall works for walls without entrance... but if
// there is a gap... it needs to be hinted at".
//
// Read over the pixels the doorway covers: how much of it is left, from the frame as played, the frame with
// nothing thinned and the frame with the doorway hidden, the houses' other parts out of all three.

import type { Lab, Pictured } from './lab';
import { type Checked, failed, passed } from './rustPixels';
import { type Shot, settledAt, shotAfter, show, showHouses } from './rustHouseRule';
import { RUST } from '../../../src/engine';

/** the name `lab houserule --only` runs this by */
export const DOORWAY_VIEW_NAME = 'the doorway from in the hall, as played';
/** where he stands in the hall by its door, the camera behind him over the room */
const DOORWAY_VIEW = { name: DOORWAY_VIEW_NAME, at: [-2.4, -15.6] as [number, number], turned: 20, zoom: 0.35 };
/** the least a pixel's colour with the doorway whole is apart from without it to be read as the doorway's
 *  (levels, summed) */
const APART_LEAST = 45;
/** the fewest such pixels for the doorway to be in the frame */
const PIXELS_LEAST = 2000;
/** the least and the most of the doorway left: a ghost, neither gone nor standing whole over him */
export const DOORWAY_LEFT = { least: 0.15, most: 0.6 };
/** the most the canary may read left: gone whole with its wall */
const CANARY_MOST = 0.05;

/** What of the doorway is left over the pixels it covers, 0 to 1, and how many they are. */
function doorwayLeft(played: Shot, whole: Shot, bare: Shot): { left: number; pixels: number } {
  const [asPlayed, asWhole, asBare] = [played, whole, bare].map((shot) => shot.pixels.data);
  let left = 0;
  let pixels = 0;
  for (let at = 0; at < asPlayed.length; at += 4) {
    let apart = 0;
    let along = 0;
    let span = 0;
    for (let channel = 0; channel < 3; channel++) {
      const cover = asWhole[at + channel] - asBare[at + channel];
      apart += Math.abs(cover);
      along += (asPlayed[at + channel] - asBare[at + channel]) * cover;
      span += cover * cover;
    }
    if (apart < APART_LEAST) continue;
    left += Math.min(1, Math.max(0, along / span));
    pixels++;
  }
  return { left: pixels ? left / pixels : 0, pixels };
}

/** The doorway read as the game stands, and the frame as played. */
async function readDoorway(lab: Lab): Promise<[{ left: number; pixels: number }, Pictured]> {
  const settled = await settledAt(lab, DOORWAY_VIEW);
  try {
    // (lit as played: in the plain colours the houses are read by, the leaves' planks are the paving's own grey)
    RUST.tune.debug = 0;
    // (the houses' own parts out of all three frames: with nothing thinned the hall's roof is whole over him)
    showHouses(false);
    show(['hallLeaves'], true, false);
    // (and its columns: thinned as played, whole with nothing thinned, they'd read as the doorway's)
    show(['hallColumn'], false, false);
    const played = await shotAfter(lab, `${DOORWAY_VIEW.name}: as played`);
    RUST.tune.housesWhole = 1;
    const whole = await shotAfter(lab, `${DOORWAY_VIEW.name}: nothing thinned`);
    RUST.tune.housesWhole = 0;
    show(['hallLeaves'], false, false);
    const bare = await shotAfter(lab, `${DOORWAY_VIEW.name}: the doorway hidden`);
    return [doorwayLeft(played, whole, bare), played.pictured];
  } finally {
    show(['hallLeaves'], true, false);
    show(['hallColumn'], true, false);
    showHouses(true);
    RUST.tune.housesWhole = 0;
    await settled.done();
  }
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** The doorway held to a ghost from in its room (pictured as played where it isn't), and its canary: gone whole
 *  with its wall (`rust.leavesStay` 0), which must read nothing left. */
export async function doorwayStays(lab: Lab): Promise<[Checked, Pictured[]]> {
  const [read, pictured] = await readDoorway(lab);
  const line = `${DOORWAY_VIEW.name}: ${percent(read.left)} of its frame and leaves left (${read.pixels} pixels)`;
  const wrong: string[] = [];
  if (read.pixels < PIXELS_LEAST) wrong.push('the doorway is not in the frame');
  if (read.left < DOORWAY_LEFT.least) wrong.push('the doorway is gone with its wall');
  if (read.left > DOORWAY_LEFT.most) wrong.push('the doorway stands whole over the room');
  RUST.tune.leavesStay = 0;
  try {
    const [gone] = await readDoorway(lab);
    if (gone.left > CANARY_MOST) wrong.push(`canary: gone with its wall, ${percent(gone.left)} of the doorway still reads left`);
  } finally {
    RUST.tune.leavesStay = 1;
  }
  return wrong.length ? [failed(`${line}: ${wrong.join(', ')}`), [pictured]] : [passed(line), []];
}
