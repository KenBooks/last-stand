// Brother Hollis, the library's scholar (world/houses/library.ts seats him at his reading table; data/houses.ts `scholar` is
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
import { buildHumanoid, reachArm, resetPose, walkCycle, type Joints } from './rig';
import { stripRig } from './shapes';
import { buildNeck, hairCard, handSkin, headSteps, toGroup, HEAD_MM, HERO_HEADS, type Head } from './head';
import { origin } from './face';
import { buildHand, bare, poseHand, type Hand } from './hands';
import { turnedPage, type BookShape } from './book';
import { built } from './steps';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';

/** how long his reading loop is (s): the page turns, the beard, the spectacles and the lean all come round in it */
export const SCHOLAR_LOOP = 64;
/** how long a line takes him to read (s): a whole number of lines in the loop, so it comes round on a line's start */
const LINE = SCHOLAR_LOOP / 20;
/** what happens when in the loop (s): a page turned (twice: the book looks the same after two), a pause looking up
 *  from the page, the beard stroked, the spectacles pushed up, a lean in to look closer */
const BEATS = {
  turnA: [20, 24.2], muse: [10, 14.5], beard: [30, 37.5], specs: [43, 47], lean: [47.5, 56], turnB: [57, 61.2],
} as const satisfies Record<string, readonly [number, number]>;
/** how near a hero comes (m) before he glances, how long he looks (s), and how long before he glances again; how near
 *  is close (m): a hero coming that close is looked up at, whenever he last was (from play: "If you come close to him,
 *  he will look up at you. If you stand close to him and dont interact he will continue with his task"); how far a
 *  glance from afar turns him to the hero (a share of a look up: small), and how fast he walks (m/s) before he glances
 *  at nothing but where he's going (from play: "looking sideways when walking forwards") */
const GLANCE = { near: 3.6, hold: 2.6, rest: 30, close: 1.8, small: 0.4, walking: 0.25 };
/** his nod as he says a line while talked to: how long it takes (s), how far down his head goes at its deepest (rad),
 *  and the neck's share of it */
const NOD = { time: 0.55, pitch: 0.14, neck: 0.35 };
/** his walk: an old man's, slow and short-stepped: how far a step takes him (m), his walking speed (m/s, the walk
 *  cycle full there), and the cycle's stride, knee and bob */
/** his walk (m a step, m/s, rad of each thigh's swing: a step's length is about twice his leg's 0.9 m swung through
 *  it, so his planted foot keeps its place; knee, bob, arm and hips' swing): from play, "walks a bit too slow" */
export const WALK = { step: 0.44, speed: 0.68, stride: Math.asin(0.44 / 1.8), knee: 0.5, bob: 0.016, arm: 0.11, hips: 0.07 };
/** how much of the rise his sat pose still has a share in (`act.sit` from 1 down to this) */
const SEAT_BLEND = 0.62;
/** a harness's planted faults (`lab scholar --canary`): his pose jumped from sat to standing, and not followed; his
 *  cowl's top opened out off his neck, as the old ring stood */
export const scholarPlant = { noSeatBlend: false, cowlLoose: false };
/** how fast his pose follows what it's set to each frame (1/s): on his feet, and sat (his fingers on the page he turns
 *  kept close); how long after he sits it's let go of (s); and the fastest a joint of him turns on his feet (rad/s:
 *  where one hold handed on to another, a hand turned 12 to 37 degrees in a frame). Set straight to it, each new beat
 *  of his rounds began with a jump: from play, "lagged, not smooth continuation" */
const FOLLOW = { up: 14, settle: 0.8, most: THREE.MathUtils.degToRad(450), speeds: THREE.MathUtils.degToRad(15000) };
/** how far forward he bends on his feet (rad: his spine, his chest): bent 15 degrees, he slouched, from play */
const STOOP = { spine: 0.05, chest: 0.03 };
/** how low a hand's aim is (m over his feet) before he bends to it, and how much lower he's bent all the way */
const BEND = { from: 1.08, over: 0.7 };

/** The open book he reads, in his frame (x across him, +z ahead, up from the floor): the spine's foot in the gutter at
 *  its middle, its shape (models/book.ts), and the page he turns's material. */
export interface ScholarBook {
  spine: THREE.Vector3; shape: BookShape;
  /** the table's top in his frame: across (x), from his side of it to its far side (z), and its height */
  table: { x0: number; x1: number; z0: number; z1: number; top: number };
  /** the book's two halves' blocks of pages (each in its own frame: x from the spine to its outer edge, `blockGeometry`),
   *  his right's first, and their printed pages: the page he turns is the right's top page, laid over them (the lab
   *  reads it against them) */
  blocks: THREE.Mesh[];
  prints: THREE.Mesh[];
  /** the height of its printed pages at their outer edges (m, his frame): his hands rest on them */
  printTop: number;
}

/** A hand's aim while he stands: where it goes (world), the way its palm faces and its fingers point (world). */
export interface HandAim { at: THREE.Vector3; palm: THREE.Vector3; fingers: THREE.Vector3 }

/**
 * What he's doing, set each frame by his rounds (world/scholarRounds.ts): how far he's sat at his table (1: reading
 * there, his loop; 0: on his feet), how fast he walks (m/s: his legs step it, his root moved by his rounds), where he
 * looks (world, or ahead), each hand's aim and how far each goes to it (0: hanging at his side), how tight his
 * fingers close (a book held), and how far his head bows to what he looks at in his hands.
 */
export interface ScholarAct {
  sit: number;
  walk: number;
  look: THREE.Vector3 | null;
  handL: HandAim | null;
  handR: HandAim | null;
  reachL: number;
  reachR: number;
  grip: number;
}

export interface Scholar {
  /** his root: stand it on the chair's seat, facing the table (+z) */
  root: THREE.Group;
  /** what he's doing (his rounds set it; sat at his table by default) */
  readonly act: ScholarAct;
  /** his pose for the frame: `hero` where the local hero is (world space) or null, `talking` while he's talked to,
   *  `said` how many lines he's said (each new one a nod, as he's looking up) */
  update(dt: number, hero: THREE.Vector3 | null, talking: boolean, said?: number): void;
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
  /** how far his right hand has the page he turns in hand now (0 to 1) */
  readonly holding: number;
  /** whether his loop is between its beats (no page being turned, no hand at his face): he gets up only then (from
   *  play: "he is in the middle of slipping a page at a desk, then suddenly he stands up") */
  readonly calm: boolean;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** how far over the print the page he turns lies at rest (m): it's the top page, so where it lies it hides the print */
const PAGE_LIFT = 0.0012;
/** how far into its turn he lets go of the page (0 to 1): it falls over by itself from there. Let go of later, his hand
 *  turned 65 degrees with it, from play: "he flicks his wrist way too much for when turning a page" */
const LET_GO = 0.24;
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
/** a sleeve that hangs round its arm as it's cut, dropped nowhere */
const HANG_FREE: Hang = { down: V(0, 0, -1), droop: () => 0, floor: () => Infinity };
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
/** the book he was first built at (null till he is): his talk's portrait builds another of him on it
 *  (ui/guide/portraits.ts), his look the same as the library's */
let firstBook: ScholarBook | null = null;
export const scholarBook = (): ScholarBook | null => firstBook;

export function buildScholar(book: ScholarBook): Scholar {
  return built(scholarSteps(book));
}

/** `buildScholar` a piece at a time (models/steps.ts), so the boot paints between them: built whole he was one task,
 *  0.9 s with the CPU 4 times slower and 2.7 s on a player's laptop, its loading screen still (#838). */
export function* scholarSteps(book: ScholarBook): Generator<void, Scholar, undefined> {
  firstBook ??= book;
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
  // (his undershirt's linen, its sleeves to his wrists inside the habit's bells)
  const linen = kit.rim({ color: 0xc8b898, roughness: 1, ...tex(clothMaps(), 1.2) }, 0xd8c8a8, 0.25);
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
  yield;

  // --- the head: the mage's face and cropped hair, his hair under the cap white ---
  const head: Head = yield* headSteps(j.head, kit, HERO_HEADS.mage.who, HERO_HEADS.mage);
  yield;
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
  yield* dressHead(head, white, capFelt, brass, glass);
  yield;

  // --- the hands: the heroes' own, bare and old ---
  const skin = handSkin(kit, 'mage');
  skin.color.multiplyScalar(0.95);
  const handL = buildHand(j.handL, 1, skin, skin, 1, skin), handR = buildHand(j.handR, -1, skin, skin, 1, skin);
  bare(handL, true); bare(handR, true);
  yield;

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
  const M = { habit, habitD, lining, rope, shoe, tabard, trim, brass, linen };
  yield* dressBody(j, add, M);
  yield;
  // (the habit as it sits, and as it hangs while he's up, a robe to the floor round his legs: one cloth, each seated
  // piece drawn morphed into its standing one as he rises (`dressAs`). Swapped whole at sit 0.5, his clothes changed in
  // a frame as he got up and sat down, from play: "it snaps ... there are two separate ones instead")
  const seatedSet = parts.filter((m) => ['scholar skirt', 'scholar trim hem', 'scholar tabard lap'].includes(m.name));
  const standingSet = dressRobe(j, add, M);
  /** what's drawn blended between them, as each is made alike */
  const morphed = seatedSet.map((m, i) => morphInto(m, standingSet[i]));
  const robeFollow = followLegs(j, standingSet);
  const cowlFollow = followNeck(j, parts.find((m) => m.name === 'scholar cowl')!);

  // --- the page he turns: the top page of the half on his right (-x), from the spine to its edge and along the whole
  // depth, shaped as the book is (models/book.ts); hidden but while it's turned, the print under it the same page ---
  const shape = book.shape, D = shape.depth, SEG = 28;
  const pageGeo = new THREE.PlaneGeometry(1, D, SEG, 1).rotateX(-Math.PI / 2);
  // (its front the right half's print, laid as it is on the right half; its back the left half's, as it is laid on the
  // left: so it lifts off the right page as that page, and lands on the left as the page there, nothing changing as it
  // shows and hides. Its own writing, laid the other way up, changed the page as it lifted and as it landed)
  const backUV = new Float32Array(pageGeo.attributes.uv.count * 2);
  for (let i = 0; i < pageGeo.attributes.position.count; i++) {
    const t = pageGeo.attributes.position.getX(i) + 0.5, v = (D / 2 + pageGeo.attributes.position.getZ(i)) / D;
    pageGeo.attributes.uv.setXY(i, t, v);
    backUV[i * 2] = 1 - t; backUV[i * 2 + 1] = v;
  }
  const backGeo = pageGeo.clone();
  backGeo.setAttribute('uv', new THREE.BufferAttribute(backUV, 2));
  // (the back shares the front's positions and normals, which are laid each frame)
  backGeo.setAttribute('position', pageGeo.attributes.position);
  backGeo.setAttribute('normal', pageGeo.attributes.normal);
  // (each column's place across, 0 at the spine to 1 at the edge; its uv as the right print's)
  const across = Float32Array.from({ length: pageGeo.attributes.position.count }, (_, i) => pageGeo.attributes.position.getX(i) + 0.5);
  const depthAt = Float32Array.from({ length: pageGeo.attributes.position.count }, (_, i) => pageGeo.attributes.position.getZ(i));
  const pivot = new THREE.Group();
  pivot.position.copy(book.spine);
  j.root.add(pivot);
  const front = (book.prints[0].material as THREE.MeshStandardMaterial).clone();
  front.side = THREE.FrontSide;
  const backMat = (book.prints[1].material as THREE.MeshStandardMaterial).clone();
  backMat.side = THREE.BackSide;
  const page = add(pageGeo, front, pivot, 'page', false);
  const pageBack = add(backGeo, backMat, page, 'page back', false);
  void pageBack;
  page.visible = false;
  const at2 = new THREE.Vector2();
  /** the page laid at `k` of its turn (0 lying on his right half, 1 on his left), each point turned round the spine
   *  from its place on the right to its place on the left (`turnedPage`: never through either half) */
  const layPage = (k: number) => {
    const p = pageGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      turnedPage(shape, k, across[i], PAGE_LIFT, at2);
      // (across towards his right, -x)
      p.setXYZ(i, -at2.x, at2.y, depthAt[i]);
    }
    p.needsUpdate = true;
    pageGeo.computeVertexNormals();
  };
  /** the page's outer edge at `k` of its turn, `z` along it (his frame), and the way along the page from it towards the
   *  spine and the way its face looks (up at rest), for the hand that holds it */
  const edgeAt = (k: number, z: number, out: THREE.Vector3, inward: THREE.Vector3, face: THREE.Vector3) => {
    turnedPage(shape, k, 1, PAGE_LIFT, at2);
    out.set(-at2.x, at2.y, z).add(pivot.position);
    const ex = -at2.x, ey = at2.y;
    turnedPage(shape, k, 0.85, PAGE_LIFT, at2);
    inward.set(-at2.x - ex, at2.y - ey, 0).normalize();
    // (the face: the inward way turned a quarter round the spine's axis, up at rest; as the page stands up it faces
    // his left, over the left half it comes down on)
    face.set(-inward.y, inward.x, 0);
    return out;
  };

