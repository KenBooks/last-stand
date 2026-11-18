// The Mossback: the Thornwood's bruiser.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { mossback: true } }

export const FOES: FoeFile = {
  mossback: {
    def: {
      name: 'Mossback', model: 'mossback', ai: 'melee',
      life: 150, damage: 25, damageType: 'physical', speed: 3.5, radius: 0.62,
      range: 1.8, windup: 0.65, recover: 0.6, cooldown: 1.35,
      cost: 1.5, score: 1.5, knockbackResist: 0.3,
    },
    note: {
      role: 'Bruiser',
      does: 'A hulking, moss-grown beast that plods towards you and lands heavy blows at a long reach.',
      strengths: ['Tough and hard-hitting for a common foe.', 'Resists being knocked back a little.'],
      weaknesses: ['Slow: easy to kite.', 'Telegraphs its swing.'],
      beat: ['Step out of its swing and strike back while it recovers.', 'Keep moving: it rarely catches a hero who walks away.', 'Kill the fast and ranged foes first.'],
    },
  },
};
