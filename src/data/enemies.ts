// Enemy archetypes (data/biomes.ts says which appear where). `ai` selects a behavior in entities/enemyAI.js,
// `model` selects a builder in entities/models/index.js.
// Stats are wave-1 values; see SCALING for per-wave growth.
import type { EnemyDef } from '../types';

export type EnemyId = 'imp' | 'husk' | 'witch' | 'brute' | 'colossus' | 'twinslab' | 'twinreliquary'
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

  // the Crypt's special boss wave (data/biomes.ts `bossWaves`): the Ossuary Twins, two tall figures of stacked bone and grave cloth
  // linked by a chain of bone, sharing one life (`shares`; entities/twins.ts, models/twins.ts); their numbers past
  // the kit's are `TWINS`. Each is given the pair's whole life: a hit on either takes it from both.
  twinslab: {
    name: 'Slab', pair: 'The Ossuary Twins', shares: 'twinreliquary', model: 'twinslab', ai: 'twins',
    life: 3000, damage: 135, damageType: 'physical', speed: 2.6, radius: 1.5,
    range: 4, windup: 1.0, recover: 0.9, cooldown: 4.2,
    cost: 0, score: 75, knockbackResist: 1, freezeResist: 0.8, heft: 4, boss: true, accent: 0xffc070,
    bossKit: {
      phases: [{ below: 1 }, { below: 0.5, banner: 'Slab takes up the reliquary' }],
      // (the grave slam: the slab lifted a second, brought down; the shoulder charge: a short rush at the nearest hero;
      // the volley, his brother's, once he's alone)
      attacks: { slam: { warn: 1.0, recover: 0.9 }, charge: { warn: 0.6, recover: 1.1 }, volley: { warn: 0.8, recover: 0.8 } },
    },
  },
  twinreliquary: {
    name: 'Reliquary', pair: 'The Ossuary Twins', shares: 'twinslab', model: 'twinreliquary', ai: 'twins',
    life: 3000, damage: 95, damageType: 'vitality', speed: 2.9, radius: 1.0,
    range: 14, windup: 0.8, recover: 0.8, cooldown: 3.6,
    cost: 0, score: 75, knockbackResist: 1, freezeResist: 0.6, boss: true, accent: 0x8fe8ff,
    bossKit: {
      phases: [{ below: 1 }, { below: 0.5, banner: 'Reliquary takes up the slab' }],
      // (the volley of skulls; the mend, a channel a stun breaks; the slam, his brother's, once he's alone)
      attacks: { volley: { warn: 0.8, recover: 0.8 }, mend: { warn: 2.6, recover: 0.4 }, slam: { warn: 1.0, recover: 0.9 } },
    },
  },

  // --- forest ---
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
 * The Ossuary Twins' own numbers (entities/twins.ts). `chain`: the bone chain between them, snapping tight past `max` m
 * apart, dragging both `drag` of the way back together and hurting `hurt` of Slab's damage to a hero within `reach` m of
 * its line. `slam`: the grave slam's ring (m) before Slab, `ahead` m out. `charge`: the shoulder charge's reach (m), speed
 * (m/s), its body's width (m) and its hurt. `volley`: 3 to 5 skulls (more alone), their speed (m/s) and how far they
 * swing out (rad). `mend`: Reliquary mends the pair `heal` of its life once Slab has gone `untouched` s unhit and hurt,
 * the channel broken by a stun. `alone`: the one left standing at half, `faster` and casting `sooner`.
 */
export const TWINS = {
  chain: { max: 15, drag: 0.55, reach: 1.1, hurt: 0.6, every: 1.2 },
  slam: { radius: 3.4, ahead: 2.6 },
  charge: { reach: 9, speed: 15, width: 1.6, hurt: 0.8 },
  volley: { least: 3, most: 5, speed: 12, swing: 0.55, radius: 0.5 },
  mend: { untouched: 5, heal: 0.05 },
  alone: { faster: 1.35, sooner: 0.7 },
  beat: 1.6,
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
