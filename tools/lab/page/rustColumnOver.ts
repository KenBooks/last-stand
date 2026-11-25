// A column that stands between the camera and him, from above: a ghost from its foot to its top, all of it alike.
// From play, in the owner's own game (lab join), stood in the hall by its door: its shaft cut through its middle by
// the hole round him and its capital left in the air, "just odd geometry... we should not make player wondering
// what the geometry was before thinning"; asked how such a column should look, "Whole column ghosted".
//
// Read up the column's own axis: at each height, how much of the column is left over what's behind it, from the
// frame as played, the frame with nothing thinned and the frame with the columns hidden.

import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { type Checked, failed, passed } from './rustPixels';
import { type Shot, settledAt, shotAfter, show, showHouses } from './rustHouseRule';
import { RUST } from '../../../src/engine';
import { G } from '../../../src/state';
import { PORTICO_COLUMNS } from '../../../src/world/village';

/** the name `lab houserule --only` runs this by */
export const COLUMN_VIEW_NAME = 'a column over him, as played';
/** where he stands in the hall with a column of its portico between the camera and him, as played */
const COLUMN_VIEW = { name: COLUMN_VIEW_NAME, at: [-3.5, -15.5] as [number, number], turned: -35, zoom: 0.6 };
/** how far over the column's foot the reading starts (its foot stands whole, by design) and under its top its
 *  shaft's ends, clear of the capital's front face before it (m) */
const FROM_FOOT = 1.0;
const UNDER_TOP = 1.0;
/** how far from the column's axis its capital is read, on its top face (m) */
const CAPITAL_OUT = 0.36;
/** the heights read up the column */
const HEIGHTS = 10;
/** half the side of the square of pixels read at each height */
const SQUARE = 3;
/** the least the column's colour is apart from what's behind it for a height to be read (levels, summed) */
const APART_LEAST = 30;
/** the most of the column left at any height for it to be a ghost, and the most its heights may differ by */
export const COLUMN_GHOST = { left: 0.55, differ: 0.25 };
/** the least the canary's heights must differ by: its shaft gone at his height, its capital whole */
const CANARY_DIFFER = 0.5;

/** The portico's column nearest the line on the floor from the camera to him, between the two. */
function columnOver(): THREE.Box3 {
  const eye = new THREE.Vector2(G.camera.position.x, G.camera.position.z);
  const him = new THREE.Vector2(G.player.pos.x, G.player.pos.z);
  const to = him.clone().sub(eye);
  let nearest: THREE.Box3 | null = null;
  let least = Infinity;
  for (const column of PORTICO_COLUMNS) {
    const middle = column.getCenter(new THREE.Vector3());
    const from = new THREE.Vector2(middle.x, middle.z).sub(eye);
    const along = from.dot(to) / to.lengthSq();
    if (along <= 0 || along >= 1) continue;
    const aside = Math.abs(from.cross(to)) / to.length();
    if (aside < least) {
      least = aside;
      nearest = column;
    }
  }
  if (!nearest) throw new Error('no column of the portico stands between the camera and him');
  return nearest;
}

