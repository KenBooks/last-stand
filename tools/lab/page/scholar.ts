// `lab scholar`: the library's Brother Hollis (`src/entities/models/scholar.ts`, seated by `src/world/houses/library.ts`) as
// a player meets him. Walked into the library by its door; then his reading loop posed a frame at a time through the
// whole of it, the wrap included, as the game poses it: every joint's turn a frame (a snap is one turned further in a
// frame than his moves ever turn one) and how far his head and his page-turning hand move over it (a loop that never
// moved would be a statue); a hero stood near him looked up at, and looked away from once he walks off; talked to, the
// hero held in his eye. His sleeves' cloth read against his table every frame of the loop: none of it through the
// table's top (wide bells hung free from forearms laid on it went through it, from play); the page he turns against
// his book's two halves, at every frame of each turn, its landing included: none of it under either half's print (it
// lifted out from under them, "1/4 of it is under another white piece", and landed through the book, from play), and
// lying flat on the left half as it lands; the book's printed pages reaching the spine on both halves, the halves
// meeting there ("fill in the pages... they should reach the middle"); his fingers on the page's outer edge while he
// holds it ("he grabs it from thin air, there is nothing on the edges"); the page never through either hand, their
// skinned meshes read against it each frame ("when he flips the page, it goes right through his hand"); his forearms
// clothed from the elbow to the wrist all through the loop, never an empty bell with a hand at its end ("the wrists
// are floating"); nothing on his table inside his sleeves, read against each sleeve's own rings as they're laid ("fix
// weird spike sticking through his arm": his quill, in its inkwell under his forearm resting on the table); his fingertips
// resting on the book and the table, not sunk into them. Pictured at points of the
// loop (reading, a page turned, the beard stroked, the spectacles pushed up, leaning in) from the front, each side,
// above and over his shoulder, close up and as the player sees him. `--canary` jumps his loop forward mid-way, a snap
// that must be found, reads his sleeves against a table 8 cm higher, which they must be found through, turns a page
// from a spine 1 cm lower, which must be found under the book, draws the prints 2 cm back from the spine, a gap that
// must be found, lands the page on his left hand as it rests, which must be found through it, and hides his
// undersleeves, which must be found bare.
import * as THREE from 'three';
import type { Lab, Pictured, Report, ViewName } from './lab';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { SCHOLAR_DESK } from '../../../src/data/houses/library';
import { SCHOLAR_LOOP, type Scholar } from '../../../src/entities/models/scholar';
import { pageHeight } from '../../../src/entities/models/book';
import { toVillage } from './village';
import { DOOR_FRAMES, stand, useByE, viewAs } from './houses';
import { holdThroughDoor } from './housesDoor';
import { COWL_GAP_MOST, COWL_INTO_MOST, cowlClearance, gripsSwept, roundsChecked } from './scholarRounds';
import { INTO_BOOK_MOST, PAGE_FACING, SLEEVES_INTO_BOOK_MOST, bookRead, intoBook, pageFacing, turnedRound } from './bookHold';

export interface ScholarOptions {
  /** the views of the close-ups (`front,left,right,back,above` by default) */
  views?: string[];
  /** the points of his loop pictured (s) */
  at?: number[];
  canary: boolean;
  /** instead, him pictured close at each beat of each task (page/scholarMoments.ts) */
  moments?: boolean;
  /** instead, his grip swept over every spot and shelf height (`gripsSwept`) */
  grips?: boolean;
}

/** the room's leather (`rooms.ts`): a book drawn in it is a box of the old kind */
const OLD_BOOK = 'room leather';

/** The room's books: how many are drawn as the shelves' model (the instances of its covers' meshes), and how many of its
 *  meshes are drawn in the leather the old boxes were (merged or not). */
function roomBooks(group: THREE.Object3D): { model: number; boxes: number } {
  let model = 0, boxes = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (/^library books \d+$/.test(m.name)) model += (m as THREE.InstancedMesh).count;
    const materials = Array.isArray(m.material) ? m.material : [m.material];
    if (materials.some((x) => x.name === OLD_BOOK)) boxes++;
  });
  return { model, boxes };
}

/** the frame a pose is stepped by (s): the game at 60 a second */
const FRAME = 1 / 60;
/** the most a joint may turn in a frame of his loop (deg): his quickest moves (the page lifted over, a hand back to
 *  the table) turn about 2.5; a snap turns many times that */
const SNAP = 5;
/** how far his head must turn and his hand go over the loop (deg, m), or he's a statue */
const MOVES = { head: 8, hand: 0.15 };
/** how far off the hero his face may point while he's looked at (deg) and how far off it must point once he's not */
export const LOOKED = { at: 25, away: 35 };
/** where the hero stands to talk to him as the player is pictured doing it (the room's frame): beside his table on its
 *  right, a step back, so the camera behind him sees the scholar's face ahead and to the left, within his reach */
export const SEEN_FROM: [number, number] = [-1.6, 2.4];
/** how far his sleeves' cloth may come below the table's top inside its edges (m), and how far below the top a point
 *  is still read as through it (further down, it's cloth hanging past the table's edge, under it) */
const THROUGH = { most: 0.004, depth: 0.2 };
/** the canary's table: this much higher than his (m) */
const RAISED = 0.08;
/** the canary's page: its spine this much lower (m), about where it was when it lifted from under the blocks */
const LOWERED = 0.01;
/** how far a fingertip's pad may sink into what it rests on (m) */
const SINK = 0.003;
/** how far a printed page may stop short of the spine (m), and the halves stand apart at it */
const SPINE_GAP = 0.003;
/** how far over the left half's print the page he turns may lie as it lands (m): flat on it, not floating */
const LANDED = 0.004;
/** how far his nearest fingertip may be from the page's outer edge while he has it in hand (m) */
const AT_EDGE = 0.05;
/** the canary's prints: drawn back from the spine this far (m) */
const DRAWN_BACK = 0.02;
/** how far into either side of the page a hand may come and still be on one side of it (m): a hand touching it */
const THROUGH_HAND = 0.0015;
/** the share of the page by its edge where he pinches it (thumb under, fingers over: not through it) */
const PINCH = 0.88;
/** how far from his forearm's axis something must stop each ray out from it (m): his forearm, its sleeve; a wide bell
 *  round it, empty, hides nothing, and his hand floated at its end */
