// The Hedgeward's wall (combat/skills/hedgeward.ts): a ranger's field barricade, driven into the ground in a moment.
// A row of sharpened stakes leaning out towards the foes, fresh-cut points pale over their bark, willow withies woven
// in and out between them in pairs, lashed with rope at the top course, bramble canes climbing over the weave and
// arching across its top, thorned and leaved, and the earth thrown up along its foot. It stands along its x from
// -WIDTH/2 to WIDTH/2, its front (the foes' side) towards +z, its foot at y 0, its stakes driven 0.4 m under it so a
// wall laid over a step of the dais stands in both levels.
// Its geometry is made once and shared by every cast; each wall has materials of its own on a kit (`createKit`), so
// it comes apart (`uDissolve`) on its own as it breaks or its time runs out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbrMaterialMaps, wood } from '../../core/textures';
import { createKit } from '../../core/materials';
import { mulberry } from '../../util';

/** the wall as built (m): how wide along x and how tall its stakes stand over its foot */
export const HEDGE_WIDTH = 3.6;
export const HEDGE_HEIGHT = 2;
/** how deep its stakes are driven under its foot (m) */
export const HEDGE_DEPTH = 0.4;

const STAKES = 9;
/** the bramble canes climbing it */
const BRAMBLES = 12;
/** the weave's courses over the foot (m), two withies each: close enough to read as a wall from the fight's camera,
 *  not a fence (at six courses, from the crypt's camera it read as a rail with gaps a foe could see through) */
const COURSES = [0.14, 0.32, 0.5, 0.68, 0.86, 1.04, 1.22, 1.4];
const BARK = 0x5a4a36, CUT = 0xcbb48a, WILLOW = 0x8d7a52, ROPE = 0x8a6f48;
/** its dissolve's glowing edge (`createKit`'s colour) */
const EDGE = 0x40541f;
const CANE = 0x4e2c24, CANE_GREEN = 0x44602c, THORN = 0x9a6a48, LEAF = 0x46642a, EARTH = 0x3b2e22;

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _turn = new THREE.Quaternion();

/** `g` in `hex`, each vertex a shade of its own within `vary` of it. */
function paint(g: THREE.BufferGeometry, hex: number, rng: () => number, vary = 0.08): THREE.BufferGeometry {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 - vary + rng() * vary * 2;
    a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
  }
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

/** A stake: its place along the wall, its height, its radius, and how it's turned off upright. */
interface Stake { x: number; height: number; radius: number; turn: THREE.Matrix4 }

/** Where stake `s`'s axis is at height `y` over the foot. */
function stakeAt(s: Stake, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  const up = new THREE.Vector3(0, 1, 0).applyMatrix4(s.turn).sub(new THREE.Vector3().applyMatrix4(s.turn));
  return out.set(0, y / up.y, 0).applyMatrix4(s.turn);
}

/** The stakes: evenly along the wall give or take, each its own height, girth and lean out towards the foes. */
function layStakes(rng: () => number): Stake[] {
  const stakes: Stake[] = [];
  for (let i = 0; i < STAKES; i++) {
    const x = -HEDGE_WIDTH / 2 + 0.12 + (HEDGE_WIDTH - 0.24) * i / (STAKES - 1) + (rng() - 0.5) * 0.06;
    const lean = 0.12 + rng() * 0.1, tilt = (rng() - 0.5) * 0.08;
    const turn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(lean, (rng() - 0.5) * 0.6, tilt)).setPosition(x, 0, 0);
    stakes.push({ x, height: HEDGE_HEIGHT * (0.86 + rng() * 0.16), radius: 0.055 + rng() * 0.02, turn });
  }
  return stakes;
}

/** A stake's shaft and its sharpened point, driven `HEDGE_DEPTH` under the foot. */
function stakeGeometry(s: Stake, rng: () => number): THREE.BufferGeometry[] {
  const tip = 0.22 + rng() * 0.08, shaft = s.height - tip + HEDGE_DEPTH;
  const body = new THREE.CylinderGeometry(s.radius * 0.92, s.radius, shaft, 7, 4).translate(0, shaft / 2 - HEDGE_DEPTH, 0);
  // (the point cut to one side, as an axe sharpens it)
  const point = new THREE.ConeGeometry(s.radius * 0.92, tip, 7, 2).translate(0.01, s.height - tip / 2, 0);
  return [paint(body, BARK, rng, 0.12).applyMatrix4(s.turn), paint(point, CUT, rng, 0.1).applyMatrix4(s.turn)];
}

/** One withy along course `y`, in front of and behind the stakes in turn (`flip` starts it behind). */
function withy(stakes: Stake[], y: number, flip: number, rng: () => number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const end = (s: Stake, out: number) => stakeAt(s, y).add(new THREE.Vector3(out, 0, 0));
  points.push(end(stakes[0], -0.12));
  stakes.forEach((s, i) => {
    const side = (i + flip) % 2 ? 1 : -1;
    points.push(stakeAt(s, y + (rng() - 0.5) * 0.03).add(new THREE.Vector3(0, 0, side * (s.radius + 0.022))));
  });
  points.push(end(stakes[stakes.length - 1], 0.12));
  const curve = new THREE.CatmullRomCurve3(points);
  const shade = new THREE.Color(WILLOW).lerp(new THREE.Color(rng() < 0.3 ? 0x6f7a48 : 0x7a6a50), rng() * 0.5);
  return paint(new THREE.TubeGeometry(curve, STAKES * 6, 0.019 + rng() * 0.006, 5, false), shade.getHex(), rng, 0.1);
}

