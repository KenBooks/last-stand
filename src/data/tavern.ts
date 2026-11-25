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

/** His face on his talk card, drawn from his model looking at the camera (Kenneth's round 3; the village folk's
 *  portraits, `ui/guide/folkPortraits.ts`, which stage him and square his head and eyes to the camera themselves): his
 *  neck's and head's turns over that (rad: his head a little down, as a man looks at one across his bar), and a framing
 *  kept for a picture of his own (m over his feet it looks at, how far before his face, its field of view in degrees;
 *  the folk share `FOLK_SHOT`'s now). */
export const KEEPER_PORTRAIT = { neck: { pitch: 0, yaw: 0 }, head: { pitch: -0.04, yaw: 0 }, frame: { at: 1.66, far: 0.62, fov: 26 } } as const;

/** a place on the room's floor: where he stands for a task, and which way he faces (rad: 0 to +z, a quarter to +x) */
export interface Spot { x: number; z: number; facing: number }
const WEST = -Math.PI / 2, EAST = Math.PI / 2, NORTH = Math.PI;

/** where he serves from behind the bar, facing west across it (and where a hero asks him) */
export const KEEPER_SPOT = { x: 4.85, z: -0.7 } as const;
/** the bar: its middle line, its top, how far each of its edges is from that line, and how far along the room it runs */
export const BAR = { x: 4.1, top: 1.07, half: 0.35, from: -3.1, to: 1.0 } as const;
/** the back counter behind him against the east wall, under the bottles' shelves: its front edge, its top, and how far
 *  along the room it runs (his clean mugs and his wash tub stand on it) */
// (its top under his elbows as they swing walking the aisle behind the bar, which holds him nearer it than the bar: at
// 0.9 his left elbow's ball went 2.2 cm into its edge, `lab tavern`)
export const BACK = { front: 5.0, wall: 5.4, top: 0.86, from: -1.95, to: 0.75 } as const;

/** how many mugs the tavern has, every one of them somewhere at all times (game/mugs.ts) */
// (ten, from Kenneth's round 3: "10 cups")
export const MUG_COUNT = 10;
/** where each clean mug stands on the back counter (z), in a row, mouth up: a mug's width and a finger apart */
export const SHELF_SLOTS: readonly number[] = Array.from({ length: MUG_COUNT }, (_, i) => -1.86 + i * 0.1);
/** the wash tub on the back counter: its middle (z) and its radius (m), and how high its water stands over the counter */
// (wider, open: a mug and both his hands go in it; Kenneth's round 4)
export const TUB = { z: 0.3, r: 0.2, water: 0.1 } as const;

/** his places: the tap (his serving spot), the clean mugs, the tub, the bottles' shelf, the cask's tap, the bar's
 *  end where he comes out into the room, and in the room the hearth, the two tables he wipes and the broom's and
 *  the poker's corners */
export const PLACES = {
  tap: { x: KEEPER_SPOT.x, z: KEEPER_SPOT.z, facing: WEST },
  mugs: { x: 4.73, z: -1.41, facing: EAST },
  tub: { x: 4.78, z: TUB.z, facing: EAST },
  bottles: { x: 4.8, z: -0.6, facing: EAST },
  cask: { x: 4.8, z: -0.36, facing: WEST },
  // (a long arm's and a poker's length back from the fire: at 2.75 his boots were nearly in it, "he is too close to
  // that fire, distance him a bit")
  hearth: { x: 0.6, z: -2.45, facing: NORTH },
  smallTable: { x: 0.82, z: -0.68, facing: Math.atan2(-0.52, 0.48) },
  // (the long table wiped from each of its ends, close in: from 0.45 m past its end, his rag went into the air)
  longTable: { x: -3.8, z: 2.78, facing: NORTH },
  longTableFar: { x: -3.8, z: 0.02, facing: 0 },
  broom: { x: 4.85, z: 1.2, facing: EAST },
  poker: { x: 1.3, z: -2.85, facing: NORTH },
} as const satisfies Record<string, Spot>;
/** where the broom leans against the east wall by the bar's end, and the poker against the hearth (m, its foot) */
export const BROOM_AT = { x: 5.32, z: 1.3 } as const;
export const POKER_AT = { x: 1.45, z: -3.45 } as const;
/** the tables he wipes: their middle and their top (m), how far across its top his rag goes (m), and its edge (a round
 *  one's radius, a long one's half sizes across and along the room, m) */