const FOREARM = 0.06;
/** his sleeves' pieces, each a lathe of rings round its arm as laid (models/scholar.ts `sleeve`): what's inside one is
 *  in his arm. (Read as capsules round his arms, 7 cm round the forearm, the quill through the bell's side, spread wide
 *  on the table, read as clear of it) */
const SLEEVES = /^scholar (sleeve|bell|undersleeve)$/;
/** the canary's thing on his table: a quill stood up on it under the middle of his left forearm as it rests (where his
 *  quill once stood, by his book: fixed there, it went into the wide bell his forearm had, and missed the fitted
 *  sleeve that took its place), its foot on the table's top (m over the floor) */
const QUILL_FOOT = 0.76;
/** the rays out from each point along his forearm, and the points, from past the elbow to the wrist (shares of it) */
const ROUND = 8;
const ALONG_ARM = [0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.97];
/** what clothes a forearm: a sleeve's pieces (not the bell's lining: it's the bell's) */
const CLOTHES = /undersleeve|sleeve$|bell$/;

/** a page turn of his loop (s, from and to: `BEATS.turnA` in the model) */
const BEATS_TURN = [20, 24.5] as const;
/** what's pictured at each point of the loop */
const BEATS: readonly [number, string][] = [[5, 'reading'], [12.2, 'musing'], [22.4, 'turning a page'], [34, 'stroking his beard'],
  [45, 'pushing his spectacles up'], [52, 'leaning in']];

/** His joints (every group under him, a finger's and an eye's too), by name and place among them. */
export function jointsOf(s: Scholar): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  s.root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) out.push(o); });
  return out;
}

/** His sleeves' cloth (the upper sleeves, the bells, their linings and cuffs), as posed now: how deep its deepest point
 *  inside the table's edges is below its top (m, 0 for none), and which mesh, with the table raised by `raise`. */
function throughTable(s: Scholar, raise = 0): { depth: number; mesh: string } {
  const { x0, x1, z0, z1, top } = s.table, p = new THREE.Vector3(), toRoot = new THREE.Matrix4();
  const height = top + raise, inset = 0.01;
  s.root.updateMatrixWorld(true);
  const rootInverse = s.root.matrixWorld.clone().invert();
  let depth = 0, mesh = '';
  for (const m of s.parts) {
    // (the sleeves he wears sat: the standing set is hidden while he sits at it)
    if (!/sleeve|bell|lining|cuff/.test(m.name) || / standing$/.test(m.name)) continue;
    toRoot.multiplyMatrices(rootInverse, m.matrixWorld);
    const at = m.geometry.attributes.position;
    for (let i = 0; i < at.count; i++) {
      p.fromBufferAttribute(at, i).applyMatrix4(toRoot);
      if (p.x < x0 + inset || p.x > x1 - inset || p.z < z0 + inset || p.z > z1 - inset) continue;
      const below = height - p.y;
      if (below > depth && below < THROUGH.depth) { depth = below; mesh = m.name; }
    }
  }
  return { depth, mesh };
}

/** How far a point (world) is over a half of the book's print (m, below it if less than 0), and whether it's over the
 *  half at all, in that half's frame (x from the spine to its edge). */
function overHalf(s: Scholar, block: THREE.Object3D, p: THREE.Vector3, q = new THREE.Vector3()): number | null {
  const b = s.book.shape;
  block.worldToLocal(q.copy(p));
  if (q.x < 0 || q.x > b.half || Math.abs(q.z) > b.depth / 2 || q.y < -0.01) return null;
  return q.y - (pageHeight(b, q.x / b.half) + b.printed);
}

/** The page he turns, as posed now, against his book's two halves: the deepest any point of it is under either's print
 *  (m, 0 for none), the share of its points under one, and the most any point lies over the left half's print (where
 *  it lands; null where none is over it). Nothing while the page isn't shown. */
function pageUnder(s: Scholar): { depth: number; share: number; overLeft: number | null } {
  if (!s.page.visible) return { depth: 0, share: 0, overLeft: null };
  s.root.updateMatrixWorld(true);
  const at = s.page.geometry.attributes.position, p = new THREE.Vector3();
  let depth = 0, under = 0, overLeft: number | null = null;
  for (let i = 0; i < at.count; i++) {
    p.fromBufferAttribute(at, i).applyMatrix4(s.page.matrixWorld);
    let most = 0;
    for (const [h, block] of s.book.blocks.entries()) {
      const over = overHalf(s, block, p);
      if (over === null) continue;
      most = Math.max(most, -over);
      if (h === 1) overLeft = Math.max(overLeft ?? -Infinity, over);
    }
    if (most > 0) { under++; depth = Math.max(depth, most); }
  }
  return { depth, share: under / at.count, overLeft };
}

/** How far each half's printed page stops short of the spine (m, the most of the two), and how far apart the halves
 *  stand at it. */
function spineGaps(s: Scholar): { print: number; halves: number } {
  s.root.updateMatrixWorld(true);
  let print = 0;
  const q = new THREE.Vector3();
  for (const [h, printed] of s.book.prints.entries()) {
    const at = printed.geometry.attributes.position, block = s.book.blocks[h];
    let least = Infinity;
    for (let i = 0; i < at.count; i++) {
      block.worldToLocal(printed.localToWorld(q.fromBufferAttribute(at, i)));
      least = Math.min(least, q.x);
    }
    print = Math.max(print, least);
  }
  const [a, b] = s.book.blocks.map((block) => block.getWorldPosition(new THREE.Vector3()));
  return { print, halves: a.distanceTo(b) };
}

/** Each hand's skinned mesh as posed now, its vertices in the world: the one shown (bare or not), its skeleton's bones
 *  made again for it (the game does as it draws; the lab poses with no draw). */
function handPoints(s: Scholar): THREE.Vector3[][] {
  s.root.updateMatrixWorld(true);
  return s.hands.map((hand) => {
    const mesh = hand.bareSkin?.visible ? hand.bareSkin : hand.skin;
    mesh.skeleton.update();
    const out: THREE.Vector3[] = [], at = mesh.geometry.attributes.position;
    for (let i = 0; i < at.count; i++) out.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
    return out;
  });
}

/** The page he turns, as laid now, against each hand (its points, `handPoints`): how far the page cuts into it (m, 0 for
 *  none: a hand with points more than `THROUGH_HAND` on both sides of the page, over the page and short of the strip by
 *  its edge where he pinches it). The page's section across it, from the spine to the edge, is the same all along it. */
