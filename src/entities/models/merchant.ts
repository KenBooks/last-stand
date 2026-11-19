// Odo the merchant (world/houses/merchant.ts stands him in his shop; his trade is ui/merchant.ts): a stocky, cheerful
// travelling trader, drawn to read nothing like the library's Brother Hollis (from review: "why Odo looks like
// librarian?": both had a grey beard, spectacles, a felt cap and an oxblood front over brown): a saffron shirt with its
// sleeves rolled to the elbow over bare forearms, a teal waistcoat with brass buttons, a wide belt hung with pouches, a
// coin purse and a ring of keys, a short tan apron, a broad teal hat with a yellow plume, and a dark beard. Built on the
// heroes' own rig, head and hands (the ranger's bearded face), so he holds up as close as they do.
// What he does is his day (`odoLife.ts`: his tasks round the shop behind his counter, his glances, serving whoever
// comes in, his feet planted and stepped); here he's posed from it each frame: his hips over his feet, his legs reached
// to them, his trunk bent and turned, his head on what he looks at, his arms from their rest (hanging, or on the
// counter at his desk) to where his hands are wanted, and the things he handles moved into and out of his hands.
// A trade made earns a nod (`odoNods`).
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { cloth as clothMaps, felt as feltMaps, leather as leatherMaps, wool as woolMaps, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, reachArm, updateJoints, type Joints } from './rig';
import { stripRig } from './shapes';
import { buildHead, buildNeck, handSkin, toGroup, HERO_HEADS, type Head } from './head';
import { buildHand, bare, poseHand, type Digit, type Hand } from './hands';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';
import { OdoLife, handTurn, type OdoScene, type OdoShop } from './odoLife';

/** how high his hips ride over the rig's (m: his legs nearly straight over feet on the floor), and his ankles over the
 *  floor (his boots' soles under them) */
const BODY_Y = 0.03;
const ANKLE_H = 0.086;
/** how quickly his hands, his trunk and his gaze follow what his day asks of them (per s) */
const FOLLOW = { hands: 16, trunk: 8, gaze: 6, things: 12 };
/** past this far from the camera he's posed every other frame (m) */
export const ODO_FAR = 7;

export interface Odo {
  /** his root: the shop's group is its parent, his place and facing his day's */
  root: THREE.Group;
  /** his day stepped and his pose for the frame; `far` (the camera past `ODO_FAR`) poses him every other frame */
  update(dt: number, scene: OdoScene, far?: boolean): void;
  /** his day (the lab reads and steers it) */
  readonly life: OdoLife;
  /** his meshes (the lab reads them) */
  readonly parts: THREE.Mesh[];
  /** whether the last update posed him (a far one may not: the lab reads his feet when it did) */
  readonly posed: boolean;
  /** his joints and his hands (the lab reads his arms against his body and the counter, his hands against what they
   *  hold) */
  readonly joints: Joints;
  readonly hands: { L: Hand; R: Hand };
}

const UP_Y = new THREE.Vector3(0, 1, 0), FACE_Z = new THREE.Vector3(0, 0, 1);

/** His hand pinching a coin: the thumb's pad against the index and middle fingers' pads, the fingers bent at their
 *  middle joints and nearly straight at the last, the ring and little fingers curled loosely under; never the coin
 *  stuck to a flat open palm. */
function coinGrip(h: Hand): void {
  poseHand(h, 0, 0.12);
  const bends: [number, number, number][] = [[0.62, 0.62, 0.18], [0.7, 0.66, 0.2], [0.95, 1.1, 0.7], [1.05, 1.15, 0.75]];
  h.f.forEach((f, i) => {
    const [a, b, c] = bends[i];
    f.j[0].rotation.set(a, 0, h.s * (i - 1.2) * 0.04);
    f.j[1].rotation.set(b, 0, 0);
    f.j[2].rotation.set(c, 0, 0);
  });
  h.thumb.j[0].rotation.set(0.7, h.s * 0.85, -h.s * 0.3);
  h.thumb.j[0].rotateY(h.s * -1.3);
  h.thumb.j[1].rotation.set(0.22, 0, 0);
  h.thumb.j[2].rotation.set(0.12, 0, 0);
}

/** His writing hand holding a pen as a pen is held (a tripod grip): the pen pinched between the thumb's pad and the
 *  index finger's tip, resting on the middle finger's side, the ring and little fingers curled under; not a hand
 *  hanging limp with the quill through its wrist (from play: "not how you hold pen"). */
function penGrip(h: Hand): void {
  poseHand(h, 0, 0.1);
  const bends: [number, number, number][] = [[0.5, 0.42, 0.22], [0.72, 0.85, 0.45], [1.05, 1.25, 0.8], [1.15, 1.3, 0.85]];
  h.f.forEach((f, i) => {
    const [a, b, c] = bends[i];
    f.j[0].rotation.set(a, 0, h.s * (i - 1.2) * 0.05);
    f.j[1].rotation.set(b, 0, 0);
    f.j[2].rotation.set(c, 0, 0);
  });
  // (the thumb across to meet the index finger's tip, its pad on the pen)
  h.thumb.j[0].rotation.set(0.62, h.s * 0.72, -h.s * 0.38);
  h.thumb.j[0].rotateY(h.s * -1.3);
  h.thumb.j[1].rotation.set(0.32, 0, 0);
  h.thumb.j[2].rotation.set(0.2, 0, 0);
}

/** A struck coin (its faces along y, 34 mm across): a raised rim round each face, the face sunk inside it, a boss in
 *  its middle where the head is struck, the edge worn round. */
export function coinGeometry(): THREE.LatheGeometry {
  const r = 0.017, h = 0.0014;
  const half: [number, number][] = [[0, h + 0.0004], [0.004, h + 0.0005], [0.006, h], [r - 0.003, h], [r - 0.0018, h + 0.0005],
    [r - 0.0004, h + 0.0002], [r, 0]];
  // (from the bottom face's middle round the rim to the top's: a lathe's profile, bottom to top)
  const profile = [...half.map(([x, y]) => [x, -y] as [number, number]), ...half.slice(0, -1).reverse()];
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 28);
}

/** a trade made: the next frame he nods (ui/screens/merchant/merchant.ts) */
let nodAsked = false;
export const odoNods = (): void => { nodAsked = true; };
/** whether his trade is open (ui/screens/merchant/merchant.ts tells him; world/houses/merchant.ts reads it for his day) */
let tradeOpen = false;
export const odoTrades = (on: boolean): void => { tradeOpen = on; };
export const odoTrading = (): boolean => tradeOpen;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A surface of rows of points (each row the same count, its first and last points the same for a closed one), its
 *  faces wound out when each row runs the way the right hand's fingers curl round the rows' direction (bottom to top). */
function rowsSurface(rows: THREE.Vector3[][], rep = 1): THREE.BufferGeometry {
  const n = rows[0].length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const down = new Array<number>(n).fill(0);
  rows.forEach((row, j) => {
    let across = 0;
    row.forEach((p, i) => {
      if (i > 0) across += p.distanceTo(row[i - 1]);
      if (j > 0) down[i] += p.distanceTo(rows[j - 1][i]);
      pos.push(p.x, p.y, p.z);
      uv.push(across * rep, down[i] * rep);
    });
  });
  for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i + 1 < n; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a superellipse's point at angle `a` (0 ahead, +x at a quarter turn), `w` across and `d` deep, its sides squared by `p` */
function oval(a: number, w: number, d: number, p = 2.4): [number, number] {
  const s = Math.sin(a), c = Math.cos(a);
  return [w * Math.sign(s) * Math.abs(s) ** (2 / p), d * Math.sign(c) * Math.abs(c) ** (2 / p)];
}

/** A tube round a curve through `pts` (a cord, a seam), `r` thick. */
const cord = (pts: THREE.Vector3[], r: number, closed = false, segs = 48) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), segs, r, 6, closed);

