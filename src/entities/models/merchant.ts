// Odo the merchant (world/shop.ts stands him behind his counter; his trade is ui/merchant.ts): a stocky, cheerful
// travelling trader, drawn to read nothing like the library's Brother Hollis (from review: "why Odo looks like
// librarian?": both had a grey beard, spectacles, a felt cap and an oxblood front over brown): a saffron shirt with its
// sleeves rolled to the elbow over bare forearms, a teal waistcoat with brass buttons, a wide belt hung with pouches, a
// coin purse and a ring of keys, a short tan apron, a broad teal hat with a yellow plume, and a dark beard. Built on the
// heroes' own rig, head and hands (the ranger's bearded face), so he holds up as close as they do. His idle is a loop
// that never snaps (`ODO_LOOP` long: every motion in it a pulse still at both its ends, or a whole number of turns): he
// breathes, rests his hands on the counter and drums his fingers, weighs a coin from his scale and holds it up to his
// eye, writes a line in his ledger with a quill, and looks up from it.
// A hero coming near is glanced at, and a trade made earns a nod (`odoNods`).
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { cloth as clothMaps, felt as feltMaps, leather as leatherMaps, wool as woolMaps, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, reachArm, type Joints } from './rig';
import { stripRig } from './shapes';
import { buildHead, buildNeck, handSkin, toGroup, HERO_HEADS, type Head } from './head';
import { buildHand, bare, poseHand, type Hand } from './hands';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';

/** how long his idle loop is (s) */
export const ODO_LOOP = 36;
/** what happens when in the loop (s): a coin weighed from the scale and held up to his eye, a line written in the
 *  ledger, a look up and round his shop */
const BEATS = { weigh: [8, 15.5], write: [18, 27], look: [29, 33] } as const satisfies Record<string, readonly [number, number]>;
/** how near a hero comes (m) before he looks up, how long he looks (s), and how long before he looks up again */
const GLANCE = { near: 3.8, hold: 2.4, rest: 10 };

/** Where the counter and what he uses on it stand, in his frame (x across him, his left +x; +z ahead; up from the
 *  floor). */
export interface OdoCounter {
  /** the counter's top (m) and its near edge (z) */
  top: number; near: number;
  /** the scale's near pan, the one he takes a coin from */
  pan: THREE.Vector3;
  /** the ledger's middle, where he writes */
  ledger: THREE.Vector3;
}

export interface Odo {
  /** his root: stand it on the floor behind the counter, facing it (+z) */
  root: THREE.Group;
  /** his pose for the frame: `hero` where the local hero is (world space) or null */
  update(dt: number, hero: THREE.Vector3 | null): void;
  /** how far into his loop he is (s), for the lab's pictures at set points of it */
  loopAt: number;
  /** his meshes (the lab reads them) */
  readonly parts: THREE.Mesh[];
}

/** a trade made: the next frame he nods (ui/merchant.ts) */
let nodAsked = false;
export const odoNods = (): void => { nodAsked = true; };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** 0 outside [a, b], 1 inside it, eased in and out over `rise` at each end */
const span = (t: number, a: number, b: number, rise: number): number =>
  smooth(clamp((t - a) / rise, 0, 1)) * (1 - smooth(clamp((t - (b - rise)) / rise, 0, 1)));
/** where `t` is between a and b (0 to 1) */
const along = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);

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
}
type Add = (g: THREE.BufferGeometry, m: THREE.Material, on: THREE.Object3D, name: string, cast?: boolean) => THREE.Mesh;

/**
 * Odo, standing behind `counter`. His head and hands are the heroes': build him once their workers have made them
 * (`preloadHeads`, `preloadHands`), or they're sculpted here on the page.
 */
