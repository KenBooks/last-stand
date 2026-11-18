// Bertram Tunwell, keeper of the Ember & Oak (world/tavern.ts stands him behind the tavern's bar; data/tavern.ts):
// an innkeeper of fifty, drawn to read as his own man beside the library's Brother Hollis (brown wool, a long white
// beard, a cap) and Odo the merchant (saffron and teal, a plumed hat, a dark beard). His own face (face.ts
// `FACES.keeper`, from the warrior's skull: older, a broad bulbous nose, fuller lips, flushed cheeks) with the head's
// own short crop and full beard in ginger going grey (`LOOKS.keeper`), made by the head workers as the heroes' are; a
// normal build; a cream shirt striped in bottle green, its placket buttoned and its sleeves rolled in cuffs above the
// elbow; a red neckerchief knotted at the throat; a long apron of oiled leather on straps, stitched round its edges, a
// pocket on its front; a striped linen towel over his left shoulder; grey-blue trousers and boots.
// His idle is a loop that never snaps (`KEEP_LOOP` long: every motion a pulse still at both its ends): he breathes,
// wipes the inside of a mug with a rag, polishes the bar in wide rounds, looks round his room; a hero coming near is
// looked up at, one talking to him held in his eye. His left fist closes round his mug and his right round his rag
// (hands.ts `hold`, `seatHeld`, as a hero's round a handle), each arm solved twice so the fist, not the wrist, lands
// where it's sent. Asked for ale (`serve`), he holds the mug under the cask's tap, his right hand on its handle, then
// sets it down and slides it across (`SERVE`): the room takes the mug as it leaves his hand (`served`).
// (His first form, from play: "Character is bad... make him thinner, work on hair, body, clothing detail. Work on his
// face, mouth, textures. What the hell is happening with his hands": a barrel of a man on the warrior's head, its
// hair taken off and cards stuck on a bare shell, claws for hands, a fist through his mug.)
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { cloth as clothMaps, oiled as oiledMaps, leather as leatherMaps, wool as woolMaps, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, reachArm, resetPose, walkCycle, type Joints } from './rig';
import { LegIK, gaitRate, legLength } from './ik';
import { stripRig } from './shapes';
import { buildHead, buildNeck, handSkin, HERO_HEADS, type Head } from './head';
import { buildHand, bare, hold, poseHand, seatHeld, type Hand } from './hands';
import { cord, oval, rowsSurface, sleeve } from './merchant';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';

/** the rag's radius where his fist closes round it bunched (m) */
const RAG_R = 0.022;
/** how fast a hand eases towards where it's sent (1/s: from 66 cm away, 10 cm the first frame) */
const GOAL_EASE = 9;
/** where his rag hangs tucked in his apron's pocket while his right hand holds something else (the hips' frame) */
const TUCKED = new THREE.Vector3(0.09, -0.24, 0.24);

/** Where one of his hands goes for the frame. */
export interface HandGoal {
  /** where it goes (world): the grip's place for a hand that holds or grips, the palm's for an open one */
  at: THREE.Vector3;
  /** what it holds, a child of that hand (`Keeper.carry`): the fist closed round it, its axis along `dir` (world, up by
   *  default), `r` its radius there, the thing stood with its +y along `dir` */
  held?: THREE.Object3D; r?: number; dir?: THREE.Vector3;
  /** a fist closed round a handle it doesn't carry (the broom's foot hand, the tap's handle): along `dir`, `r` round */
  grip?: boolean;
  /** a fist closed round a thing the other hand holds, `along` m up its +y from that hand's grip (the broom's foot
   *  hand): `at` and `dir` read off it as the other hand left it */
  on?: { thing: THREE.Object3D; along: number };
}

/** His body for the frame, the brain's (world/tavern.ts): his root's place and turn are set by it beforehand. */
export interface KeeperPose {
  /** how fast he walks (m/s, along his facing): the legs' stride and the arms' swing where a hand has no goal */
  speed: number;
  /** how far he leans over (0 upright, 1 bent over a table), and how far he crouches (0 standing, 1 down on his heels) */
  bend: number; crouch: number;
  /** what he looks at (world), or ahead */
  look: THREE.Vector3 | null;
  left: HandGoal | null; right: HandGoal | null;
}

