// `lab village`'s lamps alike near and far: the ground round a street lamp at midnight, drawn from one camera over it,
// with the hero far off and then close by. A lamp must look the same whoever stands near it: lit by the pool's lights
// at the three lamps nearest the hero alone and drawn as a painted pool elsewhere, each lamp's ground turned from the
// one to the other as he walked up (from play: "I dont like when lights change from low quality to high quality when
// I come close, it looks lame"). Only its shadow may come in close by: both are read with the point lights' shadows
// held off. `canary` puts the lamp out while he's far off,
// which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, topLight, type Canvas } from './light';
import type { LightsChecked } from './villageLights';

/** how far off the hero stands far and near (m), the frames he's given to settle (and a lamp's shadow to fade in) */
const FAR = 24;
const NEAR = 4.5;
const SETTLE = 150;
/** the camera over the lamp: how high (m) and how far to the side of it */
const OVER = { high: 9, aside: 3 };
/** the ground read round the lamp's foot (m across), and the most its light may differ, near against far */
const READ = 4;
const MOST_APART = 0.08;

/** The hero stood `off` m from (x, z) on open ground; false if no spot round it holds him. */
async function standOff(lab: Lab, x: number, z: number, off: number): Promise<boolean> {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const at = new THREE.Vector3(x + Math.sin(a) * off, 0, z + Math.cos(a) * off);
    at.y = groundHeight(at.x, at.z);
    G.player.walkTo = null;
    G.player.place(at, a + Math.PI);
    await lab.step(SETTLE);
    if (Math.hypot(G.player.pos.x - at.x, G.player.pos.z - at.z) < 0.2) return true;
  }
  return false;
}

/** The mean light of the ground `READ` m across round `foot`, in the frame drawn over it. */
function groundLight(canvas: Canvas, foot: THREE.Vector3): number {
  const middle = foot.clone().project(G.camera);
  const side = foot.clone().add(new THREE.Vector3(READ / 2, 0, 0)).project(G.camera);
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

/** The point lights' shadows held off (each its strength), and a function that gives them back. */
function shadowsOff(): () => void {
  const kept: [THREE.PointLight, number][] = [];
  G.scene.traverse((o) => {
    const light = o as THREE.PointLight;
    if (!light.isPointLight || !light.castShadow) return;
    kept.push([light, light.shadow.intensity]);
    light.shadow.intensity = 0;
  });
  return () => {
    for (const [light, intensity] of kept) light.shadow.intensity = intensity;
  };
}

/** The light round a lamp's foot, the frame drawn from over it, its point lights' shadows held off, and the game's
 *  camera given back after. */
function readOver(lab: Lab, foot: THREE.Vector3): number {
  const camera = G.camera;
  const kept = { at: camera.position.clone(), turn: camera.quaternion.clone() };
  const shadowsBack = shadowsOff();
  camera.position.set(foot.x + OVER.aside, foot.y + OVER.high, foot.z + OVER.aside);
  camera.lookAt(foot);
  camera.updateMatrixWorld();
  try {
    return groundLight(drawFrame(lab), foot);
  } finally {
    shadowsBack();
    camera.position.copy(kept.at);
    camera.quaternion.copy(kept.turn);
    camera.updateMatrixWorld();
  }
}

/** Lamp `index` put out in the lit shaders' list, reached through three's own uniforms it's shared from
 *  (`core/lamps.ts`: imported, a commit without it couldn't load `lab village`); nothing where there's no list. */
function putOut(index: number): void {
  const list = THREE.ShaderLib.standard.uniforms.lamps?.value as Float32Array | undefined;
  // (each lamp two entries after the shelter: its place, then its light, whose fourth is the side it lights, 0 out)
  if (list) list[(2 + index * 2) * 4 + 3] = 0;
}

/** A street lamp's ground at midnight, the hero far off and close by: lit alike. */
export async function lampsAlike(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lanterns = [...G.arena.village.lanterns].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const lamp = lanterns[0];
  const index = G.arena.village.lanterns.indexOf(lamp);
  const foot = new THREE.Vector3(lamp.x, groundHeight(lamp.x, lamp.z), lamp.z);
  holdHour(0);
  const moments: Pictured[] = [];
  try {
    if (!(await standOff(lab, lamp.x, lamp.z, FAR))) throw new Error('lab: village: no open ground far off a lamp');
    if (canary) putOut(index);
    const far = readOver(lab, foot);
    if (!(await standOff(lab, lamp.x, lamp.z, NEAR))) throw new Error('lab: village: no open ground by a lamp');
    const near = readOver(lab, foot);
    const apart = Math.abs(near - far) / Math.max(near, far, 1e-3);
    const line = `lamps alike: the ground round a lamp ${far.toFixed(3)} with the hero ${FAR} m off, `
      + `${near.toFixed(3)} with him ${NEAR} m off, ${(apart * 100).toFixed(1)}% apart`;
    const unlike = apart > MOST_APART;
    const problems = unlike && !canary ? [`${line}: the lamp changes as he comes near`] : [];
    return { lines: [line], problems, caught: canary ? unlike : null, moments };
  } finally {
    holdHour(null);
  }
}