export function buildOdo(counter: OdoCounter): Odo {
  const kit = createKit(0xffc27a);
  const tex = (maps: ReturnType<typeof woolMaps>, ns = 1) => {
    const m = pbrMaterialMaps(maps, 1, ns);
    return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale };
  };
  // (his palette is a market's, not the library's: saffron, teal and tan, where Hollis wears brown and oxblood)
  const shirt = kit.rim({ color: 0xd8962a, roughness: 1, ...tex(clothMaps(), 1.2), side: THREE.DoubleSide }, 0xf0b850, 0.3);
  const waistcoat = kit.rim({ color: 0x1f5a62, roughness: 0.85, ...tex(feltMaps(), 0.9) }, 0x3a8a90, 0.3);
  const apron = kit.std({ color: 0xa8743e, roughness: 0.7, ...tex(leatherMaps(), 1.2), side: THREE.DoubleSide });
  const belt = kit.std({ color: 0x3a2412, roughness: 0.55, ...tex(leatherMaps(), 1) });
  const pouch = kit.std({ color: 0x7a4a24, roughness: 0.65, ...tex(leatherMaps(), 1.1) });
  const arm = kit.rim({ color: 0xc08a68, roughness: 0.75 }, 0xe0a888, 0.25);
  const brass = kit.std({ color: 0xd0a850, metalness: 0.9, roughness: 0.32 });
  const iron = kit.std({ color: 0x4a4a4e, metalness: 0.85, roughness: 0.45 });
  const trousers = kit.std({ color: 0x3e3a30, roughness: 1, ...tex(woolMaps(), 1) });
  const boot = kit.std({ color: 0x2a1a10, roughness: 0.6, ...tex(leatherMaps(), 1) });
  const hatFelt = kit.rim({ color: 0x1f5a62, roughness: 1, ...tex(feltMaps(), 0.8), side: THREE.DoubleSide }, 0x3a8a90, 0.3);
  const band = kit.std({ color: 0xd8962a, roughness: 0.9, ...tex(clothMaps(), 1) });
  const feather = kit.rim({ color: 0xf0c020, roughness: 0.85, side: THREE.DoubleSide }, 0xffe060, 0.4);
  const gold = kit.std({ color: 0xf0c050, metalness: 1, roughness: 0.25 });
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
  dressHead(head, hatFelt, band, feather);

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
  dressBody(j, add, { shirt, waistcoat, apron, belt, pouch, arm, brass, iron, trousers, boot });

  // --- what he holds: a coin from his scale, a quill as he writes (at no size while not held: a hidden mesh compiles
  // nothing in the room's warm-up, and would at his first beat) ---
  const coin = add(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 18).rotateX(Math.PI / 2), gold, j.handR, 'coin', false);
  coin.position.set(-0.01, -0.07, 0.035);
  const quill = new THREE.Group();
  quill.position.set(0.012, -0.075, 0.03);
  quill.rotation.set(-0.5, 0, 0.35);
  j.handL.add(quill);
  add(new THREE.CylinderGeometry(0.0018, 0.001, 0.2, 6).translate(0, 0.07, 0), quillMat, quill, 'quill shaft', false);
  {
    const vane = new THREE.Shape();
    vane.moveTo(0, 0.04); vane.quadraticCurveTo(0.022, 0.1, 0.004, 0.17); vane.lineTo(-0.004, 0.17);
    vane.quadraticCurveTo(-0.014, 0.1, 0, 0.04);
    add(new THREE.ShapeGeometry(vane, 8), quillMat, quill, 'quill vane', false);
  }

  // --- his pose, a frame at a time ---
  const eyes = head.eyes;
  let loop = 2, gaze = 0, gazeWant = 0, gazeUntil = -1, nextGlance = 0, clock = 0, nod = 0;
  const lookYaw = { v: 0 }, lookPitch = { v: 0 };
  const hero = new THREE.Vector3(), headAt = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tL = new THREE.Vector3(), tR = new THREE.Vector3(), poleL = new THREE.Vector3(), poleR = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), basis = new THREE.Matrix4();
  const fx = new THREE.Vector3(), fy = new THREE.Vector3(), fz = new THREE.Vector3();
  /** a hand's turn in his frame: its fingers along `fingers`, its palm facing `palm` */
  const handTurn = (fingers: THREE.Vector3, palm: THREE.Vector3, out: THREE.Quaternion) => {
    fy.copy(fingers).normalize().negate();
    fz.copy(palm).negate().addScaledVector(fy, -palm.clone().negate().dot(fy)).normalize();
    fx.crossVectors(fy, fz);
    return out.setFromRotationMatrix(basis.makeBasis(fx, fy, fz));
  };
  const setHand = (hand: THREE.Object3D, turn: THREE.Quaternion) => {
    hand.parent!.getWorldQuaternion(qp);
    j.root.getWorldQuaternion(qa);
    hand.quaternion.copy(qp.invert().multiply(qa).multiply(turn));
  };
  const chestLocal = (v: THREE.Vector3) => j.chest.worldToLocal(j.root.localToWorld(v));
  /** where his hands rest on the counter: just in from its near edge, a shoulder's width apart */
  const rest = (s: number, out: THREE.Vector3) => out.set(s * 0.19, counter.top + 0.035, counter.near + 0.12);

  function update(dt: number, heroAt: THREE.Vector3 | null): void {
    clock += dt;
    loop = (loop + dt * (1 - 0.6 * gaze)) % ODO_LOOP;
    const t = loop;
    // --- whether he's looking up at the hero: a glance as one comes near ---
    let heroNear = false;
    if (heroAt) {
      j.root.updateWorldMatrix(true, false);
      hero.copy(heroAt);
      j.root.worldToLocal(hero);
      heroNear = Math.hypot(hero.x, hero.z) < GLANCE.near;
      hero.y += 1.55;
    }
    if (heroNear && clock > nextGlance) { gazeWant = 1; gazeUntil = clock + GLANCE.hold; nextGlance = clock + GLANCE.hold + GLANCE.rest; }
    else if (clock > gazeUntil) gazeWant = 0;
    if (!heroAt) gazeWant = 0;
    gaze = damp(gaze, gazeWant, gazeWant > gaze ? 3.2 : 2.2, dt);
    if (nodAsked) { nodAsked = false; nod = 1; }
    nod = Math.max(0, nod - dt / 1.3);
    // (one nod, down and back up, still at both ends)
    const nodding = Math.sin(Math.PI * (1 - nod)) ** 2 * (nod > 0 ? 1 : 0);

    // --- the beats of the loop ---
    const weigh = span(t, ...BEATS.weigh, 1.1), write = span(t, ...BEATS.write, 1.2), look = span(t, ...BEATS.look, 1.0);
    const weighK = along(t, ...BEATS.weigh), writeK = along(t, ...BEATS.write), lookK = along(t, ...BEATS.look);
    // (the coin taken from the pan, held up to his eye, turned, and put back)
    const up = span(weighK, 0.22, 0.8, 0.16);
    const breath = Math.sin((t / ODO_LOOP) * Math.PI * 2 * 9);

    // --- body, neck, head ---
    for (const o of [j.hips, j.spine, j.chest, j.neck, j.head]) o.rotation.set(0, 0, 0);
    j.spine.rotation.x = 0.06 + write * 0.1 + weigh * (1 - up) * 0.08 + breath * 0.006;
    j.chest.rotation.x = 0.03 + write * 0.04 - breath * 0.01;
    j.chest.rotation.y = -weigh * (1 - up) * 0.18 + write * 0.12 + look * 0.12 * Math.sin(lookK * Math.PI * 2);
    // (he looks at what his hands do: down at the counter at rest, the pan, the coin up close, the ledger; round the
    // shop as he looks up)
    let headX = 0.32 - up * 0.3 + write * 0.18 - look * 0.42, headY = -weigh * (1 - up) * 0.35 + write * 0.25;
    headY += look * 0.5 * Math.sin(lookK * Math.PI * 2);
    let neckX = 0.06;
    if (gaze > 0.001) {
      j.root.updateMatrixWorld(true);
      j.neck.getWorldPosition(headAt);
      j.root.worldToLocal(headAt);
      tmp.subVectors(hero, headAt);
      const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.2, 1.2), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.5, 0.5);
      lookYaw.v = damp(lookYaw.v, yaw, 6, dt);
      lookPitch.v = damp(lookPitch.v, pitch, 6, dt);
      j.chest.rotation.y = lerp(j.chest.rotation.y, lookYaw.v * 0.25, gaze);
      neckX = lerp(neckX, -lookPitch.v * 0.4, gaze);
      headX = lerp(headX, -lookPitch.v * 0.6, gaze);
      headY = lerp(headY, lookYaw.v * 0.6, gaze);
      j.neck.rotation.y = lookYaw.v * 0.15 * gaze;
    }
    headX += nodding * 0.32;
    j.neck.rotation.x = neckX;
    j.head.rotation.set(headX, headY, -headY * 0.06);
    // (his eyes on what he looks at: down to the counter, up to the hero)
    const eyeX = 0.22 * (1 - gaze) * (1 - look) + up * -0.1;
    for (const e of eyes) e.rotation.set(eyeX, 0, 0);
    j.root.updateMatrixWorld(true);

    // --- the arms ---
    rest(1, tL); rest(-1, tR);
    tL.y += breath * 0.002; tR.y += breath * 0.002;
    // the right: to the scale's pan, the coin up to his eye, back to the pan, back to rest
    const toPan = span(weighK, 0.05, 0.95, 0.14) * weigh;
    tmp.copy(counter.pan).add(V(0.03, 0.05, -0.02));
    tR.lerp(tmp, toPan);
    tR.lerp(tmp.set(-0.06, 1.52, 0.33), up * weigh);
    // the left: to the ledger, a line written along it in small strokes
    tmp.copy(counter.ledger).add(V(lerp(-0.08, 0.08, writeK) + 0.008 * Math.sin(clock * 22), 0.06 + 0.004 * Math.sin(clock * 9), -0.05));
    tL.lerp(tmp, write);
    // (in an arc over the counter there and back, never through it)
    tR.y += 0.06 * Math.sin(Math.PI * toPan) * (1 - up);
    tL.y += 0.05 * Math.sin(Math.PI * Math.min(1, write * 1.0)) * (1 - write);
    // (the elbows out and a little back, as a stout man leans his hands on a counter)
    poleL.set(1, -0.5, -0.6).normalize();
    poleR.set(-1, -0.5, -0.6).normalize();
    reachArm(j.shoulderL, j.elbowL, P.upperL, P.foreL, chestLocal(tL.clone()), poleL, 1, 0.08);
    reachArm(j.shoulderR, j.elbowR, P.upperL, P.foreL, chestLocal(tR.clone()), poleR, 1, 0.08);
    j.root.updateMatrixWorld(true);
    // the hands' turns: flat on the counter, fingers ahead and a little in; pinching the coin; the quill's hand on its side
    handTurn(V(-0.3, -0.05, 1), V(0, -1, 0.05), qa);
    handTurn(V(-0.2, -0.6, 0.8), V(0.3, -0.6, 0.6), qb); qa.slerp(qb, write);
    setHand(j.handL, qa.clone());
    handTurn(V(0.3, -0.05, 1), V(0, -1, 0.05), qa);
    handTurn(V(0.2, -0.5, 0.9), V(0, -1, 0.2), qb); qa.slerp(qb, toPan * (1 - up));
    handTurn(V(0.4, 0.75, 0.3), V(0.6, 0, -0.8), qb); qa.slerp(qb, up * weigh);
    setHand(j.handR, qa.clone());
    // (his fingers drum the counter now and then at rest: one after another, as a pulse)
    const drum = Math.max(0, Math.sin(clock * 9)) ** 3 * span(t, 1, 7, 1) * (1 - gaze);
    poseHand(handL, lerp(lerp(0.12, 0.6, write), 0.18, 0), 0.15, 0, clock, 0);
    poseHand(handR, lerp(0.12 + 0.18 * drum, 0.75, toPan), 0.15, 0, clock, drum);
    // (held, the coin and the quill at their size; at none otherwise)
    coin.scale.setScalar(Math.max(0.001, smooth(clamp((weighK - 0.2) / 0.05, 0, 1)) * (1 - smooth(clamp((weighK - 0.82) / 0.05, 0, 1))) * (weigh > 0 ? 1 : 0)));
    quill.scale.setScalar(Math.max(0.001, write > 0.05 ? 1 : 0));
  }

  update(0, null);

  return {
    root: j.root,
    update,
    get loopAt() { return loop; },
    set loopAt(v: number) { loop = ((v % ODO_LOOP) + ODO_LOOP) % ODO_LOOP; },
    parts,
  };
}

