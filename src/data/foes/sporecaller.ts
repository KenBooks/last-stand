// The Sporecaller: the Thornwood's caster.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { sporecaller: true } }

export const FOES: FoeFile = {
  sporecaller: {
    def: {
      name: 'Sporecaller', model: 'sporecaller', ai: 'ranged',
      life: 95, damage: 32, damageType: 'vitality', speed: 4.0, radius: 0.5,
      range: 12.5, keepAway: 8, windup: 0.8, recover: 0.4, cooldown: 2.3,
      projectile: { speed: 11.5, radius: 0.38, color: 0x9cff3a, trail: 0x2c4a1c, core: 0.6, look: 'spore' },
      evade: { how: 'duck', chance: 0.5, from: ['shot'], sees: Math.PI / 4, down: 1.1, top: 0.5 },
      cost: 2, score: 2,
    },
    note: {
      role: 'Caster',
      does: 'A fungal caster that stays back and lobs swirling spore orbs at you, ducking under shots it sees coming.',
      strengths: ['Strong ranged hits that lead your movement.', 'Ducks under projectiles from the front.', 'Keeps its distance and strafes behind its allies.'],
      weaknesses: ['Low Health.', 'Its duck only avoids shots: melee blows, areas and beams still land.', 'Must stop to cast.'],
      beat: ['Sidestep when it winds up a throw.', 'Use areas, beams or melee instead of single shots, or hit it while it is ducking out of something else.', 'Break line of sight with a tree or a stone to stop its throws.'],
      vs: { ranger: 'Its duck makes arrows unreliable from the front: Hailfletch from above, or wait until it casts.', mage: 'Starfall drops from above; it cannot duck that.' },
    },
  },
};