function pageThroughHands(s: Scholar, hands: THREE.Vector3[][]): number[] {
  const page = s.page, frame = page.parent!, at = page.geometry.attributes.position, half = s.book.shape.depth / 2;
  s.root.updateMatrixWorld(true);
  // (its section: the row along its +z edge, spine first)
  const section: THREE.Vector2[] = [];
  for (let i = 0; i < at.count; i++) if (at.getZ(i) > half - 1e-6) section.push(new THREE.Vector2(at.getX(i), at.getY(i)));
  const q = new THREE.Vector3(), p = new THREE.Vector2(), d = new THREE.Vector2(), foot = new THREE.Vector2();
  return hands.map((points) => {
    let below = 0, above = 0;
    for (const point of points) {
      frame.worldToLocal(q.copy(point));
      if (Math.abs(q.z) > half) continue;
      p.set(q.x, q.y);
      // (its nearest point on the section, and which side of it it's on)
      let best = Infinity, side = 0, along = 0;
      for (let k = 0; k + 1 < section.length; k++) {
        d.subVectors(section[k + 1], section[k]);
        const u = Math.max(0, Math.min(1, p.clone().sub(section[k]).dot(d) / d.lengthSq()));
        foot.copy(section[k]).addScaledVector(d, u);
        const dist = foot.distanceTo(p);
        if (dist < best) { best = dist; side = Math.sign(d.x * (p.y - foot.y) - d.y * (p.x - foot.x)); along = (k + u) / (section.length - 1); }
      }
      // (beyond the page's spine or edge, or in the strip he pinches, it's not through it)
      if (along <= 0 || along >= PINCH || best > 0.05) continue;
      if (side < 0) below = Math.max(below, best); else above = Math.max(above, best);
    }
    return below > THROUGH_HAND && above > THROUGH_HAND ? Math.min(below, above) : 0;
  });
}

/** His forearms as posed now: the first point along each (shares of it from the elbow to the wrist) where a ray out from
 *  its axis meets nothing that clothes it within `FOREARM` (null for none: clothed all along). */
function forearmBare(s: Scholar, hide = false): (number | null)[] {
  s.root.updateMatrixWorld(true);
  // (each cast at as two-sided: three meets only a one-sided mesh's front faces, and a ray out from inside a sleeve
  // meets its faces' backs, so through one-sided sleeves every forearm read bare)
  const twoSided = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const clothes = s.parts.filter((m) => CLOTHES.test(m.name) && (!hide || !/undersleeve/.test(m.name))).map((m) => {
    const stand = new THREE.Mesh(m.geometry, twoSided);
    stand.matrixWorld.copy(m.matrixWorld);
    stand.matrixAutoUpdate = false;
    return stand;
  });
  const ray = new THREE.Raycaster(), from = new THREE.Vector3(), to = new THREE.Vector3(), axis = new THREE.Vector3();
  const across = new THREE.Vector3(), up = new THREE.Vector3(), dir = new THREE.Vector3(), p = new THREE.Vector3();
  ray.far = FOREARM;
  return ['L', 'R'].map((side) => {
    s.root.getObjectByName(`scholar elbow${side}`)!.getWorldPosition(from);
    s.root.getObjectByName(`scholar hand${side}`)!.getWorldPosition(to);
    axis.subVectors(to, from).normalize();
    across.set(0, 1, 0).cross(axis).normalize();
    up.crossVectors(axis, across);
    for (const share of ALONG_ARM) {
      p.copy(from).lerp(to, share);
      for (let k = 0; k < ROUND; k++) {
        const a = (k / ROUND) * Math.PI * 2;
        dir.copy(across).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
        ray.set(p, dir);
        if (!ray.intersectObjects(clothes, false).length) return share;
      }
    }
    return null;
  });
}

/** How far a point (world) is inside a sleeve (m, 0 for outside it): between two of its rings, inside the ring laid
 *  between them there, by its distance in from that ring. */
function inSleeve(m: THREE.Mesh, point: THREE.Vector3): number {
  const lathe = m.geometry as THREE.LatheGeometry, rows = lathe.parameters.points.length, sides = lathe.parameters.segments;
  const at = m.geometry.attributes.position, q = m.worldToLocal(point.clone());
  // (its rings' heights: each a profile point's, the same all round it)
  let j = -1;
  for (let k = 0; k + 1 < rows; k++) if (q.y >= at.getY(k) && q.y <= at.getY(k + 1)) { j = k; break; }
  if (j < 0) return 0;
  const f = (q.y - at.getY(j)) / (at.getY(j + 1) - at.getY(j));
  const ring: THREE.Vector2[] = [];
  for (let i = 0; i <= sides; i++) {
    const a = i * rows + j, b = a + 1;
    ring.push(new THREE.Vector2(at.getX(a) + (at.getX(b) - at.getX(a)) * f, at.getZ(a) + (at.getZ(b) - at.getZ(a)) * f));
  }
  // (inside by its crossings, and how far in from its nearest edge)
  let inside = false, near = Infinity;
  const p = new THREE.Vector2(q.x, q.z), d = new THREE.Vector2(), foot = new THREE.Vector2();
  for (let i = 0; i < sides; i++) {
    const a = ring[i], b = ring[i + 1];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
    d.subVectors(b, a);
    const u = Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / d.lengthSq()));
    near = Math.min(near, foot.copy(a).addScaledVector(d, u).distanceTo(p));
  }
  return inside ? near : 0;
}

/** The things on his table (his desk's meshes but his own and his book's), posed now, against his sleeves: how deep the
 *  deepest point of any is inside one (m, 0 for none) and which, into which sleeve. */
function propsInArms(s: Scholar): { depth: number; what: string } {
  const desk = s.root.parent!, book = s.book.blocks[0].parent!;
  s.root.updateMatrixWorld(true);
  desk.updateMatrixWorld(true);
  const things: THREE.Mesh[] = [];
  desk.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name.startsWith('scholar desk')) return;
    for (let up: THREE.Object3D | null = m; up; up = up.parent) if (up === s.root || up === book) return;
    things.push(m);
  });
  const sleeves = s.parts.filter((m) => SLEEVES.test(m.name));
  const p = new THREE.Vector3();
  let depth = 0, what = '';
  for (const m of things) {
    const at = m.geometry.attributes.position;
    for (let i = 0; i < at.count; i++) {
      p.fromBufferAttribute(at, i).applyMatrix4(m.matrixWorld);
      for (const sleeve of sleeves) {
        const inside = inSleeve(sleeve, p);
        if (inside > depth) {
          depth = inside;
          const side = /L$/.test(sleeve.parent!.name) ? 'left' : 'right';
          what = `${m.name.replace('scholar desk ', 'his ')} into his ${side} ${sleeve.name.replace('scholar ', '')}`;
        }
      }
    }
  }
  return { depth, what };
}

