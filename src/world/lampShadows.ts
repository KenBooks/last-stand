// The camera the heroes' shadows were drawn by over the lamps' and the sun's kept maps (copies of their depth, by raw
// GL): the engine draws its own (`src/engine/lampShadows.ts`), and the lab's sun shadow check still sets its layers.
import * as THREE from 'three';
import { HERO_SHADOW_LAYER } from '../core/layers';

/** what the heroes' draw is drawn as: the heroes' layer alone */
export const moversSeen = new THREE.PerspectiveCamera();
moversSeen.layers.set(HERO_SHADOW_LAYER);
