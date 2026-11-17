// Brother Hollis, the library's scholar (world/library.ts seats him at his reading table; data/houses.ts `scholar` is
// where he's talked to): an old monk in a brown wool habit, a rope belt knotted at his
// side, his hood down in a cowl round his neck and a felt skullcap; a long white beard, a white moustache and bushy
// brows, round brass spectacles. Built on the heroes' own rig, head and hands (the mage's face, its hair cropped white
// under the cap), so he holds up as close as they do. He reads in a loop that never snaps (`SCHOLAR_LOOP` long: every
// motion in it is a whole number of turns of it, or a pulse that is still at both its ends): his eyes and head run along
// each line and down the page, now and then he turns a page, strokes his beard, pushes his spectacles up or leans in to
// look closer; he breathes all the while. A hero coming near is glanced up at, and while he's talked to he looks up and
// holds the hero's eye, his reading slowed nearly to a stop.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { cloth as clothMaps, felt as feltMaps, leather as leatherMaps, wool as woolMaps, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, reachArm, type Joints } from './rig';
import { stripRig } from './shapes';
import { buildHead, buildNeck, hairCard, handSkin, toGroup, HEAD_MM, HERO_HEADS, type Head } from './head';
import { origin } from './face';
import { buildHand, bare, poseHand, type Hand } from './hands';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';

/** how long his reading loop is (s): the page turns, the beard, the spectacles and the lean all come round in it */
export const SCHOLAR_LOOP = 64;
/** how long a line takes him to read (s): a whole number of lines in the loop, so it comes round on a line's start */
const LINE = SCHOLAR_LOOP / 20;
/** what happens when in the loop (s): a page turned (twice: the book looks the same after two), a pause looking up
 *  from the page, the beard stroked, the spectacles pushed up, a lean in to look closer */
const BEATS = {
  turnA: [20, 24.5], muse: [10, 14.5], beard: [30, 37.5], specs: [43, 47], lean: [47.5, 56], turnB: [57, 61.5],
} as const satisfies Record<string, readonly [number, number]>;
/** how near a hero comes (m) before he looks up, how long he looks (s), and how long before he looks up again */
const GLANCE = { near: 3.6, hold: 2.6, rest: 13 };

/** The open book he reads, in his frame (x across him, +z ahead, up from the floor): its spine's middle on the table,
 *  and its pages' width (spine to edge) and depth. */
export interface ScholarBook {
  spine: THREE.Vector3; pageW: number; pageD: number; page: THREE.Material;
  /** the table's top in his frame: across (x), from his side of it to its far side (z), and its height */
  table: { x0: number; x1: number; z0: number; z1: number; top: number };
  /** the book's two page blocks (each a box, its top face the pages lying open on it): the page he turns is laid
   *  over them (the lab reads it against them) */
  blocks: THREE.Mesh[];
  /** how far over its blocks' tops the open book's printed pages lie (m) */
  printed: number;
  /** the height of its printed pages at their outer edges (m, his frame): his hands rest on them */
  printTop: number;
}

export interface Scholar {
  /** his root: stand it on the chair's seat, facing the table (+z) */
  root: THREE.Group;
  /** his pose for the frame: `hero` where the local hero is (world space) or null, `talking` while he's talked to */
  update(dt: number, hero: THREE.Vector3 | null, talking: boolean): void;
  /** how far into his loop he is (s), for the lab's pictures at set points of it */
  loopAt: number;
  /** his meshes (the lab reads them: his sleeves against the table, his triangles) */
  readonly parts: THREE.Mesh[];
  /** the table he reads at, in his frame (`ScholarBook.table`) */
  readonly table: ScholarBook['table'];
  /** the book he reads (its page blocks), the page he turns (shown only while it's turned) and his hands (the lab
   *  reads the page against the blocks and his fingertips against what they rest on) */
  readonly book: ScholarBook;
  readonly page: THREE.Mesh;
  readonly hands: Hand[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** how far each open page lies tilted down from the spine to its edge (rad), as the book's blocks are */
export const PAGE_TILT = 0.06;
/**
 * The angle of the turning page at `r` of the way from the spine to its edge, at `k` of its turn (rad about the spine:
 * the rest tilt on his right, through upright, to it mirrored on his left). Its edge lags its root under its own
 * weight, but never further than the page lying open under it: lagged freely, early in the turn the edge dipped below
 * the open page and lifted out from under its block (from play: "1/4 of it is under another white piece").
 */
export function pageAngle(k: number, r: number): number {
  const root = PAGE_TILT - (Math.PI + 2 * PAGE_TILT) * smooth(k), lag = 0.9 * Math.sin(Math.PI * k) * r * r * 0.5;
  return clamp(root + lag, -Math.PI - PAGE_TILT, PAGE_TILT);
}
/** 0 outside [a, b], 1 inside it, eased in and out over `rise` at each end */
const span = (t: number, a: number, b: number, rise: number): number =>
  smooth(clamp((t - a) / rise, 0, 1)) * (1 - smooth(clamp((t - (b - rise)) / rise, 0, 1)));
/** where `t` is between a and b (0 to 1) */
const along = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);

/** A surface of rows of points (each row the same count, its first and last points the same for a closed one): its
 *  faces wound out when each row runs the way the right hand's fingers curl round the rows' direction (bottom to
 *  top). uv: across each row by its length and down the rows by theirs (m), times `rep`. */
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

/** A tube round a curve through `pts` (a cord, a rope), `r` thick. */
const cord = (pts: THREE.Vector3[], r: number, closed = false, segs = 48) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), segs, r, 6, closed);

/** how a sleeve hangs: the way down from its arm as he rests (in its joint's frame, across the arm), how far it drops
 *  that way along the arm (m), and how far below the arm its cloth may come before it lies flat (m: on the table) */
interface Hang { down: THREE.Vector3; droop: (y: number) => number; floor: (y: number) => number }
/** the sides of a lathe's segments, round */
const SLEEVE_SIDES = 28;

/** A sleeve's piece on a joint (hanging along -y): a lathe through `profile` ([radius, y], bottom to top), folds round
 *  it, dropped by `hang` and laid flat where it would go further down than its floor (a wide bell on a forearm laid on
 *  the table lies along it, spread out at its sides: hung free, it went through the table). Its opening's ring too. */
function sleeve(profile: [number, number][], hang: Hang, folds: number, seed: number): { geo: THREE.BufferGeometry; rim: THREE.Vector3[] } {
  const rng = mulberry(seed), ph = rng() * 6;
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), SLEEVE_SIDES);
  const p = g.attributes.position, side = new THREE.Vector3().crossVectors(V(0, 1, 0), hang.down);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), r = Math.hypot(x, z);
    const fold = 1 + folds * Math.sin(a * 5 + ph + y * 9) * clamp(-y / 0.25, 0.25, 1);
    const fx = Math.sin(a) * r * fold, fz = Math.cos(a) * r * fold;
    // (its depth below the arm and its reach to the side, the way it hangs)
    let d = fx * hang.down.x + fz * hang.down.z + hang.droop(y), w = fx * side.x + fz * side.z;
    const floor = hang.floor(y);
    if (d > floor) { const past = d - floor; d = floor + past * 0.12; w *= 1 + past * 4; }
    p.setXYZ(i, hang.down.x * d + side.x * w, y, hang.down.z * d + side.z * w);
  }
  g.computeVertexNormals();
  // (the profile's first point is its opening's, a lathe's columns a segment each)
  const rim: THREE.Vector3[] = [];
  for (let k = 0; k < SLEEVE_SIDES; k++) rim.push(new THREE.Vector3().fromBufferAttribute(p, k * profile.length));
  return { geo: g, rim };
}

