// A hero's shadow cast from fewer triangles than he's drawn with. A shadow map holds his outline alone, softened over
// a few texels, yet each of its draws sent every triangle of him: 134k a map on High, as many as the frame drew of him,
// and by night three maps (the sun's and two lamps'), whenever he moved (from play, the village's frame going from
// 400k to 900k triangles and back as he stood by the hall; `npm run lab -- draws --village --moving`). So each
// caster's triangles are simplified once a geometry (three's meshoptimizer: the vertices kept as they are, an index
// of fewer triangles over them), and the shadow map draws those. `?shadowDetail=1` casts every triangle, for A/B.
import * as THREE from 'three';

/** the share of a caster's triangles its shadow keeps, how far from its surface a kept triangle may lie (m: further,
 *  the shadow's own caster stood out of his sleeves and staff through the eyes and shaded them, 23k pixels of the
 *  frame, `lab shadows --class mage`), and the fewest triangles worth simplifying */
const SHARE = 0.2;
const ERROR = 0.006;
const WORTH = 60;
const SLOPPY_ERROR = 0.012;

type Simplifier = typeof import('three/addons/libs/meshopt_simplifier.module.js').MeshoptSimplifier;
/** the simplifier, once it has loaded: null until then, and where the address asks for every triangle */
let simplifier: Simplifier | null = null;
/** whether a harness or the address has every triangle cast, as it was */
let whole = typeof location !== 'undefined' && /[?&]shadowDetail=1/.test(location.search);
/** counts up as what `coarseIndex` gives changes (the simplifier loaded, a harness's hold): a shadow made of the
 *  indices is made again when it has */
let version = 0;
const kept = new WeakMap<THREE.BufferGeometry, Uint32Array | null>();

if (typeof location !== 'undefined') {
  void import('three/addons/libs/meshopt_simplifier.module.js').then(async ({ MeshoptSimplifier }) => {
    await MeshoptSimplifier.ready;
    simplifier = MeshoptSimplifier;
    version++;
  });
}

/** What `coarseIndex` gives now, as a number that changes when it does. */
export const shadowDetailVersion = (): number => version;

/** For a harness (tools/lab): every triangle cast, as it was. */
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

/**
 * The triangles `geometry`'s shadow is cast from, as an index over its own vertices, or null for its own (too few to
 * be worth it, the simplifier not yet loaded, every triangle asked for). Made once a geometry and kept.
 */
export function coarseIndex(geometry: THREE.BufferGeometry): Uint32Array | null {
  if (whole || !simplifier) return null;
  const known = kept.get(geometry);
  if (known !== undefined) return known;
  const own = geometry.index;
  const count = own ? own.count : geometry.attributes.position.count;
  let coarse: Uint32Array | null = null;
  if (count >= WORTH * 3) {
    const index = new Uint32Array(count);
    for (let i = 0; i < count; i++) index[i] = own ? own.getX(i) : i;
    const target = Math.max(3, Math.floor((count / 3) * SHARE) * 3);
    const positions = positionsOf(geometry);
    const scale = Math.max(simplifier.getScale(positions, 3), 1e-6);
    let [simplified] = simplifier.simplify(index, positions, 3, target, ERROR, ['ErrorAbsolute']);
    // (a piece of faces that share no vertices, each its own normals', gives up few that way: by a grid of its points
    // then, which keeps its outline and nothing of its faces' edges, enough for a shadow)
    if (simplified.length > target * 1.6) {
      const [sloppy] = simplifier.simplifySloppy(index, positions, 3, null, target, SLOPPY_ERROR / scale);
      // (unless it gave up most of the piece: a thin one falls into a cell or two of the grid)
      if (sloppy.length >= target * 0.6) simplified = sloppy;
    }
    // (kept only where it's a real saving: a piece of flat faces gives up few)
    if (simplified.length <= count * 0.8) coarse = simplified.slice();
  }
  kept.set(geometry, coarse);
  return coarse;
}
