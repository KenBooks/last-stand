// The hand's shape, sculpted as a distance field on its own joints (models/sdf.ts) and meshed by surface nets: a palm
// narrowing to the wrist, its back domed and its middle cupped, with the thumb's mound (the thenar) and the little
// finger's along its edge, a knuckle over each finger's root and a ridge of pads under them, the webs between the
// fingers, each finger a flattened, tapering tube with a pad at its tip, and the thumb rising out of its mound. One
// surface, skinned to the joints: each vertex follows the joints whose parts it lies on, blended across each joint,
// so a finger bends as skin does. (Built of a rounded box and a tube for each segment of each digit, a hand was a
// pillow with rows of sausages on it, the segments parted at every bent joint; with a ball at each joint, the fingers
// were strings of beads.) The glove is the same surface a little further out, cut off over each finger's first
// segment and round the thumb's, and the nails are plates laid on the backs of the fingertips.
import * as THREE from 'three';
import { surfaceNets, type Field } from './surfaceNets';
import { above, beyond, distanceOf, ellipsoid, fieldOf, frameIn, IDENTITY, slab, smax, tube } from './sdf';
import type { Part, Shape } from './sdf';
import { clamp } from '../../util';

/** A digit as the sculpt reads it: its joints from its root (each segment hangs down its joint's -y, the palm's side
 *  -z), each segment's length, and its half-width at its root. */
export interface DigitShape {
  j: THREE.Object3D[];
  len: number[];
  width: number;
}

export interface HandGeometries {
  /** the skin whole, as the hand is bare */
  skin: THREE.BufferGeometry;
  /** the skin a glove leaves bare, on `skin`'s own vertices: the fingertips, the thumb's and the wrist's rim */
  tips: THREE.BufferGeometry;
  glove: THREE.BufferGeometry;
  nails: THREE.BufferGeometry;
}

/** A geometry's arrays, as a worker hands them over (models/hands.worker.ts). */
interface PackedGeometry {
  attributes: Record<string, { array: Float32Array | Uint16Array; itemSize: number }>;
  index: Uint32Array | Uint16Array;
}
export interface PackedHand {
  skin: PackedGeometry;
  glove: PackedGeometry;
  nails: PackedGeometry;
  /** the bare skin's triangles alone: its vertices are the skin's */
  tips: Uint32Array | Uint16Array;
}

/** `made` as arrays a worker can hand over, and the buffers to transfer with them. */
export function packHand(made: HandGeometries): { packed: PackedHand; buffers: ArrayBuffer[] } {
  const buffers: ArrayBuffer[] = [];
  const pack = (geometry: THREE.BufferGeometry): PackedGeometry => {
    const attributes: PackedGeometry['attributes'] = {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const array = (attribute as THREE.BufferAttribute).array as Float32Array | Uint16Array;
      attributes[name] = { array, itemSize: attribute.itemSize };
      buffers.push(array.buffer as ArrayBuffer);
    }
    const index = geometry.index!.array as Uint32Array | Uint16Array;
    buffers.push(index.buffer as ArrayBuffer);
    return { attributes, index };
  };
  const tips = made.tips.index!.array as Uint32Array | Uint16Array;
  buffers.push(tips.buffer as ArrayBuffer);
  return { packed: { skin: pack(made.skin), glove: pack(made.glove), nails: pack(made.nails), tips }, buffers };
}

/** The geometries a worker handed over. */
export function unpackHand(packed: PackedHand): HandGeometries {
  const unpack = (from: PackedGeometry) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, { array, itemSize }] of Object.entries(from.attributes)) {
      geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    }
    geometry.setIndex(new THREE.BufferAttribute(from.index, 1));
    return geometry;
  };
  const skin = unpack(packed.skin);
  const tips = onVerticesOf(skin, packed.tips);
  return { skin, tips, glove: unpack(packed.glove), nails: unpack(packed.nails) };
}

