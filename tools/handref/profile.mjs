// A fist's proportions level by level against the reference's: at each height from the wrist down to the fingers'
// row, how wide it is across and how deep from its back to its front, as shares of its own breadth at the knuckles.
// The outlines' overlap says the two differ; this says where one is too thick or too wide, whatever its scale.
//   node tools/handref/profile.mjs <reference.json> <hand.json>
// The hand is laid over the reference first (`fitted`), so both are cut at the same levels.
import { drawnSmall, fitted, readHand } from './studio.mjs';

/** the levels read, in knuckle breadths from the knuckles: on towards the fingers' row (+) and back to the wrist (-) */
const LEVELS = [0.35, 0.25, 0.15, 0, -0.15, -0.3, -0.45, -0.6, -0.75];
/** half the height of the slab a level is read over (breadths) */
const SLAB = 0.04;
/** how far apart a share may be from the reference's and count as its (a share of the reference's) */
const ABOUT = 0.1;

const sub = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Every vertex of a hand in its own frame: across, up and back, in knuckle breadths from its knuckles. */
function inFrame(hand) {
  const points = [];
  for (let v = 0; v < hand.positions.length; v += 3) {
    const offset = sub(hand.positions.slice(v, v + 3), hand.knuckles);
    points.push(hand.axes.map((axis) => dot(offset, axis) / hand.breadth));
  }
  return points;
}

/** A hand's width across and depth back to front at each level, and its reach each way at it. */
function profileOf(hand) {
  const points = inFrame(hand);
  return LEVELS.map((level) => {
    const slab = points.filter((point) => Math.abs(point[1] - level) < SLAB);
    const reach = (axis) => {
      const along = slab.map((point) => point[axis]);
      return along.length ? [Math.min(...along), Math.max(...along)] : [0, 0];
    };
    const [left, right] = reach(0);
    const [front, back] = reach(2);
    return { level, across: right - left, deep: back - front, back, front: -front };
  });
}

/** A share of ours beside the reference's, marked where it's off. */
function beside(ours, reference) {
  const off = reference > 0 ? ours / reference - 1 : 0;
  const mark = Math.abs(off) <= ABOUT ? '   ' : off > 0 ? ' + ' : ' - ';
  return `${ours.toFixed(2)} / ${reference.toFixed(2)}${mark}`;
}

function main() {
  const reference = readHand(process.argv[2]);
  const hand = fitted(drawnSmall(reference), readHand(process.argv[3])).hand;
  // (each in units of its own width at the knuckles, so the two compare whatever the fit made of their sizes)
  const [theirs, ours] = [profileOf(reference), profileOf(hand)];
  const unitOf = (profile) => profile.find((row) => row.level === 0).across;
  const [theirUnit, ourUnit] = [unitOf(theirs), unitOf(ours)];
  console.log('level     across (ours / the reference\'s)   deep                back of it          front of it');
  theirs.forEach((row, i) => {
    const mine = ours[i];
    const cells = ['across', 'deep', 'back', 'front'].map((field) => (
      beside(mine[field] / ourUnit, row[field] / theirUnit).padEnd(20)
    ));
    console.log(`${row.level.toFixed(2).padStart(5)}     ${cells.join('')}`);
  });
  console.log('(shares of each fist\'s own width at the knuckles; + ours is larger, - smaller, by over a tenth)');
}

main();
