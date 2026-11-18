// Bertram Tunwell, keeper of the Ember & Oak (world/rooms.ts stands him behind the tavern's bar; data/tavern.ts): a big,
// broad, ruddy innkeeper, drawn to read as his own man beside the library's Brother Hollis (brown wool, a white beard,
// a cap) and Odo the merchant (saffron, teal, a plumed hat, a dark beard): bald on top with a ginger fringe round the
// back of his head, a great ginger walrus moustache and bushy brows, a cream shirt striped in bottle green with its
// sleeves rolled, a red neckerchief, a long apron of dark oiled leather from his chest to below his knees on straps
// over his shoulders, a linen towel over his left shoulder, grey-blue trousers and boots. Built on the heroes' own rig,
// head (the warrior's face, heavier and older) and hands, as the other folk are.
// His idle is a loop that never snaps (`KEEP_LOOP` long: every motion a pulse still at both its ends): he breathes,
// wipes the inside of a mug with a cloth, sets his hands on the bar, polishes its top in wide rounds, looks round his
// room; a hero coming near is looked up at, and one talking to him held in his eye. Asked for ale (`serve`), he holds a
// mug under the cask's tap on the bar and fills it, sets it down and slides it across (`SERVE`): the room takes the
// mug as it leaves his hand (`served`) and slides it on to the hero.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createKit } from '../../core/materials';
import { cloth as clothMaps, leather as leatherMaps, wool as woolMaps, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, reachArm, type Joints } from './rig';
import { stripRig } from './shapes';
import { buildHead, buildNeck, hairCard, handSkin, toGroup, HEAD_MM, HERO_HEADS, type Head } from './head';
import { buildHand, bare, poseHand } from './hands';
import { cord, oval, rowsSurface, sleeve } from './merchant';
import { mergeAll } from './scholar';
import { buildMug } from './flask';
import { SERVE } from '../../data/tavern';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';

/** how long his idle loop is (s) */
export const KEEP_LOOP = 32;
/** what happens when in the loop (s): a mug wiped with his cloth, the bar polished, a look round the room */
const BEATS = { wipe: [1, 13], polish: [15, 26], look: [27.5, 30.5] } as const satisfies Record<string, readonly [number, number]>;
/** how near a hero comes (m) before he looks up, how long he looks (s), and how long before he looks up again */
const GLANCE = { near: 4.5, hold: 3, rest: 9 };

/** Where his bar and what's on it stand, in his frame (x across him, his left +x; +z ahead; up from the floor). */
export interface KeeperBar {
  /** the bar's top (m), its near edge (z) and its far edge, the hero's side */
  top: number; near: number; far: number;
  /** the cask's tap on the bar, where the ale runs from */
  tap: THREE.Vector3;
}

