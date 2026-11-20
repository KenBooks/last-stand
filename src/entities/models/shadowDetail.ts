// A hero's meshes under fewer triangles: for his shadow, and for the frame seen from afar (`farDetail.ts`). A shadow
// map holds his outline alone, softened over a few texels, yet each of its draws sent every triangle of him: 134k a
// map on High, as many as the frame drew of him, and by night three maps (the sun's and two lamps'), whenever he moved
// (from play, the village's frame going from 400k to 900k triangles and back as he stood by the hall; `npm run lab --
// draws --village --moving`). So each geometry's triangles are simplified once (three's meshoptimizer: the vertices
// kept as they are, an index of fewer triangles over them). A hero's take 45 to 55 ms of a desktop's CPU for each use,
// so they're made in a worker (`simplify.worker.ts`), every triangle drawn until they're ready: made a few ms a frame on
// the page, a piece's one call (up to 15 ms, the hair's) held the lobby's first frames 12 to 16 ms (`npm run lab --
// lobbystart`). A harness has them made on the page, a frame's slice at a time, which its fixed clock steps the same
// on every run (`detailWork`). `?shadowDetail=1` casts and draws every triangle, for A/B.
import * as THREE from 'three';
import { perfClock } from '../../core/perfClock.ts';
import { simplifiedIndex, type Detail, type Simplifier } from './simplifyIndex.ts';
import type { SimplifyAsked, SimplifyMade } from './simplify.worker.ts';

/** what a geometry's fewer triangles are for: its shadow, or the frame from afar */
type Use = 'shadow' | 'far';
/** for each use: the share of its triangles a geometry keeps, how far from its surface a kept triangle may lie (m:
 *  as a share of a body's size, the shadow's own caster stood out of the mage's sleeves and staff through the eyes and
 *  shaded them, 23k pixels of the frame, `lab shadows --class mage`), and the same for the grid a piece falls back to */
const DETAIL: Record<Use, Detail> = {
  shadow: { share: 0.2, error: 0.006, sloppy: 0.012 },
  far: { share: 0.3, error: 0.004, sloppy: 0.008 },
};
/** the fewest triangles worth simplifying */
const WORTH = 60;
/** the time a frame gives to simplifying on the page, or to handing it to the worker (ms), and the least between two
 *  turns at it (several heroes ask a frame) */
const SLICE_MS = 3;
const TURN_MS = 4;

/** Where the fewer triangles are made: in the worker (`inWorker`, the game's), or on the page a frame's slice at a time
 *  (a harness's, as its fixed clock steps them the same on every run; and the game's if the worker fails). */
export const detailWork = { inWorker: typeof Worker !== 'undefined' };
/** the simplifier, once it has loaded: null until then */
let simplifier: Simplifier | null = null;
/** whether a harness or the address has every triangle cast and drawn, as it was */
let whole = typeof location !== 'undefined' && /[?&]shadowDetail=1/.test(location.search);
/** counts up as what `coarseIndex` and `farIndex` give changes (the geometries asked for are ready, a harness's hold):
 *  what's made of the indices is made again when it has */
let version = 0;
const kept: Record<Use, WeakMap<THREE.BufferGeometry, Uint32Array | null>> = { shadow: new WeakMap(), far: new WeakMap() };
/** the geometries asked for and not yet simplified, in the order asked */
const waiting: { geometry: THREE.BufferGeometry; use: Use }[] = [];
const asked: Record<Use, WeakSet<THREE.BufferGeometry>> = { shadow: new WeakSet(), far: new WeakSet() };
let lastTurn = -Infinity;
/** what the worker is making, by the id it was sent with */
const sent = new Map<number, { geometry: THREE.BufferGeometry; use: Use }>();
let lastId = 0;
let worker: Worker | null = null;

if (typeof location !== 'undefined') {
  void import('three/addons/libs/meshopt_simplifier.module.js').then(async ({ MeshoptSimplifier }) => {
    await MeshoptSimplifier.ready;
    simplifier = MeshoptSimplifier;
    version++;
  });
}

/** What `coarseIndex` and `farIndex` give now, as a number that changes when it does. */
export const shadowDetailVersion = (): number => version;

/**
 * Whether what `coarseIndex` (`use` 'shadow') or `farIndex` ('far') gives for `geometry` is settled: made (fewer
 * triangles, or none worth it), or every triangle held whole. A hero made again of his indices at each
 * `shadowDetailVersion` asks it, and once all his are settled leaves the version be: it moves on as any hero's are made,
 * and every hero built behind the lobby had each one already built merge his shadow again, 14 ms a frame
 * (`npm run lab -- lobbystart`).
 */
export const detailSettled = (geometry: THREE.BufferGeometry, use: Use): boolean =>
  whole || (simplifier !== null && kept[use].has(geometry));

/** Whether every triangle is cast and drawn (`holdShadowsWhole`, `?shadowDetail=1`). */
export const shadowsWhole = (): boolean => whole;

/** For a harness (tools/lab): every triangle cast and drawn, as it was. */
export function holdShadowsWhole(held: boolean): void {
  if (whole === held) return;
  whole = held;
  version++;
}

