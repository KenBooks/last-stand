// The game's open hand measured part by part against a man's: every size as it's sculpted, the same measure on a
// man's hand, and how far off ours is. Sizes first: a part of the wrong size can't be shaped right.
//   node tools/handref/sizes.mjs [hand.json] [--k 1] [--stature 2.04] [--root 1.1]
// `hand.json` is the open hand as `ourHand.ts --open` writes it (`npm run handref -- --open` makes it); `--k` how
// many times its sculpted size the game draws it (the warrior's `HAND_K`), `--root` the hero's own scale, `--stature`
// his height (m).
// A man's sizes: the US Army's ANSUR II (4,082 men: stature 1756 mm, hand length 193, breadth 89 at the knuckles,
// wrist girth 176) and Garrett's "The Adult Human Hand" (USAF, 1971: each finger's breadth and depth at its joints).
// A hand is `ABOUT` of a man's when within what one man differs from another by.
import { readFileSync } from 'node:fs';

/** a man's hand, mm (the median man's) */
const MAN = {
  stature: 1756,
  length: 193,
  breadth: 89,
  thickness: 30,
  wristBreadth: 60,
  wristThickness: 41,
  thumbLength: 63,
  middleLength: 104,
  // each finger's breadth at its middle joint and at its last, index first; and the thumb's at its one joint
  middleJoint: [21.3, 21.4, 19.9, 17.6],
  lastJoint: [18.3, 18.4, 17.2, 15.7],
  thumbJoint: 22.7,
  // a digit's depth (back to pad) against its breadth, at a joint
  depth: 0.88,
};
/** how far from a man's a size may be and count as his (a share): about what the 5th and 95th men are from the median */
const ABOUT = 0.1;
/** half the length of digit a section is read over, either side of its joint (m) */
const SLICE = 0.003;
const FINGERS = ['index', 'middle', 'ring', 'little'];

const sub = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => a.map((value) => value / Math.hypot(...a));

/** The command line's value after `--name`, or `fallback`. */
function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

/** The hand's vertices as points, each with the bone that moves it most. */
function pointsOf(hand) {
  const points = [];
  for (let v = 0; v < hand.bones.length; v++) {
    points.push({ at: hand.positions.slice(v * 3, v * 3 + 3), bone: hand.bones[v] });
  }
  return points;
}

/** How far `points` reach along `way`, from the least to the most. */
function reach(points, way) {
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    const along = dot(point.at, way);
    low = Math.min(low, along);
    high = Math.max(high, along);
  }
  return high - low;
}

/**
 * A digit's section at a joint: its breadth (across the hand) and depth (back to pad), from the vertices its two
 * bones there move within `SLICE` of the joint along the digit.
 */
function sectionAt(points, joint, along, bones) {
  const near = points.filter((point) => (
    bones.includes(point.bone) && Math.abs(dot(sub(point.at, joint), along)) < SLICE
  ));
  const across = unit(cross(along, [0, 0, 1]));
  const through = cross(across, along);
  return { breadth: reach(near, across), depth: reach(near, through) };
}

/** Every size of the hand, m, as sculpted. */
function sizesOf(hand) {
  const points = pointsOf(hand);
  const { fingers, thumb } = hand.digits;
  const knuckleY = fingers.reduce((sum, finger) => sum + finger[0][1], 0) / fingers.length;
  const band = (y, half, keep) => points.filter((point) => Math.abs(point.at[1] - y) < half && keep(point));
  const notThumb = (point) => point.bone < 13;
  const palmOnly = (point) => point.bone === 0;
  const tipY = Math.min(...points.filter(notThumb).map((point) => point.at[1]));
  const middle = fingers[1];
  const sizes = {
    length: -tipY,
    breadth: reach(band(knuckleY, 0.004, notThumb), [1, 0, 0]),
    thickness: reach(band(knuckleY * 0.6, 0.004, (point) => palmOnly(point) && Math.abs(point.at[0] - middle[0][0]) < 0.01),
      [0, 0, 1]),
    wristBreadth: reach(band(-0.002, 0.004, palmOnly), [1, 0, 0]),
    wristThickness: reach(band(-0.002, 0.004, palmOnly), [0, 0, 1]),
    middleLength: Math.hypot(...sub(middle[3], middle[0])),
    thumbLength: Math.hypot(...sub(thumb[3], thumb[1])),
    middleJoint: [],
    lastJoint: [],
  };
  fingers.forEach((finger, i) => {
    const first = 1 + i * 3;
    sizes.middleJoint.push(sectionAt(points, finger[1], unit(sub(finger[2], finger[0])), [first, first + 1]));
    sizes.lastJoint.push(sectionAt(points, finger[2], unit(sub(finger[3], finger[1])), [first + 1, first + 2]));
  });
  sizes.thumbJoint = sectionAt(points, thumb[2], unit(sub(thumb[3], thumb[1])), [14, 15]);
  return sizes;
}

