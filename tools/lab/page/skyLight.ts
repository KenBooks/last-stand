// The camera turned to the sky's key light (the village's sun by day, its moon by night), for a picture of its disc
// and what's round it: `lab rust --skylight`. From play on the Rust engine: "also no sun/moon on the sky I think".
import * as THREE from 'three';
import type { Clip, Lab } from './lab';
import { G } from '../../../src/state';
import { lookBy, turnBy } from '../../../src/core/renderer';
import { CAMERA } from '../../../src/data/balance';

/** how many times the camera is turned and looked at again, the frames between, and how near is near enough (rad) */
const ROUNDS = 8;
const SETTLE = 4;
const NEAR = 0.004;
/** the side of the picture round the light (CSS px): the disc is under a degree across, the glow tens of them */
const SIDE = 420;

export interface SkyLight {
  /** how far off the middle of the view the light was left (rad) */
  off: number;
  /** how high it stands over the horizon (rad) */
  high: number;
  /** the middle of the window, where it is */
  clip: Clip;
}

/** The way to the scene's key light, from what it lights (the arena's one directional light). */
function wayToLight(): THREE.Vector3 | null {
  let way: THREE.Vector3 | null = null;
  G.scene.traverse((object) => {
    const light = object as THREE.DirectionalLight;
    if (!light.isDirectionalLight || !light.visible || way) return;
    const from = light.target.getWorldPosition(new THREE.Vector3());
    way = light.getWorldPosition(new THREE.Vector3()).sub(from).normalize();
  });
  return way;
}

const heading = (way: THREE.Vector3): number => Math.atan2(way.x, way.z);
const wrapped = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The close view's camera turned until the key light is in the middle of it; null where the scene has none. */
export async function turnToSkyLight(lab: Lab): Promise<SkyLight | null> {
  const way = wayToLight();
  if (!way) return null;
  const ahead = new THREE.Vector3();
  let off = Infinity;
  for (let round = 0; round < ROUNDS; round++) {
    await lab.step(SETTLE);
    G.camera.getWorldDirection(ahead);
    off = ahead.angleTo(way);
    if (off < NEAR) break;
    turnBy(wrapped(heading(way) - heading(ahead)));
    // (down looks down: the look is the pitch under the horizon)
    lookBy(0, (Math.asin(ahead.y) - Math.asin(way.y)) / CAMERA.lookSpeed);
  }
  const clip = {
    x: Math.round(innerWidth / 2 - SIDE / 2),
    y: Math.round(innerHeight / 2 - SIDE / 2),
    width: SIDE,
    height: SIDE,
  };
  return { off, high: Math.asin(way.y), clip };
}

/** What the report says of it, and the problem if the camera never got there. */
export function skyLightLines(sky: SkyLight | null): { line: string; problems: string[] } {
  if (!sky) return { line: '  the sky\'s light: the scene has none', problems: ['--skylight: the scene has no key light'] };
  const degrees = (rad: number): string => `${(rad * 180 / Math.PI).toFixed(1)}°`;
  const line = `  the camera turned to the sky's light, ${degrees(sky.high)} over the horizon: left ${degrees(sky.off)} `
    + 'off the middle of the picture';
  const problems = sky.off < NEAR * 4 ? [] : [`--skylight: the camera was left ${degrees(sky.off)} off the light`];
  return { line, problems };
}
