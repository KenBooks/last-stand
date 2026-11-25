// tools/lab `scholar`'s read of Brother Hollis's hands and arms against the open book he reads (standing, the open book
// in his hands; sat, the one on his table): every knuckle and fingertip of both hands, each a round as thick as its
// finger, and the points of his sleeves (the upper sleeve, the bell, its lining and cuff, the linen undersleeve)
// against the book's solids, its cover and each half's block of pages (models/book.ts: in a half's frame, from the
// spine out along x, from the cover up to the page's top, across its depth). From play: "fingers go through the book"
// (his fingertips up through the pages by the gutter, and his forearm's linen lying along the gutter: his palms were
// aimed inside the cover); the round 2 check read one point a hand, a fixed way down it, which missed it.
import * as THREE from 'three';
import type { Scholar } from '../../../src/entities/models/scholar';
import { bookShape, pageHeight } from '../../../src/entities/models/book';
import { G } from '../../../src/state';

/** how far into the open book a finger may go (m), and a sleeve (m: a bell is a rigid flare round the wrist, and its
 *  rim and cord brush about a centimetre into the page block's lower edge as he holds it up, out of sight from above:
 *  only sleeves that drape as cloth would lie clear) */
export const INTO_BOOK_MOST = 0.002, SLEEVES_INTO_BOOK_MOST = 0.015;
/** his sleeves' meshes */
const SLEEVES = /^scholar (sleeve|bell|lining|trim cuff|undersleeve)( standing)?$/;

/** The open book's solids: each a mesh and how deep a point is in it (m; less than 0 outside it). */
interface Solid { mesh: THREE.Mesh; depth(local: THREE.Vector3, scale: THREE.Vector3): number }

/** `book`'s cover and halves as solids. */
function solidsOf(book: THREE.Object3D): Solid[] {
  const solids: Solid[] = [];
  book.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const box = m.geometry.boundingBox!;
    if (m.name === 'open book cover') {
      solids.push({ mesh: m, depth: (p, s) => boxDepth(p, box.min, box.max, s) });
    } else if (m.name === 'open book half') {
      const shape = bookShape(box.max.x / 0.49), half = box.max.x;
      solids.push({ mesh: m, depth: (p, s) => {
        const top = pageHeight(shape, THREE.MathUtils.clamp(p.x / half, 0, 1));
        return boxDepth(p, new THREE.Vector3(0, 0, -shape.depth / 2), new THREE.Vector3(half, top, shape.depth / 2), s);
      } });
    }
  });
  return solids;
}

/** How deep `p` is in the box `min`..`max` (its frame, scaled by `s` into the world's metres): its least way out
 *  inside it, less than 0 by its furthest way off outside. */
export function boxDepth(p: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, s: THREE.Vector3): number {
  const ins = [(p.x - min.x) * s.x, (max.x - p.x) * s.x, (p.y - min.y) * s.y, (max.y - p.y) * s.y, (p.z - min.z) * s.z, (max.z - p.z) * s.z];
  const least = Math.min(...ins);
  return least >= 0 ? least : -Math.max(...ins.map((d) => -d));
}

/** His knuckles and fingertips (world), each with its finger's thickness. */
export function fingerPoints(s: Scholar): { at: THREE.Vector3; r: number; what: string }[] {
  const points: { at: THREE.Vector3; r: number; what: string }[] = [];
  s.hands.forEach((hand, h) => {
    for (const [k, digit] of [...hand.f, hand.thumb].entries()) {
      const at = digit.j.map((j) => j.getWorldPosition(new THREE.Vector3()));
      // (its tip: its last bone's length on from its last knuckle, the way that knuckle turns it, as each bone runs
      // down its joint's -y. Taken the way the bone before points, a thumb bent at its last joint to lie along a book's
      // board read 25 mm off it)
      at.push(digit.j[digit.j.length - 1].localToWorld(new THREE.Vector3(0, -digit.len[digit.len.length - 1], 0)));
      const what = `${h ? 'right' : 'left'} ${k === hand.f.length ? 'thumb' : `finger ${k + 1}`}`;
      at.forEach((p, i) => points.push({ at: p, r: digit.r, what: i === at.length - 1 ? `${what}'s tip` : `${what}'s knuckle ${i + 1}` }));
    }
  });
  return points;
}

