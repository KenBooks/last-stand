// tools/lab hood: the hood's opening round the face, from the front and his left, ours beside the reference's. Laid
// close round the head to the reference's sizes and outline, the hood still failed review: "a deep tunnel from the
// side ... the opening is too tight and the wrong shape", its rim hugging the face where the reference's stands off
// it, and neither its sizes nor its outline read it so. Read here:
// - where its rim runs at each height (`E` from the eyes): from the front how far out either side, from his left how
//   far ahead of the eyes; ours from its cloth's edge, the reference's from its piping (each row scanned in from the
//   backdrop to the first run of the piping's pale gold; from his left, over the hood's cloth past the seam's);
// - how much of the face it shows from each (E², from over the brow down to the chin): ours drawn flat, its skin
//   white and all else black; the reference's by its skin's colour, inside its rim (its piping is skin-coloured);
// - from his left, how far the face shows ahead of the rim at each height, held to the reference's: the rim frames
//   the face it shows. (The reference's brow, nose and chin stand further ahead of its eyes than ours: laid where its
//   rim runs from the eyes, ours stood out over the brow, "do you see hood overhang in our case?")
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { frameRect } from '../../../src/core/renderer';

export type OpeningView = 'front' | 'left';

/** Where the face is in a picture (px, down from its top) and its unit `E` (px). */
export interface FaceMarks {
  eyes: THREE.Vector2;
  unit: number;
}

/** A picture read back as covered or not, pixel by pixel. */
export interface Mask {
  covered: (x: number, y: number) => boolean;
  width: number;
  height: number;
}

/** Whether a reference's pixel is its figure (not its backdrop). */
export type Figure = (x: number, y: number) => boolean;

/** The opening from one side: where the rim crosses each of `RIM_LEVELS` (`E` from the eyes, + to the picture's
 *  right: from the front its left and right edges, from his left the near edge alone; null where it wasn't found),
 *  where the face it shows reaches there (from the front its left and right edges, from his left its front), and how
 *  much of the face it shows (E²). */
export interface Opening {
  rims: (number[] | null)[];
  faces: (number[] | null)[];
  face: number;
}

/** the heights the rim is read at (`E` over the eyes), and those it's held to the reference's at from each side
 *  (above, the arch closes over the brow; from the front, down past the chin to the throat, where the reference's
 *  closes in onto the collar: ours stood open below the chin, a funnel half as wide again; from his left, to the jaw,
 *  below which the face shown ahead of it is the chin's and the neck's) */
export const RIM_LEVELS = [0.6, 0.4, 0.2, 0, -0.2, -0.4, -0.6, -0.8, -1.0, -1.2, -1.4];
const HELD: Record<OpeningView, { top: number; bottom: number }> = {
  front: { top: 0.4, bottom: -1.4 },
  left: { top: 0.4, bottom: -0.8 },
};
/** how far ours may stray from the reference's rim from the front (`E`: 1.2 cm), and how far the face shown ahead of
 *  the rim from his left from the reference's (6 mm) */
const RIM_SLACK = 0.1;
const SHOWN_SLACK = 0.05;
/** the band the face shown is read in (`E` over the eyes): from over the brow down to the chin */
const FACE_BAND = { top: 0.8, bottom: -1.0 };
/** the least share of the reference's face shown ours may show */
const LEAST_FACE = 0.85;
/** from his left, how much of the hood's cloth a row must cross before its piping counts as the rim (`E`): less, and
 *  it's the seam's, the hood's outline over its top and down its back. (From the front none: below the eyes its side
 *  is seen edge on and its rim is its outline) */
const LEAST_CLOTH = 0.06;
/** how wide the reference's piping is at the most (`E`): from his left it runs on into the lit face behind the rim,
 *  the same warm colour (its middle then fell on his brow and cheek) */
const PIPING_WIDTH = 0.05;
/** how far either side of the rim the reference's skin isn't counted (px): its piping is skin-coloured */
const RIM_GAP = 2;
/** the reference's piping, a warm gold, pale and pinker where it's lit, deeper in shade (hue in degrees, saturation,
 *  the least value; its cloth is a deep red, its lining near black) */