  // --- his pose, a frame at a time ---
  const eyes = head.eyes;
  let loop = 7, gaze = 0, gazeWant = 0, gazeUntil = -1, nextGlance = 0, clock = 0, holding = 0;
  /** the lines he'd said at the last frame, and how far into his nod to the last he is (s; past `NOD.time`: none) */
  let saidBefore = 0, nodding = Infinity;
  const lookYaw = { v: 0 }, lookPitch = { v: 0 };
  const hero = new THREE.Vector3(), headAt = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tL = new THREE.Vector3(), tR = new THREE.Vector3(), poleL = new THREE.Vector3(), poleR = new THREE.Vector3();
  /** the page's edge he holds, the way along the page from it to the spine, and the way its face looks */
  const edge = new THREE.Vector3(), inward = new THREE.Vector3(), face = new THREE.Vector3();
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

  const act: ScholarAct = { sit: 1, walk: 0, look: null, handL: null, handR: null, reachL: 0, reachR: 0, grip: 0 };
  /** his habit (its sleeves too, once dressed) as it sits at `sit` 1 and hangs at 0, between them the one morphed
   *  into the other: what's drawn is the seated pieces, the standing ones their shapes alone (followed by his legs) */
  const dressAs = (sit: number) => {
    const up = 1 - smooth(clamp(sit, 0, 1));
    for (const m of morphed) m(up);
  };

  function update(dt: number, heroAt: THREE.Vector3 | null, talking: boolean, said = 0): void {
    if (act.sit < 1) {
      standing(dt, heroAt, talking, said);
      follow(dt, scholarPlant.noSeatBlend ? 0 : FOLLOW.up, 0, scholarPlant.noSeatBlend ? Infinity : FOLLOW.most);
      robeFollow();
      cowlFollow();
      satFor = 0;
      return;
    }
    dressAs(1);
    legs();
    j.body.position.set(0, HIPS - P.hipY, 0);
    for (const o of [j.hips, j.spine, j.chest, j.body]) o.rotation.set(0, 0, 0);
    seated(dt, heroAt, talking, said);
    // (followed as he settles into his chair; then as his loop has him, which runs smooth of itself and keeps his
    // fingers on the page he turns: followed, the page went 5 mm into his hand)
    satFor = act.sit >= 1 ? satFor + dt : 0;
    follow(dt, FOLLOW.up, smooth(clamp(satFor / FOLLOW.settle, 0, 1)));
    cowlFollow();
  }
  let satFor = 0;

  // --- his pose followed: each joint (his fingers' too) turned a share of the way to where this frame set it ---
  const followed: THREE.Object3D[] = [];
  for (const o of Object.values(j)) if (o instanceof THREE.Object3D && o !== j.root && !followed.includes(o)) followed.push(o);
  for (const hand of [j.handL, j.handR]) hand.traverse((o) => { if (!(o as THREE.Mesh).isMesh && !followed.includes(o)) followed.push(o); });
  for (const e of eyes) if (!followed.includes(e)) followed.push(e);
  const was = new Map<THREE.Object3D, THREE.Quaternion>(), bodyWas = new THREE.Vector3(), followTo = new THREE.Quaternion();
  let following = false;
  /** the pose this frame set, reached a share of the way from the last frame's (`rate` 1/s), and `then` of the rest
   *  (1: at once; let go of over a while, as stopped at once his hand caught up 24 degrees in a frame): no jump where
   *  one beat of his rounds hands on to the next */
  /** each followed joint's turning (rad/s, about an axis in its parent's frame), and what reads it */
  const spins = new Map<THREE.Object3D, THREE.Vector3>(), turnBy = new THREE.Quaternion(), wantSpin = new THREE.Vector3(), axis = new THREE.Vector3();
  function follow(dt: number, rate: number, then = 0, most = Infinity): void {
    // (`rate` 0: at once, as a harness's planted jump has it)
    const k = following && dt > 0 && rate > 0 ? 1 - Math.exp(-rate * dt) * (1 - then) : 1;
    const held = following && dt > 0 && rate > 0 && most < Infinity;
    for (const o of followed) {
      let q = was.get(o), spin = spins.get(o);
      if (!q) was.set(o, q = o.quaternion.clone());
      if (!spin) spins.set(o, spin = new THREE.Vector3());
      // (a share of the way there)
      followTo.copy(q).slerp(o.quaternion, k);
      if (!held) { q.copy(followTo); spin.set(0, 0, 0); o.quaternion.copy(q); continue; }
      // (no faster than a joint of a man turns, and its turning changed no faster than he can change it: at its
      // fastest, his hand turned one way and the next frame the other, as he laid a book on a stack)
      turnBy.copy(q).invert().multiply(followTo);
      if (turnBy.w < 0) turnBy.set(-turnBy.x, -turnBy.y, -turnBy.z, -turnBy.w);
      const angle = 2 * Math.acos(Math.min(1, turnBy.w)), sin = Math.sqrt(Math.max(0, 1 - turnBy.w * turnBy.w));
      wantSpin.set(turnBy.x, turnBy.y, turnBy.z).multiplyScalar(sin > 1e-6 ? angle / sin / dt : 0);
      if (wantSpin.length() > most) wantSpin.setLength(most);
      const change = wantSpin.sub(spin), most2 = FOLLOW.speeds * dt;
      if (change.length() > most2) change.setLength(most2);
      spin.add(change);
      const by = spin.length() * dt;
      if (by > 1e-9) q.multiply(turnBy.setFromAxisAngle(axis.copy(spin).divideScalar(spin.length()), by));
      o.quaternion.copy(q);
    }
    j.body.position.copy(bodyWas.lerp(j.body.position, k));
    following = dt > 0;
  }

  /** where his look and his glances at the hero are: the hero's place in his frame, and whether he's near */
  let wasClose = false;
  const glanceAt = (dt: number, heroAt: THREE.Vector3 | null, talking: boolean): void => {
    let heroNear = false, heroClose = false;
    if (heroAt) {
      j.root.updateWorldMatrix(true, false);
      hero.copy(heroAt);
      j.root.worldToLocal(hero);
      heroNear = Math.hypot(hero.x, hero.z) < GLANCE.near;
      heroClose = Math.hypot(hero.x, hero.z) < GLANCE.close;
      hero.y += 1.55;
    }
    // (a hero come close is glanced up at whenever he was last: his glance from afar rested 13 s, and a hero walking up
    // to him meanwhile wasn't looked at)
    const cameClose = heroClose && !wasClose && clock > gazeUntil;
    wasClose = heroClose;
    const walking = act.walk > GLANCE.walking;
    if (talking) gazeWant = 1;
    else if (walking) { gazeWant = 0; gazeUntil = clock; }
    else if (cameClose) { gazeWant = 1; gazeUntil = clock + GLANCE.hold; nextGlance = clock + GLANCE.hold + GLANCE.rest; }
    else if (heroNear && clock > nextGlance) { gazeWant = GLANCE.small; gazeUntil = clock + GLANCE.hold; nextGlance = clock + GLANCE.hold + GLANCE.rest; }
    else if (clock > gazeUntil) gazeWant = 0;
    if (!heroAt) gazeWant = 0;
    // (and back to his way at once as he sets off: looked back slowly, he walked on still turned to the hero who'd stood
    // in his way)
    gaze = damp(gaze, gazeWant, gazeWant > gaze ? 3.2 : walking ? 14 : 2.2, dt);
  };

