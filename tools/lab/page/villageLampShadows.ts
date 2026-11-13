// `lab village`'s every lamp casting: the ground round each street lamp's foot at midnight, drawn from over it with
// the lamps' shadows as the game draws them and with every lamp's shadows held off (the shadows' map and the casting
// lights'), the hero inside the hall of heroes, so no street lamp holds a casting light: each must shadow a share of
// the ground round it (its own post, what stands by it). From play, "your light test for each light need to test
// SHADOW, it was missing for half of them": lit by the shaders' list alone, every lamp but the two nearest the hero
// lit through all that stood round it. `canary` holds the last lamp's shadows off for both readings, which must be
// found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { lampShadowsOn, setLampShadows } from '../../../src/core/lamps';
import { HALL, TERRACE } from '../../../src/data/village';
import { drawFrame, topLight, type Canvas } from './light';
import type { LightsChecked } from './villageLights';

/** how far round a lamp's foot the ground is read (m), the camera's height over it, and the frames the hero is given
 *  in the hall */
const ROUND = 3.5;
const OVER = 9;
/** how far to the side of a lamp's foot the camera stands (m), from how many sides round it, and how far apart the
 *  ground's points read are (m) */
const ASIDE = 6;
const SIDES = 4;
const GROUND_STEP = 0.05;
const SETTLE = 60;
/** how much darker a pixel must be with the shadows than without to be shadowed, and the least share of the ground
 *  round a lamp that must be */
const DARKER = 0.3;
const LEAST_SHADOWED = 0.01;
/** where in the hall the hero stands: 7 m in from its door */
const IN_HALL = 7;

/** Every lamp's shadows held off (`off`) or as the game has them: the shadows' map and each casting light's. */
function shadowsOff(off: boolean, kept: Map<THREE.PointLight, number>, mapOn: boolean): void {
  setLampShadows(!off && mapOn);
  G.scene.traverse((object) => {
    const light = object as THREE.PointLight;
    if (!light.isPointLight || !light.castShadow) return;
    if (off) {
      if (!kept.has(light)) kept.set(light, light.shadow.intensity);
      light.shadow.intensity = 0;
    } else if (kept.has(light)) {
      light.shadow.intensity = kept.get(light)!;
    }
  });
  if (!off) kept.clear();
}

/** The frame drawn from `OVER` m over `foot` and `ASIDE` m to its side `turn` (radians) and the pixels on the ground
 *  within `ROUND` m of it (found by that camera), the game's camera given back after. Straight over a lamp, the camera
 *  stood nearly where its light does, and saw every shadow hidden behind what cast it. */
function drawnFrom(lab: Lab, foot: THREE.Vector3, turn: number): { canvas: Canvas; pixels: number[] } {
  const camera = G.camera;
  const kept = { at: camera.position.clone(), turn: camera.quaternion.clone() };
  camera.position.set(foot.x + Math.sin(turn) * ASIDE, foot.y + OVER, foot.z + Math.cos(turn) * ASIDE);
  camera.lookAt(foot);
  camera.updateMatrixWorld();
  try {
    const canvas = drawFrame(lab);
    return { canvas, pixels: groundPixels(canvas, foot) };
  } finally {
    camera.position.copy(kept.at);
    camera.quaternion.copy(kept.turn);
    camera.updateMatrixWorld();
  }
}

/** The pixels' indices (their first channel's) where the ground within `ROUND` m of `foot` is drawn, each once. */
function groundPixels(canvas: Canvas, foot: THREE.Vector3): number[] {
  const pixels = new Set<number>();
  const at = new THREE.Vector3();
  for (let x = -ROUND; x <= ROUND; x += GROUND_STEP) {
    for (let z = -ROUND; z <= ROUND; z += GROUND_STEP) {
      if (Math.hypot(x, z) > ROUND) continue;
      at.set(foot.x + x, 0, foot.z + z);
      at.y = groundHeight(at.x, at.z);
      at.project(G.camera);
      const px = Math.floor(((at.x + 1) / 2) * canvas.width);
      const py = Math.floor(((at.y + 1) / 2) * canvas.height);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      pixels.add((py * canvas.width + px) * 4);
    }
  }
  return [...pixels];
}

/** The share of the ground round `foot` the lamps' shadows darken, seen from the side `turn`: drawn with them and
 *  held off (with `canary`, held off for both). */
function shadowedFrom(lab: Lab, foot: THREE.Vector3, turn: number, canary: boolean,
  kept: Map<THREE.PointLight, number>): number {
  const mapOn = lampShadowsOn();
  if (canary) shadowsOff(true, kept, mapOn);
  const shadowed = drawnFrom(lab, foot, turn).canvas;
  shadowsOff(true, kept, mapOn);
  const { canvas: bare, pixels } = drawnFrom(lab, foot, turn);
  shadowsOff(false, kept, mapOn);
  const darker = pixels.filter((at) => topLight(shadowed, at) < topLight(bare, at) * (1 - DARKER));
  return darker.length / Math.max(pixels.length, 1);
}

/** The share of the ground round lamp `index`'s foot its shadows darken, the most seen from any of `SIDES`. */
function shadowedRound(lab: Lab, index: number, canary: boolean, kept: Map<THREE.PointLight, number>): number {
  const lamp = G.arena.village.lanterns[index];
  const foot = new THREE.Vector3(lamp.x, groundHeight(lamp.x, lamp.z), lamp.z);
  const turns = Array.from({ length: SIDES }, (_, k) => (k / SIDES) * Math.PI * 2);
  return Math.max(...turns.map((turn) => shadowedFrom(lab, foot, turn, canary, kept)));
}

/** Every street lamp shadowing the ground round it at midnight, the hero in the hall (none holds a casting light). */
export async function everyLampCasts(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lanterns = G.arena.village.lanterns;
  const kept = new Map<THREE.PointLight, number>();
  holdHour(0);
  const at = new THREE.Vector3(TERRACE.x, 0, HALL.door - IN_HALL);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, 0);
  const shares: number[] = [];
  const mapOn = lampShadowsOn();
  try {
    await lab.step(SETTLE);
    for (let lamp = 0; lamp < lanterns.length; lamp++) {
      shares.push(shadowedRound(lab, lamp, canary && lamp === lanterns.length - 1, kept));
    }
  } finally {
    shadowsOff(false, kept, mapOn);
    holdHour(null);
  }
  const line = `every lamp casting: the share of the ground within ${ROUND} m of each street lamp's foot its shadows `
    + `darken, the hero in the hall: ${shares.map((share, k) => `${k} ${(share * 100).toFixed(1)}%`).join(', ')}`;
  const bare = shares.flatMap((share, k) => (share < LEAST_SHADOWED ? [k] : []));
  if (canary) return { lines: [line], problems: [], caught: bare.includes(lanterns.length - 1), moments: [] };
  const problems = bare.map((k) => `${line}: lamp ${k} casts no shadow`);
  return { lines: [line], problems, caught: null, moments: [] };
}
