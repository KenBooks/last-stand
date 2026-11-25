// The game's kinds of see-through as the engine holds them (`SeeKind` in its common.wgsl): what's dissolved where it
// hides the hero, each kind's numbers written to the frame's globals as the game has them (core/seeThrough.ts).
import * as THREE from 'three';
import { BLEND_GONE, SIGHT_CONE, coverRuleNow, type SeeThrough } from '../core/seeThrough';
import { SIGHT, nearDoorAt, seesInAt, seesIntoRoom } from '../core/sight';
import { HALL, TERRACE } from '../data/village';
import type { Core } from './core';
import { GLOBALS, TUNE } from './globals';
import { ROOMS } from './ahead';
import { PIPELINES } from './pipelinesAside';
import { G } from '../state';

/** the kinds of see-through the engine holds, the floats of each (`SeeKind` in its common.wgsl), and how far under
 *  the hero's floor is still clear of his hole (`FLOOR_CLEAR` in core/seeThrough.ts) */
const SEE_KINDS_MOST = 32, SEE_KIND_FLOATS = 20, SEE_FLOOR_CLEAR = 0.12;

/** A record's flags a material's see-through sets (Bulwark's plan.rs: `SOLID`, `THINNED`, `ONE_LAYER`), and one of
 *  the page's own: all of it is thinned to nothing, and it's in the frame for its shadow alone. */
/** how long a room's roof and walls take to open as he walks in, and to close as he leaves (s) */
const INSIDE_FADE = 0.4;
/** how far in its room a wall reads him while he sees into it from outside: enough for it to open over that room's
 *  floor alone, as from inside, and too little for any of it to go as the wall before him does there */
const SEEN_IN = 0.002;
/** the share of the opening a wall seen from in its room by its door takes: about two fifths of it left, over twice what's
 *  left from outside. Its inner face is dark, and at a sixth nothing of it showed but the door frame's edges (from
 *  play, "Make it stronger") */
// (0.6 of it: its jambs and leaves were too faint to tell what he walked into, from play "you thinned door
// geometry too much, can't see I'm stuck because of it")
const DOOR_FROM_INSIDE = 0.35;
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
      let seenIn = 0;
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
        // (and a wall of a room he sees into from outside, through its door, the same, `SEEN_IN`: read by the floor
        // its terrace gives it, a side wall opened on the paving past it he saw out of its window, a strip of lit
        // meadow in the room's far corner, from play "can see grass in top right corner", "you didn't fix the issue")
        if (TUNE.wallsSeenIn && see.walls && inside <= 0 && ROOMS.ready && seesIntoRoom(see.walls)) seenIn = SEEN_IN;
        const [box, more] = ((inside > 0 || seenIn > 0) && see.walls ? [see.walls, see.porch] : see.floorBoxes) ?? [];
        g[at + 12] = box ? box[0] : -1e5; g[at + 13] = box ? box[1] : -1e5;
        g[at + 14] = box ? box[2] : 1e5; g[at + 15] = box ? box[3] : 1e5;
        g[at + 8] = more ? more[0] : 0; g[at + 9] = more ? more[1] : 0;
        g[at + 17] = more ? more[2] : 0; g[at + 18] = more ? more[3] : 0;
        g[at + 16] = SEE_FLOOR_CLEAR;
        // (what has a reach of its own stands as one, a column: judged by its foot, all of it alike, and the share of
        // it left there its own)
        g[at + 10] = see.reach ? Math.max(TUNE.columnLeft, 0.01) : 0;
        // (and how high it stands over its floor: where it stands over him it's a ghost from foot to top, all of
        // it alike; by each pixel's place its shaft was cut through and its capital left in the air, from play
        // "just odd geometry... we should not make player wondering what the geometry was before thinning")
        if (see.reach) g[at + 7] = TUNE.columnsWhole ? see.high ?? 0 : 0;
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
      if (cover) g[at + 19] = see.roofs ? inside : -Math.max(inside, TUNE.housesWhole ? 0 : seenIn);
      // (and a wall with the door he stands before and sees in through opens whole, to the rule's ghost: from
      // play, "he just needs to see whole wall behind it")
      // (not till the pipelines its room's layers are drawn apart with have compiled, `ROOMS`)
      // (and from in its room by the door, by how far he stands in the room: "same problem but the other way
      // around")
      // (eased as the roof is: seen aside of the door, by his rays, it's on or off)
      if (cover) {
        const asked = ROOMS.ready && see.walls && see.door ? this.seesIn(see.door.value, inside, see.walls) : 0;
        const had = this.opens.get(see) ?? asked;
        const opens = had + Math.sign(asked - had) * Math.min(Math.abs(asked - had), passed / INSIDE_FADE);
        this.opens.set(see, opens);
        g[at + 6] = opens;
      }
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

  /** How far he stands by the door between `jambs` (x, z, x, z) seeing through it: before it, seeing in
   *  (`seesInAt`), or `inside` its room (0 to 1), seeing out (`nearDoorAt`). */
  private seesIn(jambs: THREE.Vector4, inside: number, room: readonly [number, number, number, number]): number {
    const x = (jambs.x + jambs.z) / 2;
    // (not by his rays while he stands in the room itself: there it opens by the lesser share)
    const before = inside > 0 ? seesInAt(x, jambs.y) : seesInAt(x, jambs.y, room);
    return Math.max(before, inside * nearDoorAt(x, jambs.y) * DOOR_FROM_INSIDE);
  }

  /** when the kinds were last written (the page's ms), and how far he stands in each kind's room, 0 to 1 */
  private wrote = 0;
  private readonly inside = new Map<SeeThrough, number>();
  /** how far each kind's wall is opened whole by its door, eased */
  private readonly opens = new Map<SeeThrough, number>();

  /** Whether the watcher stands in the room `see`'s kind roofs or walls (`roofs`, `walls`). */
  under(see: SeeThrough): boolean {
    const room = see.roofs ?? see.walls;
    if (!room) return false;
    const within = (x: number, z: number): boolean => x > room[0] && x < room[2] && z > room[1] && z < room[3];
    const from = SIGHT.uSightFrom.value;
    if (within(from.x, from.y)) return true;
    // (a roof with the camera over its room too, the watcher outside it: the owner's rule, "if camera OR hero
    // is inside the building, we thin the whole roof". By the floor he saw alone, the roof before a camera
    // over the hall was a dark sheet with slanted edges over the room, "and this looks weird too")
    const eye = G.camera?.position;
    if (!see.roofs) return false;
    if (eye && within(eye.x, eye.z)) return true;
    // (and a roof over a room he sees any of from outside, through its door: by the floor he saw alone the roof
    // opened over a strip of it, wider or narrower with the zoom, "logical incoherence at different zoom
    // levels, either can or cannot see the right side of the hall... if player can see inside the home
    // (anything), we will thin whole roof 100%")
    return seesIntoRoom(see.roofs);
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
