// `lab village --only cameraStaysInHall`: over the shoulder in the hall with his back to a window, zoomed all the way
// out, the camera stays inside the room. The window's glass is see-through, so the wall left it out, and the camera's
// boom backed out through the window and showed him from outside (from play, "it should not zoom out outside the
// window in 3rd person"). Its glass is in the wall as what's flown into now (`hallSideWall` in world/village.ts).
// `canary` lets the glass out of what the boom meets again: the camera must be read outside.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { faceCamera, setZoom, viewMode } from '../../../src/core/renderer';
import { CAMERA } from '../../../src/data/balance';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import * as world_ from '../../../src/world/village';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** how far in from the window he stands (m), and the frames the camera is given to settle: 4 m in, the boom zoomed
 *  out rises to the window's height as it reaches the wall (nearer, it meets the wall under the window: 1.2 m in,
 *  the canary's camera stood inside with the glass let out) */
const IN_FROM_WINDOW = 4;
const SETTLE = 90;
/** where the east windows' glass stands, in the wall's middle (`hallSideWall` in world/village.ts) */
const GLASS_X = TERRACE.x + (HALL.half + HALL.inHalf) / 2;

/** The hall's windows as this commit has them (an A/B's other side may have none). */
type HallWindows = () => { sill: THREE.Vector3; out: THREE.Vector3; half: number; high: number }[];
const hallWindows = (world_ as { hallWindows?: HallWindows }).hallWindows;

/** A part of the wall, as far as the canary reads it: its name and what it's met by. */
interface WallPart { name: string; use: string }

/** The glass's parts in the wall made foliage (which the camera's cast passes), returning what puts them back. */
function glassLetOut(): () => void {
  const parts = (G.arena.wall as unknown as { parts: WallPart[] }).parts.filter((part) => part.name === 'hallGlass');
  for (const part of parts) part.use = 'foliage';
  return () => {
    for (const part of parts) part.use = 'beyond';
  };
}

/** The camera stays in the hall with his back to a window, zoomed out. */
export async function cameraStaysInHall(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (!hallWindows) {
    return { lines: ['camera in the hall: this commit has no windows'], problems: [], caught: null, moments: [] };
  }
  const east = hallWindows().filter((window) => window.out.x > 0);
  const window = east[Math.floor(east.length / 2)];
  const at = window.sill.clone().addScaledVector(window.out, -IN_FROM_WINDOW - (HALL.half - HALL.inHalf));
  at.y = groundHeight(at.x, at.z);
  const putBack = canary ? glassLetOut() : null;
  const view = viewMode();
  try {
    G.player.walkTo = null;
    // (his back to the window: the camera behind him, toward it)
    const way = Math.atan2(-window.out.x, -window.out.z);
    G.player.place(at, way);
    await viewBy(lab, 'third');
    setZoom(CAMERA.maxZoom);
    faceCamera(way);
    await lab.step(SETTLE);
    const past = G.camera.position.x - GLASS_X;
    const where = past > 0 ? `${past.toFixed(2)} m past` : `${(-past).toFixed(2)} m inside`;
    const line = `camera in the hall, his back to a window zoomed out: ${where} the window's glass`;
    const problems = past > 0 ? [`${line}: it backed out through the window`] : [];
    if (canary) return { lines: [line], problems: [], caught: past > 0, moments: [] };
    return { lines: [line], problems, caught: null, moments: [await lab.screen('camera in the hall', [line])] };
  } finally {
    putBack?.();
    setZoom(CAMERA.lobbyZoom);
    await viewBy(lab, view);
  }
}