/**
 * Brother Hollis, built on `book`'s table. His head and hands are the heroes': build him once their workers have made
 * them (`preloadHeads`, `preloadHands`), or they're sculpted here on the page.
 */
export function buildScholar(book: ScholarBook): Scholar {
  const kit = createKit(0xffc27a);
  const tex = (maps: ReturnType<typeof woolMaps>, ns = 1) => {
    const m = pbrMaterialMaps(maps, 1, ns);
    return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale };
  };
  // (his habit's brown wool; two-sided where its inside shows: the skirt's hem, the sleeves' bells)
  const habit = kit.rim({ color: 0x5a4030, roughness: 1, ...tex(woolMaps(), 1.3) }, 0x6a5040, 0.3);
  const habitD = kit.rim({ color: 0x5a4030, roughness: 1, ...tex(woolMaps(), 1.3), side: THREE.DoubleSide }, 0x6a5040, 0.3);
    const lining = kit.rim({ color: 0x2a1c12, roughness: 1, ...tex(clothMaps(), 0.8), side: THREE.DoubleSide }, 0x2a1c12, 0.1);
  const rope = kit.std({ color: 0xb8a074, roughness: 0.95, ...tex(clothMaps(), 1.6) });
  const capFelt = kit.rim({ color: 0x4a1612, roughness: 1, ...tex(feltMaps(), 0.8) }, 0x6a2a20, 0.3);
  const shoe = kit.std({ color: 0x2a1a10, roughness: 0.7, ...tex(leatherMaps(), 1) });
  const brass = kit.std({ color: 0xc8a050, metalness: 0.9, roughness: 0.35 });
  // (his tabard: oxblood wool woven with a gold border and the library's sign; the wool's relief under it)
  const woven = pbrMaterialMaps(woolMaps(), 1, 1);
  const tabard = kit.rim({ map: tabardMap(), normalMap: woven.normalMap, normalScale: woven.normalScale, roughness: 1, side: THREE.DoubleSide }, 0x7a3a2a, 0.3);
  const trim = kit.rim({ color: 0xa8803a, roughness: 0.6, metalness: 0.35, ...tex(clothMaps(), 1.4) }, 0xc89a4a, 0.3);
  const glass = kit.std({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false });

  // --- the rig, sat: hips on the seat, thighs ahead, shins down to the floor ---
  const j: Joints = buildHumanoid({ skin: habit });
  stripRig(j.root);
  // (each joint named, as a measure names what moved: `lab scholar`)
  for (const [name, o] of Object.entries(j)) if (o instanceof THREE.Object3D && !o.name) o.name = `scholar ${name}`;
  const P = j.P;
  /** the hips' height over the floor, sat (the seat's top 0.46 and the seat bones under the joint) */
  const HIPS = 0.54;
  j.body.position.y = HIPS - P.hipY;
  const legs = () => {
    for (const [thigh, knee, ankle, s] of [[j.thighL, j.kneeL, j.ankleL, 1], [j.thighR, j.kneeR, j.ankleR, -1]] as const) {
      thigh.rotation.set(-Math.PI / 2 + 0.06, s * 0.1, 0);
      knee.rotation.set(Math.PI / 2 - 0.02, 0, 0);
      ankle.rotation.set(-0.1, 0, 0);
    }
  };
  legs();

  // --- the head: the mage's face and cropped hair, his hair under the cap white ---
  const head: Head = buildHead(j.head, kit, HERO_HEADS.mage.who, HERO_HEADS.mage);
  buildNeck(j.neck, kit, 'mage', P.neckL, j.head);
  // (the locks over the crown hidden under the cap; the shell under them and the crop's tufts white with age)
  if (head.hair[1]) head.hair[1].visible = false;
  (head.hair[0]?.material as THREE.MeshStandardMaterial | undefined)?.color.setRGB(0.3, 0.29, 0.28);
  const cards = (head.crop?.material ?? (head.hair[1]?.material)) as THREE.MeshStandardMaterial;
  cards.color.setRGB(1.25, 1.22, 1.18);
  // (his face paler and greyer than the mage's ruddy one)
  (head.face.material as THREE.MeshStandardMaterial).color.setRGB(0.96, 0.9, 0.86);
  const white = cards.clone();
  white.color.setRGB(1.3, 1.27, 1.22);
  white.roughness = 0.85;
  // (a clone loses the kit's hooks: the white keeps its card's, so it draws with its program)
  white.onBeforeCompile = cards.onBeforeCompile;
  white.customProgramCacheKey = cards.customProgramCacheKey;
  (white as unknown as { litBothSides: boolean }).litBothSides = true;
  Object.defineProperty(white, 'kitLooks', { value: (cards as unknown as { kitLooks: unknown }).kitLooks, configurable: true });
  dressHead(head, white, capFelt, brass, glass);

  // --- the hands: the heroes' own, bare and old ---
  const skin = handSkin(kit, 'mage');
  skin.color.multiplyScalar(0.95);
  const handL = buildHand(j.handL, 1, skin, skin, 1, skin), handR = buildHand(j.handR, -1, skin, skin, 1, skin);
  bare(handL, true); bare(handR, true);

  // --- the habit ---
  const parts: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, on: THREE.Object3D, name: string, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `scholar ${name}`;
    m.castShadow = cast; m.receiveShadow = true;
    on.add(m);
    parts.push(m);
    return m;
  };
  const M = { habit, habitD, lining, rope, shoe, tabard, trim, brass };
  dressBody(j, add, M);

  // --- the page he turns: hidden but while it's turned ---
  const W = book.pageW, D = book.pageD, SEG = 12;
  const pageGeo = new THREE.PlaneGeometry(W, D, SEG, 1).rotateX(-Math.PI / 2).translate(-W / 2, 0, 0);
  const rest = Float32Array.from(pageGeo.attributes.position.array as Float32Array);
  const pivot = new THREE.Group();
  // (its spine's height is the book's, given: over its blocks at rest by a hair, `ScholarBook.spine`)
  pivot.position.copy(book.spine);
  j.root.add(pivot);
  const page = add(pageGeo, book.page, pivot, 'page', false);
  page.visible = false;
  /** the page laid at `k` of its turn (0 on his right, 1 over on his left): its root turning about the spine, its edge
   *  lagging and curled under its own weight */
  const layPage = (k: number) => {
    const p = pageGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const r = -rest[i * 3] / W, a = pageAngle(k, r), d = r * W;
      p.setXYZ(i, -Math.cos(a) * d, -Math.sin(a) * d, rest[i * 3 + 2]);
    }
    p.needsUpdate = true;
    pageGeo.computeVertexNormals();
  };
  /** where the page's outer corner nearest him is at `k` of its turn, in his frame */
  const corner = (k: number, out: THREE.Vector3) => {
    const a = pageAngle(k, 0.92);
    return out.set(-Math.cos(a) * W * 0.92, -Math.sin(a) * W * 0.92, -D * 0.38).add(pivot.position);
  };

  // --- his pose, a frame at a time ---
  const eyes = head.eyes;
  let loop = 7, gaze = 0, gazeWant = 0, gazeUntil = -1, nextGlance = 0, clock = 0;
  const lookYaw = { v: 0 }, lookPitch = { v: 0 };
  const hero = new THREE.Vector3(), headAt = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tL = new THREE.Vector3(), tR = new THREE.Vector3(), poleL = new THREE.Vector3(), poleR = new THREE.Vector3();
  /** where each elbow rests on the table (his frame) */
  const restL = new THREE.Vector3(), restR = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), basis = new THREE.Matrix4();
  const fx = new THREE.Vector3(), fy = new THREE.Vector3(), fz = new THREE.Vector3();
  /** a hand's turn in his frame: its fingers along `fingers`, its palm facing `palm` */
  const handTurn = (fingers: THREE.Vector3, palm: THREE.Vector3, out: THREE.Quaternion) => {
    fy.copy(fingers).normalize().negate();
    fz.copy(palm).negate().addScaledVector(fy, -palm.clone().negate().dot(fy)).normalize();
    fx.crossVectors(fy, fz);
    return out.setFromRotationMatrix(basis.makeBasis(fx, fy, fz));
  };
  /** a point on his head (mm in its face's frame) in his frame */
  const onHead = (x: number, y: number, z: number, out: THREE.Vector3) =>
    j.root.worldToLocal(head.group.localToWorld(toGroup(x, y, z, out)));
  /** a hand set to `turn` (his frame) at the end of its posed arm */
  const setHand = (hand: THREE.Object3D, turn: THREE.Quaternion) => {
    hand.parent!.getWorldQuaternion(qp);
    j.root.getWorldQuaternion(qa);
    hand.quaternion.copy(qp.invert().multiply(qa).multiply(turn));
  };
  const chestLocal = (v: THREE.Vector3) => j.chest.worldToLocal(j.root.localToWorld(v));

  function update(dt: number, heroAt: THREE.Vector3 | null, talking: boolean): void {
    clock += dt;
    // (talked to, his reading all but stops: it picks up where it was as he goes back to it)
    loop = (loop + dt * (1 - 0.9 * gaze)) % SCHOLAR_LOOP;
    const t = loop;
    // --- whether he's looking up at the hero: a glance as one comes near, held while he's talked to ---
    let heroNear = false;
    if (heroAt) {
      j.root.updateWorldMatrix(true, false);
      hero.copy(heroAt);
      j.root.worldToLocal(hero);
      heroNear = Math.hypot(hero.x, hero.z) < GLANCE.near;
      hero.y += 1.55;
    }
    if (talking) gazeWant = 1;
    else if (heroNear && clock > nextGlance) { gazeWant = 1; gazeUntil = clock + GLANCE.hold; nextGlance = clock + GLANCE.hold + GLANCE.rest; }
    else if (clock > gazeUntil) gazeWant = 0;
    if (!heroAt) gazeWant = 0;
    gaze = damp(gaze, gazeWant, gazeWant > gaze ? 3.2 : 2.2, dt);

    // --- the beats of the loop ---
    const turnA = span(t, ...BEATS.turnA, 0.6), turnB = span(t, ...BEATS.turnB, 0.6);
    const turning = Math.max(turnA, turnB);
    const turnK = turnA > 0 ? along(t, ...BEATS.turnA) : along(t, ...BEATS.turnB);
    const muse = span(t, ...BEATS.muse, 1.2), beard = span(t, ...BEATS.beard, 1.4), specs = span(t, ...BEATS.specs, 1.5);
    const lean = span(t, ...BEATS.lean, 1.6);
    const breath = Math.sin((t / SCHOLAR_LOOP) * Math.PI * 2 * 16);
    // the spread he's reading: from the last turn's middle to the next's, its left page then its right
    const midA = (BEATS.turnA[0] + BEATS.turnA[1]) / 2, midB = (BEATS.turnB[0] + BEATS.turnB[1]) / 2;
    const spread = t >= midA && t < midB ? (t - midA) / (midB - midA) : ((t - midB + SCHOLAR_LOOP) % SCHOLAR_LOOP) / (SCHOLAR_LOOP - midB + midA);
    const toRight = smooth(clamp((spread - 0.47) / 0.06, 0, 1));
    const downA = Math.min(1, spread * 2.1), downB = Math.max(0, (spread - 0.5) * 2.1);
    // (while a page turns he follows it, not his place on the page: the spread he reads changes at the turn's middle,
    // which those two would jump with; his head turned a 6.4 degree step in a frame there)
    const down = lerp(lerp(downA, downB, toRight), 0.3, turning);
    // along a line: slowly across, back quickly at its end
    const u = (t / LINE) % 1, across = u < 0.84 ? lerp(-1, 1, smooth(u / 0.84) * 0.3 + (u / 0.84) * 0.7) : lerp(1, -1, smooth((u - 0.84) / 0.16));
    const reading = (1 - turning * 0.7) * (1 - muse) * (1 - specs * 0.6) * (1 - gaze);
    // (page side: his left page is +x, his left)
    const pageYaw = lerp(lerp(0.1, -0.1, toRight), -0.04, turning);

    // --- body, neck, head ---
    for (const o of [j.hips, j.spine, j.chest, j.neck, j.head]) o.rotation.set(0, 0, 0);
    j.spine.rotation.x = 0.22 + lean * 0.1 + breath * 0.006;
    j.chest.rotation.x = 0.16 + lean * 0.05 - breath * 0.012;
    // (a turn of the shoulders to the page he reads, and as he reaches across to turn one)
    j.chest.rotation.y = pageYaw * 0.15 * (1 - gaze) - turning * 0.06;
    let neckX = 0.1 - lean * 0.04, headX = 0.2 + down * 0.1 - muse * 0.32 - specs * 0.08, headY = (pageYaw * 0.6 + across * 0.05) * reading;
    headY += muse * 0.12;
    headX -= turning * 0.05;
    // the look up at the hero: where he is from the head, shared between chest, neck and head
    if (gaze > 0.001) {
      j.root.updateMatrixWorld(true);
      j.neck.getWorldPosition(headAt);
      j.root.worldToLocal(headAt);
      tmp.subVectors(hero, headAt);
      const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.3, 1.3), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.5, 0.6);
      lookYaw.v = damp(lookYaw.v, yaw, 6, dt);
      lookPitch.v = damp(lookPitch.v, pitch, 6, dt);
      // (the body's lean takes its share of the pitch: a sat man looks up mostly with his neck)
      const bodyPitch = j.spine.rotation.x + j.chest.rotation.x;
      j.chest.rotation.y = lerp(j.chest.rotation.y, lookYaw.v * 0.2, gaze);
      neckX = lerp(neckX, -(lookPitch.v + bodyPitch) * 0.45, gaze);
      headX = lerp(headX, -(lookPitch.v + bodyPitch) * 0.55, gaze);
      headY = lerp(headY, lookYaw.v * 0.65, gaze);
      j.neck.rotation.y = lookYaw.v * 0.18 * gaze;
    }
    j.neck.rotation.x = neckX;
    j.head.rotation.set(headX, headY, -headY * 0.08 + muse * 0.04);
    // the eyes: along the line and down the page; up to the hero
    const eyeY = (across * 0.2 + pageYaw * 0.5) * reading + muse * 0.18 * (1 - gaze);
    const eyeX = (0.3 + down * 0.08) * (1 - gaze) * (1 - muse * 0.8) + 0.04 * gaze;
    for (const e of eyes) e.rotation.set(eyeX, eyeY, 0);
    j.root.updateMatrixWorld(true);

    // --- the arms: each hand at rest on the table, and where a beat takes it ---
    // (leant on the table as a reader leans: each elbow resting on it a hand in from its edge, the forearm laid along it
    // to the book, the left's hand on its left page's margin holding it open, the right's on the right's. Held off it,
    // the elbows hung below its top short of its edge, and the forearms rose through its edge to the hands)
    const { top, z0 } = book.table;
    // (each wrist on its page's near half, its fingers lying on the page and short of its far edge: with the wrist
    // half way up the page, the fingers hung 7 cm past the book's edge, down onto the table, and looked sunk in it)
    tL.set(book.spine.x + 0.16, book.printTop + 0.035, book.spine.z - book.pageD * 0.4);
    tR.set(book.spine.x - 0.18, book.printTop + 0.035, book.spine.z - book.pageD * 0.38);
    // (leaning in, his hands slide a little further on, so his arms keep their reach and his elbows their rest)
    tL.z += lean * 0.06; tR.z += lean * 0.06;
    restL.set(0.33, top + 0.085, z0 + 0.05);
    restR.set(-0.33, top + 0.085, z0 + 0.05);
    // (a breath lifts them a hair, as it does the shoulders)
    tL.y += breath * 0.002; tR.y += breath * 0.002;
    // the left: to stroke his beard, or push his spectacles up
    const stroke = 0.5 - 0.5 * Math.cos(along(t, BEATS.beard[0] + 1.2, BEATS.beard[1] - 1.2) * Math.PI * 4);
    const chin = onHead(4, lerp(-8, -52, stroke), lerp(106, 112, stroke), new THREE.Vector3());
    chin.x += 0.03; chin.z += 0.02; chin.y -= 0.05;
    // (going up and coming down it arcs clear of the page, and turns back flat before it lands: brought straight
    // down still turned to the face, its fingertips dug 3 cm into the book)
    const lift = 0.06 * Math.sin(Math.PI * Math.max(beard, specs));
    tL.lerp(chin, beard);
    const nudge = Math.sin(along(t, BEATS.specs[0] + 0.9, BEATS.specs[1] - 0.9) * Math.PI);
    const bridge = onHead(10, 96 + nudge * 8, 150, new THREE.Vector3());
    bridge.y -= 0.12; bridge.x += 0.02; bridge.z += 0.03;
    tL.lerp(bridge, specs);
    tL.y += lift;
    // the right: to the page's corner, over with it, and back
    const pageK = smooth(clamp((turnK - 0.24) / 0.56, 0, 1));
    const reach = span(turnK, 0.04, 0.72, 0.2) * turning;
    corner(pageK, tmp);
    // (over the corner by the fingers' thickness: at 2.5 cm, they dug into the page as he took it)
    tmp.y += 0.04; tmp.z -= 0.03;
    tR.lerp(tmp, reach);
    // (each elbow bent towards its rest on the table; out and down as a hand goes to the face, the right's out as it
    // reaches across)
    poleL.copy(chestLocal(restL.clone())).sub(j.shoulderL.position);
    poleR.copy(chestLocal(restR.clone())).sub(j.shoulderR.position);
    const gesture = Math.max(beard, specs);
    // (his elbow kept on the table as his hand goes to his beard or his spectacles, as a man leaning on a table does: drawn
    // out and down, it went through the table)
    poleL.normalize().lerp(tmp.set(1.2, -0.6, 0.5).normalize(), gesture * 0.4);
    poleR.normalize().lerp(tmp.set(-1.3, -0.4, 0.3).normalize(), reach * 0.5);
    reachArm(j.shoulderL, j.elbowL, P.upperL, P.foreL, chestLocal(tL.clone()), poleL, 1, 0.08);
    reachArm(j.shoulderR, j.elbowR, P.upperL, P.foreL, chestLocal(tR.clone()), poleR, 1, 0.08);
    j.root.updateMatrixWorld(true);
    // the hands' turns: flat on the table, fingers ahead and in; cupping the beard; a finger to the bridge; on the page
    handTurn(V(-0.35, 0.06, 1), V(0, -1, -0.06), qa);
    handTurn(V(-0.5, 0.75, -0.2), V(0.1, 0, -1), qb); qa.slerp(qb, smooth(beard));
    handTurn(V(-0.2, 0.9, -0.3), V(0.1, 0.2, -1), qb); qa.slerp(qb, smooth(specs));
    setHand(j.handL, qa.clone());
    handTurn(V(0.45, 0.06, 1), V(0, -1, -0.06), qa);
    handTurn(V(0.7, 0.2 + pageK * 0.4, 0.6), V(0.2, -1 + pageK * 0.6, 0.2), qb); qa.slerp(qb, reach);
    setHand(j.handR, qa.clone());
    // (resting, his fingers lie nearly flat on the page: curled as a hand is at rest in the air, their tips dug in)
    poseHand(handL, lerp(lerp(0.14, 1.0, beard), 0.6, specs), 0.15, specs, clock, 0);
    poseHand(handR, lerp(0.12 + 0.04 * Math.sin(clock * 0.7), 0.45, reach), 0.15, 0, clock, 0);

    // --- the page ---
    page.visible = turning > 0.5 && pageK > 0.002 && pageK < 0.998;
    if (page.visible) layPage(pageK);
  }

  // (the sleeves' bells shaped as his forearms lie at rest, on the table: down from each, in its own frame)
  loop = 5;
  update(0, null, false);
  const downFrom = (elbow: THREE.Object3D) => {
    const d = V(0, -1, 0).applyQuaternion(elbow.getWorldQuaternion(new THREE.Quaternion()).invert());
    d.y = 0;
    return d.lengthSq() > 1e-4 ? d.normalize() : V(0, 0, -1);
  };
  dressBells(j, add, M, { L: downFrom(j.shoulderL), R: downFrom(j.shoulderR) }, { L: downFrom(j.elbowL), R: downFrom(j.elbowR) });
  loop = 7;
  update(0, null, false);

  return {
    root: j.root,
    table: book.table,
    book,
    page,
    hands: [handL, handR],
    update,
    get loopAt() { return loop; },
    set loopAt(v: number) { loop = ((v % SCHOLAR_LOOP) + SCHOLAR_LOOP) % SCHOLAR_LOOP; },
    parts,
  };
}

