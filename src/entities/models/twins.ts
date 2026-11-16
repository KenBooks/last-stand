// The Ossuary Twins (entities/twins.ts): two tall figures of stacked bones wound in grave cloth, about five and a half
// metres tall. Each walks on legs of long bones bound with strips of cloth, a cage of ribs over a spine of stacked
// vertebrae, a skull in a cowl of rotted linen, and grave light seeping from the eyes and the cloth's runes.
//
// - **Slab** (`buildTwinSlab`): broad and stooped, bones thick as a man's thigh, a mantle of skulls on his shoulders,
//   and a tombstone for a weapon, carved with runes that glow ember with a slam: lifted over his head through its
//   warning and brought down on its hit; for a charge he drops his shoulder and leans into it. A chain of bone links
//   hangs from his belt to his brother (`root.userData.layChain`, laid by the game each frame: its own meshes of added
//   light, as the Bell-Warden's ghosts are, sagging slack and drawn straight and bright as it nears its reach).
// - **Reliquary** (`buildTwinReliquary`): tall and thin, hooded, a bronze casket held before its chest, five skulls
//   circling it: they spin faster and the casket is raised as a volley builds, and raised high, its light swelling,
//   through a mend.
// Both stagger and fold up as they fall; from the second phase (the other fallen) its eyes and runes burn brighter.
// Drawn in their crowds (models/crowd.ts): every change is a joint's place or a glow's strength.
import * as THREE from 'three';
import { additive, createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, lathe, limb, organic, skipping, taperTube } from './shapes';
import { mulberry } from '../../util';
import type { AnimState, MaterialKit, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());
const CHAIN = 0xffd890, EMBER = 0xffb060, COLD = 0x8fe8ff;

/** a figure's measures (m): its hips' height, its shoulders', its skull's; its bones' thickness; its width's scale */
interface Frame { hip: number; shoulder: number; skull: number; thick: number; wide: number; upper: number; fore: number }

/** What both twins are made of: the materials, and a body's joints. */
interface Body {
  root: THREE.Group; body: THREE.Group; chest: THREE.Group; neck: THREE.Group; skull: THREE.Group; jaw: THREE.Group;
  thigh: THREE.Group[]; shin: THREE.Group[]; shoulder: THREE.Group[]; elbow: THREE.Group[]; hand: THREE.Group[];
  bone: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; cloth: THREE.Material; rune: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial; S: Sculpt; r: () => number;
}

