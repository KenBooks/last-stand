// The Rootmother (entities/rootmother.ts): a giant woman grown out of a hollow tree in the arena's middle. The trunk is
// a hollowed stump twice a man's height, its wall split by roots; out of its hollow she rises from the waist, her body
// bark gone smooth as skin, sap glowing in its grain, her lower half all roots, spilling over the rim and down the
// trunk and out over the floor. Her hair is hanging moss to the small of her back, seed pods caught in it, a crown of
// twigs in leaf; a mantle of moss over her shoulders and breast. In the trunk's front, behind two doors of bark, her
// heart: the doors swing open and it beats bright through her weak-spot window (`AnimState.boss.weak`).
// Her actions are her arms' (`ActionState.hit` from the data): drawn back and driven down for the vines, a pod plucked
// from her hair and flung for the seeds, raised high as the thorns stir and brought down as they rise, pressed to the
// earth for an eruption. Killed, she sags back into her tree, her glows going out.
// A thrown branch: her right hand's root fingers grow together into a thorned branch held up before her, she snaps it
// off at the wrist and draws her arm back over her shoulder, then hurls it overhand, letting go as her arm comes over
// (`ActionState.hit`); both arms for a fan or a line. What flies is one of the branches kept in her model at no size
// (`userData.thrown`), so its look is warmed with hers, placed in the world by the throw's effect
// (entities/rootmother.ts `branchAt`).
// She never walks: she burrows (entities/rootBurrow.ts; from Kenneth: "it teleports, just going underground, roots
// going into the ground, and then it appears near you"). Each floor root is a joint at its knee, its +z along the root
// to where its foot meets the floor: driven down into the soil it's turned down about its knee and drawn in along its
// length (`bury.dive` 1), bursting out it's thrust out past its rest and settles back, gripping (`dive` under 0); her
// whole body goes under the floor by `bury.depth`, the floor hiding what's under it. Both are set by her burrow's
// effect on every game (`root.userData.bury`).
// Drawn in its crowd (models/crowd.ts): every change is a joint's place or a glow's strength, nothing hidden.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, branches, lathe, leaf, limb, organic, skipping, taperTube } from './shapes';
import { hangCagePool } from './rootCage';
import { hangBurrowPool } from './rootBurrow';
import { mulberry } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
/** a geometry made only where the kind's pieces aren't replayed (models/shapes.ts) */
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** the trunk's outside, bottom to top ([radius, height], m): a flared foot, a waist, the rim of its hollow */
const TRUNK: [number, number][] = [[2.65, 0], [2.35, 0.3], [2.05, 0.9], [1.88, 1.7], [1.84, 2.4], [1.92, 3.0], [2.0, 3.2]];
/** how thick the hollow's wall is (m), and where she rises from it (her waist's joint, m up) */
const WALL = 0.28, WAIST_Y = 2.85;
/** her heart: how high in the trunk's front, and how far out from its middle (m) */
const HEART_Y = 1.75, HEART_Z = 1.86;
/** the gap either side of her front the roots leave for her heart (rad) */
const HEART_GAP = 0.55;
/** a seed pod's husk bottom to top ([radius, height], shares of its size), as models/seedpod.ts has it */
const POD: [number, number][] = [[0.12, 0], [0.3, 0.12], [0.42, 0.34], [0.44, 0.52], [0.36, 0.74], [0.2, 0.92], [0.05, 1.02], [0.01, 1.05]];
/** her arms' bones (m) */
const UPPER = 1.35, FORE = 1.3;
const Z = V(0, 0, 1), Y = V(0, 1, 0);
/** A floor root driven into the soil (`bury.dive` 1): how far it's turned down about its knee (rad) and what of its
 *  length is drawn in; and thrust out as it bursts out of the earth (`dive` -1): what of its length more. */
const DIVE = { down: 1.15, drawn: 0.4, thrust: 0.18 };
/** a thrown branch's length (m), along its joint's +y from its butt to its tip */
export const BRANCH_LENGTH = 2;
/** how many thrown branches her model keeps (a line's five and one more: the oldest is taken past that) */
const THROWN_POOL = 6;
/** a branch's scale while it's not shown: tiny, never 0 (a zero scale's inverse is NaN, black lines on screen) */
export const NO_SIZE = 1e-4;

/**
 * A thorned branch's pieces on joint `j` (its butt at the joint, its tip `BRANCH_LENGTH` up its +y): a shaft bending a
 * little, two short forks, thorns along it pointing out and forward. Kept lean (some 200 triangles): her model holds
 * seven of them under her triangle budget.
 */
function branchOn(S: Sculpt, made: (f: () => THREE.BufferGeometry) => THREE.BufferGeometry, wood: THREE.Material,
  j: THREE.Object3D): void {
  const L = BRANCH_LENGTH;
  S.add(made(() => taperTube([V(0, 0, 0), V(0.04, L * 0.35, 0.02), V(-0.03, L * 0.7, 0), V(0.01, L, 0.01)],
    (t) => 0.075 * (1 - t * 0.8), 8, 5)), wood, j);
  for (const [y, side] of [[0.42, 1], [0.66, -1]] as const) {
    const from = V(0, L * y, 0);
    S.add(made(() => taperTube([from, from.clone().add(V(side * 0.18, 0.2, 0.04)), from.clone().add(V(side * 0.3, 0.45, 0.02))],
      (t) => 0.03 * (1 - t * 0.85), 4, 4)), wood, j);
  }
  for (let k = 0; k < 10; k++) {
    const y = L * (0.12 + k * 0.08), a = k * 2.4;
    S.add(made(() => new THREE.ConeGeometry(0.022, 0.13, 3).translate(0, 0.065, 0)), wood, j,
      [Math.sin(a) * 0.05, y, Math.cos(a) * 0.05], [Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1]);
  }
}

const _q = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0);

/** One floor root: its joint at its knee (its +z laid along the root to its foot, `turned`), the knee and the foot
 *  where it meets the floor in the tree's frame at rest, and its length between them. */
interface Crawler {
  j: THREE.Group; turned: THREE.Quaternion; knee: THREE.Vector3; foot: THREE.Vector3; footIn: THREE.Vector3;
  length: number;
}

