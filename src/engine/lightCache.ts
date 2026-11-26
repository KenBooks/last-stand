// The village's still lamps in the engine's light cache (Bulwark's gpu/light_cache.rs): their light and their shadows
// of what stands still baked once into a volume, which a pixel reads in one lookup however many lamps reach it. In
// the frame's own loop a lamp is worked out at every pixel in its reach with a read of its shadow's map: 11 ms of a
// 19 ms frame in the hall at night at High (the lent 4080 as the phone).
//
// A lamp is baked at its fullest (core/lamps.ts `LampPlace.full`) and read as bright as it is now: the street lamps
// by the hour, the hall's torches whole, each on its side of the shelter, which the volume's cells keep apart. Within
// `NEAR` m of itself a baked lamp is still the frame's own (`reachOf`): a cell is too coarse there. A lamp the game
// didn't say the fullest of, or that's neither the street's nor the hall's, stays whole in the frame's loop.
//
// A light of the scene's own that never moves is baked with them where the game says so (`StillLight`, on the
// light's `userData.still`): the hall's braziers with its torches, steady; a portal's glow by a strength of its
// own, its pulse (the engine's third: what's no lamp). In the frame's loop each reached the whole hall, worked
// out at every pixel: the point lights were 5.8 ms of a phone's 25 ms frame by the braziers at Very low (a
// report from play, QJ5A-BD6Q). The campfire isn't: it dims by the hour on its own, and one strength reads all
// that's no lamp.
import * as THREE from 'three';
import { lampList, lampStill, LAMPS_MOST } from '../core/lamps';
import { perfClock } from '../core/perfClock';
import type { Core } from './core';
import { TUNE } from './globals';
import { shelterBox } from './lights';
import { shownPointLights } from '../core/webgpu';

/** What a game says of a point light that never moves, for its light to be baked (`light.userData.still`): the
 *  side whose lamps it's read with ('inside': the shelter's, steady with them) or 'apart' (by its own strength,
 *  the mean of all such), and its intensity as baked. */
export interface StillLight { side: 'inside' | 'apart'; full: number }

/** `light`'s word that it's still, if the game gave one. */
const stillOf = (light: THREE.PointLight): StillLight | undefined => light.userData.still as StillLight | undefined;

/** a baked light's decay as the bake reads it: a lamp of the shelter's side falling as a light that's no lamp
 *  (the engine's bake.wgsl: a code of 4 or more), or its own decay, what's no lamp's */
const INSIDE_PLAIN = -6;
/** how far a still light may stray from where it was baked before it's baked again, m */
const SWAY = 0.25;

/** how near a baked lamp its light is the frame's own to work out, m (six cells) */
const NEAR = 3;
/** a cell's side, m, and the most cells a volume is made of: 16 bytes each on the GPU, 12 MB */
const CELL = 0.5;
const MOST_CELLS = 750_000;
/** how far under the lowest lamp and over the highest the volume reaches, m */
const BELOW = 8, ABOVE = 6;

/** the address's `?lightCache=0`: every lamp whole in the frame's loop, for a device with no console to tune by
 *  (a phone's frame drew black the day the cache was wired in) */
const OFF = new URLSearchParams(location.search).get('lightCache') === '0';

const at = new THREE.Vector3();

export class LightCache {
  /** what casts into the lamps' shadows (the game's own choice, as the lamps' maps have) */
  private casters: THREE.Mesh[] = [];
  /** what the volume was baked of: the lamps' places, reaches and fullest lights */
  private key = '';
  /** the lamps in the volume */
  private baked = new Set<number>();
  /** the scene's own lights in it */
  private own = new Set<THREE.PointLight>();
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

  /** where each of the scene's own still lights was first met */
  private places = new WeakMap<THREE.PointLight, THREE.Vector3>();

  /** Where a still light of the scene's own is baked: where it was first met, while it stays within `SWAY` of
   *  there. A fire's light sways with its flame, a third of a millimetre a frame, and baked where it is now the
   *  volume was made again every frame (367 bakes over one stand in the hall). */
  private placeOf(light: THREE.PointLight): THREE.Vector3 {
    light.getWorldPosition(at);
    const met = this.places.get(light);
    if (met && met.distanceTo(at) < SWAY) return met;
    const now = at.clone();
    this.places.set(light, now);
    return now;
  }

  /** How far a light of the scene's own reaches in the frame's loop: its own reach, or `NEAR` once it's in the
   *  volume. */
  ownReach(light: THREE.PointLight): number {
    return this.own.has(light) ? Math.min(light.distance || NEAR, NEAR) : light.distance;
  }

  /** A harness's: how many of the scene's own lights are in the volume. */
  ownNow(): number { return this.own.size; }

  /** A harness's: the lamps in the volume and its last bake. */
  now(): { lamps: number; own: number; cells: number; cell: number; ms: number; bakes: number; open: number; sheltered: number } {
    return { lamps: this.baked.size, own: this.own.size, ...this.last, ...this.told };
  }

