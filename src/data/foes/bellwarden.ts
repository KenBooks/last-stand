// The Bell-Warden: the Crypt's second boss, on its ladder (data/biomes.ts `bosses`).
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and the trophy its fall hangs in
// the house of records: read by data/enemies.ts with every other foe's file in this folder; its own numbers
// (`BELL_WARDEN`) read by its fight (entities/bellWarden.ts) and the guide.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { bellwarden: true } }

export const FOES: FoeFile = {
  // a cracked bronze bell on a yoke, carried by four chained ghouls (entities/bellWarden.ts, models/bellWarden.ts)
  bellwarden: {
    def: {
      name: 'The Bell-Warden', model: 'bellwarden', ai: 'bellWarden',
      life: 4600, damage: 110, damageType: 'physical', speed: 1.5, radius: 3,
      range: 5, windup: 1, recover: 1, cooldown: 4.2,
      summon: 'husk',
      cost: 0, score: 70, knockbackResist: 1, freezeResist: 0.7, heft: 6, boss: true, accent: 0x5a7cff,
      // (its heavy frame turned slowly: at a small foe's quick turn the whole bell spun round on the spot as it followed
      // a hero, "rotates its axis")
      turn: 0.8,
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
      role: 'Second boss of the Crypt',
      does: 'A cracked bronze bell on a yoke, carried by four chained ghouls. It shuffles after you and tolls: a ring of sound rolls out across the floor and stuns whoever it reaches. Ghosts circle the bell and snatch up anyone who strays too close, carrying them off and dropping them hard.',
      strengths: ['Its toll stuns you where you stand and hurts as it does.', 'Every second toll raises Hollow Husks from the ground around the arena.', 'Wounded, it tolls twice in a row, a fast ring then a slow one, and bronze shards break off it that burn the floor where they land.', 'Near death its bearers kneel and it tolls every few seconds.', 'Its ghosts grab you if you stand too close to the bell as one swoops low.'],
      weaknesses: ['The bell swings back and glows before every toll: that is your warning.', 'A raised shield facing the bell, a dash or a leap carries you through its ring unharmed.', 'The ring fades as it rolls: far enough away, it does not stun.', 'Each bearer\'s chain can be broken by hits from its side; with all four broken the bell drops and takes double damage until they rise again.', 'It cannot be shoved: it holds its ground, but it is slow.'],
      beat: ['Keep at medium range, outside the ghosts\' circle, and step out of its ring\'s reach when the bell swings back.', 'Circle it to break its chains one side at a time, then pour everything in while the bell is down.', 'Clear the Hollow Husks quickly so they do not pin you when the next toll comes.', 'Never stand on the bronze shards.'],
      vs: {
        warrior: 'Raise the shield towards the bell as it swings: the toll cannot stun you through it.',
        mage: 'Blink through the ring as it reaches you, then punish the bell while it recovers.',
        ranger: 'Shoot from beyond its ring and its ghosts; aim at a bearer\'s chain to bring the bell down.',
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
 * `every` s, and the hero isn't seized again for `grace` s.
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
};
