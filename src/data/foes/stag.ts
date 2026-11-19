// The Stag of Ash: the Thornwood's third boss, on its ladder (data/biomes.ts `bosses`).
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and the trophy its fall hangs in
// the house of records: read by data/enemies.ts with every other foe's file in this folder; its own numbers (`STAG`)
// read by its fight (entities/stag.ts) and the guide.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { stag: true } }

export const FOES: FoeFile = {
  // a huge stag of charred wood, embers glowing through its cracks, its antlers burning (entities/stag.ts,
  // models/stag.ts)
  stag: {
    def: {
      name: 'The Stag of Ash', model: 'stag', ai: 'stag',
      // (its walk; its charge is `STAG.charge.speed`)
      life: 3000, damage: 110, damageType: 'fire', speed: 3.4, radius: 2.1, gait: 4.2,
      range: 4.4, windup: 0.7, recover: 0.7, cooldown: 1.6,
      // (half a daze or a freeze holds it: the mage's frost slows a charge, a freeze stops it a while)
      cost: 0, score: 80, knockbackResist: 1, freezeResist: 0.5, heft: 8, boss: true, accent: 0xff7a24, ignoresLures: true,
      bossKit: {
        phases: [
          { below: 1 },
          { below: 0.5, banner: 'The ash takes fire · It charges twice' },
        ],
        // (each one's warning: a hoof pawing the earth as its line burns onto a hero, a shorter one as it wheels round
        // for the second, its head drawn back and low for the antlers' sweep, its head dropped and its antlers
        // scraping the earth for the toss)
        attacks: {
          charge: { warn: 1.2, recover: 0.2 },
          again: { warn: 0.7, recover: 0.2 },
          sweep: { warn: 0.6, recover: 0.45 },
          toss: { warn: 0.8, recover: 0.6 },
        },
        // (crashed into a rock, a tree, the wall or a raised shield, it reels: every hero's hit takes twice)
        weak: { taken: 2, edge: 0xffc060 },
      },
    },
    note: {
      role: 'Boss of the Thornwood',
      does: 'A huge stag of charred wood, embers glowing through its cracks, its antlers burning. From afar it paws the ground as an orange lane burns towards you, then charges down it and leaves fire behind. Up close it never stops attacking: it sweeps its antlers round, or drops its head and tosses you across the arena. Under half its Health it charges twice in a row and embers rain down.',
      strengths: ['Its charge is very fast and gores whoever is still in its lane.', 'The fire it leaves burns for a while, so the safe floor shrinks.', 'Up close it attacks again and again: a toss throws you far and lands hard.', 'In its second phase, a charge that misses turns straight round into another.'],
      weaknesses: ['The lane is marked on the floor and fixed once it starts: step out of it.', 'A charge that runs into a rock, a tree, the wall or a raised shield stops dead: it is stunned for a while and takes double damage.', 'The toss is marked: its head drops and its antlers scrape the earth first. Step aside.'],
      beat: ['Stand in front of a rock, a tree or the wall, and step aside as it sets off: it crashes.', 'Spend your burst while it is stunned.', 'Do not stand in front of its head up close; stay to its side.', 'Keep out of its fire; in its second phase, watch for the embers\' rings.'],
      vs: {
        warrior: 'Raise your shield in its lane: it crashes into it. The shield stops the toss too.',
        mage: 'Veilstep out of its lane; frost slows the charge and a freeze stops it.',
        ranger: 'Lead it into a rock or the wall, then shoot while it is stunned.',
      },
    },
    // (the Stag of Ash's antlers: charred black, an ember's glow at their root)
    trophy: { name: "The Stag of Ash's Antlers", look: 'antlers', colour: 0x2a211b, trim: 0xff6a20 },
  },
};

/**
 * The Stag of Ash's own numbers (entities/stag.ts). `charge`: it paws the earth through the `charge` attack's warning
 * (its line burning onto the floor towards a hero, `width` m wide), then runs along it at `speed` (m/s), to `over` m
 * past where the hero stood (at least `least`, at most `most` m in all); a hero it runs into is gored for `hurt` of its
 * damage and thrown `throw` m/s aside, once a charge. Met by a rock, a tree, the wall or a hero's shield raised
 * towards it, it crashes: stunned `stun` s (its weak-spot window: every hit takes `bossKit.weak.taken` times), a hero
 * whose shield it met staggered back. It charges once every `every` s at most, and walks at a hero meanwhile.
 * `fire`: the line it ran leaves fire on the floor `life` s (`late` in phase 2), `reach` m either side of its middle,
 * burning a hero in it `hurt` of its damage every `tick` s. `sweep`: its antlers swept round before it at a hero within
 * `reach` m (and its radius), `arc` rad either side, for `hurt` of its damage. Phase 2: after a charge that met nothing
 * it wheels round and charges again (the `again` attack's warning); `embers`: every `every` s, `count` embers fall
 * round the heroes (within `spread` m of one), each `fall` s after its ring shows, `radius` m wide, `hurt` of its damage.
 * `toss`: a hero within `reach` m of its front (and its radius), `arc` rad either side of its facing, as the `toss`
 * warning ends is scooped up on its antlers, held `hold` s, then thrown `far` m on along its facing (short of a prop or
 * the wall in the way), `high` m up at the top, landing `fly` s later for `hurt` of its damage; a raised shield towards
 * it, or a dash, saves him. `close`: up close it never stands: an attack after another, `rest` s [least, most] between,
 * the toss every other one where the hero is before it (the sweep the rest, and wherever he's beside it); it charges
 * only at a hero at least `charge.near` m off.
 */
export const STAG = {
  charge: { speed: 15, width: 2.6, over: 7, least: 10, most: 26, hurt: 0.8, throw: 11, stun: 3, every: 5.5, near: 7 },
  fire: { life: 8, late: 13, reach: 0.95, hurt: 0.09, tick: 0.5 },
  sweep: { reach: 2.6, arc: 1.25, hurt: 0.55 },
  embers: { every: 2.6, count: 3, spread: 4, fall: 1.1, radius: 1.3, hurt: 0.35 },
  toss: { reach: 2.2, arc: 0.7, hold: 0.3, far: 16, high: 5, fly: 1.1, hurt: 1.1 },
  close: { rest: [0.2, 0.45] as [number, number] },
};
