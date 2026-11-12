// `lab village --only ghostsOverHim`: the hero behind ghosts lying one over another (a cottage's roof, its gable and
// its walls, seen from above), each keeping less where they overlap, so all of them hide him as one does (the owner's
// choice, "Fewer layers thin less", where they overlap alone; core/ghostLayers.ts).
//
// Stood past each cottage, turned so the camera looks over it at him, a spot is kept where two ghosts or more lie over
// his chest (the count read back: the state checked). How much of him shows there is his own light in the frame (the
// frame with him against it without him, over his pixels) against the same with what thins by blending hidden.
// `--canary`: each ghost keeping as much as it would alone, as it was, which must show less of him.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { faceCamera, setZoom, viewMode } from '../../../src/core/renderer';
import { ghostsAt, holdGhostsUncounted } from '../../../src/core/ghostLayers';
import { GHOST_COUNT, thinsByBlending } from '../../../src/core/seeThrough';
import { holdHour } from '../../../src/game/clock';
import { COTTAGES, type Cottage } from '../../../src/data/village';
import { CAMERA } from '../../../src/data/balance';
import { COTTAGE } from '../../../src/world/villagePlan';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, type Canvas } from './light';
import { hisPixels } from './villageHeroInView';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the hour it's read at, and the frames he's given to settle at a spot */
const HOUR = 12;
const SETTLE = 90;
/** how far past a cottage's wall he stands (m), and the ways the camera may look at him over it, from its facing */
const PAST_WALL = 0.8;
const WAYS = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
/** how high his chest is, where the ghosts over him are counted (m) */
const CHEST = 1.2;
/** the fewest ghosts over his chest for a spot to count, and the fewest spots */
const LEAST_GHOSTS = 2;
const LEAST_SPOTS = 3;
/** the spots pictured, each as it is and as it was */
const PICTURED = 2;
/** the least of him that must show behind them, against his light with what blends hidden: 34% at least, each
 *  ghost keeping as much as alone 27% */
const LEAST_SHOWN = 0.31;

/** A spot he stands at, by a cottage. */
interface GhostSpot {
  x: number;
  z: number;
  facing: number;
  name: string;
}

/** The spots round `c`, each past the middle of one of its walls, turned so the camera looks over the cottage. */
function spotsBy(c: Cottage, index: number): GhostSpot[] {
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const out: [number, number][] = [[0, -halfD - PAST_WALL], [0, halfD + PAST_WALL], [halfW + PAST_WALL, 0],
    [-halfW - PAST_WALL, 0]];
  const spots: GhostSpot[] = [];
  for (const [across, along] of out) {
    for (const way of WAYS) {
      spots.push({
        x: c.x + across * cos + along * sin,
        z: c.z - across * sin + along * cos,
        facing: c.facing + way,
        name: `cottage ${index}`,
      });
    }
  }
  return spots;
}

/** Him stood at `spot`, settled, the view from above at the lobby's zoom. */
async function standAt(lab: Lab, spot: GhostSpot): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(spot.x, groundHeight(spot.x, spot.z), spot.z), spot.facing);
  setZoom(CAMERA.lobbyZoom);
  faceCamera(spot.facing);
  await lab.step(SETTLE);
}

/** The ghosts counted over his chest in the frame just drawn. */
function ghostsOverChest(lab: Lab): number {
  drawFrame(lab);
  const chest = G.player.obj.position.clone();
  chest.y += CHEST;
  const place = chest.project(G.camera);
  const texel = GHOST_COUNT.uGhostTexel.value;
  const column = Math.floor(((place.x + 1) / 2) / texel.x);
  const row = Math.floor(((place.y + 1) / 2) / texel.y);
  return ghostsAt(G.renderer as THREE.WebGLRenderer, column, row);
}

/** His own light over `pixels`: how far the frame with him differs from it without him. */
function hisLight(lab: Lab, pixels: number[]): number {
  const him = drawFrame(lab);
  G.player.obj.visible = false;
  const none = drawFrame(lab);
  G.player.obj.visible = true;
  return differenceOver(him, none, pixels);
}

/** How far two frames differ over `pixels`, summed over their channels. */
function differenceOver(a: Canvas, b: Canvas, pixels: number[]): number {
  let sum = 0;
  for (const at of pixels) {
    for (let channel = 0; channel < 3; channel++) sum += Math.abs(a.pixels[at + channel] - b.pixels[at + channel]);
  }
  return sum;
}

/** The meshes under the village that thin by blending, shown ones alone. */
function blendedGhosts(): THREE.Mesh[] {
  const ghosts: THREE.Mesh[] = [];
  G.arena.groupOf('village').traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material) && thinsByBlending(mesh.material)) ghosts.push(mesh);
  });
  return ghosts;
}

/** How much of him shows at the spot he stands at: his light, against it with what thins by blending hidden. */
function shownOfHim(lab: Lab): number {
  const pixels = hisPixels(lab);
  if (pixels.length < 100) throw new Error("lab: village: the hero isn't in the frame behind a cottage");
  const ghosts = blendedGhosts();
  for (const mesh of ghosts) mesh.visible = false;
  const clear = hisLight(lab, pixels);
  for (const mesh of ghosts) mesh.visible = true;
  return hisLight(lab, pixels) / Math.max(clear, 1e-6);
}

/** He shows behind ghosts lying one over another as behind one. */
export async function ghostsOverHim(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(HOUR);
  const kept = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: LightsChecked['moments'] = [];
  let least = 1;
  let spots = 0;
  holdGhostsUncounted(canary);
  try {
    await viewBy(lab, 'top');
    for (const [index, cottage] of COTTAGES.entries()) {
      for (const spot of spotsBy(cottage, index)) {
        await standAt(lab, spot);
        holdGhostsUncounted(false);
        const ghosts = ghostsOverChest(lab);
        holdGhostsUncounted(canary);
        if (ghosts < LEAST_GHOSTS) continue;
        const shown = shownOfHim(lab);
        least = Math.min(least, shown);
        spots++;
        const line = `behind ${spot.name}, ${ghosts} ghosts over him: ${(shown * 100).toFixed(0)}% of him shows`;
        lines.push(line);
        if (!canary && moments.length < PICTURED * 2) {
          moments.push(await lab.screen(line, []));
          holdGhostsUncounted(true);
          moments.push(await lab.screen(`${spot.name}, each ghost kept as alone, as it was`, []));
          holdGhostsUncounted(false);
        }
        break;
      }
    }
    if (spots < LEAST_SPOTS) throw new Error(`lab: village: only ${spots} spots with ghosts over him`);
    const line = `behind ghosts over one another, the least of him that shows: ${(least * 100).toFixed(0)}% `
      + `(at least ${LEAST_SHOWN * 100}%)`;
    lines.push(line);
    const wrong = least < LEAST_SHOWN;
    if (canary) return { lines, problems: [], caught: wrong, moments: [] };
    if (wrong) problems.push(line);
    return { lines, problems, caught: null, moments };
  } finally {
    holdGhostsUncounted(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