/** A geometry of `index`'s triangles on `of`'s vertices. */
function onVerticesOf(of: THREE.BufferGeometry, index: Uint32Array | Uint16Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(of.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

/** the grid the surface is meshed on (m, the hand's own units: at 2.6 mm a hand was 19,000 triangles) */
const CELL = 0.0032;
/** the grid of a coarse hand (`setHandsCoarse`): a third of the triangles, 12,500 a hand to about 4,000 */
const COARSE_CELL = 0.0056;
let cell = CELL;
/**
 * The hands sculpted from now on meshed coarse, or not (Very low's: a hand was 12,500 triangles at any level, the
 * two a quarter of the hero's and an eighth of the crypt's lobby there, `lab draws --boot verylow`). A side's hand
 * is sculpted once and kept, so it's set before the first is (`preloadHands`), as the hero's detail is.
 */
export function setHandsCoarse(coarse: boolean): void { cell = coarse ? COARSE_CELL : CELL; }
/** how far a vertex's joints' say in it falls off with its distance from their parts (m), and how far a part may be
 *  and still have any */
const FALLOFF = 0.0022;
const SAY_REACH = FALLOFF * 9;
/** how far the glove stands off the skin, and its hem's extra thickness at each cut (m): a rolled edge that shows
 *  (at 0.7 mm, thinning in 2, the thumb read as pushed through a hole in the glove: from play, "glove / thumb
 *  connection is lame"; the hem at 1 mm, an adversarial review read the glove as paint on the skin) */
const GLOVE_OUT = 0.0014;
const HEM = 0.0018;
/** how far the hem thins to nothing behind each cut, and how far under the glove the skin it leaves bare goes on
 *  (m): past the hem, so no gap opens between them as the joints bend (the hem thinning over two cells of the
 *  sculpt's grid: over one, 3.5 mm, a thicker hem meshed as a ragged black line) */
const HEM_TAPER = 0.006;
const TUCK = 0.004;
/** how far the nails stand off the skin (m), and their grid: across and along */
const NAIL_OUT = 0.00055;
const NAIL_DEPTH = 0.0009;
/** where a nail's root and its free edge lie along its digit's last segment (shares of it), and its half-width (a
 *  share of the digit's): on the flat of the segment's back, ending short of the tip, longer than it is wide. The
 *  digit's rounded end takes the last 40% of the segment: from 0.47 to 0.93 the nail lay on that, a lid over the
 *  tip wider than it was long (from play, of the thumb's: "should be positioned differently") */
const NAIL_FROM = 0.26;
const NAIL_TO = 0.8;
const NAIL_HALF = 0.5;
const NAIL_ACROSS = 6;
const NAIL_ALONG = 7;
/** where the hand's surface ends up the wrist, inside the cuff, and the glove's (m over the wrist joint) */
const WRIST_TOP = 0.008;
const GLOVE_TOP = 0.006;
/** how far round a digit its cuff cuts the glove (a share of its half-width at its root: past its pad and the glove
 *  over it; at 1.9 the thumb's cut a hole in the glove by the index's root), the thumb's less (kept at the fingers'
 *  1.45 as it was made stouter, its cut swept across the glove by the index's root as it wrapped a handle, a hole
 *  there: an adversarial review), and how softly (m: a rolled hem, wider than a cell of the grid) */
const CUFF_REACH = 1.45;
const THUMB_CUFF_REACH = 1.2;
const CUFF_ROLL = 0.004;
/** how far down a finger's first segment its cuff ends: a short sleeve over its near half, as reference photographs
 *  of a fingerless glove show it (#425) */
const CUFF_ALONG = 0.62;
/** the slit between two fingers' sleeves: where it opens down each finger's first segment (a share of it: at the
 *  web) and half its width (m). Cut straight across above the web, the glove ended in one lumpy edge over the
 *  knuckles, the little finger's a step below it (from play: "wth is this shape ?"); a fingerless glove has a short
 *  sleeve on each finger, a notch between each two (2.6 mm across, under the grid's cell, its corners meshed as ragged
 *  teeth: an adversarial review) */
const SLIT_FROM = 0.3;
const SLIT_HALF = 0.003;
/** the thumb's, down its second segment: a sleeve over the near half of it, as the reference photograph's glove (cut
 *  just past its root, after generated pictures that failed a review for realism, the thumb read as pushed through a
 *  hole in the glove: from play, "glove / thumb connection is lame"; at 0.7 only its tip was out, a stub) */
const THUMB_CUFF_ALONG = 0.45;
/** how softly a digit's segments join (m: a soft join swells by a quarter of it where two surfaces meet) */
const SEGMENT_BLEND = 0.0006;
/** how much narrower a segment is at its middle than at its ends (the bone's shaft between its heads), eased in from
 *  each joint so no ring stands at either (as two straight halves pinched at the middle, a waist past 0.03 creased
 *  into bamboo rings; at 0.03 the fingers read as even tubes: from play, "fingers are not same width at different
 *  points"; at 0.08, "fingers same thickness is lame"; at 0.15 under knuckles as wide as the finger, the joints a
 *  quarter broader than the shafts, "a hand of 90 year old, with bones problems": `lab hands` holds the joints to a
 *  tenth broader; at 0.1 a flat finger still read as a string of beads, an adversarial review) */
const WAIST = 0.05;
/** the knuckle on the back of each joint of a digit, the head of the bone before it, as shares of the digit's
 *  half-width: how far out from the bone's line its middle is, and its half-width, length and height */
// (half as wide as the digit, the fingers read as even tubes: from play, "fingers same thickness is lame"; short
// and as wide as the digit, each a ball on the joint: long and low now, a swell the finger eases into, narrower
// than the finger so it rises on its back alone and the finger's sides run straight)
const KNUCKLE = { out: 0.44, across: 0.72, along: 0.6, high: 0.28 };
/** the fingers' segments' width against their half-width at their roots (the palm's knuckles kept at it): a man's
 *  fingers against his hand, from reference photographs (#425: at their full width they read as sausages). The
 *  thumb keeps its full width: slimmed with them, it read as thin as a finger, where a thumb is the stoutest digit;
 *  at 0.96 and tapering to 0.6 at the tip, under a pad wider than it, a review read the fingers as stalks with bulbs
 *  at their ends, gaps between their roots: at their full width now) */
export const DIGIT_SLIM = 1;
/** A digit's segments' share of its width (`DIGIT_SLIM`, the thumb's whole). */
export const slimOf = (thumb: boolean): number => (thumb ? 1 : DIGIT_SLIM);
/** how far along a digit each joint's blend of the two segments' bones reaches either way, a share of its half-width:
 *  at 0.82 it spread over most of a segment, and a curled finger bent as one even arc, a hose, its bones never
 *  straight between its joints (#425's adversarial review); at 0.25 it bent as a pipe's elbow, a sharp corner on
 *  the outside of each joint (the next review) */
const HINGE = 0.4;
/** how softly a knuckle joins the finger (m) */
const KNUCKLE_BLEND = 0.003;
/** the tendons on the back of the hand, one from each finger's knuckle towards the wrist: how high each stands at
 *  its knuckle (m; a third of that at its other end), its half-width, where it ends up the back (y) and how far in
 *  towards the hand's middle it has run by there (a share of its knuckle's place across). With none, three adversarial
 *  reviews read the back as "a featureless pillow", and the glove over it as paint (#425). */
const TENDON = { high: 0.0011, half: 0.0026, to: -0.03, lean: 0.45 };
/** from where on the back of the hand a ridge stands (z, m), and over how far it rises to its height */
const BACK_FROM = 0.002;
const BACK_OVER = 0.005;
/** the glove's seams, each a welt: how high and half how wide (m); how far up the back from between each two knuckles
 *  its three points run, the stitched lines on the back of a glove; its band round the wrist, how high and how far
 *  down from the glove's top; and where round the thumb's bone in the palm its sleeve is sewn in (a share of it) */
const SEAM = { high: 0.0009, half: 0.0022, points: 0.03, band: 0.0012, bandDown: 0.011, thumbAt: 0.6 };

/** how far a surface is raised at a point (m) */
type Lift = (x: number, y: number, z: number) => number;

/** `field` with its surface raised by `lift`. */
function lifted(field: Field, lift: Lift): Field {
  const raised: Field = (x, y, z) => field(x, y, z) - lift(x, y, z);
  raised.within = (x, y, z, radius) => lifted(field.within?.(x, y, z, radius) ?? field, lift);
  return raised;
}

/** How high a ridge along the line from `a` to `b` across the hand's back ([x, y]) stands at a point: `high[0]` at
 *  `a` to `high[1]` at `b`, `half` wide either side, and none on the palm's side. */
function ridge(a: number[], b: number[], half: number, high: number[], x: number, y: number, z: number): number {
  const back = clamp((z - BACK_FROM) / BACK_OVER, 0, 1);
  if (back === 0) return 0;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  const off = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) / half;
  return back * (high[0] + (high[1] - high[0]) * t) * Math.exp(-off * off);
}

/** The tendons' ridges on the back of the hand. */
function tendons(fingers: DigitShape[]): Lift {
  const lines = fingers.map((finger) => {
    const k = finger.j[0].position;
    return [[k.x * TENDON.lean, TENDON.to], [k.x, k.y + 0.004]];
  });
  const high = [TENDON.high / 3, TENDON.high];
  return (x, y, z) => {
    let most = 0;
    for (const [from, to] of lines) most = Math.max(most, ridge(from, to, TENDON.half, high, x, y, z));
    return most;
  };
}

/** The glove's seams: a point up its back from between each two fingers, a band round the wrist and a welt round the
 *  thumb's root, where its sleeve is sewn in (`digits`: the fingers, then the thumb). */
function gloveSeams(digits: DigitShape[], frames: Float64Array[][]): Lift {
  const thumb = digits[digits.length - 1];
  const e = frames[digits.length - 1][0];
  const points: number[][][] = [];
  for (let i = 0; i + 2 < digits.length; i++) {
    const a = digits[i].j[0].position;
    const b = digits[i + 1].j[0].position;
    const [mx, my] = [(a.x + b.x) / 2, (a.y + b.y) / 2 + 0.006];
    points.push([[mx * 0.75, my + SEAM.points], [mx, my]]);
  }
  const high = [SEAM.high, SEAM.high];
  return (x, y, z) => {
    let most = SEAM.band * clamp((y - GLOVE_TOP + SEAM.bandDown) / 0.003, 0, 1);
    for (const [from, to] of points) most = Math.max(most, ridge(from, to, SEAM.half, high, x, y, z));
    const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
    const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
    const near = clamp((1.9 - Math.hypot(lx, lz) / thumb.width) / 0.4, 0, 1);
    const along = (-ly - thumb.len[0] * SEAM.thumbAt) / SEAM.half;
    return Math.max(most, near * SEAM.high * Math.exp(-along * along));
  };
}

/** the thumb's root joint among the bones (the hand's own, then each finger's three) */
const THUMB_ROOT = 13;

/** The palm's parts, in the hand's own frame (`toward`: the way across to the thumb, +1 or -1 along x). */
function palmParts(fingers: DigitShape[], thumb: DigitShape, toward: number): Part[] {
  const at = (u: number, y: number, z: number) => [u * toward, y, z] as const;
  const parts: Part[] = [];
  const palm = (shape: Shape, blend: number, bones: [number, number][] = [[0, 1]]) => {
    parts.push({ shape, frame: IDENTITY, blend, bones });
  };
  // (domed across its back and rounded off at its sides: domed a third, it was a box with hard sides)
  // (as wide at the knuckles as the fingers' roots across and no deeper there than a finger, a flat fan from the
  // wrist whose back runs on into the fingers' backs: 7 mm narrower than the outer knuckles and 6 mm deeper than a
  // finger at its end, the hand swelled into a lump at the knuckle row, a shelf the fingers hung under; from play,
  // "this hand shape is not natural", "there should be no swelling")
  palm(slab(-0.004, -0.097, 0.0285, 0.044, 0.0135, 0.0102, 0.42, 0.008), 0.006);
  // the wrist, into the cuff
  palm(tube(0.0275, 0.029, -0.006, 0.014, 0.66), 0.012);
  for (const finger of fingers) {
    const k = finger.j[0].position;
    const w = finger.width;
    // its knuckle, the head of its bone in the palm, low and broad; and its pad on the palm's side, broad and flat,
    // joining its neighbours' under the fingers' roots (each a ball, they stood in a row of beads; fuller, in a
    // sausage across the palm)
    // (low under the skin: as tall as they were broad, they stood in a row of balls along the back's edge)
    // (within the finger's own width, long up the palm's back and as high as it: the head of the finger's bone in
    // the palm, carrying the back on into the finger with a valley between each two; broader than the finger and
    // joined over 12 mm, the row swelled, and short and low, a groove ran across the back above the fingers)
    palm(ellipsoid(k.x, k.y + 0.004, k.z + 0.003, w * 0.8, 0.012, w * 0.66), 0.008);
    palm(ellipsoid(k.x, k.y + 0.0015, k.z + 0.0062, w * 0.62, w * 0.62, w * 0.42), 0.004);
    palm(ellipsoid(k.x, k.y - 0.0075, k.z - 0.0055, w * 0.98, 0.0082, 0.0046), 0.006);
  }
  // the little finger's mound along the palm's edge
  palm(ellipsoid(...at(-0.0275, -0.05, -0.0055), 0.0105, 0.03, 0.0085), 0.009);
  // the thumb's mound, between the palm and its root, moving half with the thumb
  const root = thumb.j[0].position;
  palm(ellipsoid(root.x * 0.62, -0.045, root.z - 0.0035, 0.021, 0.03, 0.015), 0.011, [[0, 0.5], [THUMB_ROOT, 0.5]]);
  // the web between the thumb and the index finger, a sheet of skin moving with both (with none, the thumb stood
  // off the palm's side as a stick: three adversarial reviews)
  palm(ellipsoid(...at(0.043, -0.078, -0.003), 0.008, 0.02, 0.006), 0.01, [[0, 0.6], [THUMB_ROOT, 0.4]]);
  // (cut off flat inside the cuff: the wrist's rounded end rose 3 cm up the forearm)
  parts.push({ shape: above(WRIST_TOP), frame: IDENTITY, blend: 0.002, cut: true, bones: [] });
  // the palm's hollow
  // (off the thumb's mound towards the little finger's: over against it, the mound read as a crater)
  parts.push({ shape: ellipsoid(...at(-0.004, -0.06, -0.0248), 0.02, 0.024, 0.0095), frame: IDENTITY,
    blend: 0.006, cut: true, bones: [] });
  return parts;
}

/**
 * A segment of a digit, from `from` to `to` down its joint's -y, `r0` wide at its root and `r1` at its end: its bone's
 * shaft narrower than its heads (`WAIST`), its width easing in from each joint and out again (a sine's square along
 * it: level at the joints, narrowest at its middle). From play, the fingers as even tapering tubes: "fingers need
 * bones to look more natural" (#425). Rounded at both ends, as `tube` is.
 */
function waisted(r0: number, r1: number, from: number, to: number, depth: number): Shape[] {
  const length = to - from;
  const shaft: Shape = {
    distance: (x, y, z) => {
      const t = clamp((-y - from) / length, 0, 1);
      const along = -y - (from + t * length);
      const zs = z / depth;
      const pinch = Math.sin(Math.PI * t);
      const radius = (r0 + (r1 - r0) * t) * (1 - WAIST * pinch * pinch);
      return (Math.sqrt(x * x + zs * zs + along * along) - radius) * depth;
    },
    centre: [0, -(from + to) / 2, 0],
    radius: length / 2 + Math.max(r0, r1),
  };
  return [shaft];
}

/**
 * A segment's say in the skin: its tube cut flat at its joints (`cutFrom`, `cutTo`), so a vertex past a joint has its
 * say fall off with how far past it lies. Said by the tube whole, its rounded end reached about a half-width past the
 * joint over the next segment's skin, every vertex there followed both bones alike, and a curled finger bent as one
 * even arc, a hose (#425: "fingers need work", three adversarial reviews).
 */
function boneSay(r0: number, r1: number, from: number, to: number, depth: number, cutFrom: boolean,
  cutTo: boolean): Shape {
  const whole = tube(r0, r1, from, to, depth);
  return {
    ...whole,
    distance: (x, y, z) => {
      let distance = whole.distance(x, y, z);
      if (cutFrom) distance = Math.max(distance, from + y);
      if (cutTo) distance = Math.max(distance, -y - to);
      return distance;
    },
  };
}

/** The knuckle at the end of a segment `length` long: the head of its bone, low on the back of the joint (+z). */
function knuckle(width: number, length: number, scale: number): Shape {
  const k = KNUCKLE;
  return ellipsoid(0, -length + 0.1 * width, k.out * width,
    k.across * width * scale, k.along * width * scale, k.high * width * scale);
}

/** A digit's parts, each in its joint's frame: two halves for each segment, narrower at its middle than at its ends,
 *  a knuckle on the back of each joint, and a pad at its tip. `first` is the index of its root joint among the bones.
 */
function digitParts(digit: DigitShape, first: number, space: THREE.Object3D, thumb: boolean): Part[] {
  const w = digit.width * slimOf(thumb);
  const [l0, l1, l2] = digit.len;
  const frames = digit.j.map((joint) => frameIn(joint, space));
  const parts: Part[] = [];
  const on = (n: number, shape: Shape, blend: number, bones: [number, number][]) => {
    parts.push({ shape, frame: frames[n], blend, bones });
  };
  // (each segment starting at the width the one before it ends: a step between them, joined softly, swelled in a ring)
  const radii = thumb ? [0.98, 0.92, 0.92, 0.84, 0.84, 0.72] : [1, 0.95, 0.95, 0.86, 0.86, 0.76];
  // (the last segment nearly as deep as the middle one, a full rounded tip: at 0.66 and narrowed to 0.66 it thinned
  // to a flat bill that seemed to turn up at its end, beside reference pictures from the little finger's side)
  // (the thumb nearly round, as a thumb is: at 0.86 it was a stick seen from its side)
  const depths = thumb ? [0.92, 0.9, 0.82] : [0.84, 0.8, 0.76];
  // (the thumb's root segment is its bone in the palm, rising out of its mound)
  const rootFrom = thumb ? 0.006 : 0.002;
  // (each segment shapes alone: its say is its bone's, cut at its joints, `boneSay`)
  const shaped = (n: number, shape: Shape, blend: number, bone: number) => {
    on(n, shape, blend, [[bone, 1]]);
    parts[parts.length - 1].shapeOnly = true;
  };
  const says = (n: number, shape: Shape, bone: number) => {
    parts.push({ shape, frame: frames[n], blend: 0, sayOnly: true, bones: [[bone, 1]] });
  };
  for (const half of waisted(w * radii[0], w * radii[1], rootFrom, l0, depths[0])) {
    shaped(0, half, thumb ? 0.009 : 0.004, first);
  }
  // (its say in the skin from a little past the knuckle: from the joint itself, the back of the hand behind the
  // knuckle bent with the finger)
  says(0, boneSay(w * radii[0], w * radii[1], w * 0.45, l0, depths[0], false, true), first);
  // the joints, where the skin follows both segments half and half; they shape nothing (each a ball, the fingers
  // were strings of beads), and the segments join almost hard (joined softly, their rounded ends overlapping at each
  // joint swelled there in a ring)
  const joint = (n: number, shape: Shape, bones: [number, number][]) => {
    parts.push({ shape, frame: frames[n], blend: 0, sayOnly: true, bones });
  };
  joint(1, ellipsoid(0, 0, 0, w * radii[1], w * HINGE, w * 0.76), [[first, 0.5], [first + 1, 0.5]]);
  for (const half of waisted(w * radii[2], w * radii[3], 0, l1, depths[1])) shaped(1, half, SEGMENT_BLEND, first + 1);
  says(1, boneSay(w * radii[2], w * radii[3], 0, l1, depths[1], true, true), first + 1);
  joint(2, ellipsoid(0, 0, 0, w * radii[3], w * HINGE * 0.92, w * 0.68), [[first + 1, 0.5], [first + 2, 0.5]]);
  // (the last segment's rounded end at the digit's tip)
  const tipTo = l2 - w * radii[5] * 0.85;
  for (const half of waisted(w * radii[4], w * radii[5], 0, tipTo, depths[2])) shaped(2, half, SEGMENT_BLEND, first + 2);
  says(2, boneSay(w * radii[4], w * radii[5], 0, tipTo, depths[2], true, false), first + 2);
  // (blended in wide: joined in 4 mm, each stood on the fingertip's underside as a button)
  on(2, ellipsoid(0, -0.6 * l2, -0.14 * w, w * 0.62, 0.4 * l2, w * 0.48), 0.005, [[first + 2, 1]]);
  // the knuckles over the middle and last joints, each on the bone whose head it is, shaping alone (the skin over
  // them follows the joints as it did)
  on(0, knuckle(w, l0, 1), KNUCKLE_BLEND, [[first, 1]]);
  on(1, knuckle(w, l1, 0.85), KNUCKLE_BLEND, [[first + 1, 1]]);
  parts[parts.length - 1].shapeOnly = true;
  parts[parts.length - 2].shapeOnly = true;
  return parts;
}

/** how far out from the skin its closing in is read (m), and how much darker it is where it closes in wholly */
const SHUT_STEPS = [0.0025, 0.005, 0.008];
const SHUT_DARK = 0.7;
/** the fingertips' last segments' bones, and how much warmer (redder) the skin is over them (a little: at 1.06,
 *  0.84 and 0.8 the ranger's fingertips, on his ruddier skin, read as sunburnt) */
const TIP_BONES = new Set([3, 6, 9, 12, 15]);
const TIP_WARM: [number, number, number] = [1.04, 0.9, 0.87];

/** the wrinkled skin over the back of each finger joint: how far along the finger it reaches either side of the
 *  joint and up its side (shares of the digit's width), and its colour, a little darker and redder (multiplying the
 *  skin's: much darker, the joints read as bruised, part of "a hand of 90 year old") */
const KNUCKLE_SKIN = { along: 0.75, side: 0.35 };
const KNUCKLE_TINT: [number, number, number] = [0.92, 0.86, 0.85];

/** How much of the wrinkled skin over a finger joint's back the point is in (0 to 1): over each finger's two outer
 *  joints and the thumb's, the knuckles the glove leaves bare. Skin even all along the fingers read as plastic (#425:
 *  reference photographs show each knuckle's skin darker and creased). */
function knuckleSkinAt(digits: DigitShape[], frames: Float64Array[][], x: number, y: number, z: number): number {
  let most = 0;
  digits.forEach((digit, i) => {
    for (const n of [1, 2]) {
      const e = frames[i][n];
      const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
      const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const along = ly / (digit.width * KNUCKLE_SKIN.along);
      const back = clamp(lz / (digit.width * KNUCKLE_SKIN.side), 0, 1);
      most = Math.max(most, Math.exp(-along * along) * back);
    }
  });
  return most;
}

/** The skin's colour at each vertex (`color`, multiplying its material's): darker where the skin round it closes in,
 *  read from `field` a few millimetres out along its normal (a point outside the hand nearer to another part of it than
 *  it is out), darker and redder over the finger joints' backs (`knuckleSkinAt`), and warmer over the fingertips. */
function shadeSkin(geometry: THREE.BufferGeometry, field: Field, digits: DigitShape[], frames: Float64Array[][]):
  void {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const bones = geometry.attributes.skinIndex;
  const shares = geometry.attributes.skinWeight;
  const colour = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    let shut = 0;
    for (const step of SHUT_STEPS) {
      const x = position.getX(i) + normal.getX(i) * step;
      const y = position.getY(i) + normal.getY(i) * step;
      const z = position.getZ(i) + normal.getZ(i) * step;
      shut += clamp((step - field(x, y, z)) / step, 0, 1);
    }
    const light = 1 - SHUT_DARK * shut / SHUT_STEPS.length;
    let tip = 0;
    for (let k = 0; k < 4; k++) if (TIP_BONES.has(bones.getComponent(i, k))) tip += shares.getComponent(i, k);
    const knuckle = knuckleSkinAt(digits, frames, position.getX(i), position.getY(i), position.getZ(i));
    for (let c = 0; c < 3; c++) {
      colour[i * 3 + c] = light * (1 + (TIP_WARM[c] - 1) * tip) * (1 + (KNUCKLE_TINT[c] - 1) * knuckle);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
}

/** the hand's bones: its own, each finger's three and the thumb's three */
const BONES = 16;
const _say = new Float64Array(BONES);

/** The joints whose parts `point` lies on, the four with most say, and each one's share. */
function weightsAt(parts: Part[], x: number, y: number, z: number, out: { bones: number[]; shares: number[] }): void {
  _say.fill(0);
  for (const part of parts) {
    if (part.shapeOnly || part.cut || beyond(part, x, y, z, SAY_REACH)) continue;
    const weight = Math.exp(-Math.max(0, distanceOf(part, x, y, z)) / FALLOFF);
    for (const [bone, share] of part.bones) _say[bone] += share * weight;
  }
  const most = [..._say.keys()].filter((bone) => _say[bone] > 0).sort((a, b) => _say[b] - _say[a]).slice(0, 4);
  const total = most.reduce((sum, bone) => sum + _say[bone], 0) || 1;
  out.bones = most;
  out.shares = most.map((bone) => _say[bone] / total);
}

/** A mesh of `field` within `box` as a geometry, its vertices skinned to the joints `parts` say. */
function skinnedNet(field: Field, box: THREE.Box3, parts: Part[]): THREE.BufferGeometry {
  const net = surfaceNets(field, box, cell);
  const count = net.positions.length / 3;
  // (the bones' indices as floats, as models/shapes.ts's: Uint16 ones made ANGLE compile a vertex shader at the
  // first draw, on the GPU process's main thread)
  const bones = new Float32Array(count * 4);
  const shares = new Float32Array(count * 4);
  const found = { bones: [] as number[], shares: [] as number[] };
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [net.positions[i * 3], net.positions[i * 3 + 1], net.positions[i * 3 + 2]];
    weightsAt(parts, x, y, z, found);
    found.bones.forEach((bone, k) => {
      bones[i * 4 + k] = bone;
      shares[i * 4 + k] = found.shares[k];
    });
  }
  // (no texture places: its maps are read triplanar, models/triplanar.ts)
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(net.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(net.normals, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(shares, 4));
  geometry.setIndex(new THREE.BufferAttribute(net.index, 1));
  return geometry;
}

/** Where a glove's cuff ends over `digit` (a share of its first segment for a finger, of its second for the thumb):
 *  how far past it `point` is, or null when `point` isn't by that digit. */
function pastCuff(digit: DigitShape, frames: Float64Array[], thumb: boolean, x: number, y: number, z: number):
  number | null {
  const n = thumb ? 1 : 0;
  const e = frames[n];
  const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
  const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
  if (Math.hypot(lx, lz) > digit.width * (thumb ? THUMB_CUFF_REACH : CUFF_REACH) || ly > digit.width) return null;
  return -ly - digit.len[n] * (thumb ? THUMB_CUFF_ALONG : CUFF_ALONG);
}

/** The glove: the hand's surface a little further out, cut off at each digit's cuff and at the wrist. */
function gloveField(hand: Field, digits: DigitShape[], frames: Float64Array[][]): Field {
  const seams = gloveSeams(digits, frames);
  const glove = gloveOver(hand, digits, frames, seams);
  glove.within = (x, y, z, radius) => gloveOver(hand.within?.(x, y, z, radius) ?? hand, digits, frames, seams);
  return glove;
}

function gloveOver(hand: Field, digits: DigitShape[], frames: Float64Array[][], seams: Lift): Field {
  const cut = { past: 0, hem: 0 };
  return (x, y, z) => {
    gloveCut(digits, frames, x, y, z, cut);
    return smax(hand(x, y, z) - GLOVE_OUT - Math.max(cut.hem, seams(x, y, z)), cut.past, CUFF_ROLL);
  };
}

/** Where the glove is cut off by a point: how far past its cuffs and its top the point is (the most of them: under
 *  the glove where below 0), and the hem's thickness there. */
function gloveCut(digits: DigitShape[], frames: Float64Array[][], x: number, y: number, z: number,
  out: { past: number; hem: number }): void {
  out.past = y - GLOVE_TOP;
  out.hem = 0;
  digits.forEach((digit, i) => {
    const past = pastCuff(digit, frames[i], i === digits.length - 1, x, y, z);
    if (past === null) return;
    out.past = Math.max(out.past, past);
    out.hem = Math.max(out.hem, HEM * clamp(1 + past / HEM_TAPER, 0, 1));
  });
  for (let i = 0; i + 2 < digits.length; i++) {
    const slit = Math.min(inSlit(digits[i], digits[i + 1], frames[i][0], frames[i + 1][0], x, y, z), SLIT_HALF);
    out.past = Math.max(out.past, slit);
  }
}

const _sleeve = { off: 0, down: 0 };

/** How far off `digit`'s first bone a point is (in the digit's half-widths) and how far down past where the slits
 *  by it open (m), into `_sleeve`. */
function sleeveAt(digit: DigitShape, e: Float64Array, x: number, y: number, z: number): void {
  const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
  const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
  _sleeve.off = Math.hypot(lx, lz) / digit.width;
  _sleeve.down = -ly - digit.len[0] * SLIT_FROM;
}

/** How far inside the slit between two neighbouring fingers' sleeves a point is (m, above 0 inside it): within
 *  `SLIT_HALF` of midway between the two, below the web. */
function inSlit(a: DigitShape, b: DigitShape, ea: Float64Array, eb: Float64Array, x: number, y: number, z: number):
  number {
  sleeveAt(a, ea, x, y, z);
  const offA = _sleeve.off;
  const downA = _sleeve.down;
  sleeveAt(b, eb, x, y, z);
  if (Math.max(offA, _sleeve.off) > CUFF_REACH * 1.6) return -1;
  const between = SLIT_HALF - Math.abs(offA - _sleeve.off) * 0.5 * (a.width + b.width) * 0.5;
  return Math.min(between, downA, _sleeve.down);
}

/** `skin`'s triangles the glove leaves bare, `TUCK` under its edge, on the skin's own vertices. (The skin whole under
 *  the glove showed through it where a bent thumb pressed the two together.) */
function bareOf(skin: THREE.BufferGeometry, digits: DigitShape[], frames: Float64Array[][]): THREE.BufferGeometry {
  const position = skin.getAttribute('position');
  const cut = { past: 0, hem: 0 };
  const shown = new Uint8Array(position.count);
  for (let i = 0; i < position.count; i++) {
    gloveCut(digits, frames, position.getX(i), position.getY(i), position.getZ(i), cut);
    shown[i] = cut.past > -TUCK ? 1 : 0;
  }
  const index = skin.index!.array;
  const kept: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const corners = [index[t], index[t + 1], index[t + 2]];
    if (corners.some((corner) => shown[corner])) kept.push(...corners);
  }
  return onVerticesOf(skin, new Uint32Array(kept));
}

/** where a search for a surface steps in (m): finer than the thinnest part it may cross */
const SEARCH_STEP = 0.0004;

/** The first place `field`'s surface is met going from `from` along `down` (a unit way, the hand's frame), within
 *  `reach` (m), or null. (Bisected between the search's ends, a nail missed every fingertip: the far end lay out
 *  past the finger, on its palm's side.) */
function surfaceAlong(field: Field, from: THREE.Vector3, down: THREE.Vector3, reach: number): THREE.Vector3 | null {
  const at = (distance: number) => from.clone().addScaledVector(down, distance);
  const inside = (distance: number) => {
    const p = at(distance);
    return field(p.x, p.y, p.z) <= 0;
  };
  if (inside(0)) return null;
  let near = 0;
  while (near < reach && !inside(near + SEARCH_STEP)) near += SEARCH_STEP;
  if (near >= reach) return null;
  let far = near + SEARCH_STEP;
  for (let i = 0; i < 16; i++) {
    const mid = (near + far) / 2;
    if (inside(mid)) far = mid;
    else near = mid;
  }
  return at((near + far) / 2);
}

/** The field's normal at `point`. */
function normalAt(field: Field, point: THREE.Vector3): THREE.Vector3 {
  const h = 0.0002;
  const { x, y, z } = point;
  return new THREE.Vector3(
    field(x + h, y, z) - field(x - h, y, z),
    field(x, y + h, z) - field(x, y - h, z),
    field(x, y, z + h) - field(x, y, z - h),
  ).normalize();
}

/** A nail on the back of `digit`'s tip: a plate laid on the skin, rounded at its root, its edge a rim into the skin,
 *  moving with the tip's joint (`bone`). Its vertices, normals and triangles are added to `into`. */
function nail(field: Field, digit: DigitShape, bone: number, space: THREE.Object3D, into: NailMesh,
  thumb: boolean): void {
  const tip = digit.j[2];
  const toHand = new THREE.Matrix4().fromArray(frameIn(tip, space)).invert();
  const l2 = digit.len[2];
  const half = digit.width * slimOf(thumb) * NAIL_HALF;
  const down = new THREE.Vector3(0, 0, -1).transformDirection(toHand);
  const rows: number[][] = [];
  for (let a = 0; a <= NAIL_ALONG; a++) {
    const t = NAIL_FROM + (NAIL_TO - NAIL_FROM) * (a / NAIL_ALONG);
    // (rounded at its root, as a nail's moon is)
    const across = half * Math.sqrt(clamp((t - NAIL_FROM) / 0.1, 0.15, 1));
    const row: number[] = [];
    for (let c = 0; c <= NAIL_ACROSS; c++) {
      const local = new THREE.Vector3(across * (2 * c / NAIL_ACROSS - 1), -t * l2, digit.width * 2);
      const from = local.applyMatrix4(toHand);
      const on = surfaceAlong(field, from, down, digit.width * 3);
      if (!on) throw new Error('handShape: a nail found no fingertip under it');
      const normal = normalAt(field, on);
      row.push(into.add(on.addScaledVector(normal, NAIL_OUT), normal, bone));
    }
    rows.push(row);
  }
  for (let a = 0; a < NAIL_ALONG; a++) for (let c = 0; c < NAIL_ACROSS; c++) {
    into.quad(rows[a][c], rows[a + 1][c], rows[a + 1][c + 1], rows[a][c + 1]);
  }
  // its rim, from the plate's edge down into the skin
  const edge = [
    ...rows[0],
    ...rows.slice(1).map((row) => row[NAIL_ACROSS]),
    ...[...rows[NAIL_ALONG]].reverse().slice(1),
    ...rows.slice(1, -1).reverse().map((row) => row[0]),
  ];
  const sunk = edge.map((vertex) => into.sunk(vertex, NAIL_OUT + NAIL_DEPTH, bone));
  for (let i = 0; i < edge.length; i++) {
    const next = (i + 1) % edge.length;
    into.quad(edge[i], edge[next], sunk[next], sunk[i]);
  }
}

/** The nails' mesh as it's made. */
class NailMesh {
  positions: number[] = [];
  normals: number[] = [];
  bones: number[] = [];
  index: number[] = [];

  add(at: THREE.Vector3, normal: THREE.Vector3, bone: number): number {
    this.positions.push(at.x, at.y, at.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.bones.push(bone);
    return this.positions.length / 3 - 1;
  }

  /** a copy of `vertex` moved `depth` in along its normal */
  sunk(vertex: number, depth: number, bone: number): number {
    const at = new THREE.Vector3().fromArray(this.positions, vertex * 3);
    const normal = new THREE.Vector3().fromArray(this.normals, vertex * 3);
    return this.add(at.addScaledVector(normal, -depth), normal, bone);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.index.push(a, b, c, a, c, d);
  }

  geometry(): THREE.BufferGeometry {
    const count = this.positions.length / 3;
    // (the bones' indices as floats, as `skinnedNet`'s)
    const bones = new Float32Array(count * 4);
    const shares = new Float32Array(count * 4);
    this.bones.forEach((bone, i) => {
      bones[i * 4] = bone;
      shares[i * 4] = 1;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(shares, 4));
    geometry.setIndex(this.index);
    return geometry;
  }
}

/** The box the hand's field is meshed within: every joint's place, with room round it. */
function boxOf(digits: DigitShape[], space: THREE.Object3D): THREE.Box3 {
  const box = palmBox();
  for (const digit of digits) {
    box.expandByPoint(pointOn(digit, 2, -digit.len[2], space));
    for (let n = 0; n < digit.j.length; n++) box.expandByPoint(pointOn(digit, n, 0, space));
  }
  return box.expandByScalar(0.016);
}

/** The box the glove is meshed within: the palm and each digit up to its cuff (half the hand's box: meshed in the
 *  hand's, the glove took a third of the sculpt's time). */
function gloveBox(digits: DigitShape[], space: THREE.Object3D): THREE.Box3 {
  const box = palmBox();
  digits.forEach((digit, i) => {
    const n = i === digits.length - 1 ? 1 : 0;
    box.expandByPoint(pointOn(digit, n, -digit.len[n] * 0.6, space));
    for (let m = 0; m <= n; m++) box.expandByPoint(pointOn(digit, m, 0, space));
  });
  return box.expandByScalar(0.016);
}

/** the palm's box, the hand's own frame (m) */
const palmBox = () => new THREE.Box3(new THREE.Vector3(-0.05, -0.12, -0.03), new THREE.Vector3(0.05, 0.02, 0.03));

/** The point `along` its joint's y on `digit`'s joint `n` (0 its root), in the hand's frame. */
function pointOn(digit: DigitShape, n: number, along: number, space: THREE.Object3D): THREE.Vector3 {
  const toHand = new THREE.Matrix4().fromArray(frameIn(digit.j[n], space)).invert();
  return new THREE.Vector3(0, along, 0).applyMatrix4(toHand);
}

/**
 * The hand's skin, its glove and its nails, sculpted on its joints as they stand now (in the frame of `space`, the
 * hand's own): `fingers` index to little, then `thumb`; their joints are bones 1 on, in that order (0 is the hand's).
 * `toward` is the way across the hand to its thumb (+1 or -1 along x).
 */
export function sculptHand(space: THREE.Object3D, fingers: DigitShape[], thumb: DigitShape, toward: number):
  HandGeometries {
  const digits = [...fingers, thumb];
  const parts = [
    ...palmParts(fingers, thumb, toward),
    ...digits.flatMap((digit, i) => digitParts(digit, 1 + i * 3, space, i === fingers.length)),
  ];
  const hand = lifted(fieldOf(parts), tendons(fingers));
  const box = boxOf(digits, space);
  const frames = digits.map((digit) => digit.j.map((joint) => frameIn(joint, space)));
  const nails = new NailMesh();
  digits.forEach((digit, i) => nail(hand, digit, 3 + i * 3, space, nails, i === fingers.length));
  const skin = skinnedNet(hand, box, parts);
  shadeSkin(skin, hand, digits, frames);
  return {
    skin,
    tips: bareOf(skin, digits, frames),
    glove: skinnedNet(gloveField(hand, digits, frames), gloveBox(digits, space), parts),
    nails: nails.geometry(),
  };
}