export interface Keeper {
  /** his root: stand it on the floor behind the bar, facing across it (+z) */
  root: THREE.Group;
  /** his pose for the frame: `hero` where the local hero is (world space) or null; `talking` while the hero talks to him */
  update(dt: number, hero: THREE.Vector3 | null, talking: boolean): void;
  /** a mug of ale asked for: he fills one and slides it across (false if he's already pouring one) */
  serve(): boolean;
  /** how far into a serving he is (s; -1 none) */
  readonly serving: number;
  /** the mug he slides, as it leaves his hand on the bar (his frame), once a serving reaches it; `null` otherwise */
  served(): THREE.Vector3 | null;
  /** how far into his loop he is (s), for the lab's pictures at set points of it */
  loopAt: number;
  /** his meshes (the lab reads them) */
  readonly parts: THREE.Mesh[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** 0 outside [a, b], 1 inside it, eased in and out over `rise` at each end */
const span = (t: number, a: number, b: number, rise: number): number =>
  smooth(clamp((t - a) / rise, 0, 1)) * (1 - smooth(clamp((t - (b - rise)) / rise, 0, 1)));
/** where `t` is between a and b (0 to 1) */
const along = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);

/** The stripes of his shirt: cream, a bottle-green stripe and a thin one beside it, run down the cloth (u across it). */
function stripes(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const cx = c.getContext('2d')!;
  cx.fillStyle = '#efe4c8'; cx.fillRect(0, 0, 64, 8);
  cx.fillStyle = '#2c5236'; cx.fillRect(0, 0, 12, 8);
  cx.fillRect(20, 0, 3, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(9, 1);
  t.anisotropy = 4;
  return t;
}

type Add = (g: THREE.BufferGeometry, m: THREE.Material, on: THREE.Object3D, name: string, cast?: boolean) => THREE.Mesh;
interface Mats {
  shirt: THREE.Material; apron: THREE.Material; strap: THREE.Material; scarf: THREE.Material; towel: THREE.Material;
  arm: THREE.Material; brass: THREE.Material; trousers: THREE.Material; boot: THREE.Material;
}

/**
 * The keeper, behind `bar`. His head and hands are the heroes': build him once their workers have made them
 * (`preloadHeads`, `preloadHands`), or they're sculpted here on the page.
 */
export function buildKeeper(bar: KeeperBar): Keeper {
  const kit = createKit(0xffc27a);
  const tex = (maps: ReturnType<typeof woolMaps>, ns = 1) => {
    const m = pbrMaterialMaps(maps, 1, ns);
    return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale };
  };
  // (his palette is a tavern's: cream and bottle green, dark oiled leather, a red scarf; Hollis wears brown and
  // oxblood, Odo saffron and teal)
  const shirt = kit.rim({ color: 0xffffff, roughness: 1, ...tex(clothMaps(), 1.2), map: stripes(), side: THREE.DoubleSide }, 0xfff0d0, 0.3);
  const apron = kit.std({ color: 0x3a2416, roughness: 0.5, ...tex(leatherMaps(), 1.3), side: THREE.DoubleSide });
  const strap = kit.std({ color: 0x24160c, roughness: 0.55, ...tex(leatherMaps(), 1) });
  const scarf = kit.rim({ color: 0x9a2018, roughness: 0.95, ...tex(clothMaps(), 1) }, 0xd04030, 0.3);
  const towel = kit.rim({ color: 0xe6dcc4, roughness: 1, ...tex(clothMaps(), 1.4), side: THREE.DoubleSide }, 0xfff4e0, 0.25);
  const arm = kit.rim({ color: 0xd0907a, roughness: 0.75 }, 0xf0b0a0, 0.25);
  const brass = kit.std({ color: 0xc89a48, metalness: 0.9, roughness: 0.35 });
  const trousers = kit.std({ color: 0x343c4a, roughness: 1, ...tex(woolMaps(), 1) });
  const boot = kit.std({ color: 0x2a1a10, roughness: 0.6, ...tex(leatherMaps(), 1) });
  const rag = kit.rim({ color: 0xd8ccb0, roughness: 1, ...tex(clothMaps(), 1.6) }, 0xfff0d8, 0.2);

  // --- the rig: big and broad, a deep chest and a round belly, a head taller than the others ---
  const j: Joints = buildHumanoid({ skin: shirt }, { chestW: 0.27, chestD: 0.18, waistW: 0.25 });
  stripRig(j.root);
  j.root.scale.setScalar(1.04);
  for (const [name, o] of Object.entries(j)) if (o instanceof THREE.Object3D && !o.name) o.name = `keeper ${name}`;
  const P = j.P;

  // --- the head: the warrior's face, ruddy and older, bald on top; a ginger fringe, moustache and brows ---
  const head: Head = buildHead(j.head, kit, HERO_HEADS.warrior.who, HERO_HEADS.warrior);
  buildNeck(j.neck, kit, 'warrior', P.neckL, j.head);
  const faceMat = head.face.material as THREE.MeshStandardMaterial;
  faceMat.color.multiply(new THREE.Color(1.08, 0.88, 0.8));
  const cards = (head.hair[1]?.material ?? head.hair[0]?.material) as THREE.MeshStandardMaterial | undefined;
  const ginger = (cards ?? new THREE.MeshStandardMaterial()).clone();
  ginger.color.setRGB(0.95, 0.48, 0.2);
  ginger.roughness = 0.85;
  if (cards) {
    // (a clone loses the kit's hooks: the ginger keeps its card's, so it draws with its program)
    ginger.onBeforeCompile = cards.onBeforeCompile;
    ginger.customProgramCacheKey = cards.customProgramCacheKey;
    (ginger as unknown as { litBothSides: boolean }).litBothSides = true;
    Object.defineProperty(ginger, 'kitLooks', { value: (cards as unknown as { kitLooks: unknown }).kitLooks, configurable: true });
  }
  // --- the hands: the heroes' own, bare, big ---
  const skin = handSkin(kit, 'warrior');
  skin.color.multiply(new THREE.Color(1.06, 0.92, 0.86));
  // (his crown bare and his chin shaved, the walrus moustache alone on his face: the locks and the beard taken off the
  // head, not hidden, as the room's warm-up shows every hidden mesh to compile it; the scalp's shell kept, in his skin,
  // over the face's painted hair)
  for (const h of [...head.hair.slice(1), ...head.beards]) h.removeFromParent();
  const scalp = head.hair[0];
  if (scalp) {
    // (its own copy, smoothed: the shell is shared with every warrior's head, and its grooves under the locks read as
    // stripes on bare skin; a shade darker than the hands, as his face is under the bar's lamps)
    const smooth = mergeVertices(scalp.geometry.clone().deleteAttribute('normal').deleteAttribute('uv'), 1e-4);
    smooth.computeVertexNormals();
    scalp.geometry = smooth;
    const pate = skin.clone();
    pate.color.multiply(new THREE.Color(0.78, 0.68, 0.64));
    pate.onBeforeCompile = skin.onBeforeCompile;
    pate.customProgramCacheKey = skin.customProgramCacheKey;
    Object.defineProperty(pate, 'kitLooks', { value: (skin as unknown as { kitLooks: unknown }).kitLooks, configurable: true });
    scalp.material = pate;
  }
  dressHead(head, ginger);
  const handL = buildHand(j.handL, 1, skin, skin, 1.14, skin), handR = buildHand(j.handR, -1, skin, skin, 1.14, skin);
  bare(handL, true); bare(handR, true);

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
  dressBody(j, add, { shirt, apron, strap, scarf, towel, arm, brass, trousers, boot });

  // --- what he holds: a mug in his left hand, a cloth in his right ---
  const mug = buildMug(kit);
  mug.position.set(0.0, -0.085, 0.03);
  j.handL.add(mug);
  const clothGeo = new THREE.IcosahedronGeometry(0.045, 1);
  {
    const p = clothGeo.attributes.position, rng = mulberry(17);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + rng() * 0.4), p.getY(i) * 0.7, p.getZ(i) * (0.9 + rng() * 0.5));
    clothGeo.computeVertexNormals();
  }
  const clothMesh = add(clothGeo, rag, j.handR, 'cloth', false);
  clothMesh.position.set(0, -0.09, 0.025);

  // --- his pose, a frame at a time ---
  const eyes = head.eyes;
  let loop = 3, gaze = 0, gazeWant = 0, gazeUntil = -1, nextGlance = 0, clock = 0, serveT = -1;
  const lookYaw = { v: 0 }, lookPitch = { v: 0 };
  const hero = new THREE.Vector3(), headAt = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tL = new THREE.Vector3(), tR = new THREE.Vector3(), poleL = new THREE.Vector3(), poleR = new THREE.Vector3();
  const chestLocal = (v: THREE.Vector3) => j.chest.worldToLocal(j.root.localToWorld(v));
  /** where his hands rest on the bar: just in from its near edge, a little wider than his shoulders */
  const rest = (s: number, out: THREE.Vector3) => out.set(s * 0.22, bar.top + 0.04, bar.near + 0.1);
  /** where the mug stands as he lets it go on the bar, sliding it */
  const slideFrom = V(0.02, bar.top, bar.near + 0.3);
  const slid = new THREE.Vector3();
  const mugTurn = new THREE.Quaternion(), rootTurn = new THREE.Quaternion();

  function update(dt: number, heroAt: THREE.Vector3 | null, talking: boolean): void {
    clock += dt;
    loop = (loop + dt * (1 - 0.7 * gaze)) % KEEP_LOOP;
    if (serveT >= 0) { serveT += dt; if (serveT > SERVE.long) serveT = -1; }
    const t = loop;
    // --- whether he's looking at the hero: a glance as one comes near, held while talked to ---
    let heroNear = false;
    if (heroAt) {
      j.root.updateWorldMatrix(true, false);
      hero.copy(heroAt);
      j.root.worldToLocal(hero);
      heroNear = Math.hypot(hero.x, hero.z) < GLANCE.near;
      hero.y += 1.55;
    }
    if (talking && heroAt) { gazeWant = 1; gazeUntil = clock + 1; }
    else if (heroNear && clock > nextGlance) { gazeWant = 1; gazeUntil = clock + GLANCE.hold; nextGlance = clock + GLANCE.hold + GLANCE.rest; }
    else if (clock > gazeUntil) gazeWant = 0;
    if (!heroAt) gazeWant = 0;
    gaze = damp(gaze, gazeWant, gazeWant > gaze ? 3.2 : 2.2, dt);

    // --- the beats: of his loop, or of a serving over it ---
    const st = Math.max(0, serveT), serving = serveT >= 0 ? span(st, 0, SERVE.long, 0.3) : 0;
    const fill = serveT >= 0 ? span(st, SERVE.fill[0] - 0.25, SERVE.fill[1] + 0.1, 0.25) : 0;
    const slide = serveT >= 0 ? span(st, SERVE.slide[0] - 0.2, SERVE.slide[1] + 0.25, 0.2) : 0;
    const slideK = serveT >= 0 ? smooth(along(st, SERVE.slide[0], SERVE.slide[1])) : 0;
    const idle = 1 - serving;
    const wipe = span(t, ...BEATS.wipe, 1.2) * idle, polish = span(t, ...BEATS.polish, 1.2) * idle, look = span(t, ...BEATS.look, 1.0) * idle;
    const lookK = along(t, ...BEATS.look);
    const breath = Math.sin((t / KEEP_LOOP) * Math.PI * 2 * 8);

    // --- body, neck, head ---
    for (const o of [j.hips, j.spine, j.chest, j.neck, j.head]) o.rotation.set(0, 0, 0);
    j.spine.rotation.x = 0.04 + polish * 0.14 + fill * 0.06 + slide * 0.12 + breath * 0.006;
    j.chest.rotation.x = 0.02 + polish * 0.05 - breath * 0.01;
    j.chest.rotation.y = polish * 0.1 * Math.sin(clock * 1.4) + look * 0.14 * Math.sin(lookK * Math.PI * 2) + fill * 0.12;
    // (he looks at what his hands do: the mug he wipes, the bar, the tap as it runs, the mug as it slides)
    let headX = 0.15 + wipe * 0.25 + polish * 0.35 + fill * 0.35 + slide * 0.3 - look * 0.25, headY = fill * 0.35;
    headY += look * 0.55 * Math.sin(lookK * Math.PI * 2);
    let neckX = 0.04;
    if (gaze > 0.001) {
      j.root.updateMatrixWorld(true);
      j.neck.getWorldPosition(headAt);
      j.root.worldToLocal(headAt);
      tmp.subVectors(hero, headAt);
      const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.2, 1.2), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.5, 0.5);
      lookYaw.v = damp(lookYaw.v, yaw, 6, dt);
      lookPitch.v = damp(lookPitch.v, pitch, 6, dt);
      const g = gaze * (1 - 0.6 * fill);
      j.chest.rotation.y = lerp(j.chest.rotation.y, lookYaw.v * 0.25, g);
      neckX = lerp(neckX, -lookPitch.v * 0.4, g);
      headX = lerp(headX, -lookPitch.v * 0.6, g);
      headY = lerp(headY, lookYaw.v * 0.6, g);
      j.neck.rotation.y = lookYaw.v * 0.15 * g;
    }
    j.neck.rotation.x = neckX;
    j.head.rotation.set(headX, headY, -headY * 0.05);
    const eyeX = 0.18 * (1 - gaze) * (1 - look);
    for (const e of eyes) e.rotation.set(eyeX, 0, 0);
    j.root.updateMatrixWorld(true);

    // --- the arms ---
    rest(1, tL); rest(-1, tR);
    tL.y += breath * 0.002; tR.y += breath * 0.002;
    // wiping the mug: held before his belly, mouth up, the cloth going round inside it
    const round = clock * 4.2;
    tL.lerp(tmp.set(0.08, 1.12, 0.3), wipe);
    tR.lerp(tmp.set(0.05 + 0.025 * Math.cos(round), 1.2 + 0.012 * Math.sin(round * 2), 0.3 + 0.025 * Math.sin(round)), wipe);
    // polishing the bar: the mug set by, the cloth in wide rounds on its top
    const sweep = clock * 1.6;
    tR.lerp(tmp.set(-0.12 + 0.14 * Math.cos(sweep), bar.top + 0.03, bar.near + 0.22 + 0.08 * Math.sin(sweep)), polish);
    tL.lerp(tmp.set(0.26, bar.top + 0.06, bar.near + 0.08), polish);
    // serving: the mug held under the tap and filled, the right hand on the tap's handle; set down and slid across
    tL.lerp(tmp.copy(bar.tap).add(V(0, -0.16, -0.02)), fill);
    tR.lerp(tmp.copy(bar.tap).add(V(-0.03, 0.06, -0.06)), fill);
    slid.lerpVectors(slideFrom, V(0.02, bar.top, bar.near + 0.55), slideK);
    tL.lerp(tmp.copy(slid).add(V(0.04, 0.09, -0.03)), slide);
    tR.lerp(tmp.set(-0.2, bar.top + 0.05, bar.near + 0.12), slide);
    // (in an arc over the bar there and back, never through it)
    tL.y += 0.05 * Math.sin(Math.PI * fill) * (1 - fill) + 0.04 * Math.sin(Math.PI * Math.min(1, polish));
    // (the elbows out and a little back, as a big man leans on his bar)
    poleL.set(1, -0.6, -0.5).normalize();
    poleR.set(-1, -0.6, -0.5).normalize();
    reachArm(j.shoulderL, j.elbowL, P.upperL, P.foreL, chestLocal(tL.clone()), poleL, 1, 0.08);
    reachArm(j.shoulderR, j.elbowR, P.upperL, P.foreL, chestLocal(tR.clone()), poleR, 1, 0.08);
    j.root.updateMatrixWorld(true);
    // (his hands: round the mug and the cloth, curled; flat on the bar at rest)
    poseHand(handL, lerp(0.2, 0.75, Math.max(wipe, fill, slide, polish)), 0.12, 0, clock, 0);
    poseHand(handR, lerp(0.2, 0.62, Math.max(wipe, polish)), 0.15, 0, clock, 0);
    // (his mug at its size but for the moment it's gone across the bar: from as he lets it go till he takes another)
    // (his mug stands upright in his hand, mouth up, however the hand is turned)
    j.handL.getWorldQuaternion(mugTurn);
    j.root.getWorldQuaternion(rootTurn);
    mug.quaternion.copy(mugTurn.invert().multiply(rootTurn));
    const gone = serveT >= SERVE.slide[0] + 0.05 && serveT < SERVE.long - 0.15;
    mug.scale.setScalar(gone ? 0.001 : 1);
    clothMesh.scale.setScalar(Math.max(0.001, 1 - fill * 0.999));
  }

  update(0, null, false);

  return {
    root: j.root,
    update,
    serve() { if (serveT >= 0) return false; serveT = 0; return true; },
    get serving() { return serveT; },
    served() {
      if (serveT < SERVE.slide[0] + 0.05) return null;
      return slid.clone();
    },
    get loopAt() { return loop; },
    set loopAt(v: number) { loop = ((v % KEEP_LOOP) + KEEP_LOOP) % KEEP_LOOP; },
    parts,
  };
}

