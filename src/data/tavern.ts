// The Ember & Oak's keeper, his mugs and his ale (from play: "add NPC to tavern that you can talk to, and he can give
// you a free beer that you drink for 5 seconds with a nice animation. Guy at tavern must be unique, not like the other
// ones"; then, "All cups should be accounted for... he has some standing on the side, he actually grabs one... pours
// some beer, and gives it to you... the bartender comes to wherever the cup was left, and washes it, and after places
// it back with the other cups... if you keep asking for drinks you could run out of cups. Give him more tasks to do").
// Where everything he works at stands, in the tavern's room (m: x across it, west to east, z from back to front; the
// bar runs down its east side, he works behind it), how long each of his tasks takes, and the ale as a skill every hero
// knows off his bar (combat/skills/ale.ts). His day is world/tavern.ts, his mugs game/mugs.ts.
import type { SkillDef } from '../types';

/** the keeper's name, and what he is (the talk card's, the guide's and the village object's) */
export const KEEPER = { name: 'Bertram Tunwell', title: 'Keeper of the Ember & Oak' } as const;

/** a place on the room's floor: where he stands for a task, and which way he faces (rad: 0 to +z, a quarter to +x) */
export interface Spot { x: number; z: number; facing: number }
const WEST = -Math.PI / 2, EAST = Math.PI / 2, NORTH = Math.PI;

/** where he serves from behind the bar, facing west across it (and where a hero asks him) */
export const KEEPER_SPOT = { x: 4.85, z: -0.7 } as const;
/** the bar: its middle line, its top, how far each of its edges is from that line, and how far along the room it runs */
export const BAR = { x: 4.1, top: 1.07, half: 0.35, from: -3.1, to: 1.0 } as const;
/** the back counter behind him against the east wall, under the bottles' shelves: its front edge, its top, and how far
 *  along the room it runs (his clean mugs and his wash tub stand on it) */
export const BACK = { front: 5.0, wall: 5.4, top: 0.9, from: -1.95, to: 0.75 } as const;

/** how many mugs the tavern has, every one of them somewhere at all times (game/mugs.ts) */
export const MUG_COUNT = 6;
/** where each clean mug stands on the back counter (z), in a row, mouth up */
export const SHELF_SLOTS: readonly number[] = [-1.78, -1.66, -1.54, -1.42, -1.3, -1.18];
/** the wash tub on the back counter: its middle (z) and its radius (m), and how high its water stands over the counter */
export const TUB = { z: 0.3, r: 0.17, water: 0.1 } as const;

/** his places: the tap (his serving spot), the clean mugs, the tub, the bottles' shelf, the cask's tap, the bar's
 *  end where he comes out into the room, and in the room the hearth, the two tables he wipes and the broom's and
 *  the poker's corners */
export const PLACES = {
  tap: { x: KEEPER_SPOT.x, z: KEEPER_SPOT.z, facing: WEST },
  mugs: { x: 4.78, z: -1.48, facing: EAST },
  tub: { x: 4.78, z: TUB.z, facing: EAST },
  bottles: { x: 4.8, z: -0.6, facing: EAST },
  cask: { x: 4.8, z: -0.36, facing: WEST },
  hearth: { x: 0.6, z: -2.75, facing: NORTH },
  smallTable: { x: 0.82, z: -0.68, facing: Math.atan2(-0.52, 0.48) },
  longTable: { x: -3.8, z: 2.95, facing: NORTH },
  broom: { x: 4.85, z: 1.2, facing: EAST },
  poker: { x: 1.3, z: -2.85, facing: NORTH },
} as const satisfies Record<string, Spot>;
/** where the broom leans against the east wall by the bar's end, and the poker against the hearth (m, its foot) */
export const BROOM_AT = { x: 5.32, z: 1.3 } as const;
export const POKER_AT = { x: 1.45, z: -3.45 } as const;
/** the tables he wipes: their middle and their top (m), and how far across its top his rag goes (m) */
export const TABLES = {
  smallTable: { x: 0.3, z: -0.2, top: 0.76, reach: 0.32 },
  longTable: { x: -3.8, z: 1.4, top: 0.76, reach: 0.38 },
} as const;
/** the floor he sweeps in front of the bar: the way his broom goes (m), out and back */
export const SWEEP: readonly [number, number][] = [[2.7, 1.6], [2.7, -1.4], [2.1, -2.3], [1.5, -1.0], [1.6, 1.6]];
/** the way out from behind the bar into the room and back: past the bar's end, and the ways about the room */
export const BAR_END: readonly [number, number][] = [[4.8, 1.25], [4.25, 1.75]];
export const ROOM_WAYS: Record<string, readonly [number, number]> = {
  aisle: [2.7, 1.7], back: [2.7, -2.4], hearth: [1.35, -2.75], table: [1.45, -1.1], door: [-1.4, 2.95],
};

/** how fast he walks (m/s) and turns (rad/s) */
export const WALK = { speed: 1.05, turn: 5 } as const;

/** how near the bar's front a hero comes (m, from the stand before the tap) before he leaves what he's doing and comes
 *  to serve, and how long he lingers there after the hero has gone (s) */
export const COME_TO_BAR = { near: 2.6, linger: 4 } as const;
/** how far from the bar's front edge a hero may stand to set his empty mug down on it (m); further, he sets it on the
 *  nearest table */
export const SET_DOWN_WITHIN = 1.4;

/** each of his tasks' time at its place (s), the walk to it aside */
export const TASK = {
  take: 0.7, pour: 1.5, slide: 0.9, collect: 0.8, wash: 3.2, dry: 1.8, shelve: 0.7,
  wipeBar: 9, wipeTable: 6, sweep: 1.4, stoke: 5, cask: 4, bottles: 6, fetch: 0.8,
} as const;
/** his serving's beats, from the mug taken off the back counter at the tap (s): the pour, the slide */
export const SERVE = { fill: [0.3, 1.7], slide: [1.9, 2.6], long: 2.9 } as const;
/** how far the hero may have walked from the bar's front (m) when the mug reaches him, or it waits on the bar */
export const SERVED_WITHIN = 1.8;

/**
 * The ale: drunk over `castTime` (s), standing still (`still`: nothing cast over it, no step taken), its gulps and its
 * last sigh played by the skill (`fireAt` early, so the gulps can be timed from it). Free, and grants nothing but a
 * moment's look: foam on his lips, a contented "Ahh" (the coordinator's default: a cosmetic touch, no buff).
 */
export const ALE: SkillDef = {
  key: 'q', impl: 'ale', name: 'Ale', desc: 'A mug of the Ember & Oak\'s ale, on the house.', tags: ['consumable'],
  cost: 0, cooldown: 0, castTime: 5, fireAt: 0.01, still: true, ale: true,
  icon: { glyph: '🍺', color: '#d8a040' },
};

/** The drink's beats (shares of its time): the hand takes the mug off the bar, lifts it to the lips, three long
 *  swallows with the mug tipped up and a breath between, lowers it to his chest and breathes out, content, and sets
 *  it down on the bar before him. */
export const ALE_BEATS = {
  /** each swallow's middle (a gulp heard there) */
  gulps: [0.3, 0.46, 0.62],
  /** his contented breath out, the mug at his chest */
  sigh: 0.8,
  /** the empty mug set down on the bar (its hand's out to it): the ledger's mug from his hand to the bar */
  setDown: 0.95,
} as const;