export interface Keeper {
  /** his root: the brain stands it on the floor and turns it */
  root: THREE.Group;
  /** his body posed for the frame */
  pose(dt: number, p: KeeperPose): void;
  /** a thing put in his hand (`side`), carried by it from now, or taken out of it and left in `to`'s frame where it is */
  carry(side: 'left' | 'right', thing: THREE.Object3D): void;
  drop(thing: THREE.Object3D, to: THREE.Object3D): void;
  /** his rag: in his right hand, or tucked in his apron's pocket (`tuckRag`) while that hand holds something else */
  readonly rag: THREE.Object3D;
  tuckRag(tucked: boolean): void;
  /** he was put somewhere at once (stood behind the bar as he's seated): his feet set under him again there */
  placed(): void;
  /** his ankles in the world (the lab reads them sliding), and whether the leg IK has each foot planted */
  feet(out: [THREE.Vector3, THREE.Vector3]): [boolean, boolean];
  /** where each hand's grip is in the world, the left's and the right's (the lab reads them against their goals) */
  hands(out: [THREE.Vector3, THREE.Vector3]): void;
  /** his meshes (the lab reads them) */
  readonly parts: THREE.Mesh[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Stripes run down a cloth (u across it) on a ground, `repeat` times across a unit of its uv. */
function stripes(ground: string, stripe: string, bands: [number, number][], repeat: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const cx = c.getContext('2d')!;
  cx.fillStyle = ground; cx.fillRect(0, 0, 64, 8);
  cx.fillStyle = stripe;
  for (const [x, w] of bands) cx.fillRect(x, 0, w, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat, 1);
  t.anisotropy = 4;
  return t;
}

type Add = (g: THREE.BufferGeometry, m: THREE.Material, on: THREE.Object3D, name: string, cast?: boolean) => THREE.Mesh;
interface Mats {
  shirt: THREE.Material; apron: THREE.Material; strap: THREE.Material; thread: THREE.Material; scarf: THREE.Material;
  towel: THREE.Material; arm: THREE.Material; brass: THREE.Material; bone: THREE.Material; trousers: THREE.Material;
  boot: THREE.Material;
}

/**
 * The keeper. His head and hands are made as the heroes' are: build him once their workers have made them
 * (`preloadHeads`, `preloadHands`), or they're sculpted here on the page.
 */
export function buildKeeper(): Keeper {
  const kit = createKit(0xffc27a);
  const tex = (maps: ReturnType<typeof woolMaps>, ns = 1) => {
    const m = pbrMaterialMaps(maps, 1, ns);
    return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale };
  };
  // (his palette is a tavern's: cream and bottle green, oiled brown leather, a red scarf; Hollis wears brown and
  // oxblood, Odo saffron and teal)
  const shirtMap = stripes('#ece0c4', '#2c5236', [[0, 10], [17, 3]], 9);
  const shirt = kit.rim({ color: 0xffffff, roughness: 1, ...tex(clothMaps(), 0.9), map: shirtMap, side: THREE.DoubleSide }, 0xfff0d0, 0.3);
  const apron = kit.std({ color: 0x74503a, roughness: 0.78, ...tex(oiledMaps(), 0.45), side: THREE.DoubleSide });
  const strap = kit.std({ color: 0x3a2414, roughness: 0.5, ...tex(leatherMaps(), 0.7) });
  const thread = kit.std({ color: 0xc8b088, roughness: 0.9 });
  const scarf = kit.rim({ color: 0x9a2018, roughness: 0.95, ...tex(clothMaps(), 0.8), side: THREE.DoubleSide }, 0xd04030, 0.3);
  const towelMap = stripes('#e8decb', '#9a3a2a', [[6, 3], [11, 2]], 1);
  const towel = kit.rim({ color: 0xffffff, roughness: 1, ...tex(clothMaps(), 1.2), map: towelMap, side: THREE.DoubleSide }, 0xfff4e0, 0.25);
  const brass = kit.std({ color: 0xc89a48, metalness: 0.9, roughness: 0.35 });
  const bone = kit.std({ color: 0xe6dcc6, roughness: 0.5 });
  const trousers = kit.std({ color: 0x343c4a, roughness: 1, ...tex(woolMaps(), 1) });
  const boot = kit.std({ color: 0x2a1a10, roughness: 0.6, ...tex(leatherMaps(), 1) });

  // --- the rig: a man of an ordinary build, a little thick at the waist; his legs planted by the leg IK as he walks ---
  const j: Joints = buildHumanoid({ skin: shirt }, { chestW: 0.21, chestD: 0.14, waistW: 0.17 });
  stripRig(j.root);
  for (const [name, o] of Object.entries(j)) if (o instanceof THREE.Object3D && !o.name) o.name = `keeper ${name}`;
  const P = j.P;
  const legs = new LegIK(j), leg = legLength({ joints: j, root: j.root }), hipY = j.hips.position.y;

  // --- the head: his own face, short crop and full beard, all the head's own (face.ts, head.ts) ---
  const head: Head = buildHead(j.head, kit, HERO_HEADS.keeper.who, HERO_HEADS.keeper);
  buildNeck(j.neck, kit, 'keeper', P.neckL, j.head);

  // --- the hands: the heroes' own, bare, his forearms in his own skin ---
  const skin = handSkin(kit, 'keeper');
  const handL = buildHand(j.handL, 1, skin, skin, 1.06, skin), handR = buildHand(j.handR, -1, skin, skin, 1.06, skin);
  bare(handL, true); bare(handR, true);
  const arm = kit.rim({ color: (skin as THREE.MeshStandardMaterial).color.clone().multiplyScalar(0.96), roughness: 0.7 }, 0xf0b0a0, 0.22);

  // --- his clothes ---
  const parts: THREE.Mesh[] = [];
  const add: Add = (geo, mat, on, name, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `keeper ${name}`;
    m.castShadow = cast; m.receiveShadow = true;
    on.add(m);
    parts.push(m);
    return m;
  };
  dressBody(j, add, { shirt, apron, strap, thread, scarf, towel, arm, brass, bone, trousers, boot });
  const rag = add(ragGeometry(), towel, j.handR, 'rag', false);
  let ragTucked = false;

  // --- his pose, a frame at a time ---
  let phase = 0, gaze = 0, bend = 0, crouch = 0;
  /** each hand's goal eased towards where it's sent (a step's goal changes at once: the hand doesn't), and how far
   *  the arm is its goal's rather than his walk's swing */
  const eased = [new THREE.Vector3(), new THREE.Vector3()], easedSet = [false, false], weight = [0, 0];
  const swing = { qs: new THREE.Quaternion(), qe: new THREE.Quaternion() };
  const lookYaw = { v: 0 }, lookPitch = { v: 0 };
  const tmp = new THREE.Vector3(), at = new THREE.Vector3(), headAt = new THREE.Vector3(), wrist = new THREE.Vector3();
  const poleL = V(1, -0.6, -0.5).normalize(), poleR = V(-1, -0.6, -0.5).normalize(), up = V(0, 1, 0);
  const turn = new THREE.Quaternion(), along = new THREE.Quaternion();
  const chestLocal = (v: THREE.Vector3) => j.chest.worldToLocal(v.clone());
  const handOf = (left: boolean): Hand => (left ? handL : handR);
  /** one arm to its goal: a fist seated round what it holds (solved twice, so the grip lands where it's sent), a fist
   *  round a handle, or an open hand, flat */
  const reach = (left: boolean, g: HandGoal) => {
    const [shoulder, elbow, pole] = left ? [j.shoulderL, j.elbowL, poleL] : [j.shoulderR, j.elbowR, poleR];
    const h = handOf(left);
    if (g.on) {
      j.root.updateMatrixWorld(true);
      g = { ...g, at: g.on.thing.localToWorld(new THREE.Vector3(0, g.on.along, 0)), dir: new THREE.Vector3(0, 1, 0).applyQuaternion(g.on.thing.getWorldQuaternion(turn)), grip: true };
    }
    const dir = g.dir ?? up;
    // (the wrist guessed a hand's length back towards him from the grip, then moved by how far the grip landed off)
    j.root.getWorldQuaternion(turn);
    wrist.copy(g.at).add(tmp.set(left ? 0.02 : -0.02, 0.06, -0.07).applyQuaternion(turn));
    const passes = g.held || g.grip ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      reachArm(shoulder, elbow, P.upperL, P.foreL, chestLocal(wrist), pole, 1, 0.08);
      j.root.updateMatrixWorld(true);
      if (g.held) {
        hold(h, dir, g.r ?? 0.02);
        seatHeld(h, g.held, g.r ?? 0.02);
        // (the thing stood along its axis in the world, whatever the hand's turn)
        g.held.parent!.getWorldQuaternion(turn).invert();
        g.held.quaternion.copy(turn.multiply(along.setFromUnitVectors(up, dir)));
        j.root.updateMatrixWorld(true);
        g.held.getWorldPosition(at);
      } else if (g.grip) {
        hold(h, dir, g.r ?? 0.015);
        h.vis.updateWorldMatrix(true, false);
        h.vis.localToWorld(at.set(0, -0.085, 0.03));
      } else {
        poseHand(h, 0.18, 0.08, 0, 0, 0);
        return;
      }
      wrist.add(tmp.subVectors(g.at, at));
    }
  };

