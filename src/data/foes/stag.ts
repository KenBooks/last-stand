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
          { below: 0.5, banner: 'Its antlers break · The ash takes fire' },
        ],
        // (each one's warning: a hoof pawing the earth as it turns after a hero, then its line burning onto the floor,
        // a shorter one as it wheels round for the second; its head drawn up and back, its fore legs braced, for the
        // gore; its weight sitting back onto its haunches as it rears for the stamp; its head dropped and its antlers
        // scraping the earth for the toss; its weight thrown onto its fore legs and its haunches gathered for the kick,
        // short; its head raised, its chest swelling and the earth burning where its breath begins for the breath)
        attacks: {
          charge: { warn: 1.2, recover: 0.2 },
          again: { warn: 0.7, recover: 0.2 },
          gore: { warn: 0.65, recover: 0.5 },
          stamp: { warn: 0.75, recover: 0.55 },
          toss: { warn: 0.8, recover: 0.6 },
          kick: { warn: 0.45, recover: 0.55 },
          breath: { warn: 1.1, recover: 1.7 },
          shed: { warn: 1.2, recover: 0.9 },
          strike: { warn: 0.4, recover: 0.4 },
        },
        // (crashed into a rock, a tree, the wall or a raised shield, it reels: every hero's hit takes twice)
        weak: { taken: 2, edge: 0xffc060 },
      },
    },
    note: {
      role: 'Boss of the Thornwood',
      does: 'A huge stag of charred wood, embers glowing through its cracks, its antlers burning. From afar it paws the ground and turns after you, an orange lane burns towards where you are going, then it charges down it and leaves fire behind that burns hard. Up close it never stops attacking: it drops its head and rakes its antlers through you, rears up and stamps down on you if you stand under it, kicks back with both hind legs if you stand behind it, or tosses you across the arena. Between, it draws a long breath and sweeps a cone of fire across the ground before it, setting the logs, stumps and young trees it touches alight. Under half its Health it smashes its antlers into the ground, and they break off into burning stakes stuck in the floor that block your way and arrows and burn whoever touches them; from then on it strikes with its fore hooves, quicker, and charges again and again as embers rain down.',
      strengths: ['Its charge is very fast, aimed where you are going, and gores whoever is still in its lane.', 'Crossing the fire it leaves hurts; standing in it hurts a lot.', 'Up close it attacks again and again, turning after you as it winds up: its antlers reach the ground at its feet, its fore hooves come down on whoever stands under it, and a toss throws you far and lands hard.', 'Standing behind it is no safer: it kicks back hard with both hind legs.', 'Its breath sweeps fire across the ground before it, from one side to the other, and leaves it burning; whatever wood it touches burns for a while and hurts whoever stands by it.', 'Keeping away from it does not keep you safe: it charges sooner the longer you stay far.', 'A charge that misses turns straight round into another; in its second phase, into two.'],
      weaknesses: ['The lane is marked on the floor and fixed once it shows: change direction or stop, and step out of it.', 'A charge that runs into a rock, a tree, the wall or a raised shield stops dead: it is stunned for a while and takes double damage.', 'Each close attack is marked: its head goes up and back before the gore, its weight sits back before it rears, its head drops and scrapes the earth before the toss. Step to its side.', 'Its fire is gone in a few seconds, and you take its burn only while you stand in it.', 'Before it breathes it raises its head and a line burns on the ground where its fire will begin: go the other way round it, or put a rock between you. A raised shield takes the breath head-on.', 'Its kick is short and marked: its weight goes onto its fore legs as its haunches gather.', 'Its antler stakes can be broken, and burn out in time; without its antlers it can no longer toss you or rake you.'],
      beat: ['Stand in front of a rock, a tree or the wall, and step aside as its lane shows: it crashes.', 'Spend your burst while it is stunned.', 'Do not stand in front of its head up close, nor under it, nor right behind it: stand at its flank and step as it winds up.', 'Keep burning wood between you only until the breath reaches it.', 'Cross its fire quickly or go round it; in its second phase, watch for the embers\' rings.'],
      vs: {
        warrior: 'Raise your shield in its lane: it crashes into it. The shield takes the gore, the stamp, the toss and the breath too, but not a kick from behind.',
        mage: 'Veilstep out of its lane, away from its head as it winds up and past the end of its breath\'s sweep; frost slows the charge and a freeze stops it.',
        ranger: 'Lead it into a rock or the wall, then shoot while it is stunned; up close, walk to its flank as its head goes back; as it breathes, walk round it against the sweep or behind a rock.',
      },
    },
    // (the Stag of Ash's antlers: charred black, an ember's glow at their root)
    trophy: { name: "The Stag of Ash's Antlers", kind: 'wall', place: 'wall-outer-right', colour: 0x2a211b, trim: 0xff6a20 },
  },
};