/** `geometry`'s positions as floats, three to a vertex (an interleaved or a normalized attribute read out). */
function positionsOf(geometry: THREE.BufferGeometry): Float32Array {
  const position = geometry.attributes.position;
  const plain = position instanceof THREE.BufferAttribute && position.array instanceof Float32Array
    && position.itemSize === 3;
  if (plain) return position.array as Float32Array;
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  return positions;
}

/** `geometry`'s index as its own list of corners (one made of its vertices in order where it has none), or null where
 *  it has too few triangles to be worth simplifying. */
function indexOf(geometry: THREE.BufferGeometry): Uint32Array | null {
  const own = geometry.index;
  const count = own ? own.count : geometry.attributes.position.count;
  if (count < WORTH * 3) return null;
  const index = new Uint32Array(count);
  for (let i = 0; i < count; i++) index[i] = own ? own.getX(i) : i;
  return index;
}

/** `geometry`'s triangles simplified for `use` on the page, or null where it has too few or gives up too few. */
function simplified(simplify: Simplifier, geometry: THREE.BufferGeometry, use: Use): Uint32Array | null {
  const index = indexOf(geometry);
  return index && simplifiedIndex(simplify, index, positionsOf(geometry), DETAIL[use]);
}

/** The worker, started once: a reply kept as its geometry's fewer triangles; one that fails hands what it was making
 *  back to the page. */
function theWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./simplify.worker.ts', import.meta.url), { type: 'module', name: 'simplify' });
  } catch {
    detailWork.inWorker = false;
    return null;
  }
  worker.onmessage = (event: MessageEvent<SimplifyMade>) => {
    const asked = sent.get(event.data.id);
    if (!asked) return;
    sent.delete(event.data.id);
    kept[asked.use].set(asked.geometry, event.data.fewer);
    if (!sent.size && !waiting.length) version++;
  };
  worker.onerror = () => {
    detailWork.inWorker = false;
    waiting.unshift(...sent.values());
    sent.clear();
  };
  return worker;
}

/** `geometry` sent to the worker to simplify for `use` (copies of its index and positions, handed over), or kept as
 *  having none worth making. */
function sendOff(to: Worker, geometry: THREE.BufferGeometry, use: Use): void {
  const index = indexOf(geometry);
  if (!index) {
    kept[use].set(geometry, null);
    return;
  }
  const positions = positionsOf(geometry).slice();
  const id = ++lastId;
  sent.set(id, { geometry, use });
  const message: SimplifyAsked = { id, index, positions, detail: DETAIL[use] };
  to.postMessage(message, [index.buffer, positions.buffer]);
}

/** For a harness (tools/lab): the fewer triangles made on the page from now on, what the worker was making asked for
 *  again there (its late replies passed over), so a run steps the same work on its fixed clock every time; `false`
 *  hands them to the worker again (`lab lobbystart`, which times what a player's page does). */
export function detailOnPage(onPage: boolean): void {
  detailWork.inWorker = !onPage && typeof Worker !== 'undefined';
  if (!onPage) return;
  waiting.unshift(...sent.values());
  sent.clear();
}

/** Whether fewer triangles are still being made (asked for and not yet come). */
export const detailPending = (): boolean => waiting.length > 0 || sent.size > 0;

/** `geometry`'s fewer triangles for `use` if they're made, or null for its own, asked for then. */
function indexFor(geometry: THREE.BufferGeometry, use: Use): Uint32Array | null {
  if (whole || !simplifier) return null;
  const known = kept[use].get(geometry);
  if (known !== undefined) return known;
  if (!asked[use].has(geometry)) {
    asked[use].add(geometry);
    waiting.push({ geometry, use });
  }
  return null;
}

/**
 * The triangles `geometry`'s shadow is cast from, as an index over its own vertices, or null for its own (too few to
 * be worth it, not made yet, every triangle asked for).
 */
export const coarseIndex = (geometry: THREE.BufferGeometry): Uint32Array | null => indexFor(geometry, 'shadow');

/** The triangles `geometry` is drawn from seen from afar (`farDetail.ts`), as `coarseIndex` gives a shadow's. */
export const farIndex = (geometry: THREE.BufferGeometry): Uint32Array | null => indexFor(geometry, 'far');

/**
 * A frame's turn at the geometries asked for: `SLICE_MS` of them sent to the worker, or made on the page
 * (`detailWork`), by `perfClock` (the lab's page clock stands still within a frame, and there a frame does all that's
 * asked: a harness timing the frames puts the browser's in its place, `lab lobbystart`). Once none waits or is being
 * made, `shadowDetailVersion` moves on, and what was made of whole geometries meanwhile is made again.
 */
export function tickDetail(): void {
  if (!waiting.length || !simplifier) return;
  const start = perfClock.now();
  if (start - lastTurn < TURN_MS && start !== lastTurn) return;
  lastTurn = start;
  const to = detailWork.inWorker ? theWorker() : null;
  do {
    const { geometry, use } = waiting.shift()!;
    if (to) sendOff(to, geometry, use);
    else kept[use].set(geometry, simplified(simplifier, geometry, use));
  } while (waiting.length && perfClock.now() - start < SLICE_MS);
  if (!waiting.length && !sent.size) version++;
}
