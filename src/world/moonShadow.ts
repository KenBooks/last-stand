// The sun's (the moon's) shadow map in the village. It was kept there, drawn once of what stands still and what moves
// drawn over a copy each frame, its depth copied by raw GL; the engine draws its own shadows, and nothing keeps this
// map now. What the game and the lab still ask of it is answered here.
import type * as THREE from 'three';

/**
 * The sun's map drawn again whole, in the village (`_on`) as everywhere else: nothing keeps it now (its depth was
 * copied by raw GL); returns whether its map must be drawn still now, which with none kept it never must.
 */
export function holdMoonShadow(moon: THREE.DirectionalLight, _on: boolean): boolean {
  moon.shadow.autoUpdate = true;
  return false;
}

/** Whether the sun's map is kept now, only what moves drawn over it each frame: never, no frame keeps it. */
export const moonShadowKept = (): boolean => false;

/** A lab's switch, which redrew the map every frame while it was kept: nothing keeps it. */
export function keepMoonShadow(_on: boolean): void {}