  let walkPhase = 0, grip = 0;
  const handAt = new THREE.Vector3(), lookAt = new THREE.Vector3(), hang = new THREE.Vector3();
  const aimFingers = new THREE.Vector3(), aimPalm = new THREE.Vector3();
  /**
   * On his feet: getting up from his table or sitting down at it (`act.sit` between), standing, or walking (`act.walk`);
   * an old man's stoop, his head to what he looks at (or up to the hero, as at his table), each hand hanging at his side
   * or gone to its aim, his fingers closing on what he holds.
   */
  function standing(dt: number, heroAt: THREE.Vector3 | null, talking: boolean, said: number): void {
    clock += dt;
    if (said !== saidBefore && talking) nodding = 0;
    saidBefore = said;
    nodding += dt;
    glanceAt(dt, heroAt, talking);
    const sit = clamp(act.sit, 0, 1);
    dressAs(sit);
    resetPose(j);
    // --- the legs, from sat to straight; the body rising over them, leant forward as a man gets up ---
    for (const [thigh, knee, ankle, sd] of [[j.thighL, j.kneeL, j.ankleL, 1], [j.thighR, j.kneeR, j.ankleR, -1]] as const) {
      thigh.rotation.set(lerp(0, -Math.PI / 2 + 0.06, sit), sd * 0.1 * sit, 0);
      knee.rotation.set(lerp(0.04, Math.PI / 2 - 0.02, sit), 0, 0);
      ankle.rotation.set(lerp(-0.04, -0.1, sit), 0, 0);
    }
    j.body.position.y = lerp(0, HIPS - P.hipY, sit);
    // (leant forward most as his weight comes off the seat, his nose over his knees, and upright once up)
    const rising = Math.sin(Math.PI * Math.pow(sit, 0.8));
    j.spine.rotation.x = STOOP.spine + 0.42 * rising;
    j.chest.rotation.x = STOOP.chest + 0.18 * rising;
    j.body.position.z += 0.05 * rising;
    // (bent at his knees and back to what a hand goes to low: a book on a stack on the floor)
    j.root.updateMatrixWorld(true);
    let low = Infinity;
    for (const [aim, reach] of [[act.handL, act.reachL], [act.handR, act.reachR]] as const) {
      if (aim && reach > 0) low = Math.min(low, lerp(1.2, j.root.worldToLocal(tmp.copy(aim.at)).y, smooth(clamp(reach, 0, 1))));
    }
    const bend = smooth(clamp((BEND.from - low) / BEND.over, 0, 1)) * (1 - sit);
    // (bent over at the waist, as an old man is, his knees bent a little: bent at the waist alone, his hands stopped
    // 30 cm short of a book on a stack; crouched, his knees came out through his robe, which hangs stiff from his hips)
    for (const [thigh, knee, ankle] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
      thigh.rotation.x -= 0.5 * bend;
      knee.rotation.x += 0.95 * bend;
      ankle.rotation.x -= 0.45 * bend;
    }
    j.body.position.y -= 0.17 * bend;
    j.body.position.z -= 0.12 * bend;
    j.spine.rotation.x += 0.95 * bend;
    j.chest.rotation.x += 0.35 * bend;
    j.neck.rotation.x = 0.08;
    // (the walk: short steps, an old man's)
    let swing = 0;
    if (act.walk > 0.01 && sit < 0.05) {
      walkPhase += dt * act.walk / WALK.step * Math.PI;
      const amt = clamp(act.walk / WALK.speed, 0, 1);
      walkCycle(j, walkPhase, amt, { stride: WALK.stride, knee: WALK.knee, arm: 0, bob: WALK.bob });
      swing = Math.sin(walkPhase) * amt;
      // (his hips turning with each step and his chest against them, his weight going from foot to foot: walked with
      // his body still, he moved as a puppet does)
      j.hips.rotation.y += WALK.hips * swing;
      j.chest.rotation.y -= WALK.hips * 0.7 * swing;
      j.body.position.x += 0.012 * Math.cos(walkPhase) * amt;
    }
    j.root.updateMatrixWorld(true);
    // --- the head: to what he looks at, or up to the hero ---
    j.neck.getWorldPosition(headAt);
    j.root.worldToLocal(headAt);
    if (act.look) lookAt.copy(act.look); else lookAt.set(0, 1.2, 1.5).applyMatrix4(j.root.matrixWorld);
    j.root.worldToLocal(lookAt);
    lookAt.lerp(hero, gaze);
    tmp.subVectors(lookAt, headAt);
    // (on his feet he looks over his shoulder, his back and chest turning with his neck: a hero come up behind him as
    // he faced a case was 114 degrees round, past a seated man's head's turn)
    const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.75, 1.75), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.9, 0.6);
    // (his head quicker to where he looks as he goes: as slow as a man's turn to a book, it trailed his body by 20
    // degrees as he set off from a turn, from play: "looking sideways when walking forwards")
    const headRate = act.walk > 0.1 ? 14 : 5;
    lookYaw.v = damp(lookYaw.v, yaw, headRate, dt);
    lookPitch.v = damp(lookPitch.v, pitch, headRate, dt);
    const bodyPitch = j.spine.rotation.x + j.chest.rotation.x;
    j.spine.rotation.y += lookYaw.v * 0.1;
    j.chest.rotation.y += lookYaw.v * 0.2;
    j.neck.rotation.y = lookYaw.v * 0.25;
    j.neck.rotation.x = -(lookPitch.v + bodyPitch) * 0.4;
    const nod = nodding < NOD.time ? NOD.pitch * Math.sin(Math.PI * nodding / NOD.time) * gaze : 0;
    j.head.rotation.set(-(lookPitch.v + bodyPitch) * 0.6 + nod, lookYaw.v * 0.45, 0);
    for (const e of eyes) e.rotation.set(-lookPitch.v * 0.15 + 0.05, lookYaw.v * 0.1, 0);
    j.root.updateMatrixWorld(true);
    // --- the arms: each hand hanging at his side (swinging a little as he walks), or gone to its aim ---
    for (const [shoulder, elbow, hand, aim, reach, sd, pole] of [
      [j.shoulderL, j.elbowL, j.handL, act.handL, act.reachL, 1, poleL], [j.shoulderR, j.elbowR, j.handR, act.handR, act.reachR, -1, poleR],
    ] as const) {
      shoulder.getWorldPosition(hang);
      j.root.worldToLocal(hang);
      hang.add(tmp.set(sd * 0.04, -0.6, 0.06 - sd * swing * WALK.arm));
      handAt.copy(hang);
      // (getting up and sitting down: his hands on his knees, pushing off them)
      const push = Math.sin(Math.PI * sit);
      if (push > 0.01) {
        (sd > 0 ? j.kneeL : j.kneeR).getWorldPosition(tmp);
        handAt.lerp(j.root.worldToLocal(tmp).add(V(sd * 0.03, 0.07, -0.04)), push);
      }
      const k = aim ? smooth(clamp(reach, 0, 1)) : 0;
      if (aim) {
        handAt.lerp(j.root.worldToLocal(tmp.copy(aim.at)), k);
        // (out to his side and ahead in an arc on its way: straight between his side and his chest it passed by his
        // shoulder, where his arm's bend turned over, his elbow 13 degrees in a frame)
        handAt.add(tmp.set(sd * 0.1, 0, 0.08).multiplyScalar(Math.sin(Math.PI * k)));
      }
      // (his elbows down at his sides, a little out: out at 0.7 they stood out as wings)
      pole.set(sd * 0.25, -1, -0.35);
      reachArm(shoulder, elbow, P.upperL, P.foreL, chestLocal(handAt.clone()), pole, 1, 0.08);
      j.root.updateMatrixWorld(true);
      // (hanging: fingers down, the palm in to the thigh; at its aim, as the aim has it, in his frame)
      handTurn(V(0, -1, 0.15), V(-sd, 0, 0), qa);
      if (aim) {
        // (its own vectors: `handTurn` works in fx, fy and fz, and given two of them it wrote over the palm as it read
        // it, a sheared turn that pulled his fingers out into strands)
        const inv = new THREE.Quaternion().copy(j.root.getWorldQuaternion(qb)).invert();
        handTurn(aimFingers.copy(aim.fingers).applyQuaternion(inv), aimPalm.copy(aim.palm).applyQuaternion(inv), qb);
        // (by way of a hand held out, palm down and fingers ahead: from hanging at his side straight to a grip on a shelf
        // is near a half turn, and the shortest way round it changed from frame to frame, 30 degrees at once)
        handTurn(V(0, -0.35, 1), V(-sd * 0.6, -1, 0), qp);
        if (k < 0.5) qa.slerp(qp, k * 2);
        else qa.copy(qp).slerp(qb, k * 2 - 1);
      }
      setHand(hand, qa.clone());
    }
    grip = damp(grip, act.grip, 8, dt);
    poseHand(handL, lerp(0.25, 0.75, grip * smooth(clamp(act.reachL, 0, 1))), 0.15, 0, clock, 0);
    poseHand(handR, lerp(0.25, 0.75, grip * smooth(clamp(act.reachR, 0, 1))), 0.15, 0, clock, 0);
    page.visible = false;
    // (as he begins to get up, and as he settles, his sat pose the one this rises from and sinks to: his arms on the
    // table, his loop's pose, given way over the first third of the rise. From play, "like he teleports a bit into
    // these different poses": his arms went from the table to his knees in a frame)
    const fromSeat = scholarPlant.noSeatBlend ? 0 : smooth(clamp((sit - SEAT_BLEND) / (1 - SEAT_BLEND), 0, 1));
    if (fromSeat > 0) {
      for (const o of followed) (standPose.get(o) ?? standPose.set(o, new THREE.Quaternion()).get(o)!).copy(o.quaternion);
      const stoodBody = j.body.position.clone();
      seatedPose(heroAt, talking, said);
      for (const o of followed) o.quaternion.slerp(standPose.get(o)!, 1 - fromSeat);
      j.body.position.lerp(stoodBody, 1 - fromSeat);
      page.visible = false;
    }
  }
  /** each joint's turn as `standing` posed it, while it's blended with his sat pose */
  const standPose = new Map<THREE.Object3D, THREE.Quaternion>();
  /** his pose sat at his table at his loop's point now (its clock not moved on) */
  const seatedPose = (heroAt: THREE.Vector3 | null, talking: boolean, said: number): void => {
    legs();
    j.body.position.set(0, HIPS - P.hipY, 0);
    for (const o of [j.hips, j.spine, j.chest, j.body]) o.rotation.set(0, 0, 0);
    seated(0, heroAt, talking, said);
  };

  function seated(dt: number, heroAt: THREE.Vector3 | null, talking: boolean, said = 0): void {
    clock += dt;
    // (a line said, a nod: only as he's looking up, never mid-glance away)
    if (said !== saidBefore && talking) nodding = 0;
    saidBefore = said;
    nodding += dt;
    // (talked to, his reading all but stops: it picks up where it was as he goes back to it)
    loop = (loop + dt * (1 - 0.9 * gaze)) % SCHOLAR_LOOP;
    const t = loop;
    // --- whether he's looking up at the hero: a glance as one comes near, held while he's talked to ---
    glanceAt(dt, heroAt, talking);

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
    // (the nod: down and back up again, once, as a man nods to his own point)
    const nod = nodding < NOD.time ? NOD.pitch * Math.sin(Math.PI * nodding / NOD.time) * gaze : 0;
    j.neck.rotation.x = neckX + nod * NOD.neck;
    j.head.rotation.set(headX + nod * (1 - NOD.neck), headY, -headY * 0.08 + muse * 0.04);
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
    tL.set(book.spine.x + 0.16, book.printTop + 0.035, book.spine.z - D * 0.4);
    tR.set(book.spine.x - 0.18, book.printTop + 0.035, book.spine.z - D * 0.38);
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
    // (slid off his left page onto the table beside the book as the turned page comes over, and back onto the new page
    // once it lies there, hidden: the falling page sweeps all the space over the left page round the spine, and lifting
    // his fingers left the rest of his hand in its way, the page through it, from play)
    const turnAt = turnA > 0 ? along(t, ...BEATS.turnA) : along(t, ...BEATS.turnB), clear = span(turnAt, 0.38, 1, 0.18);
    // (nearer him on the table than on the page, his elbow bent and kept up on the table: reached straight out to the
    // side, his arm straightened and his elbow dropped below the table's top, its bell through it)
    tL.x += clear * (book.spine.x + shape.half + 0.11 - tL.x); tL.y += 0.05 * Math.sin(Math.PI * clear); tL.z -= clear * 0.08;
    restL.x += clear * 0.06;
    // (on the table a hair higher than on the page, as its sleeve's cuff and his thumb hang lower there)
    tL.y -= clear * (book.printTop - book.table.top - 0.012);
    // the right: to the page's outer edge, near its corner nearest him, lifting it by the edge and carrying it up past
    // upright, then letting it fall over and going back to rest (he took it from thin air, by the spine, from play:
    // "there is nothing on the edges")
    // (the page lifts once his hand has it: it lifted before he was there, and his fingers came down on its print)
    const pageK = smooth(clamp((turnK - 0.3) / 0.5, 0, 1));
    // (let go of eased out: let go of at once, his hand turned 6.8 degrees in a frame back to the table)
    // (lifted by his hand a third of the way, then let go of to fall over by itself, as a page is turned: held up past
    // upright, his hand turned round 180 degrees letting it go, 7.8 degrees a frame)
    // (and kept beyond its edge, where he let it go, till it's over upright, then back to his page: going back at once, his
    // hand went in under the page still lifted over his right page, through it)
    const reach = smooth(span(turnK, 0.02, 0.84, 0.24)) * turning;
    // (in his hand till he lets it go)
    holding = pageK <= LET_GO ? reach : 0;
    // (his hand follows the edge only as far as he lifts it, then goes back from there: following it as it fell over, his
    // hand turned with it 6.8 degrees a frame as it let go)
    edgeAt(Math.min(pageK, LET_GO), -D * 0.3, edge, inward, face);
    // (the wrist out past the edge by a hand's length, so only his fingertips are on the page, pinching its edge, and
    // his hand is beyond it: the falling page sweeps only within its width of the spine. With the hand over the page,
    // its fingers on the face that leads as it falls, the page ran into them as he let go, from play)
    // (on top of the edge as he takes it, under it by the time he lets go: the page falls away from his fingers, not
    // into them)
    const under = clamp(Math.min(pageK, LET_GO) / LET_GO, 0, 1);
    tmp.copy(edge).addScaledVector(inward, -0.17).addScaledVector(face, lerp(0.02, -0.022, smooth(under)));
    tR.lerp(tmp, reach);
    // (and over the book in an arc, there and back: brought straight back down, his fingers dug 3 cm into the page)
    tR.y += 0.05 * Math.sin(Math.PI * reach) * (pageK > 0 ? 1 : 0.4);
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
    // (its fingers lifted off the page, the wrist kept on it, as the turned page comes down)
    handTurn(V(-0.35, 0.06, 1), V(0, -1, -0.06), qa);
    handTurn(V(-0.5, 0.75, -0.2), V(0.1, 0, -1), qb); qa.slerp(qb, smooth(beard));
    handTurn(V(-0.2, 0.9, -0.3), V(0.1, 0.2, -1), qb); qa.slerp(qb, smooth(specs));
    setHand(j.handL, qa.clone());
    handTurn(V(0.45, 0.06, 1), V(0, -1, -0.06), qa);
    // (holding the page: the fingers along it towards the spine, the palm on its face)
    // (the palm half way between the page's face and down: he pinches it from above, and his hand turns half as fast as it
    // lifts)
    handTurn(tmp.copy(inward).addScaledVector(face, 0.12).add(V(0, 0, 0.2)), face.clone().negate().add(V(0, -1, 0)), qb); qa.slerp(qb, reach);
    setHand(j.handR, qa.clone());
    // (resting, his fingers lie nearly flat on the page: curled as a hand is at rest in the air, their tips dug in)
    poseHand(handL, lerp(lerp(0.14, 1.0, beard), 0.6, specs), 0.15, specs, clock, 0);
    poseHand(handR, lerp(0.12 + 0.04 * Math.sin(clock * 0.7), 0.25, reach), 0.15, 0, clock, 0);

    // --- the page ---
    // (shown from the moment it moves to when it lies flat on the left page again: hidden a hair short of that, its
    // edge was still 7 mm over the left page and dropped there at once)
    page.visible = turning > 0.5 && pageK > 0 && pageK < 1;
    if (page.visible) layPage(pageK);
    calm = turning === 0 && beard === 0 && specs === 0 && muse < 0.02 && lean < 0.02 && holding === 0;
  }
  /** whether his loop is between its beats now (a page not being turned, his hand not at his face): he gets up, or
   *  does anything else, only then */
  let calm = true;

  // (the sleeves' bells shaped as his forearms lie at rest, on the table: down from each, in its own frame)
  loop = 5;
  update(0, null, false);
  yield;
  const downFrom = (elbow: THREE.Object3D) => {
    const d = V(0, -1, 0).applyQuaternion(elbow.getWorldQuaternion(new THREE.Quaternion()).invert());
    d.y = 0;
    return d.lengthSq() > 1e-4 ? d.normalize() : V(0, 0, -1);
  };
  let dressed = parts.length;
  dressBells(j, add, M, { L: downFrom(j.shoulderL), R: downFrom(j.shoulderR) }, { L: downFrom(j.elbowL), R: downFrom(j.elbowR) });
  // (the sleeves as they lie on the table, shown while he's sat; his undershirt's sleeves, free of the pose, always)
  const satSleeves = parts.slice(dressed).filter((m) => m.name !== 'scholar undersleeve');
  seatedSet.push(...satSleeves);
  // (and as they hang from his arms at his sides, shown while he's up: named apart, as `lab scholar` reads his sat
  // sleeves against his table)
  act.sit = 0;
  standing(0, null, false, 0);
  dressed = parts.length;
  dressBells(j, add, M, { L: downFrom(j.shoulderL), R: downFrom(j.shoulderR) }, { L: downFrom(j.elbowL), R: downFrom(j.elbowR) }, false);
  for (const m of parts.slice(dressed)) {
    if (m.name === 'scholar undersleeve') {
      m.removeFromParent();
      m.geometry.dispose();
      parts.splice(parts.indexOf(m), 1);
      continue;
    }
    m.name += ' standing';
    standingSet.push(m);
  }
  // (each sat sleeve's piece morphed into its hanging one: made by the same rings, in the same order)
  const upSleeves = standingSet.slice(-satSleeves.length);
  morphed.push(...satSleeves.map((m, i) => morphInto(m, upSleeves[i])));
  act.sit = 1;
  dressAs(1);
  yield;
  loop = 7;
  update(0, null, false);

  return {
    root: j.root,
    act,
    table: book.table,
    book,
    page,
    hands: [handL, handR],
    get holding() { return holding; },
    get calm() { return calm; },
    update,
    get loopAt() { return loop; },
    set loopAt(v: number) { loop = ((v % SCHOLAR_LOOP) + SCHOLAR_LOOP) % SCHOLAR_LOOP; },
    parts,
  };
}

