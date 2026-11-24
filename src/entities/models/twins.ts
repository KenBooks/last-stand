// The Ossuary Twins (entities/twins.ts): two tall skeletons of the crypt's dead, about five and a half metres tall,
// every bone of them sculpted (models/ossuary.ts): a skull with its sockets, brow, cheekbones and a hinged jaw of teeth;
// a spine of vertebrae from the sacrum to the skull; ribs curving round from it to a breastbone on their cartilage,
// the lowest ones floating; shoulder blades on the back; a pelvis of flared wings; thighbones on their balls,
// shinbones beside their fibulae; arms whose forearms are two bones; hands and feet of jointed bones. Grave light
// seeps from their eyes and the runes of their cloth.
//
// - **Slab** (`buildTwinSlab`): broad and heavy, his bones thick, bare to the waist but for battered iron: pauldrons of
//   three riveted lames, bracers, knee cops. A yoke of five skulls across his upper back, a torn shawl off one
//   shoulder, a loincloth of layered aprons and tongues of grave cloth on a knotted belt, rope bound round his limbs.
//   His weapon a tombstone, its foot broken off, its face carved with a ringed cross and runes that glow ember with a
//   slam: lifted over his head through its warning and brought down on its hit; for a charge he drops his shoulder and
//   leans into it. A chain of bone links hangs from his belt to his brother (`root.userData.layChain`, laid by the game
//   each frame: its own meshes of added light, sagging slack and drawn straight and
//   bright as it nears its reach).
// - **Reliquary** (`buildTwinReliquary`): tall and thin, its bones fine, hooded, a ragged capelet over its shoulders, a
//   long robe open at the front over its legs, torn sleeves; a string of vertebrae for prayer beads, a bronze circlet.
//   It holds a bronze reliquary before its chest, a skull behind its grille, and five skulls circle it: they spin
//   faster and the casket is raised as a volley builds, and raised high, its light swelling, through a mend.
// Both stagger and fold up as they fall; from the second phase (the other fallen) its eyes and runes burn brighter.
// Each carries four small skulls on a rope at its waist (`root.userData.belt`, laid by the game each frame: Slab's
// bombs, their eyes a hot orange; Reliquary's poison, a sickly green), a hand unhooking one, drawing it back over its
// shoulder and throwing it (the `bomb` and `poison` actions); the one left standing at half wears its brother's too.
// Drawn in their crowds (models/crowd.ts): every change is a joint's place or a glow's strength.
import * as THREE from 'three';
import { additive, createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, organic, skipping, taperTube, twist } from './shapes';
import {
  drape, femur, finger, forearm, humerus, jaw, JAW_HINGE, mirrored, pelvis, scapula, skull, SKULL_EYE, SKULL_NECK,
  sternum, THIRD_EYE, tibia, toned, twinSkull, vertebra, type SkullLook,
} from './ossuary';
import { BELT_K, beltSkullMesh, HOOK_TOP, SKULL_DROP, type SkullKind } from './beltSkull';
import type { AnimState, MaterialKit, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());
const CHAIN = 0xffd890, EMBER = 0xffb060, COLD = 0x8fe8ff;
type P3 = [number, number, number];

/** the grids (m, a man's skull's units) the main skull, its jaw, and the small skulls round it are meshed on */
const SKULL_CELL = 0.0092, JAW_CELL = 0.0082, SMALL_SKULL_CELL = 0.019, SMALL_JAW_CELL = 0.016;

/** a figure's measures (m): its hips' height, its shoulders', its skull's; its bones' thickness; its width's scale; its
 *  arm's two bones; its skull's scale over a man's; its hand's length and its foot's height; how its fingers curl */
interface Frame {
  hip: number; shoulder: number; skull: number; thick: number; wide: number; upper: number; fore: number;
  head: number; hand: number; foot: number; look: SkullLook;
}

/** What both twins are made of: the materials, and a body's joints. */
interface Body {
  root: THREE.Group; body: THREE.Group; chest: THREE.Group; neck: THREE.Group; skull: THREE.Group; jaw: THREE.Group;
  thigh: THREE.Group[]; shin: THREE.Group[]; shoulder: THREE.Group[]; elbow: THREE.Group[]; hand: THREE.Group[];
  bone: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; cloth: THREE.Material; rune: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial; S: Sculpt;
  /** where its chest's parts are (m, in the chest's space): the spine's depth, the ribcage's front at the breastbone's
   *  top and foot, the belt's height and radius (in the body's) */
  spineZ: number; beltY: number; beltR: number; hipX: number;
}

/** Adds `g` on `parent` (where `s` is 1) or its mirror image on the other side (-1), at `pos` mirrored with it. */
function sided(S: Sculpt, g: () => THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, s: number,
  pos: P3 = [0, 0, 0], rot: P3 = [0, 0, 0], scale: number | P3 = 1): void {
  const placed = (): THREE.BufferGeometry => {
    const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      typeof scale === 'number' ? V(scale, scale, scale) : V(...scale));
    const geo = g();
    const out = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    geo.dispose();
    return s > 0 ? out : mirrored(out);
  };
  S.add(made(placed), mat, parent);
}

/** A man's skull and jaw meshed once a grid, shared by every twin and every skull round them (each piece a copy). */
const meshed = new Map<string, THREE.BufferGeometry>();
function kept(key: string, f: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = meshed.get(key);
  if (!g) meshed.set(key, (g = f()));
  return g.clone();
}

/** A skull with its jaw shut on `parent`, `k` times a man's, facing +z turned by `rot`, glowing eyes in its sockets:
 *  the small skulls of a mantle or an orbit. */
function smallSkull(b: Body, parent: THREE.Object3D, at: P3, rot: P3, k: number,
  [skullCell, jawCell]: [number, number] = [SMALL_SKULL_CELL, SMALL_JAW_CELL]): void {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  const off = V(...SKULL_NECK).multiplyScalar(-k).applyQuaternion(q);
  const pos: P3 = [at[0] + off.x, at[1] + off.y, at[2] + off.z];
  b.S.add(made(() => kept(`skull ${skullCell}`, () => skull(skullCell))), b.bone, parent, pos, rot, k);
  b.S.add(made(() => kept(`jaw ${jawCell}`, () => jaw(jawCell))), b.bone, parent, pos, rot, k);
  for (const s of [-1, 1]) {
    const eye = V(s * SKULL_EYE[0], SKULL_EYE[1], SKULL_EYE[2] - 0.012).multiplyScalar(k).applyQuaternion(q);
    b.S.add(made(() => new THREE.SphereGeometry(0.009 * k, 6, 4)), b.eye, parent, [pos[0] + eye.x, pos[1] + eye.y, pos[2] + eye.z]);
  }
}

/** A hand's bones from the wrist (its joint) for the left side, palm to +z: the wrist's small bones, four metacarpals
 *  fanning to the knuckles, each finger's three phalanges curled by `curl` a joint, and the thumb set forward. */
function handBones(len: number, wide: number, curl: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const r = len * 0.034 * wide;
  out.push(toned(organic(new THREE.SphereGeometry(1, 10, 7), 0.12, 6, 3).scale(0.13 * len * wide, 0.09 * len, 0.06 * len).translate(0, -0.08 * len, 0), 0.85));
  for (let k = 0; k < 4; k++) {
    const x = (k - 1.5) * 0.072 * len * wide;
    const knuckle = V(x, -0.42 * len, 0.015 * len);
    out.push(toned(taperTube([V(x * 0.55, -0.13 * len, 0), V(x * 0.85, -0.28 * len, 0.008 * len), knuckle], (t) => r * (1.05 - t * 0.15), 4, 5)));
    const lengths = [0.2, 0.13, 0.09].map((l) => l * len * (1 - Math.abs(k - 1.4) * 0.09));
    for (const g of finger(V(x * 0.4, -1, 0.05), lengths, curl, r * 0.95)) out.push(g.translate(knuckle.x, knuckle.y, knuckle.z));
  }
  // the thumb, from the wrist's outer side, set forward of the palm
  const base = V(0.1 * len * wide, -0.12 * len, 0.03 * len), knuckle = V(0.17 * len * wide, -0.27 * len, 0.1 * len);
  out.push(toned(taperTube([base, base.clone().lerp(knuckle, 0.5), knuckle], (t) => r * (1.1 - t * 0.2), 3, 5)));
  for (const g of finger(V(0.35, -0.6, 0.7), [0.15 * len, 0.1 * len], curl * 0.7, r)) out.push(g.translate(knuckle.x, knuckle.y, knuckle.z));
  return out;
}

