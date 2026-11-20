// The Ossuary Cantor (entities/cantor.ts): a skeletal priest of the ossuary about seven metres tall, floating over the
// floor in layered grave vestments, its bones sculpted as the Ossuary Twins' are (models/ossuary.ts: distance fields
// meshed with surface nets, their hollows darkened in their vertex colours). From play, its first model read as a dark
// cone with a box for a head and stacked rings for ribs ("this looks like same picture", "full rework"):
// - its skull the crypt's skull made its own (a heavy brow over deep sockets with the grave light inside, sharp
//   cheekbones, hollow cheeks, a crack over the crown), a jaw of teeth hanging open on its hinges, under a crown of
//   bone spikes and guttering candles, framed by a hood drawn up behind it;
// - a ribcage of ribs curving back from a spine of vertebrae, round its sides and down to a breastbone through
//   cartilage, the lower ribs' cartilage joining the one above, a bronze bell hung inside for a heart;
// - a halo of nine small sculpted skulls turning behind it on a ring, a faint glow in their sockets;
// - its vestments in three layers: an under-robe to the floor torn into tongues, a robe of black over it from the
//   shoulders split open at the front over the ribs and ripped down the back, its hem in tatters, and a mantle over
//   the shoulders; ragged strips trailing from the hem into a mist that seeps from it (entities/cantor.ts);
// - long wide sleeves, torn, bony forearms and hands out of them, the right closed round its crozier (a bell-lantern
//   hung from its crook), the left a spread claw.
// For grave hands it raises both arms and drives them down on the hit; for a dirge it sweeps the crozier out; its jaw
// opens with the chant (`ActionState.hit`). With its weak-spot window open its ribs swing apart and the bell-heart
// beats at a pulse a second; its candles flare from its second phase, its halo turns faster in its last. Drawn in its
// crowd (models/crowd.ts): every change is a joint's place or a glow's strength, nothing hidden.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, lathe, limb, organic, rag, skipping, taperTube } from './shapes';
import { ellipsoid, fieldOf, IDENTITY, type Part, type Shape } from './sdf';
import { netGeometry, skullParts } from '../../world/skull';
import { capsule, finger, forearm, jaw as sculptedJaw, JAW_HINGE, mirrored, skull as cryptSkull, SKULL_EYE, SKULL_NECK,
  sternum, toned, vertebra } from './ossuary';
import { mulberry } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
/** a geometry made only where the kind's pieces aren't replayed (models/shapes.ts) */
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** its measures (m): the hem's height, the waist's, the heart's, the shoulders', the skull's; the arm's two bones */
const HEM_Y = 0.55, WAIST_Y = 3.0, HEART_Y = 3.95, SHOULDER_Y = 4.75, SKULL_Y = 5.35, UPPER = 1.35, FORE = 1.3;
/** how far it rises and falls as it floats (m), and its ribs' swing open with its heart bared (rad) */
const BOB = 0.16, RIBS_OPEN = 0.5;
const GRAVE = 0x5fe8a8;
/** how much larger than a man's its skull is drawn, and its halo's skulls */
const SKULL_K = 3.0, HALO_K = 1.8;
/** where its robe ends, the rip down the robe's back from `RIP[0]` to `RIP[1]` (m), and the robe's open front: the
 *  angle each side of its middle it parts at below, and how much wider over the ribs (rad) */
const ROBE_Y = 1.05, RIP = [2.55, 4.1] as const, FRONT = Math.PI * 0.14, CHEST_OPEN = 0.4;

type P3 = [number, number, number];
type Profile = readonly (readonly [number, number])[];

/** a profile's radius at `y` (its points bottom to top) */
function rAt(profile: Profile, y: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    if (y <= y1) return r0 + (r1 - r0) * THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
  }
  return profile[profile.length - 1][0];
}

/** The vestments' folds: a share of the radius by the angle round it and the height, deepest at the hem. Every piece
 *  of cloth and what's sewn on it takes the same, so a band lies in the robe's folds and never floats off them. */
function folds(phi: number, y: number): number {
  const k = THREE.MathUtils.clamp((WAIST_Y + 0.2 - y) / 2.4, 0.25, 1);
  return 1 + k * (0.09 * Math.sin(phi * 11 + 1.6 * Math.sin(phi * 3)) + 0.035 * Math.sin(phi * 23 + 0.8));
}

/** A lathe of cloth (`profile` bottom to top, so its faces point out) from `phi0` round `len`, laid in `folds`, its
 *  foot torn into tongues hanging down to `tear` m, its columns moved round by `shift` (an opening's edges). */
