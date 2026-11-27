// The tavern's slipware plates' faces (#733): four designs trailed in cream slip over a honey glaze's amber ground,
// painted once into one atlas of 512 by 512 (256 a plate: 1 MB on the GPU, 1.4 with its smaller levels), each line
// wavering as a hand trails it, raised (a darker edge below it), the ground darker in the well where the glaze pools,
// the rim's edge dark with the glaze broken pale over it, a speckle of iron in the clay. Painted by the vertices they
// were as soft as the lathe's points were apart, a centimetre (from the owner: "this looks washed to me").
import * as THREE from 'three';
import { canvasOf, ctx2d } from '../core/textures';
import { mulberry } from '../util';

/** the atlas's size, its cells a side, and a cell's size (px) */
const SIZE = 512;
const CELLS = 2;
const CELL = SIZE / CELLS;
/** a plate's radius to its rim's edge (m), drawn to the cell's edge less a pixel or two */
export const PLATE_RADIUS = 0.146;
const DRAWN = CELL / 2 - 2;

/** how many designs the atlas holds */
export const DESIGNS = CELLS * CELLS;

/** the slip, the ground in the well and at the rim, the rim's dark edge and the glaze broken over it */
const SLIP = '#e8c983';
const SLIP_EDGE = 'rgba(40, 18, 4, 0.55)';
const WELL = '#5c300c';
const RIM = '#8a5416';
const EDGE = '#341808';
const BROKEN = '#b07a3c';
/** the plain plate's colour: the ground's, between the well's and the rim's */
const PLAIN = '#76451a';

/** A painter of one design: the context with its origin at the plate's middle, a pixel a millimetre or so. */
type Design = (context: CanvasRenderingContext2D, rng: () => number) => void;

/** a radius (m) on the plate, in the atlas's pixels */
const px = (metres: number): number => (metres / PLATE_RADIUS) * DRAWN;

/** A line trailed through `points` (px), cream over a darker edge a pixel below it, as raised slip catches the light. */
function trail(context: CanvasRenderingContext2D, points: readonly [number, number][], width: number): void {
  for (const [colour, dy, extra] of [[SLIP_EDGE, 1.2, 1], [SLIP, 0, 0]] as const) {
    context.strokeStyle = colour;
    // (half as wide again as each design says: a trailed line is 4 to 6 mm, and at 3 it read as drawn in ink)
    context.lineWidth = width * 1.5 + extra;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    points.forEach(([x, y], k) => (k ? context.lineTo(x, y + dy) : context.moveTo(x, y + dy)));
    context.stroke();
  }
}