/** A foot's bones under the ankle for the left side, toes to +z, standing on y 0 of its own: the ankle's bone, the heel,
 *  the arch's small bones, five metatarsals and their toes, the great toe inside (-x). */
function footBones(h: number, wide: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const blob = (x: number, y: number, z: number, rx: number, ry: number, rz: number, seed: number): THREE.BufferGeometry =>
    toned(organic(new THREE.SphereGeometry(1, 10, 7), 0.1, 5, seed).scale(rx * h, ry * h, rz * h).translate(x * h, y * h, z * h), 0.9);
  out.push(blob(0, 0.78, 0.02, 0.5 * wide, 0.36, 0.55, 1), blob(0.05, 0.38, -0.45, 0.42 * wide, 0.4, 0.62, 2), blob(0, 0.52, 0.55, 0.58 * wide, 0.3, 0.45, 3));
  for (let k = 0; k < 5; k++) {
    const x = (k - 1.6) * 0.21 * h * wide, r = h * (k === 0 ? 0.13 : 0.085) * wide;
    const ball = V(x * 1.1, 0.12 * h, 1.45 * h);
    out.push(toned(taperTube([V(x * 0.55, 0.48 * h, 0.62 * h), V(x * 0.85, 0.3 * h, 1.05 * h), ball], (t) => r * (1 - t * 0.2), 4, 5)));
    const toes = (k === 0 ? [0.32, 0.24] : [0.24, 0.14, 0.1]).map((l) => l * h * (1 - k * 0.08));
    for (const g of finger(V(x * 0.15, -0.1, 1), toes, -0.25, r * 0.85)) out.push(g.translate(ball.x, ball.y, ball.z));
  }
  return out;
}

/** The bones and cloth both twins share, sized by `f`, in `light`'s grave light. */
function boneFigure(kind: string, kit: MaterialKit, f: Frame, light: number, seed: number): Body {
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // (bone shaded by its vertex colours: each sculpted bone's hollows, the cartilage darker; one material for all)
  const bone = kit.std({
    color: 0xe0d4b2, roughness: 0.78, map: g.map, roughnessMap: g.roughnessMap, normalMap: g.normalMap, vertexColors: true,
    normalScale: new THREE.Vector2(1.0, 1.0), emissive: new THREE.Color(light), emissiveMap: veins(seed, 5), emissiveIntensity: 0.15,
  });
  const dark = kit.std({ color: 0x5e5240, roughness: 0.9, map: g.map, normalMap: g.normalMap });
  // grave cloth, linen gone grey-brown, a rim of the grave light along its folds (a dark cloth read as a hole in the
  // crypt's night)
  const cloth = kit.rim({
    color: 0x5a5244, roughness: 0.95, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), side: THREE.DoubleSide,
  }, light, 0.35);
  const rune = kit.std({
    color: 0x6a6252, roughness: 0.9, map: g.map, normalMap: g.normalMap, side: THREE.DoubleSide,
    emissive: new THREE.Color(light), emissiveMap: veins(seed + 7, 4), emissiveIntensity: 0.6,
  });
  const eye = kit.glow(light, 6);
  const S = new Sculpt(kind).glow(eye);
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  const W = f.wide, T = f.thick, wide = Math.sqrt(W);
  const hipX = 0.32 * W, len = f.hip / 2;

  // --- legs: a thighbone on its ball, a shinbone and its fibula, a kneecap, a foot of bones -----------------------
  const thigh: THREE.Group[] = [], shin: THREE.Group[] = [];
  const legR = T * 0.55, shinLen = len - f.foot * 0.9;
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    const th = joint(body, s * hipX, f.hip, 0);
    sided(S, () => femur(len, legR), bone, th, s);
    const sh = joint(th, 0, -len, 0);
    sided(S, () => tibia(shinLen, legR * 0.95), bone, sh, s);
    S.add(made(() => toned(organic(new THREE.SphereGeometry(1, 10, 8), 0.06, 5, seed + 4), 0.92)), bone, sh, [0, 0.35 * legR, 1.75 * legR], [0.2, 0, 0], [legR * 1.1, legR * 1.35, legR * 0.55]);
    for (const piece of footBones(f.foot, wide)) sided(S, () => piece, bone, sh, s, [0, -len, 0]);
    thigh[i] = th;
    shin[i] = sh;
  }
  // the pelvis, its sockets on the thighbones' balls
  S.add(made(() => pelvis(hipX)), bone, body, [0, f.hip + 0.02 * hipX, -0.06 * hipX]);

  // --- trunk: the spine from the sacrum up, the ribs round to the breastbone, the shoulder blades and collarbones --
  const chest = joint(body, 0, f.hip + 0.35, 0);
  const span = f.shoulder - f.hip - 0.35;
  const spineZ = -0.27 * W;
  // (the lumbar vertebrae, thick and forward, then the thoracic, finer, back behind the ribs)
  const lumbar = 5, thoracic = 12;
  for (let i = 0; i < lumbar; i++) {
    const y = -0.32 * hipX + (i + 0.5) * (span * 0.27 + 0.32 * hipX) / lumbar, z = -0.42 * hipX + (spineZ + 0.42 * hipX) * (i / lumbar);
    const r = T * 0.62, h = (span * 0.27 + 0.32 * hipX) / lumbar * 0.72;
    for (const piece of vertebra(r, h)) S.add(made(() => piece), bone, chest, [0, y, z]);
    S.add(made(() => new THREE.CylinderGeometry(r * 0.95, r * 0.95, h * 0.35, 9)), dark, chest, [0, y + h * 0.68, z]);
  }
  for (let i = 0; i < thoracic; i++) {
    const y = span * (0.29 + i * 0.056), r = T * (0.44 - i * 0.008), h = span * 0.04;
    for (const piece of vertebra(r, h)) S.add(made(() => piece), bone, chest, [0, y, spineZ]);
    S.add(made(() => new THREE.CylinderGeometry(r * 0.95, r * 0.95, span * 0.016, 9)), dark, chest, [0, y + span * 0.028, spineZ]);
  }
  // the ribs: ten pairs, each from its vertebra back round its angle and forward, dropping to the front; the first
  // seven on their cartilage to the breastbone, the next two to the cartilage above, the last floating
  const sternTop = span * 0.78, sternLen = span * 0.38;
  const ribA = (i: number): number => W * (0.25 + 0.26 * Math.sin(Math.min(1, (i + 1) / 7.5) * Math.PI / 2));
  const ribB = (i: number): number => W * (0.2 + 0.15 * Math.sin(Math.min(1, (i + 1) / 7.5) * Math.PI / 2));
  const front = (i: number): number => spineZ - 0.04 * W + 2 * ribB(i);
  const sternZ = (y: number): number => front(0) + (front(6) - front(0)) * THREE.MathUtils.clamp((sternTop - y) / sternLen, 0, 1);
  const ribR = 0.028 * W;
  for (let i = 0; i < 10; i++) {
    const a = ribA(i), bb = ribB(i), zc = spineZ - 0.04 * W + bb, y0 = span * (0.9 - 0.068 * i), drop = span * (0.17 - 0.004 * i);
    const from = -Math.PI / 2 + 0.2, to = i < 7 ? Math.PI / 2 - 0.62 + 0.02 * i : i < 9 ? Math.PI / 2 - 0.8 : -0.15;
    const at = (phi: number, s: number): THREE.Vector3 => {
      const t = (phi - from) / (Math.PI - 0.4);
      const back = 0.05 * W * Math.exp(-(((phi + Math.PI / 2 - 0.55) / 0.3) ** 2));
      return V(s * a * Math.cos(phi), y0 + 0.035 * span * Math.sin(Math.min(1, t * 2.2) * Math.PI) - drop * Math.pow(Math.max(0, t), 1.4), zc + bb * Math.sin(phi) - back);
    };
    for (const s of [1, -1]) {
      const pts = [V(s * 0.06 * W, y0 + 0.01, spineZ - 0.02 * W)];
      for (let k = 0; k <= 7; k++) pts.push(at(from + (to - from) * (k / 7), s));
      S.add(made(() => toned(taperTube(pts, (t) => ribR * (1 - t * 0.3) * (i === 9 ? 0.8 : 1), 13, 5))), bone, chest);
      if (i === 9) continue;
      const end = pts[pts.length - 1];
      const attach = i < 7
        ? V(s * 0.055 * W, sternTop - sternLen * 0.06 - i * sternLen * 0.13, sternZ(sternTop - sternLen * 0.06 - i * sternLen * 0.13))
        : V(s * 0.1 * W, sternTop - sternLen * 0.93 + (8 - i) * 0.02 * span, front(6) - 0.02 * W);
      const mid = V(s * (Math.abs(end.x) * 0.45 + 0.04 * W), (end.y + attach.y) / 2 - 0.01, (end.z + attach.z) / 2 + 0.03 * W);
      S.add(made(() => toned(taperTube([end, mid, attach], () => ribR * 0.62, 8, 5), 0.66)), bone, chest);
    }
  }
  S.add(made(() => sternum(sternLen)), bone, chest, [0, sternTop, front(0)], [-Math.atan2(front(6) - front(0), sternLen), 0, 0]);
  for (const s of [1, -1]) {
    // a shoulder blade on the back, its socket under the shoulder; a collarbone from the breastbone's top out to it
    sided(S, () => scapula(span * 0.44), bone, chest, s, [0.56 * W, span - 0.06, spineZ + 0.1 * W], [0, -0.45, 0.08]);
    S.add(made(() => toned(taperTube([V(s * 0.06 * W, sternTop + 0.02, front(0) - 0.01), V(s * 0.25 * W, span * 0.86, front(0) + 0.02 * W),
      V(s * 0.45 * W, span * 0.93, 0.02 * W), V(s * 0.58 * W, span + 0.0, -0.06 * W)], (t) => ribR * (1.25 - Math.sin(t * Math.PI) * 0.35), 12, 6))), bone, chest);
  }

  // --- neck and skull ---------------------------------------------------------------------------------------------
  const neck = joint(chest, 0, span + 0.05, spineZ + 0.12 * W);
  const k = f.head;
  const skullUp = f.skull - f.shoulder;
  // (the neck's vertebrae well behind the jaw: under the skull's middle, the top one showed in the jaw's curve)
  for (let i = 0; i < 5; i++) {
    const r = T * 0.3;
    for (const piece of vertebra(r, skullUp * 0.12)) S.add(made(() => piece), bone, neck, [0, skullUp * (0.08 + i * 0.16), -0.05 * k + i * 0.004 * k]);
  }
  const head = joint(neck, 0, skullUp, 0.06);
  S.add(made(() => kept(`${f.look} skull ${SKULL_CELL}`, () => twinSkull(SKULL_CELL, f.look))), bone, head, [-SKULL_NECK[0] * k, -SKULL_NECK[1] * k, -SKULL_NECK[2] * k], [0, 0, 0], k);
  if (f.look === 'long') {
    S.add(made(() => new THREE.SphereGeometry(0.006 * k, 8, 6)), eye, head, [0, (THIRD_EYE[1] - SKULL_NECK[1]) * k, (THIRD_EYE[2] - 0.006 - SKULL_NECK[2]) * k]);
  }
  for (const s of [-1, 1]) {
    // (small and deep in its socket: as large as the socket the glow filled it, a disc where the hollow should read)
    S.add(made(() => new THREE.SphereGeometry(0.0068 * k, 8, 6)), eye, head, [s * SKULL_EYE[0] * k, (SKULL_EYE[1] - SKULL_NECK[1]) * k, (SKULL_EYE[2] - 0.012 - SKULL_NECK[2]) * k]);
  }
  const jw = joint(head, 0, (JAW_HINGE[1] - SKULL_NECK[1]) * k, (JAW_HINGE[2] - SKULL_NECK[2]) * k);
  S.add(made(() => kept(`jaw ${JAW_CELL}`, () => jaw(JAW_CELL))), bone, jw, [0, -JAW_HINGE[1] * k, -JAW_HINGE[2] * k], [0, 0, 0], k);

  // --- arms: the upper arm's bone on its head, the forearm's two, a hand of jointed bones ---------------------------
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [], hand: THREE.Group[] = [];
  const armR = T * 0.48;
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    const sh = joint(chest, s * 0.6 * W, span - 0.05, 0);
    sided(S, () => humerus(f.upper, armR), bone, sh, s);
    const el = joint(sh, 0, -f.upper, 0);
    sided(S, () => forearm(f.fore, armR * 0.85), bone, el, s);
    const hd = joint(el, 0, -f.fore, 0);
    shoulder[i] = sh;
    elbow[i] = el;
    hand[i] = hd;
  }
  return {
    root, body, chest, neck, skull: head, jaw: jw, thigh, shin, shoulder, elbow, hand, bone, dark, cloth, rune, eye, S,
    spineZ, hipX, beltY: f.hip + 0.85 * hipX, beltR: 1.28 * hipX,
  };
}

