// The Ossuary Twins: the Crypt's special boss wave, a pair sharing one life.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { twinslab: true; twinreliquary: true } }

export const FOES: FoeFile = {
  // the Crypt's special boss wave (data/biomes.ts `bossWaves`): the Ossuary Twins, two tall figures of stacked bone and grave cloth
  // linked by a chain of bone, sharing one life (`shares`; entities/twins.ts, models/twins.ts); their numbers past
  // the kit's are `TWINS`. Each is given the pair's whole life: a hit on either takes it from both.
  twinslab: {
    def: {
      name: 'Slab', pair: 'The Ossuary Twins', shares: 'twinreliquary', model: 'twinslab', ai: 'twins',
      life: 3000, damage: 135, damageType: 'physical', speed: 2.6, radius: 1.5,
      range: 4, windup: 1.0, recover: 0.9, cooldown: 4.2,
      cost: 0, score: 75, knockbackResist: 1, freezeResist: 0.8, heft: 4, boss: true, accent: 0xffc070,
      bossKit: {
        phases: [{ below: 1 }, { below: 0.5, banner: 'Slab takes up the reliquary' }],
        // (the grave slam: the slab lifted a second, brought down; the shoulder charge: a short rush at the nearest hero;
        // the volley, his brother's, once he's alone)
        // (a skull off the belt at his waist: unhooked, drawn back, thrown; his brother's poison too once he's alone)
        attacks: {
          slam: { warn: 1.0, recover: 0.9 }, charge: { warn: 0.6, recover: 1.1 }, volley: { warn: 0.8, recover: 0.8 },
          bomb: { warn: 1.1, recover: 0.7 }, poison: { warn: 1.1, recover: 0.7 },
        },
      },
    },
    note: {
      role: 'Boss of the Crypt, with his twin',
      does: 'Slab, the broad one of the Ossuary Twins: a hulking skeleton in battered iron, a tombstone for a weapon. He and his brother Reliquary share one life, bound by a glowing chain of bone. He lifts the tombstone and brings it down on whoever is before him, and shoulders his way across the floor at the nearest hero.',
      strengths: ['One life with his brother: every blow on either wears down both.', 'His grave slam crushes everything in the ring before him.', 'A short shoulder charge reaches a hero who backs off.', 'Drift the twins too far apart and their chain snaps tight, dragging them together and hurting anyone between.', 'At half, whichever twin took more falls and the other grows faster and takes up his brother\'s attack.', 'He throws bomb skulls off his belt that burst after a moment and throw you back.'],
      weaknesses: ['The slam is warned: a ring lies before him while the tombstone is raised for a second.', 'The charge\'s line is ringed before he runs.', 'He is slow and stays close to his brother.', 'He carries only a few bombs, and you see each one unhooked and thrown.', 'A bomb\'s glow draws in before it bursts: there is always time to step out. Caught in it, you are stunned, but nothing else of theirs lands on you until you can move.'],
      beat: ['Step out of the ring as the tombstone rises.', 'Never stand on the line between the twins.', 'Wear both down evenly, so the one left standing is no stronger than the other.', 'When a bomb lands, walk out of its ring before it fills.', 'Count the skulls left on his rope: an empty rope throws nothing.'],
      vs: {
        warrior: 'Hold the shield up to the slam and punish the long recovery after it; a raised shield takes a bomb\'s blast too, though it still shoves you.',
        mage: 'Keep your distance: he has no reach but his charge and his bombs, and a blink carries you out of a bomb\'s ring.',
        ranger: 'Kite him in a circle; side-step the charge\'s ringed line, and keep moving so his bombs land behind you.',
      },
    },
    // (the Ossuary Twins' link of their chain of bone, its gold light still in it: one trophy for the pair, Slab's)
    trophy: { name: "The Ossuary Twins' Bone Link", look: 'crest', colour: 0xd2c6a4, trim: 0xffd890 },
  },
  twinreliquary: {
    def: {
      name: 'Reliquary', pair: 'The Ossuary Twins', shares: 'twinslab', model: 'twinreliquary', ai: 'twins',
      life: 3000, damage: 95, damageType: 'vitality', speed: 2.9, radius: 1.0,
      range: 14, windup: 0.8, recover: 0.8, cooldown: 3.6,
      cost: 0, score: 75, knockbackResist: 1, freezeResist: 0.6, boss: true, accent: 0x8fe8ff,
      bossKit: {
        phases: [{ below: 1 }, { below: 0.5, banner: 'Reliquary takes up the slab' }],
        // (the volley of skulls; the mend, a channel a stun breaks; the slam, his brother's, once he's alone)
        // (a skull off the belt at its waist, its brother's bomb too once it's alone)
        attacks: {
          volley: { warn: 0.8, recover: 0.8 }, mend: { warn: 2.6, recover: 0.4 }, slam: { warn: 1.0, recover: 0.9 },
          bomb: { warn: 1.1, recover: 0.7 }, poison: { warn: 1.1, recover: 0.7 },
        },
      },
    },
    note: {
      role: 'Boss of the Crypt, with his twin',
      does: 'Reliquary, the thin one of the Ossuary Twins: a hooded skeleton holding a bronze reliquary, five skulls circling it. It shares one life with its brother Slab, looses volleys of skulls that curve in on you, and mends the pair if Slab is left hurt and untouched.',
      strengths: ['A volley of skulls, each curving in on its own arc to where you stood.', 'Leave Slab hurt and unhit for a few seconds and it mends the pair\'s life.', 'It keeps its distance, backing off from a hero who closes in.', 'Left alone at half, it takes up its brother\'s slam too.', 'It throws poison skulls off its belt that leave a green cloud where they land.'],
      weaknesses: ['A stun or a freeze breaks its mend.', 'Its skulls fly at where you stood: keep moving and they miss.', 'Its body is thin and frail-looking, and it shares the life you take from Slab.', 'A cloud only hurts inside its edge, a little at a time, and fades away.', 'It carries only a few poison skulls, and none come back.'],
      beat: ['Keep hitting Slab now and then so the mend never starts.', 'Save a stun for the moment it raises its casket to mend.', 'Move across the volley rather than away from it.', 'Step out of a cloud at once; never fight inside one.', 'Draw the clouds away from where you want to stand.'],
      vs: {
        warrior: 'Charge in to break its distance, and stun it as it mends; walk out of a cloud before you swing.',
        mage: 'Freeze it mid-mend; your bolts outrange its retreat, so cast from outside its clouds.',
        ranger: 'Your shots reach it wherever it backs off to: keep it busy while Slab is held at bay, and shoot from outside its clouds.',
      },
    },
  },
};