  function pose(dt: number, p: KeeperPose): void {
    resetPose(j);
    // --- the legs: the walk cycle at his speed, the leg IK planting each foot; crouched, his hips down over them ---
    phase = legs.setOff(phase) + dt * p.speed * gaitRate(p.speed, leg) * legs.cadence;
    const move = Math.min(1, p.speed / 0.8);
    walkCycle(j, phase, move, { stride: 0.5, knee: 0.9, arm: 0.3, bob: 0.04 });
    // (his lean and his crouch eased, never snapped: a step's end drops both at once)
    bend = damp(bend, p.bend, 5, dt);
    crouch = damp(crouch, p.crouch, 4, dt);
    j.hips.position.y = hipY - crouch * 0.32;
    // (the legs set on the floor first, the body over them: the arms are solved after, from where that leaves the body)
    j.root.updateMatrixWorld(true);
    legs.update(dt, phase, -1);
    // --- the body: leaning over his work, the head on what he looks at ---
    j.spine.rotation.x += 0.03 + bend * 0.42 + crouch * 0.2;
    j.chest.rotation.x += bend * 0.18;
    j.root.updateMatrixWorld(true);
    gaze = damp(gaze, p.look ? 1 : 0, 4, dt);
    if (p.look) {
      j.neck.getWorldPosition(headAt);
      tmp.copy(p.look);
      j.root.worldToLocal(tmp);
      j.root.worldToLocal(headAt);
      tmp.sub(headAt);
      const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.1, 1.1), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) + bend * 0.5, -0.9, 0.5);
      lookYaw.v = damp(lookYaw.v, yaw, 6, dt);
      lookPitch.v = damp(lookPitch.v, pitch, 6, dt);
    }
    j.chest.rotation.y += lookYaw.v * 0.2 * gaze;
    j.neck.rotation.set(-lookPitch.v * 0.4 * gaze, lookYaw.v * 0.15 * gaze, 0);
    j.head.rotation.set(-lookPitch.v * 0.6 * gaze, lookYaw.v * 0.6 * gaze, 0);
    for (const e of head.eyes) e.rotation.set(0.05, 0, 0);
    j.root.updateMatrixWorld(true);
    // --- the arms: each to its goal, eased there, or swinging with his walk; between the two blended ---
    for (const left of [true, false]) {
      const i = left ? 0 : 1, goal = left ? p.left : p.right;
      weight[i] = damp(weight[i], goal ? 1 : 0, GOAL_EASE, dt);
      if (!goal) { easedSet[i] = false; continue; }
      if (!easedSet[i]) { eased[i].copy(goal.at); easedSet[i] = true; } else eased[i].lerp(goal.at, 1 - Math.exp(-GOAL_EASE * dt));
      const [shoulder, elbow] = left ? [j.shoulderL, j.elbowL] : [j.shoulderR, j.elbowR];
      swing.qs.copy(shoulder.quaternion); swing.qe.copy(elbow.quaternion);
      reach(left, { ...goal, at: eased[i] });
      if (weight[i] < 0.999) { shoulder.quaternion.slerpQuaternions(swing.qs, shoulder.quaternion.clone(), weight[i]); elbow.quaternion.slerpQuaternions(swing.qe, elbow.quaternion.clone(), weight[i]); }
    }
    if (!p.left) poseHand(handL, 0.3, 0.05, 0, 0, 0);
    if (p.right) { /* posed by its goal */ }
    else if (!ragTucked) {
      // (his rag in his hanging right hand: the fist closed round it as it swings)
      j.root.updateMatrixWorld(true);
      hold(handR, up, RAG_R);
      seatHeld(handR, rag, RAG_R);
      rag.parent!.getWorldQuaternion(turn).invert();
      rag.quaternion.copy(turn);
    } else poseHand(handR, 0.3, 0.05, 0, 0, 0);
  }

  pose(0, { speed: 0, bend: 0, crouch: 0, look: null, left: null, right: null });

  return {
    root: j.root,
    pose,
    carry(side, thing) { (side === 'left' ? j.handL : j.handR).attach(thing); },
    drop(thing, to) { to.attach(thing); },
    rag,
    tuckRag(tucked) {
      if (tucked === ragTucked) return;
      ragTucked = tucked;
      if (tucked) {
        j.hips.add(rag);
        rag.position.copy(TUCKED);
        rag.quaternion.identity();
      } else j.handR.add(rag);
    },
    placed() { legs.reset(); easedSet[0] = easedSet[1] = false; },
    hands(out) {
      for (const [i, h] of [handL, handR].entries()) h.vis.localToWorld(out[i].set(0, -0.085, 0.03));
    },
    feet(out) {
      j.ankleL.getWorldPosition(out[0]);
      j.ankleR.getWorldPosition(out[1]);
      return [legs.feet[0].state === 'plant', legs.feet[1].state === 'plant'];
    },
    parts,
  };
}

