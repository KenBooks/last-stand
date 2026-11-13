// The pieces of the stash's chest and its hoard (`chestHoard`, `buildChest` in world/village.ts), from play "this needs
// more detail": struck coins of four designs, cut gems, a chased goblet, a crown, gold bars; the pictures they're
// drawn in, the quilted lining and the lock's engraved plate. Every picture is made with its height beside it: a colour
// alone read as a flat decal on the metal under a lamp.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasOf, ctx2d } from '../core/textures';
import { mulberry, TAU } from '../util';

/** a picture and the height it's raised by */
export interface Relief { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }

/** A picture drawn twice by `paint`: in `shades` (colour: what's low, what's raised) and in greys of its height. */
function relief(width: number, height: number, paint: (g: CanvasRenderingContext2D, low: string, high: string) => void,
  colour: [string, string]): Relief {
  const made = (low: string, high: string, srgb: boolean): THREE.CanvasTexture => {
    const c = canvasOf(width, height);
    paint(ctx2d(c), low, high);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { map: made(colour[0], colour[1], true), bumpMap: made('#404040', '#e0e0e0', false) };
}

/** the coins' pictures: `DESIGNS` a side, each a cell of the atlas */
const DESIGNS = 2, CELL = 256;

/** One coin's face in the cell at (0, 0), `CELL` across: its field, a beaded rim, a legend of strokes, its device. */
function coinDesign(g: CanvasRenderingContext2D, design: number, low: string, high: string, seed: number): void {
  const mid = CELL / 2, rng = mulberry(seed);
  g.fillStyle = low;
  g.fillRect(0, 0, CELL, CELL);
  g.fillStyle = high;
  g.strokeStyle = high;
  g.lineCap = 'round';
  // the rim, and its beads inside it
  g.lineWidth = 10;
  g.beginPath();
  g.arc(mid, mid, 118, 0, TAU);
  g.stroke();
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * TAU;
    g.beginPath();
    g.arc(mid + Math.cos(a) * 104, mid + Math.sin(a) * 104, 3.2, 0, TAU);
    g.fill();
  }
  // the legend: a worn letter's strokes round the device
  g.lineWidth = 4;
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * TAU + 0.1, tall = 6 + rng() * 5, lean = (rng() - 0.5) * 0.12;
    g.beginPath();
    g.moveTo(mid + Math.cos(a) * (88 - tall), mid + Math.sin(a) * (88 - tall));
    g.lineTo(mid + Math.cos(a + lean) * (88 + tall), mid + Math.sin(a + lean) * (88 + tall));
    g.stroke();
  }
  g.lineWidth = 8;
  if (design === 0) {
    // a crowned head, side on
    g.beginPath();
    g.arc(mid, mid - 6, 34, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(mid + 30, mid - 14);
    g.lineTo(mid + 44, mid + 2);
    g.lineTo(mid + 30, mid + 8);
    g.fill();
    g.fillRect(mid - 20, mid + 20, 34, 26);
    g.beginPath();
    g.moveTo(mid - 36, mid - 34);
    for (let k = 0; k <= 4; k++) {
      g.lineTo(mid - 36 + k * 18, mid - (k % 2 ? 42 : 62));
    }
    g.lineTo(mid + 36, mid - 34);
    g.fill();
  } else if (design === 1) {
    // a tower with its battlements and a gate cut in it
    g.fillRect(mid - 34, mid - 34, 68, 88);
    for (let k = 0; k < 3; k++) g.fillRect(mid - 42 + k * 32, mid - 54, 20, 24);
    g.fillStyle = low;
    g.beginPath();
    g.arc(mid, mid + 28, 14, Math.PI, 0);
    g.lineTo(mid + 14, mid + 54);
    g.lineTo(mid - 14, mid + 54);
    g.fill();
  } else if (design === 2) {
    // a cross, each arm flared
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(mid, mid);
      g.rotate((k / 4) * TAU);
      g.beginPath();
      g.moveTo(-9, 0);
      g.lineTo(-24, -62);
      g.lineTo(24, -62);
      g.lineTo(9, 0);
      g.fill();
      g.restore();
    }
  } else {
    // a sun: a boss and its rays, long and short
    g.beginPath();
    g.arc(mid, mid, 22, 0, TAU);
    g.fill();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, far = k % 2 ? 44 : 66;
      g.beginPath();
      g.moveTo(mid + Math.cos(a) * 30, mid + Math.sin(a) * 30);
      g.lineTo(mid + Math.cos(a) * far, mid + Math.sin(a) * far);
      g.stroke();
    }
  }
}