/** A sleeve's piece on a joint (hanging along -y): a lathe through `profile` ([radius, y], bottom to top), with soft
 *  folds round it. */
function sleeve(profile: [number, number][], folds: number, seed: number): THREE.BufferGeometry {
  const ph = mulberry(seed)() * 6;
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    const f = 1 + folds * Math.sin(a * 5 + ph + y * 11) * clamp(-y / 0.2, 0.3, 1);
    p.setXYZ(i, x * f, y, z * f);
  }
  g.computeVertexNormals();
  return g;
}

/** A geometry made in the face's frame (mm) moved into the head group's (m). */
function inHead(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    toGroup(p.getX(i), p.getY(i), p.getZ(i), v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

interface Mats {
  shirt: THREE.Material; waistcoat: THREE.Material; apron: THREE.Material; belt: THREE.Material; pouch: THREE.Material;
  arm: THREE.Material; brass: THREE.Material; iron: THREE.Material; trousers: THREE.Material; boot: THREE.Material;
  bootCuff: THREE.Material; sole: THREE.Material; thread: THREE.Material;
}
type Add = (g: THREE.BufferGeometry, m: THREE.Material, on: THREE.Object3D, name: string, cast?: boolean) => THREE.Mesh;

/**
 * Odo, at work in `shop`. His head and hands are the heroes': build him once their workers have made them
 * (`preloadHeads`, `preloadHands`), or they're sculpted here on the page.
 */
export function buildOdo(shop: OdoShop): Odo {
  const kit = createKit(0xffc27a);
  const tex = (maps: ReturnType<typeof woolMaps>, ns = 1) => {
    const m = pbrMaterialMaps(maps, 1, ns);
    return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale };
  };
  // (his palette is a market's, not the library's: saffron, teal and tan, where Hollis wears brown and oxblood)
  const shirt = kit.rim({ color: 0xd8962a, roughness: 1, ...tex(clothMaps(), 1.2), side: THREE.DoubleSide }, 0xf0b850, 0.3);
  const waistcoat = kit.rim({ color: 0x1f5a62, roughness: 0.85, ...tex(feltMaps(), 0.9) }, 0x3a8a90, 0.3);
  // (a soft, worn leather: its grain faint, the full map read as noise from across the room)
  const apron = kit.std({ color: 0x9a6234, roughness: 0.62, ...tex(leatherMaps(), 0.45), side: THREE.DoubleSide });
  const belt = kit.std({ color: 0x3a2412, roughness: 0.55, ...tex(leatherMaps(), 1) });
  const pouch = kit.std({ color: 0x7a4a24, roughness: 0.65, ...tex(leatherMaps(), 1.1) });
  // (his forearms the same skin as his hands: lighter and pinker, they met them at the wrist in a seam)
  const arm = handSkin(kit, 'ranger');
  const brass = kit.std({ color: 0xd0a850, metalness: 0.9, roughness: 0.32 });
  const iron = kit.std({ color: 0x4a4a4e, metalness: 0.85, roughness: 0.45 });
  // (breeches of a mid-brown wool and tall riding boots: near black, in the shop's light his legs read as one dark column)
  const trousers = kit.std({ color: 0x74603f, roughness: 0.95, ...tex(woolMaps(), 0.7) });
  const boot = kit.std({ color: 0x4e2e18, roughness: 0.48, ...tex(leatherMaps(), 0.6) });
  const bootCuff = kit.std({ color: 0x7e5230, roughness: 0.55, ...tex(leatherMaps(), 0.6) });
  const sole = kit.std({ color: 0x1c140e, roughness: 0.8 });
  const thread = kit.std({ color: 0xcdb88a, roughness: 0.9 });
  const hatFelt = kit.rim({ color: 0x1f5a62, roughness: 1, ...tex(feltMaps(), 0.8), side: THREE.DoubleSide }, 0x3a8a90, 0.3);
  const band = kit.std({ color: 0xd8962a, roughness: 0.9, ...tex(clothMaps(), 1) });
  const feather = kit.rim({ color: 0xf0c020, roughness: 0.85, side: THREE.DoubleSide }, 0xffe060, 0.4);
  // (bright enough to read in the candlelight: at full metalness it took the room's dark and showed nothing)
  const gold = kit.std({ color: 0xf2c454, metalness: 0.75, roughness: 0.35, emissive: 0x3a2a08 });
  const quillMat = kit.std({ color: 0xece4d4, roughness: 0.8, side: THREE.DoubleSide });

  // --- the rig, standing, stocky: a broad chest and a round belly ---
  const j: Joints = buildHumanoid({ skin: shirt }, { chestW: 0.25, chestD: 0.16, waistW: 0.22 });
  stripRig(j.root);
  for (const [name, o] of Object.entries(j)) if (o instanceof THREE.Object3D && !o.name) o.name = `odo ${name}`;
  const P = j.P;

  // --- the head: the ranger's bearded face, his hair and beard darkened, his hair under his hat ---
  const head: Head = buildHead(j.head, kit, HERO_HEADS.ranger.who, HERO_HEADS.ranger);
  buildNeck(j.neck, kit, 'ranger', P.neckL, j.head);
  const darken = (m: THREE.Material | THREE.Material[] | undefined, k: number) => {
    const s = (Array.isArray(m) ? m[0] : m) as THREE.MeshStandardMaterial | undefined;
    s?.color.multiplyScalar(k);
  };
  // (the locks over the crown under his hat; what shows below its band a dark brown, as his beard's tufts)
  if (head.hair[1]) head.hair[1].visible = false;
  darken(head.crop?.material, 0.7);
  for (const b of head.beards.slice(1)) darken(b.material, 0.7);
  // (a ruddy, weathered face: a man on the roads)
  (head.face.material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(1.04, 0.94, 0.86));
  dressHead(head, hatFelt, band, feather, brass);
  seatEars(head);

  // --- the hands: the heroes' own, bare ---
  const skin = handSkin(kit, 'ranger');
  const handL = buildHand(j.handL, 1, skin, skin, 1.08, skin), handR = buildHand(j.handR, -1, skin, skin, 1.08, skin);
  bare(handL, true); bare(handR, true);

  // --- his clothes ---
  const parts: THREE.Mesh[] = [];
  const add: Add = (geo, mat, on, name, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `odo ${name}`;
    m.castShadow = cast; m.receiveShadow = true;
    on.add(m);
    parts.push(m);
    return m;
  };
  dressBody(j, add, { shirt, waistcoat, apron, belt, pouch, arm, brass, iron, trousers, boot, bootCuff, sole, thread });

  // --- what he holds of his own: a coin from his scale, a quill as he writes (at no size while not held: a hidden mesh
  // compiles nothing in the room's warm-up, and would at his first use of it) ---
  // (its faces along its own z: pinched by them, `placeCoin`)
  const coin = add(coinGeometry().rotateX(Math.PI / 2), gold, j.handR, 'coin', false);
  // (the quill: its nib at its origin, its shaft along +y, the vane from a third of the way up; placed each frame
  // between his fingertips and over the web of his hand, `placeQuill`)
  const quill = new THREE.Group();
  j.handL.add(quill);
  add(new THREE.CylinderGeometry(0.0022, 0.0016, 0.21, 6).translate(0, 0.105, 0), quillMat, quill, 'quill shaft', false);
  add(new THREE.ConeGeometry(0.0016, 0.012, 6).rotateX(Math.PI).translate(0, 0.006, 0), iron, quill, 'quill nib', false);
  {
    const vane = new THREE.Shape();
    vane.moveTo(0, 0.07); vane.quadraticCurveTo(0.024, 0.13, 0.004, 0.21); vane.lineTo(-0.004, 0.21);
    vane.quadraticCurveTo(-0.014, 0.13, 0, 0.07);
    add(new THREE.ShapeGeometry(vane, 8), quillMat, quill, 'quill vane', false);
  }

  // --- his day, and his pose from it a frame at a time ---
  const life = new OdoLife(shop);
  /** a digit's tip (its pad, a little short of its end) in the frame of the hand joint `on` */
  const tipIn = (on: THREE.Object3D, d: Digit, out: THREE.Vector3) => {
    const last = d.j[d.j.length - 1];
    return on.worldToLocal(last.localToWorld(out.set(0, -d.len[d.len.length - 1] * 0.85, 0)));
  };
  const tipOf = (d: Digit, out: THREE.Vector3) => tipIn(j.handL, d, out);
  const thumbPad = new THREE.Vector3(), fingerPad = new THREE.Vector3(), knuckle = new THREE.Vector3(), eyeAt = new THREE.Vector3();
  /** The coin between his right thumb's pad and his index and middle fingers' as they hold it now: its faces against
   *  the pads, its rim standing out past the fingertips. */
  const placeCoin = () => {
    j.handR.updateWorldMatrix(true, true);
    tipIn(j.handR, handR.f[0], fingerPad).lerp(tipIn(j.handR, handR.f[1], tipT), 0.35);
    tipIn(j.handR, handR.thumb, thumbPad);
    const across = axis.subVectors(fingerPad, thumbPad).normalize();
    // (out: from the index finger's knuckle toward the pinch, the way the fingers point)
    j.handR.worldToLocal(handR.f[0].j[0].getWorldPosition(knuckle));
    // (on the fingers' pads, its face against them and the thumb pressing it there, its rim out past the fingertips:
    // placed between the thumb's tip and the fingers' it lay in the palm, 4 cm from any fingertip)
    const out = knuckle.subVectors(fingerPad, knuckle).normalize();
    coin.position.copy(fingerPad).addScaledVector(across, -0.004).addScaledVector(out, 0.013);
    // (its face the way his palm faces, a little toward the thumb: held up, to his eye. Fixed in his hand, it turns
    // as his hand turns; turned to his eye every frame, it hung still in the air as he twisted his hand, from play)
    const face = eyeAt.set(0, 0, -1).addScaledVector(across, -0.35).normalize();
    coin.quaternion.setFromUnitVectors(FACE_Z, face);
  };
  const pinch = new THREE.Vector3(), web = new THREE.Vector3(), tipT = new THREE.Vector3(), axis = new THREE.Vector3();
  /** The quill laid in his writing hand as he holds it now: pinched between his thumb's and index finger's tips, its
   *  shaft back over the web of his hand, its nib 3 cm past his fingertips. */
  const placeQuill = () => {
    j.handL.updateWorldMatrix(true, true);
    // (along the index finger, as a pen lies in a hand: at its tip's pad, the thumb's side of it, and back over its
    // knuckle toward the web; placed between the thumb's tip and the finger's, it stood clear of the hand, the thumb
    // short of the finger)
    tipOf(handL.f[0], pinch);
    pinch.lerp(tipOf(handL.thumb, tipT), 0.5);
    pinch.lerp(tipOf(handL.f[1], tipT), 0.2);
    // (the web: between the index finger's knuckle and the thumb's middle joint, out on the thumb's side of the hand
    // and a little to the palm's: laid back over the hand's back (+z), the shaft went in above the knuckles and out
    // under the palm, from play)
    j.handL.worldToLocal(handL.f[0].j[0].getWorldPosition(web));
    web.lerp(j.handL.worldToLocal(handL.thumb.j[1].getWorldPosition(tipT)), 0.55);
    web.x += -handL.s * 0.012;
    web.z -= 0.006;
    axis.subVectors(web, pinch).normalize();
    quill.position.copy(pinch).addScaledVector(axis, -0.03);
    quill.quaternion.setFromUnitVectors(UP_Y, axis);
  };
  // (the nib's place in his hand's frame as he holds the pen: his day places the hand by it)
  penGrip(handL);
  placeQuill();
  life.penNib.copy(quill.position);
  // (and the coin's in his right hand's frame as he pinches one: his day places that hand by it)
  coinGrip(handR);
  placeCoin();
  life.coinPinch.copy(coin.position);
  const eyes = head.eyes;
  const sides = [
    { s: 1, goal: life.doing.L, shoulder: j.shoulderL, elbow: j.elbowL, hand: j.handL, fingers: handL, at: new THREE.Vector3(), turn: new THREE.Quaternion(), w: 0, fresh: true },
    { s: -1, goal: life.doing.R, shoulder: j.shoulderR, elbow: j.elbowR, hand: j.handR, fingers: handR, at: new THREE.Vector3(), turn: new THREE.Quaternion(), w: 0, fresh: true },
  ];
  const legs = [
    { thigh: j.thighL, knee: j.kneeL, ankle: j.ankleL, s: 1 },
    { thigh: j.thighR, knee: j.kneeR, ankle: j.ankleR, s: -1 },
  ];
  const trunk = { bend: 0, crouch: 0, twist: 0 };
  let clock = 0, lookYaw = 0, lookPitch = 0, nod = 0, frame = 0, owed = 0;
  const lookAt = new THREE.Vector3(0, 1.4, 2), neckAt = new THREE.Vector3(), tmp = new THREE.Vector3(), target = new THREE.Vector3();
  const base = new THREE.Vector3(), baseTurn = new THREE.Quaternion(), pole = new THREE.Vector3(), poleHang = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), shopQ = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const setHand = (hand: THREE.Object3D, turn: THREE.Quaternion) => {
    hand.parent!.getWorldQuaternion(qp);
    j.root.getWorldQuaternion(qa);
    hand.quaternion.copy(qp.invert().multiply(qa).multiply(turn));
  };
  const chestLocal = (v: THREE.Vector3) => j.chest.worldToLocal(j.root.localToWorld(v));
  const rootLocalOfChest = (v: THREE.Vector3) => j.root.worldToLocal(j.chest.localToWorld(v));

  function pose(dt: number): void {
    clock += dt;
    const d = life.doing, w = life.walker, shopG = j.root.parent;
    j.root.position.set(w.x, 0, w.z);
    j.root.rotation.set(0, w.yaw, 0);
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    trunk.bend = damp(trunk.bend, d.bend, FOLLOW.trunk, dt);
    trunk.crouch = damp(trunk.crouch, d.crouch, FOLLOW.trunk, dt);
    trunk.twist = damp(trunk.twist, d.twist, FOLLOW.trunk, dt);
    if (nodAsked) { nodAsked = false; nod = 1; }
    nod = Math.max(0, nod - dt / 1.3);
    const nodding = Math.max(d.nod, nod > 0 ? Math.sin(Math.PI * (1 - nod)) ** 2 : 0);
    const breath = Math.sin(clock * Math.PI * 2 / 4);

    // --- the hips over his feet, the trunk bent and turned ---
    for (const o of [j.hips, j.spine, j.chest, j.neck, j.head]) o.rotation.set(0, 0, 0);
    // (his hips turned halfway to where his feet point, his chest kept to his facing)
    const feetYaw = Math.atan2(Math.sin(w.feet[0].yaw) + Math.sin(w.feet[1].yaw), Math.cos(w.feet[0].yaw) + Math.cos(w.feet[1].yaw));
    const hipYaw = Math.atan2(Math.sin(feetYaw - w.yaw), Math.cos(feetYaw - w.yaw)) * 0.5;
    // (his hips a little lower as he walks: a stride's feet are further from them than his legs reach standing tall)
    const striding = Math.min(1, w.speed / 0.5) * 0.04;
    j.body.position.set(w.sway, BODY_Y + w.bob - trunk.crouch - striding, 0);
    // (the hips dropping a little on the side of the swinging leg, the weight carried over the standing one)
    j.hips.rotation.set(0, hipYaw, w.sway * 1.6);
    j.spine.rotation.set(0.04 + trunk.bend * 0.65 + breath * 0.006, trunk.twist * 0.4 - hipYaw, -w.sway * 1.6);
    j.chest.rotation.set(0.02 + trunk.bend * 0.35 - breath * 0.01, trunk.twist * 0.6, 0);
    updateJoints(j.root);

    // --- the head on what he looks at: his chest, neck and head share the turn ---
    lookAt.lerp(d.look, k(FOLLOW.gaze * 1.5));
    j.neck.getWorldPosition(neckAt);
    j.root.worldToLocal(neckAt);
    tmp.subVectors(lookAt, neckAt);
    const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.9, 1.9), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.9, 0.6);
    lookYaw = damp(lookYaw, yaw, FOLLOW.gaze, dt);
    lookPitch = damp(lookPitch, pitch, FOLLOW.gaze, dt);
    const chestYaw = clamp(lookYaw - trunk.twist, -1.9, 1.9);
    j.chest.rotation.y += chestYaw * 0.22;
    j.neck.rotation.set(-lookPitch * 0.35 + 0.04, chestYaw * 0.2, 0);
    j.head.rotation.set(-lookPitch * 0.55 + nodding * 0.32, chestYaw * 0.5, -chestYaw * 0.03);
    const eyeX = clamp(-lookPitch * 0.3, -0.15, 0.3);
    for (const e of eyes) e.rotation.set(eyeX, 0, 0);
    updateJoints(j.root);

    // --- the legs: each ankle reached to its foot, the foot laid at its heading and pitch ---
    if (shopG) {
      shopG.getWorldQuaternion(shopQ);
      for (const [i, leg] of legs.entries()) {
        const f = w.feet[i];
        target.set(f.x, ANKLE_H + f.lift, f.z);
        shopG.localToWorld(target);
        leg.thigh.parent!.worldToLocal(target);
        const heading = f.yaw - w.yaw - hipYaw;
        pole.set(Math.sin(heading) + leg.s * 0.08, 0, Math.cos(heading));
        reachArm(leg.thigh, leg.knee, P.thighL, P.shinL, target, pole, -1);
        leg.knee.updateWorldMatrix(true, false);
        leg.knee.getWorldQuaternion(qa);
        qb.copy(shopQ).multiply(qp.setFromAxisAngle(UP, f.yaw));
        qb.multiply(qp.setFromAxisAngle(X, f.pitch));
        leg.ankle.quaternion.copy(qa.invert().multiply(qb));
      }
    }

    // --- the arms: from their rest to where his hands are wanted ---
    const front = life.toMe(tmp.set(w.x, 0, shop.counter.near + 0.12)).z;
    for (const side of sides) {
      const { s, goal } = side;
      // (each arm swings with the other side's leg, a little bent at the elbow)
      const footAhead = (life.toMe(tmp.set(w.feet[1].x, 0, w.feet[1].z)).z - life.toMe(target.set(w.feet[0].x, 0, w.feet[0].z)).z) * 0.35 * s;
      if (d.onCounter) {
        base.set(s * 0.19, shop.counter.top + 0.035 + breath * 0.002, front);
        handTurn(V(-0.3 * s, -0.05, 1), V(0, -1, 0.05), baseTurn);
        poleHang.set(s, -0.5, -0.6);
      } else {
        rootLocalOfChest(base.set(s * 0.255, 0.18 - 0.535 + 0.06 * Math.abs(footAhead), 0.04 + footAhead));
        handTurn(V(0, -1, 0.12), V(-s, 0, 0.15), baseTurn);
        poleHang.set(s * 0.3, 0, -1);
      }
      side.w = damp(side.w, goal.w, FOLLOW.hands * 0.7, dt);
      const wt = smooth(clamp(side.w, 0, 1));
      target.copy(base).lerp(goal.at, wt);
      // (a hand going to or from a task rises a little on its way, as a hand does over what lies between: in a line
      // from his side up to the counter's top, it cut through the counter's edge)
      // ...and out to his side and a little forward, round his belly: dropped straight back to his side from before
      // his middle, a hand went through it (from the lab)
      if (!d.onCounter) {
        const way = Math.sin(Math.PI * wt);
        target.y += 0.09 * way;
        target.x += s * 0.12 * way;
        target.z += 0.07 * way;
      }
      qb.copy(baseTurn).slerp(goal.turn, wt);
      if (side.fresh || life.settled) { side.at.copy(target); side.turn.copy(qb); side.fresh = false; }
      side.at.lerp(target, k(FOLLOW.hands));
      side.turn.slerp(qb, k(FOLLOW.hands));
      pole.copy(poleHang).lerp(tmp.set(s * 0.8, -0.7, -0.4), d.onCounter ? 0 : wt).normalize();
      reachArm(side.shoulder, side.elbow, P.upperL, P.foreL, chestLocal(tmp.copy(side.at)), pole, 1, 0.08);
      side.elbow.updateWorldMatrix(true, false);
      setHand(side.hand, side.turn);
      if (side.s > 0 && d.quill) {
        penGrip(side.fingers);
        placeQuill();
      } else if (side.s < 0 && d.pinch) {
        coinGrip(side.fingers);
        placeCoin();
      } else {
        const curl = lerp(0.15, goal.curl, Math.max(wt, d.onCounter ? 1 : 0)) + 0.18 * goal.drum;
        poseHand(side.fingers, curl, lerp(0.15, goal.spread, wt), 0, clock, goal.drum);
      }
    }

    // --- the things he handles: into his hand as he takes one, laid where he puts it ---
    const ease = life.settled ? 1 : k(FOLLOW.things);
    for (const t of life.things) {
      const hand = t.held === 'L' ? j.handL : t.held === 'R' ? j.handR : shopG;
      if (!hand) continue;
      if (t.obj.parent !== hand) { hand.updateWorldMatrix(true, false); hand.attach(t.obj); }
      const want = t.held ? t.grip : t.at;
      t.obj.position.lerp(want.pos, ease);
      t.obj.quaternion.slerp(want.turn, ease);
    }
    life.settled = false;
    if (shopG) life.shopWorld.copy(shopG.matrixWorld);
    // (held, the coin and the quill at their size; at none otherwise)
    coin.scale.setScalar(d.coin ? 1 : 0.001);
    quill.scale.setScalar(d.quill ? 1 : 0.001);
  }

  let posed = false;
  function update(dt: number, scene: OdoScene, far = false): void {
    life.update(dt, scene);
    owed += dt;
    frame++;
    posed = !far || frame % 2 === 0;
    if (!posed) return;
    pose(owed);
    owed = 0;
  }

  life.update(0, { customers: [], trading: false, t: 0 });
  pose(0);

  return { root: j.root, update, life, parts, joints: j, hands: { L: handL, R: handR }, get posed() { return posed; } };
}