/**
 * The Stag of Ash's own numbers (entities/stag.ts). `charge`: it paws the earth through the `charge` attack's warning
 * (its line burning onto the floor towards a hero, `width` m wide), then runs along it at `speed` (m/s), to `over` m
 * past where the hero stood (at least `least`, at most `most` m in all); a hero it runs into is gored for `hurt` of its
 * damage and thrown `throw` m/s aside, once a charge. Met by a rock, a tree, the wall or a hero's shield raised
 * towards it, it crashes: stunned `stun` s (its weak-spot window: every hit takes `bossKit.weak.taken` times), a hero
 * whose shield it met staggered back. It charges once every `every` s at most (`far` s while no hero has been within
 * `near` m for `farFor` s), and walks at a hero meanwhile. Through its warning it turns after the hero at `track` rad/s,
 * aiming `lead` of the way to where he'll be as it reaches him; its lane shows and locks `lock` s before it runs.
 * `fire`: the line it ran leaves fire on the floor `life` s (`late` in phase 2), `reach` m either side of its middle,
 * burning a hero in it `hurt` of its damage every `tick` s. `gore`: a hero within `reach` m before it (and its radius),
 * `arc` rad either side: its head drawn up and back, then dropped and raked forward and up through where he stands, its
 * antlers reaching the earth at its feet; each game's hero struck where its drawn tines pass within `tines` m of his
 * body over the `window` s they come through, for `hurt` of its damage, knocked `knock` m/s on. `stamp`: a hero under
 * it, within `reach` m before its chest (and its radius): it rears, its fore legs lifted, and stamps both fore hooves
 * down where he stood; struck within `radius` m of a drawn fore hoof as it lands, for `hurt` of its damage, knocked
 * `knock` m/s off. Through either warning it turns after him at `track` rad/s, but its last `lock` s. A charge that
 * met nothing wheels round and charges again (the `again` attack's warning), `charge.again` times running [phase 1,
 * phase 2]. Phase 2: `embers`: every `every` s, `count` embers fall round the heroes (within `spread` m of one), each `fall` s after its ring shows, `radius` m wide, `hurt` of its damage.
 * `toss`: through the last of its warning (from `lungeFrom` of it) it lunges `lunge` m on along its facing (short of a
 * prop or the wall); a hero within `reach` m of its front then (and its radius), `arc` rad either side of its facing, as
 * the `toss` warning ends is scooped up on its antlers, held `hold` s, then thrown `far` m on along its facing (short of a prop or
 * the wall in the way), `high` m up at the top, landing `fly` s later for `hurt` of its damage; a raised shield towards
 * it, or a dash, saves him; a step back doesn't (it lunges after him). `close`: up close it never stands: an attack after another, `rest` s [least, most] between,
 * the toss every third one where the hero is before it, the stamp where he's under it, else the gore; it turns onto a
 * hero beside it at `turn` rad/s; it charges only at a hero at least `charge.near` m off. `kick`: a hero within `reach` m
 * behind it (and its radius), `arc` rad either side of straight behind: its hind hooves driven back `KICK.back` m and up
 * (models/stag.ts), struck within `radius` m of either drawn hind hoof for `hurt` of its damage, knocked `knock` m/s off
 * (no shield takes it: it comes from behind); through its warning it swings its haunches after him at `track` rad/s,
 * but its last `lock` s. `breath`: at a hero `least` to `most` m past its body, every `every` s at
 * most: it draws breath through its warning, then sweeps a cone of fire `cone` rad either side of its line from one side
 * to the other through `sweep` rad over `time` s, out to `reach` m from its middle: a hero it passes over (no prop
 * between, no shield raised towards it) burnt once for `hurt` of its damage, and the ground left burning along it (the
 * charge's fire, `burn` s, every `step` rad). `forestFire`: wood its breath touches (stumps, logs, young trees) burns
 * `life` s, `most` at once (the oldest put out first), burning a hero within `near` m of it for `hurt` of its damage
 * every `tick` s; each a pooled light while it burns. `shed`: at half its life it rears and drives its antlers into the
 * earth `ahead` m before its middle (its `shed` warning, a ring `near` m round there: a hero in it hurt `hurt` of its
 * damage, knocked `knock` m/s off) and they break off into `stakes` stakes (its model's), each thrown `out` m [least, most] from
 * there over `flight` s and stuck upright in the floor: a prop `stake` m round and `high` m tall that paths, bodies and
 * shots meet, broken in `hits` of a prop's hits, gone after `life` s, burning a hero within `touch` m of it `hurtTouch`
 * of its damage every `tick` s. After it, no gore or toss: `strike`, a hero within `reach` m before it (and its radius)
 * struck within `radius` m of a drawn fore hoof as it lands after a short rear, `hurt` of its damage, knocked `knock`
 * m/s, it turning after him at `track` rad/s but its last `lock` s.
 */
