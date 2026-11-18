// What a place of the village is built with (world/places/<id>.ts `build`, world/places.ts): the village's scene, its
// wall, its materials, what stands (circles) and its updaters, each a place adds to as the village's own builder does.
// Types alone, so a place's module imports nothing of the village's builder.
import type * as THREE from 'three';
import type { Mats } from './village';
import type { Wall } from './wall';
import type { Updater } from './props';
import type { Obstacle } from '../types';

/** The village as a place is built into it. */
export interface PlaceKit {
  scene: THREE.Object3D;
  wall: Wall;
  /** the village's materials (shared: a place in them is thinned and lit as everything round it) */
  M: Mats;
  /** what stands, as circles: a place's own pushed here, before the lamps keep off them */
  obstacles: Obstacle[];
  /** each frame's work of what moves (a flame, a flag) */
  updaters: Updater[];
}