/** Hands on both arms, each curled by its own share (one gripping, one holding). */
function hands(b: Body, f: Frame, curls: [number, number]): void {
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    for (const piece of handBones(f.hand, Math.sqrt(f.wide), curls[i])) sided(b.S, () => piece, b.bone, b.hand[i], s);
  }
}

/** A loop of rope wound round a limb at `at` on `parent`, `r` m out, `turns` times over `len` m. */
function bound(b: Body, parent: THREE.Object3D, at: P3, r: number, len: number, turns: number, thick: number, phase: number): void {
  b.S.add(made(() => twist(len, r, thick, turns, phase)), b.cloth, parent, at);
}

/** A walk and a fall (shared): legs swung with its step, the trunk bobbing; folded up and down as it dies. */
function walkAndFall(b: Body, st: AnimState, hip: number, stoop: number): void {
  const swing = Math.sin(st.phase) * 0.45 * st.move, dead = st.dead >= 0 ? st.dead : 0;
  b.thigh[0].rotation.x = swing - dead * 1.1; b.thigh[1].rotation.x = -swing - dead * 1.1;
  b.shin[0].rotation.x = Math.max(0, -Math.sin(st.phase)) * 0.6 * st.move + dead * 1.9;
  b.shin[1].rotation.x = Math.max(0, Math.sin(st.phase)) * 0.6 * st.move + dead * 1.9;
  b.body.position.y = Math.abs(Math.cos(st.phase)) * 0.08 * st.move - dead * hip * 0.7;
  b.chest.rotation.x = stoop + Math.sin(st.t * 0.8) * 0.02 + dead * 0.6;
  b.chest.rotation.z = Math.sin(st.phase) * 0.04 * st.move;
}

/** An arm of `upper` and `fore` m laid from its shoulder (`sh`, its joint, on the chest) to put its hand at `to` (in
 *  the chest's space), its elbow bent out towards `pole`: the shoulder turned so the upper arm points at the elbow with
 *  the elbow's hinge across the arm's plane, the elbow bent by the angle between the two bones. */
/** the most of its whole length an arm reaches (`reach`): never quite straight */
const REACH_MOST = 0.97;
const _sh = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _u = new THREE.Vector3();
const _f = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
function reach(sh: THREE.Object3D, el: THREE.Object3D, to: THREE.Vector3, pole: THREE.Vector3, upper: number, fore: number): void {
  _sh.copy(sh.position);
  _d.subVectors(to, _sh);
  // (never quite straight: a straight arm's forearm lies along its upper arm, the axis across them below is none, and
  // the shoulder's turn made from it was NaN, the whole twin drawn nowhere: a throw reaching past the arm did it)
  const d = THREE.MathUtils.clamp(_d.length(), Math.abs(upper - fore) + 1e-3, (upper + fore) * REACH_MOST);
  _d.normalize();
  // (the elbow on the circle where the two bones meet, on its side towards the pole)
  const along = (upper * upper - fore * fore + d * d) / (2 * d), out = Math.sqrt(Math.max(0, upper * upper - along * along));
  _e.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _e.multiplyScalar(out).addScaledVector(_d, along).add(_sh);
  _u.subVectors(_e, _sh).normalize();
  _f.copy(_sh).addScaledVector(_d, d).sub(_e).normalize();
  _y.copy(_u).negate();
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  // (the forearm along the upper arm after all: across them, the way to the pole)
  if (_z.lengthSq() < 1e-10) _z.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_z.lengthSq() < 1e-10) _z.set(_u.y, -_u.x, 0);
  _z.normalize();
  _x.crossVectors(_y, _z);
  sh.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  el.rotation.set(-Math.acos(THREE.MathUtils.clamp(_u.dot(_f), -1, 1)), 0, 0);
}

