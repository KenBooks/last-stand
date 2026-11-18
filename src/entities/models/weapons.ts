// The warrior's weapons, each built along its grip's +Y from where the right hand holds it (the head or the blade up),
// its width (a blade's, an axe's bit) along +X and its flats facing ±Z. Made as a smith makes them, of the parts that
// make each what it is: a blade with its bevels, flats and fuller, a guard, a wrapped grip and a pommel; an axe's
// bearded head thinning to a bright edge, its socket, poll, langets and rivets; a mace's flanges swept to their
// points round a socket; a maul's banded head with its striking faces. Drawn as boxes and discs, through the eyes a
// maul was a stick, an axe a haft with a plate on it and a mace a block.
import * as THREE from 'three';
import { lathe, mirrorX, skipping, type Sculpt } from './shapes';
import { taperTube, twist, scaleUV } from './armor';
import { clamp, lerp } from '../../util';

/** The materials a weapon is made of. */
export interface WeaponMaterials {
  /** bright steel (fittings, faces), dark steel (a head's body, a fuller's walls), polished steel (a blade's edges) */
  steel: THREE.Material;
  dark: THREE.Material;
  blade: THREE.Material;
  /** engraved steel (a maul head's middle band) */
  engraved: THREE.Material;
  brass: THREE.Material;
  wood: THREE.Material;
  leather: THREE.Material;
  leatherDark: THREE.Material;
  /** what glows while a skill charges (a fuller's floor) */
  glow: THREE.Material;
}

/** The side of a weapon that strikes, along its +X: a blade's two edges, an axe's bit (+X, its poll behind), a
 *  greataxe's two bits, a maul's two faces; a mace strikes with its flanges all round. A blow lands with it leading,
 *  as a real one does: swung with its flat ahead, a blade slaps. */
export type StrikingSide = 'edges' | 'bit' | 'faces' | 'round';

/** Each weapon's striking side, by its base (models/warrior.ts names each weapon's group so). */
export const STRIKES_WITH: Record<string, StrikingSide> = {
  Sword: 'edges',
  Greatsword: 'edges',
  Axe: 'bit',
  Greataxe: 'edges',
  Mace: 'round',
  Maul: 'faces',
};

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** A geometry made unless the sculpt replays its cache (shapes.ts `skipping`: its pieces are then cached already). */
function made(build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  return skipping() ? new THREE.BufferGeometry() : build();
}

/**
 * A surface through rows of points (each row as many), indexed so its normals are smooth across it, its uv the
 * points' x and y. Its faces point the way the rows go round from the columns, as a tube's do from +X towards +Z with
 * the rows rising (`flip` the other way).
 */
function surface(rows: THREE.Vector3[][], flip = false): THREE.BufferGeometry {
  const columns = rows[0].length;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const row of rows) {
    for (const point of row) {
      positions.push(point.x, point.y, point.z);
      uvs.push(point.x * 3, point.y * 3);
    }
  }
  const index: number[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let k = 0; k + 1 < columns; k++) {
      const a = i * columns + k;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      if (flip) index.push(a, b, c, c, b, d);
      else index.push(a, c, b, c, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The columns `from` to `to` of each row of `rows`. */
const band = (rows: THREE.Vector3[][], from: number, to: number) => rows.map((row) => row.slice(from, to + 1));
/** Each row's points with z turned over (the back of a flat piece). */
const back = (rows: THREE.Vector3[][]) => rows.map((row) => row.map((point) => V(point.x, point.y, -point.z)));

/** a rivet's dome: a flattened half sphere, its face along +Z */
const rivet = (r: number) => made(() => new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55));
/** a ring round a haft, `h` tall */
const ring = (r: number, h: number, sides = 14) => made(() => new THREE.CylinderGeometry(r, r, h, sides, 1, true));

/** A leather wrap from `top` down to `bottom` round a handle of radius `r`: a strap wound round it, and a collar at
 *  each end. */
function wrap(w: Sculpt, g: THREE.Group, M: WeaponMaterials, top: number, bottom: number, r: number, turns: number): void {
  w.add(made(() => twist(top - bottom, r * 1.04, r * 0.17, turns)), M.leather, g, [0, top, 0]);
  for (const y of [top, bottom]) w.add(made(() => new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.016, 14)), M.leatherDark, g, [0, y, 0]);
}

