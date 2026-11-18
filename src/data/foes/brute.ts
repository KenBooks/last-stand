// The Cinder Brute: the Crypt's heavy.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { brute: true } }

export const FOES: FoeFile = {
  brute: {
    def: {
      name: 'Cinder Brute', model: 'brute', ai: 'slam',
      life: 620, damage: 80, damageType: 'fire', speed: 3.0, radius: 1.0,
      range: 3.0, slamRadius: 3.4, windup: 1.05, recover: 0.8, cooldown: 2.6,
      throws: { what: 'lava', from: 7, reach: 16, windup: 0.85, recover: 0.6, cooldown: 3.2, flight: [0.85, 0.035], splash: [1.8, 0.75], pool: [1.5, 2.5, 0.3] },
      cost: 5, score: 6, knockbackResist: 0.7, heft: 2.5,
    },
    note: {
      role: 'Heavy',
      does: 'A huge molten brute that slams the ground in front of it. Too far away to slam, it lobs chunks of lava at where you stand, which burst and leave a burning pool.',
      strengths: ['A slam that can take a large share of your Health at once, over a wide area.', 'Lots of Health, and hard to knock back.', 'Punishes standing still at range with lava.'],
      weaknesses: ['Its slam is marked by a red ring on the ground long before it lands.', 'Slow to turn and to walk.', 'The lava\'s landing is marked too: keep moving and it misses.'],
      beat: ['Watch for the red ring and step out of it, then hit it while it recovers.', 'Never stand in a burning pool; move as soon as a lava chunk is in the air.', 'Daze, freeze or lure it to stop the slam before it lands.'],
      vs: {
        warrior: 'Do not try to block the slam with a lowered shield; raise it or step out.',
        mage: 'Glacial Nova stops its slam cold; Starfall\'s chill slows it further.',
        ranger: 'Lancewood Shot through the brute and whatever stands behind it.',
      },
    },
  },
};
