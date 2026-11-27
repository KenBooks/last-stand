// The kit the tavern's shelf pottery is thrown with, as country earthenware is (#733): each pot a lathe of its own, its
// proportions its own, off round and leaning as a wheel and a hand leave it, glazed down to a wavering line that hangs
// in drips and pools dark where it stopped, its foot and lower body bare matte clay, the glaze broken pale over the lip,
// a chip at the rim. All the clay is one material (vertex colours, and the glaze's shine a roughness read off the uv:
// `GLAZED`, `RAW`), so the room's merge draws every pot in one call. The pots' forms are `potForms.ts`.
import * as THREE from 'three';
import { canvasOf, ctx2d } from '../core/textures';

/** A profile's points, radius and height (m), from the foot outwards and up. */
export type Profile = readonly (readonly [number, number])[];

/** What a pot is thrown as: its outside up to the lip, its inside back down, and how it's glazed. */
export interface Pot {
  outside: Profile;
  /** the inside from the lip back down (a plate's face is its inside) */
  inside: Profile;
  sides: number;
  glaze: THREE.Color;
  clay: THREE.Color;
  /** the height the outside's glaze runs down to (m): its drips hang lower, the foot stays bare */
  glazedTo: number;
  /** the most the outside's points are apart (m): fine where its glaze's line shows; a plate's back needs none */
  step?: number;
  /** how far off round, leaning and uneven it's left (1 a jug's, less a plate's) */
  wobble?: number;
  /** where a point falls on its material's map, by its radius and angle: a slipware plate's design (none: the uv
   *  reads the clay's shine) */
  uvAt?: (radius: number, angle: number) => [number, number];
}

/** the roughness map's two rows, read by the uv's v: glazed (a soft sheen) and bare clay (matte) */
export const GLAZED = 0.25;
const RAW = 0.75;

/** One material for every clay pot: white, its colours the vertices', its shine its uv's row of `roughness`. */
export function clayMaterial(): THREE.MeshStandardMaterial {
  const canvas = canvasOf(1, 2), context = ctx2d(canvas);
  // (the canvas's top row is v 0.75 as three flips it: bare clay, matte; the bottom row a lead glaze's soft sheen,
  // 0.43: at 0.27 each candle stood on a jug as a sharp white dot)
  context.fillStyle = 'rgb(255,255,255)';
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = 'rgb(110,110,110)';
  context.fillRect(0, 1, 1, 1);
  const roughness = new THREE.CanvasTexture(canvas);
  roughness.generateMipmaps = false;
  roughness.minFilter = THREE.LinearFilter;
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, roughnessMap: roughness, vertexColors: true });
}

/** sRGB hex to the linear colour a vertex holds */
const colour = (hex: number): THREE.Color => new THREE.Color(hex);

/** The lead glazes: honey (amber over the clay), copper green, iron brown. In the room's candlelight a deeper honey
 *  read as cherry red, so it's yellower than it looks by day. */
export const GLAZES = { honey: colour(0xa0700e), green: colour(0x4a6428), iron: colour(0x3a2414) } as const;
/** The clays, fired bare: duller and darker than the glaze over them (paler, they read as pink wash). */
export const CLAYS = { red: colour(0x8a5842), buff: colour(0x8a7258) } as const;

/** How a wheel and a hand leave a pot: off round towards its rim, oval, leaning, its rim not quite level. */
interface Wobble {
  round: number; roundAt: number; oval: number; ovalAt: number; leanX: number; leanZ: number; rim: number; rimAt: number;
}

function wobbleOf(rng: () => number, scale: number): Wobble {
  const turn = (): number => rng() * Math.PI * 2;
  return {
    round: (0.025 + rng() * 0.025) * scale, roundAt: turn(), oval: (0.012 + rng() * 0.012) * scale, ovalAt: turn(),
    leanX: (rng() - 0.5) * 0.08 * scale, leanZ: (rng() - 0.5) * 0.08 * scale, rim: (0.003 + rng() * 0.004) * scale,
    rimAt: turn(),
  };
}