export const TABLES = {
  smallTable: { x: 0.3, z: -0.2, top: 0.76, reach: 0.32, r: 0.45 },
  longTable: { x: -3.8, z: 1.4, top: 0.76, reach: 0.38, hx: 0.45, hz: 1.1 },
  // (the party's round table by the hearth, its map on it: a mug is set down on it and he collects it from there)
  partyTable: { x: -3.2, z: -1.6, top: 0.76, reach: 0.6, r: 0.75 },
} as const;
/** the floor he sweeps in front of the bar: the way his broom goes (m), out and back */
export const SWEEP: readonly [number, number][] = [[2.7, 1.6], [2.7, -1.4], [2.1, -2.3], [1.5, -1.0], [1.6, 1.6]];
/** the stools before the bar (their middles' z, all `BAR_STOOL_X` along the room): world/houses/tavern.ts builds them,
 *  his ways keep off them (world/tavernNav.ts) */
// (back from the bar's front by what a body sat facing it needs, his knees and shins clear of the counter and his feet
// set between, his forearm on the bar: 0.4 m off it, a sat body facing the bar had his knees in its front; Kenneth's
// round 4, "move the chairs back a bit to have enough space")
export const BAR_STOOL_X = BAR.x - 1.15;
export const BAR_STOOLS: readonly number[] = [-2.2, -1.2, -0.2, 0.7];
/** how high the bar stools' tops stand, and their rung round the legs (m) */
export const BAR_STOOL_HIGH = 0.66, BAR_STOOL_RUNG = 0.25;

/** how fast he walks (m/s) and turns (rad/s: about 170° a second, as a person turns on the spot), and how quickly he
 *  comes up to his pace and down from it (m/s²: over a walker's first step or two, not at full pace in a frame) */
// (turned on the spot no faster than his feet step round under him: at 3 rad/s they fell behind and crossed)
export const WALK = { speed: 1.05, turn: 2.2, accel: 2.2 } as const;
/** how fast he turns on the spot (rad/s: as fast as his feet step round under him, a few steps to a half turn) */
// (1.5 led his feet: the heroes' gait steps round under a turning body, and faster his pelvis turned past his planted
// feet and they read crossed, "when he turns, his feet end up crossing each other")
// (2.4: about round in 1.3 s, brisk as a man turns about, "when he turns around (in the same spot), its very slow",
// Kenneth's round 4; slowed while a planted foot lags, `feetCaughtUp`)
export const TURN_ON_SPOT = 2.4;
/** how far ahead along his way he looks to steer (m), how far from its end he turns to the place's facing as he comes
 *  in (m), and how far off his way's heading it must set off for him to turn on the spot before he walks (rad) */
export const STEER = { look: 0.42, arrive: 0.35, turnFirst: 1.1 } as const;

/** how near the bar's front a hero comes (m, from the stand before the tap) before he leaves what he's doing and comes
 *  to serve, and how long he lingers there after the hero has gone (s) */
export const COME_TO_BAR = { near: 2.6, linger: 4 } as const;
/** how far from the bar's front edge a hero may stand to set his empty mug down on it (m); further, he sets it on the
 *  nearest table */
export const SET_DOWN_WITHIN = 1.4;

/** each of his tasks' time at its place (s), the walk to it aside */
export const TASK = {
  // (the empty one taken quicker, "faster and natural", Kenneth's round 3: drawn in 1.4 s and lifted in 0.8 before)
  take: 0.7, pour: 1.5, slide: 0.9, collect: 0.55, drawIn: 0.9, wash: 4.4, dry: 1.8, shelve: 0.7,
  wipeBar: 9, wipeTable: 6, sweep: 1.4, stoke: 5, cask: 4, bottles: 6, fetch: 0.8,
} as const;
/** a wash's parts (shares of it): the mug lowered into the water by the first, scrubbed inside until the second,
 *  rinsed with two dips until the third, and shaken off over the tub after */
export const WASH = [0.12, 0.6, 0.8] as const;
/** his serving's beats, from the mug taken off the back counter at the tap (s): the pour, the slide */
export const SERVE = { fill: [0.3, 1.7], slide: [1.9, 2.6], long: 2.9 } as const;
/** how far the hero may have walked from the bar's front (m) when the mug reaches him, or it waits on the bar */
export const SERVED_WITHIN = 1.8;

/**
 * The ale: drunk over `castTime` (s), standing still (`still`: nothing cast over it, no step taken), its gulps and its
 * last sigh played by the skill (`fireAt` early, so the gulps can be timed from it). Free; drunk to the end it
 * fortifies him for his next run (`ALE_BOOST`, game/aleBoost.ts), with foam on his lips and a contented "Ahh".
 */
/** what the ale gives, drunk to the end (game/aleBoost.ts): his life's most this share more in his next run, for
 *  its first `waves` waves at most; one at a time, never stacked (from Kenneth's round 3) */
export const ALE_BOOST = { life: 0.05, waves: 5 } as const;
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