/** His clothes on the rig: a teal waistcoat over a stocky chest and belly, buttoned in brass, his saffron shirt's
 *  collar open at the neck; a wide belt with a brass buckle, two pouches, a coin purse and a ring of keys; a short tan
 *  leather apron from the belt to above his knees; knee breeches and tall riding boots under; his shirt's sleeves rolled
 *  up to just above the elbow, round elbows and bare forearms below. Nothing hangs past his hips but the apron: no coat
 *  skirt, no bib (both read as a habit). */
function dressBody(j: Joints, add: Add, M: Mats): void {
  const N = 40;
  /** the body's section at a height: across, deep, how deep its folds, how far the belly comes forward */
  const ring = (y: number, w: number, d: number, fold: number, belly: number, seed: number) => {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, z] = oval(a, w, d);
      const f = 1 + fold * (Math.sin(a * 7 + seed) * 0.6 + Math.sin(a * 13 + seed * 2) * 0.4) * (0.6 + 0.4 * Math.cos(a));
      row.push(V(x * f, y, z * f + belly * Math.max(0, Math.cos(a)) ** 2));
    }
    return row;
  };
  // --- the waistcoat's body: the chest, up over the shoulders, where the shirt takes over at the neck ---
  const chestRows: [number, number, number, number, number][] = [
    // y, across, deep, folds, belly
    [-0.1, 0.22, 0.175, 0.006, 0.06], [0.0, 0.225, 0.172, 0.007, 0.045], [0.08, 0.235, 0.165, 0.007, 0.02],
    [0.14, 0.245, 0.155, 0.005, 0], [0.185, 0.25, 0.14, 0.003, 0], [0.215, 0.232, 0.124, 0.002, 0],
    [0.238, 0.178, 0.104, 0, 0], [0.252, 0.115, 0.088, 0, 0],
  ];
  add(rowsSurface(chestRows.map(([y, w, d, f, b]) => ring(y, w, d, f, b, 1.3)), 1.2), M.waistcoat, j.chest, 'waistcoat chest');
  // (the shirt from the waistcoat's top up round his neck)
  // (snug, open at the throat in the waistcoat's V: a ring of collar round it read as a monk's cowl)
  const neckRows: [number, number, number, number, number][] = [
    [0.248, 0.125, 0.09, 0, 0], [0.262, 0.082, 0.074, 0, 0], [0.285, 0.062, 0.064, 0, 0],
  ];
  add(rowsSurface(neckRows.map(([y, w, d, f, b]) => ring(y, w, d, f, b, 0.4)), 1.2), M.shirt, j.chest, 'shirt neck');
  const waistRows: [number, number, number, number, number][] = [
    [-0.12, 0.256, 0.218, 0.008, 0.04], [-0.06, 0.25, 0.212, 0.009, 0.075], [0.02, 0.235, 0.205, 0.01, 0.095],
    [0.1, 0.225, 0.195, 0.009, 0.08], [0.2, 0.22, 0.18, 0.007, 0.06],
  ];
  add(rowsSurface(waistRows.map(([y, w, d, f, b]) => ring(y, w, d, f, b, 2.1)), 1.2), M.waistcoat, j.spine, 'waistcoat belly');
  const front = (rows: [number, number, number, number, number][], y: number) => {
    const at = rows.findIndex((r) => r[0] >= y), hi = rows[Math.max(0, at)], lo = rows[Math.max(0, at - 1)];
    const t = hi === lo ? 0 : (y - lo[0]) / (hi[0] - lo[0]);
    return { w: lerp(lo[1], hi[1], t), d: lerp(lo[2], hi[2], t), b: lerp(lo[4], hi[4], t) };
  };
  /** a point on the body's front at (x, y), `lift` off it, in the chest's frame (y over -0.1) or the spine's */
  const onFront = (rows: [number, number, number, number, number][], x: number, y: number, lift: number) => {
    const { w, d, b } = front(rows, y), a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
    return V(x, y, z + b * Math.cos(a) ** 2 + lift);
  };
  // --- the waistcoat's front: its open V over the shirt at the chest, buttoned in brass down to the belt ---
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 6; k++) {
      const y = lerp(0.12, 0.25, k / 6), half = lerp(0.005, 0.07, k / 6), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) row.push(onFront(chestRows, lerp(-half, half, i / 6), y, 0.004));
      rows.push(row);
    }
    add(rowsSurface(rows, 2), M.shirt, j.chest, 'shirt front');
    for (const s of [1, -1]) {
      const edge: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) { const y = lerp(0.12, 0.25, k / 8); edge.push(onFront(chestRows, s * lerp(0.005, 0.07, k / 8), y, 0.008)); }
      add(cord(edge, 0.006, false, 20), M.waistcoat, j.chest, 'lapel');
    }
    const button = new THREE.SphereGeometry(0.009, 10, 6).scale(1, 1, 0.5);
    for (const y of [0.1, 0.03, -0.05]) add(button.clone(), M.brass, j.chest, 'button', false).position.copy(onFront(chestRows, 0, y, 0.008));
    for (const y of [0.16, 0.08]) add(button.clone(), M.brass, j.spine, 'button', false).position.copy(onFront(waistRows, 0, y, 0.008));
  }
  // --- the belt: wide, stitched along both edges, a brass buckle with its tongue and a keeper; two pouches, a coin
  // purse and a ring of keys hung from it ---
  const BELT = -0.02;
  add(rowsSurface([ring(BELT - 0.03, 0.258, 0.214, 0, 0.05, 0), ring(BELT + 0.03, 0.256, 0.21, 0, 0.07, 0)], 2), M.belt, j.spine, 'belt');
  for (const [dy, belly] of [[-0.024, 0.052], [0.024, 0.068]] as const) {
    add(cord(ring(BELT + dy, 0.2615, 0.2175, 0, belly, 0).slice(0, -1), 0.0015, true, 96), M.thread, j.spine, 'belt stitch', false);
  }
  {
    const at = onFront(waistRows, 0, BELT, 0.012);
    const buckle = new THREE.TorusGeometry(0.03, 0.006, 6, 4).rotateZ(Math.PI / 4).scale(1.2, 0.9, 1);
    add(buckle, M.brass, j.spine, 'buckle', false).position.copy(at);
    add(new THREE.BoxGeometry(0.05, 0.005, 0.004), M.brass, j.spine, 'buckle tongue', false).position.copy(at).add(V(0.012, 0, 0.003));
    // (the belt's end through its keeper, past the buckle)
    add(new THREE.BoxGeometry(0.06, 0.05, 0.006), M.belt, j.spine, 'belt end', false).position.copy(onFront(waistRows, 0.06, BELT, 0.016));
    add(new THREE.BoxGeometry(0.012, 0.062, 0.01), M.belt, j.spine, 'belt keeper', false).position.copy(onFront(waistRows, 0.075, BELT, 0.02));
  }
  // (a pouch on each hip, hung from the belt on two loops: its body rounded, a flap stitched round its edge and shut with
  // a brass stud)
  for (const s of [1, -1]) {
    const at = onFront(waistRows, s * 0.205, BELT - 0.075, 0.03);
    const pouchGroup = new THREE.Group();
    pouchGroup.position.copy(at);
    pouchGroup.rotation.y = s * 0.72;
    j.spine.add(pouchGroup);
    add(new THREE.SphereGeometry(1, 14, 10).scale(0.05, 0.058, 0.026), M.pouch, pouchGroup, 'pouch');
    const flap = new THREE.Shape();
    flap.moveTo(-0.05, 0.03); flap.lineTo(0.05, 0.03); flap.lineTo(0.05, 0.0); flap.quadraticCurveTo(0, -0.04, -0.05, 0.0);
    flap.lineTo(-0.05, 0.03);
    add(new THREE.ExtrudeGeometry(flap, { depth: 0.004, bevelEnabled: false }), M.belt, pouchGroup, 'pouch flap', false).position.set(0, 0.018, 0.022);
    const edge = new THREE.EllipseCurve(0, 0.006, 0.043, 0.032, Math.PI * 1.05, Math.PI * 1.95).getPoints(14)
      .map((p) => V(p.x, p.y + 0.018, 0.0275));
    add(cord(edge, 0.0012, false, 24), M.thread, pouchGroup, 'pouch stitch', false);
    add(new THREE.SphereGeometry(0.0055, 8, 6), M.brass, pouchGroup, 'pouch stud', false).position.set(0, -0.012, 0.028);
    for (const lx of [-0.028, 0.028]) {
      add(new THREE.BoxGeometry(0.012, 0.05, 0.006), M.belt, pouchGroup, 'pouch loop', false).position.set(lx, 0.055, 0.004);
    }
  }
  {
    // (a round coin purse at his right front, drawn shut by a cord tied off in two tassels)
    const purse = add(new THREE.SphereGeometry(0.04, 14, 10).scale(1, 1.15, 0.8), M.pouch, j.spine, 'purse');
    purse.position.copy(onFront(waistRows, -0.11, BELT - 0.08, 0.03));
    const neck = purse.position.clone().add(V(0, 0.04, 0));
    add(new THREE.TorusGeometry(0.016, 0.003, 5, 14).rotateX(Math.PI / 2), M.thread, j.spine, 'purse cord', false).position.copy(neck);
    add(new THREE.CylinderGeometry(0.012, 0.018, 0.016, 10), M.pouch, j.spine, 'purse neck', false).position.copy(neck).add(V(0, 0.008, 0));
    for (const dx of [-0.008, 0.006]) {
      const tassel = add(new THREE.CylinderGeometry(0.0018, 0.003, 0.04, 5).translate(0, -0.02, 0), M.thread, j.spine, 'purse tassel', false);
      tassel.position.copy(neck).add(V(dx, -0.002, 0.012));
      tassel.rotation.z = dx * 18;
    }
    // (a ring of keys at his left front)
    const ringAt = onFront(waistRows, 0.11, BELT - 0.05, 0.03);
    add(new THREE.TorusGeometry(0.022, 0.003, 5, 16), M.iron, j.spine, 'key ring', false).position.copy(ringAt);
    for (let k = 0; k < 3; k++) {
      const key = add(new THREE.BoxGeometry(0.008, 0.06, 0.003).translate(0, -0.03, 0), M.iron, j.spine, 'key', false);
      key.position.copy(ringAt).add(V((k - 1) * 0.012, -0.018, 0.004));
      key.rotation.z = (k - 1) * 0.3;
      const bow = add(new THREE.TorusGeometry(0.007, 0.002, 4, 10), M.iron, j.spine, 'key bow', false);
      bow.position.copy(key.position).add(V(0, -0.002, 0));
    }
  }
  // --- the apron: a short apron of soft leather from the belt to above his knees, flaring a little at its hem, bound
  // in darker leather round its edge, stitched inside it, a pocket on it, tied at his sides ---
  {
    /** a point of the apron: `u` across it (-1 his right edge to 1 his left), `t` up it (0 its hem to 1 its top),
     *  `lift` off its face */
    const apronAt = (u: number, t: number, lift = 0): THREE.Vector3 => {
      const y = lerp(-0.34, 0.07, t), w = lerp(0.27, 0.25, t), d = lerp(0.23, 0.21, t), half = lerp(0.205, 0.18, t);
      const x = u * half, a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
      const flare = 0.035 * (1 - t) ** 2, wave = 0.006 * Math.sin(u * 5.5 + 0.7) * (1 - t);
      return V(x, y, z + lerp(0.03, 0.06, t) * Math.cos(a) ** 2 + 0.02 + flare + wave + lift);
    };
    const sheet = (u0: number, u1: number, t0: number, t1: number, lift: number, cols: number, rows: number) => {
      const out: THREE.Vector3[][] = [];
      for (let k = 0; k <= rows; k++) {
        const row: THREE.Vector3[] = [];
        for (let i = 0; i <= cols; i++) row.push(apronAt(lerp(u0, u1, i / cols), lerp(t0, t1, k / rows), lift));
        out.push(row);
      }
      return out;
    };
    add(rowsSurface(sheet(-1, 1, 0, 1, 0, 12, 12), 1.5), M.apron, j.hips, 'apron');
    // (its binding: down one side, along the hem, up the other)
    const bound: THREE.Vector3[] = [];
    for (let k = 10; k >= 0; k--) bound.push(apronAt(-1, k / 10, 0.002));
    for (let i = 1; i <= 12; i++) bound.push(apronAt(-1 + (2 * i) / 12, 0, 0.002));
    for (let k = 1; k <= 10; k++) bound.push(apronAt(1, k / 10, 0.002));
    add(cord(bound, 0.004, false, 96), M.belt, j.hips, 'apron binding', false);
    const stitch: THREE.Vector3[] = [];
    for (let k = 10; k >= 0; k--) stitch.push(apronAt(-0.9, lerp(0.07, 0.94, k / 10), 0.0025));
    for (let i = 1; i <= 12; i++) stitch.push(apronAt(-0.9 + (1.8 * i) / 12, 0.07, 0.0025));
    for (let k = 1; k <= 10; k++) stitch.push(apronAt(0.9, lerp(0.07, 0.94, k / 10), 0.0025));
    add(cord(stitch, 0.0012, false, 120), M.thread, j.hips, 'apron stitch', false);
    // (a pocket on his left, stitched on three sides, open at its top, its lip bound)
    add(rowsSurface(sheet(0.1, 0.62, 0.34, 0.6, 0.004, 4, 4), 1.5), M.apron, j.hips, 'apron pocket', false);
    const pocketSeam = [apronAt(0.12, 0.6, 0.006), apronAt(0.12, 0.36, 0.006), apronAt(0.6, 0.36, 0.006), apronAt(0.6, 0.6, 0.006)];
    add(cord(pocketSeam, 0.0012, false, 30), M.thread, j.hips, 'pocket stitch', false);
    add(cord([apronAt(0.1, 0.6, 0.006), apronAt(0.36, 0.605, 0.006), apronAt(0.62, 0.6, 0.006)], 0.003, false, 12), M.belt, j.hips, 'pocket lip', false);
    // (its ties: from each top corner round his hips under the belt)
    for (const s of [1, -1]) {
      const from = apronAt(s, 0.97, 0);
      const tie = [from, V(s * 0.25, from.y - 0.005, from.z - 0.06), V(s * 0.262, from.y - 0.01, 0.0)];
      add(cord(tie, 0.006, false, 12), M.apron, j.hips, 'apron tie', false);
    }
  }
  // --- breeches: a seat round his hips, each thigh full, creased and seamed down its outside, a round knee, buckled
  // in a band below it; tall riding boots over the calf, their tops turned down, soled and heeled ---
  {
    /** a ring of the breeches' seat: like the body's, with the seat's fullness behind */
    const seatRing = (y: number, w: number, d: number, back: number) => {
      const row = ring(y, w, d, 0.012, 0.01, 5.1);
      return row.map((p) => {
        const a = Math.atan2(p.x, p.z);
        return V(p.x, p.y, p.z - back * Math.max(0, -Math.cos(a)) ** 2);
      });
    };
    // (its fullness behind low, under the waistcoat's hem: higher, it stood out through the hem as his hips turned)
    const seat: [number, number, number, number][] = [[-0.19, 0.2, 0.17, 0.02], [-0.13, 0.232, 0.195, 0.04], [-0.085, 0.236, 0.196, 0.018], [-0.03, 0.232, 0.19, 0], [0.06, 0.228, 0.186, 0]];
    add(rowsSurface(seat.map(([y, w, d, back]) => seatRing(y, w, d, back)), 1.2), M.trousers, j.hips, 'breeches seat');
    // (the seam up the back of the seat)
    add(cord(seat.map(([y, , d, back]) => V(0, y, -d - back - 0.002)), 0.0018, false, 12), M.thread, j.hips, 'seat seam', false);
  }
  for (const [thigh, knee, ankle, s] of [[j.thighL, j.kneeL, j.ankleL, 1], [j.thighR, j.kneeR, j.ankleR, -1]] as const) {
    const T = j.P.thighL;
    // (the thigh: full at the top, where it reaches up into the seat, narrowing to the knee, its folds deeper behind)
    const thighProfile: [number, number][] = [[0.07, -T + 0.03], [0.078, -T + 0.12], [0.088, -0.22], [0.098, -0.08], [0.108, 0.02], [0.1, 0.07]];
    const leg = sleeve(thighProfile, 0.04, 1 + s);
    leg.scale(1, 1, 0.94);
    add(leg, M.trousers, thigh, 'breeches thigh');
    const radius = (y: number) => {
      for (let i = 1; i < thighProfile.length; i++) {
        const [r0, y0] = thighProfile[i - 1], [r1, y1] = thighProfile[i];
        if (y <= y1) return lerp(r0, r1, clamp((y - y0) / (y1 - y0), 0, 1));
      }
      return thighProfile[thighProfile.length - 1][0];
    };
    const seam: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const y = lerp(0.03, -T + 0.04, k / 10); seam.push(V(s * (radius(y) + 0.002), y, 0)); }
    add(cord(seam, 0.0018, false, 20), M.thread, thigh, 'breeches seam', false);
    // (the knee: a round of cloth over the joint, so a bent knee is cloth and not a gap between two tubes)
    add(new THREE.SphereGeometry(0.07, 16, 12).scale(1, 1, 1.05), M.trousers, knee, 'breeches knee').position.set(0, 0.005, 0.006);
    add(sleeve([[0.066, -0.12], [0.068, -0.06], [0.072, 0.0], [0.074, 0.04]], 0.03, 3 + s), M.trousers, knee, 'breeches calf');
    // (the band buckled below the knee)
    add(new THREE.CylinderGeometry(0.069, 0.068, 0.03, 18), M.belt, knee, 'knee band').position.y = -0.085;
    add(new THREE.BoxGeometry(0.004, 0.026, 0.022), M.brass, knee, 'knee buckle', false).position.set(s * 0.07, -0.085, 0);
    // (the boot's shaft over the calf to below the knee, creased at the ankle; its top turned down in a paler cuff)
    const S = j.P.shinL;
    add(sleeve([[0.05, -S - 0.02], [0.049, -S + 0.05], [0.056, -S + 0.14], [0.064, -0.24], [0.068, -0.16], [0.07, -0.12]], 0.02, 9 + s), M.boot, knee, 'boot shaft');
    add(sleeve([[0.071, -0.175], [0.078, -0.165], [0.08, -0.12], [0.075, -0.104]], 0.015, 11 + s), M.bootCuff, knee, 'boot cuff');
    // (the foot: its upper and toe over a sole cut to a foot's outline, a heel under it)
    add(new THREE.SphereGeometry(1, 16, 12).scale(0.05, 0.046, 0.115), M.boot, ankle, 'boot foot').position.set(0, -0.034, 0.045);
    add(new THREE.SphereGeometry(1, 14, 10).scale(0.046, 0.034, 0.06), M.boot, ankle, 'boot toe').position.set(0, -0.05, 0.12);
    const print = new THREE.Shape();
    print.moveTo(0, -0.075);
    print.bezierCurveTo(0.036, -0.075, 0.038, -0.03, 0.034, 0.0);
    print.bezierCurveTo(0.03, 0.04, 0.052, 0.09, 0.05, 0.13);
    print.bezierCurveTo(0.046, 0.18, -0.046, 0.18, -0.05, 0.13);
    print.bezierCurveTo(-0.052, 0.09, -0.03, 0.04, -0.034, 0.0);
    print.bezierCurveTo(-0.038, -0.03, -0.036, -0.075, 0, -0.075);
    // (the outline in x and z, extruded up: laid flat with its top up)
    const soleGeo = new THREE.ExtrudeGeometry(print, { depth: 0.012, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2);
    add(soleGeo, M.sole, ankle, 'boot sole').position.set(0, -0.074, 0);
    add(new THREE.BoxGeometry(0.066, 0.026, 0.064), M.sole, ankle, 'boot heel').position.set(0, -0.073, -0.04);
  }
  // --- the sleeves: the shirt's, full and gathered, rolled up in a soft band that sits just above the elbow; a round
  // elbow and his bare forearm below, shaped as an arm is (wider by the elbow, flatter toward the wrist), in his
  // hands' skin. The roll on the elbow's own joint stood out as a hard cylinder pinched in at every bend ---
  for (const [shoulder, elbow, s] of [[j.shoulderL, j.elbowL, 1], [j.shoulderR, j.elbowR, -1]] as const) {
    const U = j.P.upperL;
    add(sleeve([[0.062, -U + 0.05], [0.074, -U + 0.08], [0.085, -0.13], [0.09, -0.03], [0.088, 0.03], [0.06, 0.075], [0.024, 0.09], [0, 0.094]], 0.075, 5 + s),
      M.shirt, shoulder, 'sleeve');
    add(sleeve([[0.054, -U + 0.012], [0.068, -U + 0.02], [0.075, -U + 0.035], [0.073, -U + 0.058], [0.062, -U + 0.07]], 0.05, 7 + s),
      M.shirt, shoulder, 'sleeve roll');
    // (the elbow: the upper arm's end under the roll, a small round filling the bend's crease, and the point of the
    // elbow behind, the forearm's own bone, so it turns with the forearm. A ball the arm's width round the joint read as
    // a ball stuck on the arm, from play)
    add(sleeve([[0.036, -U - 0.004], [0.039, -U + 0.01], [0.043, -U + 0.03]], 0, 17 + s), M.arm, shoulder, 'upper arm end');
    add(new THREE.SphereGeometry(0.035, 14, 10), M.arm, elbow, 'elbow').position.set(0, 0.002, 0.004);
    const fore = -j.P.foreL;
    // (the forearm: the muscle at its top swelling out toward the thumb's side, tapering to a flat wrist, its top closed
    // and running up under the upper arm's end so no join shows bent or straight)
    const forearm = sleeve([[0.026, fore - 0.012], [0.029, fore + 0.025], [0.035, fore * 0.6], [0.044, fore * 0.32], [0.047, -0.045],
      [0.042, -0.005], [0.034, 0.022], [0.016, 0.034], [0, 0.036]], 0, 13 + s);
    forearm.scale(1, 1, 0.84);
    {
      const fp = forearm.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const y = fp.getY(i), z = fp.getZ(i), swell = Math.exp(-(((y + 0.06) / 0.07) ** 2));
        fp.setX(i, fp.getX(i) - s * 0.006 * swell);
        // (the point of the elbow, the ulna's end, swelling out of the back of the forearm's top: a separate round
        // stuck there read as a knob)
        const point = Math.exp(-(((y - 0.004) / 0.022) ** 2)) * Math.max(0, -z / 0.036) ** 2;
        fp.setZ(i, z - 0.011 * point);
      }
      forearm.computeVertexNormals();
    }
    add(forearm, M.arm, elbow, 'forearm');
  }
}

