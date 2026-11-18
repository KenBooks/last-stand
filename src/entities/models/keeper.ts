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
import { buildHumanoid, reachArm, type Joints } from './rig';
import { stripRig } from './shapes';
import { buildHead, buildNeck, handSkin, HERO_HEADS, type Head } from './head';
import { buildHand, bare, hold, poseHand, seatHeld, type Hand } from './hands';
import { cord, oval, rowsSurface, sleeve } from './merchant';
import { buildMug, MUG } from './flask';
import { SERVE } from '../../data/tavern';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';

/** how long his idle loop is (s) */
export const KEEP_LOOP = 32;
/** what happens when in the loop (s): a mug wiped with his rag, the bar polished, a look round the room */
const BEATS = { wipe: [1, 13], polish: [15, 26], look: [27.5, 30.5] } as const satisfies Record<string, readonly [number, number]>;
/** how near a hero comes (m) before he looks up, how long he looks (s), and how long before he looks up again */
const GLANCE = { near: 4.5, hold: 3, rest: 9 };
/** the rag's radius where his fist closes round it bunched (m) */
const RAG_R = 0.022;

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
 * The keeper, behind `bar`. His head and hands are made as the heroes' are: build him once their workers have made
 * them (`preloadHeads`, `preloadHands`), or they're sculpted here on the page.
 */
