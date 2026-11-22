// `lab rustcheck`'s check of the one grass (`src/world/meadowOne.ts`): whatever the camera's height and the
// level's reach, the rings' bands lie edge to edge from the camera's foot to the grass's end, so every blade kept
// is drawn by one ring and no ground is left bare between two. From play: "do not change grass depending on
// viewing angle".
import type * as THREE from 'three';
import { G } from '../../../src/state';
import { ONE_GRASS, oneBand } from '../../../src/world/meadowOne';
import { type Checked, failed, passed } from './rustPixels';

/** the rings, the heights the camera is tried at (m: through the eyes to the furthest zoom out and past it), and
 *  how far apart the blades stand at each level (a level's `grassSpread`) */
const RINGS = 5;
const HEIGHTS = [1.6, 4, 9, 14, 20, 26, 33, 41, 51, 70];
const SPREADS = [1, 2, 4];
/** how far the grass goes on the ground (m), and how far two bands' edges may be apart (m) */
const FAR = 85;
const EDGE = 1e-6;

/** Where the bands of `rings` leave the ground bare or cover it twice, the camera `high` m up at a `spread`. */
function faults(rings: number[], high: number, spread: number): string[] {
  const found: string[] = [];
  let reached = 0;
  for (const k of rings) {
    const band = oneBand(k, high, ONE_GRASS.reach / spread, ONE_GRASS.least / (spread * spread));
    if (band.to <= band.from) continue;
    if (Math.abs(band.from - reached) > EDGE) {
      found.push(`${high} m up at a spread of ${spread}: ring ${k} begins ${band.from.toFixed(2)} m out, the ring `
        + `inside it ends ${reached.toFixed(2)} m out`);
    }
    reached = band.to;
  }
  if (Math.abs(reached - FAR) > EDGE) found.push(`${high} m up at a spread of ${spread}: the grass ends ${reached.toFixed(2)} m out`);
  return found;
}

/**
 * The rings' bands at every height and spread tried lie edge to edge out to the grass's end. The canary: with a
 * ring left out, a height at which that ring draws is found bare.
 */
export function grassBandsEdgeToEdge(): Checked {
  const all = Array.from({ length: RINGS }, (_, k) => k);
  const found = HEIGHTS.flatMap((high) => SPREADS.flatMap((spread) => faults(all, high, spread)));
  const without = all.filter((k) => k !== 2);
  const canary = HEIGHTS.flatMap((high) => faults(without, high, 1));
  if (!canary.length) return failed('the canary: the grass\'s third ring left out, no ground was found bare');
  if (found.length) return failed(`the one grass's rings leave ground bare or cover it twice: ${found.slice(0, 3).join('; ')}`);
  return passed(`the one grass's rings lie edge to edge at ${HEIGHTS.length} heights and ${SPREADS.length} spreads `
    + `(a ring left out: ${canary.length} faults found)`);
}

/** the last of the meadow's meshes' names: the ring of its own from above, which the one grass never draws */
const ABOVE_RING = 'meadow grass 6';

/**
 * Where the check stands in the village: the grass is drawn by its rings, and nothing by the ring of its own from
 * above (another grass, of cells twice as wide: from play, of the zoom out, "I dont like that we change grass to
 * this").
 */
export function grassDrawnByItsRings(): Checked {
  const meadow = G.scene.getObjectByName('meadow');
  if (!meadow) return failed('the village has no meadow to check');
  const blades = (mesh: THREE.Object3D): number => ((mesh as THREE.Mesh).geometry as THREE.InstancedBufferGeometry).instanceCount;
  const drawn = meadow.children.filter((mesh) => blades(mesh) > 0);
  const above = drawn.filter((mesh) => mesh.name.startsWith(ABOVE_RING));
  if (above.length) return failed(`the ring of its own from above draws ${blades(above[0])} blades: another grass than the rings'`);
  if (!drawn.length) return failed('no ring of the grass draws a blade where the check stands');
  const said = drawn.map((mesh) => `${mesh.name.replace('meadow grass ', 'ring ')}: ${blades(mesh)}`).join(', ');
  return passed(`the grass drawn by its rings alone, blades listed: ${said}`);
}