// --- swords ---

/** a blade's rows along its length, and how far up it its fuller runs (a share of it) */
const BLADE_ROWS = 30;
const FULLER_TO = 0.72;
/** the section's columns across the blade's face, from its +X edge: the edge, the bevel's top, the fuller's lip, its
 *  floor (two), the other lip, the other bevel, the other edge; the bands between them (pairs of columns) of each
 *  material */
const BEVELS = [[0, 1], [6, 7]];
const FLATS = [[1, 2], [5, 6]];
const FULLER_WALLS = [[2, 3], [4, 5]];
const FULLER_FLOOR = [3, 4];

/** A sword's face at share `t` up its blade (`half` its half-width at the guard, `thick` its half-thickness there):
 *  the section's columns across it. */
function bladeSection(t: number, y: number, half: number, thick: number): THREE.Vector3[] {
  const point = 0.78;
  const u = Math.max(0, (t - point) / (1 - point));
  const width = t < point ? half * (1 - 0.2 * t) : half * (1 - 0.2 * point) * Math.pow(Math.max(0, 1 - Math.pow(u, 1.8)), 0.6);
  const depth = thick * (1 - 0.55 * t);
  const fullerK = clamp(t / 0.04, 0, 1) * (1 - clamp((t - FULLER_TO + 0.08) / 0.08, 0, 1));
  const fuller = half * 0.2 * (1 - 0.3 * t) * fullerK;
  const floor = depth * (1 - 0.6 * fullerK);
  return [
    V(width, y, 0),
    V(width * 0.72, y, depth * 0.8),
    V(fuller, y, depth),
    V(fuller * 0.45, y, floor),
    V(-fuller * 0.45, y, floor),
    V(-fuller, y, depth),
    V(-width * 0.72, y, depth * 0.8),
    V(-width, y, 0),
  ];
}

/** A blade from `at` up `length` (`half` its half-width at the guard): its bevels polished, its flats bright, its
 *  fuller's walls dark and its floor the glow a charging skill lights, both faces. */
function blade(w: Sculpt, g: THREE.Group, M: WeaponMaterials, half: number, length: number, at: number): void {
  const thick = half * 0.11;
  const rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= BLADE_ROWS; i++) {
    const t = i / BLADE_ROWS;
    rows.push(bladeSection(t, at + t * length, half, thick));
  }
  const both = (from: number, to: number, material: THREE.Material) => {
    w.add(made(() => surface(band(rows, from, to))), material, g);
    w.add(made(() => surface(band(back(rows), from, to), true)), material, g);
  };
  for (const [from, to] of BEVELS) both(from, to, M.blade);
  for (const [from, to] of FLATS) both(from, to, M.steel);
  for (const [from, to] of FULLER_WALLS) both(from, to, M.dark);
  both(FULLER_FLOOR[0], FULLER_FLOOR[1], M.glow);
}

/** A sword's hilt below its blade (the guard at 0.11): a cross with quillons curving towards the blade and a block
 *  over the blade's root, a corded grip `grip` long between two ferrules, and a wheel pommel with a boss each side. */