interface BodyMats {
  habit: THREE.Material; habitD: THREE.Material; lining: THREE.Material; rope: THREE.Material;
  shoe: THREE.Material; tabard: THREE.Material; trim: THREE.Material; brass: THREE.Material; linen: THREE.Material;
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

/** his cowl (his chest's frame): its rows up it and points round, how much lower its front falls, how far its top is set
 *  back with his neck, and from where up it follows his neck (a share of the way up it) */
const COWL = { rows: 14, round: 36, dip: 0.018, back: -0.012, follows: 0.3 };
/** The cowl at `t` of the way up it: across, deep, its height (his chest's frame). On his shoulders a hair inside the
 *  habit's own (its edge hidden in it), up and out in a rolled fold, and in over the fold to close round his neck 1.2 cm
 *  off it (his neck 6.6 cm round at its foot, 5.4 at its top, its joint 25 cm up his chest). */
function cowlAt(t: number): [number, number, number] {
  const keys: [number, number, number, number][] = [
    // t, across, deep, height
    [0, 0.205, 0.112, 0.2], [0.22, 0.19, 0.13, 0.225], [0.45, 0.152, 0.138, 0.262], [0.66, 0.112, 0.114, 0.292],
    [0.84, 0.089, 0.089, 0.312], [1, 0.076, 0.073, 0.33],
  ];
  let k = 0;
  while (k < keys.length - 2 && keys[k + 1][0] < t) k++;
  const [t0, w0, d0, y0] = keys[k], [t1, w1, d1, y1] = keys[k + 1], u = smooth(clamp((t - t0) / (t1 - t0), 0, 1));
  return [lerp(w0, w1, u), lerp(d0, d1, u), lerp(y0, y1, u)];
}

/** His cowl's top following his neck: each point from where it hangs on his chest towards where his neck carries it,
 *  by how far up the cowl it is (`COWL.follows` and up), as his neck bows and turns. Rigid on his chest, his neck came out
 *  of it as he bowed over his book. Returns what does it, a frame. */
function followNeck(j: Joints, cowl: THREE.Mesh): () => void {
  const p = cowl.geometry.attributes.position as THREE.BufferAttribute, base = Float32Array.from(p.array as ArrayLike<number>);
  const top = Math.max(...Array.from({ length: p.count }, (_, v) => base[v * 3 + 1])), foot = Math.min(...Array.from({ length: p.count }, (_, v) => base[v * 3 + 1]));
  const share = Float32Array.from({ length: p.count }, (_, v) => smooth(clamp(((base[v * 3 + 1] - foot) / (top - foot) - COWL.follows) / (1 - COWL.follows), 0, 1)));
  j.neck.updateMatrix();
  const rest = j.neck.matrix.clone().invert(), move = new THREE.Matrix4(), at = new THREE.Vector3(), carried = new THREE.Vector3();
  cowl.frustumCulled = false;
  return () => {
    j.neck.updateMatrix();
    move.multiplyMatrices(j.neck.matrix, rest);
    const arr = p.array as Float32Array;
    for (let v = 0; v < p.count; v++) {
      at.set(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]);
      if (scholarPlant.cowlLoose) { at.x *= 1 + 0.7 * share[v]; at.z *= 1 + 0.7 * share[v]; }
      if (share[v] > 0) at.lerp(carried.copy(at).applyMatrix4(move), share[v]);
      arr[v * 3] = at.x; arr[v * 3 + 1] = at.y; arr[v * 3 + 2] = at.z;
    }
    p.needsUpdate = true;
    cowl.geometry.computeVertexNormals();
  };
}

