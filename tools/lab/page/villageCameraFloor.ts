// `lab village --only cameraOverFloors`: third-person camera over elevated floors (terrace, portico, stairs, dais).
// Standing on the terrace stairs and pitching up or level in third person previously clamped only to the hero's lower
// step height (`floor + 0.4`), sinking the camera underneath the 1.6 m terrace/portico floor or behind its lip and
// cutting him off. Checks every stair/facing/pitch/boom combination plus the hall dais edge so the camera stays clear
// above any floor under it and along its boom, stays steady over real frames, and keeps his head whole in frame.
// `--canary` ignores elevated floors (`holdCameraFloorHeroOnly`) and verifies both under-floor and lip-blocked spots fail.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, holdCameraFloorHeroOnly, lookBy, updateCamera, zoomBy } from '../../../src/core/renderer';
import { CAMERA } from '../../../src/data/balance';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

const STAIR_X_OFF = [-1.8, 0, 1.8];
const STAIR_Z_OFF = [0.6, 1.4, 2.2, 3.0];
const FACINGS = [0, -0.7, 0.7, 0.95];
const PITCHES = [CAMERA.third.minPitch, -0.25, -0.1, 0, CAMERA.third.pitch];
const BOOMS = [CAMERA.third.boom, CAMERA.third.minBoom];
const DAIS_Z_OFF = [0.6, 1.4];

const SETTLES = 2;
const SETTLE_FRAMES = 60;
const WATCH_FRAMES = 20;
const LEAST_CLEAR = 0.35;
const RAY_STEP = 0.15;
const RAY_SLACK = 0.05;
const MOST_A_FRAME = 0.02;
const BODY_CHEST = 0.7;

const SAMPLES: readonly { label: string; x: number; z: number; facing: number; down: number }[] = [
  { label: 'stairs center pitching up', x: TERRACE.x, z: -9.8, facing: 0, down: -0.35 },
  { label: 'lower stairs level pitch', x: TERRACE.x, z: -9.2, facing: 0, down: -0.15 },
  { label: 'east stairs angled toward portico', x: 0.3, z: -9.6, facing: 0.75, down: -0.35 },
];

interface FloorSweep {
  spots: number;
  underFloor: number;
  blocked: number;
  worstClear: number;
  worstAt: string;
}

/** Pitch the third-person camera to `down` rad below the horizon. */
function lookDown(down: number): void {
  const { minPitch, maxPitch } = CAMERA.third;
  lookBy(0, -(maxPitch - minPitch) / CAMERA.lookSpeed);
  lookBy(0, (down - minPitch) / CAMERA.lookSpeed);
}

/** Set the third-person boom distance to `length` m. */
function boomTo(length: number): void {
  zoomBy(-1000);
  zoomBy(Math.log(length / CAMERA.third.minBoom) / Math.log(CAMERA.zoomStep));
}

/** Place hero at `(x, z)`, aim camera `(facing, down, boom)`, and step `updateCamera` to equilibrium. */
function settleSpot(x: number, z: number, facing: number, down: number, boom: number): void {
  const y = groundHeight(x, z);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, y, z), facing);
  faceCamera(facing);
  lookDown(down);
  boomTo(boom);
  for (let i = 0; i < SETTLES; i++) updateCamera(1, G.player.pos, G.player.model.height, y);
}