interface BodyMats {
  habit: THREE.Material; habitD: THREE.Material; lining: THREE.Material; rope: THREE.Material;
  shoe: THREE.Material; tabard: THREE.Material; trim: THREE.Material; brass: THREE.Material;
}
type Add = (g: THREE.BufferGeometry, m: THREE.Material, on: THREE.Object3D, name: string, cast?: boolean) => THREE.Mesh;

/** A strip's surface (`rowsSurface`'s winding) with uvs of its own: across each row 0 to 1, down the rows `v0` to `v1`
 *  (a share of one texture several strips take their parts of). */
function strip(rows: THREE.Vector3[][], v0: number, v1: number): THREE.BufferGeometry {
  const g = rowsSurface(rows), uv = g.attributes.uv, n = rows[0].length;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < n; i++) uv.setXY(j * n + i, i / (n - 1), lerp(v0, v1, j / (rows.length - 1)));
  return g;
}

/** A small key: its bow a ring, its shaft, its bit, hanging down from (0, 0, 0). */
function keyGeometry(len: number): THREE.BufferGeometry {
  const bow = new THREE.TorusGeometry(0.008, 0.0022, 5, 12).translate(0, -0.008, 0);
  const shaft = new THREE.CylinderGeometry(0.0022, 0.0022, len, 6).translate(0, -0.016 - len / 2, 0);
  const bit = new THREE.BoxGeometry(0.008, 0.01, 0.0025).translate(0.005, -0.016 - len + 0.006, 0);
  return mergeAll([bow, shaft, bit]);
}