/** His habit on the rig: its body on the spine and the chest, the skirt over his lap down to the floor on the hips, the
 *  sleeves over his upper arms, his tabard over it from the cowl to his knees, the rope belt with his keys and a
 *  pouch, the cowl, shoes. (The sleeves' bells come after his first pose: `dressBells`.) */
function* dressBody(j: Joints, add: Add, M: BodyMats): Generator<void, void, undefined> {
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
  yield;
  // --- the waist: from the seat up into the chest's ---
  const waistRows: [number, number, number, number][] = [
    [-0.12, 0.215, 0.16, 0.012], [-0.06, 0.2, 0.15, 0.02], [0.02, 0.182, 0.138, 0.025], [0.1, 0.172, 0.13, 0.025], [0.2, 0.17, 0.128, 0.02],
  ];
  add(rowsSurface(waistRows.map(([y, w, d, f]) => ring(y, w, d, f, 2.1)), 1.2), M.habit, j.spine, 'waist');
  yield;
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
  yield;
  // --- the cowl: his hood down, one cloth from his shoulders up round his neck, rolled over in a soft fold, closing
  // on his neck (its top follows it: `followNeck`), its bag lying on his back. A ring of cord standing off his neck with a
  // trim ring round it, his neck and back showed down inside it, from play: "the Librarian's hoodie is broken" ---
  {
    const collar: THREE.Vector3[][] = [];
    for (let k = 0; k <= COWL.rows; k++) {
      const t = k / COWL.rows, [w, d, y] = cowlAt(t);
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= COWL.round; i++) {
        const a = (i / COWL.round) * Math.PI * 2, [x, z] = oval(a, w, d, lerp(2.4, 2, t));
        // (lower in front, where it falls open over the chest; set back as his neck is; a fold's ripple round it)
        const front = Math.max(0, Math.cos(a)) ** 2, ripple = 1 + 0.03 * Math.sin(a * 6 + 0.8) * Math.sin(Math.PI * t);
        row.push(V(x * ripple, y - COWL.dip * front * smooth(t), z * ripple + lerp(0, COWL.back, smooth(t))));
      }
      collar.push(row);
    }
    add(rowsSurface(collar, 1.3), M.habitD, j.chest, 'cowl');
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
  yield;
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
  yield;
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
  yield;
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
    bag.position.set(-0.15, 0.09, -0.07);
    bag.rotation.set(0.15, 2.0, 0);
    const flap = add(new THREE.BoxGeometry(0.075, 0.035, 0.008), M.shoe, bag, 'pouch flap');
    flap.position.set(0, -0.005, 0.03);
    flap.rotation.x = 0.15;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), M.brass);
    stud.position.set(0, -0.018, 0.036);
    bag.add(stud);
  }
  yield;
  // --- a girdle book at his right hip, a small book in leather hung from his belt by its own long cover's tail, as a
  // keeper of books carries one; and a string of wooden reading beads at his left with a brass medallion of the
  // library's sign. From play: "we can improve more on his outfit" ---
  {
    const book = new THREE.Group();
    book.name = 'scholar girdle book';
    book.position.set(-0.19, 0.0, 0.03);
    book.rotation.set(0.05, -1.35, 0.06);
    j.spine.add(book);
    const W = 0.075, H = 0.1, T = 0.026;
    for (const sd of [-1, 1]) {
      const board = add(new THREE.BoxGeometry(W, H, 0.005), M.shoe, book, 'girdle book board');
      board.position.set(0, 0, sd * (T / 2 - 0.0025));
    }
    const pages = add(new THREE.BoxGeometry(W - 0.008, H - 0.008, T - 0.01), M.linen, book, 'girdle book pages');
    pages.position.set(0.004, 0, 0);
    const back = add(new THREE.CylinderGeometry(T / 2, T / 2, H, 10, 1, false, Math.PI, Math.PI), M.shoe, book, 'girdle book spine');
    back.position.set(-W / 2, 0, 0);
    // (its cover's tail, gathered into a knot and tucked under his belt)
    add(cord([V(-0.03, H / 2, 0), V(-0.035, H / 2 + 0.04, 0.004), V(-0.025, H / 2 + 0.085, 0.01), V(-0.015, H / 2 + 0.11, 0.012)], 0.007, false, 16), M.shoe, book, 'girdle book tail');
    const knot = add(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 0.8, 0.9), M.shoe, book, 'girdle book knot');
    knot.position.set(-0.015, H / 2 + 0.11, 0.012);
    for (const y of [-0.03, 0.03]) {
      const clasp = add(new THREE.BoxGeometry(0.012, 0.008, T + 0.004), M.brass, book, 'girdle book clasp', false);
      clasp.position.set(W / 2 - 0.004, y, 0);
    }
    // (the beads, one strand a mesh: a loop down from his belt, a brass medallion at its foot)
    const beads: THREE.BufferGeometry[] = [];
    const loop = new THREE.CatmullRomCurve3([V(0.12, 0.1, 0.12), V(0.15, 0.02, 0.135), V(0.165, -0.06, 0.13), V(0.175, -0.1, 0.11), V(0.18, -0.06, 0.085), V(0.17, 0.02, 0.08), V(0.155, 0.1, 0.095)]);
    for (let b = 0; b <= 26; b++) {
      const p = loop.getPointAt(b / 26);
      beads.push(new THREE.SphereGeometry(b % 9 === 0 ? 0.0075 : 0.0055, 8, 6).translate(p.x, p.y, p.z));
    }
    add(mergeAll(beads), M.shoe, j.spine, 'beads');
    const medal = add(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 18).rotateX(Math.PI / 2), M.brass, j.spine, 'beads medallion', false);
    medal.position.set(0.178, -0.125, 0.11);
    medal.rotation.y = 0.5;
  }
  yield;
  // --- the sleeves: close over the upper arm, a wide bell from the elbow, its lining dark; shoes under the hem ---
  for (const [shoulder, elbow, ankle, s] of [[j.shoulderL, j.elbowL, j.ankleL, 1], [j.shoulderR, j.elbowR, j.ankleR, -1]] as const) {
    void elbow; void shoulder;
    const foot = add(shoeGeometry(), M.shoe, ankle, 'shoe');
    foot.position.set(0, -0.069, 0.055);
  }
}

/** His sleeves: over the upper arms, and the bells from his elbows, wide, lined dark, a gold cord round each opening: each dropped the way down is
 *  from its forearm as he rests (`downL`, `downR`, in each elbow's frame), and laid flat 3.5 cm under it at the wrist,
 *  more towards the elbow: on the table, where they hung free through it. */
function dressBells(j: Joints, add: Add, M: BodyMats, upper: { L: THREE.Vector3; R: THREE.Vector3 }, fore: { L: THREE.Vector3; R: THREE.Vector3 },
  onTable = true): void {
  const bell: [number, number][] = [[0.12, -0.25], [0.112, -0.2], [0.095, -0.13], [0.078, -0.05], [0.07, 0.01], [0.066, 0.04], [0.04, 0.06], [0, 0.068]];
  // (the upper sleeves too: laid flat 6 cm under the arm at the elbow, where it rests on the table, free above it)
  for (const [shoulder, down, s] of [[j.shoulderL, upper.L, 1], [j.shoulderR, upper.R, -1]] as const) {
    // (standing, hung free: flattened as on the table, the upper sleeves stood out from his shoulders as square pads)
    const hang: Hang = onTable ? { down, droop: () => 0, floor: (y) => (y > -0.2 ? Infinity : lerp(0.08, 0.044, smooth(clamp((-y - 0.2) / 0.11, 0, 1)))) } : { ...HANG_FREE };
    add(sleeve([[0.064, -0.33], [0.07, -0.26], [0.074, -0.14], [0.08, -0.04], [0.078, 0.02], [0.05, 0.06], [0.02, 0.075], [0, 0.08]], hang, 0.05, 5 + s).geo,
      M.habit, shoulder, 'sleeve');
  }
  for (const [elbow, down, s] of [[j.elbowL, fore.L, 1], [j.elbowR, fore.R, -1]] as const) {
    const hang: Hang = onTable ? { down, droop: (y) => 0.03 * smooth(clamp(-y / 0.25, 0, 1)), floor: (y) => lerp(0.055, 0.02, smooth(clamp(-y / 0.24, 0, 1))) }
      : { down: V(0, 0, -1), droop: (y) => 0.02 * smooth(clamp(-y / 0.25, 0, 1)), floor: () => Infinity };
    const outer = sleeve(bell, hang, 0.06, 9 + s);
    add(outer.geo, M.habitD, elbow, 'bell');
    const inner = bell.map(([r, y]) => [r - 0.008, y + 0.004] as [number, number]).filter(([, y]) => y < -0.06);
    add(sleeve(inner, { ...hang, floor: (y) => hang.floor(y) - 0.006 }, 0.05, 9 + s).geo, M.lining, elbow, 'lining', false);
    add(cord(outer.rim, 0.005, true, 56), M.trim, elbow, 'trim cuff', false);
    // (his undershirt's sleeve down his forearm inside the bell to the wrist, its cuff gathered round it a little over
    // the hand: the hand alone at the end of an empty bell looked cut off at the wrist, from play: "the wrists are
    // floating, add arms continuing after wrists")
    const fore = -j.P.foreL;
    add(sleeve([[0.031, fore - 0.016], [0.035, fore - 0.008], [0.036, fore + 0.004], [0.033, fore + 0.016], [0.036, fore + 0.06],
      [0.041, -0.12], [0.046, -0.03], [0.047, 0.03]], { ...HANG_FREE }, 0.04, 13 + s).geo, M.linen, elbow, 'undersleeve');
  }
}

