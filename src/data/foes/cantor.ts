// The Ossuary Cantor: the Crypt's second boss wave's main boss, an encounter with two Bell-Wardens as its guards.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures), the trophy its fall hangs in the
// house of records, and its own numbers past the kit's (`CANTOR`): read by data/enemies.ts with every other foe's file
// in this folder. Its fight is entities/cantor.ts, its model models/cantor.ts.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { cantor: true } }

export const FOES: FoeFile = {
  // a towering skeletal cantor of the ossuary (entities/cantor.ts, models/cantor.ts); its numbers past the kit's are
  // `CANTOR`
  cantor: {
    def: {
      name: 'The Ossuary Cantor', model: 'cantor', ai: 'cantor',
      life: 3800, damage: 120, damageType: 'vitality', speed: 1.3, radius: 2.4,
      range: 9, windup: 1.3, recover: 0.9, cooldown: 6.5,
      cost: 0, score: 110, knockbackResist: 1, freezeResist: 0.8, boss: true, accent: 0x5fe8a8,
      bossKit: {
        phases: [
          { below: 1 },
          { below: 0.55, banner: 'The Cantor sings the dirge' },
          { below: 0.25, banner: 'The ossuary answers' },
        ],
        // (grave hands: a ring of grave light under each hero, then bone hands; the dirge: a line of them marching out)
        attacks: { graveHands: { warn: 1.3, recover: 1.0 }, dirge: { warn: 1.0, recover: 1.4 } },
        weak: { taken: 2, edge: 0xc8ffe4 },
        ward: { taken: 0.25, edge: 0xe8e0c8 },
      },
    },
    note: {
      role: 'Second boss of the Crypt',
      does: 'A towering skeletal priest of the ossuary, floating in rotted vestments under a crown of candles, a bronze bell for a heart in its open ribs. It comes with two lesser Bell-Wardens as its guards, and while either of them stands it is warded: your blows barely touch it. It chants, and the dead answer: bone hands tear up through the floor beneath you.',
      strengths: ['Warded while a guard stands: it takes only a fraction of the damage.', 'Grave hands rise under every hero at once.', 'Wounded, it sings a dirge: a line of rings marching out towards you, each bursting in turn.', 'Near death it sends a dirge at every hero and casts faster.', 'It keeps its distance, gliding back from a hero who presses in.'],
      weaknesses: ['Every cast is warned: a ring of grave light on the floor before the hands burst.', 'Its guards are lesser bells, smaller and weaker than a Bell-Warden alone: kill them first and the ward falls.', 'With its guards down, every cast leaves its ribs open and its bell-heart bared, taking double damage for a few seconds.', 'Its casts and its guards\' tolls never land together: there is always a moment to step out.'],
      beat: ['Turn on the guards first; ignore the Cantor until both bells are silent.', 'Step out of the ring the moment it appears under you.', 'Strafe off the dirge\'s line rather than running along it.', 'Hold your burst for the moment its ribs swing open after a cast.'],
      vs: {
        warrior: 'Shield up towards a guard\'s toll, then close on the Cantor as its heart is bared.',
        mage: 'Blink out of the grave light, and lance the bared heart from range.',
        ranger: 'Keep moving between shots: the hands rise where you stand, not where you were.',
      },
    },
    // (the Ossuary Cantor's long skull, its grave light still in the sockets)
    trophy: { name: "The Ossuary Cantor's Skull", look: 'mask', colour: 0xcfc4a4, trim: 0x5fe8a8 },
  },
};

/**
 * The Ossuary Cantor's own numbers (entities/cantor.ts). `hands`: grave hands under every hero, a ring of `radius` m,
 * hurting `hurt` of its damage. `dirge` (from its second phase): `count` rings `apart` m along a line out to a hero,
 * each `step` s after the last. Once its guards have fallen, each cast leaves its ribs open, its bell-heart bared, for
 * `bared` s (its weak-spot window). `every` s between casts, `lastEvery` in its last phase. It keeps `keepAt` m from its
 * target, gliding. `beat` (s): no two warned hits of any boss in the fight land closer than this (a toll's stun chained
 * into a hit no one could dodge).
 */
export const CANTOR = {
  hands: { radius: 1.7, hurt: 0.7 },
  dirge: { count: 6, apart: 2.8, step: 0.14, radius: 1.3, hurt: 0.55 },
  bared: 4.5,
  every: 6.5,
  lastEvery: 4,
  keepAt: 7,
  beat: 2.4,
};