const PIPING = {
  lit: { hue: [3, 12], saturation: [0.25, 0.58], least: 0.6 },
  gold: { hue: [12, 35], saturation: [0.2, 0.85], least: 0.35 },
};
/** the reference's skin, warm, lit or in shade; pinker where it's lit (the lips, the nose) */
const SKIN = { hue: [6, 35], saturation: [0.12, 0.68], least: 0.3 };
const PINK_SKIN = { from: 345, saturation: [0.12, 0.45], least: 0.45 };
/** the meshes of ours drawn as skin */
const SKIN_MESHES = new Set(['face', 'ear', 'neck']);

/** A pixel's hue (degrees), saturation and value (0 to 1). */
interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hsvAt(image: ImageData, x: number, y: number): Hsv {
  const k = (y * image.width + x) * 4;
  const [r, g, b] = [image.data[k], image.data[k + 1], image.data[k + 2]];
  const most = Math.max(r, g, b);
  const span = most - Math.min(r, g, b);
  const s = most ? span / most : 0;
  const v = most / 255;
  if (!span) return { h: 0, s, v };
  let sector: number;
  if (most === r) sector = (g - b) / span;
  else if (most === g) sector = (b - r) / span + 2;
  else sector = (r - g) / span + 4;
  return { h: (sector * 60 + 360) % 360, s, v };
}

const within = (value: number, [least, most]: number[]) => value >= least && value <= most;

function isPiping(c: Hsv): boolean {
  const ofTone = (tone: typeof PIPING.lit) => within(c.h, tone.hue) && within(c.s, tone.saturation)
    && c.v >= tone.least;
  return Object.values(PIPING).some(ofTone);
}

function isSkin(c: Hsv): boolean {
  if (within(c.h, SKIN.hue)) return within(c.s, SKIN.saturation) && c.v >= SKIN.least;
  const pink = c.h >= PINK_SKIN.from || c.h < SKIN.hue[0];
  return pink && within(c.s, PINK_SKIN.saturation) && c.v >= PINK_SKIN.least;
}

/** Where the reference's rim crosses row `y`, scanned in from `from` by `step` (1 or -1): past its backdrop, over
 *  `leastCloth` px of the hood at least, to the first run of piping; that run's middle, `widest` px of it at the most
 *  (px), or null. */
function rimInRow(image: ImageData, figure: Figure, y: number, from: number, step: number, leastCloth: number,
  widest: number): number | null {
  const inside = (x: number) => x >= 0 && x < image.width;
  let x = from;
  while (inside(x) && !figure(x, y)) x += step;
  let cloth = 0;
  while (inside(x)) {
    if (!isPiping(hsvAt(image, x, y))) {
      cloth++;
      x += step;
      continue;
    }
    const start = x;
    while (inside(x) && isPiping(hsvAt(image, x, y))) x += step;
    const run = Math.min(Math.abs(x - start), widest);
    if (cloth >= leastCloth) return start + (step * (run - 1)) / 2;
    cloth = 0;
  }
  return null;
}

/** The reference's opening from `view`: its face where `marks` say, `figure` what isn't its backdrop. */
export function referenceOpening(image: ImageData, figure: Figure, marks: FaceMarks, view: OpeningView): Opening {
  const leastCloth = view === 'left' ? LEAST_CLOTH * marks.unit : 0;
  const widest = Math.max(1, Math.round(PIPING_WIDTH * marks.unit));
  const rimsAt = (y: number): number[] | null => {
    const fromRight = rimInRow(image, figure, y, image.width - 1, -1, leastCloth, widest);
    if (view === 'left') return fromRight === null ? null : [fromRight];
    const fromLeft = rimInRow(image, figure, y, 0, 1, leastCloth, widest);
    return fromLeft === null || fromRight === null ? null : [fromLeft, fromRight];
  };
  const rowOf = (up: number) => Math.round(marks.eyes.y - up * marks.unit);
  const toE = (x: number) => (x - marks.eyes.x) / marks.unit;
  const rims = RIM_LEVELS.map((up) => rimsAt(rowOf(up))?.map(toE) ?? null);
  const faces = RIM_LEVELS.map((up) => {
    const y = rowOf(up);
    const rim = rimsAt(y);
    const skinAt = (x: number) => isSkin(hsvAt(image, x, y));
    return rim ? faceEdges(skinAt, rim, view, image.width)?.map(toE) ?? null : null;
  });
  let skin = 0;
  for (let y = rowOf(FACE_BAND.top); y <= rowOf(FACE_BAND.bottom); y++) {
    const rim = rimsAt(y);
    if (!rim) continue;
    // (from his left, the face is ahead of the rim, to the picture's left)
    const [from, to] = view === 'left' ? [0, rim[0] - RIM_GAP] : [rim[0] + RIM_GAP, rim[1] - RIM_GAP];
    for (let x = Math.max(0, Math.ceil(from)); x <= Math.min(image.width - 1, to); x++) {
      if (isSkin(hsvAt(image, x, y))) skin++;
    }
  }
  return { rims, faces, face: skin / marks.unit ** 2 };
}