/** How far his right hand's nearest fingertip is from the page's outer edge (m). */
function fromEdge(s: Scholar): number {
  s.root.updateMatrixWorld(true);
  const at = s.page.geometry.attributes.position, p = new THREE.Vector3(), tip = new THREE.Vector3();
  // (the edge: the page's points furthest from the spine, round which it turns)
  let far = 0;
  for (let i = 0; i < at.count; i++) far = Math.max(far, Math.hypot(at.getX(i), at.getY(i)));
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i < at.count; i++) {
    if (Math.hypot(at.getX(i), at.getY(i)) > far - 0.002) edge.push(p.fromBufferAttribute(at, i).applyMatrix4(s.page.matrixWorld).clone());
  }
  const hand = s.hands[1];
  let near = Infinity;
  for (const digit of [...hand.f.slice(0, 3), hand.thumb]) {
    digit.j[digit.j.length - 1].localToWorld(tip.set(0, -digit.len[digit.len.length - 1], 0));
    // (the distance to the edge's line between its two ends)
    const [a, b] = edge, ab = b.clone().sub(a), u = clamp01(tip.clone().sub(a).dot(ab) / ab.lengthSq());
    near = Math.min(near, tip.distanceTo(a.clone().addScaledVector(ab, u)));
  }
  return near;
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** His fingertips, as posed now, against what's under them (a page block's print, else the table's top): how far the
 *  deepest pad sinks into it (m, 0 for none) and whose. A pad is the tip less the finger's radius. */
function tipsSunk(s: Scholar): { depth: number; finger: string } {
  s.root.updateMatrixWorld(true);
  const { x0, x1, z0, z1, top } = s.table, rootInverse = s.root.matrixWorld.clone().invert();
  const tip = new THREE.Vector3(), q = new THREE.Vector3(), scale = new THREE.Vector3();
  let depth = 0, finger = '';
  for (const [h, hand] of s.hands.entries()) {
    for (const [d, digit] of [...hand.f, hand.thumb].entries()) {
      const last = digit.j[digit.j.length - 1];
      last.localToWorld(tip.set(0, -digit.len[digit.len.length - 1], 0));
      const r = digit.r * hand.vis.getWorldScale(scale).x;
      let sunk = -Infinity;
      for (const block of s.book.blocks) {
        const over = overHalf(s, block, tip, q);
        if (over !== null) sunk = Math.max(sunk, r - over);
      }
      q.copy(tip).applyMatrix4(rootInverse);
      if (sunk === -Infinity && q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1) sunk = top - (q.y - r);
      if (sunk > depth) { depth = sunk; finger = `${h ? 'right' : 'left'} ${d === hand.f.length ? 'thumb' : `finger ${d + 1}`}`; }
    }
  }
  return { depth, finger };
}

/** His loop posed through, a frame at a time, from its start past its wrap: the most any joint turned in a frame and
 *  where, the turn across the wrap, and how far his head turned and each hand went. */
