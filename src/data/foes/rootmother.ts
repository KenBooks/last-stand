// The Rootmother: the Thornwood's second boss, on its ladder (data/biomes.ts `bosses`), and the seed pods she flings.
// Their stats at wave 1 (`EnemyDef`) and how to fight them (the guide's words, no figures): read by data/enemies.ts
// with every other foe's file in this folder; her own numbers (`ROOTMOTHER`) read by her fight (entities/rootmother.ts)
// and the guide.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { rootmother: true; seedpod: true; bigpod: true } }

export const FOES: FoeFile = {
  rootmother: {
    def: {
      name: 'The Rootmother', model: 'rootmother', ai: 'rootmother',
      // (she never walks: she burrows, `ROOTMOTHER.burrow`, going under the floor at its own speed; `speed` is read
      // only by a wave's timing, game/run.ts `reachIn`, which divides by it)
      life: 4000, damage: 100, damageType: 'vitality', speed: 1.2, radius: 2.4, gait: 2.6,
      range: 6, windup: 1, recover: 1, cooldown: 2.3,
      summon: 'thornling',
      // (her accent a deep green: a pale lime aura washed her out from above, as a pale one did the Bell-Warden's fall)
      cost: 0, score: 70, knockbackResist: 1, freezeResist: 1, heft: 6, boss: true, accent: 0x3f8f24, ignoresLures: true,
      bossKit: {
        phases: [
          { below: 1 },
          { below: 0.5, banner: 'The canopy closes · Her heart wakes' },
          { below: 0.25, banner: 'Her bark splits · She rages' },
        ],
        // (each one's warning: her arms drawn back for the vines, a pod plucked from her hair, her arms raised as the
        // thorns stir round her trunk, her hands pressed to the earth as it cracks under a hero; a branch snapped off
        // her crown and her arm drawn back over her shoulder before she hurls it, both arms for a fan or a line; her
        // palms on the earth through an eruption that follows a hero; her palms pressed to the earth as it cracks in a
        // ring round a hero who stands still, then both arms raised high as a great root rises beside the cage and
        // brought down with it)
        attacks: {
          vines: { warn: 0.9, recover: 0.8 },
          seeds: { warn: 0.8, recover: 0.7 },
          thorns: { warn: 1.3, recover: 0.6 },
          erupt: { warn: 1.05, recover: 0.5 },
          branch: { warn: 0.95, recover: 0.6 },
          fan: { warn: 1.05, recover: 0.7 },
          volley: { warn: 1.25, recover: 0.8 },
          pair: { warn: 0.95, recover: 0.6 },
          // (her rain: her first throw as its warning ends, the rest one every `branch.rain.every` s through what
          // follows, so it lasts the rain's whole length)
          rain: { warn: 0.9, recover: 3 },
          chase: { warn: 0.3, recover: 2.7 },
          cage: { warn: 1.1, recover: 0.4 },
          crush: { warn: 4.5, recover: 0.9 },
        },
        // (her heart, open a while every minute: only what strikes it takes more, an arrow or a bolt landed in it;
        // the rest of her takes as ever)
        weak: { taken: 1, edge: 0xffb040, spot: { y: 1.75, wide: 0.8, high: 1.4, taken: 1.5 } },
        comes: 'middle',
      },
    },
    note: {
      role: 'Boss of the Thornwood',
      does: 'A giant woman grown out of a hollow tree in the middle of the arena, her lower half all roots. She sends vines creeping along the floor after you, snaps thorned branches off her crown and hurls them where you will be, reading which way you run, flings seed pods that hatch into Thornlings (and from half her Health great pods that hatch into Mossbacks), and raises a ring of thorns round her trunk when you stand close. Under half her Health the canopy closes: spore clouds drift over the floor, the earth erupts under your feet and she throws her branches three at a time. Under a quarter she rages: quicker, a line of branches that stays as bramble, and the earth bursting under you three times as you run. Stand still too long and the earth cracks in a ring round you: roots burst up and close over you in a cage, and a great root rises beside it and slams down on it. She never walks: she sinks into the earth, a ridge of soil heaving over her way, and rises near you where the ground bulges and cracks.',
      strengths: ['A vine that touches you holds you in place, and she throws a branch at you while it does.', 'Her thrown branches reach you anywhere in the arena, and land where you are running to.', 'She throws in combos: a pair (where you stand and where you are going), and from half her Health a rain of four, one after another.', 'Seed pods left alone burst into a pack of Thornlings.', 'Her thorns punish standing next to her trunk.', 'In her second phase, the floor itself turns against you: spores and eruptions.', 'Raging, she attacks more often, and her bramble cuts the arena.', 'Standing still is punished: she cages you in roots and brings a great root down on the cage.', 'Running from her is no escape: she goes under the floor and rises near you.'],
      weaknesses: ['Her vines creep in a line and turn slowly: a step aside dodges one.', 'She snaps a branch off and draws her arm back before every throw, and its landing is marked on the floor while it flies: step off the mark.', 'One hit of anything pops a seed pod; a great pod takes a few, and ripens slower.', 'Her heart opens in her trunk every so often, plain to see: shots that strike it deal half again their damage, and she attacks nothing while it is open.', 'She never walks: to come after you she drives her roots into the earth and goes under, and while she is under the floor nothing strikes her.', 'The cage warns first, a ring of cracks round you; and a root of it breaks in a few hits, a gap of one enough to step out. Her great root comes down on the cage\'s place alone, after a long rise.', 'She shows where she will rise: the soil heaves along her way under the floor, and the ground bulges and cracks over the spot for a second first. Rising, she harms no one.'],
      beat: ['Keep moving across her vines, not away along them.', 'When her arm goes back, change what you are doing as it leaves her hand: stop, turn back or step aside, and her lead misses. Running on in a straight line is what she reads best. Step off the ring her branch will land in. A fan lands three across, a line five: step along it, towards her or away.', 'Get out of a vine fast: she throws at whoever it holds.', 'Pop every pod as it lands, before it hatches; start on a great pod at once, as it takes a few hits.', 'Save your burst for when her heart opens, and aim it at the heart.', 'In her second phase, watch the floor: step out of a spore cloud, and off the cracks before they burst.', 'Raging, keep running: the earth bursts where you stood a moment ago, three times.', 'When the earth cracks in a ring round you, walk out of it before the roots close. Caged, cut a root at once and step out before her great root comes down.', 'When she sinks, follow the ridge of soil: be ready where the ground bulges, and use the time she is under to pop pods and heal.'],
      vs: {
        warrior: 'Bull Rush or a dash tears you free of a vine and breaks a root of her cage; raise your shield towards her and her branches break on it, and it takes most of her great root\'s blow; stay out of her thorns between hits.',
        mage: 'Veilstep frees you from a vine, takes you off a branch\'s mark and through the bars of her cage; bolts into her open heart.',
        ranger: 'An arrow cuts a vine whole and frees whoever it holds, before her branch lands; walk off its mark; two arrows break a root of her cage; shoot her heart when it opens.',
      },
    },
    // (the Rootmother's crest: old bark and her heart's amber)
    trophy: { name: "The Rootmother's Crest", kind: 'wall', place: 'wall-outer-left', colour: 0x6e5a44, trim: 0xff9a38 },
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
  // (her great pod, from her second phase: brought into her fight as her small ones are; `hits` to pop it, whatever
  // each deals: from Kenneth, "Can you have stronger mobs come from larger cacoons for the mother")
  bigpod: {
    def: {
      name: 'Great Seed Pod', model: 'bigpod', ai: 'seedpod',
      life: 1, damage: 0, damageType: 'physical', speed: 0, radius: 0.85, hits: 5,
      range: 0, windup: 1, recover: 1, cooldown: 1,
      cost: 0, score: 0, knockbackResist: 1, freezeResist: 1, broughtBy: 'rootmother',
    },
    note: {
      role: 'The Rootmother\'s greater brood',
      does: 'A swollen husk twice a seed pod\'s size, glowing amber through its veins, that the Rootmother flings from her second phase on. Left alone, it splits open and a Mossback climbs out.',
      strengths: ['What hatches from it is a Mossback, far tougher than a Thornling.', 'It takes several hits to pop, whatever each deals.'],
      weaknesses: ['It ripens slower than a small pod.', 'It never moves or attacks.', 'Its amber glow shows it from across the arena.'],
      beat: ['Pop the great pods first: a small pod falls to one hit, a great one takes a few.', 'A quick weapon or a volley of arrows pops it fastest: it counts hits, not damage.'],
    },
  },
};

/**
 * The Rootmother's own numbers (entities/rootmother.ts). `vines`: `count` [least, most] creep out from her roots along
 * the floor at `speed` (m/s), each after a hero, turning towards him at most `turn` (rad/s: a step aside dodges it),
 * laid in pieces of `piece` m to `length` m at most; any of it a hero touches within `reach` (m) holds him `hold` s; it
 * lies `lies` s once grown, then withers. One arrow cuts a vine (entities/throws.ts `cutVineAlong`). `seeds`: `count`
 * pods flung `flight` s to land `near`..`far` m from her (and `clear` m from every hero), each bursting into `brood`
 * Thornlings after `hatch` s unless popped, while fewer than `aliveMost` foes stand. `great` (from Kenneth: "Can you have
 * stronger mobs come from larger cacoons for the mother"): of each volley, `byPhase` of her phase are great pods
 * (`bigpod`: none in phase 1, one in phase 2, two raging), each taking its `hits` (5) to pop, whatever each deals, and
 * bursting into `brood` `hatches` (a Mossback) after `hatch` s unless popped; her heart's pods are small. `thorns`: rise from her trunk out
 * to `radius` m for `last` s, hurting a hero in them `hurt` of her damage every `tick` s; she raises them while a hero
 * stands within `near` m. Phase 2: `spores`, a cloud every `every` s while fewer than `most` drift, `radius` m wide,
 * drifting at `speed` m/s for `life` s, hurting `hurt` every `tick` s whoever stands in one; `erupt`, spikes bursting
 * `radius` m round where a hero stood (`hurt` of her damage). `every`: one attack in `every` of phase 2's is an
 * eruption. `heart`: her heart opens `first` s after she rises and every `every` s after (start to start), for `open`
 * s: she meditates, attacking nothing, and flings a pod every `podEvery` s, `pods` in all, round the arena; what
 * strikes her heart meanwhile takes `bossKit.weak.spot.taken` times the damage. `burrow` (from Kenneth: "instead of
 * moving slowly, it teleports, just going underground, roots going into the ground, and then it appears near you. It
 * should look like it actually going underground"): she never moves above ground. She goes under over `sink` s (her
 * roots driven down into the soil over its first `roots` share, her body after them, `depth` m under the floor, the
 * soil heaving round her and a mound left that settles), travels under the floor at `speed` m/s (`least` s at least), a
 * ridge of soil heaving along her way and cracking behind it, then the earth bulges and cracks where she'll rise for
 * `warn` s, and she rises over `rise` s (her roots burst out first, over its first `roots` share, spread and grip, her
 * body after them). She rises `ring[0]` to `ring[1]` m (middle to middle) from the hero she goes for, on a spot clear of
 * the props, the wall (`clear` m past her radius) and every hero; rising deals no damage. She can't be struck from the
 * moment her body is half under (`hidden` of `sink`) until her crown breaks the floor as she rises (`shows` m up), and attacks nothing meanwhile. She
 * burrows when the hero she goes for has been `far` m or more from her for `farFor` s, or at the end of a set of her
 * attacks (`ROUNDS`) once `every` s have passed since she last rose (`first` s after she comes on); never with her heart
 * open or her cage standing.
 * `branch`: a thorned branch snapped off her crown and hurled at a hero `near` m or more from her trunk (or one a vine
 * holds, wherever he is), on an arc from her hand to where he stood as it left it, flying `flight[0]` + `flight[1]` s a
 * metre, its landing marked on the floor while it flies; it bursts `splash` m round where it lands (`hurt` of her
 * damage, blocked by a shield raised towards her) and sticks in the earth `sticks` s (in a prop it meets on its way,
 * hurting no one). Phase 2 throws a fan of three across where he stood, `apart` m apart, each `fanHurt` within
 * `smallSplash` m (so no hero is in two: `apart` is more than twice that and his body); her rage a
 * line of five across her line to him, `lineApart` m apart and landing `lineEvery` s after each other, each
 * `lineHurt` within `smallSplash` m, which stay `bramble` s as a hazard `brambleReach` m round each, hurting `brambleHurt` every
 * `brambleTick` s whoever stands in one. No two of her hits land within `gap` s (`claimBeat`).
 * Her branches lead a hero who moves (from Kenneth: "It should throw more sticks at the ground, like combos, and they
 * should even try to predict your path"): each is aimed at where he will be when it lands, his pace over the floor
 * (smoothed over `lead.smooth` s, read from his place frame to frame, so a partner's copy is led too) over its flight,
 * round the turn his way is taking (`lead.turnMost` rad/s at the most: a hero circling her is led round his circle),
 * and a share of it (`aims`), led `lead.most` m at the most, so a hero who stops or turns as it leaves her hand is out
 * of its ring; inside the arena by `lead.inside` m. A single branch is led whole, a fan's middle whole, a line's half.
 * `pair` (every phase): two branches, the first where he stands and the second led, landing `pair.later` s after it,
 * `pair.hurt` each within `splash` m (a hero who keeps on is in the second's ring, one who stops in the first's).
 * `rain` (phase 2 and her rage): `rain.count` branches one after another, `rain.every` s apart, each aimed as it
 * leaves her hand, led by its share of `rain.aims` (whole, half, where he stands, whole), `rain.hurt` each within
 * `smallSplash` m: no step taken once and kept dodges it. With several heroes far off she throws at each in turn, and a
 * rain's branches go to them in turn. Her phase 2 eruption is led too, where he'll be as it bursts (`erupt`'s warning
 * on). Her branches' hurt grows by phase (`phaseHurt`), and her pause between attacks
 * is `tempo` of her cooldown in each phase (she spends more of her fight attacking). `rage` (her third
 * phase): her pause between attacks shortest (`tempo`), and `chase`: the earth erupts `count` times under a
 * hero, each warned `warn` s where he stands as it begins (cracks and a ring), `every` s apart, each `hurt` of her
 * damage `radius` m round. `cage` (every phase): at a hero who has stood within `still.radius` m for `still.time` s, every
 * `every` s at most (`first` s after she rises), one at a time: the earth cracks in a ring `radius` m round where he
 * stands through the `cage` warning, then `roots` roots burst up along it and arch over to close (`burst` s up, `close`
 * s over), each a prop `rootR` m round and `rootH` m tall that he can't walk through, broken in `hits` of a prop's hits
 * (an arrow or a swing 1, Bull Rush 3, a nova 4): one broken is a gap enough to step out. Two, and her blow 4.5 s
 * after it shuts (`crush.warn`): a ranger shoots every 1.45 s (his least draw 0.55, his follow-through 0.9, which slows
 * his walk out after), so caged at any point of his shot he breaks one with his next two and is out 3.1 to 4.1 s after
 * it shut (`lab boss --parts rootCage --class ranger`); at 4 s, two in six were caught. It withers after `life` s.
 * As it shuts she begins `crush` (its warning `crush`'s): a great root rises beside the cage, `rise` m off its edge on her
 * side, and slams down across it as the warning ends, `blow.hurt` of her damage to a hero within the ring and
 * `blow.reach` m more, knocked `blow.knock` m/s off; a shield raised towards her (the great root's foot) blocks of it what it blocks of any blow (`Player`'s block: its
 * block amount, the guard broken past it). None of her other
 * hits lands within `gap` s of its shut and its blow (`claimBeat`), and no branch is thrown at a hero it holds.
 */
export const ROOTMOTHER = {
  vines: { count: [2, 3] as [number, number], speed: 5.5, turn: 0.8, piece: 1.6, length: 24, reach: 0.6, hold: 2, lies: 1.5 },
  seeds: {
    count: 3, flight: 1.1, near: 7, far: 21, clear: 3, hatch: 10, brood: 2, aliveMost: 14,
    great: { byPhase: [0, 1, 2] as [number, number, number], hatch: 16, hatches: 'mossback', brood: 1 },
  },
  burrow: {
    sink: 1.3, roots: 0.4, depth: 8, hidden: 0.5, shows: 1, speed: 9, least: 0.6, warn: 1.2, rise: 1.1,
    ring: [7.5, 9.5] as [number, number], clear: 1, far: 13, farFor: 9, every: 24, first: 15,
  },
  thorns: { radius: 6, last: 3, hurt: 0.22, tick: 0.5, near: 7 },
  spores: { every: 5.5, most: 3, radius: 2.6, speed: 1.3, life: 14, hurt: 0.07, tick: 0.5 },
  erupt: { radius: 2.2, hurt: 0.6, every: 2 },
  heart: { first: 45, every: 60, open: 10, pods: 6, podEvery: 1.5 },
  branch: {
    near: 8, flight: [0.5, 0.035] as [number, number], splash: 1.3, hurt: 0.6, sticks: 2.2,
    smallSplash: 1, apart: 3.2, fanHurt: 0.4, lineApart: 3.2, lineEvery: 0.12, lineHurt: 0.4,
    bramble: 3.5, brambleReach: 0.8, brambleHurt: 0.05, brambleTick: 0.5, gap: 0.35,
    lead: { most: 7.5, smooth: 0.25, inside: 2, turnMost: 1.5 },
    pair: { later: 0.15, hurt: 0.45 },
    rain: { count: 4, every: 0.85, aims: [1, 0.5, 0, 1], hurt: 0.35 },
    phaseHurt: [1.25, 1.4, 1.55] as [number, number, number],
  },
  tempo: [0.85, 0.7, 0.55] as [number, number, number],
  rage: { chase: { count: 3, warn: 0.8, every: 0.95, hurt: 0.45, radius: 2 } },
  cage: {
    still: { radius: 1.2, time: 2 }, every: 14, first: 8, radius: 1.7, roots: 9, rootR: 0.28, rootH: 2.4, hits: 2,
    life: 6.5, burst: 0.22, close: 0.38, rise: 1.4, gap: 0.6,
    blow: { hurt: 1.5, reach: 0.4, knock: 9 },
  },
};