/**
 * The Ossuary Twins' own numbers (entities/twins.ts). `chain`: the bone chain between them, snapping tight past `max` m
 * apart, dragging both `drag` of the way back together and hurting `hurt` of Slab's damage to a hero within `reach` m of
 * its line. `slam`: the grave slam's ring (m) before Slab, `ahead` m out. `charge`: the shoulder charge's reach (m), speed
 * (m/s), its body's width (m) and its hurt. `volley`: 3 to 5 skulls (more alone), their speed (m/s) and how far they
 * swing out (rad). `mend`: Reliquary mends the pair `heal` of its life once Slab has gone `untouched` s unhit and hurt,
 * the channel broken by a stun. `alone`: the one left standing at half, `faster` and casting `sooner`.
 *
 * `belt`: the skulls each twin carries on a rope at its waist, `skulls` for the whole fight (none come back; the one
 * left standing at half takes its brother's what's left of them), one thrown no sooner than `first` s into the fight
 * and `every` s after the last, at a hero `reach` m off, and never while its last is still out; each flies `flight`
 * s (and that much more a metre). Slab's are bombs (`bomb`): it lands, lies `fuse` s with its glow on the floor
 * drawing in, and bursts for `hurt` times its thrower's damage within `radius` m, stunning a hero there `stun` s
 * (from Kenneth: "lets not have it launch you out. instead damage and stunned"), never again within `rest` s of a
 * stun's end, and nothing else of the pair landing on him till he can move (`claimBeat`). Reliquary's are poison (`poison`): a cloud `radius` m across where it lands for `life` s, hurting a hero inside
 * it `hurt` times its thrower's damage every `every` s.
 */
export const TWINS = {
  chain: { max: 15, drag: 0.55, reach: 1.1, hurt: 0.6, every: 1.2 },
  slam: { radius: 3.4, ahead: 2.6 },
  charge: { reach: 9, speed: 15, width: 1.6, hurt: 0.8 },
  volley: { least: 3, most: 5, speed: 12, swing: 0.55, radius: 0.5 },
  mend: { untouched: 5, heal: 0.05 },
  alone: { faster: 1.35, sooner: 0.7 },
  beat: 1.6,
  belt: { skulls: 4, first: 6, every: 9, reach: [5, 18] as [number, number], flight: [0.75, 0.035] as [number, number] },
  bomb: { fuse: 2, radius: 3, hurt: 1.6, stun: 1.2, rest: 3 },
  poison: { radius: 2.6, life: 6, every: 0.5, hurt: 0.14 },
};