/** His clothes on the rig: the striped shirt over a deep chest and round belly, its collar under a red neckerchief
 *  knotted at the throat; the long leather apron, a bib on his chest on straps over his shoulders and a skirt from his
 *  waist to below his knees; a linen towel over his left shoulder; sleeves rolled above the elbow, bare forearms;
 *  trousers and boots. */
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
    [-0.1, 0.25, 0.2, 0.006, 0.08], [0.0, 0.255, 0.195, 0.007, 0.06], [0.08, 0.262, 0.185, 0.007, 0.03],
    [0.14, 0.27, 0.17, 0.005, 0.01], [0.185, 0.272, 0.155, 0.003, 0], [0.215, 0.25, 0.135, 0.002, 0],
    [0.238, 0.19, 0.112, 0, 0], [0.255, 0.12, 0.092, 0, 0], [0.285, 0.068, 0.07, 0, 0],
  ];
  add(rowsSurface(chestRows.map(([y, w, d, f, b]) => ring(y, w, d, f, b, 1.1)), 1.2), M.shirt, j.chest, 'shirt chest');
  const waistRows: Row[] = [
    [-0.12, 0.27, 0.22, 0.008, 0.06], [-0.06, 0.27, 0.225, 0.009, 0.1], [0.02, 0.265, 0.225, 0.01, 0.12],
    [0.1, 0.258, 0.215, 0.009, 0.105], [0.2, 0.25, 0.2, 0.007, 0.085],
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
  // --- the neckerchief: a red band round his neck, knotted at the throat, its two ends hanging ---
  {
    const band: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, [x, z] = oval(a, 0.075, 0.074, 2);
      band.push(new THREE.Vector3(x, 0.275 - 0.012 * Math.cos(a), z));
    }
    add(cord(band, 0.016, true, 32), M.scarf, j.chest, 'neckerchief');
    const knot = add(new THREE.SphereGeometry(0.024, 10, 8).scale(1.2, 0.9, 0.8), M.scarf, j.chest, 'neckerchief knot', false);
    knot.position.set(0, 0.255, 0.085);
    for (const s of [1, -1]) {
      add(cord([new THREE.Vector3(s * 0.006, 0.245, 0.09), new THREE.Vector3(s * 0.025, 0.2, 0.11), new THREE.Vector3(s * 0.035, 0.16, 0.13)], 0.011, false, 10),
        M.scarf, j.chest, 'neckerchief end', false);
    }
  }
  // --- the apron's bib: a panel on his chest, on straps over his shoulders crossing his back ---
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 8; k++) {
      const y = lerp(-0.1, 0.2, k / 8), half = lerp(0.2, 0.13, k / 8), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) row.push(onFront(chestRows, lerp(-half, half, i / 8), y, 0.012));
      rows.push(row);
    }
    add(rowsSurface(rows, 2), M.apron, j.chest, 'apron bib');
    for (const s of [1, -1]) {
      const pts = [
        onFront(chestRows, s * 0.12, 0.2, 0.014), new THREE.Vector3(s * 0.13, 0.25, 0.07), new THREE.Vector3(s * 0.14, 0.262, -0.02),
        new THREE.Vector3(s * 0.11, 0.22, -0.13), new THREE.Vector3(-s * 0.04, 0.06, -0.205), new THREE.Vector3(-s * 0.15, -0.08, -0.2),
      ];
      add(cord(pts, 0.008, false, 24), M.strap, j.chest, 'apron strap');
      const ring = add(new THREE.TorusGeometry(0.012, 0.003, 5, 12), M.brass, j.chest, 'apron buckle', false);
      ring.position.copy(onFront(chestRows, s * 0.12, 0.185, 0.016));
    }
  }
  // --- the apron's skirt: from his waist to below his knees, round his front and sides, a tie at the back ---
  {
    const lap: THREE.Vector3[][] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, y = lerp(-0.66, 0.06, t), w = lerp(0.3, 0.28, t), d = lerp(0.26, 0.235, t), half = lerp(0.29, 0.25, t);
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const x = lerp(-half, half, i / 10), a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
        row.push(new THREE.Vector3(x, y, z + lerp(0.02, 0.07, t) * Math.cos(a) ** 2 + 0.02 + 0.006 * Math.sin(i * 1.7 + k)));
      }
      lap.push(row);
    }
    add(rowsSurface(lap, 2), M.apron, j.hips, 'apron skirt');
    add(rowsSurface([ring(-0.005, 0.282, 0.242, 0, 0.1, 0), ring(0.035, 0.28, 0.24, 0, 0.1, 0)], 2), M.strap, j.spine, 'apron tie');
  }
  // --- the towel over his left shoulder: down his chest a hand's length, over the shoulder's top and down his back ---
  {
    const path = [
      new THREE.Vector3(0.17, 0.02, 0.2), new THREE.Vector3(0.175, 0.14, 0.18), new THREE.Vector3(0.18, 0.235, 0.12),
      new THREE.Vector3(0.18, 0.268, 0.0), new THREE.Vector3(0.18, 0.235, -0.12), new THREE.Vector3(0.175, 0.12, -0.17),
      new THREE.Vector3(0.17, 0.0, -0.18),
    ];
    const curve = new THREE.CatmullRomCurve3(path), rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 16; k++) {
      const p = curve.getPointAt(k / 16), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 4; i++) {
        const x = lerp(-0.05, 0.05, i / 4);
        row.push(new THREE.Vector3(p.x + x, p.y, p.z + (p.z > 0 ? 0.012 : -0.012) + 0.004 * Math.sin(i * 2.1 + k * 0.7)));
      }
      rows.push(row);
    }
    add(rowsSurface(rows, 3), M.towel, j.chest, 'towel');
  }
  // --- trousers from the hips to the boots ---
  add(rowsSurface([0, 1, 2, 3, 4].map((k) => ring(lerp(-0.1, 0.08, k / 4), lerp(0.27, 0.275, k / 4), 0.22, 0.01, lerp(0.03, 0.06, k / 4), 5.1)), 1.2),
    M.trousers, j.hips, 'trouser seat');
  for (const [thigh, knee, ankle, s] of [[j.thighL, j.kneeL, j.ankleL, 1], [j.thighR, j.kneeR, j.ankleR, -1]] as const) {
    add(sleeve([[0.088, -j.P.thighL - 0.02], [0.094, -0.3], [0.1, -0.15], [0.105, 0.02]], 0.03, 1 + s), M.trousers, thigh, 'trouser thigh');
    add(sleeve([[0.062, -0.42], [0.064, -0.3], [0.068, -0.15], [0.074, 0], [0.082, 0.06]], 0.03, 3 + s), M.trousers, knee, 'trouser');
    add(new THREE.CylinderGeometry(0.068, 0.062, 0.24, 14).translate(0, 0.08, 0), M.boot, ankle, 'boot');
    add(new THREE.SphereGeometry(1, 14, 10).scale(0.06, 0.05, 0.125), M.boot, ankle, 'boot toe').position.set(0, -0.04, 0.07);
  }
  // --- the sleeves: the shirt's, full, rolled above the elbow in a thick band; his forearms bare below ---
  for (const [shoulder, elbow, s] of [[j.shoulderL, j.elbowL, 1], [j.shoulderR, j.elbowR, -1]] as const) {
    add(sleeve([[0.074, -0.27], [0.082, -0.2], [0.088, -0.1], [0.094, -0.03], [0.092, 0.03], [0.064, 0.075], [0.026, 0.09]], 0.06, 5 + s),
      M.shirt, shoulder, 'sleeve');
    add(sleeve([[0.066, -0.315], [0.08, -0.3], [0.084, -0.27], [0.082, -0.24], [0.07, -0.225]], 0.05, 7 + s), M.shirt, shoulder, 'sleeve roll');
    const fore = -j.P.foreL;
    add(sleeve([[0.029, fore - 0.012], [0.034, fore + 0.02], [0.044, fore * 0.55], [0.054, -0.05], [0.058, 0.02], [0.06, 0.06]], 0, 13 + s),
      M.arm, elbow, 'forearm');
  }
}