/** His habit on the rig: its body on the spine and the chest, the skirt over his lap down to the floor on the hips, the
 *  sleeves over his upper arms, his tabard over it from the cowl to his knees, the rope belt with his keys and a
 *  pouch, the cowl, shoes. (The sleeves' bells come after his first pose: `dressBells`.) */
function dressBody(j: Joints, add: Add, M: BodyMats): void {
  const N = 40;
  /** the body's section at a height: across, deep, how deep its folds */
  const ring = (y: number, w: number, d: number, fold: number, seed: number, p = 2.4) => {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, z] = oval(a, w, d, p);
      // (folds falling down the front and sides from the chest, fewer behind where it's pulled over the back)
      const f = 1 + fold * (Math.sin(a * 7 + seed) * 0.6 + Math.sin(a * 13 + seed * 2) * 0.4) * (0.6 + 0.4 * Math.cos(a));
      row.push(V(x * f, y, z * f));
    }
    return row;
  };
  // --- the chest: from under the ribs up over the shoulders to the neck ---
  const chestRows: [number, number, number, number][] = [
    // y, across, deep, folds
    [-0.1, 0.17, 0.13, 0.012], [0.0, 0.178, 0.133, 0.016], [0.08, 0.19, 0.136, 0.016], [0.14, 0.205, 0.132, 0.01],
    [0.185, 0.218, 0.122, 0.006], [0.215, 0.205, 0.11, 0.003], [0.238, 0.16, 0.094, 0], [0.252, 0.105, 0.08, 0],
    [0.268, 0.078, 0.074, 0], [0.29, 0.066, 0.066, 0], [0.31, 0.062, 0.062, 0],
  ];
  add(rowsSurface(chestRows.map(([y, w, d, f]) => ring(y, w, d, f, 1.3)), 1.2), M.habit, j.chest, 'chest');
  // --- the waist: from the seat up into the chest's ---
  const waistRows: [number, number, number, number][] = [
    [-0.12, 0.215, 0.16, 0.012], [-0.06, 0.2, 0.15, 0.02], [0.02, 0.182, 0.138, 0.025], [0.1, 0.172, 0.13, 0.025], [0.2, 0.17, 0.128, 0.02],
  ];
  add(rowsSurface(waistRows.map(([y, w, d, f]) => ring(y, w, d, f, 2.1)), 1.2), M.habit, j.spine, 'waist');
  // --- the rope belt round the waist, knotted at his left, its ends hanging down his side ---
  {
    const y = 0.11, pts: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, [x, z] = oval(a, 0.176, 0.134, 2.4);
      pts.push(V(x, y + 0.004 * Math.sin(a * 3), z));
    }
    add(cord(pts, 0.009, true, 64), M.rope, j.spine, 'belt');
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.014, 0.008, 40, 6, 2, 3), M.rope);
    knot.position.set(0.13, y, 0.12);
    knot.name = 'scholar knot';
    j.spine.add(knot);
    for (const [dx, len] of [[0, 0.34], [0.02, 0.28]] as const) {
      const end = [V(0.135 + dx, y - 0.01, 0.125), V(0.17 + dx, y - 0.08, 0.15), V(0.205 + dx, y - 0.18, 0.15), V(0.215 + dx, y - len, 0.14)];
      add(cord(end, 0.008, false, 20), M.rope, j.spine, 'rope end');
      // (a tassel at its end)
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 8, 1, true), M.rope);
      tassel.position.copy(end[3]).add(V(0, -0.025, 0));
      j.spine.add(tassel);
    }
  }
  // --- the cowl: his hood down, rolled round his neck, its bag lying on his back ---
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, [x, z] = oval(a, 0.105, 0.098, 2.2);
      // (lower in front, where it falls open over the chest; higher behind the neck)
      pts.push(V(x, 0.285 - 0.035 * Math.max(0, Math.cos(a)) ** 2 + 0.05 * Math.max(0, -Math.cos(a)) ** 1.5, z - 0.012));
    }
    add(cord(pts, 0.034, true, 60), M.habit, j.chest, 'cowl');
    // (the hood's bag: a deep fold lying down his back, its point near his shoulder blades)
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 12; k++) {
      const s = k / 12, y = lerp(0.27, 0.0, s), w = 0.12 * Math.sin(Math.PI * Math.min(1, 0.25 + s * 0.85)) * (1 - 0.6 * s ** 2) + 0.008;
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI * (i / 16), x = -Math.cos(a) * w;
        // (its outer face rounded out from the back, its inner lying on it)
        const out = Math.sin(a) * (0.035 + 0.02 * Math.sin(s * Math.PI)) + 0.004 * Math.sin(i * 1.3 + k);
        row.push(V(x, y, -0.13 - 0.02 * (1 - s) - out + 0.035 * s * s));
      }
      rows.push(row);
    }
    add(rowsSurface(rows, 1.3), M.habitD, j.chest, 'hood');
  }
  // --- the skirt: from round the hips over the thighs to the knees, and down from them to the floor ---
  {
    const path = new THREE.CatmullRomCurve3([V(0, 0.02, -0.08), V(0, 0.04, 0.12), V(0, 0.03, 0.36), V(0, -0.02, 0.5),
      V(0, -0.14, 0.56), V(0, -0.34, 0.58), V(0, -0.52, 0.6)]);
    const K = 30, rows: THREE.Vector3[][] = [], T = new THREE.Vector3(), X = V(1, 0, 0), Nn = new THREE.Vector3(), C = new THREE.Vector3();
    /** the skirt at `s` along its path and `th` round it, `lift` off it, its folds by `folded` */
    const at = (s: number, th: number, lift = 0, folded = 1) => {
      path.getPointAt(s, C); path.getTangentAt(s, T);
      Nn.crossVectors(T, X).normalize();
      // (round both thighs, flaring as it falls from the knees to the hem)
      const hang = smooth(clamp((s - 0.42) / 0.58, 0, 1));
      const a = lerp(0.225, 0.3, hang), b = lerp(0.115, 0.2, hang), foldAmp = lerp(0.006, 0.035, hang) * folded;
      // (between the knees the cloth sags into the lap; over them it's drawn tight)
      const top = Math.max(0, Math.sin(th)), sag = 0.035 * Math.exp(-((Math.cos(th) / 0.22) ** 2)) * top * (1 - hang) * smooth(clamp(s / 0.25, 0, 1));
      const fold = foldAmp * (Math.sin(th * 9 + 1.7) * 0.7 + Math.sin(th * 4 + s * 3) * 0.3);
      const p = C.clone().addScaledVector(X, (a + fold + lift) * Math.cos(th)).addScaledVector(Nn, (b + fold * 0.6 + lift) * Math.sin(th) - sag);
      // (sat on: its underside along the seat kept to the seat's top, not into it)
      if (s < 0.4) p.y = Math.max(p.y, -0.075);
      return p;
    };
    for (let k = 0; k <= K; k++) {
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) row.push(at(k / K, (i / N) * Math.PI * 2));
      rows.push(row);
    }
    add(rowsSurface(rows, 1.2), M.habitD, j.hips, 'skirt');
    // (a gold cord along its hem)
    add(cord(rows[K].slice(0, N), 0.006, true, 120), M.trim, j.hips, 'trim hem');
    // the tabard's lap: from under the belt over his knees and a hand down his shins, laid on the skirt's top, its
    // folds half the skirt's (over them, not into them)
    const lap: THREE.Vector3[][] = [];
    for (let k = 0; k <= 16; k++) {
      const s = lerp(0.15, 0.6, k / 16), half = lerp(0.1, 0.12, k / 16), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = lerp(half, -half, i / 8), a = lerp(0.225, 0.3, smooth(clamp((s - 0.42) / 0.58, 0, 1)));
        row.push(at(s, Math.acos(clamp(x / (a + 0.01), -1, 1)), 0.009, 0.5));
      }
      lap.push(row);
    }
    add(strip(lap, 0.53, 0), M.tabard, j.hips, 'tabard lap');
  }
  // --- the tabard's front: from under the cowl down his chest to the belt ---
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 12; k++) {
      const y = lerp(-0.125, 0.27, k / 12), at = chestRows.findIndex((r) => r[0] >= y);
      const hi = chestRows[Math.max(0, at)], lo = chestRows[Math.max(0, at - 1)];
      const t = hi === lo ? 0 : (y - lo[0]) / (hi[0] - lo[0]), w = lerp(lo[1], hi[1], t), d = lerp(lo[2], hi[2], t);
      const half = Math.min(lerp(0.105, 0.085, k / 12), w * 0.9), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = lerp(-half, half, i / 8), a = Math.asin(clamp(x / (w + 0.012), -1, 1)), [, z] = oval(a, w, d);
        row.push(V(x, y, z * (1 + Math.abs(lo[3]) * 1.2) + 0.008));
      }
      rows.push(row);
    }
    add(strip(rows, 0.53, 1), M.tabard, j.chest, 'tabard front');
  }
  // --- his keys on a ring at his left hip, under the knot; a leather pouch on his right ---
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0025, 6, 24), M.brass);
    ring.position.set(0.15, 0.05, 0.12);
    ring.rotation.set(0.2, -0.6, 0.1);
    ring.name = 'scholar keys';
    j.spine.add(ring);
    [0.055, 0.045, 0.065].forEach((len, k) => {
      const key = new THREE.Mesh(keyGeometry(len), M.brass);
      const a = -1.2 - k * 0.45;
      key.position.set(Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0);
      key.rotation.z = (k - 1) * 0.35;
      key.castShadow = false;
      ring.add(key);
    });
    const pouch = new THREE.LatheGeometry([[0, -0.07], [0.04, -0.065], [0.05, -0.04], [0.048, -0.005], [0.036, 0.01], [0.03, 0.012], [0, 0.012]]
      .map(([r, y]) => new THREE.Vector2(r, y)), 14).scale(1, 1, 0.55);
    const bag = add(pouch, M.shoe, j.spine, 'pouch');
    bag.position.set(-0.165, 0.09, 0.1);
    bag.rotation.set(0.15, 0.55, 0);
    const flap = add(new THREE.BoxGeometry(0.075, 0.035, 0.008), M.shoe, bag, 'pouch flap');
    flap.position.set(0, -0.005, 0.03);
    flap.rotation.x = 0.15;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), M.brass);
    stud.position.set(0, -0.018, 0.036);
    bag.add(stud);
  }
  // --- the sleeves: close over the upper arm, a wide bell from the elbow, its lining dark; shoes under the hem ---
  for (const [shoulder, elbow, ankle, s] of [[j.shoulderL, j.elbowL, j.ankleL, 1], [j.shoulderR, j.elbowR, j.ankleR, -1]] as const) {
    void elbow; void shoulder;
    const toe = new THREE.SphereGeometry(1, 14, 10).scale(0.05, 0.04, 0.11);
    const foot = add(toe, M.shoe, ankle, 'shoe');
    foot.position.set(0, -0.04, 0.07);
  }
}