/** A row of the table: a size of ours (mm, as drawn) beside a man's at the hero's height, and how far off. */
function row(name, ours, mans) {
  const off = ours / mans - 1;
  const verdict = Math.abs(off) <= ABOUT ? 'ok' : off > 0 ? 'TOO BIG' : 'TOO SMALL';
  const percent = `${off >= 0 ? '+' : ''}${(off * 100).toFixed(0)}%`;
  return `${name.padEnd(34)}${ours.toFixed(0).padStart(5)} mm   a man's ${mans.toFixed(0).padStart(4)} mm  ${percent.padStart(5)}  ${verdict}`;
}

function main() {
  const path = process.argv[2]?.startsWith('--') || !process.argv[2]
    ? 'tools/handref/out/ours-heavy-open.json' : process.argv[2];
  const hand = JSON.parse(readFileSync(path, 'utf8'));
  const k = Number(option('k', '1'));
  const root = Number(option('root', '1.1'));
  const stature = Number(option('stature', '2.04'));
  // (a man's sizes at the hero's height; ours as the game draws them)
  const man = (mm) => mm * (stature * 1000 / MAN.stature);
  const drawn = (m) => m * k * root * 1000;
  const sizes = sizesOf(hand);
  const rows = [
    row('hand length', drawn(sizes.length), man(MAN.length)),
    row('hand breadth at the knuckles', drawn(sizes.breadth), man(MAN.breadth)),
    row('palm thickness', drawn(sizes.thickness), man(MAN.thickness)),
    row('wrist breadth', drawn(sizes.wristBreadth), man(MAN.wristBreadth)),
    row('wrist thickness', drawn(sizes.wristThickness), man(MAN.wristThickness)),
    row('middle finger, knuckle to tip', drawn(sizes.middleLength), man(MAN.middleLength)),
    row('thumb, knuckle to tip', drawn(sizes.thumbLength), man(MAN.thumbLength)),
    ...FINGERS.map((name, i) => row(`${name} finger at its middle joint`, drawn(sizes.middleJoint[i].breadth),
      man(MAN.middleJoint[i]))),
    ...FINGERS.map((name, i) => row(`${name} finger at its last joint`, drawn(sizes.lastJoint[i].breadth),
      man(MAN.lastJoint[i]))),
    row('thumb at its joint', drawn(sizes.thumbJoint.breadth), man(MAN.thumbJoint)),
    ...FINGERS.map((name, i) => row(`${name} finger's depth, middle joint`, drawn(sizes.middleJoint[i].depth),
      man(MAN.middleJoint[i] * MAN.depth))),
    row('thumb\'s depth at its joint', drawn(sizes.thumbJoint.depth), man(MAN.thumbJoint * MAN.depth)),
  ];
  console.log(`${path}, drawn ${k} x ${root} on a hero ${stature} m tall (a man's sizes at that height)`);
  console.log(rows.join('\n'));
  // (the hand's own proportions, whatever its scale)
  const share = (a, b) => (a / b).toFixed(2);
  console.log(`its own proportions: breadth ${share(sizes.breadth, sizes.length)} of its length (a man's `
    + `${share(MAN.breadth, MAN.length)}), wrist ${share(sizes.wristBreadth, sizes.breadth)} of its breadth (`
    + `${share(MAN.wristBreadth, MAN.breadth)}), middle joint ${share(sizes.middleJoint[1].breadth, sizes.breadth)} (`
    + `${share(MAN.middleJoint[1], MAN.breadth)}), thumb ${share(sizes.thumbJoint.breadth, sizes.breadth)} (`
    + `${share(MAN.thumbJoint, MAN.breadth)})`);
}

main();