/** The bones, cloth and skull both twins share, sized by `f`, in `light`'s grave light. */
function boneFigure(kind: string, kit: MaterialKit, f: Frame, light: number, seed: number): Body {
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const bone = kit.std({
    color: 0xd2c6a4, roughness: 0.8, map: g.map, roughnessMap: g.roughnessMap, normalMap: g.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2), emissive: new THREE.Color(light), emissiveMap: veins(seed, 5), emissiveIntensity: 0.15,
  });
  const dark = kit.std({ color: 0x86795e, roughness: 0.88, map: g.map, normalMap: g.normalMap });
  // grave cloth, linen gone grey-brown, a rim of the grave light along its folds (a dark cloth read as a hole in the
  // crypt's night, as the Cantor's robe did)
  const cloth = kit.rim({
    color: 0x5a5244, roughness: 0.95, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), side: THREE.DoubleSide,
  }, light, 0.35);
  const rune = kit.std({
    color: 0x6a6252, roughness: 0.9, map: g.map, normalMap: g.normalMap, side: THREE.DoubleSide,
    emissive: new THREE.Color(light), emissiveMap: veins(seed + 7, 4), emissiveIntensity: 0.6,
  });
  const eye = kit.glow(light, 6);
  const S = new Sculpt(kind).glow(eye);
  const r = mulberry(seed);
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  const W = f.wide, T = f.thick;

  // --- legs: long bones bound in strips of cloth, a knee of bone, a foot of splayed toes ---------------------------
  const thigh: THREE.Group[] = [], shin: THREE.Group[] = [];
  const len = f.hip / 2;
  for (const s of [1, -1]) {
    const th = joint(body, s * 0.32 * W, f.hip, 0);
    S.add(made(() => organic(limb(len, T * 0.75, T * 0.6, 0.05, 0.3, 10), 0.012, 9, seed + 1)), bone, th);
    // (cloth wound round it in strips, each a little askew)
    for (let i = 0; i < 4; i++) {
      S.add(made(() => organic(new THREE.TorusGeometry(T * 0.95, T * 0.25, 5, 14).rotateX(Math.PI / 2 + (r() - 0.5) * 0.4), 0.02, 7, seed + 2 + i)),
        cloth, th, [0, -len * (0.2 + i * 0.2), 0], [0, 0, 0], [1, 1.6, 1]);
    }
    const sh = joint(th, 0, -len, 0);
    S.add(made(() => organic(new THREE.SphereGeometry(T * 0.9, 10, 8), 0.05, 6, seed + 6)), bone, sh);
    for (const dx of [-T * 0.3, T * 0.3]) S.add(made(() => organic(limb(len, T * 0.42, T * 0.34, 0, 0.3, 8), 0.01, 10, seed + 7)), bone, sh, [dx, 0, 0]);
    S.add(made(() => organic(new THREE.TorusGeometry(T * 0.85, T * 0.22, 5, 14).rotateX(Math.PI / 2), 0.02, 7, seed + 8)), cloth, sh, [0, -len * 0.55, 0], [0, 0, 0], [1, 2, 1]);
    // the foot: a heel and four long toes, splayed
    for (let k = 0; k < 4; k++) {
      const a = (k - 1.5) * 0.28;
      S.add(made(() => taperTube([V(0, 0, 0), V(Math.sin(a) * 0.2, -0.05, 0.25), V(Math.sin(a) * 0.32, -0.12, 0.5 * W)], (t) => T * 0.28 * (1 - t * 0.5), 6, 5)),
        bone, sh, [0, -len + 0.12, 0]);
    }
    thigh.push(th); shin.push(sh);
  }
  // the pelvis, a bowl of bone, and the loincloth of grave cloth hanging from it to the knees, its runes faint
  S.add(made(() => organic(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.5), 0.06, 4, seed + 9)), bone, body,
    [0, f.hip + 0.15, 0], [0, 0, 0], [0.5 * W, 0.4, 0.38 * W]);
  S.add(made(() => organic(lathe([[0.62 * W, f.hip - 1.1], [0.58 * W, f.hip - 0.5], [0.5 * W, f.hip + 0.05], [0.42 * W, f.hip + 0.35]], 28), 0.07, 2.2, seed + 10)), rune, body);

  // --- trunk: a spine of stacked vertebrae, a cage of ribs, the cloth wound round its belly -------------------------
  const chest = joint(body, 0, f.hip + 0.35, 0);
  const span = f.shoulder - f.hip - 0.35;
  for (let i = 0; i < 10; i++) {
    const y = (i / 10) * span;
    S.add(made(() => organic(new THREE.CylinderGeometry(T * 0.55, T * 0.6, span / 13, 10), 0.03, 8, seed + 11 + i)), bone, chest, [0, y, -0.18 * W]);
    S.add(made(() => taperTube([V(0, 0, 0), V(0, -0.05, -0.2)], (t) => T * 0.25 * (1 - t * 0.6), 3, 5)), dark, chest, [0, y, -0.25 * W]);
  }
  for (const s of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      const y = span * (0.95 - i * 0.1), w = (0.42 + Math.sin((i / 5) * Math.PI) * 0.1) * W;
      S.add(made(() => taperTube([V(0, y, -0.18 * W), V(s * w * 0.7, y - 0.05, -0.1 * W), V(s * w, y - 0.14, 0.18 * W), V(s * w * 0.55, y - 0.2, 0.42 * W), V(s * 0.06, y - 0.22, 0.46 * W)],
        (t) => T * 0.3 * (1 - t * 0.35), 14, 6)), bone, chest);
    }
  }
  // (the breastbone, and the cloth wound round the belly under the ribs)
  S.add(made(() => organic(new THREE.BoxGeometry(0.12 * W, span * 0.5, 0.06), 0.02, 6, seed + 25)), bone, chest, [0, span * 0.72, 0.47 * W], [0.1, 0, 0]);
  S.add(made(() => organic(lathe([[0.48 * W, -0.05], [0.5 * W, span * 0.15], [0.45 * W, span * 0.32], [0.36 * W, span * 0.4]], 24), 0.05, 3, seed + 26)), cloth, chest);
  // a tattered shoulder cloth hanging down the back to the waist (narrow: wider, it hid the arms and the ribs)
  S.add(made(() => organic(new THREE.LatheGeometry([
    new THREE.Vector2(0.62 * W, -span * 0.1), new THREE.Vector2(0.58 * W, span * 0.4),
    new THREE.Vector2(0.48 * W, span + 0.05), new THREE.Vector2(0.2, span + 0.3),
  ], 16, Math.PI * 0.72, Math.PI * 0.56), 0.05, 3, seed + 27)), cloth, chest);
  for (const s of [1, -1]) {
    S.add(made(() => taperTube([V(s * 0.04, span + 0.02, 0.3 * W), V(s * 0.3 * W, span + 0.1, 0.18 * W), V(s * 0.6 * W, span + 0.04, 0)], () => T * 0.3, 10, 6)), bone, chest);
  }

  // --- the skull in its cowl ---------------------------------------------------------------------------------
  const neck = joint(chest, 0, span + 0.05, -0.08);
  for (let i = 0; i < 3; i++) S.add(made(() => new THREE.CylinderGeometry(T * 0.4, T * 0.45, 0.1, 8)), bone, neck, [0, 0.06 + i * 0.12, 0]);
  const skull = joint(neck, 0, f.skull - f.shoulder, 0.05);
  skull.scale.setScalar(1.2 * Math.sqrt(W));
  S.add(made(() => organic(new THREE.SphereGeometry(1, 18, 14), 0.04, 5, seed + 30)), bone, skull, [0, 0.2, -0.03], [0, 0, 0], [0.26, 0.3, 0.3]);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 8), 0.05, 6, seed + 31)), bone, skull, [0, 0.1, 0.18], [0, 0, 0], [0.24, 0.07, 0.12]);
  for (const s of [1, -1]) {
    S.add(made(() => new THREE.SphereGeometry(0.065, 10, 8)), dark, skull, [s * 0.1, 0.05, 0.22]);
    S.add(made(() => new THREE.SphereGeometry(0.035, 8, 6)), eye, skull, [s * 0.1, 0.05, 0.27]);
  }
  for (let i = 0; i < 7; i++) S.add(made(() => new THREE.BoxGeometry(0.028, 0.055, 0.028)), bone, skull, [(i - 3) * 0.032, -0.12, 0.24 - Math.abs(i - 3) * 0.012]);
  const jaw = joint(skull, 0, -0.08, 0.02);
  S.add(made(() => organic(new THREE.TorusGeometry(0.15, 0.04, 6, 12, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), 0.05, 6, seed + 32)), bone, jaw, [0, -0.07, 0.08]);
  // (the cowl: a hood of linen over the back of the skull)
  // (thrown back off the brow, so the skull's face shows under it)
  S.add(made(() => organic(new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0.07, 4, seed + 33)), cloth, skull,
    [0, 0.16, -0.2], [-1.0, 0, 0], [1, 1, 1.1]);

  // --- arms: long bones in ragged cloth, a hand of long fingers ---------------------------------------------------
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [], hand: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const sh = joint(chest, s * 0.6 * W, span - 0.05, 0);
    S.add(made(() => organic(new THREE.SphereGeometry(T * 0.75, 10, 8), 0.04, 6, seed + 40)), bone, sh);
    S.add(made(() => organic(limb(f.upper, T * 0.6, T * 0.45, 0.08, 0.3, 10), 0.01, 10, seed + 41)), bone, sh);
    S.add(made(() => organic(lathe([[0.3 * W, -f.upper * 0.75], [0.26 * W, -f.upper * 0.4], [0.18 * W, -0.05], [0.12 * W, 0.12]], 14), 0.06, 4, seed + 42)), cloth, sh);
    const el = joint(sh, 0, -f.upper, 0);
    S.add(made(() => new THREE.SphereGeometry(T * 0.5, 8, 6)), bone, el);
    for (const dx of [-T * 0.25, T * 0.25]) S.add(made(() => organic(limb(f.fore, T * 0.32, T * 0.26, 0, 0.3, 8), 0.008, 12, seed + 43)), bone, el, [dx, 0, 0]);
    const hd = joint(el, 0, -f.fore, 0);
    S.add(made(() => organic(new THREE.BoxGeometry(0.16 * W, 0.18, 0.07), 0.02, 8, seed + 44)), bone, hd, [0, -0.09, 0]);
    for (let k = 0; k < 5; k++) {
      const thumb = k === 4, fx = thumb ? s * -0.09 * W : (k - 1.5) * 0.045 * W, l = (thumb ? 0.2 : 0.32 - Math.abs(k - 1.5) * 0.04) * Math.sqrt(W);
      S.add(made(() => taperTube([V(0, 0, 0), V(fx * 0.3, -l * 0.45, 0.04), V(fx * 0.4, -l * 0.8, 0.12), V(fx * 0.4, -l, 0.2)], (t) => T * 0.18 * (1 - t * 0.6), 8, 5)),
        bone, hd, [fx, -0.18, thumb ? 0.04 : 0]);
    }
    shoulder.push(sh); elbow.push(el); hand.push(hd);
  }
  return { root, body, chest, neck, skull, jaw, thigh, shin, shoulder, elbow, hand, bone, dark, cloth, rune, eye, S, r };
}