/** His sleeves: over the upper arms, and the bells from his elbows, wide, lined dark, a gold cord round each opening: each dropped the way down is
 *  from its forearm as he rests (`downL`, `downR`, in each elbow's frame), and laid flat 3.5 cm under it at the wrist,
 *  more towards the elbow: on the table, where they hung free through it. */
function dressBells(j: Joints, add: Add, M: BodyMats, upper: { L: THREE.Vector3; R: THREE.Vector3 }, fore: { L: THREE.Vector3; R: THREE.Vector3 }): void {
  const bell: [number, number][] = [[0.12, -0.25], [0.112, -0.2], [0.095, -0.13], [0.078, -0.05], [0.07, 0.01], [0.066, 0.04]];
  // (the upper sleeves too: laid flat 6 cm under the arm at the elbow, where it rests on the table, free above it)
  for (const [shoulder, down, s] of [[j.shoulderL, upper.L, 1], [j.shoulderR, upper.R, -1]] as const) {
    const hang: Hang = { down, droop: () => 0, floor: (y) => (y > -0.2 ? Infinity : lerp(0.08, 0.044, smooth(clamp((-y - 0.2) / 0.11, 0, 1)))) };
    add(sleeve([[0.064, -0.33], [0.07, -0.26], [0.074, -0.14], [0.08, -0.04], [0.078, 0.02], [0.05, 0.06], [0.02, 0.075]], hang, 0.05, 5 + s).geo,
      M.habit, shoulder, 'sleeve');
  }
  for (const [elbow, down, s] of [[j.elbowL, fore.L, 1], [j.elbowR, fore.R, -1]] as const) {
    const hang: Hang = { down, droop: (y) => 0.03 * smooth(clamp(-y / 0.25, 0, 1)), floor: (y) => lerp(0.055, 0.028, smooth(clamp(-y / 0.24, 0, 1))) };
    const outer = sleeve(bell, hang, 0.06, 9 + s);
    add(outer.geo, M.habitD, elbow, 'bell');
    const inner = bell.map(([r, y]) => [r - 0.008, y + 0.004] as [number, number]).filter(([, y]) => y < -0.06);
    add(sleeve(inner, { ...hang, floor: (y) => hang.floor(y) - 0.006 }, 0.05, 9 + s).geo, M.lining, elbow, 'lining', false);
    add(cord(outer.rim, 0.005, true, 56), M.trim, elbow, 'trim cuff', false);
  }
}

