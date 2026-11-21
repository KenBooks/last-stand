// The village's still lamps in the engine's light cache (Bulwark's gpu/light_cache.rs): their light and their shadows
// of what stands still baked once into a volume, which a pixel reads in one lookup however many lamps reach it. In
// the frame's own loop a lamp is worked out at every pixel in its reach with a read of its shadow's map: 11 ms of a
// 19 ms frame in the hall at night at High (the lent 4080 as the phone).
//
// A lamp is baked at its fullest (core/lamps.ts `LampPlace.full`) and read as bright as it is now: the street lamps
// by the hour, the hall's torches whole, each on its side of the shelter, which the volume's cells keep apart. Within
// `NEAR` m of itself a baked lamp is still the frame's own (`reachOf`): a cell is too coarse there. A lamp the game
// didn't say the fullest of, or that's neither the street's nor the hall's, stays whole in the frame's loop.
import * as THREE from 'three';
import { lampList, lampStill, LAMPS_MOST } from '../core/lamps';
import { perfClock } from '../core/perfClock';
import type { Core } from './core';
import { TUNE } from './globals';
import { shelterBox } from './lights';

/** how near a baked lamp its light is the frame's own to work out, m (six cells) */
const NEAR = 3;
/** a cell's side, m, and the most cells a volume is made of: 16 bytes each on the GPU, 12 MB */
const CELL = 0.5;
const MOST_CELLS = 750_000;
/** how far under the lowest lamp and over the highest the volume reaches, m */
const BELOW = 8, ABOVE = 6;

const at = new THREE.Vector3();

export class LightCache {
  /** what casts into the lamps' shadows (the game's own choice, as the lamps' maps have) */
  private casters: THREE.Mesh[] = [];
  /** what the volume was baked of: the lamps' places, reaches and fullest lights */
  private key = '';
  /** the lamps in the volume */
  private baked = new Set<number>();
  /** the last bake: its cells, a cell's side (m), and what it took on the page (ms) */
  private last = { cells: 0, cell: 0, ms: 0, bakes: 0 };
  /** how bright the volume was last told to be read: out in the open, and under the shelter */
  private told = { open: 0, sheltered: 0 };

  constructor(private core: Core) {}

  /** The lamps' light asked for, hidden by `casters` as they stand. */
  ask(casters: THREE.Mesh[]): void {
    this.casters = casters;
    this.key = '';
  }

  /** How far lamp `lamp` reaches in the frame's own loop: `reach`, or `NEAR` once it's in the volume. */
  reachOf(lamp: number, reach: number): number {
    return this.baked.has(lamp) ? Math.min(reach, NEAR) : reach;
  }

  /** A harness's: the lamps in the volume and its last bake. */
  now(): { lamps: number; cells: number; cell: number; ms: number; bakes: number; open: number; sheltered: number } {
    return { lamps: this.baked.size, ...this.last, ...this.told };
  }

  /**
   * The volume baked if what it's of has changed, at the head of a frame: `record` writes a caster's record as a
   * frame's walk would (the frame's own are written after, over these). Whether the lamps in it changed: their
   * shadows' maps in the frame's loop are to be drawn again, as far as each reaches there now.
   */
  step(record: (mesh: THREE.Mesh) => void): boolean {
    const core = this.core;
    const lights: number[] = [], lamps: number[] = [];
    if (TUNE.lightCache > 0 && this.casters.length) {
      for (let lamp = 0; lamp < LAMPS_MOST; lamp++) {
        const still = lampStill(lamp), place = (1 + lamp * 2) * 4;
        if (!still || !(lampList[place + 3] > NEAR)) continue;
        // (its decay: a lamp's falloff, and the side of the shelter it lights, as the frame's loop codes it)
        lights.push(lampList[place], lampList[place + 1], lampList[place + 2], lampList[place + 3],
          still.full[0], still.full[1], still.full[2], still.inside ? -2 : -1);
        lamps.push(lamp);
      }
    }
    const shadowed = TUNE.cacheShadows > 0;
    const key = `${shadowed}:${lights.join(',')}`;
    if (key === this.key) return false;
    this.key = key;
    const before = this.baked.size;
    this.baked = new Set(lamps);
    if (!lamps.length) {
      core.engine.drop_lights();
      return before > 0;
    }
    const began = perfClock.now();
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < lights.length; k += 8) {
      const reach = lights[k + 3];
      const out = [reach, 0, reach];
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis], lights[k + axis] - (axis === 1 ? BELOW : out[axis]));
        high[axis] = Math.max(high[axis], lights[k + axis] + (axis === 1 ? ABOVE : out[axis]));
      }
    }
    // (cells no finer than the budget holds)
    const room = (high[0] - low[0]) * (high[1] - low[1]) * (high[2] - low[2]);
    const cell = Math.max(CELL, Math.cbrt(room / MOST_CELLS));
    core.count = core.boneFloats = 0;
    for (const mesh of this.casters) record(mesh);
    core.freshViews();
    const cells = core.engine.bake_lights(new Float32Array([...low, ...high]), cell, new Float32Array(lights),
      shadowed ? core.count : 0,
      NEAR, new Float32Array(shelterBox()));
    core.freshViews();
    core.count = core.boneFloats = 0;
    this.last = { cells, cell, ms: perfClock.now() - began, bakes: this.last.bakes + 1 };
    return true;
  }

  /** How bright the volume is read this frame, told to the engine: the street lamps' share of their fullest, and
   *  the hall's torches' (none while a lamp of its kind is out: the village not shown, the day). */
  tell(): void {
    let open = 0, sheltered = 0;
    for (const lamp of this.baked) {
      const still = lampStill(lamp), light = (1 + lamp * 2) * 4 + 4;
      if (!still || lampList[light + 3] === 0) continue;
      at.fromArray(lampList, light);
      const share = Math.max(at.x, at.y, at.z) / Math.max(still.full[0], still.full[1], still.full[2], 1e-6);
      if (still.inside) sheltered = share;
      else open = share;
    }
    this.told = { open, sheltered };
    this.core.engine.set_light_strength(open, sheltered);
  }
}