/** a pulse eased toward `to` at `rate` a second */
const ease = (at: number, to: number, dt: number, rate = 4): number => at + (to - at) * (1 - Math.exp(-dt * rate));

// --- Slab ------------------------------------------------------------------------------------------------

/** links of the chain, and the slack's sag at its most (m) */
const LINKS = 26, SAG = 1.6;

/** The chain of bone from Slab's belt to his brother: its own instanced mesh of added light, hidden while there's no
 *  brother; laid by `lay(to, taut)` with `to` in the world, from `start` on his belt. */
function boneChain(root: THREE.Group, start: THREE.Vector3): { mesh: THREE.InstancedMesh; lay: (to: THREE.Vector3 | null, taut: number) => void } {
  const geo = new THREE.TorusGeometry(0.16, 0.05, 5, 10).scale(1, 1.7, 1);
  const mesh = new THREE.InstancedMesh(geo, additive(CHAIN, 1.4, 0.75), LINKS);
  mesh.frustumCulled = false;
  root.add(mesh);
  const from = start.clone(), to = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3();
  const q = new THREE.Quaternion(), twistQ = new THREE.Quaternion(), m = new THREE.Matrix4(), one = V(1, 1, 1), up = V(0, 1, 0), c = new THREE.Color();
  const at = (k: number, taut: number, out: THREE.Vector3): THREE.Vector3 =>
    out.lerpVectors(from, to, k).setY(from.y + (to.y - from.y) * k - SAG * (1 - taut) * 4 * k * (1 - k));
  function layLocal(taut: number): void {
    for (let i = 0; i < LINKS; i++) {
      const k = (i + 0.5) / LINKS;
      at(k - 0.5 / LINKS, taut, a); at(k + 0.5 / LINKS, taut, b);
      dir.subVectors(b, a).normalize();
      q.setFromUnitVectors(up, dir);
      twistQ.setFromAxisAngle(up, i % 2 ? Math.PI / 2 : 0);
      m.compose(a.add(b).multiplyScalar(0.5), q.multiply(twistQ), one);
      mesh.setMatrixAt(i, m);
      // (brighter drawn taut, as it nears its snap)
      mesh.setColorAt(i, c.setScalar(0.45 + taut * taut * 0.9));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }
  // (laid out before him at first: drawn so, its program is compiled with his warm-up)
  to.set(0, 2.4, 6);
  layLocal(0.5);
  return {
    mesh,
    lay(world, taut) {
      mesh.visible = !!world;
      if (!world) return;
      root.updateWorldMatrix(true, false);
      to.copy(world).setY(2.4);
      root.worldToLocal(to);
      layLocal(taut);
    },
  };
}

/** Rivets round an arc of `n` at radius `r` from `phi0` to `phi1` at height `y` (in a piece's own space), each `size`. */
function rivets(n: number, r: number, y: number, phi0: number, phi1: number, size: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const phi = phi0 + (phi1 - phi0) * (i + 0.5) / n;
    out.push(new THREE.SphereGeometry(size, 5, 3).translate(Math.sin(phi) * r, y, Math.cos(phi) * r));
  }
  return out;
}

/** A pauldron on a shoulder (its left one, the outside +x): three lames of battered iron, each lapping over the one
 *  below and flaring out, a rolled edge along each one's foot and a row of rivets above it. */
function pauldron(R: number, seed: number): { plates: THREE.BufferGeometry[]; studs: THREE.BufferGeometry[] } {
  const plates: THREE.BufferGeometry[] = [], studs: THREE.BufferGeometry[] = [];
  const bands = [[0, 0.44], [0.4, 0.58], [0.54, 0.71]];
  bands.forEach(([t0, t1], i) => {
    const r = R * (1 + i * 0.09), arc = Math.PI * (1.05 + i * 0.1), phi0 = -arc / 2 + Math.PI / 2;
    // (a sphere's shell round the outside of the shoulder: three's sphere's phi from -x round by +z, so the outside
    // half, +x, is about phi pi)
    plates.push(organic(new THREE.SphereGeometry(r, 18, 5, Math.PI - arc / 2, arc, Math.PI * t0, Math.PI * (t1 - t0)), 0.025, 3.2, seed + i));
    const foot = Math.PI * t1, rimY = r * Math.cos(foot), rimR = r * Math.sin(foot) + 0.012;
    const rim: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const phi = Math.PI - arc / 2 + arc * k / 12;
      rim.push(V(-Math.cos(phi) * rimR, rimY, Math.sin(phi) * rimR));
    }
    plates.push(taperTube(rim, () => R * 0.05, 18, 5));
    for (const stud of rivets(7, rimR * 0.985, rimY + R * 0.08, phi0 + 0.2, phi0 + arc - 0.2, R * 0.055)) studs.push(stud);
  });
  return { plates, studs };
}

/** The tombstone's outline: a slab with a rounded top, a chip out of one shoulder, its foot broken off jagged. */
function tombstoneShape(w: number, h: number): THREE.Shape {
  const shape = new THREE.Shape();
  const half = w / 2, arch = h - half;
  const foot = [[-half, 0.02], [-half * 0.55, 0.1], [-half * 0.2, -0.03], [half * 0.15, 0.08], [half * 0.5, -0.02], [half, 0.06]];
  shape.moveTo(foot[0][0], foot[0][1]);
  for (const [x, y] of foot.slice(1)) shape.lineTo(x, y);
  shape.lineTo(half, arch);
  shape.absarc(0, arch, half, 0, Math.PI * 0.62, false);
  // (a chip knocked out of its left shoulder)
  shape.lineTo(-half * 0.62, arch + half * 0.55);
  shape.lineTo(-half * 0.92, arch + half * 0.22);
  shape.lineTo(-half, arch);
  shape.lineTo(foot[0][0], foot[0][1]);
  return shape;
}

// --- the belt skulls (entities/twinSkulls.ts) ------------------------------------------------------------------

/** the skulls on a rope; a hidden rope's scale (drawn, so its pipelines are made with the warm-up, too small to see:
 *  a hidden skull is left undrawn, the skulls on its own rope making its pipelines) */
const BELT_SKULLS = 4, HIDDEN = 1e-3;
/** how high over the hand's grip a held skull's middle is (m) */
const IN_HAND = 0.11 * BELT_K;
/** a skull's swing on its cord (rad): at rest, and more for each m/s its twin walks; how fast (rad/s) */
const SWING = { rest: 0.05, walking: 0.06, most: 0.25, rate: 2.1 };
/** the rope's length along the hip and how low its loop hangs (m) */
const ROPE_LONG = 1.45, ROPE_SAG = 0.6;

/** A twin's belts: its own kind's rope of skulls at its hip on its throwing side, the other kind's behind it (shown once
 *  it takes its fallen brother's), and a skull of each kind in its throwing hand while one is held. */
interface Belts {
  /** shows `bomb` and `poison` skulls on the ropes, one of `holding` in the hand and not on its rope */
  lay(bomb: number, poison: number, holding: SkullKind | null): void;
  /** swings the hung skulls on their cords at time `t` as the twin walks at `move` m/s */
  swing(t: number, move: number): void;
  /** where the hand reaches to unhook one, in the body's space */
  hook: THREE.Vector3;
  /** the hand's skull (`userData.throwHand`: where a throw leaves from) */
  inHand: THREE.Object3D;
  /** each kind's skulls on its rope, and in the hand (`userData.beltSkulls`: what the lab counts as drawn) */
  skulls: Record<SkullKind, THREE.Object3D[]>;
  held: Record<SkullKind, THREE.Object3D>;
}

/**
 * The belts of a twin whose own kind is `own`, on the side `s` (1 its right, -1 its left) of its hip at the belt's
 * `top` and radius `r`, its throwing hand `hand`. Each skull is the one a throw flies and lays on the floor
 * (models/beltSkull.ts: meshes of their own on the rope's knots, in materials of their own, not merged into the twin).
 */
