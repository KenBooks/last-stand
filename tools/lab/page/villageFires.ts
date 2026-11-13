// `lab village`'s fires' sparks and smoke where the fires stand (from play, "weird particles like fire burning, in the
// plaza... roughly between the fountain and stairs up"): the yard's gate torches, gone since, laid out in a group
// turned and moved, threw theirs from the group's own numbers. Every ember spawned over some frames must lie near a
// fire's flames, and
// each fire's shader must be told where it stands. `canary` puts every ember a few metres off, as those were.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { YARD, yardToWorld } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera } from '../../../src/core/renderer';
import { particles } from '../../../src/fx/particles';
import type { LightsChecked } from './villageLights';

/** the frames watched, how near a fire an ember must rise (m), how far the canary throws one (m), and the most a
 *  fire's shader may be off where its flames stand (m) */
const FRAMES = 240;
const NEAR_FIRE = 1.5;
const THROWN = 5;
const SHADER_OFF = 0.01;
const PLACES_SAID = 6;
/** how far from the middle the portals stand (m), whose own sparks these aren't */
const PORTALS_FROM = 27;
/** the largest ember's size and its least rise: what's told from the portals' motes and the like */
const EMBER_SIZE = 0.06;
const EMBER_RISE = 1.1;

/** how near the yard's gate a fire may stand (m; from play, the fires on its posts "make no sense"), how far before the
 *  gate he's stood for its picture (m), and the frames he's given to settle */
const OFF_THE_GATE = 3;
const BEFORE_GATE = 2;
const SETTLE = 60;

/** A spawn's fields read here. */
interface Spawned { x: number; z: number; size?: number; vy?: number }

/** Where each fire's flames stand, and how many of their shaders are told elsewhere. */
function fires(): { at: THREE.Vector3[]; off: number } {
  const at: THREE.Vector3[] = [];
  let off = 0;
  G.scene.updateWorldMatrix(true, true);
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.ShaderMaterial | undefined;
    const centre = material?.uniforms?.uCentre?.value as THREE.Vector3 | undefined;
    if (!mesh.isMesh || !centre) return;
    const where = mesh.getWorldPosition(new THREE.Vector3());
    if (where.distanceTo(centre) > SHADER_OFF) off++;
    at.push(where);
  });
  return { at, off };
}

/** Every ember near a fire, and every fire's shader told where it stands. */
export async function firesWhereTheyStand(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const { at, off } = fires();
  if (at.length === 0) throw new Error('lab: village: no fire found');
  const pool = particles.glow;
  const own = pool.spawn.bind(pool);
  let embers = 0;
  let astray = 0;
  const places: string[] = [];
  pool.spawn = (spawned: Parameters<typeof own>[0]) => {
    const { x, z, size = 1, vy = 0 } = spawned as Spawned;
    if (size <= EMBER_SIZE && vy >= EMBER_RISE && Math.hypot(x, z) < PORTALS_FROM) {
      embers++;
      const placed = x + (canary ? THROWN : 0);
      const near = at.some((fire) => Math.hypot(fire.x - placed, fire.z - z) < NEAR_FIRE);
      if (!near) {
        astray++;
        if (places.length < PLACES_SAID) places.push(`${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
    return own(spawned);
  };
  await lab.step(FRAMES);
  pool.spawn = own;
  if (embers === 0) throw new Error('lab: village: no ember spawned');
  const [gateX, gateZ] = yardToWorld(YARD.gateAt, -YARD.halfZ);
  const onGate = at.filter((fire) => Math.hypot(fire.x - gateX, fire.z - gateZ) < OFF_THE_GATE).length;
  const line = `the fires' embers: ${embers} over ${FRAMES} frames, ${astray} away from a fire `
    + `(${places.join(' ')}); `
    + `${off} of ${at.length} fires' shaders told elsewhere; ${onGate} on the yard's gate`;
  if (canary) return { lines: [line], problems: [], caught: astray > 0, moments: [] };
  const [standX, standZ] = yardToWorld(YARD.gateAt, -YARD.halfZ - BEFORE_GATE);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(standX, groundHeight(standX, standZ), standZ), YARD.turn);
  faceCamera(YARD.turn);
  await lab.step(SETTLE);
  const gate = await lab.screen('its gate', ['no fires on its posts']);
  return { lines: [line], problems: astray || off || onGate ? [line] : [], caught: null, moments: [gate] };
}
