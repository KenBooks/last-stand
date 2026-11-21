// The game's kinds of see-through as the engine holds them (`SeeKind` in its common.wgsl): what's dissolved where it
// hides the hero, each kind's numbers written to the frame's globals as the game has them (core/seeThrough.ts).
import type { SeeThrough } from '../core/seeThrough';
import { HALL, TERRACE } from '../data/village';
import type { Core } from './core';
import { GLOBALS, TUNE } from './globals';

/** the kinds of see-through the engine holds, the floats of each (`SeeKind` in its common.wgsl), and how far under
 *  the hero's floor is still clear of his hole (`FLOOR_CLEAR` in core/seeThrough.ts) */
const SEE_KINDS_MOST = 32, SEE_KIND_FLOATS = 20, SEE_FLOOR_CLEAR = 0.12;

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
    g[GLOBALS.seeHall] = TERRACE.x; g[GLOBALS.seeHall + 1] = TERRACE.high + HALL.wallHigh;
    g[GLOBALS.seeHall + 2] = TERRACE.high + HALL.doorHigh; g[GLOBALS.seeHall + 3] = HALL.half;
    g[GLOBALS.seeHall + 4] = HALL.doorHalf; g[GLOBALS.seeHall + 5] = HALL.wallHigh; g[GLOBALS.seeHall + 6] = SEE_FLOOR_CLEAR;
    for (let slot = 0; slot < this.kinds.length; slot++) {
      const see = this.kinds[slot], at = GLOBALS.seeKinds + slot * SEE_KIND_FLOATS;
      see.k.value.toArray(g, at);
      g[at + 4] = see.minY.value; g[at + 5] = see.across.value; g[at + 6] = see.whole.value; g[at + 7] = see.ramp.value;
      const reach = see.reach?.value;
      g[at + 8] = reach ? reach.x : 1e5; g[at + 9] = reach ? reach.y : 1e6;
      g[at + 10] = see.doorOn?.value ?? 0;
      g[at + 11] = see.blended ? (see.pale ? 2 : 1) : 0;
      const room = see.room?.value, door = see.door?.value;
      g[at + 12] = room ? room.x : -1e5; g[at + 13] = room ? room.y : -1e5;
      g[at + 14] = room ? room.z : 1e5; g[at + 15] = room ? room.w : 1e5;
      g[at + 16] = door ? door.x : 0; g[at + 17] = door ? door.y : 0;
      g[at + 18] = door ? door.z : 0; g[at + 19] = door ? door.w : 0;
    }
  }

  /** Whether `see`'s kind thins nothing this frame (no hole, no share of the whole, no door open): what it's on
   *  is as solid as if it weren't see-through. */
  solid(see: SeeThrough | undefined): boolean {
    return !!see && !(see.k.value.z > 0 || see.whole.value > 0 || (see.doorOn?.value ?? 0) !== 0);
  }

  /** A harness's: how many kinds of see-through the engine holds, and how many of them thin anything this frame (a
   *  hole, a share of the whole, a door open). */
  now(): { held: number; thinning: number } {
    return { held: this.kinds.length, thinning: this.kinds.filter((see) => !this.solid(see)).length };
  }
}