  /**
   * The volume baked if what it's of has changed, at the head of a frame: `record` writes a caster's record as a
   * frame's walk would (the frame's own are written after, over these). Whether the lamps in it changed: their
   * shadows' maps in the frame's loop are to be drawn again, as far as each reaches there now.
   */
  step(record: (mesh: THREE.Mesh) => void): boolean {
    const core = this.core;
    const lights: number[] = [], lamps: number[] = [];
    if (!OFF && TUNE.lightCache > 0 && this.casters.length) {
      for (let lamp = 0; lamp < LAMPS_MOST; lamp++) {
        const still = lampStill(lamp), place = (1 + lamp * 2) * 4;
        if (!still || !(lampList[place + 3] > NEAR)) continue;
        // (its decay: a lamp's falloff, and the side of the shelter it lights, as the frame's loop codes it)
        lights.push(lampList[place], lampList[place + 1], lampList[place + 2], lampList[place + 3],
          still.full[0], still.full[1], still.full[2], still.inside ? -2 : -1);
        lamps.push(lamp);
      }
    }
    // (the scene's own, with the lamps alone: a place with none has none of this volume's casters either)
    const own: THREE.PointLight[] = [];
    for (const light of lamps.length && TUNE.cacheOwn > 0 ? shownPointLights() : []) {
      const still = stillOf(light);
      if (!still || !(light.distance > NEAR)) continue;
      const c = light.color, by = still.full;
      const { x, y, z } = this.placeOf(light);
      lights.push(x, y, z, light.distance, c.r * by, c.g * by, c.b * by,
        still.side === 'inside' ? INSIDE_PLAIN : light.decay);
      own.push(light);
    }
    const shadowed = TUNE.cacheShadows > 0;
    const key = `${shadowed}:${lights.join(',')}`;
    if (key === this.key) return false;
    this.key = key;
    const before = this.baked.size;
    this.baked = new Set(lamps);
    this.own = new Set(own);
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
    let cell = Math.max(CELL, Math.cbrt(room / MOST_CELLS));
    // (each way's cells are whole: counted so, a volume the scene's own lights had widened came to 763,840 cells,
    // 12.2 MB against the 12 it's held to)
    const cellsAt = (side: number): number => [0, 1, 2].reduce((all, axis) => all * Math.ceil((high[axis] - low[axis]) / side), 1);
    while (cellsAt(cell) > MOST_CELLS) cell *= 1.01;
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
    let open = 0, sheltered = 0, shelteredOf = 0;
    for (const lamp of this.baked) {
      const still = lampStill(lamp), light = (1 + lamp * 2) * 4 + 4;
      if (!still || lampList[light + 3] === 0) continue;
      at.fromArray(lampList, light);
      const share = Math.max(at.x, at.y, at.z) / Math.max(still.full[0], still.full[1], still.full[2], 1e-6);
      // (the hall's torches as one, their mean: each swells with its own fire, and read by the last alone the whole
      // hall's baked light would follow that one's puffs)
      if (still.inside) {
        sheltered += share;
        shelteredOf++;
      } else open = share;
    }
    if (shelteredOf) sheltered /= shelteredOf;
    // (what's no lamp: as bright as those shown are now against as they were baked. The one that reaches
    // furthest by a strength of its own within its reach, the rest as one: a fire's light swells with its
    // flames and dims by the hour, a portal's pulses, and read as one each took on the other's)
    let apart = 0, apartOf = 0;
    const shown = this.own.size ? new Set(shownPointLights()) : null;
    const now = (light: THREE.PointLight): number => (shown?.has(light) ? light.intensity / stillOf(light)!.full : 0);
    const apartLights = [...this.own].filter((light) => stillOf(light)?.side === 'apart');
    const furthest = apartLights.reduce<THREE.PointLight | null>(
      (best, light) => (!best || light.distance > best.distance ? light : best), null);
    for (const light of apartLights) {
      if (light === furthest) continue;
      apartOf++;
      apart += now(light);
    }
    this.told = { open, sheltered };
    this.core.engine.set_light_strength(open, sheltered, apartOf ? apart / apartOf : 0);
    // (and where they reach: with the lamps out, by day, the volume is read within those reaches alone)
    const reaches: number[] = [];
    for (const light of apartLights) {
      const { x, y, z } = this.placeOf(light);
      reaches.push(x, y, z, light.distance);
    }
    // (`cacheWhere` 0: nothing said, the volume read everywhere, to compare)
    this.core.engine.set_lights_apart(TUNE.cacheWhere > 0 ? new Float32Array(reaches) : new Float32Array(36));
    if (furthest) {
      const { x, y, z } = this.placeOf(furthest);
      this.core.engine.set_light_of_its_own(x, y, z, furthest.distance, now(furthest));
    } else this.core.engine.set_light_of_its_own(0, 0, 0, 0, 0);
  }
}
