// The Strawman's scarecrow (combat/skills/strawman.ts), as its icon draws it: a rough post and cross arm braced by two
// stakes, an old olive coat patched and belted with rope, straw tied off at the cuffs and spilling from the neck and
// the hem, a stuffed sack for a head with a stitched smile, under a frayed straw hat with a red band. Its geometry and
// materials are made once and shared by every cast: a cast is five meshes on them (the body's wood, cloth and straw;
// the head's cloth and straw, on a joint of its own so it lolls under a blow).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { burlap, pbrMaterialMaps, wood } from '../../core/textures';
import { mulberry } from '../../util';

type RGB = readonly [number, number, number];
const rgb = (hex: number): RGB => new THREE.Color(hex).toArray() as unknown as RGB;
/** the burlap's own colour (core/pbr.ts, about its mean): a cloth's colour is given as what it reads over it */
const BURLAP = rgb(0x7e6641);
const dyed = (hex: number): RGB => { const c = rgb(hex); return [c[0] / BURLAP[0], c[1] / BURLAP[1], c[2] / BURLAP[2]]; };

const STRAW = 0xd8c072, ROPE = rgb(0x8a6f48), THREAD = rgb(0x2a2015);
const SACK = dyed(0xb9a273), COAT = dyed(0x66703c), LINING = dyed(0x7d8550), HAT = dyed(0xb99c58), BAND = dyed(0x9a3626);
const PATCHES = [dyed(0xa98c58), dyed(0x8d4a2c), dyed(0x4d5560)];
const WOOD: RGB = [0.8, 0.74, 0.68];

/** where the head's joint is on the post (m), and its sack's radius */
const HEAD_Y = 1.66, HEAD_R = 0.172, HEAD_DEEP = 0.93;
/** the cross arm's height, and where a sleeve is tied off along it */
const ARM_Y = 1.36, CUFF = 0.517;

const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3(), _turn = new THREE.Quaternion();

/** `g` in `colour`, each vertex a shade of its own within `vary` of it. */
function paint(g: THREE.BufferGeometry, colour: RGB, rng: () => number, vary = 0.06): THREE.BufferGeometry {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 - vary + rng() * vary * 2;
    a[i * 3] = colour[0] * k; a[i * 3 + 1] = colour[1] * k; a[i * 3 + 2] = colour[2] * k;
  }
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

/** A skin over `rings`, each a loop of as many points (its seam's point given twice), its weave `across` by `along`. */
function skin(rings: THREE.Vector3[][], across: number, along: number): THREE.BufferGeometry {
  const n = rings[0].length, position: number[] = [], uv: number[] = [], index: number[] = [];
  rings.forEach((ring, j) => ring.forEach((p, i) => {
    position.push(p.x, p.y, p.z);
    uv.push(i / (n - 1) * across, j / (rings.length - 1) * along);
  }));
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const a = j * n + i, b = a + n;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** One straw from `from` along `dir`, tapering, its own shade of straw. */
function straw(rng: () => number, from: THREE.Vector3, dir: THREE.Vector3, length: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.002, 0.0055, length, 3, 1, true).translate(0, length / 2, 0);
  g.applyQuaternion(_turn.setFromUnitVectors(UP, _dir.copy(dir).normalize())).translate(from.x, from.y, from.z);
  // (most of it gold, a stalk in five gone grey or green)
  const c = new THREE.Color(STRAW).multiplyScalar(0.62 + 0.5 * rng()), odd = rng();
  if (odd < 0.1) c.lerp(new THREE.Color(0x8c8a5a), 0.6); else if (odd < 0.2) c.lerp(new THREE.Color(0x9c7a44), 0.6);
  return paint(g, c.toArray() as unknown as RGB, rng, 0);
}

/**
 * A sheaf of `count` straws standing up from a disc `radius` wide at the origin, `length[0]` to `length[1]` long,
 * leaning out `splay` (rad) the further out each stands (the training dummy's bundle, `dummy.ts`, in thicker stalks
 * of their own colours: this one is seen from the fight's camera).
 */
function sheaf(rng: () => number, count: number, radius: number, length: [number, number], splay: number): THREE.BufferGeometry {
  const straws: THREE.BufferGeometry[] = [], from = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, out = Math.sqrt(rng()), lean = splay * out + (rng() - 0.5) * 0.2;
    from.set(Math.cos(a) * radius * out, 0, Math.sin(a) * radius * out);
    dir.set(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    straws.push(straw(rng, from, dir, length[0] + (length[1] - length[0]) * rng()));
  }
  return mergeGeometries(straws);
}

