// The Training Dummy: the lobby's target practice, never part of a wave.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { dummy: true } }

/** Height where the sack starts and the exposed post ends, above the dummy's floor. */
export const DUMMY_SACK_BOTTOM = 0.86;

export const FOES: FoeFile = {
  // lobby target practice; never part of a wave
  dummy: {
    def: {
      name: 'Training Dummy', model: 'dummy', ai: 'idle',
      life: 1, damage: 0, damageType: 'physical', speed: 0, radius: 0.55,
      range: 0, windup: 0, recover: 0, cooldown: 0,
      cost: 0, score: 0, knockbackResist: 1, dummy: true,
    },
  },
};