/** The coins' faces: four designs, each cap of a coin laid in one (`coinGeometry`). */
export function coinFaces(): Relief {
  const side = DESIGNS * CELL;
  const faces = relief(side, side, (g, low, high) => {
    for (let k = 0; k < DESIGNS * DESIGNS; k++) {
      g.save();
      g.translate((k % DESIGNS) * CELL, Math.floor(k / DESIGNS) * CELL);
      coinDesign(g, k, low, high, 90 + k);
      g.restore();
    }
  }, ['#c0a878', '#e8d4a0']);
  return faces;
}

/** how many sides a coin has: rounder than ten, whose corners showed at the chest */
const COIN_SIDES = 16;

/** A coin of `radius`, its caps in `design`'s cell and its edge at a cell's corner (a rim's colour alone), in `tint`. */
export function coinGeometry(design: number, radius: number, thick: number, tint: THREE.Color): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, thick, COIN_SIDES);
  const uv = geo.attributes.uv, normal = geo.attributes.normal;
  const cellU = (design % DESIGNS) / DESIGNS, cellV = Math.floor(design / DESIGNS) / DESIGNS;
  for (let k = 0; k < uv.count; k++) {
    const onCap = Math.abs(normal.getY(k)) > 0.5;
    if (onCap) uv.setXY(k, cellU + uv.getX(k) / DESIGNS, cellV + uv.getY(k) / DESIGNS);
    else uv.setXY(k, cellU + 0.01, cellV + 0.01);
  }
  return tinted(geo, tint);
}

/** `geo` coloured all in `tint`, per vertex. */
function tinted(geo: THREE.BufferGeometry, tint: THREE.Color): THREE.BufferGeometry {
  const count = geo.attributes.position.count, colours = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) colours.set([tint.r, tint.g, tint.b], k * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geo;
}

/** where a coin lies and how it's turned */
export interface LaidCoin { x: number; y: number; z: number; turn: THREE.Quaternion }

/** how many metres a cell of the bed is, and the steepest slope a coin rests at (its tangent: at 0.6, up the heap's
 *  steep foot each hung high over its slope, the heap's front bare) */
const BED_CELL = 0.01, BED_STEEPEST = 1.1, TUCKED_UNDER = 1.5;
/** the spots under a coin it's rested on, as shares of its radius (its middle and two rings) */
const UNDER_COIN = [[0, 0], ...[0.5, 1].flatMap((share) => Array.from({ length: 8 }, (_, k): [number, number] =>
  [share * Math.cos((k / 8) * TAU), share * Math.sin((k / 8) * TAU)]))];

/** The top of what's in the chest as a height grid, coins dropped on it one at a time: each rests on what's under it, on
 *  nothing else's inside, so none cuts through another and none hangs in the air. */
export class CoinBed {
  private readonly tops: Float32Array;
  private readonly columns: number;
  private readonly rows: number;

