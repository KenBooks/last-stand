// The Hollow Husk: the Crypt's bruiser.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { husk: true } }

export const FOES: FoeFile = {
  husk: {
    def: {
      name: 'Hollow Husk', model: 'husk', ai: 'melee',
      life: 135, damage: 24, damageType: 'physical', speed: 3.7, radius: 0.55,
      range: 1.75, windup: 0.6, recover: 0.6, cooldown: 1.3,
      cost: 1.5, score: 1.5,
    },
    note: {
      role: 'Bruiser',
      does: 'A slow, shambling corpse with a long reach and a heavy blow. It walks straight at you and swings once in range.',
      strengths: ['Hits hard for a common foe and takes a while to bring down.', 'Its reach is longer than it looks.'],
      weaknesses: ['Slow on its feet: you can kite it forever.', 'Its swing has a clear wind-up you can step out of.'],
      beat: ['Step back as its arm rises, then punish the recovery.', 'Deal with the fast foes around it first; it will arrive later.', 'Ranged heroes: walk backwards and keep shooting.'],
      vs: { warrior: 'A raised shield takes its blow easily; Power Strike knocks it far back.' },
    },
  },
};