/** his ear's thickness through it, and how far back its top leans (m, rad) */
const EAR = { thick: 0.011, tilt: 0.22 };

/**
 * His ears made his own, solid, where the heroes' stand (the heroes' are thin cards flared off the skull, their edges
 * and their join hidden by hair: with Odo's hair under his hat they showed as paper leaves standing off his head, from
 * the front and from behind, from play). Each is a rounded body the size of the hero's ear, `EAR.thick` through, its
 * inner side sunk into the skull so no edge shows from any side: its outline narrowing to a lobe at the bottom, a
 * rolled rim round the top and back, a bowl hollowed in its face, its top leaning back and its back edge standing out
 * a little from the head.
 */
function seatEars(head: Head): void {
  const ears: THREE.Mesh[] = [];
  (head.group.parent ?? head.group).traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name === 'ear') ears.push(o as THREE.Mesh); });
  for (const ear of ears) {
    ear.geometry.computeBoundingBox();
    const box = ear.geometry.boundingBox!;
    const s = Math.sign(box.min.x + box.max.x);
    const root = Math.min(Math.abs(box.min.x), Math.abs(box.max.x));
    const cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
    const hy = (box.max.y - box.min.y) / 2, hz = (box.max.z - box.min.z) / 2;
    const geo = new THREE.SphereGeometry(1, 28, 18);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      const y = p.getY(i), z = p.getZ(i);
      // (the bowl hollowed in its face, above the middle and toward the front; the rim round it left standing)
      const bowl = Math.exp(-(((y + 0.05) / 0.48) ** 2) - (((z + 0.1) / 0.42) ** 2));
      if (x > 0) x = Math.max(-0.25, x * (1 - 1.55 * bowl));
      // (narrower at the bottom, to a lobe)
      const across = 0.6 + 0.4 * smooth(clamp((y + 1) / 1.4, 0, 1));
      const dy = y * hy, dz = z * hz * across;
      const ty = dy * Math.cos(EAR.tilt) + dz * Math.sin(EAR.tilt), tz = dz * Math.cos(EAR.tilt) - dy * Math.sin(EAR.tilt);
      // (its inner side sunk in the skull, its back edge standing out from the head)
      const out = root + EAR.thick * (0.3 + 0.5 * x) + Math.max(0, -tz) * 0.22;
      p.setXYZ(i, s * out, cy + ty, cz + tz);
    }
    geo.computeVertexNormals();
    // (the skin's colours, as the head's ear has them: its material reads them)
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(p.count * 3).fill(1), 3));
    // (a mirrored winding on the right: x flipped by the sign keeps the sphere's faces outward on the left only)
    if (s < 0) {
      const index = geo.index!;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, a);
      }
      geo.computeVertexNormals();
    }
    ear.geometry = geo;
  }
}