/** A rope's turns round stake `s` at height `y`. */
function lashing(s: Stake, y: number, rng: () => number): THREE.BufferGeometry {
  const at = stakeAt(s, y);
  const g = new THREE.TorusGeometry(s.radius + 0.016, 0.011, 4, 12).rotateX(Math.PI / 2);
  // (turned with the stake, two turns a little apart)
  const lean = new THREE.Matrix4().extractRotation(s.turn);
  const second = g.clone().translate(0, 0.03, 0);
  return paint(mergeGeometries([g, second])!.applyMatrix4(lean).translate(at.x, at.y, at.z), ROPE, rng, 0.1);
}

/** A bramble cane through `points`: its stem, thorns along it and leaves off it. */
function cane(points: THREE.Vector3[], rng: () => number, stems: THREE.BufferGeometry[]): void {
  const curve = new THREE.CatmullRomCurve3(points);
  const length = curve.getLength();
  stems.push(paint(new THREE.TubeGeometry(curve, Math.ceil(length * 14), 0.011, 5, false), rng() < 0.6 ? CANE : CANE_GREEN, rng, 0.12));
  const at = new THREE.Vector3(), along = new THREE.Vector3(), out = new THREE.Vector3();
  for (let d = 0.04; d < length; d += 0.065 + rng() * 0.03) {
    const u = d / length;
    curve.getPointAt(u, at); curve.getTangentAt(u, along);
    // (a thorn standing off the stem, hooked back a little along it)
    out.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(along).normalize().addScaledVector(along, -0.35).normalize();
    const thorn = new THREE.ConeGeometry(0.006, 0.032, 3).translate(0, 0.016 + 0.009, 0);
    thorn.applyQuaternion(_turn.setFromUnitVectors(UP, out)).translate(at.x, at.y, at.z);
    stems.push(paint(thorn, THORN, rng, 0.15));
  }
  for (let d = 0.12; d < length; d += 0.14 + rng() * 0.1) {
    const u = d / length;
    curve.getPointAt(u, at); curve.getTangentAt(u, along);
    out.set(rng() - 0.5, rng() - 0.2, rng() - 0.5).cross(along).normalize();
    stems.push(leaf(at, out, along, rng));
  }
}

/** A bramble leaf on its stalk from `at`, out along `out`, cupped, its own green. */
function leaf(at: THREE.Vector3, out: THREE.Vector3, along: THREE.Vector3, rng: () => number): THREE.BufferGeometry {
  const size = 0.75 + rng() * 0.5, g = new THREE.PlaneGeometry(0.06 * size, 0.1 * size, 2, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // (pointed at its tip, narrow at its stalk, cupped along its rib)
    const narrow = 1 - Math.abs(y / (0.05 * size)) * 0.55;
    p.setXYZ(i, x * narrow, y + 0.05 * size + 0.008, Math.abs(x) * 0.5);
  }
  g.computeVertexNormals();
  // (its blade in the cane's plane: out from the stem along `out`, across along the stem)
  const across = _dir.copy(along).addScaledVector(out, -along.dot(out)).normalize();
  const facing = new THREE.Vector3().crossVectors(across, out);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(across, out, facing));
  g.translate(at.x, at.y, at.z);
  const shade = new THREE.Color(LEAF).lerp(new THREE.Color(rng() < 0.2 ? 0x7a6a2a : 0x2e4a1e), rng() * 0.5);
  return paint(g, shade.getHex(), rng, 0.08);
}

/** The bramble: canes rising from the foot, climbing across the weave in front and behind, some arching over the top. */
function brambles(rng: () => number, stems: THREE.BufferGeometry[]): void {
  for (let i = 0; i < BRAMBLES; i++) {
    const front = i % 3 !== 2 ? 1 : -1;
    const x0 = -HEDGE_WIDTH / 2 + 0.2 + rng() * (HEDGE_WIDTH - 0.4), way = rng() < 0.5 ? -1 : 1;
    const top = 0.9 + rng() * 0.95, reach = 0.6 + rng() * 0.9, points: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      // (up off the ground, along and over its top, and drooping past it)
      const y = 0.02 + top * Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.5) - (u > 0.75 ? (u - 0.75) * 1.2 : 0);
      const z = front * (0.1 + 0.08 * Math.sin(u * 5 + i)) + y * 0.18;
      points.push(new THREE.Vector3(THREE.MathUtils.clamp(x0 + way * reach * u + (rng() - 0.5) * 0.12, -1.85, 1.85), y, z));
    }
    cane(points, rng, stems);
  }
}