function belts(b: Body, own: SkullKind, s: number, top: number, r: number, hand: THREE.Object3D, handLen: number): Belts {
  const other: SkullKind = own === 'bomb' ? 'poison' : 'bomb';
  const skulls = { bomb: [] as THREE.Group[], poison: [] as THREE.Group[] };
  const ropes = {} as Record<SkullKind, THREE.Group>;
  const along = (k: number): THREE.Vector3 => V(s * 0.06 * Math.sin(k * Math.PI), -ROPE_SAG * Math.sin(k * Math.PI), (k - 0.5) * ROPE_LONG);
  for (const [kind, z] of [[own, 0.36], [other, -0.36]] as const) {
    // (a rope from the belt at its side, hanging in a loop along the hip, a skull on a cord from each of four knots)
    const rope = joint(b.body, s * r * 0.97, top - 0.06, z * r);
    const loop: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) loop.push(along(i / 8));
    b.S.add(made(() => taperTube(loop, () => 0.03, 8, 4)), b.dark, rope);
    for (let i = 0; i < BELT_SKULLS; i++) {
      const knot = joint(rope, 0, 0, 0);
      knot.position.copy(along((i + 0.5) / BELT_SKULLS)).add(V(s * 0.04, 0, 0));
      // (its cord down from the knot to the iron ring through the skull's crown)
      b.S.add(made(() => taperTube([V(0, 0.02, 0), V(0, -(SKULL_DROP - HOOK_TOP) - 0.02, 0)], () => 0.012, 2, 4)), b.dark, knot);
      const sk = beltSkullMesh(kind);
      sk.position.y = -SKULL_DROP;
      sk.rotation.set(0.15, s * Math.PI / 2 + (i % 2 ? 0.3 : -0.3), 0);
      knot.add(sk);
      skulls[kind].push(knot);
    }
    ropes[kind] = rope;
  }
  // (a skull of each kind in the hand, in its palm, shown while one is held)
  const held = joint(hand, 0, -handLen * 0.62, 0.14);
  const inHand = {} as Record<SkullKind, THREE.Group>;
  for (const kind of ['bomb', 'poison'] as const) {
    inHand[kind] = joint(held, 0, IN_HAND, 0);
    inHand[kind].add(beltSkullMesh(kind));
  }
  return {
    hook: V(s * r * 1.02, top - 0.35, 0.36 * r),
    inHand: held,
    skulls,
    held: inHand,
    lay(bomb, poison, holding) {
      for (const kind of ['bomb', 'poison'] as const) {
        const count = kind === 'bomb' ? bomb : poison;
        const shown = Math.max(0, count - (holding === kind ? 1 : 0));
        // (a skull off the rope undrawn: its triangles counted only where it shows)
        skulls[kind].forEach((sk, i) => { sk.visible = i < shown; });
        // (the inherited rope shown once there's anything of it: its own always hangs, empty or not)
        if (kind !== own) ropes[kind].scale.setScalar(count > 0 || holding === kind ? 1 : HIDDEN);
        inHand[kind].visible = holding === kind;
      }
    },
    swing(t, move) {
      const most = Math.min(SWING.most, SWING.rest + SWING.walking * move);
      for (const kind of ['bomb', 'poison'] as const) {
        skulls[kind].forEach((knot, i) => {
          knot.rotation.x = most * Math.sin(t * SWING.rate + i * 1.7);
          knot.rotation.z = most * 0.6 * Math.sin(t * SWING.rate * 0.8 + i * 2.3);
        });
      }
    },
  };
}

/** A throw's moments as shares of its action (`hit` its release): the hand reaching down to the rope, the skull
 *  unhooked, drawn back over the shoulder, thrown, and the arm come back to where its pose has it. */
interface ThrowArm { weight: number; target: THREE.Vector3; holding: boolean }
const _throwAt = new THREE.Vector3(), _hookAt = new THREE.Vector3(), _back = new THREE.Vector3(), _out = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/**
 * Where a throwing arm's hand is through action `a` (`bomb` or `poison`), in the chest's space: from `rest` (where the
 * pose has it) down to the rope's hook, back over its shoulder on its side `s`, forward to its release at `a.hit`, and
 * back; `weight` how much of it the arm takes from the pose, `holding` whether a skull is in the hand.
 */
function throwArm(b: Body, a: AnimState['action'], s: number, span: number, hook: THREE.Vector3, rest: THREE.Vector3): ThrowArm | null {
  if (!a || (a.name !== 'bomb' && a.name !== 'poison')) return null;
  const h = a.hit ?? 0.6, t = a.t;
  b.chest.updateMatrix();
  _inv.copy(b.chest.matrix).invert();
  _hookAt.copy(hook).applyMatrix4(_inv);
  _back.set(s * 0.95, span + 0.55, -0.85);
  _out.set(s * 0.35, span + 0.25, 1.45);
  const unhook = h * 0.3, drawn = h * 0.82;
  if (t < unhook) _throwAt.lerpVectors(rest, _hookAt, ramp(t, 0, unhook));
  else if (t < drawn) _throwAt.lerpVectors(_hookAt, _back, ramp(t, unhook, drawn));
  else if (t < h) _throwAt.lerpVectors(_back, _out, ramp(t, drawn, h));
  else _throwAt.lerpVectors(_out, rest, ramp(t, h, 1));
  const weight = ramp(t, 0, 0.08) * (1 - ramp(t, 0.9, 1));
  return { weight, target: _throwAt, holding: t >= unhook && t < h };
}

/** The hand of the arm from `sh` through `el` to `hd` as its joints are now, in the chest's space. */
function handInChest(sh: THREE.Object3D, el: THREE.Object3D, hd: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  sh.updateMatrix();
  el.updateMatrix();
  return out.copy(hd.position).applyMatrix4(el.matrix).applyMatrix4(sh.matrix);
}

