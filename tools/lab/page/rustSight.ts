// `lab rustcheck`'s checks of the fog over what the hero can't see, as the Rust engine draws it (`src/engine/
// sightFog.ts`, Bulwark's watch.rs): what is no surface is gone there. From play: "smoke above campfire should
// disappear instantly once it moves into fog of war".
import * as THREE from 'three';
import type { Clip, Lab } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { SIGHT, seenShareAt } from '../../../src/core/sight';
import { col, particles } from '../../../src/fx/particles';
import { type Checked, changedShare, failed, passed, pixelsIn } from './rustPixels';
import { CAMPFIRE } from '../../../src/data/village';
import { cameraTargetZoom, setZoom } from '../../../src/core/renderer';

/** how far apart the places tried out of sight are (m), and how many are tried for one the camera sees */
const APART = 4;
const TRIES = 8;
const RING = { from: 5, to: 24, step: 0.5, turns: 120, clear: 0.4 };
const GLOW = { up: 2.2, wide: 1.6, count: 12, bright: 8 };
/** where the check stands, off the campfire's middle (m) */
const BY_FIRE = [1.4, -3.4];
/** the camera's zoom from above the check looks from (1.7: the furthest out) */
const ZOOM_OUT = 1.7;
/** the square of the page pictured round the glow (css px), and how far from the screen's edge it must be (a share) */
const CLIP_SIDE = 120;
const EDGE = 0.9;
/** the share of the pixels round a glow that it must change to count as shown */
const SHOWN_SHARE = 0.03;

const ray = new THREE.Raycaster();

/** Whether nothing of the scene's meshes stands between the camera and `place` (a roof over it, a wall before it). */
function clearFromCamera(place: THREE.Vector3): boolean {
  const from = G.camera.getWorldPosition(new THREE.Vector3());
  const toward = place.clone().sub(from);
  const far = toward.length();
  ray.set(from, toward.normalize());
  ray.far = far - GLOW.wide;
  const solid: THREE.Object3D[] = [];
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.particles) solid.push(mesh);
  });
  return ray.intersectObjects(solid, false).length === 0;
}

/** A place round the hero seen by `wanted` of it (0 unseen, 1 seen) and well within the screen, or null. */
function placeSeen(wanted: number, tried: THREE.Vector3[] = []): THREE.Vector3 | null {
  const hero = G.player.pos;
  // (under the engine three draws no scene, and nothing else keeps the camera's inverse for a projection)
  G.camera.updateMatrixWorld();
  G.camera.matrixWorldInverse.copy(G.camera.matrixWorld).invert();
  for (let far = RING.from; far <= RING.to; far += RING.step) {
    for (let turn = 0; turn < RING.turns; turn++) {
      const angle = (turn / RING.turns) * Math.PI * 2;
      const place = new THREE.Vector3(hero.x + Math.cos(angle) * far, hero.y + GLOW.up, hero.z + Math.sin(angle) * far);
      const around = [0, RING.clear, -RING.clear].flatMap((dx) => [0, RING.clear, -RING.clear].map((dz) => seenShareAt(place.x + dx, place.z + dz)));
      if (!around.every((seen) => Math.abs(seen - wanted) < 0.01)) continue;
      const onScreen = place.clone().project(G.camera);
      const within = Math.abs(onScreen.x) < EDGE && Math.abs(onScreen.y) < EDGE && onScreen.z < 1;
      if (within && !tried.some((other) => other.distanceTo(place) < APART)) return place;
    }
  }
  return null;
}

/** The square of the page round a place of the world. */
function clipRound(place: THREE.Vector3): Clip {
  const onScreen = place.clone().project(G.camera);
  const x = (onScreen.x * 0.5 + 0.5) * window.innerWidth;
  const y = (0.5 - onScreen.y * 0.5) * window.innerHeight;
  return { x: x - CLIP_SIDE / 2, y: y - CLIP_SIDE / 2, width: CLIP_SIDE, height: CLIP_SIDE };
}