function hilt(w: Sculpt, g: THREE.Group, M: WeaponMaterials, grip: number, guard: number): void {
  const top = 0.1;
  const bottom = top - grip;
  w.add(made(() => scaleUV(lathe([[0.018, bottom], [0.021, bottom + grip * 0.3], [0.0215, top - grip * 0.4], [0.019, top]], 14), 1, 3)), M.leatherDark, g);
  w.add(made(() => twist(grip * 0.92, 0.0205, 0.0028, Math.round(grip * 45))), M.leather, g, [0, top - grip * 0.04, 0]);
  for (const y of [top, bottom]) w.add(made(() => new THREE.CylinderGeometry(0.0225, 0.0225, 0.012, 14)), M.brass, g, [0, y, 0]);
  // the cross: a block over the blade's root, its quillons swept towards the blade, a finial on each
  w.add(made(() => new THREE.BoxGeometry(0.056, 0.03, 0.034)), M.steel, g, [0, 0.112, 0]);
  w.add(made(() => new THREE.ConeGeometry(0.018, 0.04, 4).rotateY(Math.PI / 4).scale(1, 1, 0.45)), M.steel, g, [0, 0.145, 0]);
  for (const side of [1, -1]) {
    const reach = [V(side * 0.026, 0.112), V(side * guard * 0.55, 0.114), V(side * guard * 0.9, 0.128), V(side * guard, 0.142)];
    w.add(made(() => taperTube(reach, (t) => 0.0115 * (1 - t * 0.35), 10, 8)), M.steel, g);
    w.add(made(() => new THREE.SphereGeometry(0.0135, 10, 8)), M.brass, g, [side * guard, 0.145, 0]);
  }
  // the pommel: a bevelled wheel facing the flats, a boss on each face, the tang peened over below it
  const wheel = bottom - 0.034;
  w.add(made(() => lathe([[0.001, -0.014], [0.026, -0.014], [0.035, -0.008], [0.037, 0], [0.035, 0.008], [0.026, 0.014], [0.001, 0.014]], 18).rotateX(Math.PI / 2)), M.steel, g, [0, wheel, 0]);
  for (const side of [1, -1]) w.add(rivet(0.014), M.brass, g, [0, wheel, side * 0.0135], [0, side > 0 ? 0 : Math.PI, 0]);
  w.add(made(() => new THREE.CylinderGeometry(0.007, 0.009, 0.012, 8)), M.steel, g, [0, wheel - 0.041, 0]);
}

/** a one-handed sword: a fullered blade 0.94 m long on a corded hilt */
export function sword(w: Sculpt, g: THREE.Group, M: WeaponMaterials): void {
  hilt(w, g, M, 0.2, 0.13);
  blade(w, g, M, 0.043, 0.94, 0.12);
}

/** a greatsword: a broad blade 1.34 m long on a long hilt for two hands, a ball at each end of its wide cross */
export function greatsword(w: Sculpt, g: THREE.Group, M: WeaponMaterials): void {
  hilt(w, g, M, 0.44, 0.24);
  blade(w, g, M, 0.06, 1.34, 0.13);
}

// --- axes ---

/** an axe head's rows from the top of its blade to its beard, and its columns from the socket out to the edge (shares
 *  of the way), the last band the bevel polished to the edge */
const HEAD_ROWS = 20;
const HEAD_ACROSS = [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.85, 0.93, 1];
const BEVEL_FROM = 6;

/** A point of a cubic curve. */
function cubic(p: THREE.Vector3[], t: number): THREE.Vector3 {
  const s = 1 - t;
  return p[0].clone().multiplyScalar(s * s * s)
    .addScaledVector(p[1], 3 * s * s * t)
    .addScaledVector(p[2], 3 * s * t * t)
    .addScaledVector(p[3], t * t * t);
}

/** The cutting edge of a bearded head, from its top corner round the bit to the beard's toe (the head's own frame:
 *  the haft's axis at x 0, its middle at y 0). */
const EDGE = [V(0.17, 0.128), V(0.24, 0.065), V(0.236, -0.095), V(0.132, -0.208)];

/** The front face of a bearded head: rows from the top of the blade (s 0) to the beard (s 1), each a curve from the
 *  socket out to the edge, bowed up below so the beard hooks back under the bit, and thinning to the edge. */
function headFace(): THREE.Vector3[][] {
  const rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= HEAD_ROWS; i++) {
    const s = i / HEAD_ROWS;
    const from = V(0.026, lerp(0.075, -0.07, s));
    const to = cubic(EDGE, s);
    const bow = V((from.x + to.x) / 2, (from.y + to.y) / 2 + 0.088 * s * s - 0.008 * (1 - s) * (1 - s));
    rows.push(HEAD_ACROSS.map((t) => {
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const thick = 0.0145 * Math.pow(1 - t, 1.25) + 0.0007;
      return V(a * from.x + b * bow.x + c * to.x, a * from.y + b * bow.y + c * to.y, thick);
    }));
  }
  return rows;
}

