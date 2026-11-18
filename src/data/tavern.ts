// The Ember & Oak's keeper and his ale (from play: "add NPC to tavern that you can talk to, and he can give you a free
// beer that you drink for 5 seconds with a nice animation. Guy at tavern must be unique, not like the other ones").
// Where he stands behind his bar (world/rooms.ts builds the bar, entities/models/keeper.ts the man), how long his
// serving takes, and the ale as a skill every hero knows off his bar (combat/skills/ale.ts): cast by the keeper's
// mug reaching him, so a co-op partner's game replays it as any cast and shows the drink.
import type { SkillDef } from '../types';

/** the keeper's name, and what he is (the talk card's, the guide's and the village object's) */
export const KEEPER = { name: 'Bertram Tunwell', title: 'Keeper of the Ember & Oak' } as const;

/** where he stands behind the bar, in the tavern's room (m: x across it, z from back to front), facing west across it,
 *  and the bar he serves over: its middle line, its top, and how far each of its edges is from that line */
export const KEEPER_SPOT = { x: 4.85, z: -0.7 } as const;
export const BAR = { x: 4.1, top: 1.07, half: 0.35 } as const;

/** his serving (s): the mug held under the cask's tap and filled, then set down and slid across to the hero */
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
 *  swallows with the mug tipped up and a breath between, lowers it to his chest and breathes out, content. */
export const ALE_BEATS = {
  /** each swallow's middle (a gulp heard there) */
  gulps: [0.3, 0.46, 0.62],
  /** his contented breath out, the mug at his chest */
  sigh: 0.84,
} as const;
