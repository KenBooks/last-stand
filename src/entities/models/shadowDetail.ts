// A hero's meshes under fewer triangles: for his shadow, and for the frame seen from afar (`farDetail.ts`). A shadow
// map holds his outline alone, softened over a few texels, yet each of its draws sent every triangle of him: 134k a
// map on High, as many as the frame drew of him, and by night three maps (the sun's and two lamps'), whenever he moved
// (from play, the village's frame going from 400k to 900k triangles and back as he stood by the hall; `npm run lab --
// draws --village --moving`). So each geometry's triangles are simplified once (three's meshoptimizer: the vertices
// kept as they are, an index of fewer triangles over them). A hero's take 45 to 55 ms of a desktop's CPU for each use,
// so they're made a few ms a frame (`tickDetail`), every triangle drawn until they're ready. `?shadowDetail=1` casts
// and draws every triangle, for A/B.
import * as THREE from 'three';

/** what a geometry's fewer triangles are for: its shadow, or the frame from afar */
type Use = 'shadow' | 'far';
/** for each use: the share of its triangles a geometry keeps, how far from its surface a kept triangle may lie (m:
 *  as a share of a body's size, the shadow's own caster stood out of the mage's sleeves and staff through the eyes and
 *  shaded them, 23k pixels of the frame, `lab shadows --class mage`), and the same for the grid a piece falls back to */
const DETAIL: Record<Use, { share: number; error: number; sloppy: number }> = {
  shadow: { share: 0.2, error: 0.006, sloppy: 0.012 },
  far: { share: 0.3, error: 0.004, sloppy: 0.008 },
};
/** the fewest triangles worth simplifying, and the most of them a simplified piece may keep to be worth keeping */
const WORTH = 60;
const WORTH_UNDER = 0.8;
/** the time a frame gives to simplifying (ms), and the least between two turns at it (several heroes ask a frame) */
const SLICE_MS = 3;
const TURN_MS = 4;

type Simplifier = typeof import('three/addons/libs/meshopt_simplifier.module.js').MeshoptSimplifier;
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

if (typeof location !== 'undefined') {
  void import('three/addons/libs/meshopt_simplifier.module.js').then(async ({ MeshoptSimplifier }) => {
    await MeshoptSimplifier.ready;
    simplifier = MeshoptSimplifier;
    version++;
  });
}

/** What `coarseIndex` and `farIndex` give now, as a number that changes when it does. */
export const shadowDetailVersion = (): number => version;

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

/** `geometry`'s triangles simplified for `use`, or null where it has too few or gives up too few. */
function simplified(simplify: Simplifier, geometry: THREE.BufferGeometry, use: Use): Uint32Array | null {
  const own = geometry.index;
  const count = own ? own.count : geometry.attributes.position.count;
  if (count < WORTH * 3) return null;
  const detail = DETAIL[use];
  const index = new Uint32Array(count);
  for (let i = 0; i < count; i++) index[i] = own ? own.getX(i) : i;
  const target = Math.max(3, Math.floor((count / 3) * detail.share) * 3);
  const positions = positionsOf(geometry);
  let [fewer] = simplify.simplify(index, positions, 3, target, detail.error, ['ErrorAbsolute']);
  // (a piece of faces that share no vertices, each its own normals', gives up few that way: by a grid of its points
  // then, which keeps its outline and its vertices' normals and nothing of its faces' edges)
  if (fewer.length > target * 1.6) {
    const scale = Math.max(simplify.getScale(positions, 3), 1e-6);
    const [sloppy] = simplify.simplifySloppy(index, positions, 3, null, target, detail.sloppy / scale);
    // (unless it gave up most of the piece: a thin one falls into a cell or two of the grid)
    if (sloppy.length >= target * 0.6) fewer = sloppy;
  }
  return fewer.length <= count * WORTH_UNDER ? fewer.slice() : null;
}

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
 * A frame's turn at the geometries asked for: `SLICE_MS` of them, by the browser's own clock. Once none waits,
 * `shadowDetailVersion` moves on, and what was made of whole geometries meanwhile is made again.
 */
export function tickDetail(): void {
  if (!waiting.length || !simplifier) return;
  const start = performance.now();
  if (start - lastTurn < TURN_MS && start !== lastTurn) return;
  lastTurn = start;
  do {
    const { geometry, use } = waiting.shift()!;
    kept[use].set(geometry, simplified(simplifier, geometry, use));
  } while (waiting.length && performance.now() - start < SLICE_MS);
  if (!waiting.length) version++;
}
