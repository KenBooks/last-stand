// `lab village --only portalReturn`: the hero back through each portal as the lobby shows him (from play, "this is
// what I saw when lower end player returned to sanctuary": out 3.3 m before the crypt's portal, under its gate and
// between the gap's walls, the view from behind him looked down on dark stone, the top half of the frame black and
// him in a hole cut through it). From the lobby's view over his shoulder, lines from the camera to the ground round
// him: the share met first by something standing over a man's height (an arch, a lintel, a roof). He's stood as
// `enterMenu` in main.ts stands him (the lab's runs begin at no portal, so their end stands him on the square).
// `canary` stands him where the exits were, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { CAMERA } from '../../../src/data/balance';
import { portalPlace } from '../../../src/data/village';
import { faceCamera, setZoom } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { drawnInShadowsOnly } from '../../../src/world/culling';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle (the camera glides round, the see-through eases) */
const SETTLE = 120;
/** how far round him the ground is read (m), and the steps of the grid it's read on (m) */
const ROUND_HIM = 6;
const GRID = 0.5;
/** what stands over this height above the ground under it covers him (m), and the most of the ground it may cover */
const OVER_A_MAN = 2.4;
const MOST_COVERED = 0.1;
/** where the exits were, out of the portal (m): the canary's stand */
const OLD_OUT = 3.3;

/** A share as a whole percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(0)}%`;

/** Whether `object` and everything over it is drawn in the frame, and not the hero's. */
function drawnScenery(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (o === G.player.obj || o === G.arena.village!.meadow) return false;
    if (!o.visible || drawnInShadowsOnly(o as THREE.Mesh)) return false;
  }
  return (object as THREE.Mesh).isMesh === true;
}

/** Whether the line from the camera to the ground at (x, z) first meets something over a man's height. */
function covered(x: number, z: number): boolean {
  const ground = new THREE.Vector3(x, groundHeight(x, z), z);
  const from = G.camera.getWorldPosition(new THREE.Vector3());
  const way = ground.clone().sub(from);
  const far = way.length();
  const ray = new THREE.Raycaster(from, way.normalize(), 0, far - 0.3);
  const hit = ray.intersectObject(G.arena.groupOf('village'), true).find((h) => drawnScenery(h.object));
  if (!hit) return false;
  return hit.point.y - groundHeight(hit.point.x, hit.point.z) > OVER_A_MAN;
}

/** The share of the ground round him that's covered from the camera. */
function coveredShare(): number {
  const { x, z } = G.player.pos;
  let read = 0;
  let hidden = 0;
  for (let dx = -ROUND_HIM; dx <= ROUND_HIM; dx += GRID) {
    for (let dz = -ROUND_HIM; dz <= ROUND_HIM; dz += GRID) {
      if (Math.hypot(dx, dz) > ROUND_HIM) continue;
      read++;
      if (covered(x + dx, z + dz)) hidden++;
    }
  }
  return hidden / read;
}

/** He stood back from `biome`'s portal as the game stands him (`enterMenu` in main.ts), or where the exits were. */
async function standBack(lab: Lab, biome: BiomeId, old: boolean): Promise<void> {
  const exit = G.arena.village!.exits[biome];
  const portal = portalPlace(biome);
  const at = old
    ? new THREE.Vector3(portal.x + Math.sin(portal.facing) * OLD_OUT, 0, portal.z + Math.cos(portal.facing) * OLD_OUT)
    : exit.at.clone();
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, exit.facing);
  faceCamera(exit.facing);
  setZoom(CAMERA.lobbyZoom);
  await lab.step(SETTLE);
}

/** Each portal's return read from the lobby's view. */
export async function portalReturn(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  holdHour(12);
  await viewBy(lab, 'top');
  let caught = false;
  for (const biome of BIOME_IDS) {
    for (const old of canary ? [false, true] : [false]) {
      await standBack(lab, biome, old);
      const share = coveredShare();
      const where = old ? `${biome} (where the exits were)` : biome;
      lines.push(`${where}: ${percent(share)} of the ground round him covered from the camera`);
      if (share <= MOST_COVERED) continue;
      if (old) caught = true;
      else problems.push(`portalReturn: back from the ${biome}, ${percent(share)} of the ground round him covered`);
    }
    if (!canary) moments.push(await lab.screen(`back from the ${biome}`, []));
  }
  return { lines, problems, caught: canary ? caught : null, moments };
}
