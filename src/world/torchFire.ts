// A torch that burns: an iron basket on a bracket's end with a fire in it (`buildFire`, the braziers' fluid
// flames, small), as the hall of heroes' room has them (`heroHall.ts`). The village's hall had a lit tongue in a cup
// in their place, still and the same every frame (from play, "hall lights are completely broken and static", "these
// lights are super lame"). Its light is a lamp of the village's (game/village.ts), never a light of its own: the
// fire sways a light the scene never holds, whose strength the lamp is read by (`TorchFire.flicker`).
import * as THREE from 'three';
import { buildFire } from './fire';
import type { Updater } from './props';

/** A torch's fire: its bed's radius and its flames' height (m), how much the bed is dished, and its smoke and embers
 *  (a second) */
const FLAME = { radius: 0.11, height: 0.45, dish: 0.03, smoke: 0, embers: 2 };
/** its basket's outline from its foot up (radius, height, m), and how far under the bed its foot is */
const BASKET: [number, number][] = [[0.03, 0], [0.05, 0.1], [0.12, 0.26], [0.14, 0.3], [0, 0.22]];
const BASKET_BELOW = 0.26;
/** the flames' light, a share of a fire's own: a torch is passed close by, at a man's eye or over his head */
const GLOW = 0.8;

/** A torch's fire as built: the light its puffs sway, 1 at rest, which its lamp is read by. */
export interface TorchFire { flicker: THREE.PointLight }

/** An iron basket at `at` (the middle of its bed) in `group`, its fire in `fires` (a group never thinned by a
 *  material of its own: a fire's flames are a shader of their own, `fadesWhole` would put them in a wall's). */
export function torchFire(group: THREE.Object3D, fires: THREE.Object3D, iron: THREE.Material, at: THREE.Vector3,
  updaters: Updater[]): TorchFire {
  const outline = BASKET.map(([r, y]) => new THREE.Vector2(r, y));
  const basket = new THREE.Mesh(new THREE.LatheGeometry(outline, 10), iron);
  basket.position.set(at.x, at.y - BASKET_BELOW, at.z);
  basket.castShadow = false;
  group.add(basket);
  const flicker = new THREE.PointLight(0xffffff, 1);
  flicker.position.copy(at);
  buildFire(fires, {
    at, radius: FLAME.radius, height: FLAME.height, dish: FLAME.dish, light: flicker, intensity: 1,
    smoke: FLAME.smoke, smokeColour: 0x2a2826, embers: FLAME.embers, glow: GLOW,
  }, updaters);
  return { flicker };
}