export function buildKeeper(bar: KeeperBar): Keeper {
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

  // --- the rig: a man of an ordinary build, a little thick at the waist ---
  const j: Joints = buildHumanoid({ skin: shirt }, { chestW: 0.21, chestD: 0.14, waistW: 0.17 });
  stripRig(j.root);
  for (const [name, o] of Object.entries(j)) if (o instanceof THREE.Object3D && !o.name) o.name = `keeper ${name}`;
  const P = j.P;

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

  // --- what he holds: his mug in his left fist, a rag in his right ---
  const mug = buildMug(kit);
  j.handL.add(mug);
  const rag = add(ragGeometry(), towel, j.handR, 'rag', false);

  // --- his pose, a frame at a time ---
  const eyes = head.eyes;
  let loop = 3, gaze = 0, gazeWant = 0, gazeUntil = -1, nextGlance = 0, clock = 0, serveT = -1;
  const lookYaw = { v: 0 }, lookPitch = { v: 0 };
  const hero = new THREE.Vector3(), headAt = new THREE.Vector3(), tmp = new THREE.Vector3();
  const fistL = new THREE.Vector3(), fistR = new THREE.Vector3(), wristL = new THREE.Vector3(), wristR = new THREE.Vector3();
  const poleL = V(1, -0.6, -0.5).normalize(), poleR = V(-1, -0.6, -0.5).normalize();
  const up = V(0, 1, 0), turn = new THREE.Quaternion(), rootTurn = new THREE.Quaternion(), at = new THREE.Vector3();
  const slideFrom = V(0.04, bar.top, bar.near + 0.3), slid = new THREE.Vector3();
  const chestLocal = (v: THREE.Vector3) => j.chest.worldToLocal(j.root.localToWorld(v));
  /** a hand's fist closed round what it holds, `dir` its axis (world), the held thing seated in it and stood the
   *  world's way up */
  const grip = (h: Hand, held: THREE.Object3D, r: number, dir: THREE.Vector3) => {
    j.root.updateMatrixWorld(true);
    hold(h, dir, r);
    seatHeld(h, held, r);
    held.parent!.getWorldQuaternion(turn);
    j.root.getWorldQuaternion(rootTurn);
    held.quaternion.copy(turn.invert().multiply(rootTurn));
  };
  /** an arm sent so its fist's grip (where `held` is seated) lands at `fist` (his frame): solved once to the wrist
   *  guessed from the hand's length, and again by how far the grip landed off */
  const reachWith = (left: boolean, fist: THREE.Vector3, wrist: THREE.Vector3, h: Hand, held: THREE.Object3D, r: number) => {
    const [shoulder, elbow, pole] = left ? [j.shoulderL, j.elbowL, poleL] : [j.shoulderR, j.elbowR, poleR];
    for (let pass = 0; pass < 2; pass++) {
      reachArm(shoulder, elbow, P.upperL, P.foreL, chestLocal(wrist.clone()), pole, 1, 0.08);
      grip(h, held, r, up);
      j.root.updateMatrixWorld(true);
      j.root.worldToLocal(held.getWorldPosition(at));
      wrist.add(tmp.subVectors(fist, at));
    }
  };

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
    // (his mug across the bar from as he lets it go till he takes up another: his left hand open on the bar meanwhile)
    const gone = serveT >= SERVE.slide[0] + 0.05 && serveT < SERVE.long - 0.15;

    // --- body, neck, head ---
    for (const o of [j.hips, j.spine, j.chest, j.neck, j.head]) o.rotation.set(0, 0, 0);
    j.spine.rotation.x = 0.04 + polish * 0.12 + fill * 0.05 + slide * 0.1 + breath * 0.006;
    j.chest.rotation.x = 0.02 + polish * 0.04 - breath * 0.01;
    j.chest.rotation.y = polish * 0.08 * Math.sin(clock * 1.4) + look * 0.14 * Math.sin(lookK * Math.PI * 2) + fill * 0.1;
    // (he looks at what his hands do: the mug he wipes, the bar, the tap as it runs, the mug as it slides)
    let headX = 0.12 + wipe * 0.28 + polish * 0.32 + fill * 0.3 + slide * 0.28 - look * 0.2, headY = fill * 0.3;
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

    // --- where his fists go: the mug's grip (its foot on the bar at rest) and the rag ---
    const onBar = bar.top + MUG.foot;
    fistL.set(0.24, onBar, bar.near + 0.12);
    fistR.set(-0.2, bar.top + RAG_R + 0.01, bar.near + 0.12);
    fistL.y += breath * 0.002;
    // wiping the mug: held up before his belly in his left fist, the rag in his right rubbed round its outside, over
    // the side nearest him and up and down its staves (on its mouth, the rag hung outside the mug from a fist over it)
    const round = clock * 3.4, rub = Math.sin(round), lift = 0.5 + 0.5 * Math.sin(round * 0.5);
    const mugAt = tmp.set(0.08, 1.1, 0.36), aside = -0.75 + 0.55 * rub, reach = MUG.rimR + RAG_R + 0.004;
    fistL.lerp(mugAt, wipe);
    fistR.lerp(V(mugAt.x + reach * Math.sin(aside), 1.1 + lerp(-0.02, MUG.up - 0.02, lift), mugAt.z - reach * Math.cos(aside)), wipe);
    // polishing the bar: the mug set by on it, the rag pressed on its top in wide rounds
    const sweep = clock * 1.6;
    fistR.lerp(tmp.set(-0.1 + 0.13 * Math.cos(sweep), bar.top + RAG_R + 0.005, bar.near + 0.24 + 0.08 * Math.sin(sweep)), polish);
    fistL.lerp(tmp.set(0.28, onBar, bar.near + 0.1), polish);
    // serving: the mug under the tap, its rim a little under the spout, his right fist on the tap's handle; then set
    // down and slid across
    fistL.lerp(tmp.copy(bar.tap).add(V(0, -0.05 - MUG.up, 0)), fill);
    fistR.lerp(tmp.copy(bar.tap).add(V(0, 0.05, 0.01)), fill);
    slid.lerpVectors(slideFrom, V(0.04, bar.top, bar.near + 0.55), slideK);
    fistL.lerp(tmp.set(slid.x, onBar, slid.z), slide);
    // (lifted over the bar there and back, never through it)
    fistL.y += 0.06 * Math.sin(Math.PI * fill) * (1 - fill) + 0.05 * Math.sin(Math.PI * Math.min(1, polish + wipe)) * (1 - Math.max(polish, wipe));
    // --- the arms, each solved so its fist lands there ---
    wristL.copy(fistL).add(V(0.02, 0.06, -0.07));
    wristR.copy(fistR).add(V(-0.02, 0.06, -0.07));
    if (gone) {
      // (his left hand open behind the mug as he pushes it across, its fingers on its side, then back to rest flat on
      // the bar while the mug glides on and is drunk; the room's mug follows his push, `served`)
      const pushing = smooth(clamp((SERVE.slide[1] + 0.15 - st) / 0.3, 0, 1));
      tmp.copy(slid).add(V(0.0, MUG.foot + 0.02, -MUG.rimR - 0.1)).lerp(V(0.22, bar.top + 0.05, bar.near + 0.06), 1 - pushing);
      reachArm(j.shoulderL, j.elbowL, P.upperL, P.foreL, chestLocal(wristL.copy(tmp)), poleL, 1, 0.08);
      poseHand(handL, lerp(0.15, 0.35, pushing), 0.1, 0, clock, 0);
    } else reachWith(true, fistL, wristL, handL, mug, MUG.gripR);
    reachWith(false, fistR, wristR, handR, rag, RAG_R);
    // (the rag tucked away while his hand is on the tap; his mug at its size but while it's across the bar)
    rag.scale.setScalar(Math.max(0.001, 1 - smooth(clamp(fill * 3 - 1, 0, 1))));
    mug.scale.setScalar(gone ? 0.001 : 1);
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