/** how many skin pixels in a row make the face's edge (fewer are a fleck in the lining's shade) */
const FACE_RUN = 3;

/** Where the face shown reaches along a row (px), `skinAt` its skin, `rim` the rim's crossings there: from the front
 *  its left and right edges, each the first run of skin in from the rim; from his left its front, the first run of
 *  skin from the picture's left. */
function faceEdges(skinAt: (x: number) => boolean, rim: number[], view: OpeningView, width: number):
  number[] | null {
  const firstRun = (from: number, to: number, step: number) => {
    let run = 0;
    for (let x = Math.round(from); step > 0 ? x <= to : x >= to; x += step) {
      run = skinAt(x) ? run + 1 : 0;
      if (run === FACE_RUN) return x - step * (FACE_RUN - 1);
    }
    return null;
  };
  if (view === 'left') {
    const front = firstRun(0, Math.min(width - 1, rim[0]), 1);
    return front === null ? null : [front];
  }
  const left = firstRun(rim[0] + RIM_GAP, rim[1], 1);
  const right = firstRun(rim[1] - RIM_GAP, rim[0], -1);
  return left === null || right === null ? null : [left, right];
}

/** Where a point (world space) falls on the tile a picture from `camera` is read as (px, down from its top). */
export function onTile(camera: THREE.Camera, tile: { width: number; height: number }):
  (point: THREE.Vector3) => THREE.Vector2 {
  const gl = G.renderer.getContext();
  return (point) => {
    const ndc = point.clone().project(camera);
    const x = ((ndc.x + 1) / 2) * gl.drawingBufferWidth - (gl.drawingBufferWidth - tile.width) / 2;
    const y = ((1 - ndc.y) / 2) * gl.drawingBufferHeight;
    return new THREE.Vector2(x, y);
  };
}

/** A point's place on a picture in `E` from the eyes: across (+ to the picture's right) and up. */
interface InE {
  across: number;
  up: number;
}

/** Where a trace (from its top down) first comes down to `up`: its place across there, or null. */
function crossingAt(trace: InE[], up: number): number | null {
  for (let k = 1; k < trace.length; k++) {
    const [a, b] = [trace[k - 1], trace[k]];
    if ((a.up - up) * (b.up - up) > 0) continue;
    const t = a.up === b.up ? 0 : (a.up - up) / (a.up - b.up);
    return a.across + (b.across - a.across) * t;
  }
  return null;
}

/** The index of the edge nearer `camera` (the mean of its points). */
function nearerEdge(edges: THREE.Vector3[][], camera: THREE.Camera): number {
  const from = camera.getWorldPosition(new THREE.Vector3());
  const distance = (edge: THREE.Vector3[]) => edge.reduce((sum, p) => sum + p.distanceTo(from), 0) / edge.length;
  return distance(edges[0]) <= distance(edges[1]) ? 0 : 1;
}

/** Our opening from `camera`: the rim's two `edges` (world space, each from its top down) on its picture, where the
 *  face is as `marks` say, and the face shown in `skin` (a mask of the skin as drawn). */
export function ourOpening(edges: THREE.Vector3[][], camera: THREE.Camera, skin: Mask, marks: FaceMarks,
  view: OpeningView): Opening {
  const project = onTile(camera, skin);
  const traces = edges.map((edge) => edge.map((point): InE => {
    const at = project(point);
    return { across: (at.x - marks.eyes.x) / marks.unit, up: (marks.eyes.y - at.y) / marks.unit };
  }));
  // (from his left its near edge alone: the far one runs behind his face)
  const read = view === 'left' ? [nearerEdge(edges, camera)] : [0, 1];
  const rims = RIM_LEVELS.map((up) => {
    const crossings = read.map((k) => crossingAt(traces[k], up));
    if (crossings.some((crossing) => crossing === null)) return null;
    return (crossings as number[]).sort((a, b) => a - b);
  });
  const toPx = (across: number) => marks.eyes.x + across * marks.unit;
  const toE = (x: number) => (x - marks.eyes.x) / marks.unit;
  const faces = RIM_LEVELS.map((up, k) => {
    const rim = rims[k];
    const y = Math.round(marks.eyes.y - up * marks.unit);
    const edges = rim ? faceEdges((x) => skin.covered(x, y), rim.map(toPx), view, skin.width) : null;
    return edges?.map(toE) ?? null;
  });
  const top = Math.round(marks.eyes.y - FACE_BAND.top * marks.unit);
  const bottom = Math.round(marks.eyes.y - FACE_BAND.bottom * marks.unit);
  let face = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < skin.width; x++) if (skin.covered(x, y)) face++;
  }
  return { rims, faces, face: face / marks.unit ** 2 };
}