/** Whether `chest -> cam` dips below any floor height along the sightline. */
function lineBlockedByFloor(x: number, chestY: number, z: number, cam: THREE.Vector3): boolean {
  const dist = Math.hypot(cam.x - x, cam.y - chestY, cam.z - z);
  const steps = Math.max(1, Math.ceil(dist / RAY_STEP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x + (cam.x - x) * t;
    const py = chestY + (cam.y - chestY) * t;
    const pz = z + (cam.z - z) * t;
    if (py < groundHeight(px, pz) - RAY_SLACK) return true;
  }
  return false;
}

/** Record one spot into `read`. */
function recordSpot(read: FloorSweep, x: number, z: number, label: string): void {
  read.spots++;
  const cam = G.camera.position;
  const heroFloor = G.player.obj.position.y;
  const camFloor = groundHeight(cam.x, cam.z);
  const clear = cam.y - camFloor;
  if (clear < read.worstClear) {
    read.worstClear = clear;
    read.worstAt = label;
  }
  if (clear < LEAST_CLEAR) read.underFloor++;
  if (lineBlockedByFloor(x, heroFloor + G.player.model.height * BODY_CHEST, z, cam)) read.blocked++;
}

/** Sweep terrace stairs and hall dais stands across facings, pitches, and booms. */
function runSweep(): FloorSweep {
  const read: FloorSweep = { spots: 0, underFloor: 0, blocked: 0, worstClear: Infinity, worstAt: '' };
  for (const xOff of STAIR_X_OFF) {
    for (const zOff of STAIR_Z_OFF) {
      const x = TERRACE.x + xOff;
      const z = TERRACE.front + zOff;
      for (const facing of FACINGS) {
        for (const down of PITCHES) {
          for (const boom of BOOMS) {
            settleSpot(x, z, facing, down, boom);
            recordSpot(read, x, z, `(${x.toFixed(1)}, ${z.toFixed(1)}) facing ${facing.toFixed(2)} down ${down.toFixed(2)}`);
          }
        }
      }
    }
  }
  for (const zOff of DAIS_Z_OFF) {
    const x = TERRACE.x;
    const z = HALL.daisZ + zOff;
    settleSpot(x, z, 0, CAMERA.third.minPitch, CAMERA.third.boom);
    recordSpot(read, x, z, `dais (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
  return read;
}

/** Third-person camera stays above elevated floors (terrace, portico, stairs, dais) from lower steps. */
export async function cameraOverFloors(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, 'third');
  holdCameraFloorHeroOnly(canary);
  try {
    const read = runSweep();
    const lines: string[] = [
      `${read.spots} spots on stairs & dais: under floor ${read.underFloor}, blocked by floor ${read.blocked}, `
        + `least clear ${read.worstClear.toFixed(2)} m (at ${read.worstAt})`,
    ];
    const problems: string[] = [];
    const moments: Pictured[] = [];
    if (!canary && (read.underFloor > 0 || read.blocked > 0)) problems.push(lines[0]);
    if (!canary) {
      for (const sample of SAMPLES) {
        const y = groundHeight(sample.x, sample.z);
        G.player.walkTo = null;
        G.player.place(new THREE.Vector3(sample.x, y, sample.z), sample.facing);
        faceCamera(sample.facing);
        lookDown(sample.down);
        boomTo(CAMERA.third.boom);
        await lab.step(SETTLE_FRAMES);
        const last = G.camera.position.clone();
        let moved = 0;
        await lab.step(WATCH_FRAMES, undefined, () => {
          moved = Math.max(moved, G.camera.position.distanceTo(last));
          last.copy(G.camera.position);
        });
        const cam = G.camera.position;
        const clear = cam.y - groundHeight(cam.x, cam.z);
        const head = new THREE.Vector3(sample.x, y + G.player.model.height, sample.z).project(G.camera);
        const inFrame = Math.abs(head.x) <= 1 && Math.abs(head.y) <= 1;
        const msg = `${sample.label}: clear ${clear.toFixed(2)} m, moved ${moved.toFixed(3)} m, crown ${inFrame ? 'in' : 'out'}`;
        lines.push(msg);
        if (clear < LEAST_CLEAR || moved > MOST_A_FRAME || !inFrame) problems.push(msg);
        moments.push(await lab.screen(sample.label, [`clear ${clear.toFixed(2)} m`]));
      }
    }
    if (canary) return { lines, problems: [], caught: read.underFloor > 0 && read.blocked > 0, moments: [] };
    return { lines, problems, caught: null, moments };
  } finally {
    holdCameraFloorHeroOnly(false);
    boomTo(CAMERA.third.boom);
    lookDown(CAMERA.third.pitch);
    faceCamera(0);
    await viewBy(lab, 'top');
  }
}