/** A rag bunched in a fist and hanging from it in soft folds, its hem uneven: its origin where the fist holds it,
 *  hanging down its -y. */
function ragGeometry(): THREE.BufferGeometry {
  const rng = mulberry(29), rows: THREE.Vector3[][] = [], N = 24, phase = rng() * 6;
  for (let k = 0; k <= 8; k++) {
    const s = k / 8, row: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      // (gathered tight in the fist, opening as it falls; deep folds round it, flattened front to back)
      const r = lerp(0.012, 0.055, smooth(Math.min(1, s * 1.4))) * (1 + 0.28 * Math.sin(a * 5 + phase) * s);
      const hem = s * (0.13 + 0.03 * Math.sin(a * 3 + phase * 2) + 0.015 * Math.sin(a * 7));
      row.push(V(r * Math.cos(a), 0.012 - hem, r * Math.sin(a) * 0.55));
    }
    rows.push(row);
  }
  return rowsSurface(rows, 4);
}

/** His clothes on the rig: the striped shirt, its placket buttoned, soft folds at the waist, its collar under a red
 *  neckerchief knotted at the throat; the long oiled-leather apron, a bib on his chest on straps over his shoulders
 *  and a skirt from his waist to below his knees, stitched round its edges, a pocket on its front; a striped linen
 *  towel over his left shoulder; sleeves rolled in a thick cuff above the elbow, bare forearms; trousers and boots. */