/** A soft leather shoe (its own frame, toe +z, its sole at -0.011): sections from heel to toe, each round over the top
 *  and flat underneath where it stands on its sole, the sole's edge (its welt) a little wider than the upper; its heel
 *  rounded and high at the back, the instep high, falling to a low rounded toe box. A ball flattened underneath, it
 *  showed under his hem as a black pebble, from play: "his little pebble black toes are like spheres". */
function shoeGeometry(): THREE.BufferGeometry {
  const K = 22, R = 18, rows: THREE.Vector3[][] = [], SOLE = -0.011, WELT = -0.005;
  for (let k = 0; k <= K; k++) {
    const t = k / K, z = lerp(-0.105, 0.12, t);
    // (its width: the heel's, widening to the ball of the foot, rounded off at the toe and at the heel)
    const toe = t > 0.78 ? Math.sqrt(Math.max(0, 1 - ((t - 0.78) / 0.22) ** 2)) : 1;
    const heel = Math.sqrt(Math.max(0, 1 - Math.max(0, (0.1 - t) / 0.1) ** 2));
    const w = 0.044 * (0.74 + 0.26 * Math.sin(Math.PI * 0.5 * Math.min(1, t / 0.66))) * toe * heel;
    // (its top: high at the heel's back and the instep, down to the toe box)
    const h = (t < 0.34 ? lerp(0.05, 0.062, smooth(t / 0.34)) : lerp(0.062, 0.026, smooth(clamp((t - 0.34) / 0.5, 0, 1)))) * toe * heel;
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= R; i++) {
      const a = (i / R) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // (round over its top; under it flat, the welt's edge out past the upper)
      const y = s >= 0 ? WELT + (h - WELT) * s ** 0.85 : WELT + (WELT - SOLE) * s;
      row.push(V(c * w * (s < 0.15 ? 1.08 : 1), (w > 1e-4 ? y : SOLE * 0.5 + h * 0.3), z));
    }
    rows.push(row);
  }
  return rowsSurface(rows, 4);
}

/** His robe, its hem's cord and his tabard pushed out by his legs as he walks (each mesh's points out from the robe's
 *  middle as far as a leg comes, near it): hung stiff from his hips, his knees and feet came through it, from play.
 *  Returns what does it, a frame. */
function followLegs(j: Joints, meshes: THREE.Mesh[]): () => void {
  // (each mesh's points as they hang: each's way out from the robe's middle, its distance and its height, made once; and
  // whether any was pushed out last frame. Its light's normals made again but for the hem's thin cord)
  const sets = meshes.map((m) => {
    m.frustumCulled = false;
    const p = m.geometry.attributes.position as THREE.BufferAttribute, base = Float32Array.from(p.array as ArrayLike<number>);
    const count = base.length / 3, ux = new Float32Array(count), uz = new Float32Array(count), r = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      const x = base[v * 3], z = base[v * 3 + 2] - 0.01, d = Math.hypot(x, z);
      r[v] = d; ux[v] = d < 1e-4 ? 0 : x / d; uz[v] = d < 1e-4 ? 0 : z / d;
    }
    return { m, p, base, ux, uz, r, pushed: true, lit: !m.name.endsWith('hem') };
  });
  const CLEAR = 0.065, WIDE = 0.2, FULL = 0.09, TALL = 0.22;
  const legs = [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const;
  const toe = new THREE.Vector3(0, -0.06, 0.17), a = new THREE.Vector3(), b = new THREE.Vector3();
  /** the shoe's outline (its ankle's frame): its toe, the balls of its sides, its heel, its instep and its top round
   *  the ankle */
  const SHOE = [V(0, -0.055, 0.172), V(0.046, -0.06, 0.09), V(-0.046, -0.06, 0.09), V(0, -0.06, -0.035), V(0, -0.03, 0.08),
    V(0, -0.012, 0.05), V(0, -0.02, -0.04), V(0.04, -0.03, 0.02), V(-0.04, -0.03, 0.02)];
  const pts: THREE.Vector3[] = Array.from({ length: 24 + SHOE.length * 2 }, () => new THREE.Vector3());
  return () => {
    j.root.updateMatrixWorld(true);
    // (each leg as points down it, in the hips' frame: hip to knee, knee to ankle, ankle to toe)
    let n = 0;
    for (const [thigh, knee, ankle] of legs) {
      const chain = [thigh.getWorldPosition(new THREE.Vector3()), knee.getWorldPosition(new THREE.Vector3()),
        ankle.getWorldPosition(new THREE.Vector3()), ankle.localToWorld(toe.clone())].map((v) => j.hips.worldToLocal(v));
      for (let c = 0; c < 3; c++) for (let t = 0; t < 4; t++) {
        a.copy(chain[c]); b.copy(chain[c + 1]);
        pts[n++].copy(a).lerp(b, (t + (c === 2 ? 1 : 0.5)) / 4);
      }
      for (const p of SHOE) pts[n++].copy(j.hips.worldToLocal(ankle.localToWorld(p.clone())));
    }
    for (const set of sets) {
      const { m, p, base } = set;
      const arr = p.array as Float32Array;
      let pushed = false;
      for (let i = 0, v = 0; i < arr.length; i += 3, v++) {
        const y = base[i + 1], r = set.r[v], ux = set.ux[v], uz = set.uz[v];
        if (r < 1e-4) { arr[i] = base[i]; arr[i + 1] = y; arr[i + 2] = base[i + 2]; continue; }
        let want = r;
        for (let q = 0; q < n; q++) {
          const pt = pts[q], dy = Math.abs(pt.y - y);
          if (dy > TALL) continue;
          const d = pt.x * ux + (pt.z - 0.01) * uz;
          if (d <= 0) continue;
          const e = Math.hypot(pt.x - d * ux, pt.z - 0.01 - d * uz);
          if (e > WIDE) continue;
          // (all the way out within a shoe's height of it, then less: pushed out a share of the way near it, a lifted
          // toe came out through the cloth, 6.6 cm, from play: "they go through his clothing when walking")
          const w = (1 - smooth(clamp((dy - FULL) / (TALL - FULL), 0, 1))) * (1 - smooth(e / WIDE)), need = d + CLEAR;
          if (need > r) want = Math.max(want, r + (need - r) * w);
        }
        if (want > r) pushed = true;
        arr[i] = ux * want; arr[i + 1] = y; arr[i + 2] = uz * want + 0.01;
      }
      // (hanging as it hangs, this frame and the last: nothing to send or light again)
      if (!pushed && !set.pushed) continue;
      set.pushed = pushed;
      p.needsUpdate = true;
      if (set.lit) m.geometry.computeVertexNormals();
    }
  };
}

/** His robe as it hangs while he's up, on his hips: round them and flaring to the floor, folds falling down it; a gold
 *  cord on its hem, and his tabard down its front from the belt to his knees. Returns its meshes (shown while he's up). */
function dressRobe(j: Joints, add: Add, M: BodyMats): THREE.Mesh[] {
  const N = 40, K = 30, drop = j.P.hipY - 0.012, rows: THREE.Vector3[][] = [];
  /** the robe at `s` down it (0 its top at the hips, 1 its hem) and `th` round it, `lift` off it */
  const at = (s: number, th: number, lift = 0) => {
    const y = lerp(0.04, -drop, s), fl = smooth(s);
    const a = lerp(0.2, 0.31, fl), b = lerp(0.15, 0.27, fl);
    // (its folds deepening down it, more in front and at the sides than behind)
    const fold = lerp(0.004, 0.03, fl) * (Math.sin(th * 9 + 1.3) * 0.7 + Math.sin(th * 5 + s * 4) * 0.3) * (0.7 + 0.3 * Math.cos(th));
    return V((a + fold + lift) * Math.sin(th), y, (b + fold + lift) * Math.cos(th) + 0.01);
  };
  for (let k = 0; k <= K; k++) {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) row.push(at(k / K, ROBE_FROM_SKIRT(i / N)));
    rows.push(row);
  }
  const robe = add(rowsSurface(rows, 1.2), M.habitD, j.hips, 'robe');
  const hem = add(cord(rows[K].slice(0, N), 0.006, true, 120), M.trim, j.hips, 'robe hem', false);
  // (the tabard down its front, from under the belt to the knees, a hair off it)
  const front: THREE.Vector3[][] = [];
  for (let k = 0; k <= 16; k++) {
    const sd = lerp(0.02, 0.55, k / 16), half = lerp(0.1, 0.12, k / 16), row: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const x = lerp(half, -half, i / 8), a = lerp(0.2, 0.31, smooth(sd));
      row.push(at(sd, Math.asin(clamp(x / (a + 0.01), -1, 1)), 0.009));
    }
    front.push(row);
  }
  const tabard = add(strip(front, 0.53, 0), M.tabard, j.hips, 'robe tabard');
  const set = [robe, hem, tabard];
  for (const m of set) m.visible = false;
  return set;
}