/** The mean colour of the square of `shot` round a place on the screen (-1 to 1 each way). */
function colourAt(shot: Shot, place: THREE.Vector3): [number, number, number] {
  const { width, height, data } = shot.pixels;
  const x = Math.round((place.x * 0.5 + 0.5) * width);
  const y = Math.round((-place.y * 0.5 + 0.5) * height);
  const sum: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (let row = Math.max(0, y - SQUARE); row <= Math.min(height - 1, y + SQUARE); row++) {
    for (let column = Math.max(0, x - SQUARE); column <= Math.min(width - 1, x + SQUARE); column++) {
      const at = (row * width + column) * 4;
      for (let channel = 0; channel < 3; channel++) sum[channel] += data[at + channel];
      count++;
    }
  }
  if (count === 0) throw new Error('the column over him is out of the frame');
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

/** How much of the column is left at a place of it, 0 to 1: null where its colour doesn't tell it from what's
 *  behind it. */
function leftAt(at: THREE.Vector3, played: Shot, whole: Shot, bare: Shot): number | null {
  const place = at.clone().project(G.camera);
  const [asPlayed, asWhole, asBare] = [played, whole, bare].map((shot) => colourAt(shot, place));
  let apart = 0;
  let along = 0;
  let span = 0;
  for (let channel = 0; channel < 3; channel++) {
    const cover = asWhole[channel] - asBare[channel];
    apart += Math.abs(cover);
    along += (asPlayed[channel] - asBare[channel]) * cover;
    span += cover * cover;
  }
  return apart >= APART_LEAST ? Math.min(1, Math.max(0, along / span)) : null;
}

/** How much of the column is left up its shaft's axis, and last on its capital, 0 to 1 each (a place its colour
 *  doesn't tell from what's behind it left out). */
function leftUp(column: THREE.Box3, played: Shot, whole: Shot, bare: Shot): number[] {
  const middle = column.getCenter(new THREE.Vector3());
  const places: THREE.Vector3[] = [];
  const from = column.min.y + FROM_FOOT;
  for (let step = 0; step < HEIGHTS; step++) {
    const y = from + ((column.max.y - UNDER_TOP - from) * step) / (HEIGHTS - 1);
    places.push(new THREE.Vector3(middle.x, y, middle.z));
  }
  // (its capital on its top face's far side from the camera: through its middle the shaft's ghost shows under it)
  const away = new THREE.Vector2(middle.x - G.camera.position.x, middle.z - G.camera.position.z).normalize();
  places.push(new THREE.Vector3(middle.x + away.x * CAPITAL_OUT, column.max.y, middle.z + away.y * CAPITAL_OUT));
  const lefts = places.map((place) => leftAt(place, played, whole, bare));
  return lefts.filter((left): left is number => left !== null);
}

/** The column over him read as the game stands: how much of it is left at each height up it. */
async function readColumn(lab: Lab): Promise<[number[], Pictured]> {
  const settled = await settledAt(lab, COLUMN_VIEW);
  try {
    // (lit as played: in the plain colours the houses are read by, a column is the paving's own grey)
    RUST.tune.debug = 0;
    const column = columnOver();
    // (the houses' own parts out of all three frames: with nothing thinned the hall's roof is whole over him)
    showHouses(false);
    const played = await shotAfter(lab, `${COLUMN_VIEW.name}: as played`);
    RUST.tune.housesWhole = 1;
    const whole = await shotAfter(lab, `${COLUMN_VIEW.name}: nothing thinned`);
    RUST.tune.housesWhole = 0;
    show(['hallColumn'], false, false);
    const bare = await shotAfter(lab, `${COLUMN_VIEW.name}: the columns hidden`);
    return [leftUp(column, played, whole, bare), played.pictured];
  } finally {
    show(['hallColumn'], true, false);
    showHouses(true);
    RUST.tune.housesWhole = 0;
    await settled.done();
  }
}

const percents = (lefts: number[]): string => lefts.map((left) => Math.round(left * 100)).join(' ');

/** The column over him held to a ghost all the way up (pictured as played where it isn't), and its canary: by its hole round him (`rust.columnsWhole`
 *  0), its shaft gone at his height and its capital whole, which must read as heights that differ. */
export async function columnOverHim(lab: Lab): Promise<[Checked, Pictured[]]> {
  const [lefts, pictured] = await readColumn(lab);
  const line = `${COLUMN_VIEW.name}: up the column, % of it left: ${percents(lefts)}`;
  if (lefts.length < HEIGHTS / 2) {
    return [failed(`${line}: only ${lefts.length} of its ${HEIGHTS} heights could be read`), [pictured]];
  }
  const wrong: string[] = [];
  const differ = Math.max(...lefts) - Math.min(...lefts);
  if (Math.max(...lefts) > COLUMN_GHOST.left) wrong.push('part of it stands whole over him');
  if (differ > COLUMN_GHOST.differ) wrong.push('it is not alike from foot to top');
  RUST.tune.columnsWhole = 0;
  try {
    const [holed] = await readColumn(lab);
    const holedDiffer = holed.length ? Math.max(...holed) - Math.min(...holed) : 0;
    if (holedDiffer < CANARY_DIFFER) wrong.push(`canary: by its hole round him its heights read alike (${percents(holed)})`);
  } finally {
    RUST.tune.columnsWhole = 1;
  }
  return wrong.length ? [failed(`${line}: ${wrong.join(', ')}`), [pictured]] : [passed(line), []];
}