export function buildTwinSlab(): Model {
  const kit = createKit(0xc08040);
  const f: Frame = { hip: 2.1, shoulder: 4.3, skull: 4.85, thick: 0.21, wide: 1.45, upper: 1.25, fore: 1.15, head: 3.6, hand: 0.66, foot: 0.26, look: 'heavy' };
  const b = boneFigure('twinslab', kit, f, EMBER, 61);
  const { S, bone, dark, rune, cloth } = b;
  const grit = pbrMaterialMaps(grunge(), 1, 1);
  const stone = kit.std({
    // (pale weathered stone: a darker grey was lost against the crypt's night)
    color: 0xa8a294, roughness: 0.92, map: grit.map, normalMap: grit.normalMap,
    normalScale: new THREE.Vector2(2, 2), emissive: new THREE.Color(EMBER), emissiveMap: veins(67, 9), emissiveIntensity: 0.9,
  });
  const iron = kit.std({
    // (worn pale at its edges: a darker, more metallic iron drew black against the crypt's night, no sky to mirror)
    color: 0x9a958a, metalness: 0.3, roughness: 0.55, map: grit.map, normalMap: grit.normalMap, normalScale: new THREE.Vector2(1.4, 1.4),
    side: THREE.DoubleSide,
  });
  hands(b, f, [0.75, 0.42]);
  const span = f.shoulder - f.hip - 0.35, W = f.wide;

  // pauldrons of three riveted lames on both shoulders
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    const { plates, studs } = pauldron(0.42, 70 + i);
    for (const plate of plates) sided(S, () => plate, iron, b.shoulder[i], s, [0.05, 0.08, 0]);
    for (const stud of studs) sided(S, () => stud, iron, b.shoulder[i], s, [0.05, 0.08, 0]);
    // a buckled strap of leather round the upper arm under it
    S.add(made(() => organic(new THREE.TorusGeometry(f.thick * 1.35, 0.035, 5, 14).rotateX(Math.PI / 2), 0.01, 8, 74 + i)), dark, b.shoulder[i], [0, -0.42, 0]);
    // a bracer of iron round the forearm: a flared band, rolled at both ends, riveted
    sided(S, () => organic(new THREE.LatheGeometry([V(0.2, -0.36, 0), V(0.18, -0.2, 0), V(0.185, 0, 0), V(0.22, 0.16, 0)].map((p) => new THREE.Vector2(p.x, p.y)), 14), 0.012, 6, 75 + i), iron, b.elbow[i], s, [0.03, -f.fore * 0.5, 0]);
    for (const y of [-0.36, 0.16]) sided(S, () => new THREE.TorusGeometry(y > 0 ? 0.22 : 0.2, 0.022, 5, 14).rotateX(Math.PI / 2), iron, b.elbow[i], s, [0.03, -f.fore * 0.5 + y, 0]);
    for (const stud of rivets(8, 0.19, 0, 0, Math.PI * 2, 0.02)) sided(S, () => stud, iron, b.elbow[i], s, [0.03, -f.fore * 0.5 - 0.05, 0]);
    // a knee cop: a dented dome over the knee, its wing round the outside, strapped behind
    sided(S, () => organic(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), 0.02, 4, 76 + i).rotateX(Math.PI / 2), iron, b.shin[i], s, [0, 0.0, 0.17]);
    sided(S, () => organic(new THREE.SphereGeometry(0.24, 10, 5, Math.PI * 0.75, Math.PI * 0.6, Math.PI * 0.32, Math.PI * 0.32), 0.015, 4, 78 + i), iron, b.shin[i], s, [0, 0.0, 0.05]);
    S.add(made(() => organic(new THREE.TorusGeometry(0.17, 0.028, 5, 14).rotateX(Math.PI / 2), 0.01, 8, 80 + i)), dark, b.shin[i], [0.02, -0.12, 0.02]);
    for (const stud of rivets(5, 0.205, 0.0, -1.1, 1.1, 0.02)) sided(S, () => stud.rotateX(Math.PI / 2), iron, b.shin[i], s, [0, 0, 0.12]);
    // rope bound round the thighbone and the shin
    bound(b, b.thigh[i], [s * 0.1, -0.5, 0.03], 0.2, 0.32, 2.2, 0.03, i);
    bound(b, b.shin[i], [0.04, -0.62, 0], 0.15, 0.26, 1.8, 0.026, i + 2);
  }

  // a yoke of bone across the upper back, five skulls wired to it looking out behind him
  const yokeY = span + 0.12, yokeZ = b.spineZ - 0.06;
  const yoke: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8 - 0.5) * 2.0;
    yoke.push(V(Math.sin(a) * 0.5 * W, yokeY + Math.cos(a) * 0.05, yokeZ - Math.cos(a) * 0.08 * W));
  }
  S.add(made(() => toned(taperTube(yoke, () => 0.045, 18, 6), 0.8)), bone, b.chest);
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.8;
    smallSkull(b, b.chest, [Math.sin(a) * 0.5 * W, yokeY + 0.05, yokeZ - Math.cos(a) * 0.08 * W - 0.06], [-0.15, Math.PI + a * 0.7, 0], 1.55);
  }
  // a torn shawl of grave cloth off his left shoulder, down his back
  S.add(made(() => drape({ r: 0.42 * W, at: Math.PI + 0.45, width: 0.85 * W, h: span * 0.62, tear: 0.35, flare: 0.12, seed: 83, cols: 14, rows: 7 })),
    cloth, b.chest, [0, span + 0.05, 0.02]);

  // his belt of knotted cloth over the pelvis's crests, and what hangs from it: aprons layered before and behind,
  // tongues at his sides, all of grave cloth, a band of runes on the shorter front one; an iron buckle; a ring of bone
  const top = b.beltY, r = b.beltR;
  S.add(made(() => organic(new THREE.TorusGeometry(r, 0.075, 6, 30).rotateX(Math.PI / 2), 0.03, 7, 82)), dark, b.body, [0, top, 0], [0, 0, 0], [1, 1, 0.82]);
  S.add(made(() => organic(new THREE.TorusGeometry(r * 1.02, 0.04, 5, 30).rotateX(Math.PI / 2), 0.02, 9, 84)), cloth, b.body, [0, top - 0.09, 0], [0, 0, 0], [1, 1, 0.84]);
  S.add(made(() => organic(new THREE.BoxGeometry(0.22, 0.2, 0.06), 0.01, 6, 85)), iron, b.body, [0.1, top, r * 0.84]);
  const hung = (o: Parameters<typeof drape>[0], mat: THREE.Material): void => {
    S.add(made(() => drape(o).scale(1, 1, 0.84)), mat, b.body, [0, top - 0.04, 0]);
  };
  hung({ r: r + 0.04, at: 0, width: 1.1, h: 1.45, tear: 0.4, flare: 0.25, seed: 86 }, cloth);
  hung({ r: r + 0.1, at: 0.05, width: 0.7, h: 0.85, tear: 0.25, flare: 0.12, seed: 87, cols: 10 }, rune);
  hung({ r: r + 0.04, at: Math.PI, width: 1.35, h: 1.6, tear: 0.45, flare: 0.3, seed: 88 }, cloth);
  for (const [at, h, sd] of [[1.35, 1.0, 89], [1.85, 0.8, 90], [-1.35, 1.1, 91], [-1.9, 0.75, 92]] as const) {
    hung({ r: r + 0.02, at, width: 0.38, h, tear: 0.3, flare: 0.14, seed: sd, cols: 5, rows: 6 }, cloth);
  }
  const ring = V(0.48, top - 0.12, r * 0.8);
  S.add(made(() => toned(new THREE.TorusGeometry(0.13, 0.045, 6, 12), 0.85)), bone, b.body, [ring.x, ring.y, ring.z]);

  // the tombstone in his right hand: a tall slab with a rounded top, its shoulder chipped, its foot broken off,
  // chamfered at its edges; carved with a ringed cross and lines of runes, cracked; an iron band where he grips it
  const slab = joint(b.hand[0], 0.15, -0.3, 0.1);
  S.add(made(() => {
    const g = new THREE.ExtrudeGeometry(tombstoneShape(1.1, 1.85), {
      depth: 0.2, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 2, curveSegments: 10, steps: 1,
    });
    return organic(g.translate(0, -1.15, -0.1), 0.02, 3, 80);
  }), stone, slab, [0, 0, 0.35]);
  const face = 0.35 + 0.1 + 0.05;
  S.add(made(() => new THREE.BoxGeometry(0.08, 0.74, 0.03)), rune, slab, [0, 0.05, face]);
  S.add(made(() => new THREE.BoxGeometry(0.5, 0.08, 0.03)), rune, slab, [0, 0.22, face]);
  S.add(made(() => new THREE.TorusGeometry(0.2, 0.022, 5, 24)), rune, slab, [0, 0.22, face]);
  for (const [y, w] of [[-0.45, 0.8], [-0.6, 0.62], [-0.74, 0.7]]) S.add(made(() => new THREE.BoxGeometry(w, 0.045, 0.025)), rune, slab, [0, y, face]);
  for (const [x, y, a, l] of [[0.32, 0.45, 0.5, 0.42], [0.3, 0.2, -0.4, 0.3], [-0.38, -0.25, 0.9, 0.36]]) {
    S.add(made(() => new THREE.BoxGeometry(0.018, l, 0.012)), dark, slab, [x, y, face + 0.005], [0, 0, a]);
  }
  S.add(made(() => organic(new THREE.BoxGeometry(1.2, 0.12, 0.38), 0.01, 6, 93)), iron, slab, [0, -0.08, 0.35]);
  for (const x of [-0.42, -0.14, 0.14, 0.42]) S.add(made(() => new THREE.SphereGeometry(0.025, 6, 4)), iron, slab, [x, -0.08, 0.545]);
  const belt = belts(b, 'bomb', -1, top, r, b.hand[1], f.hand);
  S.build();
  const chain = boneChain(b.root, ring);
  b.root.userData.layChain = chain.lay;
  const shown = { bomb: BELT_SKULLS, poison: 0 };
  b.root.userData.belt = (bomb: number, poison: number) => { shown.bomb = bomb; shown.poison = poison; };
  b.root.userData.throwHand = belt.inHand;
  b.root.userData.beltSkulls = { rope: belt.skulls, hand: belt.held };
  const restHand = new THREE.Vector3();

  let burn = 0;
  function animate(st: AnimState): void {
    const { t, dt } = st, a = st.action, look = st.boss;
    let lift = 0, down = 0, lean = 0;
    if (a && (a.name === 'slam' || a.name === 'volley')) {
      const h = a.hit ?? 0.5;
      // (the slab raised over his head through the warning, brought down on the hit, lifted off the floor after)
      lift = ramp(a.t, 0, h * 0.85) * (1 - ramp(a.t, h * 0.85, h));
      down = ramp(a.t, h * 0.85, h) * (1 - ramp(a.t, h + 0.15, 1));
    } else if (a && a.name === 'charge') {
      const h = a.hit ?? 0.35;
      lean = ramp(a.t, 0, h) * (1 - ramp(a.t, 0.85, 1));
    }
    walkAndFall(b, st, f.hip, 0.18 + lean * 0.45 - lift * 0.25 + down * 0.35);
    const idle = Math.sin(t * 0.9) * 0.04;
    // right arm (the slab's): held out from his side at rest, the slab clear of his loincloth; raised overhead and
    // driven down
    b.shoulder[0].rotation.set(-0.2 - lift * 2.6 - down * 0.6 + lean * 0.4 + idle, 0, 0.45 - lift * 0.25);
    b.elbow[0].rotation.x = -0.35 + lift * 0.2 - down * 0.3;
    b.hand[0].rotation.x = 0.1 - lift * 0.3;
    // left arm: steadying the slab overhead, else swinging; dropped forward for the charge
    b.shoulder[1].rotation.set(-0.15 - lift * 2.4 - down * 0.5 - lean * 0.6 - idle, 0, -0.2 - lift * 0.1);
    b.elbow[1].rotation.x = -0.5 + lift * 0.3;
    // (a skull off his belt: his left hand to the rope, back over his shoulder, thrown, back to where it hung)
    const thrown = throwArm(b, a, -1, span, belt.hook, handInChest(b.shoulder[1], b.elbow[1], b.hand[1], restHand));
    if (thrown && thrown.weight > 0) {
      reach(b.shoulder[1], b.elbow[1], restHand.lerp(thrown.target, thrown.weight), pole.set(-0.9, -0.6, -0.5), f.upper, f.fore + f.hand * 0.35);
      b.hand[1].rotation.set(0.2, 0.6, 0);
    }
    belt.lay(st.dead >= 0 ? 0 : shown.bomb, st.dead >= 0 ? 0 : shown.poison, thrown?.holding ? (a!.name as SkullKind) : null);
    belt.swing(t, st.move);
    b.skull.rotation.x = -0.15 - lift * 0.3 + lean * 0.3;
    b.jaw.rotation.x = 0.05 + down * 0.5 + (st.dead >= 0 ? st.dead * 0.4 : 0);
    b.neck.rotation.y = Math.sin(t * 0.4) * 0.08;
    // his runes and eyes burn brighter as he slams, and from his second phase
    burn = ease(burn, look && look.phase >= 1 ? 1 : 0, dt, 2);
    stone.emissiveIntensity = 0.8 + lift * 1.6 + down * 2.2 + burn * 0.6;
    b.eye.emissiveIntensity = 5 + burn * 4 + lean * 3;
    b.rune.emissiveIntensity = 0.5 + burn * 0.8;
    bone.emissiveIntensity = 0.12 + burn * 0.25;
  }

  return {
    root: b.root, kit, animate, head: b.skull, height: 5.3,
    reset() { burn = 0; shown.bomb = BELT_SKULLS; shown.poison = 0; },
    dispose() { kit.dispose(); chain.mesh.geometry.dispose(); (chain.mesh.material as THREE.Material).dispose(); },
  };
}

