// The village's campfire's ring of stones: rounded field stones of a dozen sizes and colours laid round the bed, each
// lumpy in its own way, sooted on the side facing the flames and on its top toward them, darker where it sits in the
// earth, and a few split in two by the heat, their halves leaning apart. From play, the ring the biomes' bonfires
// share read as "flat grey boxes with a cross cut in them": nine copies of one faceted rock, the village's ashlar's
// blocks and joints mapped over it. One mesh, one draw, its colours a vertex's.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { valueNoise3 } from '../core/patterns';
import { boxUVs } from './props';
import { mulberry, TAU } from '../util';

/** the ring: how many stones, how far out their middles lie from the fire's (m), and how much either varies */
const RING = { count: 13, radius: 0.8, wander: 0.06 };
/** a stone's size (its radius, m, the least and the most) and its proportions (along the ring, up, across it) */
const SIZE = { least: 0.12, most: 0.22 };
const LONG = { least: 1.05, most: 1.55 };
const HIGH = { least: 0.55, most: 0.85 };
/** the stones split by the heat (their places in the ring), and the gap between a split stone's halves (m) */
const SPLIT = [2, 7, 11];
const SPLIT_GAP = 0.025;
/** the field stones' colours (linear RGB): greys, a warm brown, a bluish slate, an ochre, a dark basalt */
const STONE_COLOURS: readonly [number, number, number][] = [
  [0.26, 0.25, 0.23], [0.32, 0.3, 0.27], [0.22, 0.18, 0.14], [0.2, 0.21, 0.23], [0.3, 0.23, 0.14], [0.12, 0.12, 0.12],
  [0.38, 0.36, 0.32],
];
/** how dark the soot leaves the face toward the flames (a share of its own colour), and the earth at its foot */
const SOOT = 0.08;
const EARTHED = 0.55;
/** how far up the stone the earth's darkening reaches (m), and the soot's from the top down toward the fire */
const EARTH_UP = 0.035;

/**
 * A rounded stone about a unit across: an icosphere pushed in and out by two sizes of solid noise, smooth (its points
 * shared, so it shades round, not faceted), its foot flattened to sit on the ground; split along `split` (a unit
 * normal through its middle) into the half on that side, its cut face flat `SPLIT_GAP / 2` off the middle.
 */
function stoneShape(seed: number, split?: THREE.Vector3): THREE.BufferGeometry {
  const sphere = new THREE.IcosahedronGeometry(1, 3);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const g = mergeVertices(sphere);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const lump = valueNoise3(v.x * 1.3, v.y * 1.3, v.z * 1.3, seed) - 0.5;
    const knob = valueNoise3(v.x * 3.1, v.y * 3.1, v.z * 3.1, seed + 1) - 0.5;
    const pit = valueNoise3(v.x * 7, v.y * 7, v.z * 7, seed + 2) - 0.5;
    v.multiplyScalar(1 + 0.42 * lump + 0.16 * knob + 0.05 * pit);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.15;
    if (split) {
      const past = v.dot(split) - SPLIT_GAP / 2;
      if (past < 0) v.addScaledVector(split, -past);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** One stone of the ring as it lies: its shape scaled, turned along the ring and placed, in the world's frame. */
interface Laid { shape: THREE.BufferGeometry; matrix: THREE.Matrix4; colour: THREE.Color; split?: THREE.Vector3 }

/** The stone at place `k` of the ring round (x, z): one stone, or a split one's two halves. */
function layStone(k: number, x: number, z: number, rng: () => number): Laid[] {
  const angle = ((k + (rng() - 0.5) * 0.35) / RING.count) * TAU;
  const out = RING.radius + (rng() - 0.5) * 2 * RING.wander;
  const size = SIZE.least + (SIZE.most - SIZE.least) * rng() ** 1.4;
  const scale = new THREE.Vector3(
    size * (LONG.least + (LONG.most - LONG.least) * rng()), size * (HIGH.least + (HIGH.most - HIGH.least) * rng()), size,
  );
  const base = STONE_COLOURS[Math.floor(rng() * STONE_COLOURS.length)];
  const shade = 0.85 + rng() * 0.3;
  const colour = new THREE.Color(base[0] * shade, base[1] * shade, base[2] * shade);
  // (laid along the ring, a little askew, tipped a little, sunk to sit in the earth)
  const turn = new THREE.Euler((rng() - 0.5) * 0.25, -angle + Math.PI / 2 + (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.25);
  const at = new THREE.Vector3(x + Math.cos(angle) * out, scale.y * 0.3, z + Math.sin(angle) * out);
  const seed = 101 + k * 7;
  if (!SPLIT.includes(k)) {
    const matrix = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(turn), scale);
    return [{ shape: stoneShape(seed), matrix, colour }];
  }
  // (split across the ring, near upright: each half leaning off the crack a little)
  const across = new THREE.Vector3(1, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.5).normalize();
  return [1, -1].map((side) => {
    const half = across.clone().multiplyScalar(side);
    const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -side), 0.06 + rng() * 0.05);
    const turned = new THREE.Quaternion().setFromEuler(turn).multiply(lean);
    const matrix = new THREE.Matrix4().compose(at, turned, scale);
    return { shape: stoneShape(seed, half), matrix, colour, split: half };
  });
}

