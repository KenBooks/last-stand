// Enemy archetypes (data/biomes.ts says which appear where). `ai` selects a behavior in entities/enemyAI.js,
// `model` selects a builder in entities/models/index.js.
// Stats are wave-1 values; see SCALING for per-wave growth.
import type { EnemyDef } from '../types';

export type EnemyId = 'imp' | 'husk' | 'witch' | 'brute' | 'colossus' | 'bellwarden'
  | 'thornling' | 'mossback' | 'sporecaller' | 'barkhulk' | 'thornheart' | 'dummy';

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  imp: {
    name: 'Voidling', model: 'imp', ai: 'melee',
    life: 70, damage: 14, damageType: 'physical', speed: 6.2, radius: 0.45,
    range: 1.3, windup: 0.45, recover: 0.5, cooldown: 0.9,
    cost: 1, score: 1, gait: 3.2,
  },
  husk: {
    name: 'Hollow Husk', model: 'husk', ai: 'melee',
    life: 135, damage: 24, damageType: 'physical', speed: 3.7, radius: 0.55,
    range: 1.75, windup: 0.6, recover: 0.6, cooldown: 1.3,
    cost: 1.5, score: 1.5,
  },
  witch: {
    name: 'Rift Witch', model: 'witch', ai: 'ranged',
    life: 105, damage: 34, damageType: 'vitality', speed: 4.3, radius: 0.5,
    range: 13, keepAway: 8.5, windup: 0.75, recover: 0.4, cooldown: 2.2,
    projectile: { speed: 13, radius: 0.35, color: 0xc050ff, trail: 0x1a0428, core: 0.7, look: 'void' },
    evade: { how: 'blink', chance: 0.5, from: ['shot', 'wave', 'rush', 'beam', 'area'], sees: Math.PI / 4, reach: [3, 5.5] },
    cost: 2, score: 2,
  },
  brute: {
    name: 'Cinder Brute', model: 'brute', ai: 'slam',
    life: 620, damage: 80, damageType: 'fire', speed: 3.0, radius: 1.0,
    range: 3.0, slamRadius: 3.4, windup: 1.05, recover: 0.8, cooldown: 2.6,
    throws: { what: 'lava', from: 7, reach: 16, windup: 0.85, recover: 0.6, cooldown: 3.2, flight: [0.85, 0.035], splash: [1.8, 0.75], pool: [1.5, 2.5, 0.3] },
    cost: 5, score: 6, knockbackResist: 0.7, heft: 2.5,
  },
  colossus: {
    name: 'The Hollow Colossus', model: 'colossus', ai: 'boss',
    life: 5200, damage: 110, damageType: 'fire', speed: 2.9, radius: 1.8,
    range: 4.2, slamRadius: 5.5, windup: 1.2, recover: 1.0, cooldown: 2.0,
    projectile: { speed: 12, radius: 0.5, color: 0xff6a2a, trail: 0x1a1210, core: 0.5, look: 'magma' },
    summon: 'imp',
    cost: 0, score: 60, knockbackResist: 1, freezeResist: 0.7, heft: 6, boss: true, accent: 0xb070ff,
  },
  // the Crypt's second boss (data/biomes.ts): a cracked bronze bell on a yoke, borne by four chained ghouls
  // (entities/bellWarden.ts, models/bellWarden.ts); its numbers past the kit's are `BELL_WARDEN`
  bellwarden: {
    name: 'The Bell-Warden', model: 'bellwarden', ai: 'bellWarden',
    life: 4600, damage: 110, damageType: 'physical', speed: 1.5, radius: 3,
    range: 5, windup: 1, recover: 1, cooldown: 4.2,
    summon: 'husk',
    cost: 0, score: 70, knockbackResist: 1, freezeResist: 0.7, boss: true, accent: 0x5a7cff,
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
  thornling: {
    name: 'Thornling', model: 'thornling', ai: 'melee',
    life: 62, damage: 13, damageType: 'physical', speed: 6.6, radius: 0.42,
    range: 1.25, windup: 0.4, recover: 0.5, cooldown: 0.85,
    cost: 1, score: 1, gait: 3.2,
  },
  mossback: {
    name: 'Mossback', model: 'mossback', ai: 'melee',
    life: 150, damage: 25, damageType: 'physical', speed: 3.5, radius: 0.62,
    range: 1.8, windup: 0.65, recover: 0.6, cooldown: 1.35,
    cost: 1.5, score: 1.5, knockbackResist: 0.3,
  },
  sporecaller: {
    name: 'Sporecaller', model: 'sporecaller', ai: 'ranged',
    life: 95, damage: 32, damageType: 'vitality', speed: 4.0, radius: 0.5,
    range: 12.5, keepAway: 8, windup: 0.8, recover: 0.4, cooldown: 2.3,
    projectile: { speed: 11.5, radius: 0.38, color: 0x9cff3a, trail: 0x2c4a1c, core: 0.6, look: 'spore' },
    evade: { how: 'duck', chance: 0.5, from: ['shot'], sees: Math.PI / 4, down: 1.1, top: 0.5 },
    cost: 2, score: 2,
  },
  barkhulk: {
    name: 'Barkhide Hulk', model: 'barkhulk', ai: 'slam',
    life: 660, damage: 76, damageType: 'physical', speed: 2.8, radius: 1.0,
    range: 3.0, slamRadius: 3.4, windup: 1.1, recover: 0.8, cooldown: 2.6,
    throws: { what: 'vine', from: 6, reach: 15, windup: 0.8, recover: 0.6, cooldown: 4, creep: [13, 0.6, 1.5] },
    cost: 5, score: 6, knockbackResist: 0.75, heft: 2.5, accent: 0x9cff3a,
  },
  thornheart: {
    name: 'The Elder Thornheart', model: 'thornheart', ai: 'boss',
    life: 5400, damage: 105, damageType: 'vitality', speed: 2.7, radius: 1.8,
    range: 4.2, slamRadius: 5.5, windup: 1.2, recover: 1.0, cooldown: 2.0,
    projectile: { speed: 12, radius: 0.5, color: 0x6fd82a, trail: 0x2c4a1c, core: 0.55, look: 'spore' },
    summon: 'thornling',
    cost: 0, score: 60, knockbackResist: 1, freezeResist: 0.7, heft: 6, boss: true, accent: 0x7aff50,
  },
  // lobby target practice; never part of a wave
  dummy: {
    name: 'Training Dummy', model: 'dummy', ai: 'idle',
    life: 1, damage: 0, damageType: 'physical', speed: 0, radius: 0.55,
    range: 0, windup: 0, recover: 0, cooldown: 0,
    cost: 0, score: 0, knockbackResist: 1, dummy: true,
  },
};

