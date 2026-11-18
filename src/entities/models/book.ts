// An open book's shape, shared by what builds it and what turns its pages: world/houses/library.ts lays the books open on the
// library's tables, the scholar (models/scholar.ts) turns the top page of his, and tools/lab `scholar` reads the turned
// page against it. Each half is a block of pages from its outer edge to the spine, its top curving up from the gutter
// to a crest near it and down to the outer edge, as an open book's pages lie; the two halves meet at the spine, the
// printed page on each covering its block from edge to spine. (Two boxes with a print laid on each stopped short of
// the spine, a plain strip of block and a dark gap between them, and the turned page lifted out of that strip, from
// play: "fill in the pages, they don't reach the edges here. They should reach the middle".)
import * as THREE from 'three';
import { clamp, lerp, smooth } from '../../util';

/** An open book's measures (m), for a book `size` across: each half's width from the spine to its outer edge and its
 *  depth along the spine; its block's height at the outer edge, at the gutter, and how far its crest rises over the
 *  edge; how far over its block's top the print lies. */
export interface BookShape { half: number; depth: number; edge: number; gutter: number; crest: number; printed: number }

export function bookShape(size: number): BookShape {
  return { half: size * 0.49, depth: size * 0.66, edge: 0.016, gutter: 0.005, crest: 0.011, printed: 0.0006 };
}

/** The height of a half's top (m, over the cover) at `t` of the way from the spine (0) to its outer edge (1): down in
 *  the gutter at the spine, up to a crest near it, and falling away to the outer edge. */
export function pageHeight(b: BookShape, t: number): number {
  const crest = b.edge + b.crest * (1 - t) ** 1.3;
  return lerp(b.gutter, crest, smooth(clamp(t / 0.16, 0, 1)));
}

/** columns of a half across it, from the spine to its edge */
const ACROSS = 28;

/** A half's block of pages, in its own frame (x from the spine, 0, to its outer edge; z along the spine, centred; y up
 *  from the cover): its top along `pageHeight`, its outer edge and its two ends of page edges, its foot on the cover. */
export function blockGeometry(b: BookShape): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(b.half, 0);
  for (let i = ACROSS; i >= 0; i--) shape.lineTo((i / ACROSS) * b.half, pageHeight(b, i / ACROSS));
  shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: b.depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -b.depth / 2);
  return g;
}

/** A half's printed page over its block (its frame), from the spine to its edge and along its whole depth; uv's u across
 *  from the spine (0) to the edge (1) and v along the spine from +z (0) to -z (1), for `inkedPage`'s canvas to be laid
 *  on the way each half reads. */
export function printGeometry(b: BookShape): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= ACROSS; i++) {
    const t = i / ACROSS, x = t * b.half, y = pageHeight(b, t) + b.printed;
    for (const [j, z] of [[0, b.depth / 2], [1, -b.depth / 2]] as const) { pos.push(x, y, z); uv.push(t, j); }
  }
  // (wound to face up: across the half, then towards -z)
  for (let i = 0; i < ACROSS; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A page turned over the spine, at `k` of its turn (0 lying on the half it starts on, 1 on the other): where its point
 * `t` of the way from the spine to its edge is, as (across, up) from the spine's foot in the gutter, across towards the
 * half it starts on. Each point keeps its distance from the spine and turns round it from its place on the first half
 * to its place mirrored on the other, so it never passes through either (a point turned further than its place is over
 * its half); the edge leads while it's lifted by the hand and lags as it falls, never past either place. `lift`: how far
 * over the print it lies at rest (m).
 */
export function turnedPage(b: BookShape, k: number, t: number, lift: number, out = new THREE.Vector2()): THREE.Vector2 {
  const x = t * b.half, y = pageHeight(b, t) + b.printed + lift - b.gutter;
  const r = Math.hypot(x, y), rest = Math.atan2(y, x);
  const w = clamp(smooth(k) + 0.18 * Math.sin(2 * Math.PI * k) * t * t, 0, 1);
  const a = rest + (Math.PI - 2 * rest) * w;
  return out.set(r * Math.cos(a), r * Math.sin(a));
}
