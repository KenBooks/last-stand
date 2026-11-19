// The hand reference's studio: hands drawn from the same six cameras without a browser, in well under a second, and
// how far each is from the reference by its outline in each view.
//   node tools/handref/studio.mjs <reference.json> <hand.json>... [--out sheet.png] [--size 240] [--as-marked]
// Each hand is a file as `ourHand.ts` writes one (`handref.py --json` writes the reference's). Every hand is drawn in
// its own frame (across from the index knuckle to the little finger's, up from the wrist to the middle knuckle, out of
// its back), centred on its knuckles and sized by their breadth, and cut a breadth below them, so its forearm and the
// way it was built leave the comparison alone. A row of outlines under each hand: grey both, red the reference's
// alone, blue its own alone.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { png } from '../lab/node/png.mjs';

/** where each camera stands from the hand, in its frame (across, up, back), and the camera's up: the forearm at the
 *  top, as the reference photographs hold the fist (`.tmp/refs/fiststudio`) */
export const VIEWS = {
  back: { stand: [0, 0, 1], up: [0, -1, 0] },
  palm: { stand: [0, 0, -1], up: [0, -1, 0] },
  'thumb side': { stand: [-1, 0, 0], up: [0, -1, 0] },
  'little side': { stand: [1, 0, 0], up: [0, -1, 0] },
  knuckles: { stand: [0, 1, 0], up: [0, 0, 1], down: 0.5 },
  quarter: { stand: [-0.6, -0.35, 0.72], up: [0, -1, 0] },
};
/** the picture's width in knuckle breadths */
const FIELD = 2.0;
/** the knuckles' place in the picture, down from its top as a share of its height */
const KNUCKLES_DOWN = 0.65;
/** how far below the knuckles a hand is kept, in knuckle breadths: the palm's length to the wrist's crease */
const KEPT_BELOW = 1.0;
const SKIN = [224, 172, 150];
const BACKDROP = [115, 115, 115];
const LABEL_HEIGHT = 0;