/** The strips round a flat piece's rim that close its face to its back (its rows going down, as an axe head's and a
 *  mace's flange's): along its first and last rows (steel), and along its rows' outer ends (the edge's polish). */
function rims(face: THREE.Vector3[][]): { steel: THREE.BufferGeometry[]; edge: THREE.BufferGeometry } {
  const behind = back(face);
  const last = face.length - 1;
  const ends = (rows: THREE.Vector3[][]) => rows.map((row) => row[row.length - 1]);
  return {
    steel: [surface([face[0], behind[0]], true), surface([face[last], behind[last]])],
    edge: surface([ends(face), ends(behind)], true),
  };
}

/** A bearded axe head on a haft through it at `at` (scaled `k`, its bit on the -X side when `side` is -1): its blade
 *  thinning from the socket to a polished bevel, the socket round the haft with a rivet each side top and bottom, a
 *  squared poll behind (`poll`), and langets riveted down the haft below it. */
function beardedHead(w: Sculpt, g: THREE.Group, M: WeaponMaterials, at: number, k: number, side: 1 | -1, poll: boolean): void {
  // (mirrored triangle by triangle: `mirrorX` takes a geometry unindexed)
  const turned = (geometry: THREE.BufferGeometry) => (side < 0 ? mirrorX(geometry.toNonIndexed()) : geometry);
  const place = (x: number, y: number, z = 0): [number, number, number] => [side * x * k, at + y * k, z * k];
  const face = skipping() ? [] : headFace();
  const piece = (build: () => THREE.BufferGeometry, material: THREE.Material) => {
    w.add(made(() => turned(build())), material, g, [0, at, 0], [0, 0, 0], k);
  };
  piece(() => surface(band(face, 0, BEVEL_FROM)), M.steel);
  piece(() => surface(band(back(face), 0, BEVEL_FROM), true), M.steel);
  piece(() => surface(band(face, BEVEL_FROM, HEAD_ACROSS.length - 1)), M.blade);
  piece(() => surface(band(back(face), BEVEL_FROM, HEAD_ACROSS.length - 1), true), M.blade);
  const closing = skipping() ? null : rims(face);
  for (const rim of [0, 1]) piece(() => closing!.steel[rim], M.steel);
  piece(() => closing!.edge, M.blade);
  // the socket round the haft, a rivet on each side above and below the haft's wedge
  w.add(made(() => new THREE.CylinderGeometry(0.031, 0.035, 0.17, 8).scale(1, 1, 0.82)), M.dark, g, place(0, 0), [0, Math.PI / 8, 0], k);
  for (const y of [0.045, -0.045]) {
    for (const z of [1, -1]) w.add(rivet(0.0065), M.brass, g, place(0, y, z * 0.0275), [0, z > 0 ? 0 : Math.PI, 0], k);
  }
  if (poll) {
    w.add(made(() => new THREE.BoxGeometry(0.048, 0.06, 0.042)), M.dark, g, place(-0.052, 0), [0, 0, 0], k);
    w.add(made(() => new THREE.BoxGeometry(0.012, 0.07, 0.05)), M.steel, g, place(-0.08, 0), [0, 0, 0], k);
  }
  // langets down the haft from the socket, riveted through it
  for (const z of [1, -1]) {
    w.add(made(() => new THREE.BoxGeometry(0.013, 0.15, 0.004)), M.steel, g, place(0, -0.16, z * 0.0235), [0, 0, 0], k);
    for (const y of [-0.13, -0.2]) w.add(rivet(0.0045), M.brass, g, place(0, y, z * 0.0255), [0, z > 0 ? 0 : Math.PI, 0], k);
  }
}