function cloth(profile: Profile, segs: number, o: {
  phi0?: number; len?: number; tear?: number; seed?: number; shift?: (phi: number, y: number) => number;
} = {}): THREE.BufferGeometry {
  const phi0 = o.phi0 ?? 0, len = o.len ?? Math.PI * 2, n = profile.length;
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segs, phi0, len);
  const p = g.attributes.position, rnd = mulberry(o.seed ?? 1);
  const cuts = Array.from({ length: segs + 1 }, () => rnd());
  if (len >= Math.PI * 2 - 1e-6) cuts[segs] = cuts[0];
  for (let i = 0; i <= segs; i++) {
    for (let j = 0; j < n; j++) {
      const [r, at] = profile[j];
      // (the lowest row torn into tongues, the one above it a little too, so the tears run up into the cloth)
      const torn = j === 0 ? 1 : j === 1 ? 0.25 : 0;
      const y = at - (o.tear ?? 0) * torn * Math.pow(cuts[i], 1.6);
      const base = phi0 + (i / segs) * len, phi = base + (o.shift?.(base, y) ?? 0), f = folds(phi, y);
      p.setXYZ(i * n + j, Math.sin(phi) * r * f, y, Math.cos(phi) * r * f);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A profile's rows every `step` m from `from` to `to`, its radius `r(y)`. */
function rows(from: number, to: number, step: number, r: (y: number) => number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = from; y < to - step * 0.5; y += step) out.push([r(y), y]);
  out.push([r(to), to]);
  return out;
}

/** The Cantor's own skull: the crypt's (world/skull.ts) with a heavier brow, deeper sockets, sharp cheekbones over
 *  hollow cheeks and a crack across its crown, meshed on `cell` in the crypt's skull's space (m, a man's). */
function cantorSkull(cell: number): THREE.BufferGeometry {
  const parts: Part[] = skullParts();
  const join = (shape: Shape, blend: number) => parts.push({ shape, frame: IDENTITY, blend, bones: [] });
  const cut = (shape: Shape, blend: number) => parts.push({ shape, frame: IDENTITY, blend, cut: true, bones: [] });
  join(ellipsoid(0, 0.089, 0.068, 0.061, 0.014, 0.022), 0.012);
  for (const s of [-1, 1]) {
    join(ellipsoid(s * 0.053, 0.056, 0.046, 0.024, 0.018, 0.028), 0.01);
    cut(ellipsoid(s * 0.028, 0.064, 0.084, 0.021, 0.021, 0.032), 0.006);
    cut(ellipsoid(s * 0.049, 0.028, 0.05, 0.012, 0.012, 0.02), 0.01);
  }
  cut(capsule([-0.03, 0.17, -0.03], [-0.012, 0.15, 0.04], 0.004, 0.004), 0.002);
  cut(capsule([-0.012, 0.15, 0.04], [-0.02, 0.112, 0.07], 0.004, 0.0035), 0.002);
  return netGeometry(fieldOf(parts), new THREE.Box3(V(-0.095, -0.012, -0.13), V(0.095, 0.19, 0.135)), cell, cell * 0.75);
}

/** `g` (made in a man's skull's space) moved so `origin` is at 0 and scaled `k`. */
const fromSkull = (g: THREE.BufferGeometry, origin: P3, k: number): THREE.BufferGeometry =>
  g.translate(-origin[0], -origin[1], -origin[2]).scale(k, k, k);

/** a point of a man's skull's space as its skull joint has it */
const onSkull = (x: number, y: number, z: number): P3 =>
  [(x - SKULL_NECK[0]) * SKULL_K, (y - SKULL_NECK[1]) * SKULL_K, (z - SKULL_NECK[2]) * SKULL_K];

/** A piece built for its left side (+x) added to `parent` for side `s`: mirrored for the right (models/ossuary.ts). */
function sided(S: Sculpt, g: () => THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, s: number): void {
  S.add(made(() => {
    const geo = g();
    const out = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    return s > 0 ? out : mirrored(out);
  }), mat, parent);
}

export function buildCantor(): Model {
  // (its edge as it dissolves its grave light's green, dimmed: a pale edge blew its fall out white, as the bell's did)
  const kit = createKit(0x2fb878);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // its bones, shaded by their vertex colours (each sculpted bone's hollows, the cartilage darker), the grave light
  // faint in their cracks: one material for all of them, as the Twins'
  const bone = kit.std({
    color: 0xd8ccae, roughness: 0.78, map: g.map, roughnessMap: g.roughnessMap, normalMap: g.normalMap, vertexColors: true,
    normalScale: new THREE.Vector2(1.0, 1.0), emissive: new THREE.Color(GRAVE), emissiveMap: veins(41, 5), emissiveIntensity: 0.15,
  });
  const darkBone = kit.std({ color: 0x8a7e66, roughness: 0.85, map: g.map, normalMap: g.normalMap });
  // its vestments: the under-robe a worn umber, the robe black-violet with a grave-green rim of light along its folds
  // (in the crypt's night a black robe read as a hole in the floor), the mantle an ashen grey-green over both, so each
  // layer reads against the next
  const under = kit.rim({
    color: 0x5e4a38, roughness: 0.92, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.6, 1.6), side: THREE.DoubleSide,
  }, 0x6a9a7e, 0.45);
  const robe = kit.rim({
    color: 0x2e2636, roughness: 0.92, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.8, 1.8), side: THREE.DoubleSide,
  }, 0x3f8a6e, 0.5);
  const mantle = kit.rim({
    color: 0x4e544a, roughness: 0.9, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(2, 2), side: THREE.DoubleSide,
  }, 0x6aa88a, 0.35);
  const bronze = kit.std({
    color: 0x9a6a2a, metalness: 0.55, roughness: 0.45, map: g.map, normalMap: g.normalMap,
    emissive: new THREE.Color(GRAVE), emissiveMap: veins(29, 6), emissiveIntensity: 0.6,
  });
  const iron = kit.std({ color: 0x3a3836, metalness: 0.8, roughness: 0.6, normalMap: g.normalMap });
  const wax = kit.std({ color: 0xd8ceb0, roughness: 0.6 });
  const heartGlow = kit.glow(0xb8ffd8, 5);
  // (the grave light inside its chest behind the bell, the ribs dark against it)
  const chestGlow = kit.glow(GRAVE, 0.6);
  const eye = kit.glow(0x9dffc4, 7);
  const flame = kit.glow(0xc8ffd0, 4);
  const lantern = kit.glow(0xa8ffd0, 5);

  const root = new THREE.Group();
  const S = new Sculpt('cantor').glow(heartGlow).glow(chestGlow).glow(eye).glow(flame).glow(lantern);
  const r = mulberry(53);
  const body = joint(root, 0, 0, 0);

  // --- its vestments ------------------------------------------------------------------------------------------
  // the under-robe, from the waist to the floor, its foot torn into tongues (bottom to top: faces out)
  const underProfile = [[1.78, HEM_Y], [1.74, HEM_Y + 0.45], [1.62, 1.3], [1.38, 1.9], [1.1, 2.45], [0.82, 2.85], [0.6, WAIST_Y + 0.1]] as const;
  S.add(made(() => organic(cloth(underProfile, 56, { tear: 0.45, seed: 3 }), 0.018, 4, 3)), under, body);
  // a band of runes in tarnished bronze sewn round its foot, lying in the cloth's folds
  {
    const y = 1.35, h = 0.06;
    const band = [[rAt(underProfile, y - h), y - h], [rAt(underProfile, y - h) + 0.035, y - h + 0.015],
      [rAt(underProfile, y + h) + 0.035, y + h - 0.015], [rAt(underProfile, y + h), y + h]] as const;
    S.add(made(() => cloth(band, 56)), bronze, body);
  }
  // the robe over it, from the shoulders to below the knees: open at the front, wider over the ribs, and ripped down
  // its back over the spine (each half its own lathe, the opening's and the rip's edges drawn apart)
  const robeR = (y: number): number => y < WAIST_Y ? rAt(underProfile, y) + 0.12
    : rAt([[rAt(underProfile, WAIST_Y) + 0.12, WAIST_Y], [0.96, 3.5], [0.9, 4.2], [0.82, SHOULDER_Y - 0.05], [0.36, SHOULDER_Y + 0.2]], y);
  const robeProfile = rows(ROBE_Y, SHOULDER_Y + 0.2, 0.14, robeR);
  const opening = (side: number) => (phi: number, y: number): number => {
    // (the front's edges: drawn apart over the chest, the bone and the bell seen between them)
    const edge = side < 0 ? phi - FRONT : (Math.PI * 2 - FRONT) - phi;
    const chest = THREE.MathUtils.smoothstep(y, WAIST_Y - 0.3, WAIST_Y + 0.5) * (1 - THREE.MathUtils.smoothstep(y, SHOULDER_Y - 0.3, SHOULDER_Y + 0.1));
    let shift = -side * CHEST_OPEN * chest * Math.max(0, 1 - edge / (Math.PI * 0.3));
    // (the rip down its back: wider at its middle, bitten at every row)
    if (y > RIP[0] && y < RIP[1]) {
      const t = (y - RIP[0]) / (RIP[1] - RIP[0]), d = Math.abs(phi - Math.PI);
      const w = 0.24 * Math.pow(Math.sin(Math.PI * t), 0.7) * (0.75 + 0.25 * Math.sin(y * 31));
      shift += side * w * Math.max(0, 1 - d / (Math.PI * 0.25));
    }
    return shift;
  };
  S.add(made(() => organic(cloth(robeProfile, 30, { phi0: FRONT, len: Math.PI - FRONT, tear: 0.6, seed: 11, shift: opening(-1) }), 0.02, 4, 11)), robe, body);
  S.add(made(() => organic(cloth(robeProfile, 30, { phi0: Math.PI, len: Math.PI - FRONT, tear: 0.6, seed: 12, shift: opening(1) }), 0.02, 4, 12)), robe, body);
  // the mantle over the shoulders, to below the shoulder blades, open at the throat and torn at its foot
  const mantleProfile = [[1.08, 3.7], [1.06, 3.95], [1.02, 4.3], [0.94, SHOULDER_Y - 0.08], [0.7, SHOULDER_Y + 0.1], [0.38, SHOULDER_Y + 0.24]] as const;
  S.add(made(() => organic(cloth(mantleProfile, 40, { phi0: Math.PI * 0.2, len: Math.PI * 1.6, tear: 0.35, seed: 21 }), 0.05, 3, 21)), mantle, body);
  // its hood thrown back: a cowl gathered round the back of the neck, and the hood hanging from it down the mantle to a
  // point (drawn up behind the skull, a hood read from behind as a lump where its head should be)
  S.add(made(() => organic(new THREE.TorusGeometry(0.4, 0.15, 10, 22, Math.PI * 1.2).rotateX(-Math.PI / 2).rotateY(-Math.PI * 0.1), 0.05, 5, 8)),
    mantle, body, [0, SHOULDER_Y + 0.2, -0.08], [0, 0, 0], [1, 0.8, 1]);
  S.add(made(() => organic(lathe([[0.02, -1.0], [0.2, -0.7], [0.36, -0.35], [0.42, -0.1], [0.38, 0.02]], 18), 0.05, 4, 9)),
    mantle, body, [0, SHOULDER_Y + 0.12, -0.72], [0.22, 0, 0], [1, 1, 0.38]);
  // its rope belt round the under-robe's waist, the cord's two ends hanging from its knot
  const beltR = rAt(underProfile, WAIST_Y - 0.05) * 1.1;
  S.add(made(() => organic(new THREE.TorusGeometry(beltR, 0.07, 8, 32).rotateX(Math.PI / 2), 0.02, 9, 4)), darkBone, body, [0, WAIST_Y - 0.05, 0]);
  for (const x of [-0.18, 0.1]) {
    S.add(made(() => taperTube([V(x, WAIST_Y - 0.1, beltR), V(x + 0.03, WAIST_Y - 0.6, beltR + 0.12), V(x, WAIST_Y - 1.15, beltR + 0.28)],
      (t) => 0.045 * (1 - t * 0.3), 10, 5)), darkBone, body);
  }
  // the hem's tatters: long ragged strips round it, trailing, drifting with the hem (`hem`)
  const hem = joint(body, 0, HEM_Y + 0.05, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.15, len = 0.7 + r() * 0.7, w = 0.26 + r() * 0.2, rr = rAt(underProfile, HEM_Y) * folds(a, HEM_Y) + 0.02;
    S.add(made(() => rag(w, len, 20 + i, 4)), i % 3 ? under : robe, hem, [Math.sin(a) * rr, 0, Math.cos(a) * rr], [0.12, a, 0]);
  }

  // --- its spine, its ribs and its breastbone, the bell-heart inside -------------------------------------------
  for (let i = 0; i < 12; i++) {
    const y = WAIST_Y - 0.3 + i * 0.165;
    for (const piece of [0, 1, 2, 3]) S.add(made(() => vertebra(0.075, 0.12)[piece]), bone, body, [0, y, -0.34]);
  }
  S.add(made(() => toned(sternum(0.95), 0.95)), bone, body, [0, SHOULDER_Y - 0.12, 0.46], [0.12, 0, 0]);
  // each side's ribs on a joint at the spine, swinging open from the back like a door (`ribs`): each from its
  // vertebra back and out, round the side and down to the front, then cartilage on to the breastbone (the lower ribs'
  // to the cartilage above)
  const ribs: THREE.Group[] = [];
  const WIDE = [0.38, 0.5, 0.58, 0.63, 0.66, 0.67, 0.66, 0.62, 0.56, 0.48];
  for (const s of [1, -1]) {
    const side = joint(body, s * 0.06, 0, -0.34);
    ribs.push(side);
    const at = (x: number, y: number, z: number) => V(x - s * 0.06, y, z + 0.34);
    for (let i = 0; i < WIDE.length; i++) {
      const yb = SHOULDER_Y - 0.12 - i * 0.135, w = WIDE[i], drop = 0.3 + 0.02 * i, floating = i >= 7;
      const end = at(s * w * 0.72, yb - drop * 0.9, floating ? 0.26 : 0.36);
      S.add(made(() => toned(taperTube([at(s * 0.09, yb, -0.34), at(s * w * 0.55, yb + 0.03, -0.44), at(s * w * 0.96, yb - drop * 0.25, -0.2),
        at(s * w, yb - drop * 0.55, 0.08), end], (t) => 0.044 * (1 - t * 0.3), 18, 6))), bone, side);
      // (cartilage, darker, on to the breastbone or up to the rib above's)
      const to = floating ? at(s * (0.32 - (i - 7) * 0.05), SHOULDER_Y - 0.12 - 6 * 0.135 - 0.33 + (i - 7) * 0.04, 0.42)
        : at(s * 0.08, SHOULDER_Y - 0.2 - i * 0.12, 0.47);
      const mid = end.clone().lerp(to, 0.5).add(V(0, -0.03, 0.05));
      S.add(made(() => toned(taperTube([end, mid, to], (t) => 0.032 * (1 - t * 0.25), 8, 5), 0.68)), bone, side);
    }
  }
  // the collarbones and the shoulder blades
  for (const s of [1, -1]) {
    S.add(made(() => toned(taperTube([V(s * 0.06, SHOULDER_Y + 0.02, 0.44), V(s * 0.35, SHOULDER_Y + 0.12, 0.3), V(s * 0.62, SHOULDER_Y + 0.08, 0.02)],
      (t) => 0.045 * (1 - t * 0.2), 10, 6))), bone, body);
  }
  // the bell-heart: a small bronze bell hung in the ribcage, its light inside it (`heart`)
  const heart = joint(body, 0, HEART_Y + 0.25, 0.02);
  S.add(made(() => organic(lathe([[0.3, -0.5], [0.32, -0.47], [0.24, -0.38], [0.19, -0.25], [0.18, -0.1], [0.14, -0.03], [0.06, 0], [0.01, 0.01]], 24), 0.01, 4, 31)), bronze, heart);
  S.add(made(() => new THREE.SphereGeometry(0.19, 12, 10)), heartGlow, heart, [0, -0.38, 0]);
  S.add(made(() => new THREE.SphereGeometry(1, 14, 10)), chestGlow, body, [0, HEART_Y + 0.1, -0.08], [0, 0, 0], [0.24, 0.34, 0.12]);
  S.add(made(() => new THREE.TorusGeometry(0.06, 0.02, 5, 10)), iron, heart, [0, 0.04, 0], [0, Math.PI / 2, 0]);

  // --- its skull, its hood, its crown of spikes and candles, its halo of skulls --------------------------------
  const neck = joint(body, 0, SHOULDER_Y + 0.1, -0.12);
  for (let i = 0; i < 3; i++) {
    for (const piece of [0, 1]) S.add(made(() => vertebra(0.075, 0.1)[piece]), bone, neck, [0, 0.07 + i * 0.13, 0]);
  }
  const skull = joint(neck, 0, SKULL_Y - SHOULDER_Y - 0.1, 0.06);
  S.add(made(() => fromSkull(cantorSkull(0.0062), SKULL_NECK, SKULL_K)), bone, skull);
  // its eyes: the grave light deep in each socket
  // (small and deep: a socket's dark round it, the light a point in it; filling the socket it read as two lamps)
  for (const s of [-1, 1]) S.add(made(() => new THREE.SphereGeometry(0.022, 10, 8)), eye, skull, onSkull(s * SKULL_EYE[0], SKULL_EYE[1] - 0.002, SKULL_EYE[2] - 0.022));
  // the jaw on its hinges, hanging open, falling further with the chant (`jaw`)
  const jaw = joint(skull, ...onSkull(...JAW_HINGE));
  S.add(made(() => fromSkull(sculptedJaw(0.0065), JAW_HINGE, SKULL_K)), bone, jaw);
  // the crown on its brow: a band of bone, spikes rising from it, five candles among them, each a flame
  const crownY = onSkull(0, 0.137, 0)[1], crownZ = onSkull(0, 0, -0.01)[2], crownX = 0.17, crownZr = 0.23;
  S.add(made(() => organic(new THREE.TorusGeometry(1, 0.17, 6, 28).rotateX(Math.PI / 2), 0.03, 8, 45)), darkBone, skull, [0, crownY, crownZ], [0, 0, 0], [crownX + 0.02, 0.2, crownZr + 0.02]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, h = i % 2 ? 0.26 : 0.42 + r() * 0.12;
    S.add(made(() => taperTube([V(0, 0, 0), V(Math.sin(a) * 0.05, h * 0.6, Math.cos(a) * 0.05), V(Math.sin(a) * 0.12, h, Math.cos(a) * 0.12)], (t) => 0.032 * (1 - t), 6, 5)),
      darkBone, skull, [Math.sin(a) * (crownX + 0.03), crownY, crownZ + Math.cos(a) * (crownZr + 0.03)]);
  }
  for (let i = 0; i < 5; i++) {
    const a = ((i - 2) / 5) * Math.PI * 1.3, h = 0.16 + r() * 0.12;
    const at: P3 = [Math.sin(a) * (crownX + 0.03), crownY + 0.02, crownZ + Math.cos(a) * (crownZr + 0.03)];
    S.add(made(() => organic(new THREE.CylinderGeometry(0.035, 0.04, h, 8).translate(0, h / 2, 0), 0.008, 12, 46 + i)), wax, skull, at);
    S.add(made(() => new THREE.SphereGeometry(1, 8, 6)), flame, skull, [at[0], at[1] + h + 0.05, at[2]], [0, 0, 0], [0.025, 0.06, 0.025]);
  }
  // the halo behind it: a ring of bone and iron, nine small skulls on it looking out, turning (`halo`)
  const halo = joint(neck, 0, SKULL_Y - SHOULDER_Y + 0.15, -0.6);
  S.add(made(() => organic(new THREE.TorusGeometry(1.15, 0.035, 6, 64), 0.01, 10, 50)), iron, halo);
  S.add(made(() => organic(new THREE.TorusGeometry(1.0, 0.025, 6, 64), 0.01, 10, 51)), darkBone, halo);
  let haloSkull: THREE.BufferGeometry | null = null;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, x = Math.sin(a) * 1.15, y = Math.cos(a) * 1.15;
    // (each looking ahead, its crown out from the ring: looking out round it, those at its sides showed only a profile,
    // grey eggs from the front)
    const up = V(Math.sin(a), Math.cos(a), 0), face = V(0, 0, 1), across = up.clone().cross(face);
    const m = new THREE.Matrix4().makeBasis(across, up, face).multiply(new THREE.Matrix4().makeScale(HALO_K, HALO_K, HALO_K))
      .multiply(new THREE.Matrix4().makeTranslation(0, -0.08, -0.005));
    S.add(made(() => (haloSkull ??= cryptSkull(0.02)).clone().applyMatrix4(m)), bone, halo, [x, y, 0]);
    for (const s of [-1, 1]) {
      const e = V(s * SKULL_EYE[0], SKULL_EYE[1], SKULL_EYE[2] - 0.01).applyMatrix4(m);
      S.add(made(() => new THREE.SphereGeometry(0.022, 6, 5)), eye, halo, [x + e.x, y + e.y, e.z]);
    }
    // (spokes from each skull in towards the inner ring)
    S.add(made(() => taperTube([V(x * 0.93, y * 0.93, 0), V(x * 0.87, y * 0.87, 0)], () => 0.02, 2, 4)), darkBone, halo);
  }

  // --- its arms: bony forearms and hands out of long torn sleeves, the right on its crozier, the left a claw ----
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [], hand: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const sh = joint(body, s * 0.64, SHOULDER_Y, -0.02);
    S.add(made(() => organic(new THREE.SphereGeometry(0.12, 10, 8), 0.04, 6, 70)), darkBone, sh);
    S.add(made(() => organic(limb(UPPER, 0.07, 0.055, 0.1, 0.3, 10), 0.01, 10, 71)), darkBone, sh);
    // the sleeve: a long wide bell of cloth from the shoulder to past the elbow, in folds, its foot torn into tongues,
    // rags hanging from it
    S.add(made(() => organic(cloth([[0.66, -UPPER - 0.75], [0.58, -UPPER - 0.35], [0.4, -UPPER * 0.6], [0.24, -0.2], [0.16, 0.12]], 26, { tear: 0.5, seed: 72 + s }), 0.03, 4, 72)), robe, sh);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (0.6 + i * 0.4), len = 0.5 + r() * 0.4;
      S.add(made(() => rag(0.22, len, 60 + i + s, 4)), robe, sh, [Math.sin(a) * 0.62, -UPPER - 0.65, Math.cos(a) * 0.62], [0.1, a, 0]);
    }
    const el = joint(sh, 0, -UPPER, 0);
    // (the forearm's two bones, the ulna's hook up behind the elbow: models/ossuary.ts)
    sided(S, () => forearm(FORE, 0.05), bone, el, s);
    const hd = joint(el, 0, -FORE, 0);
    // the hand: its bones splayed from the wrist, a finger of three bones on each, the thumb set across
    const grip = s > 0;
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.05, len = 0.2 - Math.abs(f - 1.5) * 0.02;
      sided(S, () => toned(taperTube([V(0, -0.02, 0), V(fx * 0.8, -0.1, 0.01), V(fx, -len, 0.02)], (t) => 0.024 * (1 - t * 0.2), 4, 5), 0.9), bone, hd, s);
      const knuckle = V(fx, -len, 0.02);
      for (const piece of finger(V(fx * 0.4, -1, 0.05), [0.17, 0.12, 0.09], grip ? 1.0 : 0.4, 0.022)) {
        sided(S, () => piece.clone().translate(knuckle.x, knuckle.y, knuckle.z), bone, hd, s);
      }
    }
    for (const piece of finger(V(-0.6, -0.7, 0.4), [0.13, 0.1], grip ? 0.8 : 0.3, 0.024)) {
      sided(S, () => piece.clone().translate(-0.07, -0.06, 0.03), bone, hd, s);
    }
    shoulder.push(sh); elbow.push(el); hand.push(hd);
  }
  // the crozier in the right hand: a shaft of bound bone, its crook a curl of vertebrae, a bell-lantern hung from it
  const crozier = joint(hand[0], 0, -0.3, 0.12);
  S.add(made(() => organic(new THREE.CylinderGeometry(0.05, 0.06, 6.2, 10).translate(0, 0.9, 0), 0.008, 14, 80)), darkBone, crozier);
  for (let i = 0; i < 7; i++) S.add(made(() => new THREE.TorusGeometry(0.065, 0.018, 5, 12).rotateX(Math.PI / 2)), iron, crozier, [0, -1.4 + i * 0.75, 0]);
  const crook: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 1.45;
    crook.push(V(Math.sin(a) * 0.42, 4.0 + (1 - Math.cos(a)) * 0.42 + i * 0.008, 0));
  }
  crook.unshift(V(0, 3.9, 0));
  S.add(made(() => toned(taperTube(crook, (t) => 0.07 * (1 - t * 0.5), 26, 7))), bone, crozier);
  // (knobs of vertebrae along the crook's back)
  for (let i = 2; i < crook.length; i += 2) {
    S.add(made(() => toned(organic(new THREE.SphereGeometry(0.06, 8, 6), 0.1, 5, 81 + i), 0.85)), bone, crozier, [crook[i].x * 1.08, crook[i].y + 0.02, 0]);
  }
  const lamp = joint(crozier, crook[crook.length - 1].x, crook[crook.length - 1].y - 0.05, 0);
  for (let i = 0; i < 3; i++) S.add(made(() => new THREE.TorusGeometry(0.035, 0.012, 4, 8)), iron, lamp, [0, -0.05 - i * 0.08, 0], [0, i % 2 ? Math.PI / 2 : 0, 0]);
  S.add(made(() => organic(lathe([[0.17, -0.55], [0.18, -0.52], [0.13, -0.44], [0.11, -0.34], [0.09, -0.28], [0.03, -0.25], [0.005, -0.24]], 18), 0.01, 4, 90)), bronze, lamp);
  S.add(made(() => new THREE.SphereGeometry(0.09, 10, 8)), lantern, lamp, [0, -0.45, 0]);
  S.build();
  (haloSkull as THREE.BufferGeometry | null)?.dispose();
  // (where its skull is, for the lab's close pictures of it: `lab boss --parts cantorLook`)
  root.userData.skull = skull;

  let open = 0, flare = 0, spin = 0;

  function animate(st: AnimState): void {
    const { t, dt } = st, look = st.boss, a = st.action;
    const dead = st.dead >= 0 ? st.dead : 0;
    const k = 1 - Math.exp(-dt * 3);
    // (floating: risen and falling slowly, leaning a little with its glide; sinking and tipping forward as it falls)
    body.position.y = 0.35 + Math.sin(t * 0.9) * BOB - dead * 1.2;
    body.rotation.x = st.move * 0.08 + dead * 0.5;
    body.rotation.z = Math.sin(t * 0.6) * 0.025;
    hem.rotation.x = Math.sin(t * 1.1) * 0.05 + st.move * 0.12;
    hem.rotation.z = Math.sin(t * 0.8 + 1) * 0.04;

    // its arms at rest: hanging forward a little, the crozier planted ahead, the claw half open
    let raise = 0, slam = 0, sweep = 0, chant = 0;
    if (a && (a.name === 'graveHands' || a.name === 'dirge')) {
      const h = a.hit ?? 0.5;
      chant = ramp(a.t, 0, h * 0.6) * (1 - ramp(a.t, h, Math.min(1, h + 0.25)));
      if (a.name === 'graveHands') {
        // (both arms raised over the warning, driven down on the hit, lowered after)
        raise = ramp(a.t, 0, h * 0.85) * (1 - ramp(a.t, h * 0.85, h));
        slam = ramp(a.t, h * 0.85, h) * (1 - ramp(a.t, h + 0.05, 1));
      } else {
        // (the crozier drawn back over the warning, swept out along the dirge on the hit)
        raise = ramp(a.t, 0, h * 0.9) * 0.5 * (1 - ramp(a.t, h * 0.9, h));
        sweep = ramp(a.t, h * 0.8, h) * (1 - ramp(a.t, h + 0.1, 1));
      }
    }
    const idle = Math.sin(t * 0.7) * 0.05;
    // right arm (the crozier's)
    shoulder[0].rotation.set(-0.35 - raise * 2.3 - slam * 1.0 - sweep * 1.3 + idle, 0, 0.18 + raise * 0.35 - sweep * 0.2);
    elbow[0].rotation.x = -0.75 + raise * 0.5 + slam * 0.4 + sweep * 0.55;
    hand[0].rotation.x = 0.6 - sweep * 0.4;
    // left arm (the claw), held up before it at rest, its claw spread towards the hero
    shoulder[1].rotation.set(-0.65 - raise * 2.0 - slam * 0.7 + idle * 0.8, 0, -0.18 - raise * 0.35 - sweep * 0.4);
    elbow[1].rotation.x = -1.25 + raise * 1.1 + slam * 0.9;
    hand[1].rotation.x = 0.55 - raise * 0.3 + slam * 0.2;
    // (its jaw hanging open, dropping further with the chant)
    jaw.rotation.x = 0.12 + chant * (0.35 + 0.08 * Math.sin(t * 7)) + dead * 0.4;
    skull.rotation.x = -0.1 - raise * 0.25 + slam * 0.2 + dead * 0.3;
    neck.rotation.y = Math.sin(t * 0.35) * 0.08;

    // its ribs swing open with its heart bared, eased; its heart beats a pulse a second then
    const bared = !!look && look.weak > 0;
    open += ((bared ? 1 : 0) - open) * (1 - Math.exp(-dt * 5));
    ribs[0].rotation.y = open * RIBS_OPEN;
    ribs[1].rotation.y = -open * RIBS_OPEN;
    heart.position.z = 0.02 + open * 0.18;
    heart.rotation.z = Math.sin(t * 2.2) * (0.06 + 0.12 * chant);
    const beat = bared ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2) : 0;
    heartGlow.emissiveIntensity = 4 + chant * 4 + beat * 6;
    bronze.emissiveIntensity = 0.5 + chant * 1.2 + beat * 1.6;
    bone.emissiveIntensity = 0.12 + chant * 0.35 + open * 0.2;

    // its candles flare from its second phase, its halo turns faster in its last (eased, never a flash)
    const phase = look?.phase ?? 0;
    flare += ((phase >= 1 ? 1 : 0) - flare) * k;
    flame.emissiveIntensity = 3 + flare * 3 + Math.sin(t * 5.3) * 0.4;
    eye.emissiveIntensity = 5 + chant * 3 + (look?.warded ? 2 : 0);
    lantern.emissiveIntensity = 4 + chant * 3 + sweep * 3;
    spin += dt * (phase >= 2 ? 0.75 : 0.25);
    // (tipped back, so the view from above sees its ring and its skulls, turning in its own plane)
    halo.rotation.set(-0.5, 0, spin);
    halo.position.y = SKULL_Y - SHOULDER_Y + 0.15 + Math.sin(t * 1.3) * 0.04;
    // the lantern swinging under the crook
    lamp.rotation.z = Math.sin(t * 1.4) * 0.15 - sweep * 0.5;
    lamp.rotation.x = Math.sin(t * 1.1) * 0.1;
  }

  return {
    root, kit, animate, height: 6.2,
    reset() { open = flare = spin = 0; },
    dispose() { kit.dispose(); },
  };
}
