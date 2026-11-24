// The village's fog over what the hero can't see (core/sight.ts), handed to the engine each frame: the numbers of
// his sight, the rays cast round him while any of it is on, and the roofs' map when it changes. The engine fogs each
// surface by its own place as it's lit (Bulwark's gpu/sight.rs), where the game's own pass reads the scene's depth
// back: no pass of its own, and what's blended is fogged by where it is, not by what's behind it.
import type * as THREE from 'three';
import { SIGHT } from '../core/sight';
import type { Core } from './core';
import { TUNE } from './globals';

/** how many floats the engine takes of it (Bulwark's `SIGHT_FLOATS`) */
const FLOATS = 16;

export class SightFog {
  private readonly numbers = new Float32Array(FLOATS);
  private readonly none = new Uint16Array(0);
  /** the roofs' map as last handed over */
  private roofs = -1;

  constructor(private readonly core: Core) {}

  /** The frame's sight told; with `few`, a level's, the rays are read three times a surface where nine. */
  tell(few: boolean): void {
    // (its strength the game's on-share times `TUNE.sightFog`: the engine mixes the fog in by that share)
    const n = this.numbers, on = TUNE.sightFog > 0 ? SIGHT.uSightOn.value * TUNE.sightFog : 0;
    const from = SIGHT.uSightFrom.value, door = SIGHT.uSightDoor.value;
    n[0] = from.x; n[1] = from.y; n[2] = on; n[3] = SIGHT.uSightShut.value;
    SIGHT.uSightSealed.value.toArray(n, 4);
    n[8] = door.x; n[9] = door.y; n[10] = door.z; n[11] = door.w;
    n[12] = SIGHT.uSightDoorOn.value; n[13] = few ? 1 : 0;
    // (a face turned to him read this far off itself: on it, the wall he stands against greyed along its length)
    n[14] = TUNE.sightOffFace;
    const roofs = SIGHT.tSightRoofs.value as THREE.DataTexture;
    if (on > 0 && roofs.version !== this.roofs) {
      this.roofs = roofs.version;
      this.core.engine.set_sight_roofs(roofs.image.data as Uint8Array, roofs.image.width);
      this.core.freshViews();
    }
    const rays = (SIGHT.tSight.value as THREE.DataTexture).image.data as Uint16Array;
    this.core.engine.set_sight(n, on > 0 ? rays : this.none);
  }
}