function dressBody(j: Joints, add: Add, M: Mats): void {
  const N = 40;
  const ring = (y: number, w: number, d: number, fold: number, belly: number, seed: number) => {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, z] = oval(a, w, d);
      const f = 1 + fold * (Math.sin(a * 7 + seed) * 0.6 + Math.sin(a * 13 + seed * 2) * 0.4) * (0.6 + 0.4 * Math.cos(a));
      row.push(new THREE.Vector3(x * f, y, z * f + belly * Math.max(0, Math.cos(a)) ** 2));
    }
    return row;
  };
  type Row = [number, number, number, number, number];
  // --- the shirt: chest, up over the shoulders to the collar ---
  const chestRows: Row[] = [
    [-0.1, 0.205, 0.165, 0.012, 0.04], [0.0, 0.208, 0.16, 0.01, 0.03], [0.08, 0.215, 0.152, 0.008, 0.015],
    [0.14, 0.222, 0.142, 0.006, 0], [0.185, 0.225, 0.13, 0.004, 0], [0.215, 0.208, 0.115, 0.002, 0],
    [0.238, 0.16, 0.096, 0, 0], [0.255, 0.105, 0.08, 0, 0], [0.285, 0.062, 0.064, 0, 0],
  ];
  add(rowsSurface(chestRows.map(([y, w, d, f, b]) => ring(y, w, d, f, b, 1.1)), 1.2), M.shirt, j.chest, 'shirt chest');
  // (gathered where it's tucked in at the waist: deeper folds low)
  const waistRows: Row[] = [
    [-0.12, 0.2, 0.17, 0.022, 0.03], [-0.06, 0.2, 0.172, 0.018, 0.05], [0.02, 0.198, 0.17, 0.014, 0.06],
    [0.1, 0.196, 0.165, 0.012, 0.05], [0.2, 0.196, 0.16, 0.01, 0.04],
  ];
  add(rowsSurface(waistRows.map(([y, w, d, f, b]) => ring(y, w, d, f, b, 2.4)), 1.2), M.shirt, j.spine, 'shirt belly');
  const front = (rows: Row[], y: number) => {
    const at = rows.findIndex((r) => r[0] >= y), hi = rows[Math.max(0, at)], lo = rows[Math.max(0, at - 1)];
    const t = hi === lo ? 0 : (y - lo[0]) / (hi[0] - lo[0]);
    return { w: lerp(lo[1], hi[1], t), d: lerp(lo[2], hi[2], t), b: lerp(lo[4], hi[4], t) };
  };
  /** a point on the body's front at (x, y), `lift` off it */
  const onFront = (rows: Row[], x: number, y: number, lift: number) => {
    const { w, d, b } = front(rows, y), a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
    return new THREE.Vector3(x, y, z + b * Math.cos(a) ** 2 + lift);
  };
  // --- the shirt's placket down his chest above the bib, two bone buttons on it ---
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 4; k++) {
      const y = lerp(0.2, 0.262, k / 4), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 2; i++) row.push(onFront(chestRows, lerp(-0.012, 0.012, i / 2), y, 0.004));
      rows.push(row);
    }
    add(rowsSurface(rows, 3), M.shirt, j.chest, 'shirt placket');
    for (const y of [0.21, 0.235]) {
      add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 10).rotateX(Math.PI / 2), M.bone, j.chest, 'shirt button', false)
        .position.copy(onFront(chestRows, 0, y, 0.007));
    }
  }
  // --- the neckerchief: a red band round his neck, a knot at his throat, its two ends falling as flat cloth ---
  {
    const band: THREE.Vector3[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, [x, z] = oval(a, 0.07, 0.07, 2);
      band.push(new THREE.Vector3(x, 0.275 - 0.012 * Math.cos(a), z));
    }
    add(cord(band, 0.013, true, 36), M.scarf, j.chest, 'neckerchief');
    const knot = add(new THREE.TorusKnotGeometry(0.011, 0.006, 36, 6, 2, 3), M.scarf, j.chest, 'neckerchief knot', false);
    knot.position.set(0, 0.252, 0.082);
    knot.rotation.set(0.3, 0, 0);
    // (each end a narrowing strip of the cloth, falling down his chest and a little out)
    for (const s of [1, -1]) {
      const rows: THREE.Vector3[][] = [];
      for (let k = 0; k <= 6; k++) {
        const q = k / 6, x = s * (0.006 + 0.03 * q), y = 0.248 - 0.085 * q, z = 0.09 + 0.022 * q - 0.012 * q * q;
        const w = lerp(0.016, 0.004, q);
        rows.push([new THREE.Vector3(x - w, y, z), new THREE.Vector3(x + w, y, z + 0.004 * Math.sin(q * 6))]);
      }
      add(rowsSurface(rows, 6), M.scarf, j.chest, 'neckerchief end', false);
    }
  }
  // --- the apron's bib: a panel on his chest, stitched round, on straps over his shoulders crossing his back ---
  const BIB = { from: -0.1, to: 0.19, half: [0.165, 0.11] as const };
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 8; k++) {
      const y = lerp(BIB.from, BIB.to, k / 8), half = lerp(BIB.half[0], BIB.half[1], k / 8), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) row.push(onFront(chestRows, lerp(-half, half, i / 8), y, 0.012));
      rows.push(row);
    }
    add(rowsSurface(rows, 2), M.apron, j.chest, 'apron bib');
    // (its stitching: a line of pale thread a centimetre in from its edges)
    const edge: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) edge.push(onFront(chestRows, -lerp(BIB.half[0], BIB.half[1], k / 8) + 0.01, lerp(BIB.from, BIB.to, k / 8) - 0.01, 0.0145));
    for (let i = 0; i <= 6; i++) edge.push(onFront(chestRows, lerp(-BIB.half[1] + 0.01, BIB.half[1] - 0.01, i / 6), BIB.to - 0.01, 0.0145));
    for (let k = 8; k >= 0; k--) edge.push(onFront(chestRows, lerp(BIB.half[0], BIB.half[1], k / 8) - 0.01, lerp(BIB.from, BIB.to, k / 8) - 0.01, 0.0145));
    add(cord(edge, 0.0012, false, 160), M.thread, j.chest, 'apron stitching', false);
    for (const s of [1, -1]) {
      const pts = [
        onFront(chestRows, s * 0.095, 0.185, 0.014), new THREE.Vector3(s * 0.11, 0.245, 0.06), new THREE.Vector3(s * 0.12, 0.258, -0.02),
        new THREE.Vector3(s * 0.1, 0.22, -0.11), new THREE.Vector3(-s * 0.04, 0.06, -0.17), new THREE.Vector3(-s * 0.13, -0.08, -0.165),
      ];
      add(cord(pts, 0.007, false, 30), M.strap, j.chest, 'apron strap');
      const ring = add(new THREE.TorusGeometry(0.011, 0.0028, 6, 14), M.brass, j.chest, 'apron buckle', false);
      ring.position.copy(onFront(chestRows, s * 0.095, 0.175, 0.016));
    }
  }
  // --- the apron's skirt: from his waist to below his knees round his front and sides, stitched at its hem, a pocket
  // on its front, a tie at the back ---
  {
    const at = (t: number, i: number) => {
      const y = lerp(-0.64, 0.06, t), w = lerp(0.24, 0.21, t), d = lerp(0.2, 0.18, t), half = lerp(0.23, 0.19, t);
      const x = lerp(-half, half, i / 10), a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
      return new THREE.Vector3(x, y, z + lerp(0.015, 0.04, t) * Math.cos(a) ** 2 + 0.02 + 0.008 * Math.sin(i * 1.9 + t * 9) * (1 - t));
    };
    const lap: THREE.Vector3[][] = [];
    for (let k = 0; k <= 12; k++) {
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) row.push(at(k / 12, i));
      lap.push(row);
    }
    add(rowsSurface(lap, 2), M.apron, j.hips, 'apron skirt');
    const hem: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) hem.push(at(0.025, i / 2).add(new THREE.Vector3(0, 0, 0.003)));
    add(cord(hem, 0.0012, false, 80), M.thread, j.hips, 'apron hem stitching', false);
    // (a pocket: a patch of the leather over the skirt, its sides and foot stitched)
    const pocket: THREE.Vector3[][] = [];
    for (let k = 0; k <= 3; k++) {
      const row: THREE.Vector3[] = [];
      for (let i = 3; i <= 7; i++) row.push(at(lerp(0.45, 0.66, k / 3), i).add(new THREE.Vector3(0, 0, 0.005)));
      pocket.push(row);
    }
    add(rowsSurface(pocket, 2), M.apron, j.hips, 'apron pocket', false);
    const seam = [at(0.66, 3.1), at(0.45, 3.1), at(0.45, 6.9), at(0.66, 6.9)].map((p) => p.add(new THREE.Vector3(0, 0, 0.008)));
    add(cord(seam, 0.0012, false, 40), M.thread, j.hips, 'apron pocket stitching', false);
    add(rowsSurface([ring(-0.005, 0.212, 0.182, 0, 0.05, 0), ring(0.03, 0.21, 0.18, 0, 0.05, 0)], 2), M.strap, j.spine, 'apron tie');
  }
  // --- the towel over his left shoulder: down his chest a hand's length, over the shoulder and down his back, its
  // cloth folded in long creases along it ---
  {
    const path = [
      new THREE.Vector3(0.15, 0.0, 0.17), new THREE.Vector3(0.155, 0.12, 0.155), new THREE.Vector3(0.16, 0.215, 0.105),
      new THREE.Vector3(0.16, 0.25, 0.0), new THREE.Vector3(0.16, 0.215, -0.105), new THREE.Vector3(0.155, 0.1, -0.145),
      new THREE.Vector3(0.15, -0.02, -0.15),
    ];
    const curve = new THREE.CatmullRomCurve3(path), rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 20; k++) {
      const p = curve.getPointAt(k / 20), out = p.z > 0 ? 1 : -1, row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = lerp(-0.05, 0.05, i / 8), crease = 0.006 * Math.sin(i * Math.PI * 0.9 + k * 0.4);
        row.push(new THREE.Vector3(p.x + x, p.y, p.z + out * (0.012 + crease)));
      }
      rows.push(row);
    }
    add(rowsSurface(rows, 4), M.towel, j.chest, 'towel');
  }
  // --- trousers from the hips to the boots ---
  add(rowsSurface([0, 1, 2, 3, 4].map((k) => ring(lerp(-0.1, 0.08, k / 4), lerp(0.215, 0.2, k / 4), 0.175, 0.012, lerp(0.02, 0.03, k / 4), 5.1)), 1.2),
    M.trousers, j.hips, 'trouser seat');
  for (const [thigh, knee, ankle, s] of [[j.thighL, j.kneeL, j.ankleL, 1], [j.thighR, j.kneeR, j.ankleR, -1]] as const) {
    add(sleeve([[0.08, -j.P.thighL - 0.02], [0.086, -0.3], [0.092, -0.15], [0.098, 0.02]], 0.04, 1 + s), M.trousers, thigh, 'trouser thigh');
    add(sleeve([[0.058, -0.42], [0.06, -0.3], [0.064, -0.15], [0.07, 0], [0.078, 0.06]], 0.04, 3 + s), M.trousers, knee, 'trouser');
    add(new THREE.CylinderGeometry(0.064, 0.058, 0.24, 14).translate(0, 0.08, 0), M.boot, ankle, 'boot');
    add(new THREE.SphereGeometry(1, 14, 10).scale(0.056, 0.047, 0.12), M.boot, ankle, 'boot toe').position.set(0, -0.04, 0.07);
  }
  // --- the sleeves: the shirt's, full, rolled above the elbow in a thick cuff of two turns; his forearms bare below ---
  for (const [shoulder, elbow, s] of [[j.shoulderL, j.elbowL, 1], [j.shoulderR, j.elbowR, -1]] as const) {
    add(sleeve([[0.066, -0.26], [0.074, -0.2], [0.08, -0.1], [0.086, -0.03], [0.084, 0.03], [0.058, 0.075], [0.024, 0.09]], 0.08, 5 + s),
      M.shirt, shoulder, 'sleeve');
    // (the cuff: two turns of the shirt rolled up, the lower one fatter)
    add(sleeve([[0.064, -0.3], [0.076, -0.292], [0.079, -0.276], [0.074, -0.264], [0.07, -0.262]], 0.03, 7 + s), M.shirt, shoulder, 'sleeve cuff');
    add(sleeve([[0.07, -0.265], [0.078, -0.258], [0.08, -0.247], [0.075, -0.238], [0.066, -0.235]], 0.03, 9 + s), M.shirt, shoulder, 'sleeve cuff');
    const fore = -j.P.foreL;
    add(sleeve([[0.027, fore - 0.012], [0.031, fore + 0.02], [0.04, fore * 0.55], [0.048, -0.05], [0.052, 0.02], [0.054, 0.06]], 0, 13 + s),
      M.arm, elbow, 'forearm');
  }
}