  constructor(private readonly w: number, private readonly d: number, heapAt: (x: number, z: number) => number) {
    this.columns = Math.ceil(w / BED_CELL) + 1;
    this.rows = Math.ceil(d / BED_CELL) + 1;
    this.tops = new Float32Array(this.columns * this.rows);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        this.tops[this.cell(column, row)] = heapAt((column * BED_CELL - w / 2), (row * BED_CELL - d / 2));
      }
    }
  }

  private cell(column: number, row: number): number {
    return row * this.columns + column;
  }

  /** The top at a spot. */
  topAt(x: number, z: number): number {
    const column = THREE.MathUtils.clamp(Math.round((x + this.w / 2) / BED_CELL), 0, this.columns - 1);
    const row = THREE.MathUtils.clamp(Math.round((z + this.d / 2) / BED_CELL), 0, this.rows - 1);
    return this.tops[this.cell(column, row)];
  }

  /** The highest top within `radius` of a spot. */
  topOver(x: number, z: number, radius: number): number {
    return Math.max(...UNDER_COIN.map(([across, along]) => this.topAt(x + across * radius, z + along * radius)));
  }

  /** A coin dropped at a spot, turned about its axis by `spin`: resting on the slope under it (`level`, flat), its
   *  lowest point on the highest thing under it; what's under it is now its top. */
  lay(x: number, z: number, radius: number, thick: number, spin: number, level: boolean): LaidCoin {
    const heights = UNDER_COIN.map(([across, along]) => this.topAt(x + across * radius, z + along * radius));
    const mean = heights.reduce((sum, height) => sum + height, 0) / heights.length;
    let slopeX = 0, slopeZ = 0, spread = 0;
    UNDER_COIN.forEach(([across, along], k) => {
      slopeX += across * heights[k];
      slopeZ += along * heights[k];
      spread += across * across;
    });
    slopeX = level ? 0 : THREE.MathUtils.clamp(slopeX / (spread * radius), -BED_STEEPEST, BED_STEEPEST);
    slopeZ = level ? 0 : THREE.MathUtils.clamp(slopeZ / (spread * radius), -BED_STEEPEST, BED_STEEPEST);
    const planeAt = (across: number, along: number): number => mean + (slopeX * across + slopeZ * along) * radius;
    // (tucked under what stands over it, past a few coins' thickness: lifted clear of it, a coin dropped beside a pile hung
    // at the pile's top, a roof of coins over the heap's bare skin)
    const clear = Math.max(...UNDER_COIN.map(([across, along], k) => heights[k] - planeAt(across, along)));
    const lifted = Math.min(clear, thick * TUCKED_UNDER);
    const y = mean + lifted + thick / 2;
    this.stamp(x, z, radius, y + thick / 2, slopeX, slopeZ);
    const up = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
    return { x, y, z, turn };
  }

  /** Raises the top under a coin to its upper face. */
  private stamp(x: number, z: number, radius: number, top: number, slopeX: number, slopeZ: number): void {
    const reach = Math.ceil(radius / BED_CELL);
    const middleColumn = Math.round((x + this.w / 2) / BED_CELL), middleRow = Math.round((z + this.d / 2) / BED_CELL);
    for (let row = middleRow - reach; row <= middleRow + reach; row++) {
      for (let column = middleColumn - reach; column <= middleColumn + reach; column++) {
        if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) continue;
        const offX = column * BED_CELL - this.w / 2 - x, offZ = row * BED_CELL - this.d / 2 - z;
        if (offX * offX + offZ * offZ > radius * radius) continue;
        const cell = this.cell(column, row);
        this.tops[cell] = Math.max(this.tops[cell], top + slopeX * offX + slopeZ * offZ);
      }
    }
  }
}

/** The coins deep in the hoard, between those lying on it: discs over discs, deep in shadow between them, tiling. */
export function coinsPile(): Relief {
  const side = 512;
  const paint = (g: CanvasRenderingContext2D, low: string, high: string): void => {
    const rng = mulberry(81);
    g.fillStyle = low;
    g.fillRect(0, 0, side, side);
    for (let k = 0; k < 900; k++) {
      const x = rng() * side, y = rng() * side, r = 13 + rng() * 6, squash = 0.45 + rng() * 0.55, turn = rng() * Math.PI;
      for (const [dx, dy] of [[0, 0], [side, 0], [-side, 0], [0, side], [0, -side]]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, r, r * squash, turn, 0, TAU);
        g.fillStyle = high;
        g.globalAlpha = 0.45 + rng() * 0.55;
        g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = low;
        g.lineWidth = 2.5;
        g.stroke();
      }
    }
  };
  const pile = relief(side, side, paint, ['#120a02', '#6e5420']);
  for (const t of [pile.map, pile.bumpMap]) t.repeat.set(3, 2);
  return pile;
}