/** A still, bright cluster of the glow pool's particles hung at `place`. */
function hangGlow(place: THREE.Vector3): void {
  const color = col(0xff40ff, GLOW.bright);
  for (let i = 0; i < GLOW.count; i++) {
    particles.glow.spawn({ x: place.x, y: place.y, z: place.z, life: 1e4, size: GLOW.wide, sizeEnd: GLOW.wide, color, colorEnd: color });
  }
}

/** The share of the pixels round `place` that a glow hung there changes. */
async function glowShows(lab: Lab, place: THREE.Vector3, label: string): Promise<number> {
  const clip = clipRound(place);
  particles.clear();
  await lab.step(2);
  const without = await pixelsIn(lab, clip, `${label}, without a glow`);
  hangGlow(place);
  // (a particle fades in over its first twelfth: a life this long is whole in a few frames' time only by its clock)
  for (let i = 0; i < particles.glow.count; i++) particles.glow.life[i] = particles.glow.maxLife[i] * 0.5;
  await lab.step(2);
  const withIt = await pixelsIn(lab, clip, `${label}, a glow hung there`);
  particles.clear();
  return changedShare(without, withIt);
}

/**
 * In the village, the fog over what he can't see on: a glow hung where he can't see changes nothing of the frame,
 * and one hung where he sees shows. The canaries: the same glow in sight shows, and with the fog off the one out of
 * sight shows too (it is hidden by the fog, not by a wall before the camera).
 */
export async function glowGoneInTheFog(lab: Lab): Promise<Checked> {
  // (by the campfire, the cottages over it: their walls hide the ground behind them)
  const was = { at: G.player.pos.clone(), facing: G.player.facing };
  const zoomWas = cameraTargetZoom();
  G.player.place(new THREE.Vector3(CAMPFIRE[0] + BY_FIRE[0], was.at.y, CAMPFIRE[1] + BY_FIRE[1]), 0);
  // (from further up: the ground the cottages hide is 10 m and more off, past the lobby's own view's edge)
  setZoom(ZOOM_OUT);
  try {
    return await glowAtTheStand(lab);
  } finally {
    setZoom(zoomWas);
    G.player.place(was.at, was.facing);
    await lab.step(30);
  }
}

async function glowAtTheStand(lab: Lab): Promise<Checked> {
  await lab.step(120);
  if (SIGHT.uSightOn.value <= 0) return failed('the fog over what he can\'t see is off where the check stands');
  const seen = placeSeen(1);
  if (!seen) return failed('no place in sight within the screen to hang a glow at');
  const inSight = await glowShows(lab, seen, 'in sight');
  // (a place out of sight that the camera sees: under a roof or a tree's crown a glow is hidden with the fog off too)
  const tried: THREE.Vector3[] = [];
  let fogOff = 0;
  let unseen: THREE.Vector3 | null = null;
  RUST.tune.sightFog = 0;
  try {
    while (tried.length < TRIES && fogOff < SHOWN_SHARE) {
      RUST.tune.sightFog = 1;
      await lab.step(2);
      unseen = placeSeen(0, tried);
      if (!unseen) break;
      tried.push(unseen);
      RUST.tune.sightFog = 0;
      fogOff = await glowShows(lab, unseen, 'out of sight, the fog off');
    }
  } finally {
    RUST.tune.sightFog = 1;
  }
  if (!unseen || fogOff < SHOWN_SHARE) {
    return failed(`the canary: of ${tried.length} places out of sight, none where a glow shows with the fog off`);
  }
  await lab.step(2);
  const inFog = await glowShows(lab, unseen, 'out of sight');
  const said = `a glow in sight changes ${(inSight * 100).toFixed(1)}% of the pixels round it, out of sight `
    + `${(inFog * 100).toFixed(1)}% (with the fog off ${(fogOff * 100).toFixed(1)}%)`;
  if (inSight < SHOWN_SHARE) return failed(`the canary: a glow in sight doesn't show: ${said}`);
  // (the grass in the wind and the frame's grain change a hundredth or two of the pixels between two frames)
  if (inFog > SHOWN_SHARE) return failed(`a glow shows in the fog over what he can't see: ${said}`);
  return passed(said);
}
