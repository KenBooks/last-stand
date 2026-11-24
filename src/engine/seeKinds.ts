// The game's kinds of see-through as the engine holds them (`SeeKind` in its common.wgsl): what's dissolved where it
// hides the hero, each kind's numbers written to the frame's globals as the game has them (core/seeThrough.ts).
import * as THREE from 'three';
import { BLEND_GONE, SIGHT_CONE, coverRuleNow, type SeeThrough } from '../core/seeThrough';
import { SIGHT, seesInAt } from '../core/sight';
import { HALL, TERRACE } from '../data/village';
import type { Core } from './core';
import { GLOBALS, TUNE } from './globals';
import { ROOMS } from './ahead';
import { PIPELINES } from './pipelinesAside';

/** the kinds of see-through the engine holds, the floats of each (`SeeKind` in its common.wgsl), and how far under
 *  the hero's floor is still clear of his hole (`FLOOR_CLEAR` in core/seeThrough.ts) */
const SEE_KINDS_MOST = 32, SEE_KIND_FLOATS = 20, SEE_FLOOR_CLEAR = 0.12;

/** A record's flags a material's see-through sets (Bulwark's plan.rs: `SOLID`, `THINNED`, `ONE_LAYER`), and one of
 *  the page's own: all of it is thinned to nothing, and it's in the frame for its shadow alone. */
/** how long a room's roof and walls take to open as he walks in, and to close as he leaves (s) */
const INSIDE_FADE = 0.4;
export const SEE_FLAGS = { solid: 16, thinned: 64, oneLayer: 256, cover: 512, underLayers: 1024, gone: 1 << 20 } as const;

/** A material as the kinds read it: three's, with the game's see-through on it. */
type Seen = THREE.Material & { seeThrough?: unknown };