/** The goblet's and the crown's chasing: bands round them, and a leaf repeated between. */
export function chased(): Relief {
  const side = 256;
  return relief(side, side, (g, low, high) => {
    g.fillStyle = high;
    g.fillRect(0, 0, side, side);
    g.strokeStyle = low;
    g.lineWidth = 3;
    for (const y of [36, 44, 212, 220]) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(side, y);
      g.stroke();
    }
    for (let k = 0; k < 8; k++) {
      const x = (k + 0.5) * (side / 8);
      g.beginPath();
      g.moveTo(x, 200);
      g.bezierCurveTo(x - 15, 150, x - 11, 90, x, 58);
      g.bezierCurveTo(x + 11, 90, x + 15, 150, x, 200);
      g.moveTo(x, 190);
      g.lineTo(x, 80);
      g.stroke();
    }
  }, ['#a8894c', '#f0d48c']);
}

/** The lock's plate: brass, a border engraved round it, scrolls in its corners, its surface worn. */
export function lockPlate(): Relief {
  const w = 256, h = 320;
  return relief(w, h, (g, low, high) => {
    g.fillStyle = high;
    g.fillRect(0, 0, w, h);
    const rng = mulberry(84);
    g.strokeStyle = low;
    g.lineWidth = 6;
    g.strokeRect(16, 16, w - 32, h - 32);
    g.lineWidth = 3;
    g.strokeRect(28, 28, w - 56, h - 56);
    for (const [x, y, a] of [[52, 52, 0], [w - 52, 52, 1], [w - 52, h - 52, 2], [52, h - 52, 3]]) {
      g.save();
      g.translate(x, y);
      g.rotate((a * TAU) / 4);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-10, 42);
      g.bezierCurveTo(-14, 6, 6, -14, 42, -10);
      g.moveTo(18, 8);
      g.arc(10, 10, 9, 0, TAU * 0.8);
      g.stroke();
      g.restore();
    }
    g.globalAlpha = 0.05;
    g.lineWidth = 1;
    for (let k = 0; k < 90; k++) {
      const x = rng() * w, y = rng() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rng() - 0.5) * 50, y + (rng() - 0.5) * 50);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, ['#4e3a14', '#c8a860']);
}

/** A keyhole's shape, dark, flat on a plate's face, wound to face out: a round head over a slot widening down. */
export function keyholeGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.012, -Math.PI * 0.32, Math.PI * 1.32, false);
  shape.lineTo(-0.01, -0.034);
  shape.lineTo(0.01, -0.034);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 16);
}

/** A plate its picture lies on face on, its edges a plain part of it: squeezed whole onto them, its border was hatching. */
export function plateGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv, normal = geo.attributes.normal;
  for (let k = 0; k < uv.count; k++) {
    if (Math.abs(normal.getZ(k)) < 0.5) uv.setXY(k, 0.5, 0.97);
  }
  return geo;
}

/** The lining: velvet quilted in diamonds, a tuft where four meet. */
export function quiltedLining(): Relief {
  const side = 256, count = 4, pitch = side / count;
  return relief(side, side, (g, low, high) => {
    g.fillStyle = low;
    g.fillRect(0, 0, side, side);
    for (let row = -1; row <= count * 2; row++) {
      for (let col = -1; col <= count; col++) {
        const x = (col + (row % 2 ? 0.5 : 0)) * pitch, y = (row * pitch) / 2;
        const puff = g.createRadialGradient(x, y, 2, x, y, pitch * 0.5);
        puff.addColorStop(0, high);
        puff.addColorStop(1, low);
        g.fillStyle = puff;
        g.beginPath();
        g.moveTo(x, y - pitch / 2 + 2);
        g.lineTo(x + pitch / 2 - 2, y);
        g.lineTo(x, y + pitch / 2 - 2);
        g.lineTo(x - pitch / 2 + 2, y);
        g.fill();
      }
    }
  }, ['#1c060a', '#5e1c26']);
}