/** a one-handed axe: a bearded head with a poll on a shaped haft, swelled at its butt, its grip wrapped */
export function axe(w: Sculpt, g: THREE.Group, M: WeaponMaterials): void {
  const haft: [number, number][] = [
    [0.001, -0.176], [0.02, -0.173], [0.029, -0.162], [0.0305, -0.146], [0.026, -0.126], [0.022, -0.1], [0.0222, 0.2],
    [0.021, 0.5], [0.0195, 0.725], [0.012, 0.732], [0.001, 0.734],
  ];
  w.add(made(() => scaleUV(lathe(haft, 12), 1, 4)), M.wood, g);
  wrap(w, g, M, 0.12, -0.12, 0.0225, 7);
  beardedHead(w, g, M, 0.61, 1, 1, true);
  // the wedge spreading the haft's top in the socket
  w.add(made(() => new THREE.BoxGeometry(0.03, 0.008, 0.006)), M.steel, g, [0, 0.733, 0]);
}

/** a greataxe: two bearded heads, a spike between them, on a long haft wrapped for both hands */
export function greataxe(w: Sculpt, g: THREE.Group, M: WeaponMaterials): void {
  w.add(made(() => scaleUV(new THREE.CylinderGeometry(0.025, 0.028, 1.52, 12), 1, 4)), M.wood, g, [0, 0.34, 0]);
  w.add(made(() => lathe([[0.001, -0.47], [0.02, -0.465], [0.031, -0.448], [0.032, -0.43], [0.027, -0.415]], 12)), M.steel, g);
  wrap(w, g, M, 0.08, -0.38, 0.0265, 10);
  for (const side of [1, -1] as const) beardedHead(w, g, M, 0.9, 1.35, side, false);
  w.add(made(() => new THREE.ConeGeometry(0.028, 0.13, 6)), M.steel, g, [0, 1.17, 0]);
  w.add(ring(0.034, 0.03), M.brass, g, [0, 1.09, 0]);
}

// --- hafted weapons with heads of their own ---

/** the mace's head: where its flanges start and end up the haft, the height each comes to its point at and how far
 *  out, how many there are round it, and each flange's rows along either edge of its point */
const MACE_FROM = 0.555;
const MACE_TO = 0.735;
const MACE_POINT = 0.665;
const MACE_REACH = 0.085;
const FLANGES = 7;
const FLANGE_ROWS = 8;
/** a flange's columns from its root out to its edge (shares of the way), the last band the bevel polished to it */
const FLANGE_ACROSS = [0, 0.4, 0.78, 0.9, 1];
const FLANGE_BEVEL = 2;

/** the mace's turned parts, each a profile up the haft (radius, height): the socket the flanges stand on, the collar
 *  moulded below it, the finial on top and the pommel at the butt */
const SOCKET: [number, number][] = [
  [0.031, 0.552], [0.0315, 0.6], [0.0305, 0.69], [0.027, 0.722], [0.022, 0.738], [0.001, 0.742],
];
const COLLAR: [number, number][] = [[0.0215, 0.52], [0.028, 0.522], [0.034, 0.532], [0.036, 0.542], [0.033, 0.552], [0.031, 0.56]];
const FINIAL: [number, number][] = [
  [0.019, 0.738], [0.024, 0.744], [0.026, 0.751], [0.022, 0.758], [0.012, 0.762], [0.014, 0.768], [0.012, 0.778],
  [0.001, 0.79],
];
const POMMEL: [number, number][] = [
  [0.001, -0.168], [0.017, -0.165], [0.027, -0.157], [0.031, -0.145], [0.029, -0.134], [0.025, -0.127], [0.026, -0.115],
];

/** A profile's radius at height `y` (its points in order up it). */
function radiusAt(profile: [number, number][], y: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y <= y1) return lerp(r0, r1, clamp((y - y0) / (y1 - y0), 0, 1));
  }
  return profile[profile.length - 1][0];
}

/** The front face of a flange (in the XY plane, out along +X): rows from its top down to its foot, each from its
 *  root in the socket out to its edge, thinning to it. Below its point the edge sweeps back to the socket hollowed,
 *  above it too, so the two meet in a spur; each end is left a little wide, to be closed by its rims. */