// --- Reliquary ---------------------------------------------------------------------------------------------

/** the skulls circling the casket, how far out (m); where its hands grip it, out from its middle (m) */
const SKULLS = 5, ORBIT = 0.75, GRIP_X = 0.4;
const grip = new THREE.Vector3(), pole = new THREE.Vector3(), _rest = new THREE.Vector3();

export function buildTwinReliquary(): Model {
  const kit = createKit(0x40a0c0);
  const f: Frame = { hip: 2.4, shoulder: 4.7, skull: 5.25, thick: 0.12, wide: 0.95, upper: 1.35, fore: 1.25, head: 3.1, hand: 0.6, foot: 0.22, look: 'long' };
  const b = boneFigure('twinreliquary', kit, f, COLD, 71);
  const { S, bone, dark, cloth, rune } = b;
  const bronze = kit.std({
    color: 0x8a6a34, metalness: 0.55, roughness: 0.45, normalMap: pbrMaterialMaps(grunge(), 2, 1).normalMap,
    emissive: new THREE.Color(COLD), emissiveMap: veins(77, 6), emissiveIntensity: 0.6,
  });
  const casketGlow = kit.glow(COLD, 3);
  hands(b, f, [0.5, 0.5]);
  const span = f.shoulder - f.hip - 0.35, W = f.wide, k = f.head;

  // a long robe of grave cloth from the belt to the shins, open before the legs, a shorter overskirt of runed cloth
  // over it, both torn at the hem; a rope belt, its ends hanging
  const top = b.beltY, r = b.beltR;
  S.add(made(() => drape({ r: r + 0.03, at: Math.PI, width: Math.PI * 2 * (r + 0.03) - 0.75, h: top - 0.45, tear: 0.5, flare: 0.42, seed: 90, cols: 26, rows: 9, folds: 10 })),
    cloth, b.body, [0, top, 0]);
  S.add(made(() => drape({ r: r + 0.08, at: Math.PI, width: Math.PI * 2 * (r + 0.08) - 1.2, h: (top - 0.45) * 0.5, tear: 0.3, flare: 0.2, seed: 91, cols: 22, rows: 6 })),
    rune, b.body, [0, top - 0.02, 0]);
  S.add(made(() => organic(new THREE.TorusGeometry(r + 0.1, 0.045, 5, 28).rotateX(Math.PI / 2), 0.02, 8, 92)), dark, b.body, [0, top + 0.02, 0]);
  for (const s of [1, -1]) {
    S.add(made(() => taperTube([V(s * 0.12, 0, 0), V(s * 0.16, -0.4, 0.04), V(s * 0.12, -0.9, 0.02)], (t) => 0.035 * (1 - t * 0.3), 8, 5)), dark, b.body, [0, top, r + 0.1]);
  }

  // a capelet of grave cloth over its shoulders, open at the front, its hem in tongues; a bronze clasp at its throat
  S.add(made(() => drape({ r: 0.66 * W, at: Math.PI, width: Math.PI * 2 * 0.66 * W - 0.85, h: span * 0.42, tear: 0.22, flare: 0.22, seed: 93, cols: 24, rows: 6 })),
    cloth, b.chest, [0, span + 0.14, 0.02]);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 8), 0.05, 5, 94)), bronze, b.chest, [0, span + 0.02, 0.18], [0, 0, 0], [0.09, 0.09, 0.04]);
  // torn sleeves: the upper arm's narrow, the forearm's a long bell hanging past the wrist
  for (const [i, s] of [[0, 1], [1, -1]] as const) {
    sided(S, () => drape({ r: 0.2, at: 0, width: Math.PI * 2 * 0.2, h: f.upper * 0.85, tear: 0.15, flare: 0.08, seed: 95 + i, cols: 12, rows: 5 }), cloth, b.shoulder[i], s, [0, 0.12, 0]);
    sided(S, () => drape({ r: 0.15, at: 0, width: Math.PI * 2 * 0.15, h: f.fore * 0.6, tear: 0.25, flare: 0.06, seed: 97 + i, cols: 12, rows: 6 }), cloth, b.elbow[i], s, [0.02, 0.08, 0]);
  }

  // the hood, up over the skull but open before its face: a cowl peaked behind, its foot spreading over the neck
  const hood = (): THREE.BufferGeometry => {
    const g = new THREE.SphereGeometry(0.128, 22, 12, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.7);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const low = THREE.MathUtils.clamp(-y / 0.128, 0, 1), peak = THREE.MathUtils.clamp((y / 0.128 - 0.6) / 0.4, 0, 1) * THREE.MathUtils.clamp(-z / 0.128 + 0.2, 0, 1);
      // (folds falling down it from the crown, deepening to its foot)
      const fold = 0.05 * Math.sin(Math.atan2(z, x) * 9) * (0.2 + low);
      const out = 1 + 0.12 + low * low * 0.55 + fold;
      p.setXYZ(i, x * out, y + peak * 0.05 - low * 0.03, z * out - peak * 0.06);
    }
    g.computeVertexNormals();
    return organic(g, 0.006, 30, 99);
  };
  S.add(made(hood), cloth, b.skull, [0, (0.1 - SKULL_NECK[1]) * k, (-0.02 - SKULL_NECK[2]) * k], [0, 0, 0], k);
  // a bronze circlet over its brow
  S.add(made(() => organic(new THREE.TorusGeometry(0.075, 0.006, 5, 28).rotateX(Math.PI / 2), 0.002, 30, 100)), bronze, b.skull,
    [0, (0.11 - SKULL_NECK[1]) * k, (0.0 - SKULL_NECK[2]) * k], [0.25, 0, 0], k);
  // a string of vertebrae for prayer beads, hung round its neck down over its breastbone
  for (let i = 0; i < 13; i++) {
    const a = (i / 12 - 0.5) * Math.PI * 1.25;
    const at: P3 = [Math.sin(a) * 0.3 * W, span - 0.12 - Math.cos(a) * 0.55, 0.05 + Math.cos(a) * 0.32 * W];
    for (const piece of vertebra(0.035, 0.04)) S.add(made(() => piece), bone, b.chest, at, [Math.PI / 2, 0, 0]);
  }

  // the reliquary, held before its chest between both hands (on a joint of its own the arms reach for): a bronze
  // box on four feet, bone posts at its corners, a peaked lid with finials and bands, a grille over its glowing
  // window and a skull behind the grille
  const casket = joint(b.chest, 0, 1.0, 0.85);
  S.add(made(() => organic(new THREE.BoxGeometry(0.62, 0.4, 0.42, 2, 2, 2), 0.012, 6, 101)), bronze, casket);
  S.add(made(() => {
    const roof = new THREE.Shape([new THREE.Vector2(-0.24, 0), new THREE.Vector2(0.24, 0), new THREE.Vector2(0, 0.2)]);
    return new THREE.ExtrudeGeometry(roof, { depth: 0.68, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 })
      .rotateY(Math.PI / 2).translate(-0.34, 0.2, 0);
  }), bronze, casket);
  for (const x of [-0.36, 0.36]) S.add(made(() => new THREE.ConeGeometry(0.035, 0.12, 6)), bronze, casket, [x, 0.46, 0]);
  for (const x of [-0.18, 0.18]) S.add(made(() => new THREE.BoxGeometry(0.035, 0.03, 0.46)), bronze, casket, [x, 0.21, 0]);
  for (const x of [-0.31, 0.31]) {
    for (const z of [-0.21, 0.21]) {
      S.add(made(() => toned(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 6), 0.9)), bone, casket, [x, 0, z]);
      S.add(made(() => new THREE.SphereGeometry(0.04, 6, 5)), bronze, casket, [x, -0.25, z]);
    }
  }
  S.add(made(() => new THREE.BoxGeometry(0.42, 0.24, 0.02)), casketGlow, casket, [0, 0, 0.2]);
  smallSkull(b, casket, [0, -0.1, 0.17], [0, 0, 0], 0.7);
  for (const x of [-0.15, -0.075, 0, 0.075, 0.15]) S.add(made(() => new THREE.BoxGeometry(0.012, 0.26, 0.012)), bronze, casket, [x, 0, 0.255]);
  for (const y of [-0.06, 0.06]) S.add(made(() => new THREE.BoxGeometry(0.44, 0.012, 0.012)), bronze, casket, [0, y, 0.255]);
  // the skulls circling it, each on its joint of a ring that turns (`orbit`)
  const orbit = joint(casket, 0, 0.15, 0);
  const skulls: THREE.Group[] = [];
  for (let i = 0; i < SKULLS; i++) {
    const a = (i / SKULLS) * Math.PI * 2, sk = joint(orbit, Math.sin(a) * ORBIT, 0, Math.cos(a) * ORBIT);
    smallSkull(b, sk, [0, -0.08, 0], [0, 0, 0], 1.25);
    skulls.push(sk);
  }
  const belt = belts(b, 'poison', 1, top, r, b.hand[0], f.hand);
  S.build();
  const shown = { bomb: 0, poison: BELT_SKULLS };
  b.root.userData.belt = (bomb: number, poison: number) => { shown.bomb = bomb; shown.poison = poison; };
  b.root.userData.throwHand = belt.inHand;
  b.root.userData.beltSkulls = { rope: belt.skulls, hand: belt.held };

  b.root.userData.casket = casket;

  let spin = 0, burn = 0, raised = 0;
  function animate(st: AnimState): void {
    const { t, dt } = st, a = st.action, look = st.boss;
    let build = 0, cast = 0, mend = 0;
    if (a && a.name === 'volley') {
      const h = a.hit ?? 0.5;
      build = ramp(a.t, 0, h) * (1 - ramp(a.t, h, Math.min(1, h + 0.1)));
      cast = ramp(a.t, h * 0.9, h) * (1 - ramp(a.t, h + 0.1, 1));
    } else if (a && a.name === 'mend') {
      mend = ramp(a.t, 0, 0.15) * (1 - ramp(a.t, 0.88, 1));
    } else if (a && a.name === 'slam') {
      const h = a.hit ?? 0.5;
      build = ramp(a.t, 0, h * 0.85) * (1 - ramp(a.t, h * 0.85, h));
      cast = ramp(a.t, h * 0.85, h) * (1 - ramp(a.t, h + 0.15, 1));
    }
    raised = ease(raised, Math.max(build * 0.6, mend), dt, 6);
    walkAndFall(b, st, f.hip, 0.08 - raised * 0.12 + cast * 0.2);
    casket.position.set(0, 1.0 + raised * 1.1 + Math.sin(t * 1.2) * 0.04, 0.85 - raised * 0.15 + cast * 0.2);
    casket.rotation.x = -raised * 0.25;
    // both hands on the casket's sides, the arms bending to it wherever it's held (with the arms swung free of it,
    // its bones showed its hands held out at its sides, nowhere near the casket); its elbows out and down
    casket.updateMatrix();
    // (its right hand lets go of the casket for a skull off its belt: to the rope, back over its shoulder, thrown)
    let holding: SkullKind | null = null;
    for (const [i, s] of [[0, 1], [1, -1]] as const) {
      grip.set(s * GRIP_X, -0.05, 0).applyMatrix4(casket.matrix);
      if (st.dead >= 0) grip.lerp(_rest.set(s * 0.9, -1.2, 0.3), Math.min(1, st.dead * 1.5));
      const thrown = i === 0 ? throwArm(b, a, s, span, belt.hook, grip) : null;
      if (thrown && thrown.weight > 0) grip.lerp(thrown.target, thrown.weight);
      if (thrown?.holding) holding = a!.name as SkullKind;
      reach(b.shoulder[i], b.elbow[i], grip, pole.set(s * 0.9, -0.7, -0.35), f.upper, f.fore + f.hand * 0.35);
      // (its palms turned in on the casket's sides, the throwing one's palm up under the skull as it leaves)
      b.hand[i].rotation.set(0.15, -s * 1.35 * (1 - (thrown?.weight ?? 0)), 0);
    }
    belt.lay(st.dead >= 0 ? 0 : shown.bomb, st.dead >= 0 ? 0 : shown.poison, holding);
    belt.swing(t, st.move);
    // (the skulls spin faster as a volley builds; through a mend they rise round it in a slow ring)
    spin += dt * (0.8 + build * 4 + mend * 1.5);
    orbit.rotation.y = spin;
    for (let i = 0; i < SKULLS; i++) {
      skulls[i].position.y = Math.sin(t * 1.5 + i * 1.3) * 0.12 + mend * 0.35;
      skulls[i].rotation.y = -spin;
    }
    b.skull.rotation.x = -0.2 - raised * 0.35;
    b.jaw.rotation.x = 0.05 + mend * (0.25 + 0.05 * Math.sin(t * 6)) + cast * 0.3 + (st.dead >= 0 ? st.dead * 0.4 : 0);
    b.neck.rotation.y = Math.sin(t * 0.5) * 0.1;
    burn = ease(burn, look && look.phase >= 1 ? 1 : 0, dt, 2);
    casketGlow.emissiveIntensity = 2.5 + build * 4 + mend * 5 + burn * 2;
    bronze.emissiveIntensity = 0.5 + mend * 1.4 + build * 0.8 + burn * 0.6;
    b.eye.emissiveIntensity = 5 + burn * 4 + cast * 3;
    b.rune.emissiveIntensity = 0.5 + burn * 0.8 + mend * 0.6;
  }

  return {
    root: b.root, kit, animate, head: b.skull, height: 5.7,
    reset() { spin = burn = raised = 0; shown.bomb = 0; shown.poison = BELT_SKULLS; },
    dispose() { kit.dispose(); },
  };
}
