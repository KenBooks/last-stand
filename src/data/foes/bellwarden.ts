// The Bell-Warden: the Crypt's second boss, a cracked bronze bell on a yoke borne by four chained ghouls.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures), the trophy its fall hangs in the
// house of records, and its own numbers past the kit's (`BELL_WARDEN`): read by data/enemies.ts with every other
// foe's file in this folder. Its fight is entities/bellWarden.ts, its model models/bellWarden.ts.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { bellwarden: true } }

export const FOES: FoeFile = {
  bellwarden: {
    def: {
      name: 'The Bell-Warden', model: 'bellwarden', ai: 'bellWarden',
      life: 4600, damage: 110, damageType: 'physical', speed: 1.5, radius: 3,
      range: 5, windup: 1, recover: 1, cooldown: 4.2,
      summon: 'husk',
      cost: 0, score: 70, knockbackResist: 1, freezeResist: 0.7, boss: true, accent: 0x5a7cff,
      // (its heavy frame turned slowly: at a small foe's quick turn the whole bell spun round on the spot as it followed
      // a hero, "rotates its axis")
      turn: 0.8,
      // (as the Ossuary Cantor's guard: about a quarter of its life and three quarters of its damage, two of them at once)
      // (as a guard: a lesser bell, about half its height, so its Cantor towers over it: from play, two full-size
      // Bell-Wardens were "too big (almost like main boss)"); standing where it rises, tolling from there (from play:
      // "They stay stationary")
      asGuard: { life: 0.26, damage: 0.75, size: 0.55, stands: true },
      bossKit: {
        phases: [
          { below: 1 },
          { below: 0.6, banner: 'The bell splits · It tolls twice' },
          { below: 0.25, banner: 'The bearers kneel · It tolls without pause' },
        ],
        // (a toll's warning is the bell swung back, glowing and creaking; a double toll's the same, then its slow ring)
        attacks: { toll: { warn: 1.05, recover: 1.0 }, doubleToll: { warn: 1.05, recover: 1.5 } },
        weak: { taken: 2, edge: 0xffd27a },
        // (the four bearers' chains, at the yoke's corners: front left, front right, back left, back right)
        parts: { angles: [0.55, -0.55, 2.59, -2.59], life: 0.035, share: 1 },
      },
    },
    note: {
      role: 'The Ossuary Cantor\'s guard',
      does: 'A cracked bronze bell hung in a wooden frame, a ghost about it: in the Crypt two of them come with the Ossuary Cantor as its guards, lesser bells half the size of a Bell-Warden of old, set down on the ground with no bearers to carry them. Each stands where it rises and tolls from there, a short ring of sound that stuns whoever is close. While either stands, the Cantor is warded.',
      strengths: ['While either guard stands, the Cantor takes only a fraction of the damage.', 'While it stands it raises the dead round its frame now and then.', 'Its toll stuns you briefly if you are close to the bell when it rings.', 'Two of them at once, from two sides, as the Cantor casts.'],
      weaknesses: ['A lesser bell: little Health, and a toll that only reaches those nearby.', 'It never moves from where it rises: fight the Cantor away from it and its toll cannot reach you.', 'The bell swings back and glows before every toll: that is your warning.', 'A raised shield facing the bell, a dash or a leap carries you through its ring.', 'Its ghost grabs no one, and it never grows stronger as it is hurt.', 'Its dead stop rising the moment it falls.', 'Its tolls never land together with the Cantor\'s casts.'],
      beat: ['Kill the two guards first: the Cantor\'s ward falls with the last of them.', 'Keep a few steps off the bell when it swings back, then close in after the toll.', 'Break its chains from its sides to drop the bell and finish it quickly.'],
      vs: {
        warrior: 'Raise the shield towards the bell as it swings: the toll cannot stun you through it.',
        mage: 'Blink through the ring as it reaches you, then burn the bell down before turning on the Cantor.',
        ranger: 'Shoot it from beyond its ring; it is the Cantor\'s ward you are breaking.',
      },
    },
    // (the Bell-Warden's crest: cracked bronze and its toll's pale light)
    trophy: { name: "The Bell-Warden's Crest", look: 'crest', colour: 0xa0702e, trim: 0xc8d8ff },
  },
};

/**
 * The Bell-Warden's own numbers (entities/bellWarden.ts). `toll`: its ring rolls out at `speed` (m/s) to `reach` (m),
 * fading as it goes; a hero it reaches is stunned `stun` s and hurt `hurt` of its damage, unless his shield is raised
 * towards it, he's in a dash or a leap, or it has rolled past `stunsTo` (m), faded. A double toll's fast ring goes at
 * `fast` (m/s), its slow one at `slow` and a moment after. Every `raiseEvery` tolls it raises `raise` [least, most]
 * Hollow Husks from round the arena, while fewer than `aliveMost` foes stand. Phase 1 `cooldown` (s) between tolls;
 * the last phase stands still and tolls every `lastEvery` s. Its chains all broken, the bell is down for `down` s
 * (its weak-spot window), then its bearers rise and the chains are whole again. From the second phase a hero's hit
 * may break a shard off (`shards`: at most one each `every` s, `chance` a hit), thrown `throw` m [least, most] to lie
 * `lies` s, hurting `hurt` of its damage every `tick` s whoever stands within `radius` m. A ghost circling it seizes a
 * hero who comes within `grab.reach` m of it as it swoops under `grab.under` m: carried up `rise` m and `away` m out
 * from the bell over `carry` s, dropped from there (`fall` s) for `hurt` of its damage; that ghost seizes no one for
 * `every` s, and the hero isn't seized again for `grace` s. As an encounter's guard (`guard`) it's a lesser bell: its
 * ring reaches `reach` m and stuns only within `stunsTo`, for `stun` s, hurting `hurt` of its damage; its light, shake
 * and sound `soft` of a whole bell's, rung `pitch` higher; one ghost, which seizes no one; no phases, so no double
 * toll, no shards and no last phase.
 */
export const BELL_WARDEN = {
  toll: { speed: 9, reach: 24, stunsTo: 15, stun: 2, hurt: 0.45, band: 0.6, fast: 15, slow: 6.5, slowAfter: 0.25 },
  raiseEvery: 2, raise: [3, 4] as [number, number], aliveMost: 16,
  lastEvery: 3,
  down: 6,
  shards: { every: 0.9, chance: 0.35, throw: [2.5, 6] as [number, number], lies: 4, radius: 0.9, hurt: 0.22, tick: 0.5 },
  grab: { reach: 2.2, under: 3.4, carry: 1.1, rise: 2.4, away: 3, fall: 0.35, hurt: 0.45, every: 6, grace: 4.5 },
  // its bell's toll as a pendulum's swing about the yoke (models/bellWarden.ts): `amp` its widest (rad), building over
  // the warning to its strike at the forward end, dying away over `after` of its swing after; `sway` walking (rad)
  swing: { amp: 0.34, after: 2.4, sway: 0.05 },
  guard: {
    reach: 10, stunsTo: 6, stun: 0.8, hurt: 0.3, soft: 0.4, pitch: 1.6,
    // a standing guard raises `count` of the dead round its frame, `near` m out, every `every` s while it stands: at
    // most `ownMost` of its own up, none past the wave's alive limit (from play: "make sure they spawn mobs once in
    // a while")
    raise: { first: 6, every: [15, 20] as [number, number], count: [2, 3] as [number, number], near: [3.5, 6] as [number, number], ownMost: 5 },
  },
};
