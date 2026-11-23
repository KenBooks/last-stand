// The game's kinds of see-through as the engine holds them (`SeeKind` in its common.wgsl): what's dissolved where it
// hides the hero, each kind's numbers written to the frame's globals as the game has them (core/seeThrough.ts).
import * as THREE from 'three';
import { BLEND_GONE, SIGHT_CONE, type SeeThrough } from '../core/seeThrough';
import { HALL, TERRACE } from '../data/village';
import type { Core } from './core';
import { GLOBALS, TUNE } from './globals';

/** the kinds of see-through the engine holds, the floats of each (`SeeKind` in its common.wgsl), and how far under
 *  the hero's floor is still clear of his hole (`FLOOR_CLEAR` in core/seeThrough.ts) */
const SEE_KINDS_MOST = 32, SEE_KIND_FLOATS = 20, SEE_FLOOR_CLEAR = 0.12;

/** A record's flags a material's see-through sets (Bulwark's plan.rs: `SOLID`, `THINNED`, `ONE_LAYER`), and one of
 *  the page's own: all of it is thinned to nothing, and it's in the frame for its shadow alone. */
export const SEE_FLAGS = { solid: 16, thinned: 64, oneLayer: 256, gone: 1 << 20 } as const;

/** A material as the kinds read it: three's, with the game's see-through on it. */
type Seen = THREE.Material & { seeThrough?: unknown };

/** a kind's `k.w` at or under this thins whole wherever it stands (`see_fade`: under -100) */
const GONE_REACH = -100;

/** How far `see`'s cone of his sight is on (`uSeeSight` in core/seeThrough.ts): its own, or the hall's. */
const sightOf = (see: SeeThrough): number => (see.sight ? (see.sightOn ?? SIGHT_CONE.on).value : 0);

export class SeeKinds {
  private kinds: SeeThrough[] = [];

  constructor(private core: Core) {}

  /** A material's kind of see-through as the engine has it: 0 for none, else its place among the kinds and one
   *  (`core/seeThrough.ts`: every material of a kind holds the one object of its numbers). */
  kindOf(see: SeeThrough | undefined): number {
    if (!see || !TUNE.see) return 0;
    let slot = this.kinds.indexOf(see);
    if (slot < 0) {
      if (this.kinds.length === SEE_KINDS_MOST) { this.core.skip('see-through kind past 32'); return 0; }
      slot = this.kinds.push(see) - 1;
    }
    return slot + 1;
  }

  /** Each kind's numbers as the game has them this frame (`seeFadeAt`'s uniforms), and the hall its doors open into. */
  write(): void {
    const g = this.core.globals;
    // (the hall's room inside its walls: what a wall with its door open hides of it is what thins, `seeSightCone`)
    g[GLOBALS.seeHall] = TERRACE.x - HALL.inHalf; g[GLOBALS.seeHall + 1] = HALL.inFront;
    g[GLOBALS.seeHall + 2] = TERRACE.x + HALL.inHalf; g[GLOBALS.seeHall + 3] = HALL.wall;
    g[GLOBALS.seeHall + 6] = SEE_FLOOR_CLEAR;
    for (let slot = 0; slot < this.kinds.length; slot++) {
      const see = this.kinds[slot], at = GLOBALS.seeKinds + slot * SEE_KIND_FLOATS;
      see.k.value.toArray(g, at);
      g[at + 4] = see.minY.value; g[at + 5] = see.across.value; g[at + 6] = see.whole.value; g[at + 7] = see.ramp.value;
      const reach = see.reach?.value;
      g[at + 8] = reach ? reach.x : 1e5; g[at + 9] = reach ? reach.y : 1e6;
      g[at + 10] = see.doorOn?.value ?? 0;
      // (3 and 4: blended, and the nearest of its layers alone drawn, which keeps the kind's share itself)
      g[at + 11] = see.blended ? (see.pale ? 2 : 1) + (this.oneLayer(see) ? 2 : 0) : 0;
      const room = see.room?.value, door = see.door?.value;
      g[at + 12] = room ? room.x : -1e5; g[at + 13] = room ? room.y : -1e5;
      g[at + 14] = room ? room.z : 1e5; g[at + 15] = room ? room.w : 1e5;
      g[at + 16] = door ? door.x : 0; g[at + 17] = door ? door.y : 0;
      // (its cone of his sight, and the share it thins by there: none for a kind that reads none of his sight)
      g[at + 18] = sightOf(see); g[at + 19] = see.sight ? see.sightShare ?? 1 : 0;
    }
  }

  /** Whether what's of `see`'s kind lies in layers of which the engine draws the nearest alone (`rust.oneLayer`). */
  oneLayer(see: SeeThrough | undefined): boolean {
    return TUNE.oneLayer > 0 && !!see?.blended && !!see.oneLayer;
  }

  /**
   * Whether all of what's of `see`'s kind is thinned to nothing this frame: a kind that blends, thinned whole
   * wherever it stands (its reach far past him, `k.w` under -100, with no reach aside or room of its own to
   * thin within) by a share that leaves under `BLEND_GONE` of it, where the engine's shader drops the pixel
   * (`see_left`: the cube of what's left, or what's left itself of a layer drawn alone). Its hole and his sight
   * only thin it further. Drawn all the same, the hall's roof seen from over it was three layers over two
   * thirds of a phone's screen, every pixel of them shaded as far as the drop (`rust.goneWhole`).
   */
  gone(see: SeeThrough | undefined): boolean {
    if (!TUNE.goneWhole || !TUNE.see || !see?.blended || see.reach || see.room) return false;
    if (see.k.value.w > GONE_REACH) return false;
    const left = 1 - see.whole.value;
    return (this.oneLayer(see) ? left : left * left * left) < BLEND_GONE;
  }

  /**
   * A record's flags for `material`'s see-through (`SEE_FLAGS`): thinned by blending (before all else that blends,
   * the larger first); drawn solid, with what's opaque, where it blends only as the game thins it and is thinned
   * nowhere now (a wall, a roof's beams: one that tells its share in its alpha by custom blending, or writes no
   * depth, stays blended); one of a thing's layers of which the nearest alone is drawn; gone whole.
   */
  flagsOf(material: Seen): number {
    const see = material.seeThrough as SeeThrough | undefined;
    if (!see) return 0;
    const whole = material.depthWrite && material.opacity >= 1 && material.blending === THREE.NormalBlending;
    const solid = TUNE.solidSee > 0 && material.transparent && whole && this.solid(see);
    return (see.blended === true ? SEE_FLAGS.thinned : 0) | (solid ? SEE_FLAGS.solid : 0)
      | (material.transparent && this.oneLayer(see) ? SEE_FLAGS.oneLayer : 0)
      | (material.transparent && this.gone(see) ? SEE_FLAGS.gone : 0);
  }

  /** Whether `see`'s kind thins nothing this frame (no hole, no share of the whole, no door open): what it's on
   *  is as solid as if it weren't see-through. */
  solid(see: SeeThrough | undefined): boolean {
    return !!see && !(see.k.value.z > 0 || see.whole.value > 0 || (see.doorOn?.value ?? 0) !== 0 || sightOf(see) !== 0);
  }

  /** A harness's: how many kinds of see-through the engine holds, and how many of them thin anything this frame (a
   *  hole, a share of the whole, a door open). */
  now(): { held: number; thinning: number } {
    return { held: this.kinds.length, thinning: this.kinds.filter((see) => !this.solid(see)).length };
  }
}
