// The Barkhide Hulk: the Thornwood's heavy.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { barkhulk: true } }

export const FOES: FoeFile = {
  barkhulk: {
    def: {
      name: 'Barkhide Hulk', model: 'barkhulk', ai: 'slam',
      life: 660, damage: 76, damageType: 'physical', speed: 2.8, radius: 1.0,
      range: 3.0, slamRadius: 3.4, windup: 1.1, recover: 0.8, cooldown: 2.6,
      throws: { what: 'vine', from: 6, reach: 15, windup: 0.8, recover: 0.6, cooldown: 4, creep: [13, 0.6, 1.5] },
      cost: 5, score: 6, knockbackResist: 0.75, heft: 2.5, accent: 0x9cff3a,
    },
    note: {
      role: 'Heavy',
      does: 'A walking tree that slams the ground in front of it. Out of reach, it sends a vine creeping along the floor towards you that pins you to the spot if its tip catches you.',
      strengths: ['A crushing slam over a wide area.', 'Very tough, and hard to knock back.', 'Its vine passes through anything in its way and roots you in place for the rest of the pack.'],
      weaknesses: ['Its slam is marked by a ring.', 'The vine creeps in a straight line: step aside.', 'Slow on its feet.'],
      beat: ['Step out of the ring, then punish the recovery.', 'When the vine comes, move across its path, not away along it.', 'Caught? A dash or a blink tears you free.'],
      vs: { warrior: 'Bull Rush breaks a vine\'s hold.', mage: 'Veilstep breaks a vine\'s hold and crosses the slam.' },
    },
  },
};