/**
 * A fringe of `count` straws round an ellipse `rx` by `rz` at height `y`, each leaning `lean` (rad) out from straight
 * up (past a quarter turn it hangs), none within `gap` (rad) of its front.
 */
function fringe(rng: () => number, count: number, y: number, rx: number, rz: number, lean: number, length: [number, number],
  gap = 0): THREE.BufferGeometry {
  const straws: THREE.BufferGeometry[] = [], from = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = gap + (i + rng()) / count * (Math.PI - gap) * 2, l = lean + (rng() - 0.5) * 0.5, round = a + (rng() - 0.5) * 0.5;
    from.set(Math.sin(a) * rx, y + (rng() - 0.5) * 0.03, Math.cos(a) * rz);
    dir.set(Math.sin(round) * Math.sin(l), Math.cos(l), Math.cos(round) * Math.sin(l));
    straws.push(straw(rng, from, dir, length[0] + (length[1] - length[0]) * rng()));
  }
  return mergeGeometries(straws);
}

/** the coat's rings from its neck to its hem: height, half width, half depth */
const COAT_RINGS: readonly (readonly [number, number, number])[] = [
  [1.475, 0.075, 0.07], [1.44, 0.17, 0.105], [1.37, 0.225, 0.14], [1.24, 0.215, 0.145], [1.1, 0.185, 0.13],
  [1.0, 0.16, 0.118], [0.93, 0.2, 0.15], [0.82, 0.255, 0.19], [0.7, 0.295, 0.22],
];

/** The coat's surface `a` round it (rad, 0 its front) at height `y`, `off` m out from the cloth. */
function coatAt(a: number, y: number, off = 0, to = new THREE.Vector3()): THREE.Vector3 {
  let j = 0;
  while (j + 2 < COAT_RINGS.length && COAT_RINGS[j + 1][0] > y) j++;
  const [y0, x0, z0] = COAT_RINGS[j], [y1, x1, z1] = COAT_RINGS[j + 1];
  const t = THREE.MathUtils.clamp((y0 - y) / (y0 - y1), 0, 1);
  // stuffed unevenly, and hanging in folds below the belt
  const folds = THREE.MathUtils.clamp((1 - y) / 0.25, 0, 1);
  const k = 1 + 0.045 * Math.sin(a * 3 + y * 7) * Math.sin(a * 2 - y * 11 + 1) + folds * 0.085 * Math.sin(a * 7 + 0.6);
  const rx = (x0 + (x1 - x0) * t) * k + off, rz = (z0 + (z1 - z0) * t) * k + off;
  return to.set(Math.sin(a) * rx, y, Math.cos(a) * rz);
}

/** The sack's radius at `y` from the head's joint: the stuffed head, the neck tied in, the sack's mouth below it. */
const SACK_PROFILE: readonly (readonly [number, number])[] = [
  [0.125, -0.285], [0.1, -0.24], [0.062, -0.19], [0.058, -0.175], [0.11, -0.14], [0.152, -0.08], [HEAD_R, 0],
  [0.166, 0.07], [0.135, 0.14], [0.075, 0.185], [0.001, 0.2],
];

/** A piece `g` laid on the face `x` across and `y` up from the head's joint, turned `roll` in the face's plane. */
function onFace(g: THREE.BufferGeometry, x: number, y: number, roll = 0, off = 0.006): THREE.BufferGeometry {
  let j = 0;
  while (j + 2 < SACK_PROFILE.length && SACK_PROFILE[j + 1][1] < y) j++;
  const [r0, y0] = SACK_PROFILE[j], [r1, y1] = SACK_PROFILE[j + 1];
  const r = r0 + (r1 - r0) * (y - y0) / (y1 - y0) + off, turn = x / r;
  _dir.set(Math.sin(turn), (r0 - r1) / (y1 - y0) * 0.8, Math.cos(turn) * HEAD_DEEP).normalize();
  return g.rotateZ(roll).applyQuaternion(_turn.setFromUnitVectors(FORWARD, _dir))
    .translate(Math.sin(turn) * r, y, Math.cos(turn) * r * HEAD_DEEP);
}

