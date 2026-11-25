// The Ossuary Cantor: the main boss of the Crypt's second rung, an encounter (data/biomes.ts `bosses`: guarded by two
// lesser Bell-Wardens). Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and the trophy
// its fall hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder; its own
// numbers (`CANTOR`) read by its fight (entities/cantor.ts), its guards' and the guide.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { cantor: true } }

export const FOES: FoeFile = {
  // a towering skeletal cantor of the ossuary (entities/cantor.ts, models/cantor.ts)
  cantor: {
    def: {
      name: 'The Ossuary Cantor', model: 'cantor', ai: 'cantor',
      life: 3800, damage: 120, damageType: 'vitality', speed: 1.3, radius: 2.4,
      range: 9, windup: 1.3, recover: 0.9, cooldown: 6.5,
      cost: 0, score: 110, knockbackResist: 1, freezeResist: 0.8, heft: 6, boss: true, accent: 0x5fe8a8,
      bossKit: {
        phases: [
          { below: 1 },
          { below: 0.55, banner: 'The Cantor sings the dirge' },
          { below: 0.25, banner: 'The ossuary answers' },
        ],
        // (grave hands: a ring of grave light under each hero, then bone hands; the dirge: a line of them marching out)
        // (the choir's ring: its singers rising round it over the warning, the ground outside the ring hurting after)
        attacks: { graveHands: { warn: 1.3, recover: 1.0 }, dirge: { warn: 1.0, recover: 1.4 }, choir: { warn: 1.8, recover: 1.0 } },
        weak: { taken: 2, edge: 0xc8ffe4 },
        ward: { taken: 0.25, edge: 0xe8e0c8 },
      },
    },
    note: {
      role: 'Second boss of the Crypt',
      does: 'A towering skeletal priest of the ossuary, floating in rotted vestments under a crown of candles, a bronze bell for a heart in its open ribs. It comes with two lesser Bell-Wardens as its guards, and while either of them stands it is warded: your blows barely touch it. It chants, and the dead answer: bone hands tear up through the floor beneath you.',
      strengths: ['Warded while a guard stands: it takes only a fraction of the damage.', 'Grave hands rise under every hero at once.', 'Wounded, it sings a dirge: a line of rings marching out towards you, each bursting in turn.', 'Wounded, it calls its choir: ghostly singers rise in a ring round it, and the ground outside the ring hurts until it fades.', 'With every verse gravestones push up out of the floor and stay, blocking your way and your shots: the longer the fight, the fuller the arena.', 'Near death it sends a dirge at every hero and casts faster.', 'It keeps its distance, gliding back from a hero who presses in.'],
      weaknesses: ['Every cast is warned: a ring of grave light on the floor before the hands burst.', 'Its guards are lesser bells with little Health: kill them first and the ward falls.', 'With its guards down, every cast leaves its ribs open and its bell-heart bared, taking double damage for a few seconds.', 'Its casts and its guards\' tolls never land together: there is always a moment to step out.', 'The choir\'s ring hurts only a little at a time: walk in and it stops.', 'A ring of grave light shows where each gravestone will rise; the stones break under enough hits.'],
      beat: ['Turn on the guards first; ignore the Cantor until both bells are silent.', 'Step out of the ring the moment it appears under you.', 'Strafe off the dirge\'s line rather than running along it.', 'When the singers rise, get inside their ring before it closes, and fight there.', 'Kill it before the stones fill the arena: break the ones that cut off your way.', 'Hold your burst for the moment its ribs swing open after a cast.'],
      vs: {
        warrior: 'Shield up towards a guard\'s toll, then close on the Cantor as its heart is bared; inside the choir\'s ring you are where you want to be, and your blows clear the stones in your way.',
        mage: 'Blink out of the grave light, and lance the bared heart from range; when the choir rises, blink inside its ring.',
        ranger: 'Keep moving between shots: the hands rise where you stand, not where you were. Inside the choir\'s ring keep to its edge, and shoot round the stones, not into them.',
      },
    },
    // (the Ossuary Cantor's long skull, its grave light still in the sockets)
    trophy: { name: "The Ossuary Cantor's Skull", kind: 'cabinet', place: 'shelf-top-left', colour: 0xcfc4a4, trim: 0x5fe8a8 },
  },
};

/**
 * The Ossuary Cantor's own numbers (entities/cantor.ts). `hands`: grave hands under every hero, a ring of `radius` m,
 * hurting `hurt` of its damage. `dirge` (from its second phase): `count` rings `apart` m along a line out to a hero,
 * each `step` s after the last. Once its guards have fallen, each cast leaves its ribs open, its bell-heart bared, for
 * `bared` s (its weak-spot window). `every` s between casts, `lastEvery` in its last phase. It keeps `keepAt` m from its
 * target, gliding. `beat` (s): no two warned hits of any boss in the fight land closer than this (a toll's stun chained
 * into a hit no one could dodge).
 *
 * `choir` (from its `fromPhase`, every `every` s at most): ghostly singers, `singers` of them, rise in a ring of
 * `radius` m round where it stands over its warning; then for `lasts` s the ground outside the ring hurts whoever
 * stands there `hurt` of its damage every `tick` s, the ring tightening to `least` m over `tighten` s and holding
 * there, then fading over `fade` s. The ring stays where it rose, and the Cantor floats to its middle and keeps there
 * while it stands (from play: "too easy to just get away"; "for a while the fight has to happen up close").
 *
 * `graves`: with each verse (each grave hands or dirge) `perVerse` gravestones push up out of the floor at spots the
 * fight's owner rolls, a ring of grave light on each for the cast's warning first, rising over `rise` s, at most `most`
 * standing. Each is a breakable prop of `life` (a headstone of the crypt's `size` times as large: `radius` m round, `top`
 * m high): bodies, paths and shots meet it. A spot is `fromMiddle` m from the arena's middle at least (off the dais),
 * `fromWall` m inside its walkable edge, out of the gates' lanes (`laneHalf` m either side of a gate's line), `apart` m
 * clear of every other prop's circle (so a hero passes between any two), and `fromHeroes` m from every hero. They sink
 * back into the floor over `sink` s as it falls or its wave ends (from play: "over a long fight the arena fills up,
 * so slow, safe play gets harder").
 */
export const CANTOR = {
  hands: { radius: 1.7, hurt: 0.7 },
  dirge: { count: 6, apart: 2.8, step: 0.14, radius: 1.3, hurt: 0.55 },
  bared: 4.5,
  every: 6.5,
  lastEvery: 4,
  keepAt: 7,
  beat: 2.4,
  choir: { fromPhase: 1, every: 22, singers: 14, radius: 11, least: 6.5, tighten: 8, lasts: 13, fade: 1.6, tick: 0.5, hurt: 0.12 },
  graves: {
    perVerse: 2, most: 10, rise: 0.55, sink: 1.2, life: 10, size: 1.6, radius: 0.55, top: 1.75,
    fromMiddle: 7.5, fromWall: 3, laneHalf: 3.6, apart: 2.2, fromHeroes: 2.6,
  },
};