function walkLoop(s: Scholar, canary: boolean): { lines: string[]; problems: string[]; caught: boolean } {
  const joints = jointsOf(s), head = s.root.getObjectByName('scholar cap')!.parent!, hands = joints.filter((j) => j.userData.drawnHand);
  const before = joints.map((j) => j.quaternion.clone()), was = new THREE.Quaternion();
  s.loopAt = SCHOLAR_LOOP - 4;
  s.update(0, null, false);
  joints.forEach((j, i) => before[i].copy(j.quaternion));
  let worst = 0, worstAt = '', wrap = 0, snapped = false, deepest = 0, deepestAt = '';
  let pageDeepest = 0, pageShare = 0, pageAt = '', pageFrames = 0, tipDeepest = 0, tipAt = '';
  /** how far over the left half the page lay at each turn's last frame shown (m), and the farthest his fingers were
   *  from its edge while he held it (m, and when) */
  const landings: number[] = [];
  let lastOverLeft: number | null = null, wasShown = false, edgeFar = 0, edgeAt = '', heldFrames = 0;
  /** how far the page cut into either hand at the deepest (m) and when; the first bare stretch of either forearm */
  let cutDeepest = 0, cutAt = '', bareAt = '', forearmReads = 0;
  /** the deepest any of his table's things came into his arms (m), what and when */
  let pokeDeepest = 0, pokeAt = '';
  /** his cowl against his neck and head over the loop (m), and when its worst */
  let cowlInto = 0, cowlGap = 0, cowlAt = '';
  /** the stretches of the loop his sleeves were through the table (s, from and to, and the deepest in it, m) */
  const spans: { from: number; to: number; depth: number; mesh: string }[] = [];
  const headTurn = { min: Infinity, max: -Infinity }, handAt = new THREE.Vector3();
  const handFrom = hands.map(() => new THREE.Vector3()), handWent = hands.map(() => 0);
  /** his fingers and his sleeves against his table's book's solids over the loop (m), and where the deepest */
  let bookFingers = 0, bookSleeves = 0, bookAt = '';
  const tableBook = bookRead(s, false);
  /** his table's book's pages as they read to him (`pageFacing`), at their worst; the canary's: turned half round */
  let pageAway = Infinity, pageRight = Infinity, plantedAway = Infinity, plantedRight = Infinity;
  const frames = Math.round((SCHOLAR_LOOP + 8) / FRAME);
  hands.forEach((h, i) => h.getWorldPosition(handFrom[i]));
  for (let f = 0; f < frames; f++) {
    const t = s.loopAt;
    // (the canary's snap: his loop jumped on 20 s at once, half way)
    if (canary && f === frames >> 1) { s.loopAt = t + 20; snapped = true; }
    s.update(FRAME, null, false);
    let most = 0, which = '';
    joints.forEach((j, i) => {
      was.copy(before[i]);
      const turn = THREE.MathUtils.radToDeg(was.angleTo(j.quaternion));
      if (turn > most) { most = turn; which = j.name || `joint ${i}`; }
      before[i].copy(j.quaternion);
    });
    const crossed = s.loopAt < t;
    if (crossed && !snapped) wrap = Math.max(wrap, most);
    if (most > worst) { worst = most; worstAt = `${which} at ${t.toFixed(2)} s`; }
    const yaw = new THREE.Euler().setFromQuaternion(head.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    headTurn.min = Math.min(headTurn.min, yaw.x); headTurn.max = Math.max(headTurn.max, yaw.x);
    hands.forEach((h, i) => { h.getWorldPosition(handAt); handWent[i] = Math.max(handWent[i], handAt.distanceTo(handFrom[i])); });
    if (tableBook) {
      const into = intoBook(s, tableBook);
      if (into.fingers > bookFingers) { bookFingers = into.fingers; bookAt = `${into.fat} at ${t.toFixed(2)} s`; }
      bookSleeves = Math.max(bookSleeves, into.sleeves);
      const facing = pageFacing(s, s.book.prints);
      pageAway = Math.min(pageAway, facing.away); pageRight = Math.min(pageRight, facing.right);
      if (canary && f === frames >> 2) {
        const turned = turnedRound(tableBook, () => pageFacing(s, s.book.prints));
        plantedAway = turned.away; plantedRight = turned.right;
      }
    }
    // (the page he turns against the blocks, and his fingertips against what they rest on)
    if (s.page.visible) {
      pageFrames++;
      const under = pageUnder(s);
      if (under.depth > pageDeepest) { pageDeepest = under.depth; pageShare = under.share; pageAt = `${t.toFixed(2)} s`; }
      lastOverLeft = under.overLeft;
      const cut = pageThroughHands(s, handPoints(s));
      for (const [h, depth] of cut.entries()) {
        if (depth > cutDeepest) { cutDeepest = depth; cutAt = `${h ? 'right' : 'left'} hand at ${t.toFixed(2)} s`; }
      }
      // (his fingers on its edge while it's fully in his hand)
      if (s.holding > 0.95) {
        heldFrames++;
        const from = fromEdge(s);
        if (from > edgeFar) { edgeFar = from; edgeAt = `${t.toFixed(2)} s`; }
      }
    } else if (wasShown && lastOverLeft !== null) landings.push(lastOverLeft);
    wasShown = s.page.visible;
    // (his table's things against his arms, read four times a second)
    if (f % 15 === 0) {
      const poke = propsInArms(s);
      if (poke.depth > pokeDeepest) { pokeDeepest = poke.depth; pokeAt = `${poke.what} at ${t.toFixed(2)} s`; }
    }
    // (his forearms clothed, read once a second of the loop)
    if (f % 60 === 0) {
      forearmReads++;
      const bare = forearmBare(s);
      for (const [h, share] of bare.entries()) {
        if (share !== null && !bareAt) bareAt = `his ${h ? 'right' : 'left'} forearm ${(share * 100).toFixed(0)}% of the way to the wrist at ${t.toFixed(2)} s`;
      }
    }
    // (his cowl against his neck and head, as he bows over his book and looks up)
    const cowl = cowlClearance(s);
    if (Math.max(cowl.intoNeck, cowl.intoHead) > cowlInto || cowl.gap > cowlGap) cowlAt = `${t.toFixed(2)} s`;
    cowlInto = Math.max(cowlInto, cowl.intoNeck, cowl.intoHead);
    cowlGap = Math.max(cowlGap, cowl.gap);
    const sunk = tipsSunk(s);
    if (sunk.depth > tipDeepest) { tipDeepest = sunk.depth; tipAt = `${sunk.finger} at ${t.toFixed(2)} s`; }
    // (his sleeves against the table, but where the canary's jump has posed him: that's the snap's to find)
    const through = throughTable(s);
    if (through.depth > deepest) { deepest = through.depth; deepestAt = `${through.mesh} at ${t.toFixed(2)} s`; }
    if (through.depth > THROUGH.most) {
      const last = spans[spans.length - 1];
      if (last && t - last.to < FRAME * 2 && t >= last.to) {
        last.to = t;
        if (through.depth > last.depth) { last.depth = through.depth; last.mesh = through.mesh; }
      } else spans.push({ from: t, to: t, depth: through.depth, mesh: through.mesh });
    }
  }
  const headDeg = THREE.MathUtils.radToDeg(headTurn.max - headTurn.min);
  const lines = [`loop: ${SCHOLAR_LOOP} s posed at 60 a second; the most a joint turned in a frame ${worst.toFixed(2)}° (${worstAt}), `
    + `across the wrap ${wrap.toFixed(2)}°; his head's pitch over it ${headDeg.toFixed(1)}°, his hands went ${handWent.map((d) => d.toFixed(2)).join(' and ')} m (the left first)`,
    `his sleeves below the table's top: ${deepest > 0 ? `${(deepest * 100).toFixed(1)} cm at the deepest (${deepestAt})` : 'none'}`
    + (spans.length ? `; through it ${spans.map((x) => `${x.from.toFixed(1)}-${x.to.toFixed(1)} s (${x.mesh}, ${(x.depth * 100).toFixed(1)} cm)`).join(', ')}` : ''),
    `the page he turns, over ${pageFrames} frames: ${pageDeepest > 0 ? `under the page blocks by ${(pageDeepest * 1000).toFixed(1)} mm at the deepest, ${(pageShare * 100).toFixed(0)}% of it under them then (${pageAt})` : 'never under the page blocks'}`,
    `his fingertips: ${tipDeepest > 0 ? `sunk ${(tipDeepest * 1000).toFixed(1)} mm at the deepest (${tipAt})` : 'never sunk into the book or the table'}`,
    `the page landing: ${landings.length ? landings.map((h) => `${(h * 1000).toFixed(1)} mm`).join(', ') : 'never'} over the left half's print at each turn's last frame`,
    `his fingers on its edge while he holds it (${heldFrames} frames): ${(edgeFar * 100).toFixed(1)} cm from it at the farthest (${edgeAt})`,
    `the page against his hands: ${cutDeepest > 0 ? `through one by ${(cutDeepest * 1000).toFixed(1)} mm at the deepest (${cutAt})` : 'never through either'}`,
    `his forearms, read ${forearmReads} times: ${bareAt ? `bare at ${bareAt}` : `clothed from the elbow to the wrist every time`}`,
    `his table's things: ${pokeDeepest > 0 ? `${(pokeDeepest * 100).toFixed(1)} cm into his arm at the deepest (${pokeAt})` : 'never into his arms'}`,
    `his cowl over the loop: at most ${(cowlInto * 100).toFixed(1)} cm into his neck or head, its top at most ${(cowlGap * 100).toFixed(1)} cm off his neck (${cowlAt})`];
  const problems: string[] = [];
  const caught = canary && worst > SNAP;
  lines.push(`his fingers in his table's book: ${(bookFingers * 1000).toFixed(1)} mm at the deepest${bookAt ? ` (${bookAt})` : ''}, his sleeves ${(bookSleeves * 100).toFixed(1)} cm`);
  if (bookFingers > INTO_BOOK_MOST) problems.push(`his fingers ${(bookFingers * 1000).toFixed(1)} mm into his table's book, ${bookAt} (at most ${INTO_BOOK_MOST * 1000})`);
  lines.push(`his table's book's pages: their tops at least ${pageAway.toFixed(2)} along his forward, their lines ${pageRight.toFixed(2)} along his right`);
  // (his sleeves shaped as the arms in them, standing: the upper narrowing to the elbow, the forearm's to the wrist)
  const arm = sleeveWidths(s), upperTaper = arm.deltoid / arm.elbow, foreTaper = arm.foreWide / arm.foreNarrow;
  lines.push(`his sleeves: the upper ${(arm.deltoid * 100).toFixed(1)} cm across at the deltoid to ${(arm.elbow * 100).toFixed(1)} over the elbow (${upperTaper.toFixed(2)}), the forearm's ${(arm.foreWide * 100).toFixed(1)} below the elbow to ${(arm.foreNarrow * 100).toFixed(1)} over the wrist (${foreTaper.toFixed(2)})`);
  if (upperTaper < SLEEVE_TAPER.upper) problems.push(`his upper sleeve narrows ${upperTaper.toFixed(2)} times to the elbow (at least ${SLEEVE_TAPER.upper}: "his arms are sausages")`);
  if (foreTaper < SLEEVE_TAPER.fore) problems.push(`his forearm's sleeve narrows ${foreTaper.toFixed(2)} times to the wrist (at least ${SLEEVE_TAPER.fore}: "his arms are sausages")`);
  if (pageAway < PAGE_FACING.away || pageRight < PAGE_FACING.right) problems.push(`his table's book reads wrong to him: its pages' tops ${pageAway.toFixed(2)} along his forward (at least ${PAGE_FACING.away}), their lines ${pageRight.toFixed(2)} along his right (at least ${PAGE_FACING.right}: "Fix upside down book")`);
  if (canary) {
    const caughtRound = plantedAway < PAGE_FACING.away || plantedRight < PAGE_FACING.right;
    lines.push(`canary: his table's book turned half round ${caughtRound ? 'found' : 'unseen'} (its pages' tops ${plantedAway.toFixed(2)} along his forward)`);
    if (!caughtRound) problems.push('the canary\'s table book turned round went unseen');
  }
  if (bookSleeves > SLEEVES_INTO_BOOK_MOST) problems.push(`his sleeves ${(bookSleeves * 100).toFixed(1)} cm into his table's book (at most ${SLEEVES_INTO_BOOK_MOST * 100})`);
  if (canary) lines.push(`canary: his loop jumped 20 s at once ${caught ? 'found' : 'unseen'} (${worst.toFixed(0)}° in a frame)`);
  if (!canary && worst > SNAP) problems.push(`a snap in his loop: ${worstAt} turned ${worst.toFixed(1)}° in a frame (most ${SNAP})`);
  if (wrap > SNAP) problems.push(`his loop snaps at its wrap: ${wrap.toFixed(1)}° in a frame`);
  if (cowlInto > COWL_INTO_MOST) problems.push(`his cowl goes into his neck or head over his loop: ${(cowlInto * 100).toFixed(1)} cm (${cowlAt})`);
  if (cowlGap > COWL_GAP_MOST) problems.push(`his cowl's top stands off his neck over his loop: ${(cowlGap * 100).toFixed(1)} cm (${cowlAt})`);
  if (deepest > THROUGH.most) problems.push(`his sleeves go through the table: ${(deepest * 100).toFixed(1)} cm below its top (${deepestAt})`);
  if (!pageFrames) problems.push('the page he turns was never shown over the loop');
  if (pageDeepest > 0 && !canary) problems.push(`the page he turns goes under the book's page blocks: ${(pageDeepest * 1000).toFixed(1)} mm, ${(pageShare * 100).toFixed(0)}% of it (${pageAt})`);
  if (tipDeepest > SINK) problems.push(`his fingertips sink into what they rest on: ${(tipDeepest * 1000).toFixed(1)} mm (${tipAt})`);
  if (landings.length < 2) problems.push(`the page landed ${landings.length} times over the loop, not at each of its 2 turns`);
  for (const h of landings) if (h > LANDED || h < 0) problems.push(`the page doesn't land flat on the left half: ${(h * 1000).toFixed(1)} mm over its print`);
  if (!heldFrames) problems.push('he never had the page in hand');
  if (edgeFar > AT_EDGE) problems.push(`he holds the page away from its edge: his fingers ${(edgeFar * 100).toFixed(1)} cm from it (${edgeAt})`);
  if (cutDeepest > 0) problems.push(`the page goes through his hand: ${(cutDeepest * 1000).toFixed(1)} mm (${cutAt})`);
  if (bareAt) problems.push(`a bare stretch of forearm: ${bareAt} (nothing within ${FOREARM * 100} cm of its axis)`);
  if (pokeDeepest > 0) problems.push(`something on his table pokes into his arm: ${(pokeDeepest * 100).toFixed(1)} cm (${pokeAt})`);
  // (the canary's other fault: a table 8 cm higher, which his sleeves at rest must be found through)
  if (canary) {
    s.loopAt = 5;
    s.update(0, null, false);
    const raised = throughTable(s, RAISED);
    lines.push(`canary: against a table ${RAISED * 100} cm higher his sleeves go ${(raised.depth * 100).toFixed(1)} cm below its top`);
    // (a page turned from a spine 1 cm lower, half way through lifting)
    const pivot = s.page.parent!;
    pivot.position.y -= LOWERED;
    // (early in its lift, where its root lies nearest the blocks: 40% of the way into the turn)
    s.loopAt = BEATS_TURN[0] + (BEATS_TURN[1] - BEATS_TURN[0]) * 0.4;
    s.update(0, null, false);
    const lowered = pageUnder(s);
    pivot.position.y += LOWERED;
    lines.push(`canary: a page turned from a spine ${LOWERED * 100} cm lower is under the blocks by ${(lowered.depth * 1000).toFixed(1)} mm`);
    // (the prints drawn back from the spine)
    for (const printed of s.book.prints) printed.position.x += DRAWN_BACK;
    const drawn = spineGaps(s);
    for (const printed of s.book.prints) printed.position.x -= DRAWN_BACK;
    lines.push(`canary: prints drawn ${DRAWN_BACK * 100} cm back stop ${(drawn.print * 1000).toFixed(1)} mm short of the spine`);
    // (the page landing on his left hand as it rests: his hand read at rest, the page as it comes down)
    s.loopAt = 5;
    s.update(0, null, false);
    const resting = handPoints(s);
    // (all the way down its fall: near its end the page lies under all of the resting hand but its pads)
    let landedOn = 0;
    for (let share = 0.5; share <= 0.8; share += 0.02) {
      s.loopAt = BEATS_TURN[0] + (BEATS_TURN[1] - BEATS_TURN[0]) * share;
      s.update(0, null, false);
      landedOn = Math.max(landedOn, pageThroughHands(s, resting)[0]);
    }
    lines.push(`canary: the page landing on his left hand at rest cuts ${(landedOn * 1000).toFixed(1)} mm into it`);
    // (his undersleeves hidden: his forearms bare in their bells)
    s.loopAt = 5;
    s.update(0, null, false);
    const bareArms = forearmBare(s, true);
    lines.push(`canary: with no undersleeves his forearms are ${bareArms.every((b) => b !== null) ? 'found bare' : 'found clothed'}`);
    // (a quill stood up under his left forearm, as he reads)
    s.loopAt = 5;
    s.update(0, null, false);
    const desk = s.root.parent!, forearm = (name: string) => desk.worldToLocal(s.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()));
    const under = forearm('scholar elbowL').lerp(forearm('scholar handL'), 0.5);
    // (points all up its length, as what's read of it is its points: a cone's are only at its foot and its tip, either
    // side of a forearm)
    const planted = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.24, 6, 24));
    planted.name = 'scholar desk quill (canary)';
    planted.position.set(under.x, QUILL_FOOT + 0.12, under.z);
    desk.add(planted);
    s.update(0, null, false);
    const poked = propsInArms(s);
    planted.removeFromParent();
    planted.geometry.dispose();
    lines.push(`canary: a quill stood under his left forearm goes ${(poked.depth * 100).toFixed(1)} cm into ${poked.what.replace(/.* into /, '')}`);
    return { lines, problems, caught: caught && raised.depth > THROUGH.most && lowered.depth > 0 && drawn.print > SPINE_GAP
      && landedOn > 0 && bareArms.every((b) => b !== null) && poked.depth > 0 };
  }
  if (headDeg < MOVES.head) problems.push(`his head hardly moves over the loop: ${headDeg.toFixed(1)}° (at least ${MOVES.head})`);
  for (const [i, went] of handWent.entries()) {
    if (went < MOVES.hand) problems.push(`his ${i ? 'right' : 'left'} hand hardly moves over the loop: ${went.toFixed(2)} m (at least ${MOVES.hand})`);
  }
  return { lines, problems, caught };
}