/** the gem's rings: its table, the crown's middle, its girdle (each radius and height, m), and its point below */
const TABLE = { r: 0.023, y: 0.026 }, CROWN = { r: 0.035, y: 0.016 }, GIRDLE = { r: 0.044, y: 0.004 }, CULET = -0.04;
/** how many sides its table has, how far a facet's brightness goes (facets lit alike read as a sweet), its share of flashes */
const GEM_SIDES = 12, FACET_DIM = 0.4, FACET_BRIGHT = 1.2, FACET_FLASHES = 0.1;

/** A gem cut as a brilliant is (a flat table, star and kite facets on its crown, a pavilion to a point), in `tint`, each
 *  facet flat and a shade of its own, a few near white, as what's behind a stone lights it; `long`: as much longer one way. */
export function gemGeometry(seed: number, tint: number, long = 1): THREE.BufferGeometry {
  const rng = mulberry(seed), points: number[] = [], colours: number[] = [];
  const colour = new THREE.Color(tint), facetColour = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  const at = (ring: { r: number; y: number }, turn: number): THREE.Vector3 => {
    const a = (turn / GEM_SIDES) * TAU;
    return new THREE.Vector3(Math.cos(a) * ring.r * long, ring.y, Math.sin(a) * ring.r);
  };
  const up = new THREE.Vector3(), across = new THREE.Vector3();
  const facet = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    const flash = rng() < FACET_FLASHES;
    facetColour.copy(colour);
    if (flash) facetColour.lerp(white, 0.25);
    else facetColour.multiplyScalar(FACET_DIM + rng() * (FACET_BRIGHT - FACET_DIM));
    // (wound out from the stone's middle: it's convex)
    up.subVectors(b, a).cross(across.subVectors(c, a));
    const out = up.dot(across.copy(a).add(b).add(c)) > 0;
    for (const p of out ? [a, b, c] : [a, c, b]) {
      points.push(p.x, p.y, p.z);
      colours.push(facetColour.r, facetColour.g, facetColour.b);
    }
  };
  const top = new THREE.Vector3(0, TABLE.y, 0), point = new THREE.Vector3(0, CULET, 0);
  for (let k = 0; k < GEM_SIDES; k++) {
    const t0 = at(TABLE, k), t1 = at(TABLE, k + 1), c = at(CROWN, k + 0.5);
    const g0 = at(GIRDLE, k), g1 = at(GIRDLE, k + 0.5), g2 = at(GIRDLE, k + 1);
    facet(top, t0, t1);
    facet(t0, c, t1);
    facet(t0, g0, c);
    facet(c, g0, g1);
    facet(c, g1, g2);
    facet(t1, c, g2);
    facet(point, g0, g1);
    facet(point, g1, g2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  return geo;
}

/** The goblet, turned: a stepped foot, a stem with a knop, a cup swelling to a flared lip with a band under it, its
 *  inside down to the cup's floor. */
export function gobletGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, 0], [0.034, 0], [0.036, 0.004], [0.026, 0.009], [0.018, 0.014], [0.009, 0.026], [0.008, 0.04], [0.016, 0.047],
    [0.017, 0.052], [0.016, 0.057], [0.008, 0.064], [0.009, 0.074], [0.024, 0.082], [0.038, 0.098], [0.044, 0.118],
    [0.0465, 0.122], [0.0465, 0.128], [0.044, 0.132], [0.045, 0.15], [0.05, 0.166], [0.047, 0.167], [0.041, 0.15],
    [0.036, 0.12], [0.02, 0.095], [0, 0.09],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, 28);
}

/** the crown's size: its radius, its band's height and how tall a point stands over it (m), and its points */
const CROWN_SIZE = { r: 0.078, band: 0.026, point: 0.042 }, CROWN_POINTS = 6;
/** where across `chased`'s picture no leaf is drawn */
const PLAIN_COLUMN = 0.001;

/** Where a crown's points and their pearls stand: the angle of each. */
export const crownPointAngle = (k: number): number => (k / CROWN_POINTS) * TAU;
export const crownPoints = (): number => CROWN_POINTS;