/** His sleeves' points (world): every few of each sleeve's mesh's points. */
function sleevePoints(s: Scholar): { at: THREE.Vector3; r: number; what: string }[] {
  const points: { at: THREE.Vector3; r: number; what: string }[] = [];
  s.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || !SLEEVES.test(m.name)) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) points.push({ at: new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld), r: 0, what: m.name.replace('scholar ', 'his ') });
  });
  return points;
}

/** How far his fingers and his sleeves go into `book`'s solids now (m), and what of each went deepest. */
export function intoBook(s: Scholar, book: THREE.Object3D): { fingers: number; sleeves: number; fat: string; sat: string } {
  s.root.updateMatrixWorld(true);
  book.updateMatrixWorld(true);
  const solids = solidsOf(book).map((solid) => {
    const scale = new THREE.Vector3();
    solid.mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    return { ...solid, inverse: solid.mesh.matrixWorld.clone().invert(), scale };
  });
  const local = new THREE.Vector3();
  const deepest = (points: { at: THREE.Vector3; r: number; what: string }[]) => {
    let into = 0, at = '';
    for (const p of points) for (const solid of solids) {
      const d = solid.depth(local.copy(p.at).applyMatrix4(solid.inverse), solid.scale) + p.r;
      if (d > into) { into = d; at = `${p.what} in the ${solid.mesh.name.replace('open book ', '')}`; }
    }
    return { into, at };
  };
  const f = deepest(fingerPoints(s)), sl = deepest(sleevePoints(s));
  return { fingers: f.into, sleeves: sl.into, fat: f.at, sat: sl.at };
}

/** The book he reads now: the open one in his hands while it's shown, else the one on his table. */
export function bookRead(s: Scholar, standing: boolean): THREE.Object3D | null {
  if (!standing) return s.book.blocks[0]?.parent ?? null;
  const open = G.scene.getObjectByName('library open held book');
  return open?.visible ? open : null;
}

/** how far toward the spine his right palm must be as he grips a shut book (a share of its depth from its middle: 1 at
 *  its spine, -1 at its fore-edge), and how far a finger may go into it (m). From play: "have him grab from other side of
 *  book": his hand round its fore-edge's bottom corner, its pages to him */
export const GRAB = { spine: 0.4, into: 0.003 };

/** His right hand on the shut book `held` (a unit box scaled to its size: thick x, tall y, deep z, its spine +z): how
 *  near its spine his palm is (`GRAB.spine`'s share), and how far his fingers go into it (m) and which. */
export function grabRead(s: Scholar, held: THREE.Object3D): { side: number; into: number; at: string } {
  s.root.updateMatrixWorld(true);
  held.updateMatrixWorld(true);
  const inverse = held.matrixWorld.clone().invert(), scale = new THREE.Vector3();
  held.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  const hand = s.hands[1];
  // (his palm: a little down from his wrist, among his fingers' first knuckles)
  const palm = hand.f.reduce((sum, d) => sum.add(d.j[0].getWorldPosition(new THREE.Vector3())), new THREE.Vector3()).divideScalar(hand.f.length);
  const side = palm.clone().applyMatrix4(inverse).z / 0.5;
  let into = 0, at = '';
  const min = new THREE.Vector3(-0.5, -0.5, -0.5), max = new THREE.Vector3(0.5, 0.5, 0.5);
  for (const p of fingerPoints(s)) {
    if (!p.what.startsWith('right')) continue;
    const d = boxDepth(p.at.clone().applyMatrix4(inverse), min, max, scale) + p.r;
    if (d > into) { into = d; at = p.what; }
  }
  return { side, into, at };
}

