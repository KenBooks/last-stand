// The Thornling: the Thornwood's swarmer.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { thornling: true } }

export const FOES: FoeFile = {
  thornling: {
    def: {
      name: 'Thornling', model: 'thornling', ai: 'melee',
      life: 62, damage: 13, damageType: 'physical', speed: 6.6, radius: 0.42,
      range: 1.25, windup: 0.4, recover: 0.5, cooldown: 0.85,
      cost: 1, score: 1, gait: 3.2,
    },
    note: {
      role: 'Swarmer',
      does: 'Small, darting creatures of thorn and bark that rush in packs and scratch at you from every side.',
      strengths: ['Quicker than most heroes on foot: hard to outrun.', 'Packs spread out round you.', 'The Elder Thornheart calls more of them.'],
      weaknesses: ['Fragile: any area attack shreds a pack.', 'Easily knocked back.'],
      beat: ['Stand your ground and use area skills as they arrive.', 'Do not chase stragglers: let them come.', 'Clear them before the slow heavies reach you.'],
      vs: { warrior: 'Steel Tempest through the middle of the pack.', mage: 'Glacial Nova as they close, then a Cinderburst.', ranger: 'Briarflight at point blank.' },
    },
  },
};