/** A crown: a band with its points, wall thick (its inside drawn too, wound the other way), a ball on each point. */
export function crownGeometry(): { band: THREE.BufferGeometry; size: typeof CROWN_SIZE } {
  const { r, band, point } = CROWN_SIZE;
  const sides = CROWN_POINTS * 8;
  const shell = (radius: number, inside: boolean): THREE.BufferGeometry => {
    const geo = new THREE.CylinderGeometry(radius, radius * 0.96, band + point, sides, 1, true).translate(0, (band + point) / 2, 0);
    const at = geo.attributes.position;
    for (let k = 0; k < at.count; k++) {
      if (at.getY(k) < 0.001) continue;
      const a = Math.atan2(at.getX(k), at.getZ(k));
      const tip = Math.abs(((((a / TAU) * CROWN_POINTS) % 1) + 1) % 1 - 0.5) * 2;
      at.setY(k, band + point * tip ** 1.4);
    }
    if (inside) {
      const index = geo.index!;
      for (let k = 0; k < index.count; k += 3) {
        const a = index.getX(k);
        index.setX(k, index.getX(k + 1));
        index.setX(k + 1, a);
      }
    }
    geo.computeVertexNormals();
    return geo;
  };
  const shells = [shell(r, false), shell(r - 0.004, true)];
  // (bands alone on its walls, in the picture's plain column: its leaves, drawn over a wall that rises and falls, smeared)
  for (const wall of shells) {
    const uv = wall.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, PLAIN_COLUMN);
  }
  const parts = [...shells];
  for (let k = 0; k < CROWN_POINTS; k++) {
    // (tips stand where the shell's triangle wave peaks: half way from one point's valley to the next)
    const a = crownPointAngle(k);
    parts.push(new THREE.SphereGeometry(0.009, 8, 6).translate(Math.sin(a) * r, band + point + 0.003, Math.cos(a) * r));
  }
  // (the rim round its foot)
  parts.push(new THREE.TorusGeometry(r, 0.004, 6, sides).rotateX(Math.PI / 2).translate(0, 0.003, 0));
  parts.push(new THREE.TorusGeometry(r, 0.0032, 6, sides).rotateX(Math.PI / 2).translate(0, band, 0));
  // (what's round on it plain: the picture whole on a ball read as a walnut)
  for (const part of parts.slice(shells.length)) plainMapped(part);
  const unindexed = parts.map((part) => {
    const flat = part.toNonIndexed();
    part.dispose();
    return flat;
  });
  const merged = mergedAll(unindexed);
  return { band: merged, size: CROWN_SIZE };
}

/** `geo` taking one plain spot of its picture. */
function plainMapped(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, PLAIN_COLUMN, 0.5);
  return geo;
}

/** Geometries of position, normal and uv alone as one. */
function mergedAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = parts[0].getAttribute(name).itemSize, values: number[] = [];
    for (const part of parts) values.push(...(part.getAttribute(name).array as Float32Array));
    merged.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  for (const part of parts) part.dispose();
  return merged;
}

/** A gold bar, cast: rounded edges, its top narrower than its foot, an assayer's stamp raised on it. */
export function barGeometry(): THREE.BufferGeometry {
  const { long, wide, tall, narrows } = BAR;
  const bar = new RoundedBoxGeometry(long, tall, wide, 3, 0.005);
  const at = bar.attributes.position;
  for (let k = 0; k < at.count; k++) {
    const share = 1 - narrows * (at.getY(k) / tall + 0.5);
    at.setXYZ(k, at.getX(k) * share, at.getY(k), at.getZ(k) * share);
  }
  bar.computeVertexNormals();
  const stamp = new RoundedBoxGeometry(long * 0.5, 0.0024, wide * 0.42, 1, 0.001).translate(0, tall / 2, 0);
  const parts = [bar, stamp].map((part) => plainMapped(part));
  const merged = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return merged;
}
/** a gold bar's size (m), and the share its top narrows by */
const BAR = { long: 0.13, wide: 0.06, tall: 0.03, narrows: 0.14 };