/** The earth thrown up along its foot: a low ridge, lumpy, and a few clods dug out in front of it. */
function earthworks(rng: () => number): THREE.BufferGeometry[] {
  const ridge = new THREE.SphereGeometry(1, 28, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = ridge.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), lump = 1 + 0.18 * Math.sin(x * 23 + z * 7) * Math.sin(z * 17 - x * 5);
    p.setXYZ(i, x * (HEDGE_WIDTH / 2 + 0.22), y * 0.17 * lump - 0.03, z * 0.3 * lump + 0.04);
  }
  ridge.computeVertexNormals();
  const parts = [paint(ridge, EARTH, rng, 0.14)];
  for (let i = 0; i < 12; i++) {
    const s = 0.04 + rng() * 0.05;
    const clod = new THREE.SphereGeometry(s, 5, 3).scale(1, 0.6, 1)
      .translate(-HEDGE_WIDTH / 2 + rng() * HEDGE_WIDTH, s * 0.2, 0.3 + rng() * 0.3);
    parts.push(paint(clod, EARTH, rng, 0.2));
  }
  return parts;
}

/** Its geometry, made once: the wood (stakes, withies, rope: the wood's maps) and what grows on it and under it. */
interface Parts { wood: THREE.BufferGeometry; growth: THREE.BufferGeometry }
let parts: Parts | null = null;

function build(): Parts {
  const rng = mulberry(4711);
  const stakes = layStakes(rng);
  const woods: THREE.BufferGeometry[] = [];
  for (const s of stakes) woods.push(...stakeGeometry(s, rng));
  COURSES.forEach((y, k) => {
    woods.push(withy(stakes, y, k % 2, rng));
    woods.push(withy(stakes, y + 0.045, (k + 1) % 2, rng));
  });
  stakes.forEach((s, i) => { if (i % 2 === 0) woods.push(lashing(s, COURSES[COURSES.length - 1] + 0.1, rng)); });
  const growth: THREE.BufferGeometry[] = [];
  brambles(rng, growth);
  growth.push(...earthworks(rng));
  return { wood: mergeGeometries(woods)!, growth: mergeGeometries(growth)! };
}

/** The glow of where it would stand: its stakes and weave alone (the bramble's thousand thorns, each a glow, added up
 *  to a glare, as the scarecrow's straws did). */
export function hedgewardOutline(): THREE.BufferGeometry {
  return (parts ??= build()).wood;
}

export interface Hedgeward {
  /** standing on the ground at its origin, along x, its front towards +z */
  root: THREE.Group;
  /** its kit: `u.uDissolve` takes it apart, `u.uHit` flashes it under a blow */
  kit: ReturnType<typeof createKit>;
  /** its meshes, whose geometry a wall laid over a step takes a copy of (`geometries`) */
  wood: THREE.Mesh;
  growth: THREE.Mesh;
}

/** A wall: new meshes on the shared geometry, with materials of its own (to be disposed with it: `disposeHedgeward`). */
export function buildHedgeward(): Hedgeward {
  const p = parts ??= build();
  // (its dissolve's edge a dim green: the kit triples it, and at a foe's brightness a wall 3.6 m wide coming apart
  // over the shoulder lit a sixteenth of the frame to 176 of the light budget's 150, `lab cast hedgeward`)
  const kit = createKit(EDGE);
  const woodMat = kit.std({ ...pbrMaterialMaps(wood(), [1, 3], 1.2), vertexColors: true, roughness: 1 });
  const growthMat = kit.std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const root = new THREE.Group();
  root.name = 'hedgeward';
  const woodMesh = new THREE.Mesh(p.wood, woodMat), growthMesh = new THREE.Mesh(p.growth, growthMat);
  woodMesh.name = 'hedgeward-wood'; growthMesh.name = 'hedgeward-growth';
  woodMesh.castShadow = growthMesh.castShadow = true;
  root.add(woodMesh, growthMesh);
  return { root, kit, wood: woodMesh, growth: growthMesh };
}

/** A wall's own materials let go, and any geometry it took a copy of (the shared geometry kept). */
export function disposeHedgeward(h: Hedgeward): void {
  for (const m of h.kit.mats) m.dispose();
  for (const mesh of [h.wood, h.growth]) if (parts && mesh.geometry !== parts.wood && mesh.geometry !== parts.growth) mesh.geometry.dispose();
}

/**
 * The shared geometry `g` with each point lifted by `lift(x)` (its x along the wall), for a wall laid over a step of
 * the dais: each stake stands on the level under it. A copy, or `g` itself where nothing is lifted.
 */
export function steppedOver(g: THREE.BufferGeometry, lift: (x: number) => number): THREE.BufferGeometry {
  const ends = [lift(-HEDGE_WIDTH / 2), lift(0), lift(HEDGE_WIDTH / 2)];
  if (Math.max(...ends) - Math.min(...ends) < 0.01) return g;
  const copy = g.clone(), p = copy.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + lift(p.getX(i)));
  p.needsUpdate = true;
  copy.computeBoundingSphere();
  return copy;
}