/** How far off the hero his face points (deg). */
export function offHero(s: Scholar): number {
  const head = s.root.getObjectByName('scholar cap')!.parent!;
  s.root.updateMatrixWorld(true);
  const from = head.getWorldPosition(new THREE.Vector3()), facing = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  const to = G.player.pos.clone().setY(G.player.pos.y + 1.55).sub(from).normalize();
  return THREE.MathUtils.radToDeg(facing.angleTo(to));
}

/** `lab scholar`. */
export async function scholar(lab: Lab, options: ScholarOptions): Promise<Report> {
  await toVillage(lab);
  const room = G.arena.rooms?.library;
  if (!room) return { text: 'no library: the lobby is not the village', problems: ['no rooms built'] };
  lab.drawing = true;
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await viewAs(lab, 'third');
  const door = villageObject('libraryDoor')!;
  await stand(lab, door.stand, 0);
  // (a house's door takes E held, as a player holds it: tapped, as it was opened when this was written, it took him
  // nowhere and the command failed at the door)
  problems.push(...await holdThroughDoor(lab, door, moments, null));
  await lab.until(() => G.arena.room === 'library', DOOR_FRAMES, "the library's door never took him in");
  await lab.step(15);
  const s = room.folk?.();
  // (held at his table for the checks of him sat reading; his rounds are let go after them)
  const rounds = room.rounds?.();
  if (rounds) rounds.hold = true;
  if (!s) return { text: 'the library has no scholar seated', problems: ['no scholar seated'] };
  if (options.grips && rounds) {
    const swept = await gripsSwept(lab, s, rounds);
    return { text: swept.lines.join('\n'), problems: swept.problems, moments: [] };
  }
  let triangles = 0;
  s.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; });
  lines.push(`Brother Hollis seated, ${Math.round(triangles / 1000)}k triangles`);

  // --- every book in the room the shelves' model: none a leather box, as the stacks on the floor were ---
  const books = roomBooks(room.group);
  lines.push(`the room's books: ${books.model} drawn as the shelves' model; ${books.boxes} meshes of the old leather boxes`);
  if (books.boxes) problems.push(`the library has ${books.boxes} meshes of leather book boxes (from play: "These models are not same as books on shelves")`);
  if (options.canary) {
    const old = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.055, 0.24), new THREE.MeshStandardMaterial({ name: OLD_BOOK }));
    room.group.add(old);
    const planted = roomBooks(room.group).boxes;
    old.removeFromParent();
    lines.push(`canary: a leather box laid in the room ${planted ? 'found' : 'went unseen'}`);
    if (!planted) problems.push('canary: a leather box laid in the room went unseen');
  }

  // --- the book: its printed pages to the spine, its halves meeting there ---
  const gaps = spineGaps(s);
  lines.push(`the book: its prints stop ${(gaps.print * 1000).toFixed(1)} mm short of the spine, its halves ${(gaps.halves * 1000).toFixed(1)} mm apart at it`);
  if (gaps.print > SPINE_GAP) problems.push(`the book's printed pages stop ${(gaps.print * 1000).toFixed(1)} mm short of the spine (at most ${SPINE_GAP * 1000})`);
  if (gaps.halves > SPINE_GAP) problems.push(`the book's halves stand ${(gaps.halves * 1000).toFixed(1)} mm apart at the spine`);

  // --- the loop, posed through ---
  const loop = walkLoop(s, options.canary);
  lines.push(...loop.lines);
  problems.push(...loop.problems);
  if (options.canary) {
    lines.push(`canary: ${loop.caught ? 'every planted fault found' : 'a planted fault went unseen'}`);
    if (!loop.caught) problems.push('canary: a planted fault went unseen');
    // (and his rounds' own: a book he carries off his hands)
    if (rounds) {
      const planted = await roundsChecked(lab, s, rounds, true);
      lines.push(...planted.lines);
      problems.push(...planted.problems);
    }
    return { text: lines.join('\n'), problems, moments };
  }

  // --- glanced at as the hero comes near; looked away from as he goes ---
  const him = villageObject('scholar')!, facingHim = Math.atan2(him.at[0] - him.stand[0], him.at[1] - him.stand[1]);
  await stand(lab, him.stand, facingHim);
  await lab.step(60);
  const glanced = offHero(s);
  await stand(lab, [0, -2.2], 0);
  await lab.step(300);
  const away = offHero(s);
  lines.push(`a hero come near: his face ${glanced.toFixed(0)}° off him; walked off and 5 s on, ${away.toFixed(0)}° off him`);
  if (glanced > LOOKED.at) problems.push(`he never looked up at a hero come near: his face ${glanced.toFixed(0)}° off him`);
  if (away < LOOKED.away) problems.push(`he kept looking at the hero after he walked off: ${away.toFixed(0)}° off him`);

  // --- talked to: held in his eye (stood beside his table, the over the shoulder camera looking past him: it looks
  // down the room, to its back wall, whichever way the hero faces) ---
  await stand(lab, SEEN_FROM, Math.PI);
  await lab.step(400);
  await useByE(lab, him, problems);
  await lab.step(90);
  const talking = offHero(s);
  lines.push(`talked to: his face ${talking.toFixed(0)}° off the hero`);
  if (talking > LOOKED.at) problems.push(`talked to, he didn't look at the hero: ${talking.toFixed(0)}° off him`);
  moments.push(await lab.screen('scholar-talk', ['talked to, as the player sees it']));
  await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(240);
  moments.push(await lab.screen('scholar-third', ['as the player sees him from his table']));

  // --- pictured at points of his loop, the hero by the door facing as he does ---
  const { x, z, turn } = SCHOLAR_DESK;
  const placed = new THREE.Vector3(3.5, 0, 3.2);
  G.player.place(placed, turn);
  await lab.step(400);
  const views = (options.views ?? ['front', 'left', 'right', 'back', 'above']) as ViewName[];
  const ahead = (d: number, y: number) => new THREE.Vector3(x + Math.sin(turn) * d, y, z + Math.cos(turn) * d);
  // (his arms on the table: framed on its near edge, as from play the sleeves were seen through it)
  const chest = ahead(0, 1.0), face = ahead(0.08, 1.2), arms = ahead(0.3, s.table.top + 0.05);
  // (his book, from above: framed on its spine, close enough to see a page lying on the blocks or under them)
  const book = s.page.parent!.getWorldPosition(new THREE.Vector3());
  const beats = options.at ? options.at.map((t): [number, string] => [t, `${t} s`]) : BEATS;
  for (const [t, what] of beats) {
    s.loopAt = t;
    s.update(0, null, false);
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}`, views, [`${what} (${t} s of ${SCHOLAR_LOOP})`], { at: chest, distance: 1.7 }));
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-face`, ['front', 'left'], [`${what}: his face`], { at: face, distance: 0.75 }));
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-arms`, ['front', 'left', 'right'], [`${what}: his arms on the table`], { at: arms, distance: 1.1 }));
    // (his left forearm close, from his left and ahead: where his quill stood up through its sleeve, from play)
    const elbowL = s.root.getObjectByName('scholar elbowL')!.getWorldPosition(new THREE.Vector3());
    const forearm = s.root.getObjectByName('scholar handL')!.getWorldPosition(new THREE.Vector3()).lerp(elbowL, 0.5);
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-forearm`, ['left', 'front'], [`${what}: his left forearm close`], { at: forearm, distance: 0.6 }));
    // (and from above ahead of him, as a player standing at his table looks down at it: the close-ups turn with the
    // hero's facing, so the hero turned round makes their view from above and behind one from above and ahead)
    G.player.place(placed, turn + Math.PI);
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-table`, ['above'], [`${what}: his book from above, ahead of him`], { at: book, distance: 0.8 }));
    G.player.place(placed, turn);
  }

  // --- his rounds: let go from his table, followed through a browse, a keep and a restock ---
  if (rounds) {
    const done = await roundsChecked(lab, s, rounds, false);
    lines.push(...done.lines);
    problems.push(...done.problems);
    moments.push(...done.moments);
  }
  return { text: lines.join('\n'), problems, moments };
}

/** how his sleeves must narrow (their widths' ratios, at least): his upper sleeve from the deltoid (a fifth of the way
 *  down from the shoulder joint) to over the elbow, and his forearm's from its widest below the elbow to its narrowest
 *  above the cuff. From play: "why his arms are sausages, we fixed that for the warrior" (a round tube each, 15 cm
 *  across all the way down the upper arm and a cone widening to 25 cm from the elbow). */
export const SLEEVE_TAPER = { upper: 1.12, fore: 1.08 };

/** His sleeves' widths (m, across the arm and front to back, the larger) along them, each read from its own mesh as it's
 *  built (its joint's frame): the upper sleeve's at the deltoid and over the elbow, the forearm's widest and narrowest. */
export function sleeveWidths(s: Scholar): { deltoid: number; elbow: number; foreWide: number; foreNarrow: number } {
  // (read at the rows of their lathes' profiles, which they keep: `dressBells`)
  const widthAt = (mesh: THREE.Mesh, y: number, band = 0.004) => {
    const pos = mesh.geometry.attributes.position;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - y) > band) continue;
      x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i)); z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i));
    }
    return Math.max(x1 - x0, z1 - z0);
  };
  const upper = s.root.getObjectByName('scholar shoulderL')!.children.find((m) => m.name === 'scholar sleeve standing') as THREE.Mesh;
  const fore = s.root.getObjectByName('scholar elbowL')!.children.find((m) => m.name === 'scholar bell standing') as THREE.Mesh;
  const along = [0.03, -0.02, -0.08, -0.15, -0.2].map((y) => widthAt(fore, y));
  return { deltoid: widthAt(upper, -0.06), elbow: widthAt(upper, -0.27), foreWide: Math.max(...along.slice(0, 3)), foreNarrow: Math.min(...along.slice(3)) };
}