export const STAG = {
  charge: {
    speed: 15, width: 2.6, over: 7, least: 10, most: 26, hurt: 0.8, throw: 11, stun: 3, every: 4.5, near: 7,
    far: 2.5, farFor: 2, track: 2.4, lead: 1, lock: 0.55, again: [1, 2] as [number, number],
  },
  fire: { life: 5, late: 7, reach: 0.95, hurt: 0.3, tick: 0.5 },
  gore: { reach: 1.9, arc: 1.1, tines: 0.45, window: 0.16, hurt: 0.75, knock: 9, track: 2.6, lock: 0.18 },
  stamp: { reach: 1.4, radius: 1.25, hurt: 0.9, knock: 10, track: 2.2, lock: 0.25 },
  embers: { every: 2.6, count: 3, spread: 4, fall: 1.1, radius: 1.3, hurt: 0.35 },
  toss: { reach: 2.2, arc: 0.7, hold: 0.3, far: 16, high: 5, fly: 1.1, hurt: 1.1, lunge: 2, lungeFrom: 0.6 },
  close: { rest: [0.2, 0.45] as [number, number], turn: 3.2 },
  kick: { reach: 1.8, arc: 0.85, radius: 1.2, hurt: 0.7, knock: 15, track: 2.6, lock: 0.1 },
  breath: { least: 2.5, most: 10, every: 9, cone: 0.2, sweep: 1.4, time: 1.3, reach: 14, hurt: 0.6, burn: 4, step: 0.2, gap: 0.5 },
  forestFire: { life: 8, most: 3, near: 1.2, hurt: 0.2, tick: 0.5 },
  shed: { stakes: 4, ahead: 2.6, near: 3, hurt: 0.8, knock: 10, out: [4, 8] as [number, number], flight: 0.7, life: 25, hits: 8,
    stake: 0.4, high: 2.2, touch: 0.5, hurtTouch: 0.15, tick: 0.5 },
  strike: { reach: 1.9, radius: 1.1, hurt: 0.55, knock: 8, track: 3, lock: 0.12 },
};