/** how far each pad of the hand holding a shut book may be off its surface or into it (m): his thumb's and his
 *  fingers' tips on its boards, from the moment his pinch closes to his letting go */
export const PADS_MOST = 0.002;

/** His right hand's pads on the shut book `held` (a unit box scaled to its size): the furthest of his fingertips and his
 *  thumb's tip off its surface or into it (m, its pad's round taken off), and which. */
export function padsRead(s: Scholar, held: THREE.Object3D): { off: number; at: string } {
  s.root.updateMatrixWorld(true);
  held.updateMatrixWorld(true);
  const inverse = held.matrixWorld.clone().invert(), scale = new THREE.Vector3();
  held.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  const min = new THREE.Vector3(-0.5, -0.5, -0.5), max = new THREE.Vector3(0.5, 0.5, 0.5);
  let off = 0, at = '';
  for (const p of fingerPoints(s)) {
    if (!p.what.startsWith('right') || !p.what.endsWith("'s tip")) continue;
    // (its pad off the surface: out of the book its distance to it, in it its depth, less its round)
    const gap = Math.abs(-boxDepth(p.at.clone().applyMatrix4(inverse), min, max, scale) - p.r);
    if (gap > off) { off = gap; at = p.what.replace("'s tip", "'s pad"); }
  }
  return { off, at };
}

/** how squarely an open book's pages read to him (cosines, at least): each page's top away from his chest (along his
 *  forward: a page held up before him tilts its top up and away, one on his table lies with it away) and its lines
 *  running left to right to his eyes (along his right). From play: "Fix upside down book": he read it upside down. */
export const PAGE_FACING = { away: 0.2, right: 0.5 };

/** An open book's printed pages (the meshes laid on its halves' tops). */
export function printsOf(book: THREE.Object3D): THREE.Mesh[] {
  const prints: THREE.Mesh[] = [];
  book.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.parent?.name === 'open book half' && m.name !== 'open book half') prints.push(m);
  });
  return prints;
}

/** How each printed page reads to him: the least, over `prints`, of its top's way (its texture's top, as the page is
 *  printed: v up) along his forward and its lines' way (u) along his right. */
export function pageFacing(s: Scholar, prints: THREE.Mesh[]): { away: number; right: number } {
  s.root.updateMatrixWorld(true);
  const turn = s.root.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(turn), right = new THREE.Vector3(-1, 0, 0).applyQuaternion(turn);
  let away = Infinity, rightward = Infinity;
  for (const print of prints) {
    print.updateMatrixWorld(true);
    const pos = print.geometry.attributes.position, uv = print.geometry.attributes.uv;
    // (the middle of its points at each end of its texture, each way: its top less its foot, its lines' ends less their starts)
    const ends = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], counts = [0, 0, 0, 0];
    const at = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      at.fromBufferAttribute(pos, i).applyMatrix4(print.matrixWorld);
      const u = uv.getX(i), v = uv.getY(i);
      if (v > 0.75) { ends[0].add(at); counts[0]++; } else if (v < 0.25) { ends[1].add(at); counts[1]++; }
      if (u > 0.75) { ends[2].add(at); counts[2]++; } else if (u < 0.25) { ends[3].add(at); counts[3]++; }
    }
    if (counts.some((c) => !c)) continue;
    ends.forEach((e, i) => e.divideScalar(counts[i]));
    away = Math.min(away, ends[0].sub(ends[1]).normalize().dot(forward));
    rightward = Math.min(rightward, ends[2].sub(ends[3]).normalize().dot(right));
  }
  return { away, right: rightward };
}

/** `book` turned half round about its pages' facing for a moment, as `read` reads it (a canary: read upside down). */
export function turnedRound<T>(book: THREE.Object3D, read: () => T): T {
  const was = book.quaternion.clone();
  book.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  book.updateMatrixWorld(true);
  try { return read(); } finally { book.quaternion.copy(was); book.updateMatrixWorld(true); }
}