/** a hash of a vertex's place on the lathe, 0 to 1, for the glaze's mottle */
function mottle(side: number, point: number, seed: number): number {
  const s = Math.sin(side * 127.1 + point * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** the angle between two (radians, 0 to pi) */
function apart(a: number, b: number): number {
  return Math.abs(((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
}

/** Drips of glaze below its line: where each hangs, how wide and how far. */
interface Drip { at: number; width: number; depth: number }

/** Where a pot's outside glaze ends at an angle: its line, slowly wavering, and the drips hung down from it. */
function glazeLine(pot: Pot, drips: readonly Drip[], wave: number, waveAt: number, angle: number): number {
  let line = pot.glazedTo + wave * Math.sin(angle * 2 + waveAt);
  for (const drip of drips) {
    const off = apart(angle, drip.at);
    // (a tongue: round at its foot, narrowing up into the line)
    if (off < drip.width) line -= drip.depth * Math.sqrt(1 - (off / drip.width) ** 2);
  }
  return line;
}

/** A profile with points put between its own wherever two are further apart than `step` (m), only where it runs
 *  between the heights `from` and `to` (the glaze's line, its drips and its bead): elsewhere its own points draw it. */
function densified(profile: Profile, step: number, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  profile.forEach(([r, y], k) => {
    if (k > 0 && Math.max(y, profile[k - 1][1]) >= from && Math.min(y, profile[k - 1][1]) <= to) {
      const [r0, y0] = profile[k - 1];
      const between = Math.floor(Math.hypot(r - r0, y - y0) / step);
      for (let n = 1; n <= between; n++) {
        const t = n / (between + 1);
        out.push([r0 + (r - r0) * t, y0 + (y - y0) * t]);
      }
    }
    out.push([r, y]);
  });
  return out;
}

/** What a vertex's colour is judged by. */
interface Spot { inside: boolean; lip: boolean; radius: number; angle: number; y: number; line: number; depth: number }

/** A glazed vertex's colour: the glaze, pooled dark where it stopped and deep inside, broken pale
 *  over the lip. */
function glazeAt(tint: THREE.Color, pot: Pot, spot: Spot): void {
  tint.copy(pot.glaze);
  if (spot.lip) tint.lerp(pot.clay, 0.35).multiplyScalar(1.1);
  // (where the glaze ran and stopped it lies thick: a dark bead 15 mm over its edge)
  const fromEdge = Math.max(0, spot.y - spot.line);
  if (!spot.inside && fromEdge < 0.015) tint.multiplyScalar(0.55 + 0.45 * fromEdge / 0.015);
  // (deep inside an open pot it's in its own shadow; by its depth in metres, so a plate's well stays lit)
  if (spot.inside) tint.multiplyScalar(Math.max(0.38, 1 - 6 * spot.depth));
}

/** A bare vertex's colour: the clay, even and matte, darker where it stood on the shelves and the kiln's floor. */
function clayAt(tint: THREE.Color, pot: Pot, y: number): void {
  tint.copy(pot.clay).multiplyScalar(y < 0.006 ? 0.7 : 0.9 + 0.1 * Math.min(1, y / 0.03));
}

/** The lathe's first and last sides hold the same points: give each pair one normal, so the seam shows no crease. */
function joinSeam(lathe: THREE.BufferGeometry, count: number, sides: number): void {
  const normal = lathe.attributes.normal, joined = new THREE.Vector3(), other = new THREE.Vector3();
  for (let point = 0; point < count; point++) {
    const last = sides * count + point;
    joined.fromBufferAttribute(normal, point).add(other.fromBufferAttribute(normal, last)).normalize();
    normal.setXYZ(point, joined.x, joined.y, joined.z);
    normal.setXYZ(last, joined.x, joined.y, joined.z);
  }
}

/** The drips a pot's glaze hangs in below its line: two to four, narrow tongues of a fifth to a third of its height. */
function dripsOf(rng: () => number, height: number): Drip[] {
  const drips: Drip[] = [];
  for (let k = Math.floor(rng() * 3) + 2; k > 0; k--) {
    drips.push({ at: rng() * Math.PI * 2, width: 0.2 + rng() * 0.15, depth: height * (0.08 + rng() * 0.14) });
  }
  return drips;
}

/**
 * A pot thrown: its lathe, wobbled as a hand leaves it, coloured and given its shine by its glaze; `shape` moves its
 * points before its normals are made (a pouring lip). The seam's normals are joined so it shows no crease.
 */
export function throwPot(pot: Pot, rng: () => number, shape?: (lathe: THREE.BufferGeometry) => void): THREE.BufferGeometry {
  const height = Math.max(...pot.outside.map(([, y]) => y));
  const wobble = wobbleOf(rng, pot.wobble ?? 1);
  const drips = dripsOf(rng, height);
  // (the outside in steps of a centimetre or so where the glaze's line, its drips and its bead are drawn between its
  // points; stepped from foot to lip, a pitcher was 2,200 triangles)
  const deepest = Math.max(...drips.map((drip) => drip.depth));
  const from = pot.glazedTo - height * 0.03 - deepest - 0.005, to = pot.glazedTo + height * 0.03 + 0.015;
  const outside = densified(pot.outside, pot.step ?? 0.012, from, to);
  const points = [...outside, ...pot.inside];
  const count = points.length, firstInside = outside.length;
  const lathe = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), pot.sides);
  const wave = height * 0.03, waveAt = rng() * Math.PI * 2, seed = rng() * 100;
  const chips = [rng() * Math.PI * 2, rng() < 0.5 ? rng() * Math.PI * 2 : -1];
  const position = lathe.attributes.position, uv = lathe.attributes.uv;
  const colours = new Float32Array(position.count * 3);
  const tint = new THREE.Color(), bare = new THREE.Color();
  for (let side = 0; side <= pot.sides; side++) {
    const angle = (side / pot.sides) * Math.PI * 2;
    const line = glazeLine(pot, drips, wave, waveAt, angle);
    for (let point = 0; point < count; point++) {
      const at = side * count + point;
      const [radius, y] = points[point];
      const up = y / height;
      // (off round and oval, more so towards the rim; its lean; its rim's height not quite level)
      const swell = 1 + wobble.round * Math.cos(angle - wobble.roundAt) * up
        + wobble.oval * Math.cos(2 * angle - wobble.ovalAt);
      const x = position.getX(at) * swell + wobble.leanX * y, z = position.getZ(at) * swell + wobble.leanZ * y;
      position.setXYZ(at, x, y + wobble.rim * Math.sin(angle + wobble.rimAt) * up ** 3, z);
      const inside = point >= firstInside;
      const lip = point === firstInside - 1 || point === firstInside;
      // (how glazed, eased over the 10 mm between two points: judged glazed or not, a drip's edge zigzagged along the
      // triangles' diagonals)
      const glazed = inside ? 1 : THREE.MathUtils.smoothstep(y, line - 0.005, line + 0.005);
      glazeAt(tint, pot, { inside, lip, radius, angle, y, line, depth: height - y });
      // (the glaze's mottle, a few hundredths either way, by the side round: the last side is the first again, and
      // hashed by its own index the seam showed as a line)
      tint.multiplyScalar(0.94 + mottle(side % pot.sides, point, seed) * 0.12);
      clayAt(bare, pot, y);
      tint.lerp(bare, 1 - glazed);
      const chipped = lip && chips.some((chip) => chip >= 0 && apart(angle, chip) < 0.12);
      if (chipped) tint.copy(pot.clay).multiplyScalar(1.15);
      colours[at * 3] = tint.r;
      colours[at * 3 + 1] = tint.g;
      colours[at * 3 + 2] = tint.b;
      if (pot.uvAt) uv.setXY(at, ...pot.uvAt(radius, angle));
      else uv.setXY(at, 0.5, chipped ? RAW : RAW + (GLAZED - RAW) * glazed);
    }
  }
  lathe.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  shape?.(lathe);
  lathe.computeVertexNormals();
  joinSeam(lathe, count, pot.sides);
  return lathe;
}

/** A loop handle pulled as a strap (wider than it is thick), its ends sunk into the pot, in its glaze. */
export function handle(path: readonly THREE.Vector3[], glaze: THREE.Color): THREE.BufferGeometry {
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...path]), 12, 0.009, 6, false);
  // (a strap: the tube's section widened across the pot, its path in the x-y plane; a round wire of 7.5 mm read as
  // wire)
  tube.scale(1, 1, 1.8);
  const colours = new Float32Array(tube.attributes.position.count * 3);
  for (let k = 0; k < colours.length; k += 3) {
    colours[k] = glaze.r * 0.9;
    colours[k + 1] = glaze.g * 0.9;
    colours[k + 2] = glaze.b * 0.9;
  }
  tube.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const uv = tube.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.5, GLAZED);
  return tube;
}

/** A profile of its own for each pot: wider or narrower, taller or squatter, its belly fuller or leaner. */
export function varied(profile: Profile, rng: () => number, by = 1): { profile: Profile; wide: number; tall: number } {
  const wide = 1 + (rng() - 0.5) * 0.2 * by, tall = 1 + (rng() - 0.5) * 0.3 * by, belly = (rng() - 0.35) * 0.18 * by;
  const height = Math.max(...profile.map(([, y]) => y));
  const out = profile.map(([r, y]) => [r * wide * (1 + belly * Math.sin(Math.PI * y / height)), y * tall] as const);
  return { profile: out, wide, tall };
}