function flangeFace(): THREE.Vector3[][] {
  const rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= FLANGE_ROWS * 2; i++) {
    const below = i <= FLANGE_ROWS;
    const u = below ? i / FLANGE_ROWS : (i - FLANGE_ROWS) / FLANGE_ROWS;
    const y = below ? lerp(MACE_FROM, MACE_POINT, u) : lerp(MACE_POINT, MACE_TO, u);
    const root = radiusAt(SOCKET, y) - 0.004;
    const out = below ? Math.pow(u, 1.7) : Math.pow(1 - u, 1.3);
    const edge = lerp(root + 0.008, MACE_REACH, out);
    rows.push(FLANGE_ACROSS.map((t) => V(lerp(root, edge, t), y, 0.0055 * Math.pow(1 - t, 1.2) + 0.0008)));
  }
  return rows.reverse();
}

/** A flange of `face` turned `a` round the haft: its flats steel, its bevel and edge polished. */
function flange(w: Sculpt, g: THREE.Group, M: WeaponMaterials, face: THREE.Vector3[][], a: number): void {
  const piece = (build: () => THREE.BufferGeometry, material: THREE.Material) => {
    w.add(made(build), material, g, [0, 0, 0], [0, a, 0]);
  };
  const last = FLANGE_ACROSS.length - 1;
  piece(() => surface(band(face, 0, FLANGE_BEVEL)), M.steel);
  piece(() => surface(band(back(face), 0, FLANGE_BEVEL), true), M.steel);
  piece(() => surface(band(face, FLANGE_BEVEL, last)), M.blade);
  piece(() => surface(band(back(face), FLANGE_BEVEL, last), true), M.blade);
  const closing = skipping() ? null : rims(face);
  for (const rim of [0, 1]) piece(() => closing!.steel[rim], M.steel);
  piece(() => closing!.edge, M.blade);
}

/** a flanged mace: seven flanges round a socket, each swept up to a point high on the head and polished along its
 *  edge, a turned finial on top and a moulded collar below, held to the haft by riveted langets; its grip wrapped,
 *  a steel pommel at its butt */
export function mace(w: Sculpt, g: THREE.Group, M: WeaponMaterials): void {
  const haft: [number, number][] = [
    [0.001, -0.128], [0.0235, -0.126], [0.024, 0.12], [0.0228, 0.35], [0.0215, 0.6], [0.001, 0.61],
  ];
  w.add(made(() => scaleUV(lathe(haft, 12), 1, 4)), M.wood, g);
  wrap(w, g, M, 0.12, -0.11, 0.024, 7);
  w.add(made(() => lathe(POMMEL, 14)), M.steel, g);
  // the head: the socket, its flanges, a brass ring under the finial and the collar below
  w.add(made(() => lathe(SOCKET, 14)), M.dark, g);
  const face = skipping() ? [] : flangeFace();
  for (let i = 0; i < FLANGES; i++) flange(w, g, M, face, (i / FLANGES) * Math.PI * 2);
  w.add(made(() => new THREE.CylinderGeometry(0.0235, 0.0235, 0.006, 14)), M.brass, g, [0, 0.737, 0]);
  w.add(made(() => lathe(FINIAL, 14)), M.steel, g);
  w.add(made(() => lathe(COLLAR, 14)), M.steel, g);
  // langets down the haft from the collar, two rivets through each
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * 0.0225, Math.sin(a) * 0.0225];
    w.add(made(() => new THREE.BoxGeometry(0.012, 0.13, 0.004)), M.steel, g, [x, 0.455, z], [0, Math.PI / 2 - a, 0]);
    for (const y of [0.49, 0.42]) w.add(rivet(0.0042), M.brass, g, [x * 1.09, y, z * 1.09], [0, Math.PI / 2 - a, 0]);
  }
}

/** the maul's head: its middle at this height on the haft, the half-length of its octagonal body along X, and the
 *  striking faces' depth beyond it */
const MAUL_AT = 0.99;
const MAUL_BODY = 0.15;
const MAUL_FACE = 0.054;

/** A maul's striking face at the end of its head on `side`: a flared, bevelled drum, and on it a knurl of pyramids
 *  (+X) or a boss (-X). */