interface Parts {
  wood: THREE.BufferGeometry; cloth: THREE.BufferGeometry; straw: THREE.BufferGeometry;
  headCloth: THREE.BufferGeometry; headStraw: THREE.BufferGeometry;
  /** its solid shapes alone as one piece, for the glow of where it would stand */
  outline: THREE.BufferGeometry;
  woodMat: THREE.Material; clothMat: THREE.Material; strawMat: THREE.Material;
}
let parts: Parts | null = null;

/** Its pieces merged into one geometry (every piece has a position, a normal, a uv and a colour). */
const merged = (pieces: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(pieces.map((g) => (g.index ? g.toNonIndexed() : g)));

function build(): Parts {
  const rng = mulberry(7);
  const woods: THREE.BufferGeometry[] = [], cloths: THREE.BufferGeometry[] = [], straws: THREE.BufferGeometry[] = [];
  const headCloths: THREE.BufferGeometry[] = [], headStraws: THREE.BufferGeometry[] = [];
  const TAU = Math.PI * 2;

  // the frame: a post and a cross arm, roughly cut (no two of their sides alike), two stakes bracing the post's foot
  const rough = (g: THREE.BufferGeometry, by: number) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + by * Math.sin(p.getY(i) * 9 + Math.atan2(p.getZ(i), p.getX(i)) * 2);
      p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  woods.push(paint(rough(new THREE.CylinderGeometry(0.05, 0.066, 1.85, 7, 6), 0.1).translate(0, 0.725, 0), WOOD, rng, 0.12));
  woods.push(paint(rough(new THREE.CylinderGeometry(0.034, 0.042, 1.5, 6, 4), 0.1).rotateZ(Math.PI / 2 + 0.03).translate(0, ARM_Y, -0.01), WOOD, rng, 0.12));
  for (const s of [1, -1]) {
    woods.push(paint(new THREE.CylinderGeometry(0.02, 0.03, 0.56, 5).rotateX(s * 0.55).rotateY(0.5).translate(-s * 0.075, 0.18, -s * 0.125), WOOD, rng, 0.15));
  }
  straws.push(paint(new THREE.TorusGeometry(0.068, 0.013, 5, 12).rotateX(Math.PI / 2 + 0.12).translate(0, 0.37, 0), ROPE, rng, 0.15));
  straws.push(paint(new THREE.TorusGeometry(0.067, 0.013, 5, 12).rotateX(Math.PI / 2 - 0.1).translate(0, 0.4, 0), ROPE, rng, 0.15));

  // the coat: stuffed, belted in, its hem torn
  const SEG = 24;
  const coat = COAT_RINGS.map(([y]) => Array.from({ length: SEG + 1 }, (_, i) => coatAt(i % SEG / SEG * TAU, y)));
  const hem = coat[coat.length - 1];
  for (let i = 0; i < SEG; i++) hem[i].y += i % 3 === 0 ? -0.04 - 0.07 * rng() : (rng() - 0.3) * 0.07;
  hem[SEG].copy(hem[0]);
  cloths.push(paint(skin(coat, 4, 2.4), COAT, rng, 0.07));
  // its collar: two torn lapels turned out over the chest
  for (const s of [1, -1]) {
    const lapel = [[0.35, 1.47], [1.25, 1.44], [0.9, 1.36], [0.5, 1.37], [0.3, 1.25], [0.12, 1.36]]
      .map(([a, y]) => coatAt(s * a, y, 0.012 + (1.47 - y) * 0.08));
    const g = new THREE.BufferGeometry().setFromPoints(lapel);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(lapel.flatMap((p) => [p.x * 3, p.y * 3]), 2));
    g.setIndex([0, 3, 5, 0, 1, 3, 1, 2, 3, 3, 4, 5]);
    g.computeVertexNormals();
    cloths.push(paint(g, LINING, rng, 0.06));
  }
  // patches sewn on where it wore through, each with its stitches
  const PATCH: readonly (readonly [number, number, number, number, number])[] = [
    [0.55, 1.18, 0.5, 0.13, 0.25], [-0.7, 0.86, 0.45, 0.12, -0.2], [2.6, 1.22, 0.55, 0.14, 0.15], [3.9, 0.88, 0.42, 0.11, -0.3],
  ];
  PATCH.forEach(([a0, y0, wide, tall, skew], n) => {
    const at = (u: number, v: number, off: number) => coatAt(a0 + (u - 0.5) * wide + (v - 0.5) * skew, y0 + (v - 0.5) * tall, off);
    const rows = [0, 0.5, 1].map((v) => [0, 0.25, 0.5, 0.75, 1].map((u) => at(u, v, 0.007)));
    cloths.push(paint(skin(rows, 0.6, 0.4), PATCHES[n % PATCHES.length], rng, 0.05));
    for (let k = 0; k < 10; k++) {
      // (round its edge: along the top and bottom, then up the sides)
      const side = k < 6 ? [(k % 3 + 0.5) / 3, k < 3 ? 0.04 : 0.96] : [k < 8 ? 0.04 : 0.96, (k % 2 + 0.5) / 2];
      const p = at(side[0], side[1], 0.011);
      const stitch = new THREE.BoxGeometry(0.008, 0.034, 0.006).rotateZ(k < 6 ? 0.25 : Math.PI / 2 - 0.25);
      stitch.applyQuaternion(_turn.setFromUnitVectors(FORWARD, _dir.set(p.x, 0, p.z).normalize())).translate(p.x, p.y, p.z);
      straws.push(paint(stitch, THREAD, rng, 0));
    }
  });
  // buttons down its front (one lost)
  for (const y of [1.27, 1.16, 0.9]) {
    const p = coatAt(0, y, 0.008);
    straws.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateX(Math.PI / 2).translate(p.x, p.y, p.z), rgb(0x3a2a1c), rng, 0.1));
  }
  // a rope for a belt, knotted in front with its ends hanging
  const belt = new THREE.CatmullRomCurve3(Array.from({ length: 20 }, (_, i) => coatAt(i / 20 * TAU, 1.005 + 0.012 * Math.sin(i / 20 * TAU * 2), 0.012)), true);
  straws.push(paint(new THREE.TubeGeometry(belt, 40, 0.014, 5, true), ROPE, rng, 0.18));
  const knot = coatAt(0.35, 1.0, 0.02);
  straws.push(paint(new THREE.SphereGeometry(0.026, 7, 5).translate(knot.x, knot.y, knot.z), ROPE, rng, 0.18));
  for (const [dx, drop] of [[0.02, 0.2], [-0.035, 0.15]]) {
    const end = new THREE.CatmullRomCurve3([knot.clone(), coatAt(0.35 + dx * 3, 1.0 - drop * 0.5, 0.03), coatAt(0.35 + dx * 5, 1.0 - drop, 0.022)]);
    straws.push(paint(new THREE.TubeGeometry(end, 6, 0.012, 5), ROPE, rng, 0.18));
  }

  // the sleeves along the cross arm, sagging under it, each tied off at the cuff with the straw bursting out past it
  const SLEEVE: readonly (readonly [number, number, number])[] = [
    [0.14, 0.085, 0], [0.26, 0.086, 0.035], [0.38, 0.082, 0.06], [0.47, 0.07, 0.035], [CUFF - 0.006, 0.044, 0], [CUFF + 0.012, 0.047, 0], [0.575, 0.078, 0],
  ];
  for (const s of [1, -1]) {
    const rings = SLEEVE.map(([x, r, sag], j) => Array.from({ length: 13 }, (_, i) => {
      const b = i % 12 / 12 * TAU, fold = 1 + 0.07 * Math.sin(b * 5 + x * 22 + s);
      const torn = j === SLEEVE.length - 1 ? (rng() - 0.5) * 0.03 : 0;
      return new THREE.Vector3(s * (x + torn), ARM_Y + Math.cos(b) * r * fold + Math.min(0, Math.cos(b)) * sag, s * Math.sin(b) * r * fold);
    }));
    const last = rings[rings.length - 1]; last[12].copy(last[0]);
    cloths.push(paint(skin(rings, 2, 1.6), COAT, rng, 0.07));
    straws.push(paint(new THREE.TorusGeometry(0.047, 0.012, 5, 12).rotateY(Math.PI / 2).translate(s * (CUFF + 0.003), ARM_Y, 0), ROPE, rng, 0.15));
    // (a solid heart to the sheaf, so it reads as a bundle from the fight's camera)
    straws.push(paint(new THREE.CylinderGeometry(0.028, 0.05, 0.15, 8, 1, true).rotateZ(-s * Math.PI / 2).translate(s * (CUFF + 0.085), ARM_Y, 0), rgb(0xa8914e), rng, 0.2));
    straws.push(sheaf(rng, 110, 0.045, [0.1, 0.24], 0.38).rotateZ(-s * Math.PI / 2).translate(s * (CUFF + 0.01), ARM_Y, 0));
  }

  // straw: a sheaf's butt hanging below the hem round the post, loose stalks round it, a ruff of it at the neck and
  // a tuft out of the collar
  const butt = Array.from({ length: 3 }, (_, j) => Array.from({ length: 13 }, (_, i) => {
    const a = i % 12 / 12 * TAU, r = [0.2, 0.16, 0.11][j] * (1 + 0.12 * Math.sin(a * 5 + j));
    return new THREE.Vector3(Math.sin(a) * r, [0.82, 0.68, 0.56][j] + (j === 2 ? 0.05 * Math.sin(a * 4) : 0), Math.cos(a) * r * 0.8);
  }));
  straws.push(paint(skin(butt, 1, 1), rgb(0x9c8647), rng, 0.2));
  straws.push(fringe(rng, 170, 0.76, 0.24, 0.18, 2.85, [0.12, 0.3]));
  straws.push(fringe(rng, 60, 1.455, 0.068, 0.06, 0.55, [0.05, 0.11]));
  straws.push(sheaf(rng, 24, 0.025, [0.05, 0.1], 0.6).rotateX(0.75).translate(0, 1.43, 0.06));

  // the head: a stuffed sack tied at the neck, lumpy, its mouth ragged over the collar
  const sack = new THREE.LatheGeometry(SACK_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 18).scale(1, 1, HEAD_DEEP);
  const sp = sack.attributes.position, suv = sack.attributes.uv;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const k = y > -0.15 ? 1 + 0.035 * Math.sin(x * 23 + 1) * Math.sin(y * 19 + 2) + 0.02 * Math.sin(z * 31 + y * 9)
      : y < -0.25 ? 1 + 0.16 * Math.sin(Math.atan2(x, z) * 6) : 1;
    sp.setXYZ(i, x * k, y < -0.25 ? y + 0.03 * Math.sin(Math.atan2(x, z) * 4 + 1) : y, z * k);
    suv.setXY(i, suv.getX(i) * 2.5, suv.getY(i) * 1.2);
  }
  sack.computeVertexNormals();
  headCloths.push(paint(sack, SACK, rng, 0.06));
  headStraws.push(paint(new THREE.TorusGeometry(0.066, 0.015, 5, 14).rotateX(Math.PI / 2).translate(0, -0.182, 0), ROPE, rng, 0.15));
  // its face: one eye a button sewn on with a cross, the other only the cross, and a wide stitched smile
  const thread = (g: THREE.BufferGeometry, x: number, y: number, roll: number, off?: number) => headStraws.push(paint(onFace(g, x, y, roll, off), THREAD, rng, 0));
  headStraws.push(paint(onFace(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 10).rotateX(Math.PI / 2), 0.066, 0.005), rgb(0x3a2a1c), rng, 0.08));
  for (const roll of [0.7, -0.7]) {
    headStraws.push(paint(onFace(new THREE.BoxGeometry(0.04, 0.008, 0.006), 0.066, 0.005, roll, 0.014), rgb(0xb9a273), rng, 0));
    thread(new THREE.BoxGeometry(0.075, 0.015, 0.008), -0.064, 0, roll);
  }
  const smile = (x: number) => -0.108 + 0.05 * (x / 0.1) ** 2;
  for (let i = 0; i < 8; i++) {
    const x0 = -0.1 + i * 0.025, x1 = x0 + 0.025, xm = (x0 + x1) / 2;
    thread(new THREE.BoxGeometry(0.034, 0.013, 0.008), xm, (smile(x0) + smile(x1)) / 2, Math.atan2(smile(x1) - smile(x0), 0.025));
    if (i > 0) thread(new THREE.BoxGeometry(0.01, 0.042, 0.008), x0, smile(x0), Math.atan2(smile(x1) - smile(x0), 0.025) * 0.6);
  }
  // straw for hair under the hat
  headStraws.push(fringe(rng, 70, 0.13, 0.125, 0.115, 2.6, [0.06, 0.13], 1.1));

  // the hat: woven straw, its crown slumped to one side, its brim wavy and frayed, a red band round it; worn nearly level
  const hat: THREE.BufferGeometry[] = [], hatStraw: THREE.BufferGeometry[] = [];
  const BRIM = 0.34;
  const shape = new THREE.LatheGeometry([[BRIM, -0.03], [0.29, -0.012], [0.22, 0], [0.172, 0.01], [0.165, 0.03], [0.155, 0.1], [0.122, 0.175], [0.066, 0.222], [0.001, 0.238]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 20);
  const hp = shape.attributes.position, huv = shape.attributes.uv;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), r = Math.hypot(x, z), a = Math.atan2(x, z);
    const out = THREE.MathUtils.clamp((r - 0.17) / (BRIM - 0.17), 0, 1), up = THREE.MathUtils.clamp((y - 0.08) / 0.16, 0, 1);
    // (the brim's edge: in and out, a bite gone from it)
    const edge = y < 0.02 ? 1 + out * out * (0.07 * Math.sin(a * 5 + 1) - (Math.abs(a - 2.2) < 0.2 ? 0.2 : 0)) : 1;
    hp.setXYZ(i, x * edge + 0.06 * up * up, y + (y < 0.02 ? out * 0.035 * Math.sin(a * 3 + 0.5) : -0.02 * up * up), z * edge + 0.02 * up * up);
    huv.setXY(i, huv.getX(i) * 3, huv.getY(i) * 1.5);
  }
  shape.computeVertexNormals();
  hat.push(paint(shape, HAT, rng, 0.1));
  hat.push(paint(new THREE.CylinderGeometry(0.162, 0.171, 0.05, 20, 1, true).translate(0, 0.055, 0), BAND, rng, 0.06));
  // frayed straws out of the brim's edge, rooted on the edge as it was cut (the lathe's first ring, each column's first
  // point): on a round of their own, the wave and the bite in it left them hanging in the air off the brim
  const rim = Array.from({ length: 21 }, (_, i) => new THREE.Vector3().fromBufferAttribute(hp, i * 9));
  const inner = Array.from({ length: 21 }, (_, i) => new THREE.Vector3().fromBufferAttribute(hp, i * 9 + 1));
  const from = new THREE.Vector3(), dir = new THREE.Vector3(), back = new THREE.Vector3();
  for (let i = 0; i < 70; i++) {
    const k = Math.floor(rng() * 20), t = rng();
    from.lerpVectors(rim[k], rim[k + 1], t);
    // (on along the brim's own slope there, from a little in from its edge, each a little off it)
    back.lerpVectors(inner[k], inner[k + 1], t);
    dir.subVectors(from, back).normalize();
    from.addScaledVector(dir, -0.008);
    dir.add(_dir.set((rng() - 0.5) * 0.5, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.5));
    hatStraw.push(straw(rng, from, dir, 0.03 + rng() * 0.04));
  }
  const worn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.13, 0, 0.05)).setPosition(0, 0.125, -0.02);
  for (const g of hat) headCloths.push(g.applyMatrix4(worn));
  for (const g of hatStraw) headStraws.push(g.applyMatrix4(worn));

  const clothMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(burlap(), 1, 1.4), vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  // (drawn from both sides as the cloth is, so the two are one program)
  const woodMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), [1, 2], 1.2), vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const strawMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const made = {
    wood: merged(woods), cloth: merged(cloths), straw: merged(straws), headCloth: merged(headCloths), headStraw: merged(headStraws),
  };
  const outline = mergeGeometries([made.wood, made.cloth, made.headCloth.clone().translate(0, HEAD_Y, 0)]);
  return { ...made, outline, woodMat, clothMat, strawMat };
}