/** His head dressed: a broad teal felt hat, its brim wide and turned up at one side, a saffron band and a yellow plume.
 *  All in the head's group, made in the face's frame (mm). */
function dressHead(head: Head, hatFelt: THREE.Material, band: THREE.Material, feather: THREE.Material, buckleMat: THREE.Material): void {
  const G = head.group;
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, cast = true) => {
    const m = new THREE.Mesh(inHead(geo), mat);
    m.name = `odo ${name}`;
    m.castShadow = cast;
    G.add(m);
    return m;
  };
  // --- the hat: its crown over the head from the band at the brow, its brim turned up a little at the edge ---
  const CZ = -14, BASE = 186;
  const crown = new THREE.LatheGeometry([[92, BASE], [96, BASE + 20], [94, BASE + 50], [86, BASE + 72], [60, BASE + 84], [0, BASE + 86]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 32);
  crown.scale(1, 1, 1.18).translate(0, 0, CZ);
  // (a dent down the middle of its top, and pinched in at either side of the front, as a felt hat is shaped by the
  // hand that puts it on)
  {
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i), z = p.getZ(i) - CZ;
      if (y > BASE + 60) p.setY(i, y - 10 * Math.exp(-((x / 28) ** 2)) * smooth(clamp((y - BASE - 60) / 26, 0, 1)));
      const pinch = 0.11 * Math.exp(-(((z - 62) / 42) ** 2)) * smooth(clamp((y - BASE - 32) / 36, 0, 1));
      p.setX(i, x * (1 - pinch));
    }
  }
  put(crown, hatFelt, 'hat crown');
  const brim = new THREE.LatheGeometry([[90, BASE - 2], [140, BASE - 8], [190, BASE - 6], [206, BASE + 6], [208, BASE + 11]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 40);
  brim.scale(1, 1, 1.12).translate(0, 0, CZ);
  // (its brim tipped down a hair at the front over his eyes, up behind)
  {
    const p = brim.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), r = Math.hypot(x, p.getZ(i) - CZ);
      p.setY(i, p.getY(i) - 0.06 * (p.getZ(i) - CZ) + 0.5 * Math.max(0, x) * smooth(clamp((r - 120) / 80, 0, 1)));
    }
  }
  put(brim, hatFelt, 'hat brim');
  put(new THREE.CylinderGeometry(97, 94, 22, 32, 1, true).scale(1, 1, 1.18).translate(0, BASE + 11, CZ), band, 'hat band');
  // (the brim's edge bound in a cord of the felt, following its turn)
  {
    const edge: THREE.Vector3[] = [];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2, x = 208 * Math.sin(a), z = 208 * 1.12 * Math.cos(a);
      edge.push(V(x, BASE + 11 - 0.06 * z + 0.5 * Math.max(0, x), z + CZ));
    }
    put(cord(edge, 3, true, 128), hatFelt, 'hat brim binding', false);
  }
  // (a square brass buckle on the band, toward his left)
  {
    const a = 0.55, at = V(99 * Math.sin(a), BASE + 11, 99 * 1.18 * Math.cos(a) + CZ);
    put(new THREE.TorusGeometry(10, 1.8, 4, 4).rotateZ(Math.PI / 4).rotateY(a).translate(at.x, at.y, at.z), buckleMat, 'hat buckle', false);
  }
  // --- the feather: tucked in the band at his left side, sweeping up and back ---
  {
    const rows: THREE.Vector3[][] = [];
    const spine = new THREE.CatmullRomCurve3([V(96, BASE + 14, CZ - 30), V(124, BASE + 70, CZ - 60), V(130, BASE + 140, CZ - 110), V(112, BASE + 190, CZ - 170)]);
    for (let k = 0; k <= 16; k++) {
      const s = k / 16, c = spine.getPointAt(s), w = 22 * Math.sin(Math.PI * Math.min(1, s * 1.15 + 0.05)) * (1 - 0.3 * s);
      rows.push([c.clone().add(V(-0.3, 0.2, 1).multiplyScalar(w)), c.clone(), c.clone().add(V(0.3, -0.2, -1).multiplyScalar(w))]);
    }
    put(rowsSurface(rows), feather, 'hat feather');
  }
}