function maulFace(w: Sculpt, g: THREE.Group, M: WeaponMaterials, side: 1 | -1): void {
  // (closed behind: open there, the sky showed through it past the octagon's flats, whose middles stand inside its ring)
  const profile: [number, number][] = [[0.001, 0], [0.092, 0], [0.104, 0.012], [0.108, 0.034], [0.101, 0.047], [0.07, 0.052], [0.001, 0.054]];
  const out = side * MAUL_BODY;
  w.add(made(() => lathe(profile, 16).rotateZ(-side * Math.PI / 2)), M.steel, g, [out, MAUL_AT, 0]);
  const face = out + side * MAUL_FACE;
  if (side > 0) {
    for (const y of [-0.028, 0, 0.028]) {
      for (const z of [-0.028, 0, 0.028]) {
        w.add(made(() => new THREE.ConeGeometry(0.012, 0.011, 4).rotateY(Math.PI / 4).rotateZ(-Math.PI / 2)), M.dark, g, [face + 0.004, MAUL_AT + y, z]);
      }
    }
  } else {
    w.add(made(() => new THREE.SphereGeometry(0.04, 14, 10).scale(0.35, 1, 1)), M.steel, g, [face, MAUL_AT, 0]);
  }
}

/** a maul: an octagonal drum head banded at its ends and engraved round its middle, a striking face at each end and
 *  a spike on top, held to the haft by riveted langets, on a haft wrapped for both hands with an iron cap at its butt */
export function maul(w: Sculpt, g: THREE.Group, M: WeaponMaterials): void {
  w.add(made(() => scaleUV(new THREE.CylinderGeometry(0.026, 0.029, 1.37, 12), 1, 4)), M.wood, g, [0, 0.235, 0]);
  w.add(made(() => lathe([[0.001, -0.506], [0.02, -0.5], [0.033, -0.482], [0.034, -0.466], [0.028, -0.452], [0.031, -0.442], [0.0295, -0.43]], 14)), M.steel, g);
  wrap(w, g, M, 0.07, -0.4, 0.029, 11);
  // the head: an octagonal body along X, banded near each end, engraved round its middle, riveted top and bottom
  const alongX: [number, number, number] = [0, 0, Math.PI / 2];
  const octagon = (r: number, length: number) => made(() => new THREE.CylinderGeometry(r, r, length, 8).rotateY(Math.PI / 8));
  w.add(octagon(0.092, MAUL_BODY * 2), M.dark, g, [0, MAUL_AT, 0], alongX);
  w.add(octagon(0.097, 0.075), M.engraved, g, [0, MAUL_AT, 0], alongX);
  for (const side of [1, -1] as const) {
    w.add(octagon(0.1, 0.03), M.steel, g, [side * (MAUL_BODY - 0.03), MAUL_AT, 0], alongX);
    maulFace(w, g, M, side);
    for (const y of [1, -1]) w.add(rivet(0.008), M.brass, g, [side * 0.026, MAUL_AT + y * 0.0985, 0], [y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]);
  }
  // a spike on top over the haft's end, and a collar where the haft goes into the head
  w.add(made(() => new THREE.ConeGeometry(0.03, 0.07, 4).rotateY(Math.PI / 4)), M.steel, g, [0, MAUL_AT + 0.122, 0]);
  w.add(ring(0.036, 0.022, 4), M.brass, g, [0, MAUL_AT + 0.093, 0], [0, Math.PI / 4, 0]);
  w.add(made(() => new THREE.CylinderGeometry(0.036, 0.042, 0.032, 12)), M.brass, g, [0, MAUL_AT - 0.105, 0]);
  // langets down the haft from the head, two rivets through each
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * 0.0285, Math.sin(a) * 0.0285];
    w.add(made(() => new THREE.BoxGeometry(0.014, 0.25, 0.005)), M.steel, g, [x, MAUL_AT - 0.24, z], [0, Math.PI / 2 - a, 0]);
    for (const y of [-0.17, -0.31]) w.add(rivet(0.0048), M.brass, g, [x * 1.08, MAUL_AT + y, z * 1.08], [0, Math.PI / 2 - a, 0]);
  }
}
