// The Voidling: the Crypt's swarmer.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { imp: true } }

export const FOES: FoeFile = {
  imp: {
    def: {
      name: 'Voidling', model: 'imp', ai: 'melee',
      life: 70, damage: 14, damageType: 'physical', speed: 6.2, radius: 0.45,
      range: 1.3, windup: 0.45, recover: 0.5, cooldown: 0.9,
      cost: 1, score: 1, gait: 3.2,
    },
    note: {
      role: 'Swarmer',
      does: 'Small, quick void-spawn that rush in, in numbers, and claw at whoever is closest. Alone it is little; a pack of them surrounding you is how most runs end early.',
      strengths: ['About as quick as a hero on foot: walking away rarely shakes them.', 'Packs flank and surround you instead of queueing in a line.', 'The Hollow Colossus keeps calling more of them.'],
      weaknesses: ['Very little Health: any area skill clears a pack.', 'Light: knocked back and thrown by every blow.'],
      beat: ['Let them come to you and answer with an area skill rather than chasing single ones.', 'Back against a wall or a pillar so the pack cannot close the circle.', 'Kill them first in a mixed group: they deal more together than one big foe.'],
      vs: {
        warrior: 'Rending Cleave hits the whole pack and refills your Energy for every one it touches.',
        mage: 'A Cinderburst or a charged Stormcall into the middle of the pack, or Glacial Nova when they reach you.',
        ranger: 'Briarflight\'s fan at close range, or Strawman to bunch them up for a Hailfletch.',
      },
    },
  },
};
