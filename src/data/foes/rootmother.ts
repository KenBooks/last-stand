// The Rootmother: the Thornwood's second boss, on its ladder (data/biomes.ts `bosses`), and the seed pods she flings.
// Their stats at wave 1 (`EnemyDef`) and how to fight them (the guide's words, no figures): read by data/enemies.ts
// with every other foe's file in this folder; her own numbers (`ROOTMOTHER`) read by her fight (entities/rootmother.ts)
// and the guide.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { rootmother: true; seedpod: true } }

export const FOES: FoeFile = {
  rootmother: {
    def: {
      name: 'The Rootmother', model: 'rootmother', ai: 'rootmother',
      // (her speed only while she drags herself on her roots to a hero a vine holds: `ROOTMOTHER.drag`)
      life: 4000, damage: 100, damageType: 'vitality', speed: 0.9, radius: 2.4, gait: 2.6,
      range: 6, windup: 1, recover: 1, cooldown: 2.6,
      summon: 'thornling',
      // (her accent a deep green: a pale lime aura washed her out from above, as a pale one did the Bell-Warden's fall)
      cost: 0, score: 70, knockbackResist: 1, freezeResist: 1, heft: 6, boss: true, accent: 0x3f8f24, ignoresLures: true,
      bossKit: {
        phases: [
          { below: 1 },
          { below: 0.5, banner: 'The canopy closes · Her heart wakes' },
        ],
        // (each one's warning: her arms drawn back for the vines, a pod plucked from her hair, her arms raised as the
        // thorns stir round her trunk, her hands pressed to the earth as it cracks under a hero)
        attacks: {
          vines: { warn: 0.9, recover: 0.8 },
          seeds: { warn: 0.8, recover: 0.7 },
          thorns: { warn: 1.3, recover: 0.6 },
          erupt: { warn: 1.05, recover: 0.5 },
        },
        // (her heart, open a while every minute: only what strikes it takes more, an arrow or a bolt landed in it;
        // the rest of her takes as ever)
        weak: { taken: 1, edge: 0xffb040, spot: { y: 1.75, wide: 0.8, high: 1.4, taken: 1.5 } },
        comes: 'middle',
      },
    },
    note: {
      role: 'Boss of the Thornwood',
      does: 'A giant woman grown out of a hollow tree in the middle of the arena, her lower half all roots. She sends vines creeping along the floor after you, flings seed pods that hatch into Thornlings, and raises a ring of thorns round her trunk when you stand close. Under half her Health the canopy closes: spore clouds drift over the floor and the earth erupts under your feet.',
      strengths: ['A vine that touches you holds you in place, and she drags herself towards you while it does.', 'Seed pods left alone burst into a pack of Thornlings.', 'Her thorns punish standing next to her trunk.', 'In her second phase, the floor itself turns against you: spores and eruptions.'],
      weaknesses: ['Her vines creep in a line and turn slowly: a step aside dodges one.', 'One hit of anything pops a seed pod.', 'Her heart opens in her trunk every so often, plain to see: shots that strike it deal half again their damage, and she attacks nothing while it is open.', 'She cannot walk: she only moves by dragging herself to a hero her vine holds.'],
      beat: ['Keep moving across her vines, not away along them.', 'Pop every pod as it lands, before it hatches.', 'Save your burst for when her heart opens, and aim it at the heart.', 'In her second phase, watch the floor: step out of a spore cloud, and off the cracks before they burst.'],
      vs: {
        warrior: 'Bull Rush or a dash tears you free of a vine; stay out of her thorns between hits.',
        mage: 'Veilstep frees you from a vine; bolts into her open heart.',
        ranger: 'An arrow cuts a vine whole and frees whoever it holds; shoot her heart when it opens.',
      },
    },
  },
  // (a pod she flings: brought into her fight, no foe of any roster, `broughtBy`)
  seedpod: {
    def: {
      name: 'Seed Pod', model: 'seedpod', ai: 'seedpod',
      life: 1, damage: 0, damageType: 'physical', speed: 0, radius: 0.5,
      range: 0, windup: 1, recover: 1, cooldown: 1,
      cost: 0, score: 0, knockbackResist: 1, freezeResist: 1, broughtBy: 'rootmother',
    },
    note: {
      role: 'The Rootmother\'s brood',
      does: 'A husk the Rootmother plucks from her hair and flings across the arena. Left alone, it splits open and a pack of Thornlings pours out.',
      strengths: ['Several land at once, far apart.', 'Each one that hatches adds a pack of Thornlings to the fight.'],
      weaknesses: ['One hit of anything pops it.', 'It never moves or attacks.'],
      beat: ['Pop them as soon as they land, before they hatch.', 'An area attack or a passing shot is enough.'],
    },
  },
};

/**
 * The Rootmother's own numbers (entities/rootmother.ts). `vines`: `count` [least, most] creep out from her roots along
 * the floor at `speed` (m/s), each after a hero, turning towards him at most `turn` (rad/s: a step aside dodges it),
 * laid in pieces of `piece` m to `length` m at most; any of it a hero touches within `reach` (m) holds him `hold` s; it
 * lies `lies` s once grown, then withers. One arrow cuts a vine (entities/throws.ts `cutVineAlong`). `seeds`: `count`
 * pods flung `flight` s to land `near`..`far` m from her (and `clear` m from every hero), each bursting into `brood`
 * Thornlings after `hatch` s unless popped, while fewer than `aliveMost` foes stand. `thorns`: rise from her trunk out
 * to `radius` m for `last` s, hurting a hero in them `hurt` of her damage every `tick` s; she raises them while a hero
 * stands within `near` m. Phase 2: `spores`, a cloud every `every` s while fewer than `most` drift, `radius` m wide,
 * drifting at `speed` m/s for `life` s, hurting `hurt` every `tick` s whoever stands in one; `erupt`, spikes bursting
 * `radius` m round where a hero stood (`hurt` of her damage). `every`: one attack in `every` of phase 2's is an
 * eruption. `heart`: her heart opens `first` s after she rises and every `every` s after (start to start), for `open`
 * s: she meditates, attacking nothing, and flings a pod every `podEvery` s, `pods` in all, round the arena; what
 * strikes her heart meanwhile takes `bossKit.weak.spot.taken` times the damage. `drag`: while a vine holds a hero she tears her roots up and hauls
 * herself towards him at her `speed`, stopping `near` m (and her radius and his) from him, or as the hold ends.
 */
export const ROOTMOTHER = {
  vines: { count: [2, 3] as [number, number], speed: 5.5, turn: 0.8, piece: 1.6, length: 24, reach: 0.6, hold: 2, lies: 1.5 },
  seeds: { count: 3, flight: 1.1, near: 7, far: 21, clear: 3, hatch: 10, brood: 2, aliveMost: 14 },
  drag: { near: 1.2 },
  thorns: { radius: 6, last: 3, hurt: 0.22, tick: 0.5, near: 7 },
  spores: { every: 5.5, most: 3, radius: 2.6, speed: 1.3, life: 14, hurt: 0.07, tick: 0.5 },
  erupt: { radius: 2.2, hurt: 0.6, every: 2 },
  heart: { first: 45, every: 60, open: 10, pods: 6, podEvery: 1.5 },
};