/** The trunk's outside radius `y` m up. */
function trunkAt(y: number): number {
  for (let i = 1; i < TRUNK.length; i++) {
    if (TRUNK[i][1] >= y) {
      const [r0, y0] = TRUNK[i - 1], [r1, y1] = TRUNK[i];
      return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
  }
  return TRUNK[TRUNK.length - 1][0];
}

/** A geometry laid round a trunk of radius `around` (m): its x taken round the trunk's surface, its z out from it, so a
 *  plate cut flat fits the bark it lies on. */
function wrapRound(geo: THREE.BufferGeometry, around: number): THREE.BufferGeometry {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const angle = p.getX(i) / around, out = around + p.getZ(i);
    p.setXYZ(i, Math.sin(angle) * out, p.getY(i), Math.cos(angle) * out - around);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A point on the trunk's outside at angle `a` (from her front, to her left) and height `y`, `off` m out from it. */
const onTrunk = (a: number, y: number, off = 0): THREE.Vector3 =>
  V(Math.sin(a) * (trunkAt(y) + off), y, Math.cos(a) * (trunkAt(y) + off));

/** whether angle `a` round the trunk (from her front) falls in front of her heart, which nothing grows over */
const beforeHeart = (a: number): boolean => Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < HEART_GAP;

export function buildRootmother(): Model {
  // (her edge as she dissolves a deep green: her sap's own pale green over her whole fall blew it out)
  const kit = createKit(0x1e5a0c);
  const b = pbrMaterialMaps(bark(), 1, 1.8);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // the old tree's bark, dark and deep-furrowed, a trace of sap in its cracks
  const wood = kit.rim({
    color: 0x6e5a44, roughness: 0.92, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(2, 2),
    emissive: 0x8cff40, emissiveMap: veins(81, 3), emissiveIntensity: 0.04,
  }, 0x90b070, 0.22);
  // its weathered bark, grey and pale where the rain and the sun have had it: plates, splinters, her crown's twigs
  const pale = kit.rim({
    color: 0xa08e72, roughness: 0.88, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.6, 1.6),
  }, 0xb8c8a0, 0.25);
  // her roots: dark and damp, earth on them
  const rootWood = kit.rim({
    color: 0x4a3a2a, roughness: 0.95, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.8, 1.8),
  }, 0x708850, 0.2);
  // her body: living wood, its grain fine as skin, green under the brown, the sap brighter in it than in the tree
  const skin = kit.rim({
    color: 0x7c6c4a, roughness: 0.7, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(0.7, 0.7),
    emissive: 0x9aff50, emissiveMap: veins(83, 4), emissiveIntensity: 0.25,
  }, 0xb8d890, 0.35);
  const moss = kit.rim({ color: 0x35571b, roughness: 1, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(3, 3) }, 0x7aaa48, 0.25);
  const mossLight = kit.rim({ color: 0x5f7d2b, roughness: 1, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(3, 3) }, 0x9ac060, 0.2);
  const lichen = kit.std({ color: 0x9aa686, roughness: 1, map: g.map });
  const soil = kit.std({ color: 0x2b2117, roughness: 1, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(2, 2) });
  const leafMat = kit.rim({ color: 0x3a6a26, roughness: 0.65, side: THREE.DoubleSide }, 0x80c050, 0.25);
  const leafDark = kit.rim({ color: 0x24461a, roughness: 0.7, side: THREE.DoubleSide }, 0x5a8a3a, 0.2);
  const dark = kit.std({ color: 0x050403, roughness: 1 });
  const husk = kit.rim({ color: 0x7a6830, roughness: 0.7, map: g.map, normalMap: g.normalMap }, 0xc0c070, 0.3);
  const eye = kit.glow(0xc8ff70, 5);
  const pod = kit.glow(0xc8ff60, 1.1);
  // (a warm amber against her greens: the weak-spot window's colour, `bossKit.weak.edge`)
  // (dark flesh, the glow in its veins: a dense web of them, so it reads as a heart lit from within)
  const heartGlow = kit.std({ color: 0x8a2a10, roughness: 0.45, emissive: 0xff8a30, emissiveMap: veins(91, 22), emissiveIntensity: 0.8 });
  // her heart's light leaking through the cracks round it: faint while it's shut, blazing as it opens
  const crack = kit.glow(0xff8a30, 0.4);

  const root = new THREE.Group();
  const S = new Sculpt('rootmother').glow(eye).glow(pod).glow(heartGlow).glow(crack).glow(leafMat).glow(leafDark);
  const r = mulberry(53);
  /** a leaf at `at` on `parent`, turned at random, in one of the two greens */
  const leafAt = (parent: THREE.Object3D, at: THREE.Vector3, size = 1): void => {
    S.add(made(() => leaf(0.22 * size, 0.1 * size, 0.3, 0.3, 4)), r() < 0.5 ? leafMat : leafDark, parent, [at.x, at.y, at.z],
      [r() * 2.4 - 1.2, r() * 6.3, r() * 2.4 - 1.2]);
  };
  /** a vine winding up from `from` round a column at `centre` (radius `round` m, `turns` times, `rise` m up), leaves
   *  along it every `every` m */
  const vine = (parent: THREE.Object3D, centre: THREE.Vector3, round: (y: number) => number, a0: number, turns: number,
    y0: number, rise: number, every = 0.3, skip: (a: number) => boolean = () => false): void => {
    const pts: THREE.Vector3[] = [];
    const steps = Math.max(6, Math.round(turns * 16));
    for (let i = 0; i <= steps; i++) {
      const k = i / steps, a = a0 + k * turns * Math.PI * 2, y = y0 + k * rise, rr = round(y) + 0.03;
      pts.push(V(centre.x + Math.sin(a) * rr, y, centre.z + Math.cos(a) * rr));
    }
    S.add(made(() => taperTube(pts, (t) => 0.035 * (1 - t * 0.6), steps, 4)), rootWood, parent);
    let along = 0;
    for (let i = 1; i < pts.length; i++) {
      along += pts[i].distanceTo(pts[i - 1]);
      if (along < every) continue;
      along = 0;
      const a = a0 + (i / steps) * turns * Math.PI * 2;
      if (!skip(a)) leafAt(parent, pts[i], 0.5 + r() * 0.3);
    }
  };

  // --- the hollow trunk -----------------------------------------------------------------------------------
  const tree = joint(root, 0, 0, 0);
  // (one shell: up its outside, over the rim and down the hollow's wall inside, so every face winds the same way
  // round it and the inside faces in, where it's seen from; two lathes, the inner one wound in, showed it inside out)
  const shell: [number, number][] = [
    ...TRUNK, [TRUNK[TRUNK.length - 1][0] - WALL * 0.5, TRUNK[TRUNK.length - 1][1] + 0.06],
    ...TRUNK.slice(3).map(([rr, y]) => [rr - WALL, y] as [number, number]).reverse(),
  ];
  S.add(made(() => organic(lathe(shell, 40), 0.05, 2.2, 3)), wood, tree);
  S.add(made(() => new THREE.CircleGeometry(TRUNK[3][0] - WALL, 24).rotateX(-Math.PI / 2)), dark, tree, [0, 1.9, 0]);
  // its bark in plates, overlapping, pale and weathered higher up, dark and old at its foot (none before her heart)
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, y = 0.35 + r() * 2.6;
    if (beforeHeart(a) && y > 0.6 && y < 2.8) continue;
    const w = 0.35 + r() * 0.35, h = 0.5 + r() * 0.7, around = trunkAt(y);
    S.add(made(() => wrapRound(organic(new THREE.BoxGeometry(w, h, 0.07, 3, 3, 1), 0.02, 6, i), around + 0.04)),
      y > 1.6 && r() < 0.7 ? pale : wood, tree, [0, y, 0], [0, a, 0], 1);
  }
  // the rim, ragged: splinters standing up round it, weathered pale, moss in the hollow's lip
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.2, rr = TRUNK[TRUNK.length - 1][0] - WALL * 0.5, h = 0.25 + r() * 0.7;
    const lean = [r() - 0.5, r() - 0.5, r() - 0.5];
    S.add(made(() => taperTube([V(0, 0, 0), V(lean[0] * 0.1, h * 0.6, 0), V(lean[1] * 0.2, h, lean[2] * 0.1)], (t) => 0.14 * (1 - t * 0.9), 4, 5)),
      pale, tree, [Math.sin(a) * rr, 3.1, Math.cos(a) * rr]);
  }
  S.add(made(() => organic(new THREE.TorusGeometry(TRUNK[TRUNK.length - 1][0] - WALL * 0.6, 0.14, 6, 30).rotateX(Math.PI / 2), 0.35, 5, 4)),
    moss, tree, [0, 3.12, 0], [0, 0, 0], [1, 1, 0.6]);
  // splits in the wall where roots broke it, ridges of bark down it
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    if (beforeHeart(a)) continue;
    const pts = [0.1, 0.9, 1.7, 2.5, 3.1].map((y) => V(Math.sin(a + y * 0.05) * (trunkAt(y) + 0.02), y, Math.cos(a + y * 0.05) * (trunkAt(y) + 0.02)));
    S.add(made(() => taperTube(pts, (t) => 0.13 * (1 - t * 0.5), 10, 5)), wood, tree);
  }
  // knots and burls, a broken branch's stub
  for (let i = 0; i < 6; i++) {
    const a = HEART_GAP + 0.3 + r() * (Math.PI * 2 - HEART_GAP * 2 - 0.6), y = 0.8 + r() * 2;
    const at = onTrunk(a, y, 0.02), size = 0.18 + r() * 0.16;
    S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 8), 0.25, 3, 30 + i)), i % 2 ? wood : pale, tree, [at.x, at.y, at.z],
      [0, a, 0], [size, size * 1.3, size * 0.6]);
  }
  {
    const a = 2.3, from = onTrunk(a, 2.3, -0.1), out = onTrunk(a, 2.6, 0.9);
    S.add(made(() => taperTube([from, from.clone().lerp(out, 0.5).add(V(0, 0.1, 0)), out], (t) => 0.2 * (1 - t * 0.4), 6, 7)), pale, tree);
    S.add(made(() => organic(new THREE.CircleGeometry(0.13, 8), 0.2, 4, 3)), dark, tree, [out.x, out.y, out.z], [0, a, 0]);
  }
  // moss over its foot and its shaded side, pale lichen on its bark
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, y = i < 6 ? 0.15 + r() * 0.5 : 1 + r() * 2;
    if (beforeHeart(a) && y > 0.6) continue;
    const at = onTrunk(a, y, 0), size = 0.3 + r() * 0.35;
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.35, 3, 40 + i)), r() < 0.8 ? moss : mossLight, tree, [at.x, at.y, at.z],
      [0, a, 0], [size, size * 0.5, size * 0.18]);
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, y = 0.6 + r() * 2.4;
    if (beforeHeart(a) && y > 0.6 && y < 2.8) continue;
    const at = onTrunk(a, y, 0.06), size = 0.1 + r() * 0.12;
    S.add(made(() => new THREE.CircleGeometry(size, 7)), lichen, tree, [at.x, at.y, at.z], [0, a, 0]);
  }
  // ivy climbing it, round its back
  vine(tree, V(0, 0, 0), (y) => trunkAt(y), 1.4, 0.6, 0.1, 2.9, 0.28, beforeHeart);
  vine(tree, V(0, 0, 0), (y) => trunkAt(y), 3.6, -0.45, 0.2, 2.6, 0.3, beforeHeart);

  // --- her heart in the trunk's front, behind two doors of bark --------------------------------------------
  S.add(made(() => organic(new THREE.SphereGeometry(1, 16, 12), 0.12, 3, 5)), dark, tree, [0, HEART_Y, HEART_Z - 0.18], [0, 0, 0], [0.62, 0.78, 0.3]);
  const heart = joint(tree, 0, HEART_Y, HEART_Z - 0.1);
  S.add(made(() => organic(new THREE.IcosahedronGeometry(1, 3), 0.18, 2.5, 7)), heartGlow, heart, [0, 0, 0], [0, 0, 0], [0.34, 0.42, 0.3]);
  // roots binding it
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    S.add(made(() => taperTube([V(Math.cos(a) * 0.55, Math.sin(a) * 0.7, -0.15), V(Math.cos(a) * 0.36, Math.sin(a) * 0.46, 0.12), V(Math.cos(a) * 0.08, Math.sin(a) * 0.1, 0.28)], (t) => 0.05 * (1 - t * 0.6), 8, 5)),
      rootWood, tree, [0, HEART_Y, HEART_Z - 0.1]);
  }
  // the doors: plates of bark laid round the trunk's curve, ragged at their edges, hinged at the cavity's sides and
  // meeting over it, a seam of light between them
  const doors: THREE.Group[] = [];
  const around = trunkAt(HEART_Y);
  for (const s of [1, -1]) {
    const hinge = joint(tree, Math.sin(s * 0.36) * around, HEART_Y, Math.cos(s * 0.36) * around + 0.02);
    hinge.rotation.y = s * 0.36;
    const plate = made(() => {
      const shape = new THREE.Shape();
      // (each door's outline drawn on its own side: a mirror baked into a geometry turns its faces inside out)
      shape.moveTo(0, -0.9);
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, y = -0.9 + 1.8 * t, w = 0.66 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) + (k % 2 ? 0.03 : -0.03);
        shape.lineTo(-w * s, y);
      }
      shape.lineTo(0, 0.95);
      shape.lineTo(0, -0.9);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1, curveSegments: 4 });
      geo.translate(0, 0, -0.06);
      return organic(wrapRound(geo, around), 0.02, 6, 11 + s);
    });
    S.add(plate, pale, hinge);
    // a ridge of bark down each, and moss along its foot
    S.add(made(() => taperTube([V(-0.3 * s, -0.75, 0.1), V(-0.34 * s, 0, 0.12), V(-0.28 * s, 0.75, 0.1)], () => 0.035, 8, 4)), wood, hinge);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.3, 3, 50 + s)), moss, hinge, [-0.3 * s, -0.82, 0.08], [0, 0, 0], [0.32, 0.12, 0.12]);
    // (its share of the seam of light between them, along its free edge: it swings away with the door)
    const edge = (y: number): THREE.Vector3 => {
      const ang = (-0.66 * s) / around, out = around + 0.075;
      return V(Math.sin(ang) * out, y, Math.cos(ang) * out - around);
    };
    S.add(made(() => taperTube([edge(-0.85), edge(0), edge(0.88)], () => 0.02, 8, 4)), crack, hinge);
    doors.push(hinge);
  }
  // cracks round it in the bark, its light leaking out of them
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3, len = 0.4 + r() * 0.5;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 4; k++) {
      const rr = 0.72 + (k / 4) * len, wob = (r() - 0.5) * 0.12;
      const x = Math.cos(a + wob) * rr * 0.85, y = HEART_Y + Math.sin(a + wob) * rr;
      const ang = x / around;
      pts.push(V(Math.sin(ang) * (around + 0.035), y, Math.cos(ang) * (around + 0.035)));
    }
    S.add(made(() => taperTube(pts, (t) => 0.022 * (1 - t * 0.8), 8, 4)), crack, tree);
  }

  // --- her roots: from her waist in the hollow, over the rim, down the trunk and out into the ground --------------
  /** each root's piece out over the floor, which she drives into the soil and thrusts out of it as she burrows */
  const crawlers: Crawler[] = [];
  // (a few great ones from her waist over the rim, the rest smaller, out of the trunk's wall low down: the tree shows
  // between them; none over her heart, a gap before it)
  for (let i = 0; i < 11; i++) {
    const a = HEART_GAP + (i / 10) * (Math.PI * 2 - HEART_GAP * 2) + (r() - 0.5) * 0.22;
    const great = i % 3 === 0, out = (great ? 5.2 : 3.6) + r() * 1.6, twist = (r() - 0.5) * 0.7;
    const at = (rr: number, y: number, w = 0) => V(Math.sin(a + w) * rr, y, Math.cos(a + w) * rr);
    // (each in two: what comes down the trunk, fixed to it, and what lies out over the floor, on a joint at its knee
    // where it meets the ground's edge, which drives it into the soil and thrusts it out again as she burrows; the
    // floor's piece starts a little up inside the trunk's, so they bend there without a gap or a ball)
    const knee = great ? at(2.35, 0.8, twist * 0.6) : at(trunkAt(0.7) + 0.15, 0.7, twist * 0.3);
    const upper = great
      ? [at(0.5, WAIST_Y - 0.1), at(1.35, WAIST_Y + 0.35), at(2.12, 3.15), at(2.1, 2.2, twist * 0.3), knee]
      : [at(trunkAt(1.3) - 0.1, 1.3 + r() * 0.8), knee];
    // (out over the floor and down into it at its tip: past the dais's edge the ground is 0.35 m lower, and roots that
    // ended level hung in the air there)
    const lower = [
      great ? at(2.3, 0.95, twist * 0.6) : at(trunkAt(0.8), 0.82, twist * 0.3), knee, at(3.1, 0.12, twist),
      at(out - 0.9, 0.04, twist * 1.15), at(out, -0.5, twist * 1.3),
    ];
    const thick = great ? 0.27 + r() * 0.06 : 0.13 + r() * 0.07, mid = thick * 0.62;
    S.add(made(() => organic(taperTube(upper, (t) => thick - (thick - mid) * t, great ? 18 : 6, 8), 0.03, 7, i)), great ? wood : rootWood, tree);
    // (its joint at its knee, its +z laid along the root to where its foot meets the floor, so drawn out or in along
    // its length it still meets it)
    const foot = at(out - 0.9, 0.04, twist * 1.15);
    const turned = new THREE.Quaternion().setFromUnitVectors(Z, foot.clone().sub(knee).normalize());
    const into = turned.clone().invert();
    const crawl = joint(tree, knee.x, knee.y, knee.z);
    crawl.quaternion.copy(turned);
    // (its turn as built, for the lab's reading of where its foot rests)
    crawl.userData.turned = turned.clone();
    const local = (pts: THREE.Vector3[]): THREE.Vector3[] => pts.map((p) => p.clone().sub(knee).applyQuaternion(into));
    const turnedBy = (y: number): [number, number, number] => {
      const e = new THREE.Euler().setFromQuaternion(into.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, y)));
      return [e.x, e.y, e.z];
    };
    S.add(made(() => organic(taperTube(local(lower), (t) => mid * 1.04 * (1 - t * 0.8), great ? 16 : 13, 7), 0.035, 7, i + 20)), rootWood, crawl);
    // (rootlets forking off it into the ground, and earth heaped where it goes in)
    for (let k = 0; k < (great ? 3 : 1); k++) {
      const from = at(3.1 + (out - 4) * (0.3 + k * 0.25), 0.07, twist * (1 + k * 0.1));
      const w = a + twist + (r() - 0.5) * 1.1, reach = 0.9 + r() * 1.1;
      const ahead = V(from.x + Math.sin(w) * reach, -0.3, from.z + Math.cos(w) * reach);
      const midway = from.clone().lerp(ahead, 0.5).setY(0.05);
      S.add(made(() => taperTube(local([from, midway, ahead]), (t) => 0.07 * (1 - t * 0.85), 8, 5)), rootWood, crawl);
    }
    const mound = at(out - 0.35, -0.16, twist * 1.25);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 6), 0.3, 3, 60 + i)), soil, crawl,
      local([mound])[0].toArray() as [number, number, number], turnedBy(a), [0.3, 0.14, 0.26]);
    if (great) {
      const lump = at(3.6, 0.2, twist);
      S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.35, 3, 70 + i)), moss, crawl,
        local([lump])[0].toArray() as [number, number, number], turnedBy(a), [0.3, 0.13, 0.22]);
    }
    crawlers.push({ j: crawl, turned, knee, foot, footIn: local([foot])[0], length: foot.distanceTo(knee) });
  }
  // --- her body, from the waist up ------------------------------------------------------------------------
  // (on the tree)
  const waist = joint(tree, 0, WAIST_Y, 0);
  // (her hips and belly melting into the roots in the hollow)
  S.add(made(() => organic(taperTube([V(0, -0.6, 0), V(0, -0.1, 0), V(0, 0.45, 0.02), V(0, 0.95, 0.02)], (t) => 0.68 - 0.24 * Math.sin(t * Math.PI * 0.95), 14, 14), 0.04, 4, 2)),
    skin, waist, [0, 0, 0], [0, 0, 0], [1, 1, 0.78]);
  // roots wound up round her hips and waist out of the hollow, a bodice the tree grew her
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 7) * Math.PI * 2, dir = i % 2 ? 1 : -1;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, a = a0 + dir * t * 1.6, y = -0.7 + t * 1.25, rr = 0.66 - 0.18 * Math.sin(t * Math.PI * 0.9) + 0.03;
      pts.push(V(Math.sin(a) * rr, y, Math.cos(a) * rr * 0.8));
    }
    S.add(made(() => organic(taperTube(pts, (t) => 0.075 * (1 - t * 0.75), 14, 5), 0.02, 6, 80 + i)), rootWood, waist);
  }
  const chest = joint(waist, 0, 0.95, 0);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 20, 16), 0.04, 3, 3)), skin, chest, [0, 0.45, 0], [0, 0, 0], [0.66, 0.72, 0.44]);
  for (const s of [1, -1]) {
    S.add(made(() => organic(new THREE.SphereGeometry(1, 14, 10), 0.03, 3, 4 + s)), skin, chest, [s * 0.24, 0.42, 0.3], [0, 0, 0], [0.24, 0.22, 0.2]);
    // bark plates over her flanks and shoulders, where the tree is still on her
    for (let k = 0; k < 3; k++) {
      S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.2, 4, 90 + k + s * 5)), k === 2 ? pale : wood, chest,
        [s * (0.52 + k * 0.05), 0.15 + k * 0.32, -0.05 - k * 0.04], [0.2 * k, 0, s * 0.4], [0.16, 0.22, 0.1]);
    }
  }
  // her shoulders and collarbones, a neck of twisted wood
  S.add(made(() => organic(taperTube([V(-0.8, 0.95, 0), V(-0.3, 1.08, 0.05), V(0.3, 1.08, 0.05), V(0.8, 0.95, 0)], (t) => 0.2 - 0.06 * Math.sin(t * Math.PI), 12, 9), 0.03, 4, 6)), skin, chest);
  const neck = joint(chest, 0, 1.12, 0.04);
  S.add(made(() => organic(limb(0.38, 0.17, 0.15, 0.02, 0.5, 10), 0.02, 5, 8).rotateX(Math.PI)), skin, neck);
  for (let i = 0; i < 3; i++) {
    const a = -0.8 + i * 0.8;
    S.add(made(() => taperTube([V(Math.sin(a) * 0.16, 0.02, Math.cos(a) * 0.15), V(Math.sin(a + 0.6) * 0.16, 0.2, Math.cos(a + 0.6) * 0.15), V(Math.sin(a + 1.2) * 0.15, 0.38, Math.cos(a + 1.2) * 0.14)], () => 0.03, 8, 4)), wood, neck);
  }
  // moss and leaves over her breast and shoulders, hanging in strands down her back and sides
  S.add(made(() => organic(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), 0.25, 5, 9)), moss, chest, [0, 0.62, -0.02], [0, 0, 0], [0.82, 0.66, 0.56]);
  // (a bodice the tree grew her: moss over her breast, leaves laid over it, out on its surface)
  S.add(made(() => organic(new THREE.SphereGeometry(1, 14, 10), 0.18, 5, 15)), moss, chest, [0, 0.4, 0.2], [0, 0, 0], [0.56, 0.3, 0.33]);
  for (let i = 0; i < 30; i++) {
    const s = i % 2 ? 1 : -1, x = s * (0.04 + r() * 0.46), y = 0.22 + r() * 0.48;
    const z = 0.47 + 0.08 * Math.cos(x * 3.2) - 0.18 * Math.max(0, Math.abs(y - 0.42) - 0.12), size = 0.17 + r() * 0.07;
    S.add(made(() => leaf(size, 0.1, 0.3, 0.25, 4)), r() < 0.65 ? leafDark : leafMat, chest, [x, y, z], [-1.45 - r() * 0.3, (r() - 0.5) * 0.8, r() * 6.3]);
  }
  for (let i = 0; i < 34; i++) {
    const a = Math.PI * 0.35 + (i / 33) * Math.PI * 1.3 + r() * 0.06, back = Math.max(0, -Math.cos(a));
    const len = 0.5 + r() * 0.5 + back * 0.9, rr = 0.6;
    const x = Math.sin(a) * rr * 1.2, z = Math.cos(a) * rr * 0.8, y = 1.0;
    const out = 1.08 + r() * 0.12, drift = (r() - 0.5) * 0.1;
    S.add(made(() => organic(taperTube([V(x, y, z), V(x * out, y - len * 0.45, z * out), V(x * out * 0.97, y - len, z * out * 1.02 + drift)],
      (t) => 0.05 * (1 - t * 0.7), 10, 4), 0.015, 9, i)), r() < 0.3 ? mossLight : moss, chest);
  }

  // her head: long and carved, a stern brow, cheekbones, a long nose, her mouth set hard, glowing eyes deep under the
  // brow, the grain running down her cheeks
  const head = joint(neck, 0, 0.42, 0.02);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 20, 16), 0.025, 3, 10)), skin, head, [0, 0.34, -0.01], [0, 0, 0], [0.27, 0.37, 0.3]);
  for (const s of [1, -1]) {
    // brow: falling to the nose's root, a frown
    S.add(made(() => taperTube([V(s * 0.2, 0.465, 0.16), V(s * 0.12, 0.445, 0.25), V(s * 0.035, 0.405, 0.28)], (t) => 0.03 * (1 - t * 0.35), 8, 6)), skin, head);
    // its socket, the eye in it: almond, leaning in
    S.add(made(() => new THREE.SphereGeometry(1, 10, 8)), dark, head, [s * 0.1, 0.37, 0.24], [0, 0, s * -0.25], [0.075, 0.042, 0.04]);
    S.add(made(() => new THREE.SphereGeometry(1, 10, 6)), eye, head, [s * 0.1, 0.372, 0.262], [0, 0, s * -0.25], [0.045, 0.02, 0.018]);
    // cheekbone and the hollow under it
    S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 8), 0.05, 4, 14 + s)), skin, head, [s * 0.15, 0.29, 0.18], [0, s * 0.4, 0], [0.07, 0.04, 0.06]);
    // the grain down her cheek, from her eye to her jaw
    S.add(made(() => taperTube([V(s * 0.13, 0.33, 0.255), V(s * 0.16, 0.24, 0.23), V(s * 0.14, 0.13, 0.2)], (t) => 0.008 * (1 - t * 0.5), 8, 3)), dark, head);
    // her nostril's wing
    S.add(made(() => new THREE.SphereGeometry(1, 8, 6)), skin, head, [s * 0.035, 0.255, 0.305], [0, 0, 0], [0.025, 0.02, 0.022]);
  }
  // her nose, long and straight from the brow
  S.add(made(() => taperTube([V(0, 0.41, 0.285), V(0, 0.33, 0.315), V(0, 0.27, 0.335), V(0, 0.25, 0.32)], (t) => 0.034 - 0.008 * t, 10, 6)), skin, head);
  // her mouth: lips pressed thin, its corners down
  S.add(made(() => taperTube([V(-0.075, 0.165, 0.258), V(-0.03, 0.183, 0.282), V(0.03, 0.183, 0.282), V(0.075, 0.165, 0.258)], () => 0.01, 10, 5)), skin, head);
  S.add(made(() => taperTube([V(-0.06, 0.158, 0.262), V(0, 0.153, 0.284), V(0.06, 0.158, 0.262)], () => 0.012, 8, 5)), skin, head);
  S.add(made(() => taperTube([V(-0.078, 0.168, 0.262), V(0, 0.172, 0.288), V(0.078, 0.168, 0.262)], () => 0.006, 8, 3)), dark, head);
  // her jaw and chin
  S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 8), 0.04, 3, 13)), skin, head, [0, 0.1, 0.17], [0, 0, 0], [0.12, 0.08, 0.09]);
  // a crown of antler-like boughs in leaf, small glowing buds at their tips
  {
    const out: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
    // (grown every build, a replay too: it draws its random numbers as it grows, and every draw after it must match)
    for (const s of [1, -1]) {
      branches(r, V(s * 0.12, 0.6, -0.02), V(s * 0.55, 1, -0.25), 0.55, 0.045, 2, out, tips, 0.55, 5);
    }
    branches(r, V(0, 0.66, -0.06), V(0, 1, -0.35), 0.45, 0.04, 1, out, tips, 0.5, 5);
    for (const geo of out) S.add(skipping() ? NONE : geo, pale, head);
    for (const tip of tips) {
      S.add(made(() => new THREE.SphereGeometry(0.026, 10, 8)), pod, head, [tip.x, tip.y, tip.z]);
      leafAt(head, tip.clone().add(V(0, -0.08, 0)), 0.9);
      leafAt(head, tip.clone().add(V(0.03, -0.16, 0.02)), 0.8);
    }
  }
  // her hair: moss hanging in strands from her crown to the small of her back, vines in it, seed pods caught in it
  const hair = joint(head, 0, 0.45, -0.05);
  for (let i = 0; i < 54; i++) {
    const a = Math.PI * 0.3 + (i / 53) * Math.PI * 1.4 + (r() - 0.5) * 0.05, rr = 0.27 + r() * 0.04;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.9 - 0.06;
    const len = 1.3 + r() * 1.7 - Math.abs(Math.cos(a)) * 0.5, out = 1.12 + r() * 0.2;
    const sway = (r() - 0.5) * 0.18, girth = 0.03 + r() * 0.018;
    const pts = [V(x * 0.7, 0.05, z * 0.7), V(x * out, -0.25, z * out - 0.06), V(x * out * 1.12 + sway, -len * 0.45, z * out - 0.2),
      V(x * out * 1.08 + sway * 1.6, -len, z * out - 0.24 - r() * 0.15)];
    S.add(made(() => organic(taperTube(pts, (t) => girth * (1 - t * 0.75), 12, 5), 0.012, 9, i)), i % 6 === 1 ? mossLight : moss, hair);
    if (i % 11 === 4) {
      // a vine in her hair, leaves along it
      for (let k = 1; k < 4; k++) leafAt(hair, pts[1].clone().lerp(pts[3], k / 4).add(V(0, 0, 0.04)), 0.7);
    }
    if (i % 9 === 3) {
      // a seed pod hanging in it on its stalk: a ribbed husk, its seams glowing
      const at = pts[2].clone().lerp(pts[3], 0.2 + r() * 0.4).add(V(0, 0, 0.03));
      S.add(made(() => lathe(POD.map(([pr, py]) => [pr * 0.2, py * 0.3] as [number, number]), 10)), husk, hair, [at.x, at.y - 0.3, at.z]);
      S.add(made(() => new THREE.SphereGeometry(1, 8, 6)), pod, hair, [at.x, at.y - 0.18, at.z], [0, 0, 0], [0.07, 0.1, 0.07]);
      for (let k = 0; k < 4; k++) {
        const ka = (k / 4) * Math.PI * 2;
        S.add(made(() => taperTube(POD.slice(1, -1).map(([pr, py]) => V(Math.sin(ka) * pr * 0.205, py * 0.3, Math.cos(ka) * pr * 0.205)), () => 0.012, 6, 3)),
          husk, hair, [at.x, at.y - 0.3, at.z]);
      }
    }
  }

  // her arms: long and bark-skinned, bark plates on them, vines wound round them, hands of root fingers
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [], hand: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const sh = joint(chest, s * 0.82, 0.92, 0);
    S.add(made(() => organic(limb(UPPER, 0.19, 0.13, 0.12, 0.35, 14), 0.02, 6, 20 + s)), skin, sh);
    const el = joint(sh, 0, -UPPER, 0);
    S.add(made(() => organic(limb(FORE, 0.14, 0.09, 0.06, 0.3, 14), 0.02, 6, 22 + s)), skin, el);
    for (let k = 0; k < 2; k++) {
      S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.2, 4, 100 + k + s * 3)), k ? pale : wood, sh,
        [s * 0.1, -0.25 - k * 0.45, -0.05], [0, 0, s * 0.3], [0.1, 0.24, 0.08]);
      S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.2, 4, 110 + k + s * 3)), wood, el,
        [s * 0.07, -0.3 - k * 0.5, -0.06], [0, 0, s * 0.2], [0.08, 0.22, 0.07]);
    }
    vine(el, V(0, 0, 0), (y) => 0.13 - 0.04 * (-y / FORE), s * 0.5, s * 1.4, -FORE + 0.15, FORE - 0.3, 0.3);
    const hd = joint(el, 0, -FORE, 0);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 8), 0.06, 4, 24 + s)), skin, hd, [0, -0.1, 0.02], [0, 0, 0], [0.13, 0.16, 0.07]);
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4, x = thumb ? s * -0.12 : (f - 1.5) * 0.06 * -s, len = thumb ? 0.25 : 0.42 + (f === 1 || f === 2 ? 0.08 : 0);
      const from = V(x, -0.2, thumb ? 0.06 : 0.02);
      const to = from.clone().add(V(x * 0.6, -len, thumb ? 0.16 : 0.08));
      S.add(made(() => taperTube([from, from.clone().lerp(to, 0.5).add(V(0, 0, 0.05)), to], (t) => 0.035 * (1 - t * 0.75), 8, 5)), wood, hd);
      // (a knuckle's burl, and a rootlet off its tip)
      S.add(made(() => new THREE.SphereGeometry(0.038, 6, 5)), wood, hd, from.clone().lerp(to, 0.45).toArray() as [number, number, number]);
      S.add(made(() => taperTube([to, to.clone().add(V(x * 0.4, -0.12, 0.05))], (t) => 0.012 * (1 - t), 4, 3)), rootWood, hd);
    }
    // (moss trailing off her forearm)
    S.add(made(() => taperTube([V(0, -0.2, -0.1), V(0.02, -0.55, -0.16), V(0.02, -0.95, -0.14)], (t) => 0.05 * (1 - t * 0.85), 6, 4)), moss, el);
    shoulder.push(sh); elbow.push(el); hand.push(hd);
  }
  // the branch grown out of her right hand's fingers, along them, at no size till she grows it
  const held = joint(hand[0], 0, -0.32, 0.05);
  held.rotation.x = Math.PI;
  branchOn(S, made, wood, held);
  held.scale.setScalar(NO_SIZE);
  // the branches she throws, kept at no size under her root till a throw places one in the world
  const thrown: THREE.Group[] = [];
  for (let i = 0; i < THROWN_POOL; i++) {
    const j = joint(root, 0, 0, 0);
    branchOn(S, made, wood, j);
    j.scale.setScalar(NO_SIZE);
    thrown.push(j);
  }
  root.userData.thrown = thrown;
  S.build();
  // her root cage and the great root she brings down on it: meshes of their own in her roots' bark, not her sculpt,
  // at no size till a cage places them (entities/rootCage.ts)
  root.userData.cage = hangCagePool(root, rootWood);
  // her burrow's soil: the mounds where she sinks and rises and the ridge over her way (entities/rootBurrow.ts)
  root.userData.burrow = hangBurrowPool(root, soil);
  /** her burrow's pose, set by its effect on every game (entities/rootBurrow.ts): her floor roots' dive (1 driven into
   *  the soil, under 0 thrust out of it) and how far under the floor her whole body is (m) */
  const bury = { dive: 0, depth: 0 };
  root.userData.bury = bury;
  /** for the lab: her roots' joints, and where each foot meets the floor at rest (in its joint's frame) */
  root.userData.roots = crawlers.map((c) => ({ joint: c.j, foot: c.footIn }));

  // (eased: her heart's doors opening through the window, her fall)
  let open = 0, sag = 0;

  /** Her floor roots driven into the soil (`dive` up to 1: turned down about the knee, drawn in) or thrust out of it as
   *  they burst out and spread (`dive` under 0: drawn out past their rest), each from its turn as built. */
  function rootsTo(dive: number): void {
    const down = Math.max(0, dive), out = Math.max(0, -dive);
    for (const c of crawlers) {
      c.j.quaternion.copy(c.turned).multiply(_q.setFromAxisAngle(_x, DIVE.down * down));
      c.j.scale.set(1, 1, 1 - DIVE.drawn * down + DIVE.thrust * out);
    }
  }

  function animate(st: AnimState): void {
    const { t, dt } = st, look = st.boss, a = st.action;
    const dead = st.dead >= 0 ? st.dead : 0;
    const weak = !!look && look.weak > 0 && dead === 0;
    const k = 1 - Math.exp(-dt * 5);
    open += ((weak ? 1 : 0) - open) * k;
    sag += (dead - sag) * (1 - Math.exp(-dt * 3));
    const late = (look?.phase ?? 0) >= 1;

    // at rest: a slow sway, her breath, her head turning a little, her arms hanging out from her sides
    let waistX = Math.sin(t * 0.45) * 0.03, waistZ = Math.sin(t * 0.33) * 0.04, chestX = Math.sin(t * 0.9) * 0.02;
    let headX = Math.sin(t * 0.37) * 0.06, headY = Math.sin(t * 0.21) * 0.15;
    const arm = [{ x: 0.1, z: 0.35, el: -0.35 }, { x: 0.1, z: 0.35, el: -0.35 }];
    arm.forEach((s, i) => { s.x += Math.sin(t * 0.6 + i * 2) * 0.05; s.z += Math.sin(t * 0.5 + i) * 0.04; });
    let glow = late ? 2.2 : 1.4;
    // (the branch in her hand: grown through a throw's warning, gone as she lets go)
    let heldShown = 0;

    if (a) {
      const h = a.hit ?? 0.55, w = a.t;
      const up = ramp(w, 0, h * 0.9) * (1 - ramp(w, h * 0.9, h)), down = ramp(w, h * 0.9, h) * (1 - ramp(w, h + 0.1, 1));
      const hold = ramp(w, 0, h * 0.8) * (1 - ramp(w, h + 0.1, 1));
      if (a.name === 'vines') {
        // both arms drawn back and up, then driven down before her into the roots
        for (const s of arm) { s.x += 1.2 * up - 1.0 * down; s.z += 0.25 * up; s.el += -0.6 * up; }
        waistX += -0.15 * up + 0.3 * down;
        glow += 1.2 * up;
      } else if (a.name === 'seeds') {
        // her right hand up to her hair for a pod, then flung forward and out
        arm[0].x += -2.4 * up - 1.4 * down; arm[0].z += 0.6 * up - 0.2 * down; arm[0].el += -1.6 * up + 1.0 * down;
        headY += -0.3 * up; chestX += -0.1 * up + 0.15 * down;
      } else if (a.name === 'thorns') {
        // both arms raised high and wide as the thorns stir, brought down as they rise
        for (const s of arm) { s.x += -2.6 * up - 0.4 * down; s.z += 0.8 * up; s.el += -0.4 * up; }
        headX += -0.3 * up + 0.2 * down;
        glow += 2.0 * up;
      } else if (a.name === 'erupt' || a.name === 'chase' || a.name === 'cage') {
        // leaning out over the rim, her palms pressed down to the earth towards the hero
        for (const s of arm) { s.x += -1.3 * hold; s.z += -0.15 * hold; s.el += -0.25 * hold; }
        waistX += 0.42 * hold; chestX += 0.15 * hold; headX += -0.35 * hold;
        glow += 1.0 * hold;
      } else if (a.name === 'crush') {
        // her root cage's blow: both arms raised slowly high over her head as the great root rises (her weight drawn
        // back), then brought down hard together with it as it falls, her body following them over, held a moment
        const lift = ramp(w, 0, h * 0.85) * (1 - ramp(w, h * 0.85, h));
        const slam = ramp(w, h * 0.85, h) * (1 - ramp(w, h + 0.2, 1));
        for (const s of arm) { s.x += -3.0 * lift - 0.9 * slam; s.z += 0.35 * lift - 0.1 * slam; s.el += -0.5 * lift + 0.2 * slam; }
        waistX += -0.2 * lift + 0.45 * slam; chestX += -0.12 * lift + 0.2 * slam; headX += -0.35 * lift + 0.3 * slam;
        glow += 1.6 * lift;
      } else if (a.name === 'branch' || a.name === 'fan' || a.name === 'volley') {
        // the branch grown out of her hand held up before her, snapped off, her arm drawn back over her shoulder (the
        // elbow bent, her body leaning back), then brought over fast and let go as it comes level, following through
        const grow = ramp(w, 0, h * 0.4), back = ramp(w, h * 0.4, h * 0.88), over = ramp(w, h * 0.88, h);
        const after = 1 - ramp(w, h, Math.min(1, h + 0.25));
        const throwing = a.name === 'branch' ? [arm[0]] : arm;
        for (const s of throwing) {
          let x = -1.3 * grow;
          x += (-3.0 - x) * back;
          x += (-0.9 - x) * over;
          s.x += x * (w < h ? 1 : after);
          s.el += (-1.5 * back * (1 - over) - 0.1 * over) * (w < h ? 1 : after);
          s.z += 0.15 * back;
        }
        waistX += (-0.14 * back + 0.34 * over) * (w < h ? 1 : after);
        chestX += (-0.1 * back + 0.18 * over) * (w < h ? 1 : after);
        headX += -0.18 * grow * (1 - over);
        heldShown = w < h ? grow : 0;
      }
    }
    if (open > 0.01) {
      // her heart bared, she meditates: drawn up and back from it, her head tipped back, her arms raised wide, palms
      // up, swaying slowly as she sows her pods
      const sway = Math.sin(t * 0.8);
      waistX += -0.22 * open; headX += -0.5 * open; chestX += -0.08 * open;
      arm.forEach((s, i) => {
        s.z += (1.15 + 0.08 * sway * (i ? -1 : 1)) * open;
        s.x += -0.45 * open;
        s.el += 0.25 * open;
      });
    }
    if (st.hit > 0) chestX += -0.06 * st.hit;
    // killed: she sags back and down into her tree, her arms falling
    waistX += -0.5 * sag; headX += 0.6 * sag;
    for (const s of arm) { s.x = s.x * (1 - sag) + 0.15 * sag; s.z = s.z * (1 - sag) + 0.1 * sag; s.el *= 1 - sag; }

    // her burrow: her roots driven into the soil or thrust out of it, her body under the floor by its depth; going
    // under, her arms drawn in to her and her head bowed, rising, flung wide as she comes up
    rootsTo(bury.dive);
    root.position.y = -bury.depth;
    const under = Math.min(1, bury.depth / 2);
    waistX += 0.2 * under; headX += 0.3 * under;
    for (const s of arm) { s.x += -0.6 * under; s.z += -0.2 * under; s.el += -0.6 * under; }
    waist.position.y = WAIST_Y - 1.1 * sag;
    waist.rotation.set(waistX, 0, waistZ);
    chest.rotation.x = chestX;
    head.rotation.set(headX, headY, 0);
    // her hair swinging behind her head's moves
    hair.rotation.x = -headX * 0.6 - waistX * 0.4 + Math.sin(t * 0.8) * 0.03;
    hair.rotation.z = Math.sin(t * 0.6) * 0.03 - waistZ * 0.5;
    held.scale.setScalar(Math.max(NO_SIZE, heldShown * (1 - sag)));
    shoulder.forEach((sh, i) => {
      const s = arm[i], side = i === 0 ? 1 : -1;
      sh.rotation.set(-s.x, 0, side * s.z);
      elbow[i].rotation.x = s.el;
      hand[i].rotation.x = -0.2 + Math.sin(t * 0.7 + i) * 0.08;
    });

    // her heart's doors open through the window, the heart beating bright (once a second: the flash rule)
    doors.forEach((d, i) => { d.rotation.y = (i === 0 ? 1 : -1) * 0.36 + (i === 0 ? 1 : -1) * 1.3 * open; });
    const beat = Math.max(0, Math.sin(t * Math.PI * 2)) ** 3;
    heart.scale.setScalar(1 + (0.06 + 0.16 * open) * beat);
    heartGlow.emissiveIntensity = (0.8 + open * (3.5 + 2 * beat) + (late ? 0.6 : 0)) * (1 - sag);
    // (its light through the cracks round it: faint, a beat a second, blazing as it opens)
    crack.emissiveIntensity = (0.35 + 0.15 * beat + open * (2.6 + 1.2 * beat) + (late ? 0.2 : 0)) * (1 - sag);
    eye.emissiveIntensity = (late ? 7 : 5) * (1 - sag);
    pod.emissiveIntensity = (1.1 + 0.25 * Math.sin(t * 1.1)) * (1 - sag);
    skin.emissiveIntensity = (late ? 0.5 : 0.3) * (1 - sag);
    wood.emissiveIntensity = (late ? 0.08 : 0.04) * (1 + glow * 0.05) * (1 - sag);
  }

  return {
    root, kit, animate, height: 6.6,
    reset() {
      open = sag = 0;
      bury.dive = bury.depth = 0;
    },
    dispose() { kit.dispose(); },
  };
}
