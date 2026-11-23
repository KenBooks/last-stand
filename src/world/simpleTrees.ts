// The simple tree (`simpleTrees` in data/quality.ts): a tree's model made anew of a few pieces, for the levels that
// draw it in place of the grown one. Its trunk is the grown trunk's own, a few rings of a few sides, its first limbs
// each a three-sided taper, its twigs gone. Its crown, on Low, a few leafy lumps where the grown tree's leaf cards stood,
// each a coarse ball with a few big cards round it for a ragged edge (`simpleCrown`); on Very low a cartoon tree's, a
// few big clumps pushed out into rounded puffs in flat tones of the leaves' colour (`cartoonCrown`). Each is drawn in
// the grown tree's own bark and leaf materials, so a quality switches it live by a swap of geometry, no program made,
// and the tree stands where it stood: its trunk, which a body and an arrow meet, is the grown one's.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry, TAU } from '../util';
import type { TreeKind } from './ezTrees';
import type { SimpleTrees } from '../data/quality';
import { leafClusterTones } from './foliage';
import { lumpy } from './props';

/** the rings kept up a branch and the sides round it: the trunk's, a first limb's */
const TRUNK = { rings: 4, round: 5 };
const LIMB = { rings: 3, round: 3 };

/** Low's crown: its lumps, how many, each ball's detail (an icosahedron's: 0 is 20 faces, 1 is 80) and how lumpy, the
 *  cards round each and their size against the lump's */
const CROWN = { lumps: 8, detail: 0, lumpy: 0.12, cards: 2, card: 1.3 };
/** a lump's size by its leaves' spread about its middle (their root mean square, across and up), and by a card's
 *  reach, its least height of its width, and how far it's gathered in towards the crown's middle and lifted (of its
 *  height): Low's lumps where their leaves stood */
const LUMP: LumpShape = { across: 1.15, up: 1.6, card: 0.3, flattest: 0.6, gather: 0, lift: 0 };
/** how far from the middle of the leaves' picture a Low lump's face lies, and how far its own middle wanders: the
 *  picture is leaves all through about that far out (`paintCluster` in foliage.ts: a disc 0.37 of it) */
const FACE_UV = { reach: 0.24, wander: 0.05 };
/** Very low's cartoon crown: its clumps, how many, and each one's ball (an icosahedron's detail: 2 is 180 faces), and
 *  each clump's shape as `LUMP`'s, gathered into one canopy (a sapling's stood up its trunk as a stack of pancakes) */
const CARTOON = { lumps: 3, detail: 2 };
const CARTOON_LUMP: LumpShape = { across: 1.4, up: 1.5, card: 0.3, flattest: 0.85, gather: 0.4, lift: 0.15 };
/** a clump's puffs: how many round it besides the one on top and how far up they lean (radians), how far in its faces
 *  rest between them and how far out a puff bulges (of the clump's size), and how sharply (the power of a face's
 *  closeness to its puff's way: higher, rounder puffs and deeper creases) */
const PUFF = { round: 5, up: [-0.1, 0.55], rest: 0.66, bulge: 0.44, sharp: 5 };
/** a crown's tones (`leafClusterTones`: how many, the darkest and brightest of the leaves' fill), and how much of a
 *  face's tone is its puff's bulge there against how much it faces up, and the span of that the tones are spread over
 *  (under its first the darkest, over its last the brightest: more of both, a crisper cartoon's shading) */
const TONES = { count: 4, darkest: 0.45, brightest: 1, byBulge: 0.75, spread: [0.2, 0.85] };
/** the rounds the leaves are sorted into clumps (k-means) */
const SORT_ROUNDS = 8;

/** `n` of `count` steps, evenly from the first to the last (fewer where there aren't as many). */
function spread(count: number, n: number): number[] {
  if (count <= n) return [...Array(count).keys()];
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round((i * (count - 1)) / (n - 1))))];
}