/** A body's walk and its fall (shared): legs swung with its step, the trunk bobbing; folded up and down as it dies. */
function walkAndFall(b: Body, st: AnimState, hip: number, stoop: number): void {
  const swing = Math.sin(st.phase) * 0.45 * st.move, dead = st.dead >= 0 ? st.dead : 0;
  b.thigh[0].rotation.x = swing - dead * 1.1; b.thigh[1].rotation.x = -swing - dead * 1.1;
  b.shin[0].rotation.x = Math.max(0, -Math.sin(st.phase)) * 0.6 * st.move + dead * 1.9;
  b.shin[1].rotation.x = Math.max(0, Math.sin(st.phase)) * 0.6 * st.move + dead * 1.9;
  b.body.position.y = Math.abs(Math.cos(st.phase)) * 0.08 * st.move - dead * hip * 0.7;
  b.chest.rotation.x = stoop + Math.sin(st.t * 0.8) * 0.02 + dead * 0.6;
  b.chest.rotation.z = Math.sin(st.phase) * 0.04 * st.move;
}

/** a pulse eased toward `to` at `rate` a second */
const ease = (at: number, to: number, dt: number, rate = 4): number => at + (to - at) * (1 - Math.exp(-dt * rate));

// --- Slab ------------------------------------------------------------------------------------------------