/** How a boss fights (entities/enemyAI.ts `boss`): its first call for help `summonFirst` s in and then every
 *  `summonEvery` s, `summonCount` of its `summon` each time, while fewer than `crowd` foes stand; it slams when within its
 *  reach and `slamReach` m more; within `volleyReach` m, with a clear line, two volleys (`volleys`: the bolts in each,
 *  `apart` rad between them, the second aimed ahead of the hero), `volleyCooldown` times its cooldown before the next. */
export const BOSS_AI = {
  summonFirst: 6, summonEvery: 14, summonCount: 4, summonRing: 3.5, crowd: 14,
  slamReach: 1.5, volleyReach: 18, volleyCooldown: 1.3,
  volleys: [{ bolts: 7, apart: 0.14 }, { bolts: 5, apart: 0.2 }],
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
 * `lies` s, hurting `hurt` of its damage every `tick` s whoever stands within `radius` m.
 */
export const BELL_WARDEN = {
  toll: { speed: 9, reach: 24, stunsTo: 15, stun: 2, hurt: 0.45, band: 0.6, fast: 15, slow: 6.5, slowAfter: 0.25 },
  raiseEvery: 2, raise: [3, 4] as [number, number], aliveMost: 16,
  lastEvery: 3,
  down: 6,
  shards: { every: 0.9, chance: 0.35, throw: [2.5, 6] as [number, number], lies: 4, radius: 0.9, hurt: 0.22, tick: 0.5 },
};

// Elite ("hero") modifiers applied on top of a base archetype.
export const HERO = {
  lifeMult: 3.2,
  damageMult: 1.5,
  scale: 1.22,
  score: 5,
  prefixes: ['Grim', 'Dread', 'Ashen', 'Wailing', 'Ruinous', 'Vile', 'Hungering', 'Pale'],
  auraColors: [0xff5030, 0xb050ff, 0x40c8ff, 0xffd040],
};

export const SCALING = {
  life: (w: number) => 1 + 0.24 * (w - 1) + 0.018 * (w - 1) ** 2,
  damage: (w: number) => 1 + 0.11 * (w - 1),
  speed: (w: number) => Math.min(1.25, 1 + 0.012 * (w - 1)),
};