/** His head dressed: a ginger fringe round the back of his bald head from ear to ear, a great walrus moustache from
 *  under his nose down over his mouth's corners, and bushy brows: cards in `ginger`, by the face's frame (mm). */
function dressHead(head: Head, ginger: THREE.Material): void {
  const G = head.group, rng = mulberry(73), out: THREE.BufferGeometry[] = [];
  /** a point on the skin (mm) towards (az, el), `lift` mm off it */
  const skin = (az: number, el: number, lift = 0) => {
    const p = head.surface(az, el, lift);
    return new THREE.Vector3(p.x / HEAD_MM, p.y / HEAD_MM, p.z / HEAD_MM + 5);
  };
  /** the ray (az, el) through the skin at height y (mm) towards az, found by halving */
  const elAt = (az: number, y: number) => {
    let lo = -1.4, hi = 1.5;
    for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (skin(az, mid).y < y) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  /** the skin at (x, y) mm on the front of the face, `lift` off it */
  const skinXY = (x: number, y: number, lift = 0) => {
    let az = Math.atan2(x, 70), el = 0, p = skin(az, el, lift);
    for (let k = 0; k < 14; k++) {
      az += Math.atan2(x - p.x, 70) * 0.9;
      el = elAt(az, y);
      p = skin(az, el, lift);
    }
    return p;
  };
  const toG = (p: THREE.Vector3) => toGroup(p.x, p.y, p.z);
  // --- the fringe: short hair lying down the back and sides of his head, from over one ear round to the other ---
  for (let c = 0; c < 420; c++) {
    // (round from his temples, where it stands highest over the painted hairline, past his ears to his nape, longest
    // there, down over where the scalp's paint ends)
    const u = rng() ** 0.7, az = (rng() < 0.5 ? 1 : -1) * lerp(0.58, Math.PI, u);
    const front = 1 - smooth(clamp((Math.abs(az) - 0.58) / 0.9, 0, 1)), back = smooth(clamp((Math.abs(az) - 2.2) / 0.9, 0, 1));
    const top = lerp(138, 150, rng()) + 30 * front, long = lerp(38, 56, rng()) + 22 * back - 6 * front;
    const el0 = elAt(az, top), el1 = elAt(az, top - long), pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 3; k++) pts.push(toG(skin(az + (rng() - 0.5) * 0.05, lerp(el0, el1, k / 3), 2.5 + 3 * Math.sin(Math.PI * k / 3))));
    const w = (11 + rng() * 8) * HEAD_MM, shade = 0.75 + rng() * 0.3;
    out.push(hairCard(pts, (s) => w * (1 - 0.45 * s), toGroup(0, top - 20, -40), 3, (rng() - 0.5) * 0.4, (s) => shade * (0.9 + 0.1 * s)));
  }
  // --- the moustache: thick, from under the nose out and down over his mouth's corners to past his chin's line ---
  for (let c = 0; c < 220; c++) {
    const side = c % 2 ? 1 : -1, x0 = side * (rng() * 26), y0 = 50 + rng() * 14, pts: THREE.Vector3[] = [];
    const xEnd = side * (40 + rng() * 14), yEnd = 6 - rng() * 18;
    for (let k = 0; k <= 5; k++) {
      const s = k / 5, x = lerp(x0, xEnd, smooth(s * 0.85 + 0.15 * s)), y = lerp(y0, yEnd, s * s * 0.9 + s * 0.1);
      const lift = 2.5 + 9 * Math.sin(Math.PI * Math.min(1, s * 1.1)) + rng() * 2;
      pts.push(toG(skinXY(x, y, lift)));
    }
    const w = (10 + rng() * 6) * HEAD_MM, shade = 0.75 + rng() * 0.3;
    out.push(hairCard(pts, (s) => w * (1 - 0.65 * s), toGroup(0, 60, 20), 5, (rng() - 0.5) * 0.5, () => shade));
  }
  // --- the brows: bushy, a few long hairs ---
  for (let c = 0; c < 50; c++) {
    const side = c % 2 ? 1 : -1, x0 = side * (12 + rng() * 38), y0 = 134 + rng() * 6 + (Math.abs(x0) - 30) * -0.05, pts: THREE.Vector3[] = [];
    const len = 9 + rng() * (rng() < 0.15 ? 14 : 7);
    for (let k = 0; k <= 3; k++) {
      const s = k / 3;
      pts.push(toG(skinXY(x0 + side * len * s, y0 + 4 * s - 5 * s * s, 1 + 3 * s)));
    }
    const w = (3.5 + rng() * 2) * HEAD_MM, shade = 0.8 + rng() * 0.2;
    out.push(hairCard(pts, (s) => w * (1 - 0.6 * s), toGroup(0, 120, 0), 3, 0, () => shade));
  }
  const mesh = new THREE.Mesh(mergeAll(out), ginger);
  mesh.name = 'keeper hair';
  mesh.castShadow = true;
  G.add(mesh);
}