/** links of the chain, and the slack's sag at its most (m) */
const LINKS = 26, SAG = 1.6;

/** The chain of bone from Slab's belt to his brother: its own instanced mesh of added light, hidden while there's no
 *  brother; laid by `lay(to, taut)` with `to` in the world. */
function boneChain(root: THREE.Group): { mesh: THREE.InstancedMesh; lay: (to: THREE.Vector3 | null, taut: number) => void } {
  const geo = new THREE.TorusGeometry(0.16, 0.05, 5, 10).scale(1, 1.7, 1);
  const mesh = new THREE.InstancedMesh(geo, additive(CHAIN, 1.4, 0.75), LINKS);
  mesh.frustumCulled = false;
  root.add(mesh);
  const from = V(0.5, 2.6, 0.2), to = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3();
  const q = new THREE.Quaternion(), twist = new THREE.Quaternion(), m = new THREE.Matrix4(), one = V(1, 1, 1), up = V(0, 1, 0), c = new THREE.Color();
  const at = (k: number, taut: number, out: THREE.Vector3): THREE.Vector3 =>
    out.lerpVectors(from, to, k).setY(from.y + (to.y - from.y) * k - SAG * (1 - taut) * 4 * k * (1 - k));
  function layLocal(taut: number): void {
    for (let i = 0; i < LINKS; i++) {
      const k = (i + 0.5) / LINKS;
      at(k - 0.5 / LINKS, taut, a); at(k + 0.5 / LINKS, taut, b);
      dir.subVectors(b, a).normalize();
      q.setFromUnitVectors(up, dir);
      twist.setFromAxisAngle(up, i % 2 ? Math.PI / 2 : 0);
      m.compose(a.add(b).multiplyScalar(0.5), q.multiply(twist), one);
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

export function buildTwinSlab(): Model {
  const kit = createKit(0xc08040);
  const f: Frame = { hip: 2.1, shoulder: 4.3, skull: 4.85, thick: 0.17, wide: 1.45, upper: 1.25, fore: 1.15 };
  const b = boneFigure('twinslab', kit, f, EMBER, 61);
  const { S, r, bone, dark, rune } = b;
  const stone = kit.std({
    // (pale weathered stone: a darker grey was lost against the crypt's night)
    color: 0xa8a294, roughness: 0.92, map: pbrMaterialMaps(grunge(), 1, 1).map, normalMap: pbrMaterialMaps(grunge(), 1, 1).normalMap,
    normalScale: new THREE.Vector2(2, 2), emissive: new THREE.Color(EMBER), emissiveMap: veins(67, 9), emissiveIntensity: 0.9,
  });
  // a mantle of skulls over his shoulders, three a side, wired to a yoke of bone
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const x = s * (0.45 + i * 0.22) * f.wide, y = f.shoulder - f.hip - 0.35 + 0.18 - i * 0.08;
      S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 10), 0.06, 5, 70 + i)), bone, b.chest, [x, y, -0.05], [0, s * 0.4, 0], [0.16, 0.18, 0.17]);
      S.add(made(() => new THREE.SphereGeometry(0.03, 6, 5)), b.eye, b.chest, [x + s * 0.03, y, 0.12]);
    }
  }
  // the tombstone in his right hand: a tall slab with a rounded top, cracked and carved, its foot broken off
  const slab = joint(b.hand[0], 0.15, -0.25, 0.1);
  S.add(made(() => {
    const body = new THREE.BoxGeometry(1.1, 1.7, 0.28, 3, 6, 1).translate(0, -0.3, 0);
    return organic(body, 0.03, 3, 80);
  }), stone, slab, [0, 0, 0.35]);
  S.add(made(() => organic(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).rotateZ(Math.PI / 2), 0.03, 3, 81)),
    stone, slab, [0, 0.55, 0.35], [0, 0, 0]);
  // (a band of runes across its face, and an iron strap where his fingers grip it)
  S.add(made(() => new THREE.BoxGeometry(0.85, 0.12, 0.04)), rune, slab, [0, 0.2, 0.5]);
  S.add(made(() => new THREE.BoxGeometry(1.16, 0.1, 0.34)), dark, slab, [0, 0.0, 0.35]);
  // his belt of knotted cloth, where the chain is fastened, and a bone ring for it
  S.add(made(() => organic(new THREE.TorusGeometry(0.58 * f.wide, 0.07, 6, 28).rotateX(Math.PI / 2), 0.03, 7, 82)), dark, b.body, [0, f.hip + 0.32, 0]);
  S.add(made(() => new THREE.TorusGeometry(0.14, 0.045, 6, 12)), bone, b.body, [0.5, f.hip + 0.3, 0.55]);
  void r;
  S.build();
  const chain = boneChain(b.root);
  b.root.userData.layChain = chain.lay;

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
    // right arm (the slab's): hanging with it at his side at rest, raised overhead and driven down
    // (held out from his side at rest, the slab clear of his loincloth)
    b.shoulder[0].rotation.set(-0.2 - lift * 2.6 - down * 0.6 + lean * 0.4 + idle, 0, 0.45 - lift * 0.25);
    b.elbow[0].rotation.x = -0.35 + lift * 0.2 - down * 0.3;
    b.hand[0].rotation.x = 0.1 - lift * 0.3;
    // left arm: steadying the slab overhead, else swinging; dropped forward for the charge
    b.shoulder[1].rotation.set(-0.15 - lift * 2.4 - down * 0.5 - lean * 0.6 - idle, 0, -0.2 - lift * 0.1);
    b.elbow[1].rotation.x = -0.5 + lift * 0.3;
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
    root: b.root, kit, animate, height: 5.3,
    reset() { burn = 0; },
    dispose() { kit.dispose(); chain.mesh.geometry.dispose(); (chain.mesh.material as THREE.Material).dispose(); },
  };
}