/** a kind's `k.w` at or under this thins whole wherever it stands (`see_fade`: under -100) */
const GONE_REACH = -100;
/** a kind's code as a cover (`SeeKind.b.w` in the engine's common.wgsl) */
const COVER = 5;
/** and of one whose share left is its alpha, blended (`rust.houseSmooth`) */
const COVER_SMOOTH = 6;

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
    // (how far the houses' rule is on: a cover dropped where it hides ground he sees)
    const rule = this.coverRule();
    // (`rust.housesWhole`: a house's parts drawn as covers still, as they are played, and the rule opening none:
    // thinned as their kinds were instead, a roof's verge and a sign were drawn in another order than played)
    g[GLOBALS.seeHall + 7] = TUNE.housesWhole ? 0 : rule;
    if (ROOMS.asked && !ROOMS.ready && PIPELINES.compiling === 0) ROOMS.ready = true;
    const now = performance.now();
    const passed = Math.min(0.1, Math.max(0, (now - this.wrote) / 1000));
    this.wrote = now;
    for (let slot = 0; slot < this.kinds.length; slot++) {
      const see = this.kinds[slot], at = GLOBALS.seeKinds + slot * SEE_KIND_FLOATS;
      const cover = rule > 0 && !!see.cover;
      see.k.value.toArray(g, at);
      // (a cover on a floor of its own hides the ground at that height: the hall on its terrace, seen from the stair)
      g[at + 4] = cover && see.floor !== undefined ? see.floor + SEE_FLOOR_CLEAR : see.minY.value;
      g[at + 5] = see.across.value; g[at + 6] = see.whole.value; g[at + 7] = see.ramp.value;
      const reach = see.reach?.value;
      g[at + 8] = reach ? reach.x : 1e5; g[at + 9] = reach ? reach.y : 1e6;
      g[at + 10] = see.doorOn?.value ?? 0;
      // (3 and 4: blended, and the nearest of its layers alone drawn, which keeps the kind's share itself)
      g[at + 11] = cover ? (TUNE.houseSmooth ? COVER_SMOOTH : COVER) : see.blended ? (see.pale ? 2 : 1) + (this.oneLayer(see) ? 2 : 0) : 0;
      const room = see.room?.value, door = see.door?.value;
      g[at + 12] = room ? room.x : -1e5; g[at + 13] = room ? room.y : -1e5;
      g[at + 14] = room ? room.z : 1e5; g[at + 15] = room ? room.w : 1e5;
      g[at + 16] = door ? door.x : 0; g[at + 17] = door ? door.y : 0;
      // (a cover reads these as where its raised floor lies, in two boxes, and the ground's height past them)
      if (cover) {
        // (how far he stands in the room it roofs or walls, eased: from play, "lets make thinning a fade in/out...
        // not instant appear/disappear")
        // (and not at all till the pipelines a room is drawn with from inside have compiled, `ROOMS`)
        const toward = ROOMS.ready && this.under(see) ? 1 : 0;
        const was = this.inside.get(see) ?? toward;
        const inside = was + Math.sign(toward - was) * Math.min(Math.abs(toward - was), passed / INSIDE_FADE);
        this.inside.set(see, inside);
        // (a wall of the room he stands in reads its room as its floor's one box)
        // (and the floor past its walls he may see out to as the other: its porch)
        const [box, more] = (inside > 0 && see.walls ? [see.walls, see.porch] : see.floorBoxes) ?? [];
        g[at + 12] = box ? box[0] : -1e5; g[at + 13] = box ? box[1] : -1e5;
        g[at + 14] = box ? box[2] : 1e5; g[at + 15] = box ? box[3] : 1e5;
        g[at + 8] = more ? more[0] : 0; g[at + 9] = more ? more[1] : 0;
        g[at + 17] = more ? more[2] : 0; g[at + 18] = more ? more[3] : 0;
        g[at + 16] = SEE_FLOOR_CLEAR;
        // (what has a reach of its own stands as one, a column: judged by its foot, all of it alike, and the share of
        // it left there its own)
        g[at + 10] = see.reach ? Math.max(TUNE.columnLeft, 0.01) : 0;
      }
      // (its cone of his sight, and the share it thins by there: none for a kind that reads none of his sight)
      // (a cover's second box ends in the first of these: written over, the box reached to the village's middle)
      if (!cover) g[at + 18] = sightOf(see);
      g[at + 19] = see.sight ? see.sightShare ?? 1 : 0;
      // (a cover reads it as how far he stands in the room it roofs: all of it opens then, the owner's one
      // exception to the rule, "if the player is inside a building... we will thin whole roof no matter what")
      // (a roof by how far he stands under it; a wall of his room the same under 0: over its room alone)
      // (`rust.housesWhole`, a harness's frame of nothing thinned: neither then)
      const inside = TUNE.housesWhole ? 0 : this.inside.get(see) ?? 0;
      if (cover) g[at + 19] = see.roofs ? inside : -inside;
      // (and a wall with the door he stands before and sees in through opens whole, to the rule's ghost: from
      // play, "he just needs to see whole wall behind it")
      // (not till the pipelines its room's layers are drawn apart with have compiled, `ROOMS`)
      if (cover) g[at + 6] = ROOMS.ready && see.walls && see.door ? this.seesIn(see.door.value) : 0;
      // (`rust.see` off: nothing of any kind thinned; `rust.housesWhole`: nothing of a house's, a harness's frame)
      if (!TUNE.see || (TUNE.housesWhole && see.cover)) { g[at + 2] = 0; g[at + 6] = 0; g[at + 10] = 0; g[at + 18] = 0; }
    }
  }

  /** How far the houses' rule is on this frame, 0 to 1 (`rust.houseRule`): from above, with the fog of what he can't
   *  see on, whose answer it reads. Off, a cover is thinned as its kind was, by the game's own shares. */
  coverRule(): number {
    if (!TUNE.houseRule || !TUNE.see || TUNE.sightFog <= 0 || SIGHT.uSightOn.value <= 0) return 0;
    return coverRuleNow() * (1 - TUNE.houseLeft);
  }

  /** How far he stands before the door between `jambs` (x, z, x, z) seeing in through it (`seesInAt`). */
  private seesIn(jambs: THREE.Vector4): number {
    return seesInAt((jambs.x + jambs.z) / 2, jambs.y);
  }

  /** when the kinds were last written (the page's ms), and how far he stands in each kind's room, 0 to 1 */
  private wrote = 0;
  private readonly inside = new Map<SeeThrough, number>();

  /** Whether the watcher stands in the room `see`'s kind roofs or walls (`roofs`, `walls`). */
  under(see: SeeThrough): boolean {
    const room = see.roofs ?? see.walls;
    const from = SIGHT.uSightFrom.value;
    return !!room && from.x > room[0] && from.x < room[2] && from.y > room[1] && from.y < room[3];
  }

  /** Whether `see`'s kind is a cover now: a part of a house, with the houses' rule on. */
  cover(see: SeeThrough | undefined): boolean {
    return !!see?.cover && this.coverRule() > 0;
  }

  /** Whether what's of `see`'s kind lies in layers of which the engine draws the nearest alone (`rust.oneLayer`). */
  oneLayer(see: SeeThrough | undefined): boolean {
    return TUNE.oneLayer > 0 && !!see?.blended && !!see.oneLayer && !this.cover(see);
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
    if (!TUNE.goneWhole || !TUNE.see || !see?.blended || see.reach || see.room || this.cover(see)) return false;
    if (see.k.value.w > GONE_REACH) return false;
    // (with the fog of what he can't see on, the engine thins such a kind only where it hides floor he sees, and
    // leaves it whole over the rest: a share of 1 is no longer nothing drawn)
    if (TUNE.sightFog > 0 && SIGHT.uSightOn.value > 0) return false;
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
    // (a cover left as a smooth ghost: blended by the share the rule leaves, whatever its material says of its own
    // blending; the nearest of a house's layers alone drawn, a column a layer of its own under them: the nearest
    // alone drawn, a roof over it left none of it)
    // (not one that is a ghost of its own already, its opacity under 1: a layer's depth is written whatever its
    // alpha, and an unseen sheet of a house's stood nearest, a sign and a roof's verge behind it never shaded)
    if (this.cover(see) && TUNE.houseSmooth && material.transparent && material.opacity >= 1) {
      return SEE_FLAGS.thinned | (see.reach ? SEE_FLAGS.underLayers : SEE_FLAGS.oneLayer);
    }
    // (a cover is never blended: drawn with what's opaque and writing its depth, its pixels over ground he sees
    // dropped, whatever its material says of its depth: the hall's roof writes none, and blended whole its three
    // layers were 2.1 ms of a 5.1 ms frame)
    if (this.cover(see) && material.opacity >= 1 && material.blending === THREE.NormalBlending) {
      return material.transparent ? SEE_FLAGS.cover : 0;
    }
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