let tabardTex: THREE.CanvasTexture | null = null;
/** His tabard's weave: oxblood wool, a gold border down both edges with a thin line inside it, a row of small
 *  lozenges down its middle; on the chest an open book under a lamp, on the lap a key: the library's keeper. v runs
 *  from the chest's top (1 at the canvas's top) down to the lap's end (0). */
function tabardMap(): THREE.CanvasTexture {
  if (tabardTex) return tabardTex;
  const W = 128, H = 640, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!, rng = mulberry(23);
  c.fillStyle = '#5a1a1c';
  c.fillRect(0, 0, W, H);
  // (the wool's weave: fine light and dark threads)
  for (let k = 0; k < 2600; k++) {
    c.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${0.05 + rng() * 0.08})` : `rgba(255,190,160,${0.03 + rng() * 0.04})`;
    c.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1);
  }
  const gold = '#d8b060', deep = '#8a6a2a';
  for (const x of [4, W - 12]) { c.fillStyle = deep; c.fillRect(x, 0, 8, H); c.fillStyle = gold; c.fillRect(x + 1, 0, 6, H); }
  for (let y = 0; y < H; y += 10) for (const x of [4, W - 12]) { c.fillStyle = deep; c.fillRect(x + 1, y, 6, 2); }
  c.strokeStyle = gold; c.lineWidth = 1.5;
  for (const x of [17, W - 17]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  // the open book under a lamp's flame, on the chest (its top: the canvas's top is the chest's)
  const cx = W / 2;
  c.fillStyle = gold; c.strokeStyle = deep; c.lineWidth = 2;
  c.beginPath(); c.moveTo(cx, 150); c.quadraticCurveTo(cx - 20, 132, cx - 40, 138); c.lineTo(cx - 40, 104); c.quadraticCurveTo(cx - 20, 98, cx, 116);
  c.quadraticCurveTo(cx + 20, 98, cx + 40, 104); c.lineTo(cx + 40, 138); c.quadraticCurveTo(cx + 20, 132, cx, 150); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(cx, 116); c.lineTo(cx, 150); c.stroke();
  for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx + sx * 8, 114 + r * 8); c.lineTo(cx + sx * 32, 110 + r * 8); c.stroke(); }
  c.fillStyle = '#ffd890';
  c.beginPath(); c.moveTo(cx, 58); c.quadraticCurveTo(cx + 12, 76, cx, 88); c.quadraticCurveTo(cx - 12, 76, cx, 58); c.fill();
  // a row of lozenges down the middle between them
  for (let y = 190; y < 400; y += 26) {
    c.fillStyle = gold;
    c.beginPath(); c.moveTo(cx, y - 8); c.lineTo(cx + 6, y); c.lineTo(cx, y + 8); c.lineTo(cx - 6, y); c.fill();
  }
  // the key, on the lap
  c.fillStyle = gold; c.strokeStyle = gold; c.lineWidth = 7;
  c.beginPath(); c.arc(cx, 452, 16, 0, Math.PI * 2); c.stroke();
  c.fillRect(cx - 3.5, 468, 7, 90);
  c.fillRect(cx, 530, 22, 9); c.fillRect(cx, 546, 16, 9);
  c.fillStyle = '#5a1a1c'; c.beginPath(); c.arc(cx, 452, 6, 0, Math.PI * 2); c.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  tabardTex = t;
  return t;
}

/** His head dressed: the skullcap over his crown, his brows, his moustache and long beard (cards in `white`, the beard's
 *  body under them), and his spectacles. All in the head's group, by its face's frame (mm). */
function dressHead(head: Head, white: THREE.Material, capFelt: THREE.Material, brass: THREE.Material, glass: THREE.Material): void {
  const G = head.group, rng = mulberry(41);
  /** a point on the skin (mm) towards (az, el), `lift` mm off it */
  const skin = (az: number, el: number, lift = 0) => {
    const p = head.surface(az, el, lift);
    return V(p.x / HEAD_MM, p.y / HEAD_MM, p.z / HEAD_MM + 5);
  };
  /** the ray (az, el) through the skin at height y (mm) towards az, found by halving */
  const elAt = (az: number, y: number) => {
    let lo = -1.4, hi = 1.5;
    for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (skin(az, mid).y < y) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  /** the skin at (x, y) mm on the front of the face, `lift` off it */
  const skinXY = (x: number, y: number, lift = 0) => {
    const o = { x: 0, y: 0, z: 0 };
    let az = Math.atan2(x, 70), el = 0, p = skin(az, el, lift);
    for (let k = 0; k < 14; k++) {
      origin(el, o);
      az += Math.atan2(x - p.x, 70) * 0.9;
      el = elAt(az, y);
      p = skin(az, el, lift);
    }
    return p;
  };
  const toG = (p: THREE.Vector3) => toGroup(p.x, p.y, p.z);
  /** his beard hangs as his head is when he reads (bent down to the page): below the chin it leans forward, so as he
   *  reads it falls straight, and as he looks up it juts a little, as a beard does */
  const bend = (p: THREE.Vector3) => {
    const a = -0.42 * smooth(clamp(-p.y / 45, 0, 1)), py = p.y, pz = p.z - 40;
    return V(p.x, py * Math.cos(a) - pz * Math.sin(a), py * Math.sin(a) + pz * Math.cos(a) + 40);
  };

  // --- the beard's body: over the jaw and chin, sunk into the skin round the mouth and up the cheeks; below the chin
  // it hangs to a rounded point ---
  const azs = 34, AZ = 1.45;
  /** where the beard stops up the face (mm) at azimuth `az`: under the lower lip in front, up to the ears at the sides */
  const topAt = (az: number) => lerp(36, 98, smooth(clamp((Math.abs(az) - 0.32) / 0.85, 0, 1)));
  const liftAt = (az: number, y: number) => {
    const b = smooth(clamp((topAt(az) - y) / 12, 0, 1));
    return -1.5 + b * (9 + 7 * smooth(clamp((40 - y) / 45, 0, 1)));
  };
  const rows: THREE.Vector3[][] = [];
  for (let y = 104; y >= -6; y -= 5) {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= azs; i++) {
      const az = lerp(-AZ, AZ, i / azs);
      row.push(skin(az, elAt(az, y), liftAt(az, y)));
    }
    rows.push(row);
  }
  // (below the chin: each point drawn in to the beard's point, its front kept ahead of the throat)
  const last = rows[rows.length - 1], TIP = -112;
  for (let k = 1; k <= 12; k++) {
    const s = k / 12, y = lerp(-6, TIP, s), narrow = (1 - s) ** 0.85 * 0.92 + 0.08;
    rows.push(last.map((p, i) => {
      const f = Math.cos(lerp(-AZ, AZ, i / azs) * 0.95);
      return V(p.x * narrow, y + 6 * (1 - f) * s, lerp(p.z, 62 + 34 * f, smooth(Math.min(1, s * 1.6))) - 10 * s * s * f);
    }));
  }
  // (each row runs from his right to his left over the front: so read bottom to top)
  const beardBody = rowsSurface(rows.reverse().map((r) => r.map((p) => toG(bend(p)))), 40);
  const strands = beardMap();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8c4bc, map: strands, roughness: 0.9, side: THREE.DoubleSide });
  const body = new THREE.Mesh(beardBody, bodyMat);
  body.name = 'scholar beard';
  body.castShadow = true;
  G.add(body);

  // --- the beard's locks: cards from all over its body, running down it to near its point ---
  const out: THREE.BufferGeometry[] = [];
  /** the beard's outside (mm) at (u, y): u from his right (-1) to his left (1) */
  const beardAt = (u: number, y: number, lift: number) => {
    if (y > -6) { const az = u * AZ; return skin(az, elAt(az, y), liftAt(az, y) + lift); }
    const s = clamp((y + 6) / (TIP + 6), 0, 1), i = Math.round((u + 1) / 2 * azs), p = last[clamp(i, 0, azs)];
    const f = Math.cos(u * AZ * 0.95), narrow = (1 - s) ** 0.85 * 0.92 + 0.08;
    return V(p.x * narrow, y, lerp(p.z, 62 + 34 * f, smooth(Math.min(1, s * 1.6))) - 10 * s * s * f + lift);
  };
  const locks = 260;
  for (let c = 0; c < locks; c++) {
    const u0 = (rng() * 2 - 1) * 0.96, top = topAt(u0 * AZ) - 6, y0 = lerp(top, -30, rng() ** 1.4);
    if (y0 < -40) continue;
    const yEnd = lerp(TIP * 0.55, TIP - 4, rng()) + (Math.abs(u0) > 0.6 ? 25 : 0), pts: THREE.Vector3[] = [];
    const lift = 1.2 + rng() * 2.5;
    for (let k = 0; k <= 5; k++) {
      const s = k / 5, y = lerp(y0, yEnd, s), u = u0 * (1 - 0.65 * smooth(s)) + (rng() - 0.5) * 0.04;
      pts.push(toG(bend(beardAt(u, y, lift + 1.5 * Math.sin(Math.PI * s)))));
    }
    const w = (6 + rng() * 6) * HEAD_MM, shade = 0.72 + rng() * 0.3, axis = toG(bend(V(0, (y0 + yEnd) / 2, 30)));
    out.push(hairCard(pts, (s) => w * (1 - 0.75 * s * s), axis, 6, (rng() - 0.5) * 0.7, (s) => shade * (0.85 + 0.15 * s)));
  }
  // --- the moustache: from under the nose out over the corners of the mouth, down into the beard ---
  for (let c = 0; c < 70; c++) {
    const side = c % 2 ? 1 : -1, x0 = side * (1 + rng() * 22), y0 = 55 + rng() * 6, pts: THREE.Vector3[] = [];
    const xEnd = side * (30 + rng() * 9), yEnd = 26 - rng() * 12;
    for (let k = 0; k <= 4; k++) {
      const s = k / 4, x = lerp(x0, xEnd, smooth(s * 0.8 + 0.2 * s)), y = lerp(y0, yEnd, s * s), lift = 1 + 3.5 * Math.sin(Math.PI * Math.min(1, s * 1.2)) + rng() * 0.6;
      pts.push(toG(skinXY(x, y, lift)));
    }
    const w = (4 + rng() * 3) * HEAD_MM, shade = 0.8 + rng() * 0.25;
    out.push(hairCard(pts, (s) => w * (1 - 0.7 * s), toGroup(0, 60, 20), 4, (rng() - 0.5) * 0.5, () => shade));
  }
  // --- the brows: bushy, white, a few long hairs curling out ---
  for (let c = 0; c < 44; c++) {
    const side = c % 2 ? 1 : -1, x0 = side * (12 + rng() * 38), y0 = 134 + rng() * 6 + (Math.abs(x0) - 30) * -0.05, pts: THREE.Vector3[] = [];
    const len = 9 + rng() * (rng() < 0.15 ? 16 : 7);
    for (let k = 0; k <= 3; k++) {
      const s = k / 3;
      pts.push(toG(skinXY(x0 + side * len * s, y0 + 4 * s - 5 * s * s, 1 + 3 * s)));
    }
    const w = (3 + rng() * 2) * HEAD_MM, shade = 0.85 + rng() * 0.2;
    out.push(hairCard(pts, (s) => w * (1 - 0.6 * s), toGroup(0, 120, 0), 3, 0, () => shade));
  }
  const locksGeo = mergeAll(out);
  const lockMesh = new THREE.Mesh(locksGeo, white);
  lockMesh.name = 'scholar beard locks';
  lockMesh.castShadow = true;
  G.add(lockMesh);

  // --- the skullcap: a felt cap over the crown, its rim rolled ---
  {
    const rowsCap: THREE.Vector3[][] = [], n = 40;
    const edge = (az: number) => lerp(200, 192, (1 - Math.cos(az)) / 2) + 4 * Math.sin(az) ** 2;
    const edgeEl = Array.from({ length: n + 1 }, (_, i) => { const az = -Math.PI + (i / n) * Math.PI * 2; return elAt(az, edge(az)); });
    for (let k = 0; k <= 10; k++) {
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const az = -Math.PI + (i / n) * Math.PI * 2, el = lerp(edgeEl[i], Math.PI / 2, (k / 10) ** 0.9);
        row.push(toG(skin(az, el, 9.5 + 1.5 * (k / 10))));
      }
      rowsCap.push(row);
    }
    // (each row runs round from behind through his right, the front and his left, bottom to top: as `rowsSurface` winds out)
    G.add(Object.assign(new THREE.Mesh(rowsSurface(rowsCap, 20), capFelt), { name: 'scholar cap', castShadow: true }));
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const az = -Math.PI + (i / n) * Math.PI * 2; rim.push(toG(skin(az, edgeEl[i], 10))); }
    G.add(Object.assign(new THREE.Mesh(cord(rim, 3.2 * HEAD_MM, true, 80), capFelt), { name: 'scholar cap rim' }));
  }

  // --- the spectacles: round brass rims low on his nose, a bridge, the arms back to his ears ---
  {
    const R = 14, y = 110, z = 98, rimGeo = new THREE.TorusGeometry(R * HEAD_MM, 0.9 * HEAD_MM, 6, 28);
    for (const s of [1, -1]) {
      const at = toGroup(s * 31, y, z);
      const rimMesh = new THREE.Mesh(rimGeo, brass);
      rimMesh.position.copy(at);
      rimMesh.rotation.y = s * 0.1;
      rimMesh.name = 'scholar spectacles';
      G.add(rimMesh);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(R * HEAD_MM, 24), glass);
      lens.position.copy(at); lens.rotation.y = s * 0.1;
      lens.castShadow = false;
      lens.name = 'scholar lens';
      G.add(lens);
      // (the arm from the rim's outer edge back over the ear)
      const arm = [V(s * 45, y + 1, z - 4), V(s * 60, y + 4, 60), V(s * 66, y + 4, 20), V(s * 64, y - 8, 2)].map(toG);
      G.add(Object.assign(new THREE.Mesh(cord(arm, 0.8 * HEAD_MM, false, 16), brass), { name: 'scholar spectacles arm' }));
    }
    const bridge = [V(-17, y + 2, z), V(-6, y + 7, z + 6), V(6, y + 7, z + 6), V(17, y + 2, z)].map(toG);
    G.add(Object.assign(new THREE.Mesh(cord(bridge, 0.9 * HEAD_MM, false, 12), brass), { name: 'scholar spectacles bridge' }));
  }
}

/** Geometries merged into one (their positions, normals, uvs and colours). */
function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i)); col.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

let beardTex: THREE.CanvasTexture | null = null;
/** The beard's body: white hair running down it, streaked grey (its uvs run down it, about 40 to a metre). */
function beardMap(): THREE.CanvasTexture {
  if (beardTex) return beardTex;
  const W = 128, H = 256, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!, rng = mulberry(17);
  c.fillStyle = '#b8b4ac';
  c.fillRect(0, 0, W, H);
  for (let k = 0; k < 900; k++) {
    const x = rng() * W, l = 150 + rng() * 105, w = 0.6 + rng() * 1.4, wave = (rng() - 0.5) * 6;
    c.strokeStyle = `rgb(${l},${l - 3},${l - 8})`;
    c.lineWidth = w;
    c.beginPath();
    const y0 = rng() * H, len = 30 + rng() * 120;
    for (let y = 0; y <= len; y += 6) {
      const xx = x + Math.sin((y0 + y) / 30 + k) * wave, yy = (y0 + y) % H;
      if (y === 0 || yy < 6) c.moveTo(xx, yy); else c.lineTo(xx, yy);
    }
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  beardTex = t;
  return t;
}