/**
 * A kind's simple bark: its trunk and its first limbs alone, each of a few of its own rings and sides. The vertices
 * kept are the grown bark's, so the trunk stands as it was. Left as grown where the rings don't add up to its vertices
 * (an ez-tree laid out otherwise).
 */
export function simpleBark(kind: TreeKind): THREE.BufferGeometry {
  const { bark, branches } = kind;
  if (branches.reduce((n, b) => n + b.rings * b.round, 0) !== bark.attributes.position.count) return bark;
  const kept: number[] = [], index: number[] = [];
  for (const b of branches) {
    if (b.level > 1) continue;
    const shape = b.level === 0 ? TRUNK : LIMB;
    const rings = spread(b.rings, shape.rings);
    const segments = b.round - 1, sides = Math.min(segments, shape.round);
    // (round each ring, and its first again at u = 1, as ez-tree lays it)
    const round = Array.from({ length: sides }, (_, k) => Math.floor((k * segments) / sides)).concat(segments);
    const first = kept.length, n = round.length;
    for (const i of rings) for (const j of round) kept.push(b.from + i * b.round + j);
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let j = 0; j + 1 < n; j++) {
        // (wound as ez-tree winds its own: `generateBranchIndices`)
        const v1 = first + i * n + j, v2 = v1 + 1, v3 = v1 + n, v4 = v2 + n;
        index.push(v1, v3, v2, v2, v3, v4);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(bark.attributes)) {
    const size = attribute.itemSize, from = attribute.array as Float32Array, to = new Float32Array(kept.length * size);
    kept.forEach((v, at) => to.set(from.subarray(v * size, v * size + size), at * size));
    geo.setAttribute(name, new THREE.BufferAttribute(to, size));
  }
  geo.setIndex(index);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** A leaf card's four corners. */
const CARD_CORNERS = 4;

/** a crown's lump: its middle, and how far it reaches across and up */
interface Lump { at: THREE.Vector3; across: number; up: number }
/** how a crown's lumps are sized and placed from their leaves (`LUMP`) */
interface LumpShape { across: number; up: number; card: number; flattest: number; gather: number; lift: number }

/** The `count` lumps a kind's leaf cards stand in: the cards' middles sorted into heaps (k-means, begun from the cards
 *  furthest apart, so the same each time), each heap a lump as wide and as tall as its cards spread, by `shape`. */
function lumpsOf(leaves: THREE.BufferGeometry, count: number, shape: LumpShape): Lump[] {
  const p = leaves.attributes.position, cards = Math.floor(p.count / CARD_CORNERS);
  const middles: THREE.Vector3[] = [], corner = new THREE.Vector3();
  let reach = 0;
  for (let c = 0; c < cards; c++) {
    const middle = new THREE.Vector3();
    for (let k = 0; k < CARD_CORNERS; k++) middle.add(corner.fromBufferAttribute(p, c * CARD_CORNERS + k));
    middle.divideScalar(CARD_CORNERS);
    reach += corner.fromBufferAttribute(p, c * CARD_CORNERS).distanceTo(middle) / cards;
    middles.push(middle);
  }
  if (!cards) return [];
  const heaps = [middles[0].clone()];
  const nearest = (m: THREE.Vector3): number => heaps.reduce((best, h, i) => (m.distanceToSquared(h) < m.distanceToSquared(heaps[best]) ? i : best), 0);
  while (heaps.length < Math.min(count, cards)) {
    let furthest = middles[0], most = -1;
    for (const m of middles) {
      const d = m.distanceToSquared(heaps[nearest(m)]);
      if (d > most) { most = d; furthest = m; }
    }
    heaps.push(furthest.clone());
  }
  let of: number[] = [];
  for (let round = 0; round < SORT_ROUNDS; round++) {
    of = middles.map(nearest);
    heaps.forEach((heap, h) => {
      const mine = middles.filter((_, i) => of[i] === h);
      if (mine.length) heap.set(0, 0, 0).add(mine.reduce((sum, m) => sum.add(m), new THREE.Vector3())).divideScalar(mine.length);
    });
  }
  const lumps: Lump[] = [];
  heaps.forEach((at, h) => {
    const mine = middles.filter((_, i) => of[i] === h);
    if (!mine.length) return;
    const across = Math.sqrt(mine.reduce((sum, m) => sum + (m.x - at.x) ** 2 + (m.z - at.z) ** 2, 0) / mine.length);
    const up = Math.sqrt(mine.reduce((sum, m) => sum + (m.y - at.y) ** 2, 0) / mine.length);
    const wide = across * shape.across + reach * shape.card;
    lumps.push({ at, across: wide, up: Math.max(wide * shape.flattest, up * shape.up + reach * shape.card) });
  });
  // (gathered in towards the crown's middle, a little up: one canopy of clumps, not a stack of them up the trunk)
  const middle = lumps.reduce((sum, l) => sum.add(l.at), new THREE.Vector3()).divideScalar(lumps.length || 1);
  for (const l of lumps) l.at.lerp(middle, shape.gather).y += l.up * shape.lift;
  return lumps;
}

/** The ways a clump's puffs bulge out from its middle: one on top, the rest round it, a little up, each turned its own
 *  way. */
function puffWays(rng: () => number): THREE.Vector3[] {
  const ways = [new THREE.Vector3((rng() - 0.5) * 0.5, 1, (rng() - 0.5) * 0.5).normalize()];
  const turn = rng() * TAU;
  for (let j = 0; j < PUFF.round; j++) {
    const around = turn + ((j + (rng() - 0.5) * 0.5) / PUFF.round) * TAU, up = PUFF.up[0] + rng() * (PUFF.up[1] - PUFF.up[0]);
    ways.push(new THREE.Vector3(Math.cos(up) * Math.cos(around), Math.sin(up), Math.cos(up) * Math.sin(around)));
  }
  return ways;
}

/**
 * A kind's simple crown, Low's: a coarse ball for each lump of its leaves, and a few big leaf cards round each. Its normals
 * point out from its lump, tipped up, so a lump is lit as one soft mass (as `canopyGeo`'s in foliage.ts); each face of
 * a ball takes a patch of its own from the middle of the leaves' picture. The grown leaves where it has none.
 */
export function simpleCrown(kind: TreeKind, seed: number): THREE.BufferGeometry {
  const lumps = lumpsOf(kind.leaves, CROWN.lumps, LUMP);
  if (!lumps.length) return kind.leaves;
  const rng = mulberry(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const soft = (g: THREE.BufferGeometry, { at, across }: Lump): void => {
    const p = g.attributes.position, normal = g.attributes.normal;
    for (let k = 0; k < p.count; k++) {
      n.set(p.getX(k) - at.x, (p.getY(k) - at.y) * 1.3 + across * 0.3, p.getZ(k) - at.z).normalize();
      normal.setXYZ(k, n.x, n.y, n.z);
    }
  };
  const turn = new THREE.Quaternion(), roll = new THREE.Quaternion(), ahead = new THREE.Vector3(0, 0, 1);
  lumps.forEach((lump, l) => {
    const ball = lumpy(new THREE.IcosahedronGeometry(1, CROWN.detail), CROWN.lumpy, seed * 13 + l * 7)
      .scale(lump.across, lump.up, lump.across).translate(lump.at.x, lump.at.y, lump.at.z);
    // each face a patch of the picture's middle, turned and moved its own way
    const p = ball.attributes.position, uv = ball.attributes.uv;
    for (let f = 0; f < p.count; f += 3) {
      a.fromBufferAttribute(p, f); b.fromBufferAttribute(p, f + 1); c.fromBufferAttribute(p, f + 2);
      const mid = n.copy(a).add(b).add(c).divideScalar(3).clone();
      const along = b.clone().sub(a).normalize(), across = c.clone().sub(a).cross(along).cross(along).normalize();
      const size = Math.max(a.distanceTo(mid), b.distanceTo(mid), c.distanceTo(mid));
      const angle = rng() * TAU, cos = Math.cos(angle), sin = Math.sin(angle);
      const u0 = 0.5 + (rng() - 0.5) * 2 * FACE_UV.wander, v0 = 0.5 + (rng() - 0.5) * 2 * FACE_UV.wander;
      [a, b, c].forEach((corner, k) => {
        const x = corner.clone().sub(mid).dot(along) / size, y = corner.clone().sub(mid).dot(across) / size;
        uv.setXY(f + k, u0 + (x * cos - y * sin) * FACE_UV.reach, v0 + (x * sin + y * cos) * FACE_UV.reach);
      });
    }
    soft(ball, lump);
    parts.push(ball);
    for (let i = 0; i < CROWN.cards; i++) {
      // all round, a little more on top, where the light and the camera are
      const out = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 0.7, rng() * 2 - 1).normalize();
      const size = lump.across * CROWN.card * (0.85 + rng() * 0.3);
      const card = new THREE.PlaneGeometry(size, size);
      turn.setFromUnitVectors(ahead, out);
      roll.setFromAxisAngle(out, rng() * TAU);
      card.applyQuaternion(turn.premultiply(roll));
      card.rotateX((rng() - 0.5) * 0.9).rotateZ((rng() - 0.5) * 0.9);
      card.translate(lump.at.x + out.x * lump.across * 0.75, lump.at.y + out.y * lump.up * 0.75, lump.at.z + out.z * lump.across * 0.75);
      soft(card, lump);
      parts.push(card.toNonIndexed());
    }
  });
  const crown = mergeGeometries(parts)!;
  crown.computeBoundingSphere();
  crown.computeBoundingBox();
  return crown;
}

/**
 * A kind's cartoon crown, Very low's (#688; on Low too it was, until the review: "for very low its fine, but for low
 * its not"): a few big clumps where its leaves stood, each one ball pushed out into rounded puffs, with
 * creases where they meet, as a cartoon tree's (the owner's reference: "less leaves"). Each face is one flat tone of
 * the leaves' own picture (`leafClusterTones`), brighter on a puff's crown and up top, darker in the creases and
 * underneath; its normals point out from its puff's middle, tipped up, so each puff is lit as a soft round mass. One
 * closed surface a clump, no cards: a pixel of the crown is shaded about once. The grown leaves where it has none.
 */
export function cartoonCrown(kind: TreeKind, seed: number): THREE.BufferGeometry {
  const lumps = lumpsOf(kind.leaves, CARTOON.lumps, CARTOON_LUMP);
  if (!lumps.length) return kind.leaves;
  const rng = mulberry(seed);
  const tones = leafClusterTones(TONES.count, TONES.darkest, TONES.brightest);
  const d = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3();
  const clumps = lumps.map((lump) => {
    const ways = puffWays(rng);
    const ball = new THREE.IcosahedronGeometry(1, CARTOON.detail);
    const p = ball.attributes.position, normal = ball.attributes.normal, uv = ball.attributes.uv;
    const bulges: number[] = [];
    for (let k = 0; k < p.count; k++) {
      d.fromBufferAttribute(p, k).normalize();
      // the nearest puff's bulge, rounded: a crease where two meet
      let most = 0, puff = ways[0];
      for (const way of ways) {
        const b = Math.max(0, d.dot(way)) ** PUFF.sharp;
        if (b > most) { most = b; puff = way; }
      }
      const r = PUFF.rest + PUFF.bulge * most;
      bulges.push(most);
      // (lit from its puff's middle, a little in from the clump's: its normal as the clump's scale leans it)
      n.copy(d).multiplyScalar(r).addScaledVector(puff, -PUFF.rest * 0.5);
      n.set(n.x / lump.across, n.y / lump.up, n.z / lump.across).normalize();
      n.set(n.x, n.y * 1.2 + 0.25, n.z).normalize();
      normal.setXYZ(k, n.x, n.y, n.z);
      p.setXYZ(k, lump.at.x + d.x * r * lump.across, lump.at.y + d.y * r * lump.up, lump.at.z + d.z * r * lump.across);
    }
    // each face one tone: by how far out on its puff it stands, and how much it faces up
    for (let f = 0; f < p.count; f += 3) {
      mid.set(0, 0, 0);
      for (let k = f; k < f + 3; k++) mid.add(n.fromBufferAttribute(normal, k));
      const bulge = (bulges[f] + bulges[f + 1] + bulges[f + 2]) / 3, up = mid.normalize().y * 0.5 + 0.5;
      const lit = THREE.MathUtils.clamp((bulge * TONES.byBulge + up * (1 - TONES.byBulge) - TONES.spread[0]) / (TONES.spread[1] - TONES.spread[0]), 0, 0.999);
      const [u, v] = tones[Math.floor(lit * TONES.count)];
      for (let k = f; k < f + 3; k++) uv.setXY(k, u, v);
    }
    return ball;
  });
  const crown = mergeGeometries(clumps)!;
  crown.computeBoundingSphere();
  crown.computeBoundingBox();
  return crown;
}

/** a set of meshes drawing one geometry (a mesh and its shadow caster: `cullInCells`), its own, and each look's made
 *  the first time a level asks for it */
interface Swap {
  meshes: THREE.Mesh[];
  full: THREE.BufferGeometry;
  make: (look: Exclude<SimpleTrees, false>) => THREE.BufferGeometry;
  made: Partial<Record<Exclude<SimpleTrees, false>, THREE.BufferGeometry>>;
}
const swaps: Swap[] = [];
let look: SimpleTrees = false;

function put(swap: Swap): void {
  const geometry = look ? (swap.made[look] ??= swap.make(look)) : swap.full;
  for (const mesh of swap.meshes) mesh.geometry = geometry;
}

/** each kind's simple bark and each look's crown, made once (the forest's kinds are the village's) */
const barks = new WeakMap<TreeKind, THREE.BufferGeometry>();
const crowns = { simple: new WeakMap<TreeKind, THREE.BufferGeometry>(), cartoon: new WeakMap<TreeKind, THREE.BufferGeometry>() };
const CROWN_OF = { simple: simpleCrown, cartoon: cartoonCrown };

/**
 * A kind's trees as drawn, `bark` and `leaves` (each a mesh and what casts its shadow, all of one geometry: a list of
 * its own for each geometry the kind's leaves are drawn in), drawn as the simple tree where the level asks for it.
 */
export function simpleTree(kind: TreeKind, bark: THREE.Mesh[], ...leaves: THREE.Mesh[][]): void {
  const add = (meshes: THREE.Mesh[], make: Swap['make']): void => {
    if (!meshes.length) return;
    const swap: Swap = { meshes, full: meshes[0].geometry, make, made: {} };
    swaps.push(swap);
    if (look) put(swap);
  };
  // (the bark the same for both looks)
  add(bark, () => {
    let made = barks.get(kind);
    if (!made) barks.set(kind, made = simpleBark(kind));
    return made;
  });
  for (const meshes of leaves) {
    add(meshes, (wanted) => {
      let made = crowns[wanted].get(kind);
      if (!made) crowns[wanted].set(kind, made = CROWN_OF[wanted](kind, 11));
      return made;
    });
  }
}

/** How the trees are drawn now: grown (false), simple or cartoon. */
export const simpleTreesNow = (): SimpleTrees => look;

/** How the trees are drawn (the quality level's): grown, simple or cartoon, live: geometries swapped alone. */
export function setSimpleTrees(wanted: SimpleTrees): void {
  if (wanted === look) return;
  look = wanted;
  for (const swap of swaps) put(swap);
}