/** The glow of where it would stand: its wood and cloth as one piece (its straws, each a glow, added up to a glare). */
export function scarecrowOutline(): THREE.BufferGeometry {
  return (parts ??= build()).outline;
}

export interface Scarecrow {
  /** standing on the ground at its origin, facing +z */
  root: THREE.Group;
  /** its head's joint, on the post's top */
  head: THREE.Group;
}

/** A scarecrow: new meshes on the geometries and materials every one shares (nothing of it is to be disposed). */
export function buildScarecrow(): Scarecrow {
  const p = parts ??= build();
  const root = new THREE.Group(), head = new THREE.Group();
  root.name = 'strawman';
  head.position.y = HEAD_Y;
  const mesh = (name: string, g: THREE.BufferGeometry, m: THREE.Material, on: THREE.Object3D, casts: boolean) => {
    const made = new THREE.Mesh(g, m);
    made.name = `strawman-${name}`; made.castShadow = casts;
    on.add(made);
  };
  mesh('wood', p.wood, p.woodMat, root, true);
  mesh('cloth', p.cloth, p.clothMat, root, true);
  mesh('straw', p.straw, p.strawMat, root, false);
  mesh('head', p.headCloth, p.clothMat, head, true);
  mesh('head-straw', p.headStraw, p.strawMat, head, false);
  root.add(head);
  return { root, head };
}