/** A laid stone in the world's frame: smooth normals, box-mapped uvs in metres, its colours soot and earth. */
function finish(laid: Laid, fire: THREE.Vector3, rng: () => number): THREE.BufferGeometry {
  const g = laid.shape;
  // (the crack darkened before it's placed, in the stone's own frame: the cut face and the rim round it)
  const inCrack = new Float32Array(g.attributes.position.count);
  if (laid.split) {
    const v = new THREE.Vector3();
    for (let i = 0; i < inCrack.length; i++) {
      v.fromBufferAttribute(g.attributes.position, i);
      inCrack[i] = 1 - THREE.MathUtils.smoothstep(v.dot(laid.split) - SPLIT_GAP / 2, 0, 0.12);
    }
  }
  g.applyMatrix4(laid.matrix);
  g.computeVertexNormals();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const colours = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const toFire = new THREE.Vector3();
  const salt = Math.floor(rng() * 1000);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    normal.fromBufferAttribute(n, i);
    toFire.set(fire.x - v.x, 0, fire.z - v.z).normalize();
    // (soot on the face toward the flames, and over the top on that side; patchy, as smoke leaves it)
    const facing = Math.max(0, normal.dot(toFire));
    const topToward = Math.max(0, normal.y) * Math.max(0, toFire.dot(new THREE.Vector3(normal.x, 0, normal.z).normalize()) + 0.3);
    const patch = valueNoise3(v.x * 9, v.y * 9, v.z * 9, salt);
    const soot = Math.min(1, (facing ** 0.7 + topToward * 0.9) * (0.7 + 0.6 * patch));
    const earth = 1 - THREE.MathUtils.smoothstep(v.y, 0, EARTH_UP);
    const grain = 0.75 + 0.5 * valueNoise3(v.x * 23, v.y * 23, v.z * 23, salt + 1);
    const lit = grain * THREE.MathUtils.lerp(1, SOOT, soot * 0.9) * THREE.MathUtils.lerp(1, EARTHED, earth)
      * THREE.MathUtils.lerp(1, 0.25, inCrack[i]);
    colours[i * 3] = laid.colour.r * lit;
    colours[i * 3 + 1] = laid.colour.g * lit;
    colours[i * 3 + 2] = laid.colour.b * lit;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const flat = g.toNonIndexed();
  g.dispose();
  flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
  boxUVs(flat);
  return flat;
}

/** The ring of stones round the fire at (x, z), as one mesh in `material` (coloured by its vertices). */
export function fireRing(x: number, z: number, material: THREE.Material): THREE.Mesh {
  const rng = mulberry(4242);
  const fire = new THREE.Vector3(x, 0, z);
  const stones: THREE.BufferGeometry[] = [];
  for (let k = 0; k < RING.count; k++) {
    for (const laid of layStone(k, x, z, rng)) stones.push(finish(laid, fire, rng));
  }
  const ring = new THREE.Mesh(mergeGeometries(stones), material);
  for (const stone of stones) stone.dispose();
  ring.name = 'campfire stones';
  ring.castShadow = ring.receiveShadow = true;
  return ring;
}
