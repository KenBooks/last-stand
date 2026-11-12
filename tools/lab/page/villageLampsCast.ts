// `lab village`'s lamps lit as they cast: the hero walked from street lamp to street lamp at midnight, and at each
// stop every lamp read round its foot from over it, lit and put out (its entry in the lit shaders' list and any
// casting light at it): it must add a good share of the light there, whether a casting light holds it or the list
// alone lights it. From play, "why this light is off": the lamp beside the hero lit nothing round it, its lantern
// burning. He walks there of himself, the casting lights handed over as a player's walk hands them, and is read as he
// arrives. `canary` puts each lamp out for both its readings at the last stop, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { lampShadowLights } from '../../../src/world/props';
import { goTo } from '../../../src/game/village';
import { drawFrame, topLight, type Canvas } from './light';
import type { LightsChecked } from './villageLights';

/** how far off a lamp the hero stops (m), the most frames he's given to walk there, and the frames after he
 *  stops before the reading (short of the casting lights' fade: what a player sees as he arrives) */
const STOP_OFF = 2.5;
const WALK_MOST = 1500;
const ARRIVED = 20;
/** the ground read round a lamp: how far from its foot, how many patches round it, how wide each is (m), and the
 *  camera's height over the lamp */
const ROUND = 1.6;
const PATCHES = 8;
const PATCH = 0.4;
const OVER = 9;
/** the least share of the light round its foot a lit lamp must give (the median of its patches) */
const LEAST_GIVEN = 0.3;
/** how near a casting light must be to a lantern to be its (m) */
const AT_LAMP = 0.05;

/** The mean light of the ground `PATCH` m square round `at`, in the frame drawn. */
function lightAt(canvas: Canvas, at: THREE.Vector3): number {
  const middle = at.clone().project(G.camera);
  const side = at.clone().add(new THREE.Vector3(PATCH / 2, 0, 0)).project(G.camera);
  const x = ((middle.x + 1) / 2) * canvas.width;
  const y = ((middle.y + 1) / 2) * canvas.height;
  const half = Math.max(2, Math.abs(((side.x - middle.x) / 2) * canvas.width));
  let sum = 0;
  let count = 0;
  for (let py = Math.floor(y - half); py <= y + half; py++) {
    for (let px = Math.floor(x - half); px <= x + half; px++) {
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      sum += topLight(canvas, (py * canvas.width + px) * 4);
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** The patches of ground round `lamp`'s foot. */
function patchesRound(lamp: THREE.Vector3): THREE.Vector3[] {
  return Array.from({ length: PATCHES }, (_, k) => {
    const a = (k / PATCHES) * Math.PI * 2;
    const at = new THREE.Vector3(lamp.x + Math.sin(a) * ROUND, 0, lamp.z + Math.cos(a) * ROUND);
    at.y = groundHeight(at.x, at.z);
    return at;
  });
}

/** Each patch's light round `lamp`, the frame drawn from over its foot, the game's camera given back after. */
function readRound(lab: Lab, lamp: THREE.Vector3): number[] {
  const camera = G.camera;
  const kept = { at: camera.position.clone(), turn: camera.quaternion.clone() };
  const foot = new THREE.Vector3(lamp.x, groundHeight(lamp.x, lamp.z), lamp.z);
  camera.position.set(foot.x + 0.01, foot.y + OVER, foot.z);
  camera.lookAt(foot);
  camera.updateMatrixWorld();
  try {
    const canvas = drawFrame(lab);
    return patchesRound(lamp).map((at) => lightAt(canvas, at));
  } finally {
    camera.position.copy(kept.at);
    camera.quaternion.copy(kept.turn);
    camera.updateMatrixWorld();
  }
}

/** The lit shaders' list (`core/lamps.ts`), reached through three's own uniforms it's shared from. */
function lampList(): Float32Array {
  const list = THREE.ShaderLib.standard.uniforms.lamps?.value as Float32Array | undefined;
  if (!list) throw new Error('lab: village: no lamps\' list in this tree');
  return list;
}

/** Lamp `index` put out (its list entry and the casting lights at it) until the returned function lights it again;
 *  nothing runs a frame meanwhile, so the game doesn't light it again itself. */
function putOut(index: number): () => void {
  const list = lampList();
  const side = (2 + index * 2) * 4 + 3;
  const wasSide = list[side];
  const lamp = G.arena.village.lanterns[index];
  const atLamp = [...lampShadowLights()].filter((light) => light.position.distanceTo(lamp) < AT_LAMP);
  const was = atLamp.map((light) => light.intensity);
  list[side] = 0;
  for (const light of atLamp) light.intensity = 0;
  return () => {
    list[side] = wasSide;
    atLamp.forEach((light, k) => {
      light.intensity = was[k];
    });
  };
}

/** The share of the light round lamp `index`'s foot it gives: the median over the patches, lit against put out. */
function givenRound(lab: Lab, index: number, canary: boolean): number {
  const lamp = G.arena.village.lanterns[index];
  const relight = canary ? putOut(index) : null;
  const lit = readRound(lab, lamp);
  relight?.();
  const relightAgain = putOut(index);
  const out = readRound(lab, lamp);
  relightAgain();
  const given = lit.map((light, k) => 1 - out[k] / Math.max(light, 1e-3)).sort((a, b) => a - b);
  return given[Math.floor(given.length / 2)];
}

/** The hero walked of himself to `STOP_OFF` m off lamp `index`, toward the square, and stopped there: the casting
 *  lights handed from lamp to lamp as a player walks, not set down by them. */
async function walkBy(lab: Lab, index: number): Promise<void> {
  const lamp = G.arena.village.lanterns[index];
  const toSquare = new THREE.Vector3(-lamp.x, 0, -lamp.z).normalize();
  const x = lamp.x + toSquare.x * STOP_OFF;
  const z = lamp.z + toSquare.z * STOP_OFF;
  goTo(x, z);
  const there = (): boolean => Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 0.6;
  await lab.until(there, WALK_MOST, `the hero never walked to lamp ${index}`);
  G.player.walkTo = null;
  await lab.step(ARRIVED);
}

/** Every lamp lighting the ground round its foot, the hero walked to each in turn at midnight. */
export async function lampsLitAsTheyCast(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(0);
  const lanterns = G.arena.village.lanterns;
  const dark: string[] = [];
  let read = 0;
  let least = 1;
  try {
    for (let index = 0; index < lanterns.length; index++) {
      await walkBy(lab, index);
      for (let lamp = 0; lamp < lanterns.length; lamp++) {
        const given = givenRound(lab, lamp, canary && index === lanterns.length - 1);
        read++;
        least = Math.min(least, given);
        if (given < LEAST_GIVEN) dark.push(`lamp ${lamp} by lamp ${index}: ${(given * 100).toFixed(0)}%`);
      }
    }
    if (!read) throw new Error('lab: village: no street lamp to read');
    const line = `lamps lit as they cast: ${read} readings round a lamp's foot as the hero walked to each `
      + `lamp, the least it gave ${(least * 100).toFixed(0)}% of the light there`
      + (dark.length ? ` (${dark.join(', ')})` : '');
    const found = dark.length > 0;
    const problems = found && !canary ? [`${line}: a lamp lit no ground round it`] : [];
    return { lines: [line], problems, caught: canary ? found : null, moments: [] };
  } finally {
    holdHour(null);
  }
}