const add = (a, b) => a.map((value, i) => value + b[i]);
const sub = (a, b) => a.map((value, i) => value - b[i]);
const scale = (a, k) => a.map((value) => value * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => scale(a, 1 / Math.hypot(...a));

/**
 * A hand read from its file, with its frame: `axes` (across, up, back), `knuckles` (their middle) and `breadth`
 * (index knuckle to little finger's).
 */
export function readHand(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const { wrist, index, middle, little } = data.joints;
  const across = sub(little, index);
  const up = unit(sub(middle, wrist));
  const back = unit(cross(across, up));
  const axes = [cross(up, back), up, back];
  const knuckles = scale(add(add(index, middle), little), 1 / 3);
  return { name: path, positions: data.positions, index: data.index, axes, knuckles, breadth: Math.hypot(...across) };
}

/** The camera's axes (right, up, towards it) for a view, in the hand's space. */
export function cameraOf(hand, view) {
  const inHand = (v) => add(add(scale(hand.axes[0], v[0]), scale(hand.axes[1], v[1])), scale(hand.axes[2], v[2]));
  const toward = unit(inHand(VIEWS[view].stand));
  const right = unit(cross(inHand(VIEWS[view].up), toward));
  return [right, cross(toward, right), toward];
}

/**
 * The hand seen orthographically from `view`: per pixel its nearness (-Infinity where empty) and its light (soft,
 * from the camera), the hand cut `KEPT_BELOW` breadths under its knuckles.
 */
export function draw(hand, view, size) {
  const camera = cameraOf(hand, view);
  const pixels = size / (FIELD * hand.breadth);
  const count = hand.positions.length / 3;
  const screen = new Float64Array(count * 3);
  const height = new Float64Array(count);
  for (let v = 0; v < count; v++) {
    const offset = sub(hand.positions.slice(v * 3, v * 3 + 3), hand.knuckles);
    screen[v * 3] = dot(offset, camera[0]) * pixels + size / 2;
    screen[v * 3 + 1] = size * (VIEWS[view].down ?? KNUCKLES_DOWN) - dot(offset, camera[1]) * pixels;
    screen[v * 3 + 2] = dot(offset, camera[2]) * pixels;
    height[v] = dot(offset, hand.axes[1]) / hand.breadth + KEPT_BELOW;
  }
  const near = new Float64Array(size * size).fill(-Infinity);
  const light = new Float64Array(size * size);
  for (let t = 0; t < hand.index.length; t += 3) {
    fillTriangle(screen, height, hand.index.slice(t, t + 3), size, near, light);
  }
  return { near, light, size };
}

/** One triangle into the buffers: its pixels nearer than what's there, above the cut. */
function fillTriangle(screen, height, corners, size, near, light) {
  const [a, b, c] = corners;
  const xs = [screen[a * 3], screen[b * 3], screen[c * 3]];
  const ys = [screen[a * 3 + 1], screen[b * 3 + 1], screen[c * 3 + 1]];
  const zs = [screen[a * 3 + 2], screen[b * 3 + 2], screen[c * 3 + 2]];
  const hs = [height[a], height[b], height[c]];
  if (Math.max(...hs) < 0) return;
  const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
  if (area === 0) return;
  const edgeA = sub([xs[1], ys[1], zs[1]], [xs[0], ys[0], zs[0]]);
  const edgeB = sub([xs[2], ys[2], zs[2]], [xs[0], ys[0], zs[0]]);
  const normal = cross(edgeA, edgeB);
  const facing = Math.abs(normal[2]) / (Math.hypot(...normal) || 1);
  const shade = 0.25 + 0.75 * facing;
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const right = Math.min(size - 1, Math.ceil(Math.max(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(size - 1, Math.ceil(Math.max(...ys)));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w1 = ((px - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (py - ys[0])) / area;
      const w2 = ((xs[1] - xs[0]) * (py - ys[0]) - (px - xs[0]) * (ys[1] - ys[0])) / area;
      const w0 = 1 - w1 - w2;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      if (w0 * hs[0] + w1 * hs[1] + w2 * hs[2] < 0) continue;
      const z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2];
      const at = y * size + x;
      if (z <= near[at]) continue;
      near[at] = z;
      light[at] = shade;
    }
  }
}

/**
 * The place on the hand's surface drawn at a pixel of its drawing from `view` (the hand's own space), or null where
 * the picture is empty there: how a landmark seen in a picture is marked on a scan.
 */
export function pointAt(hand, view, drawing, x, y) {
  const near = drawing.near[Math.floor(y) * drawing.size + Math.floor(x)];
  if (!(near > -Infinity)) return null;
  const camera = cameraOf(hand, view);
  const pixels = drawing.size / (FIELD * hand.breadth);
  const across = (x - drawing.size / 2) / pixels;
  const up = (drawing.size * (VIEWS[view].down ?? KNUCKLES_DOWN) - y) / pixels;
  const offset = add(add(scale(camera[0], across), scale(camera[1], up)), scale(camera[2], near / pixels));
  return add(hand.knuckles, offset);
}

/** How much two drawings' outlines agree: their shared pixels over the pixels of either (1 the same outline). */
export function overlap(one, other) {
  let both = 0;
  let either = 0;
  for (let at = 0; at < one.near.length; at++) {
    const inOne = one.near[at] > -Infinity;
    const inOther = other.near[at] > -Infinity;
    if (inOne && inOther) both++;
    if (inOne || inOther) either++;
  }
  return either ? both / either : 1;
}

/**
 * How far apart two drawings' surfaces are where both are drawn, as a share of the knuckles' breadth (root mean
 * square, the two set level by their median gap first): what the outlines can't say, as a block and a fist of one
 * outline differ by it (fingers standing proud of the knuckles, a thumb laid somewhere else).
 */
export function relief(one, other) {
  const gaps = [];
  for (let at = 0; at < one.near.length; at++) {
    if (one.near[at] > -Infinity && other.near[at] > -Infinity) gaps.push(one.near[at] - other.near[at]);
  }
  if (!gaps.length) return 1;
  const sorted = gaps.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const meanSquare = gaps.reduce((sum, gap) => sum + (gap - median) ** 2, 0) / gaps.length;
  return Math.sqrt(meanSquare) * FIELD / one.size;
}

/** the size a fit's pictures are drawn at (px): small, as a fit draws the hand some hundreds of times */
const FIT_SIZE = 96;
/** a fit's first steps, halved `FIT_ROUNDS` times: the hand's size (a share), its place (breadths), its turn (rad) */
const FIT_STEPS = { size: 0.08, place: 0.08, turn: 0.1 };
const FIT_ROUNDS = 5;

/** `v` turned about `axis` (a unit) by `angle`. */
function turned(v, axis, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(add(scale(v, cos), scale(cross(axis, v), sin)), scale(axis, dot(axis, v) * (1 - cos)));
}

/** `hand` as a fit's seven numbers place it: sized, moved along its own axes and turned about each of them. */
function placed(hand, [size, across, up, back, pitch, yaw, roll]) {
  let axes = hand.axes;
  [pitch, yaw, roll].forEach((angle, i) => {
    const about = axes[i];
    axes = axes.map((axis) => turned(axis, about, angle));
  });
  const moved = add(add(scale(hand.axes[0], across), scale(hand.axes[1], up)), scale(hand.axes[2], back));
  return { ...hand, axes, knuckles: sub(hand.knuckles, scale(moved, hand.breadth)), breadth: hand.breadth / size };
}

/** The mean of a hand's outline overlaps with the reference's, over every view. */
function meanOverlap(reference, hand, size) {
  const scores = Object.keys(VIEWS).map((view, v) => overlap(reference[v], draw(hand, view, size)));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/**
 * `hand` sized, moved and turned to where its outlines lie best over the reference's in every view at once, so the
 * score says how the two shapes differ and not how each one's joints were marked (a scan's are marked by eye on its
 * skin, the game's are its rig's own: sized by those alone, the game's fist drew 15% smaller than a cast's). Each
 * number in turn is stepped while the overlap gains, the steps halved each round.
 */
export function fitted(reference, hand) {
  const small = Object.keys(VIEWS).map((view) => draw(reference, view, FIT_SIZE));
  const at = [1, 0, 0, 0, 0, 0, 0];
  const steps = [FIT_STEPS.size, ...Array(3).fill(FIT_STEPS.place), ...Array(3).fill(FIT_STEPS.turn)];
  let best = meanOverlap(small, placed(hand, at), FIT_SIZE);
  for (let round = 0; round < FIT_ROUNDS; round++) {
    for (let n = 0; n < at.length; n++) {
      for (const way of [1, -1]) {
        for (;;) {
          const tried = at.slice();
          tried[n] += way * steps[n];
          const score = meanOverlap(small, placed(hand, tried), FIT_SIZE);
          if (score <= best) break;
          best = score;
          at[n] = tried[n];
        }
      }
    }
    steps.forEach((step, n) => { steps[n] = step / 2; });
  }
  return { hand: placed(hand, at), at };
}

/** A drawing's pixels as RGB bytes: the hand lit, on grey. */
export function shaded(drawing) {
  const rgb = Buffer.alloc(drawing.size * drawing.size * 3);
  for (let at = 0; at < drawing.near.length; at++) {
    const lit = drawing.near[at] > -Infinity;
    const colour = lit ? SKIN.map((part) => part * drawing.light[at]) : BACKDROP;
    rgb.set(colour.map(Math.round), at * 3);
  }
  return rgb;
}

/** Two drawings' outlines over each other: grey where both, red the reference's alone, blue the hand's alone. */
function outlines(reference, drawing) {
  const rgb = Buffer.alloc(drawing.size * drawing.size * 3);
  for (let at = 0; at < drawing.near.length; at++) {
    const inReference = reference.near[at] > -Infinity;
    const inHand = drawing.near[at] > -Infinity;
    let colour = [30, 30, 30];
    if (inReference && inHand) colour = [170, 170, 170];
    else if (inReference) colour = [220, 60, 50];
    else if (inHand) colour = [60, 110, 230];
    rgb.set(colour, at * 3);
  }
  return rgb;
}

/** Tiles (RGB bytes, `size` square) laid out in rows into one picture's bytes. */
export function tiled(rows, size) {
  const columns = Math.max(...rows.map((row) => row.length));
  const width = columns * size;
  const height = rows.length * (size + LABEL_HEIGHT);
  const rgb = Buffer.alloc(width * height * 3, 20);
  rows.forEach((row, r) => {
    row.forEach((tile, c) => {
      for (let y = 0; y < size; y++) {
        const from = y * size * 3;
        const to = ((r * (size + LABEL_HEIGHT) + y) * width + c * size) * 3;
        tile.copy(rgb, to, from, from + size * 3);
      }
    });
  });
  return { rgb, width, height };
}

/** The command line's value after `--name`, or `fallback`. */
function option(args, name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
}

/** The files named on the command line, options and their values left out. */
function filesOf(args) {
  return args.filter((arg, i) => !arg.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
}

function main() {
  const args = process.argv.slice(2);
  const size = Number(option(args, 'size', '240'));
  const out = option(args, 'out', 'tools/handref/out/studio.png');
  const [reference, ...hands] = filesOf(args).map(readHand);
  const views = Object.keys(VIEWS);
  const referenceDrawn = views.map((view) => draw(reference, view, size));
  const rows = [referenceDrawn.map(shaded)];
  console.log(`views: ${views.join(', ')}`);
  for (const read of hands) {
    const fit = args.includes('--as-marked') ? { hand: read, at: null } : fitted(reference, read);
    const hand = fit.hand;
    if (fit.at) console.log(`${hand.name}: laid over the reference at ${fit.at.map((n) => n.toFixed(3)).join(' ')}`);
    const drawn = views.map((view) => draw(hand, view, size));
    const scores = drawn.map((drawing, v) => overlap(referenceDrawn[v], drawing));
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    console.log(`${hand.name}: outline overlap ${scores.map((s) => s.toFixed(2)).join(' ')}  mean ${mean.toFixed(3)}`);
    const reliefs = drawn.map((drawing, v) => relief(referenceDrawn[v], drawing));
    const meanRelief = reliefs.reduce((sum, each) => sum + each, 0) / reliefs.length;
    const shares = reliefs.map((each) => (each * 100).toFixed(1)).join(' ');
    console.log(`${hand.name}: surfaces apart, % of breadth ${shares}  mean ${(meanRelief * 100).toFixed(2)}`);
    rows.push(drawn.map(shaded));
    rows.push(drawn.map((drawing, v) => outlines(referenceDrawn[v], drawing)));
  }
  const picture = tiled(rows, size);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png(picture.rgb, picture.width, picture.height));
  console.log(out);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