/** Whether an object of ours is drawn as skin. */
export function isSkinMesh(object: THREE.Object3D): boolean {
  return SKIN_MESHES.has(object.name);
}

/** Whether an object draws as points, lines or a sprite (left out of a mask: a mesh's material won't do for them). */
function isNotMesh(object: THREE.Object3D): boolean {
  const drawn = object as THREE.Object3D & { isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
  return Boolean(drawn.isPoints || drawn.isLine || drawn.isSprite);
}

type Drawn = THREE.Object3D & { material: THREE.Material | THREE.Material[] };

/** `scene` drawn from `camera` flat, what `white` picks white and the rest black (`hidden` and all but meshes left
 *  out), read back as the tile `shoot` reads. */
export function maskOf(lab: Lab, scene: THREE.Scene, camera: THREE.Camera, white: (object: THREE.Object3D) => boolean,
  hidden: THREE.Object3D[]): Mask {
  const paint = (color: number) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const paints = { white: paint(0xffffff), black: paint(0x000000) };
  const swapped: [Drawn, THREE.Material | THREE.Material[]][] = [];
  const shown: THREE.Object3D[] = hidden.filter((object) => object.visible);
  scene.traverse((object) => {
    if (object.visible && isNotMesh(object)) shown.push(object);
  });
  for (const object of shown) object.visible = false;
  scene.traverse((object) => {
    const drawn = object as Drawn;
    if (!drawn.material) return;
    swapped.push([drawn, drawn.material]);
    drawn.material = white(object) ? paints.white : paints.black;
  });
  const renderer = G.renderer;
  const background = scene.background;
  const toneMapping = renderer.toneMapping;
  const drawing = lab.drawing;
  scene.background = new THREE.Color(0x000000);
  renderer.toneMapping = THREE.NoToneMapping;
  lab.drawing = true;
  try {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return readMask();
  } finally {
    for (const [drawn, material] of swapped) drawn.material = material;
    paints.white.dispose();
    paints.black.dispose();
    scene.background = background;
    renderer.toneMapping = toneMapping;
    lab.drawing = drawing;
    for (const object of shown) object.visible = true;
  }
}

/** The canvas's middle at the tile's shape (as `shoot` reads it), its white pixels covered. */
function readMask(): Mask {
  const gl = G.renderer.getContext();
  const frame = frameRect();
  const height = frame.height;
  const width = Math.round((height * 340) / 560);
  const left = frame.left + Math.round((frame.width - width) / 2);
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(left, frame.bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // (read bottom up)
  const covered = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return pixels[((height - 1 - y) * width + x) * 4] > 128;
  };
  return { covered, width, height };
}

/** The opening's half width at `up` (`E`; from the front), or null. */
export function halfWidthAt(opening: Opening, up: number): number | null {
  const rim = opening.rims[RIM_LEVELS.indexOf(up)];
  return rim && rim.length === 2 ? (rim[1] - rim[0]) / 2 : null;
}

/** How far ahead of the eyes the rim is at `up` (`E`; from his left: the face is to the picture's left), or null. */
export function aheadAt(opening: Opening, up: number): number | null {
  const rim = opening.rims[RIM_LEVELS.indexOf(up)];
  return rim && rim.length === 1 ? -rim[0] : null;
}

/** From the front the rim's stand-off from the face shown either side, from his left how far the face shows ahead of
 *  it (`E`; none where the face is hidden behind it), or null where the rim wasn't found. */
function standOffAt(opening: Opening, view: OpeningView, k: number): number[] | null {
  const [rim, face] = [opening.rims[k], opening.faces[k]];
  if (!rim) return null;
  if (view === 'left') return [face ? rim[0] - face[0] : 0];
  return face ? [face[0] - rim[0], rim[1] - face[1]] : null;
}

/** How far the face shows ahead of the rim from his left at `up` (`E`), or null. */
export function shownAt(opening: Opening, up: number): number | null {
  return standOffAt(opening, 'left', RIM_LEVELS.indexOf(up))?.[0] ?? null;
}

/** The opening's reading held to the reference's at a level: its half width from the front, how far the face shows
 *  ahead of its rim from his left. */
function readingAt(opening: Opening, view: OpeningView, up: number): number | null {
  return view === 'left' ? shownAt(opening, up) : halfWidthAt(opening, up);
}

/** The opening's readings as lines, ours beside the reference's, and a problem where ours strays from it. */
export function openingLines(view: OpeningView, ours: Opening, theirs: Opening | null, problems: string[]): string[] {
  const what = view === 'left' ? 'its rim ahead of the eyes' : 'its rim either side';
  const format = (rim: number[] | null | undefined) => (rim ? rim.map((x) => x.toFixed(2)).join(' ') : '-');
  const levels = RIM_LEVELS.map((up, k) => {
    const theirsToo = theirs ? ` | ${format(theirs.rims[k]?.map((x) => (view === 'left' ? -x : x)))}` : '';
    return `${up.toFixed(1)}: ${format(ours.rims[k]?.map((x) => (view === 'left' ? -x : x)))}${theirsToo}`;
  });
  const lines = [`  the opening, E from the eyes at each height up, ${what} (ours | the reference's):`,
    `    ${levels.join('; ')}`];
  const offs = RIM_LEVELS.map((up, k) => {
    const theirsToo = theirs ? ` | ${format(standOffAt(theirs, view, k))}` : '';
    return `${up.toFixed(1)}: ${format(standOffAt(ours, view, k))}${theirsToo}`;
  });
  const shows = view === 'left' ? 'the face shown ahead of the rim' : 'the rim out from the face shown either side';
  lines.push(`  ${shows}, E:`, `    ${offs.join('; ')}`);
  const face = theirs ? `${ours.face.toFixed(2)} | ${theirs.face.toFixed(2)}` : ours.face.toFixed(2);
  lines.push(`  the face shown, E² from ${FACE_BAND.top} E over the eyes down to the chin: ${face}`);
  if (theirs) strays(view, ours, theirs, problems);
  return lines;
}

/** A problem for each way ours strays from the reference's: its rim (from his left, the face shown ahead of it),
 *  where it strays most, and the face shown. */
function strays(view: OpeningView, ours: Opening, theirs: Opening, problems: string[]): void {
  let worst: { up: number; ours: number; theirs: number } | null = null;
  for (const up of RIM_LEVELS) {
    if (up > HELD[view].top || up < HELD[view].bottom) continue;
    const [mine, reference] = [readingAt(ours, view, up), readingAt(theirs, view, up)];
    if (mine === null || reference === null) continue;
    if (!worst || Math.abs(mine - reference) > Math.abs(worst.ours - worst.theirs)) {
      worst = { up, ours: mine, theirs: reference };
    }
  }
  const slack = view === 'left' ? SHOWN_SLACK : RIM_SLACK;
  if (worst && Math.abs(worst.ours - worst.theirs) > slack) {
    const off = worst.ours - worst.theirs;
    const how = view === 'left'
      ? `the face shows ${Math.abs(off).toFixed(2)} E ${off > 0 ? 'more' : 'less'} ahead of its rim than the reference's`
      : `its opening ${Math.abs(off).toFixed(2)} E ${off > 0 ? 'wider' : 'narrower'} either side than the reference's`;
    problems.push(`hood: from ${view === 'left' ? 'his left' : 'the front'} ${how} at ${worst.up.toFixed(1)} E `
      + `over the eyes (${worst.ours.toFixed(2)}, the reference's ${worst.theirs.toFixed(2)})`);
  }
  if (ours.face < theirs.face * LEAST_FACE) {
    problems.push(`hood: from ${view === 'left' ? 'his left' : 'the front'} it shows `
      + `${((ours.face / theirs.face) * 100).toFixed(0)}% of the face the reference's does`);
  }
}

/** The rim's points read at each level as dots for a picture (`E`: across, up). */
export function rimDots(opening: Opening): [number, number][] {
  const dots: [number, number][] = [];
  RIM_LEVELS.forEach((up, k) => {
    for (const across of opening.rims[k] ?? []) dots.push([across, up]);
  });
  return dots;
}