/** A ring trailed at `radius` (m), wavering as a hand turns the plate under the trailer. */
function ring(context: CanvasRenderingContext2D, radius: number, width: number, rng: () => number): void {
  const phase = rng() * Math.PI * 2, wander = 0.6 + rng() * 0.8;
  const points: [number, number][] = [];
  for (let k = 0; k <= 96; k++) {
    const angle = (k / 96) * Math.PI * 2;
    const r = px(radius) + wander * Math.sin(angle * 3 + phase) + 0.5 * Math.sin(angle * 7 + phase * 2);
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  trail(context, points, width);
}

/** A dot of slip at (x, y) px, raised as a trail is. */
function dot(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.fillStyle = SLIP_EDGE;
  context.beginPath();
  context.arc(x, y + 1.2, radius + 0.5, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = SLIP;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

/** A flower in the well: loops out from the middle and back, a dot at its heart, a ring round it. */
const flower: Design = (context, rng) => {
  const petals = 5 + Math.floor(rng() * 3), turn = rng() * Math.PI;
  for (let p = 0; p < petals; p++) {
    const at = turn + (p / petals) * Math.PI * 2, points: [number, number][] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24, out = Math.sin(Math.PI * t) * px(0.058) * (0.9 + rng() * 0.08);
      const angle = at + (t - 0.5) * 0.7;
      points.push([Math.cos(angle) * out, Math.sin(angle) * out]);
    }
    trail(context, points, 3.2);
  }
  dot(context, 0, 0, 4);
  ring(context, 0.076, 3, rng);
  ring(context, 0.117, 3.4, rng);
};

/** A wavy line round the well between two rings, dots round the rim, a spiral at the middle. */
const wave: Design = (context, rng) => {
  const crests = 7 + Math.floor(rng() * 3), turn = rng() * Math.PI, points: [number, number][] = [];
  for (let k = 0; k <= 160; k++) {
    const angle = (k / 160) * Math.PI * 2, r = px(0.052 + 0.012 * Math.sin(crests * angle + turn));
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  trail(context, points, 3);
  const spiral: [number, number][] = [];
  for (let k = 0; k <= 60; k++) {
    const angle = k * 0.32 + turn, r = px(0.002 + k * 0.00045);
    spiral.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  trail(context, spiral, 2.6);
  ring(context, 0.08, 2.8, rng);
  for (let k = 0; k < 22; k++) {
    const angle = (k / 22) * Math.PI * 2 + rng() * 0.05, r = px(0.104);
    dot(context, Math.cos(angle) * r, Math.sin(angle) * r, 2.6 + rng() * 0.6);
  }
};

/** Feathered (combed) slip: lines across the well dragged through crosswise, a ring round them and at the rim. */
const feathered: Design = (context, rng) => {
  context.save();
  context.beginPath();
  context.arc(0, 0, px(0.074), 0, Math.PI * 2);
  context.clip();
  const turn = rng() * Math.PI;
  context.rotate(turn);
  for (let line = -6; line <= 6; line++) {
    const points: [number, number][] = [];
    for (let k = 0; k <= 40; k++) {
      const x = -px(0.08) + (k / 40) * px(0.16);
      // (each line pulled one way then the other where the comb was dragged across it)
      const pull = 5 * Math.sin((x / px(0.08)) * Math.PI * 3);
      points.push([x, line * px(0.011) + pull]);
    }
    trail(context, points, 2.4);
  }
  context.restore();
  ring(context, 0.078, 3, rng);
  ring(context, 0.118, 3, rng);
};

/** A lattice in the well, short dashes round the rim like a pie's crust. */
const lattice: Design = (context, rng) => {
  context.save();
  context.beginPath();
  context.arc(0, 0, px(0.07), 0, Math.PI * 2);
  context.clip();
  context.rotate(rng() * Math.PI);
  for (const turn of [Math.PI / 4, -Math.PI / 4]) {
    for (let line = -5; line <= 5; line++) {
      const c = Math.cos(turn), s = Math.sin(turn), along = line * px(0.016);
      trail(context, [[-s * px(0.09) + c * along, c * px(0.09) + s * along],
        [s * px(0.09) + c * along, -c * px(0.09) + s * along]], 2.4);
    }
  }
  context.restore();
  ring(context, 0.075, 3.2, rng);
  for (let k = 0; k < 30; k++) {
    const angle = (k / 30) * Math.PI * 2, inner = px(0.105), outer = px(0.122);
    trail(context, [[Math.cos(angle) * inner, Math.sin(angle) * inner],
      [Math.cos(angle + 0.05) * outer, Math.sin(angle + 0.05) * outer]], 2.6);
  }
};

const PAINTERS: readonly Design[] = [flower, wave, feathered, lattice];

/** A plate's ground: the honey glaze darker in the well where it pools, its rim's edge dark and broken pale over it,
 *  iron specks in the clay. */
function ground(context: CanvasRenderingContext2D, rng: () => number): void {
  const glaze = context.createRadialGradient(0, 0, 0, 0, 0, DRAWN);
  glaze.addColorStop(0, WELL);
  glaze.addColorStop(px(0.07) / DRAWN, WELL);
  glaze.addColorStop(px(0.095) / DRAWN, RIM);
  glaze.addColorStop(1, RIM);
  context.fillStyle = glaze;
  context.fillRect(-CELL / 2, -CELL / 2, CELL, CELL);
  context.lineWidth = px(0.012);
  context.strokeStyle = EDGE;
  context.beginPath();
  context.arc(0, 0, DRAWN - px(0.006), 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 1.5;
  context.strokeStyle = BROKEN;
  context.beginPath();
  context.arc(0, 0, DRAWN - 1, 0, Math.PI * 2);
  context.stroke();
  for (let k = 0; k < 140; k++) {
    context.fillStyle = `rgba(30, 12, 2, ${0.25 + rng() * 0.35})`;
    context.fillRect((rng() - 0.5) * CELL, (rng() - 0.5) * CELL, 1, 1);
  }
}

/** The atlas's map: each design in its cell, painted once. */
function atlas(): THREE.CanvasTexture {
  const canvas = canvasOf(SIZE), context = ctx2d(canvas), rng = mulberry(1733);
  PAINTERS.forEach((paint, k) => {
    context.save();
    context.translate((k % CELLS) * CELL + CELL / 2, Math.floor(k / CELLS) * CELL + CELL / 2);
    ground(context, rng);
    paint(context, rng);
    context.restore();
  });
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Very low's map: the ground's colour alone, a few pixels (a map still, so the material's pipeline is the same) */
function plainMap(): THREE.CanvasTexture {
  const canvas = canvasOf(4), context = ctx2d(canvas);
  context.fillStyle = PLAIN;
  context.fillRect(0, 0, 4, 4);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** the slipware's material and its two maps, made as the first plate is */
let made: { material: THREE.MeshStandardMaterial; designs: THREE.Texture; plain: THREE.Texture } | null = null;
/** whether the plates are plain (Very low's), as the level last said */
let plain = false;

/** The slipware's material, one for every plate: the atlas under the vertices' colours (the glaze broken over the
 *  rim, its shadow in the well), a lead glaze's soft sheen. */
export function slipwareMaterial(): THREE.MeshStandardMaterial {
  if (!made) {
    const designs = atlas(), plainOne = plainMap();
    const material = new THREE.MeshStandardMaterial({ map: plain ? plainOne : designs, vertexColors: true, roughness: 0.42 });
    made = { material, designs, plain: plainOne };
  }
  return made.material;
}

/** Very low's plain plates, or the trailed designs (`plainSlipware` in data/quality.ts): the map swapped, live. */
export function setPlainSlipware(on: boolean): void {
  plain = on;
  if (!made) return;
  made.material.map = on ? made.plain : made.designs;
  made.material.needsUpdate = true;
}

/** Where a point of a plate's face (its radius, m, and angle round) falls in design `design`'s cell. */
export function slipUv(design: number, radius: number, angle: number): [number, number] {
  const r = Math.min(1, radius / PLATE_RADIUS) * (DRAWN / CELL);
  // (the canvas's rows run down, a texture's v up: three flips the canvas as it uploads it)
  const u = ((design % CELLS) + 0.5 + Math.sin(angle) * r) / CELLS;
  const v = 1 - (Math.floor(design / CELLS) + 0.5 + Math.cos(angle) * r) / CELLS;
  return [u, v];
}