/** His clothes on the rig: a teal waistcoat over a stocky chest and belly, buttoned in brass, his saffron shirt's
 *  collar open at the neck; a wide belt with a brass buckle, two pouches, a coin purse and a ring of keys; a short tan
 *  apron from the belt to above his knees; trousers and boots under; his shirt's sleeves rolled up over the elbow,
 *  bare forearms below. Nothing hangs past his hips but the apron: no coat skirt, no bib (both read as a habit). */
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
    [-0.12, 0.25, 0.2, 0.008, 0.04], [-0.06, 0.245, 0.205, 0.009, 0.075], [0.02, 0.235, 0.205, 0.01, 0.095],
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
  // --- the belt: wide, a brass buckle; two pouches, a coin purse and a ring of keys hung from it ---
  const BELT = -0.02;
  add(rowsSurface([ring(BELT - 0.03, 0.258, 0.214, 0, 0.05, 0), ring(BELT + 0.03, 0.256, 0.21, 0, 0.07, 0)], 2), M.belt, j.spine, 'belt');
  {
    const buckle = new THREE.TorusGeometry(0.03, 0.006, 6, 4).rotateZ(Math.PI / 4).scale(1.2, 0.9, 1);
    add(buckle, M.brass, j.spine, 'buckle', false).position.copy(onFront(waistRows, 0, BELT, 0.012));
    // (a pouch on each hip, a flap over it)
    for (const s of [1, -1]) {
      const at = onFront(waistRows, s * 0.2, BELT - 0.07, 0.025);
      const bag = add(new THREE.BoxGeometry(0.09, 0.1, 0.045, 2, 2, 1), M.pouch, j.spine, 'pouch');
      bag.position.copy(at);
      bag.rotation.y = s * 0.7;
      const flap = add(new THREE.BoxGeometry(0.094, 0.045, 0.05), M.belt, j.spine, 'pouch flap', false);
      flap.position.copy(at).add(V(0, 0.035, 0.003));
      flap.rotation.y = s * 0.7;
    }
    // (a round coin purse at his right front, drawn shut)
    const purse = add(new THREE.SphereGeometry(0.04, 12, 8).scale(1, 1.15, 0.8), M.pouch, j.spine, 'purse');
    purse.position.copy(onFront(waistRows, -0.11, BELT - 0.075, 0.03));
    add(new THREE.TorusGeometry(0.018, 0.004, 5, 12).rotateX(Math.PI / 2), M.brass, j.spine, 'purse ring', false)
      .position.copy(purse.position).add(V(0, 0.045, 0));
    // (a ring of keys at his left front)
    const ringAt = onFront(waistRows, 0.11, BELT - 0.05, 0.03);
    add(new THREE.TorusGeometry(0.022, 0.003, 5, 16), M.iron, j.spine, 'key ring', false).position.copy(ringAt);
    for (let k = 0; k < 3; k++) {
      const key = add(new THREE.BoxGeometry(0.008, 0.06, 0.003).translate(0, -0.03, 0), M.iron, j.spine, 'key', false);
      key.position.copy(ringAt).add(V((k - 1) * 0.012, -0.018, 0.004));
      key.rotation.z = (k - 1) * 0.3;
    }
  }
  // --- the apron: short, tan leather, from the belt to above his knees, over the hips ---
  {
    const lap: THREE.Vector3[][] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, y = lerp(-0.34, 0.07, t), w = lerp(0.27, 0.25, t), d = lerp(0.23, 0.21, t), half = lerp(0.2, 0.18, t);
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = lerp(-half, half, i / 8), a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
        row.push(V(x, y, z + lerp(0.03, 0.06, t) * Math.cos(a) ** 2 + 0.02));
      }
      lap.push(row);
    }
    add(rowsSurface(lap, 2), M.apron, j.hips, 'apron');
  }
  // --- trousers from the hips to the boots ---
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      rows.push(ring(lerp(-0.1, 0.08, t), lerp(0.24, 0.245, t), lerp(0.2, 0.2, t), 0.01, lerp(0.02, 0.05, t), 5.1));
    }
    add(rowsSurface(rows, 1.2), M.trousers, j.hips, 'trouser seat');
  }
  for (const [thigh, knee, ankle, s] of [[j.thighL, j.kneeL, j.ankleL, 1], [j.thighR, j.kneeR, j.ankleR, -1]] as const) {
    add(sleeve([[0.08, -j.P.thighL - 0.02], [0.085, -0.3], [0.09, -0.15], [0.095, 0.02]], 0.03, 1 + s), M.trousers, thigh, 'trouser thigh');
    add(sleeve([[0.058, -0.42], [0.06, -0.3], [0.064, -0.15], [0.07, 0], [0.078, 0.06]], 0.03, 3 + s), M.trousers, knee, 'trouser');
    add(new THREE.CylinderGeometry(0.064, 0.058, 0.22, 14).translate(0, 0.07, 0), M.boot, ankle, 'boot');
    const toe = add(new THREE.SphereGeometry(1, 14, 10).scale(0.056, 0.046, 0.12), M.boot, ankle, 'boot toe');
    toe.position.set(0, -0.04, 0.07);
  }
  // --- the sleeves: the shirt's, full, to the elbow, rolled up in a thick band over it; his forearms bare below ---
  for (const [shoulder, elbow, s] of [[j.shoulderL, j.elbowL, 1], [j.shoulderR, j.elbowR, -1]] as const) {
    add(sleeve([[0.07, -0.33], [0.078, -0.25], [0.084, -0.12], [0.09, -0.03], [0.088, 0.03], [0.06, 0.075], [0.024, 0.09]], 0.06, 5 + s),
      M.shirt, shoulder, 'sleeve');
    // (the roll: a fat band of the shirt turned up round the elbow)
    add(sleeve([[0.056, -0.05], [0.07, -0.04], [0.074, -0.01], [0.072, 0.03], [0.06, 0.045]], 0.05, 7 + s), M.shirt, elbow, 'sleeve roll');
    const fore = -j.P.foreL;
    add(sleeve([[0.026, fore - 0.012], [0.03, fore + 0.02], [0.038, fore * 0.55], [0.046, -0.05], [0.05, -0.02]], 0, 13 + s),
      M.arm, elbow, 'forearm');
  }
}

/** His head dressed: a broad teal felt hat, its brim wide and turned up at one side, a saffron band and a yellow plume.
 *  All in the head's group, made in the face's frame (mm). */
function dressHead(head: Head, hatFelt: THREE.Material, band: THREE.Material, feather: THREE.Material): void {
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
  // (a dent down the middle of its top, as a felt hat is pinched)
  {
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i);
      if (y > BASE + 60) p.setY(i, y - 10 * Math.exp(-((x / 28) ** 2)) * smooth(clamp((y - BASE - 60) / 26, 0, 1)));
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