/** where round the robe (its `th`, 0 its front, +pi/2 his left) a point of the skirt `u` of the way round it lies (its
 *  `th` = 2pi u, 0 at his left, pi/2 over his lap): the robe made on the skirt's rows and columns, his left to his left
 *  and his lap to his front, so the one morphs into the other point for point */
const ROBE_FROM_SKIRT = (u: number) => Math.PI / 2 - u * Math.PI * 2;

/** `seated` drawn blended into `standing`'s shape (made with the same points in the same order), `standing` never
 *  drawn: its points and normals are the blend's other end, as his legs push them a frame (`followLegs`). Returns
 *  what blends it, `up` of the way (0 as it sits, 1 as it hangs), its points and normals set again only where `up` or
 *  the standing shape changed. Blended on the CPU, as the renderer's morphs aren't: they're packed once, as first
 *  drawn, and his legs' push never reached them (and a mesh drawn before its morph kept being drawn without it). */
function morphInto(seated: THREE.Mesh, standing: THREE.Mesh): (up: number) => void {
  const from = seated.geometry, to = standing.geometry;
  if (from.attributes.position.count !== to.attributes.position.count || from.index?.count !== to.index?.count) {
    throw new Error(`scholar: ${seated.name} and ${standing.name} aren't made alike, so neither blends into the other`);
  }
  const pos = from.attributes.position as THREE.BufferAttribute, nor = from.attributes.normal as THREE.BufferAttribute;
  const toPos = to.attributes.position as THREE.BufferAttribute, toNor = to.attributes.normal as THREE.BufferAttribute;
  const sat = Float32Array.from(pos.array as ArrayLike<number>), satN = Float32Array.from(nor.array as ArrayLike<number>);
  // (its bounds those of the one shape: drawn as the other, it was culled where it showed)
  seated.frustumCulled = false;
  standing.visible = false;
  let was = 0, version = toPos.version;
  return (up) => {
    if (up === was && (up === 0 || toPos.version === version)) return;
    was = up;
    version = toPos.version;
    const p = pos.array as Float32Array, n = nor.array as Float32Array, tp = toPos.array as Float32Array, tn = toNor.array as Float32Array;
    for (let i = 0; i < p.length; i++) p[i] = sat[i] + (tp[i] - sat[i]) * up;
    for (let i = 0; i < n.length; i += 3) {
      const x = satN[i] + (tn[i] - satN[i]) * up, y = satN[i + 1] + (tn[i + 1] - satN[i + 1]) * up, z = satN[i + 2] + (tn[i + 2] - satN[i + 2]) * up;
      const l = Math.hypot(x, y, z) || 1;
      n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l;
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  };
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
function* dressHead(head: Head, white: THREE.Material, capFelt: THREE.Material, brass: THREE.Material, glass: THREE.Material): Generator<void, void, undefined> {
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

  // --- his beard, grown as a beard grows: rooted over the cheeks, jaw, chin and under the lip, lying close on the face,
  // then falling from the chin as a mass that rests against his throat and comes to a soft point, layered locks all
  // over it. (From play: "thats not how beards grow": it was a sheet folded off the jaw like a bib, creased, a gap
  // between it and the chin and neck, and the moustache's ends showing through as a dark tuft.) ---
  const AZ = 1.75;
  /** where the beard stops up the face (mm) at azimuth `az`: under the lower lip in front, up to the sideburns, and
   *  behind the jaw's angle down along the jaw under the ear */
  const topAt = (az: number) => {
    const a = Math.abs(az);
    return a < 1.45 ? lerp(36, 98, smooth(clamp((a - 0.32) / 0.85, 0, 1))) : lerp(98, 40, smooth((a - 1.45) / 0.3));
  };
  /** how far its close layer stands off the skin (mm): sunk under it at its edges (its top, and behind the jaw), so it
   *  grows out of the face with no rim, thickening down to the chin (its volume below is the mass's). Stopped at a
   *  line of its own behind the cheek, it ran down from the ear as a straight cut. */
  const faceLift = (az: number, y: number) => -1.5 + smooth(clamp((topAt(az) - y) / 14, 0, 1)) * smooth(clamp((AZ - Math.abs(az)) / 0.28, 0, 1))
    * (4.5 + 3.5 * smooth(clamp((40 - y) / 45, 0, 1)));
  const faceAt = (az: number, y: number, lift: number) => skin(az, elAt(az, y), faceLift(az, y) + lift);
  const TIP = -118, CHIN = -6;
  /** the mass's section at height y (mm): half its width, half its depth, its middle's depth; wide under the jaw (its
   *  top inside the head, so nothing parts it from the chin and throat), narrowing down to the point, drawn forward
   *  as it falls (a beard's weight swings it out from the throat) */
  const section = (y: number) => {
    const t = clamp((CHIN - y) / (CHIN - TIP), 0, 1);
    const up = smooth(clamp((y - CHIN) / 14, 0, 1));
    return { a: (50 * (1 - t) ** 0.8 + 6 * t) * (1 - 0.25 * up), b: (40 * (1 - t) ** 0.85 + 5 * t) * (1 - 0.25 * up), z: 48 + 30 * smooth(t) };
  };
  /** the mass's outside at angle `th` round it (0 ahead, + to his left) and height y, `lift` out from it (mm), its
   *  front fuller than its back, and lobed a little where its locks clump */
  const massAt = (th: number, y: number, lift: number) => {
    const s = section(y), lobe = 1 + 0.05 * Math.sin(th * 5 + y * 0.06);
    const front = Math.cos(th) > 0 ? 1.1 : 0.8;
    return V(Math.sin(th) * (s.a * lobe + lift), y, s.z + Math.cos(th) * (s.b * lobe * front + lift));
  };
  // (its close layer over the face, from its top down past the chin, each row his right to his left)
  const faceRows: THREE.Vector3[][] = [];
  for (let y = 104; y >= CHIN - 4; y -= 5) {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= 44; i++) { const az = lerp(-AZ, AZ, i / 44); row.push(toG(faceAt(az, y, 0))); }
    faceRows.push(row);
    yield;
  }
  // (the mass, ring by ring from inside the jaw down to its point: each ring closed, round from behind)
  const rings: THREE.Vector3[][] = [];
  for (let y = 8; y >= TIP; y -= 4) {
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) ring.push(toG(bend(massAt(-Math.PI + (i / 40) * Math.PI * 2, y, 0))));
    rings.push(ring);
    yield;
  }
  const strands = beardMap();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8c4bc, map: strands, roughness: 0.9, side: THREE.DoubleSide });
  for (const [geo, name] of [[rowsSurface(faceRows.reverse(), 40), 'scholar beard'], [rowsSurface(rings, 40), 'scholar beard mass']] as const) {
    const m = new THREE.Mesh(geo, bodyMat);
    m.name = name;
    m.castShadow = true;
    G.add(m);
    yield;
  }

  const out: THREE.BufferGeometry[] = [];
  /** a point of the beard (mm) at u (his right -1 to his left 1) and height y, `lift` out from it: on the face's
   *  layer above the chin, on the mass below, the one eased into the other across the jaw's line */
  const beardAt = (u: number, y: number, lift: number) => {
    const onFace = y > CHIN - 4 ? faceAt(u * AZ, Math.max(y, CHIN - 4), lift) : null;
    const onMass = y < 12 ? bend(massAt(clamp(u, -1, 1) * 1.45, y, lift)) : null;
    if (!onMass) return onFace!;
    if (!onFace) return onMass;
    // (eased from the one to the other, and kept as far out as the further of them: eased alone, a lock dipped under
    // the face's layer across the jaw and showed as a dark slit round the chin)
    const axisZ = section(y).z - 12, out = (p: THREE.Vector3) => Math.hypot(p.x, p.z - axisZ);
    const p = onFace.clone().lerp(onMass, smooth(clamp((12 - y) / 20, 0, 1))), r = Math.max(out(onFace), out(onMass));
    const now = out(p);
    if (now > 1e-6) { p.x *= r / now; p.z = axisZ + (p.z - axisZ) * (r / now); }
    return p;
  };
  /** A lock's card turned out from the beard all along it: each point's face away from the beard's axis at its height
   *  (the head's middle on the face, the mass's middle below it). Turned away from one point behind the lock's middle,
   *  a long lock's top faced up and showed its back, the cool rim light on it a blue-grey fleck round the chin. */
  const outFromBeard = (ys: number[]) => {
    const axis = ys.map((y) => toG(bend(V(0, y, y > CHIN ? 10 : section(y).z - 12))));
    return (t: number, O: THREE.Vector3, p: THREE.Vector3) => {
      const f = t * (axis.length - 1), k = Math.min(axis.length - 2, Math.floor(f));
      O.subVectors(p, axis[k].clone().lerp(axis[k + 1], f - k)).normalize();
    };
  };
  // (the locks, in three layers, the outer longest: each rooted over the face's beard, lying down it, off the chin and
  // down the mass, drawn in towards the lock it's part of as it goes, its tip lifting a little off the rest)
  const CLUMPS = 9;
  for (let layer = 0; layer < 3; layer++) {
    const n = [150, 130, 110][layer];
    for (let c = 0; c < n; c++) {
      const u0 = (rng() * 2 - 1) * 0.95, az0 = u0 * AZ, top = topAt(az0) - 4 - rng() * 10 * clamp((Math.abs(u0) - 0.75) / 0.2, 0, 1);
      const y0 = lerp(top, CHIN - 20, rng() ** (1.2 + layer * 0.3));
      const side = clamp((Math.abs(u0) - 0.55) / 0.4, 0, 1);
      const yEnd = lerp(TIP * (0.45 + 0.15 * layer), TIP - 2, rng() ** 0.7) + side * 45;
      if (yEnd > y0 - 18) continue;
      const clump = (Math.round(((u0 + 1) / 2) * (CLUMPS - 1)) / (CLUMPS - 1)) * 2 - 1;
      const rim = clamp((Math.abs(u0) - 0.78) / 0.17, 0, 1);
      if (layer > 0 && rng() < rim * 1.4) continue;
      const lift = (1.2 + layer * 2.2 + rng() * 1.6) * (1 - 0.6 * rim), pts: THREE.Vector3[] = [], ys: number[] = [];
      for (let k = 0; k <= 6; k++) {
        const s = k / 6, y = lerp(y0, yEnd, s);
        ys.push(y);
        const pull = smooth(clamp((CHIN - y) / 60, 0, 1));
        const u = lerp(u0, clump * 0.8, pull * 0.7) * (1 - 0.35 * pull * s) + (rng() - 0.5) * 0.02;
        // (rooted inside the close layer and growing out of it: rooted on it, the roots under the lip stood out as dark
        // flakes, a card's root seen nearly edge on)
        const out = smooth(Math.min(1, s / 0.3));
        pts.push(toG(beardAt(u, y, lerp(-1.5, lift + 1.2 * Math.sin(Math.PI * s) + 0.6 * s * s, out))));
      }
      const w = (7 + rng() * 6) * HEAD_MM * (1 - 0.45 * rim), shade = (0.74 + rng() * 0.26) * (0.86 + 0.07 * layer);
      // (barely twisted: a card's back turned to the light took the cool rim light as a blue-grey fleck)
      out.push(hairCard(pts, (s) => w * (1 - 0.8 * s * s), toG(bend(V(0, (y0 + yEnd) / 2, 20))), 7, (rng() - 0.5) * 0.12,
        (s) => shade * (0.92 + 0.08 * s), outFromBeard(ys)));
      yield;
    }
    yield;
  }
  // (its underside and the sides of its back, as seen from below: locks from under the jaw down its back to the point)
  for (let c = 0; c < 90; c++) {
    const side = rng() < 0.5 ? -1 : 1, th = side * lerp(1.35, 2.9, rng()), y0 = lerp(CHIN, CHIN - 30, rng());
    const yEnd = lerp(-60, TIP + 4, rng()), pts: THREE.Vector3[] = [], ys: number[] = [], lift = 1 + rng() * 2;
    for (let k = 0; k <= 5; k++) {
      const s = k / 5, y = lerp(y0, yEnd, s);
      ys.push(y);
      pts.push(toG(bend(massAt(th * (1 - 0.3 * s), y, lift + 1.5 * s))));
      yield;
    }
    const w = (7 + rng() * 5) * HEAD_MM, shade = 0.62 + rng() * 0.22;
    out.push(hairCard(pts, (s) => w * (1 - 0.75 * s * s), toG(bend(V(0, (y0 + yEnd) / 2, 40))), 5, 0, (s) => shade * (0.85 + 0.15 * s), outFromBeard(ys)));
    yield;
  }
  // --- the moustache: from under the nose out over the corners of the mouth, its ends down into the beard (under its
  // close layer: they ran past it and showed below it as a dark tuft) ---
  for (let c = 0; c < 70; c++) {
    const side = c % 2 ? 1 : -1, x0 = side * (1 + rng() * 22), y0 = 55 + rng() * 6, pts: THREE.Vector3[] = [];
    const xEnd = side * (26 + rng() * 7), yEnd = 30 - rng() * 8;
    for (let k = 0; k <= 4; k++) {
      const s = k / 4, x = lerp(x0, xEnd, smooth(s * 0.8 + 0.2 * s)), y = lerp(y0, yEnd, s * s);
      const lift = 1 + 3.5 * Math.sin(Math.PI * Math.min(1, s * 1.2)) * (1 - 0.5 * s) + rng() * 0.6 - 1.5 * s * s;
      pts.push(toG(skinXY(x, y, lift)));
      yield;
    }
    const w = (4 + rng() * 3) * HEAD_MM, shade = 0.8 + rng() * 0.25;
    out.push(hairCard(pts, (s) => w * (1 - 0.7 * s), toGroup(0, 60, 20), 4, 0, () => shade));
    yield;
  }

  // --- his hair: a fringe round the back and sides of his head below his cap, the crown bald under it (from play:
  // "needs more work on hair, too basic": it was the mage's hair shell painted grey, a hard edge on the skin and a few
  // white tufts on it). Layered locks lying down and back over the head, rooted under the cap's rim, thinning out at
  // their lower edge to a soft hairline, and in front of each ear a sideburn running down into the beard. ---
  if (head.hair[0]) head.hair[0].visible = false;
  if (head.crop) head.crop.visible = false;
  /** the cap's rim's height (mm) at azimuth `az` (as the cap's own, below) */
  const capEdge = (az: number) => lerp(184, 192, (1 - Math.cos(az)) / 2) + 4 * Math.sin(az) ** 2;
  /** the fringe's lower edge (mm) at azimuth `az`: down the temples into the sideburns, up over the ears, down
   *  behind them to the nape */
  const hairLow = (az: number) => {
    const a = Math.abs(az);
    if (a < 1.32) return lerp(150, 96, smooth(clamp((a - 1.02) / 0.3, 0, 1)));
    if (a < 1.95) return lerp(124, 118, smooth((a - 1.32) / 0.63));
    return lerp(118, 42, smooth(clamp((a - 1.95) / 0.9, 0, 1)));
  };
  const skull = toGroup(0, 150, -10);
  // (under it all, short flat locks close on the scalp, side by side over the whole fringe: the face's paint under
  // them is the mage's dark hair, which showed between the locks as dark streaks)
  for (let a = 1.0; a <= Math.PI + 0.01; a += 0.085) {
    for (const side of [-1, 1]) {
      const az0 = side * a, low = hairLow(az0) - 2;
      for (let y0 = capEdge(az0) + 4; y0 > low + 6; y0 -= 13) {
        const yEnd = Math.max(y0 - 24, low - 4), pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 3; k++) {
          const t = k / 3, y = lerp(y0, yEnd, t), az = az0 + side * 0.03 * t + (rng() - 0.5) * 0.02;
          pts.push(toG(skin(az, elAt(az, y), 0.7 + 0.4 * Math.sin(Math.PI * t))));
        }
        const w = (15 + rng() * 5) * HEAD_MM, shade = 0.62 + rng() * 0.14;
        out.push(hairCard(pts, (t) => w * (1 - 0.5 * t * t), skull, 3, 0, () => shade));
      }
      yield;
    }
    yield;
  }
  for (let layer = 0; layer < 3; layer++) {
    const n = [170, 150, 120][layer];
    for (let c = 0; c < n; c++) {
      const side = rng() < 0.5 ? -1 : 1, a = lerp(1.06, Math.PI, rng() ** 0.85), az0 = side * a;
      const low = hairLow(az0), top = capEdge(az0) + 6;
      // (rooted anywhere from under the rim down, sparser and shorter towards the lower edge: a soft hairline)
      const r = rng(), y0 = lerp(top, low + 6, r ** (0.9 + layer * 0.25));
      const near = clamp((y0 - low) / 30, 0, 1);
      const len = (16 + rng() * 22) * (0.55 + 0.45 * near) * (1 + 0.15 * layer);
      const yEnd = Math.max(y0 - len, low - 10 * rng());
      if (y0 - yEnd < 8) continue;
      const lift = 1.2 + layer * 1.7 + rng() * 1.2, pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 4; k++) {
        const s = k / 4, y = lerp(y0, yEnd, s), az = az0 + side * 0.06 * s;
        pts.push(toG(skin(az, elAt(az, y), lift + 1.4 * Math.sin(Math.PI * s) + 1.2 * s)));
      }
      const w = (6 + rng() * 6) * HEAD_MM * (0.6 + 0.4 * near), shade = (0.7 + rng() * 0.3) * (0.84 + 0.08 * layer);
      out.push(hairCard(pts, (s) => w * (1 - 0.7 * s * s), skull, 4, (rng() - 0.5) * 0.5, (s) => shade * (0.8 + 0.2 * s)));
      yield;
    }
    yield;
  }
  // (the sideburns: before each ear, down from the temple into the beard's top)
  for (let c = 0; c < 70; c++) {
    const side = c % 2 ? 1 : -1, az0 = side * lerp(1.08, 1.3, rng()), y0 = lerp(170, 120, rng()), yEnd = lerp(98, 84, rng());
    const lift = 1.2 + rng() * 2.2, pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 4; k++) {
      const s = k / 4, y = lerp(y0, yEnd, s), az = az0 - side * 0.05 * s;
      pts.push(toG(skin(az, elAt(az, y), lift + 1.2 * Math.sin(Math.PI * s))));
      yield;
    }
    const w = (6 + rng() * 4) * HEAD_MM, shade = 0.74 + rng() * 0.24;
    out.push(hairCard(pts, (s) => w * (1 - 0.6 * s * s), skull, 4, 0, (s) => shade * (0.85 + 0.15 * s)));
    yield;
  }
  // --- the brows: bushy, white, a few long hairs curling out ---
  for (let c = 0; c < 44; c++) {
    const side = c % 2 ? 1 : -1, x0 = side * (12 + rng() * 38), y0 = 134 + rng() * 6 + (Math.abs(x0) - 30) * -0.05, pts: THREE.Vector3[] = [];
    const len = 9 + rng() * (rng() < 0.15 ? 16 : 7);
    for (let k = 0; k <= 3; k++) {
      const s = k / 3;
      pts.push(toG(skinXY(x0 + side * len * s, y0 + 4 * s - 5 * s * s, 1 + 3 * s)));
      yield;
    }
    const w = (3 + rng() * 2) * HEAD_MM, shade = 0.85 + rng() * 0.2;
    out.push(hairCard(pts, (s) => w * (1 - 0.6 * s), toGroup(0, 120, 0), 3, 0, () => shade));
    yield;
  }
  const locksGeo = mergeAll(out);
  const lockMesh = new THREE.Mesh(locksGeo, white);
  lockMesh.name = 'scholar beard locks';
  lockMesh.castShadow = true;
  G.add(lockMesh);

  // --- the skullcap: a felt cap over the crown, its rim rolled ---
  {
    const rowsCap: THREE.Vector3[][] = [], n = 40;
    // (low over the forehead: higher, it bared the top of the mage's painted hairline, his face's paint under it)
    const edge = (az: number) => lerp(184, 192, (1 - Math.cos(az)) / 2) + 4 * Math.sin(az) ** 2;
    const edgeEl = Array.from({ length: n + 1 }, (_, i) => { const az = -Math.PI + (i / n) * Math.PI * 2; return elAt(az, edge(az)); });
    for (let k = 0; k <= 10; k++) {
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const az = -Math.PI + (i / n) * Math.PI * 2, el = lerp(edgeEl[i], Math.PI / 2, (k / 10) ** 0.9);
        row.push(toG(skin(az, el, 9.5 + 1.5 * (k / 10))));
      }
      rowsCap.push(row);
      yield;
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
      yield;
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