// --- Reliquary ---------------------------------------------------------------------------------------------

/** the skulls circling the casket, how far out (m) */
const SKULLS = 5, ORBIT = 0.75;

export function buildTwinReliquary(): Model {
  const kit = createKit(0x40a0c0);
  const f: Frame = { hip: 2.4, shoulder: 4.7, skull: 5.25, thick: 0.12, wide: 0.95, upper: 1.35, fore: 1.25 };
  const b = boneFigure('twinreliquary', kit, f, COLD, 71);
  const { S, bone, dark } = b;
  const bronze = kit.std({
    color: 0x8a6a34, metalness: 0.55, roughness: 0.45, normalMap: pbrMaterialMaps(grunge(), 2, 1).normalMap,
    emissive: new THREE.Color(COLD), emissiveMap: veins(77, 6), emissiveIntensity: 0.6,
  });
  const casketGlow = kit.glow(COLD, 3);
  // a long robe of grave cloth to the shins, open at the front over the legs
  S.add(made(() => organic(new THREE.LatheGeometry([
    new THREE.Vector2(0.75, 0.55), new THREE.Vector2(0.68, 1.3), new THREE.Vector2(0.55, 2.2), new THREE.Vector2(0.45, f.hip + 0.4),
  ], 24, Math.PI * 0.62, Math.PI * 0.76), 0.06, 2.4, 90)), b.cloth, b.body);
  // the casket, held before its chest between both hands (on a joint of its own the arms reach for)
  const casket = joint(b.chest, 0, 1.0, 0.85);
  S.add(made(() => organic(new THREE.BoxGeometry(0.62, 0.4, 0.42), 0.015, 6, 91)), bronze, casket);
  S.add(made(() => organic(new THREE.CylinderGeometry(0.21, 0.21, 0.62, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), 0.015, 6, 92)), bronze, casket, [0, 0.2, 0]);
  // (its open front, a glow inside it, and corner posts of bone)
  S.add(made(() => new THREE.BoxGeometry(0.42, 0.24, 0.02)), casketGlow, casket, [0, 0, 0.215]);
  for (const x of [-0.31, 0.31]) for (const z of [-0.21, 0.21]) S.add(made(() => new THREE.CylinderGeometry(0.03, 0.035, 0.5, 6)), bone, casket, [x, 0, z]);
  // the skulls circling it, each on its joint of a ring that turns (`orbit`)
  const orbit = joint(casket, 0, 0.15, 0);
  const skulls: THREE.Group[] = [];
  for (let i = 0; i < SKULLS; i++) {
    const a = (i / SKULLS) * Math.PI * 2, sk = joint(orbit, Math.sin(a) * ORBIT, 0, Math.cos(a) * ORBIT);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 10), 0.06, 5, 93 + i)), bone, sk, [0, 0, 0], [0, 0, 0], [0.15, 0.17, 0.17]);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.08, 6, 99 + i)), bone, sk, [0, -0.09, 0.05], [0, 0, 0], [0.09, 0.05, 0.08]);
    for (const s of [1, -1]) S.add(made(() => new THREE.SphereGeometry(0.03, 6, 5)), b.eye, sk, [s * 0.05, 0.01, 0.14]);
    skulls.push(sk);
  }
  // a rope of prayer beads (vertebrae) round its neck
  for (let i = 0; i < 14; i++) {
    const a = ((i / 13) - 0.5) * Math.PI * 1.2;
    S.add(made(() => new THREE.SphereGeometry(0.045, 6, 5)), dark, b.chest, [Math.sin(a) * 0.32, f.shoulder - f.hip - 0.55 - Math.cos(a) * 0.25, 0.3 + Math.cos(a) * 0.12]);
  }
  S.build();

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
    // both arms holding the casket before it, raised with it
    for (const [i, s] of [[0, 1], [1, -1]] as const) {
      b.shoulder[i].rotation.set(-0.9 - raised * 1.0 - cast * 0.3 + Math.sin(t * 0.8) * 0.03, 0, s * (0.35 + raised * 0.1));
      b.elbow[i].rotation.x = -0.9 + raised * 0.5;
      b.hand[i].rotation.x = 0.2;
    }
    casket.position.set(0, 1.0 + raised * 1.1 + Math.sin(t * 1.2) * 0.04, 0.85 - raised * 0.15);
    casket.rotation.x = -raised * 0.25;
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
    root: b.root, kit, animate, height: 5.7,
    reset() { spin = burn = raised = 0; },
    dispose() { kit.dispose(); },
  };
}
