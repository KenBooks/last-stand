# `boss`

The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `boss`: the bosses' fights (`page/boss.ts`; `src/entities/bossKit.ts`), in parts (`--parts`, all by default).
  `ladder`: in each battleground, boss waves 5, 10, 15 and 20 set off from their countdown as the run sets one off
  (its wave and timer), the boss the run holds for it (`RunState.boss`) against its ladder's rung (`data/biomes.ts`
  `bosses`, round again past its end) or the exception holding that wave (`bossWaves`: the Twins on the Crypt's 15th),
  the banner's line and the Continue button's name. `stand`: the hero walks into a Colossus held still for 3 s: it
  may give way 2 cm at most, and he must reach its body and be held off it (`holdOffBoss`). `ttk`: the hero's basic
  attack (LMB) held 8 s on a Colossus held still 3.6 m off (a shooter 8 m), its damage a second, and from it the time
  the Colossus takes at wave 5 (its life by `SCALING`), with the lab's starting gear. `--canary` plants a fault each
  part must catch (a rung slipped onto the Crypt's ladder, a boss that yields as a small foe does, an attack that deals
  nothing). Run it for each hero: `--class mage`, `--class ranger`, `--class warrior --gear shield`.
  The Rootmother's parts (`page/bossRootmother.ts`; `src/entities/rootmother.ts`), the hero 14 m from the
  Thornwood's middle where nothing stands between him and her (on the diagonal a stump took the arrows): `rootPhases`:
  her life a hundredth over and under her second phase's share, its banner, the canopy closed 4 s into it (`shade`
  over 0.95) and open 4 s after her death. `vines`: one vine sent at him standing still must hold him its `hold`
  within 4 frames, and she must stand where she stands meanwhile and after (1 cm: she never walks, and the hold is
  too short for her burrow, which her set-up holds off); with a bow (`--class ranger`) a shot at the floor 2.5 m back along it towards her must cut it and
  let him go within 15 frames of the loose, the bow let go 10 frames into the hold, drawn as far as it is, and the
  arrow must leave while the vine holds him (held for its whole draw it left 19 frames after the hold's own end, and
  the part passed testing nothing; `throws`' shot had the same). `pods`: her pods flung (as many as she flings, each `near` to `far` from
  her) in her first phase and her second, as many great pods among them as `great.byPhase` says (0, then 1); for each
  size one left alone bursting into its brood its `hatch` s after it rose (within 0.15 s: a small pod's 2 Thornlings at
  10 s, a great pod's Mossback at 16 s, nothing else out of it), and one struck by his basic attack held on it popped
  in its hits (1, a great pod's 5, each counted as it takes it), nothing hatching from it. Its canary has small pods
  never hatch and a great pod hatch the small pod's brood. `podPictures` (by name): a small pod and a great one side
  by side as the player sees them, and a great pod bursting into its Mossback. `heart`: her heart brought to open (1 s in, as its own
  45 s are too long to wait): open its `open` s (within 0.1), its banner, nothing attacked through it, `pods` pods
  flung; the spot read at points on her (in her heart its `taken`, her flank and back 1, shut 1); with a bow, in a
  second opening with her pods held back (flung between him and her, they took the arrows), two shots at her flank
  and the rest in her heart, his crits held off: those in it `taken` times the others within 0.2; and in her second
  phase an eruption at him hurting him no sooner than its warning and opening nothing. `rootBurrow`
  (`page/bossRootBurrow.ts`; `src/entities/rootBurrow.ts`; from Kenneth: "instead of moving slowly, it teleports,
  just going underground, roots going into the ground, and then it appears near you"): her wait given over and the
  hero 14 m off (past her `far`), she burrows, read frame by frame: how far she moved with any of her drawn over the
  floor (0 m: her top as drawn, her meshes' bounds, her kept pools left out), her top under the floor as she first
  moves (0.77 m under), her rise warned at its spot for `warn` s at least (1.20), the spot `ring` m from the hero (7.5)
  and clear of the props, the wall and every hero (`clearSpot`), struck-proof every frame from half under till she
  rises, none of her hits landing meanwhile, no pipeline made. Its canary plays it three times more, a fault each
  (`BURROW_CANARY`): moving as she begins to sink (5 m with her over the floor, her top 7.2 m up as she moved), rising
  unwarned, rising on the hero; each must be caught, and the part says which were. `rootBurrowPictures` (by name):
  her sink, the ridge travelling and her warned rise as the player sees them (the top view zoomed out as far as a
  player may, her 14 m off), and her sink from her side from the developer mode's free camera held still beside her (`page/bossSideView.ts`,
  as the Stag's stride pictures are), the browser's picture of the page (`lab.screen`), the engine's frame. `compiles` draws her fight's every effect too, and `ttk` adds the
  Thornheart at wave 5 and the Rootmother at 10, on her body alone and with every hit through her heart's windows
  in it. The Stag of Ash's (`page/bossStag.ts`), each on a lane found for it 13 m from the hero: `stagCharge` in the open (its lane
  pointed at the hero and as long as its charge, its set-off within 3 frames of its warning's end, the hero gored once, its run to its
  length, its fire laid along 85% of it at least, the hero put in it burnt `BURN_HOLD / tick` times within one, none left after its life),
  `stagCrash` (a hero 3 m before the wall stepping out of the lane as it sets off, one behind a rock or a tree, and with
  `--class warrior --gear shield` one raising his shield in the open: each crashed into what it was meant to, stunned and open its `stun` s
  within 0.1 at `taken` times, no gore), `stagPhase2` (at 45% of its life: phase 2, a second charge pawed the frame the first runs out,
  its fire `late` s, at least its embers' share in 8 s, each near the hero), `stagToss` (it risen 3.6 m before the hero, its toss let
  come: in the open seized within 3 frames of its warning's end, held 3 m up at least, thrown 10 m at least and hurt once as he lands;
  before the wall thrown short of it, inside the arena and clear of the props; one stepping 5 m aside halfway through its warning, and
  with a shield one raising it towards it, never seized and never hurt), `stagClose` (the hero kept up close 12 s, put back before it
  as he lands from each toss: its longest stretch neither acting, walking nor turning at most 0.6 s, at least one toss and
  its gores and stamps counted; Kenneth played it standing before him doing nothing), `stagReach`
  (`page/bossStagReach.ts`; from Kenneth, "have him actually bend down to reach you, he is just attacking the air
  instead"): the hero stood 0.3 to 3.3 m past its body and his and 0.6 rad either side of its facing, held there till
  its next close attack, the gore or the stamp as it chooses, and 0.3 to 1.7 m behind it 0.5 rad either side, its
  kick, read as each game judged it (`BLOWS`: its drawn tines', fore hooves' or hind hooves' nearest to a capsule his
  radius round from his feet to his head, his own height): every case struck, run as each class (`--class`) for each
  one's height; its canary keeps its neck up through the gore, brings its fore hooves down behind where they stood
  and kicks its hind hooves forward under it, and every case misses; `stagBreath` (`page/bossStagBreath.ts`): its
  breath at the hero 7 m past its body, read as his game judged it (`BREATHS`, `FIRES`): in the open burnt once and
  the ground left burning along its sweep; walking round it away from the line that marks where it begins, from the
  moment that line shows, never burnt; behind a rock, its cone passing over him and the rock taking it; with a shield
  (`--class warrior --gear shield`) raised towards it, the shield taking it (the burning ground still burns him); then
  the wood it breathes over alight with a pooled light, a hero stood beside it once the ground's fire is out burnt
  every tick, out after its life, and four pieces set alight at once burning three, the oldest put out. Its canary
  narrows its cone to none; `stagShed` (`page/bossStagShed.ts`): its life taken under its second phase's share, its
  shed a warned smash, its model's antlers shed, its four stakes standing among the obstacles inside the wall, apart,
  each blocking a line across it, no pipeline made; a hero beside one burnt about once a tick; one struck its hits
  broken and out of the obstacles; up close after it no gore or toss, its hoof strike; the stakes gone after their
  life. Its canary keeps the stakes whole for good; `stagToss` also has a hero before a prop (thrown short of it), one
  stepping back through its warning (tossed all the same: it lunges after him), and in every toss the hero airborne
  through his flight and a hit sent at him in the air landing nothing; `compiles` draws its every effect and `ttk` adds it at wave 15,
  struck throughout and with every charge crashed. Its canary's faults: a fire that reaches no one, a crash that stuns nothing, its second
  phase's share moved, a toss that carries him nowhere, a stand of 2.5 to 3 s between its attacks up close. `stagPictures` (alone)
  pictures it and each stage of its fight, its triangles held to 45,000; `stagMoves` (alone) its toss step by step (its head down
  scraping the earth, the hero on its tines, thrown, in the air, landed). `stagStride` (`page/bossStagStride.ts`; models/stag.ts
  `stepLegs`; Victor's bar for the bosses, "would not be possible irl"): its hooves read as drawn frame by frame (each hoof's sole,
  the model's `stride.hooves`) through a charge along an open lane and a walk after a hero backing off at a slant (so it turns as it
  walks): a hoof on the floor moving 3 cm at most over its stay (0 in the charge and 1.4 cm in the walk as built), 8 steps at least
  each, 2 hooves at least on the floor every frame of the walk (a gallop's leaps are counted and said), its soles' depth under the
  floor said (none as built), and the quick steps it took (a hoof near its leg's reach). Before it, on its own clock, a hoof slid
  5.4 m over a stay in the charge and 80 m in the walk, its hooves sunk 0.7 m into the earth so they never left it; the slides found
  on the way were a walk's swing handed to the gallop leaping to its end, a stride's swing cut short snapping down where it was aimed,
  feet sunk by the body's lag behind a step up onto the dais, a hoof turned about its joint (pinned at the sole now), the cannon
  tilted with the hip's swing out and the body's roll (upright now), a tuck and a landing's aim moving a hoof on the floor, and a
  stretched leg dragging its hoof as it lifted (it steps before it locks out). Its canary carries its hooves with it, never planted:
  1.9 m in the charge and 23 m in the walk. Where the walk has a frame on one hoof it says what it last did and the
  24 frames before, each hoof's state with its leg's reach (a share of its length, and its ankle before or behind
  its hip): a long walk at full pace after a breath landed a hind hoof at 1.00 of its leg as the other stood at 0.97,
  the body carried too high, since lowered. `stagStridePictures` (alone) pictures its charge every 3 frames through a
  stride and more and its walk every 8, from its side at a man's eye (11 and 10 m off), both along a lane with its
  sides clear, and the charge as the player sees it. `stagStrideCost` (alone) times its planted hooves against the
  old pose on its own clock and against the stag not drawn, in turns of 30 frames within one page through its walk,
  drawn, by the browser's clock: its model's update a mean (it's under the clock's 0.1 ms step) and the frame's
  median. On this PC the stride cost its model 0.02 to 0.03 ms a frame more (0.03 to 0.05 against 0.01 to 0.02), the
  frame the same either way and with the stag hidden (3.4 to 3.5 ms in a quiet run): `stagPictures`' 1.3x is its
  fight against the battleground without it (its charges' fire and lane, its embers), the fork's stag before the
  stride 1.27x in the same measure.
  `rootPictures` (asked for alone) pictures her fight's moments, and `rootLook` (alone too) her model: from
  above and over the shoulder as the player meets her, then close (whole from four sides, her face, body, roots,
  her heart shut and open), and her triangles against the Thornheart's, at most 45,000. Her canary's faults: her second phase's
  share moved, a vine that reaches no one, pods that never hatch, a heart that never opens (its window of none), and
  her burrow's three. About 15 s a hero.
  `branches` (`page/bossRootBranches.ts`; from Kenneth, "we need more attacks, what about spikes that it throws at
  you ... Needs to be more dangerous"): her thrown branches at the hero 14 m off, read as the game played them
  (`BRANCHES`: each branch's aim, the ring's middle, and where it came down; what landed on him by his own
  `takeDamage`; `PIPELINES.made`): one at him standing still (in its ring, striking him once), one as he steps aside
  at a walk when it leaves her hand (none), one at a warrior's raised shield (`--class warrior --gear shield`: the
  shield takes it all), her fan in phase 2 (three in their rings, one striking him: they lie further apart than
  twice their burst and his body), her line in her rage (five in their rings, one striking him; its bramble hurting
  him standing in it and not once he has walked 3 m out along her line, which it lies across), no two of her
  bursts on him within `branch.gap` s, and no pipeline made (her thrown branches are her model's own, warmed with
  her). Its canary makes each burst six metres wide: the step aside is struck and the fan strikes three times.
  `threat` (by name; `page/bossThreat.ts`): each boss at wave 10 fighting a hero standing still 3 m past its body
  and 11 m past it, and one walking round where it stood 11 m past its body at his own speed (by the touch stick, as
  a player walks: placed round its live middle by the lab, he ran beside its charges, and his speed set by hand was
  set again by his own walk before anything aiming at him read it), whole and at 45% and 20% of its life (its later
  phases), 12 s a case, what lands on him (his
  `takeDamage`, his Health kept whole) as a share of his most Health a minute. Standing still is the worst a player
  does, so it reads each boss alike: before the branches the Rootmother landed nothing on a ranger 11 m off in her
  first phase; with them 73%. The Stag of Ash landed 78% on the hero walking round it whole
  and nothing in its later phases (its lane aimed on a straight line from him, wide of his curve), 157 to 223% once
  its aim followed his curve and a charge that missed wheeled round into another. Its canary takes her damage away.
  About 90 s a hero. `stagAttackPictures` (by name; `page/bossStagAttacks.ts`): each of the Stag's attacks at a hero
  where it makes it (the gore, the stamp, the kick behind it, the breath), from its side at a man's eye (the side view
  `bossSideView.ts` holds) and as the player sees it, and the wood its breath sets alight. `stagCost` (by name;
  `page/bossStagCost.ts`): its fight's frame at its busiest (its second phase, its four stakes, its breath and charge,
  three pieces of wood alight, embers) against without it, in turns of 10 s within one page as `rootCost` (with it
  timed from 1.5 s in, without it its last 2.5 s, once its fire has gone), each turn's median said: three separate
  runs of `stagPictures`' timing read 1.89x, 1.28x and 1.15x by the PC's load; in turns three runs read 1.41x, 1.39x
  and 1.31x (the Rootmother's `rootCost` 1.24x). `compiles` counts the
  engine's pipelines made (`PIPELINES.made`), as the Twins' does: it counted three's programs, none under the engine,
  and its canary went uncaught; its plant is a material of a blending, side and depth none else has together
  (`drawOdd`).
  `combos` (`page/bossRootCombos.ts`; entities/rootVolleys.ts; from Kenneth, "throw more sticks at the ground,
  like combos, and they should even try to predict your path"): her volleys at the hero 14 m off running round her
  (the touch stick, as a player steers him), each aim she took read against where he really was as it landed (his
  track frame by frame): a branch at him running on (it strikes him), stopping as it leaves her hand (it misses), a
  pair at him running on (its second strikes him) and turning back (both miss), her rain running on and zigzagging
  (its landings at least 0.65 s apart: the flash rule), her fan; each led aim along his way (a lead aimed where he
  stands is "not leading"), and each hero's dodge window (a branch's flight, its ring shown so long, against the time
  his run takes him out of its ring). Its canary takes her lead away: every aim not leading, the runner unstruck.
  `comboPictures` (by name): her rain and a pair at him running round her, as the player sees it, zoomed out.
  `rootThreat` (by name; `page/bossRootThreat.ts`): `threat` for a hero who moves, the Rootmother alone, 11 m off
  her body, standing, running straight (back and forth along a 26 m line across hers to him), strafing (round her) and
  zigzagging (round her, turning across his way every 0.8 s), whole and at 45% and 20%. `rootSurvive` (by name): how
  long the hero with the starting gear lasts strafing and zigzagging round her from her rise, attacking nothing, 75 s
  at most.
  `branchPictures` (by name): a branch from its side at a man's eye (the side view `bossSideView.ts` holds), her
  wind-up, the throw, its flight end over end and its landing, and as the player sees it; her fan, her line and its
  bramble, and her eruption chasing him, as the player sees them. `rootCost` (by name): her fight's frame at its
  busiest (her rage) against the battleground without her, in turns of 120 frames within one page (her body
  hidden and her thinking held, each turn's first 60 frames left out), drawn, timed by the browser's clock: 1.16x
  to 1.39x on this PC as its load went; her root cage let come as soon as it may, the frames with it standing timed
  apart (4.1 ms against her raging's 4.3: no cost this PC can read).
  `rootCage` (`page/bossRootCage.ts`; `src/entities/rootCage.ts`; from Kenneth: "Roots burst up in a ring round you
  after a short warning. Dash out before it closes, or cut a root to escape. While you're caged, she winds up a big
  hit. It punishes standing still."): her cage at the hero standing still 14 m off, read as the game played it
  (`CAGE_LOG`, `CAGE`, his own `takeDamage` as her blow landed, `PIPELINES.made`): standing (warned `cage.warn`
  before it shut, her blow `crush.warn` after, hurting him, withered `life` after; none of her other hits within
  `gap` of its shut or blow; no pipeline made), walking out as the cracks show (never caged), walking at the gap
  between two roots nearest his way out (held), one root broken by his game's hits (out through its gap before the
  blow), his class's own way out acting at once (the ranger's arrows at the nearest root, the warrior's Bull Rush,
  the mage's Veilstep: out before the blow, unhurt, with when he loosed and when the root was struck), the ranger's
  again with the cage shutting at five more points of his shot (out in time in most), a root struck from 3 m
  outside it (a partner's way: broken), and a raised shield (`--class warrior --gear shield`: hurt less than
  standing). On this PC: the mage out 0.33 s after it shut, the warrior 0.37 s (one Bull Rush), the ranger 3.08 to
  4.30 s at six points of his shot (two arrows), her blow at 4.5 s; a warrior's shield 20 of 131. A case runs till
  the cage's `life` and its sinking are past (a case left with its cage standing left the next none), and forgets
  the fight's claimed beats as it begins (`forgetBeats`: the lab's set-up turns the clock back). Its canary makes the
  roots thin (`rootR` 0.01): walking at the gap he gets out. `rootCagePictures` (by name): its roots bursting and
  closing from the side, her great root rising and falling across it from the side, its warning, its shut and her
  blow as the player sees it, and a hero breaking a root and stepping out as the player sees it.

## The Ossuary Cantor's encounter

The Crypt's wave 10: the Ossuary Cantor and its two Bell-Warden guards (`page/bossEncounter.ts`;
`src/entities/cantor.ts`, `src/entities/bellWarden.ts`). The Bell-Warden is the Cantor's guard alone: no part stands
one up as a boss of its own. The ladder, `stand` and `ttk` are above.

- `toll`: a Bell-Warden risen as a guard (its guard's size) left to think and toll at the hero 4 m off (he must be
  stunned for its `stun` within 0.1 s, its ring reaching him no sooner than its warning's end after the bell began its
  swing), 8 m off (the ring reaches him past `stunsTo`: never stunned), and with his shield raised towards it (a
  warrior with `--gear shield`: never stunned; the part says so where the hero has none); its ghost is held over the
  bell, so it dives at no one (its dive is `dive`'s), and the hero is turned to it and kept where he stands.
- `swing` (`page/bossSwing.ts`): a guard's bell read off its own joint through a toll at the hero: its turn about its
  crown's axis and off it (0.5 degrees at most), its swing's angular acceleration (20 rad/s² at most: a pendulum's is
  its swing times its rate squared, about 9; the old swing back and fling through, 350), and the body's turn as it
  tolls (none); pictured from its side through the toll; its canary swings it four times as far.
- `encounter`: first the run's own wave 10 set off twice (`page/bossGuardSpots.ts`): its guards must rise at the same
  two spots both times, each within 5 cm of the other's mirror through the middle, on the crypt's walks (a ray down
  meets them), 1.2 m of room past their bodies to any prop and 30 degrees off any gate. Then the Cantor and its guards
  risen at wave 10's strength, each guard at most half the Cantor's height (from play, full-size bells were "almost
  like main boss"), and left to fight the hero (kept whole) for 28 s: no stun from a guard's toll further than its
  `BELL_WARDEN.toll.stunsTo` (the hero's body and 0.5 m over), no frame seized by a guard's ghost, a guard at 15% of
  its life still in its first phase, neither guard moved over 1 mm from where it rose nor turned, each raising the dead
  round it (its first group by `raise.first`, the next `raise.every` apart, half a second's slack; none near it after
  it falls; never more foes up than the wave's `maxAlive`: the lab keeps what the fight raises, `Lab.keepRisen`), each
  hovering, its bell's lip over the floor at every frame, and its one ghost about it (the bell's joint, the ghosts'
  `seen`); the Cantor warded every frame (2 frames' slack) and taking the ward's `taken` of the damage. Then the
  guards killed and 24 s more: never warded, at least one cast landed, its heart bared after one (`weak`); every one of
  the Cantor's hits landed 0.9 to 3 s after a ring of its own; the guards tolled, and no two bosses' warned hits (tolls,
  grave hands, dirges) landed closer than `CANTOR.beat`, two frames' slack. Its canary wards nothing and sends guards at
  a whole bell's size that walk, rising at the gates and raising the dead every 3 s, their tolls stunning as far as a
  whole bell's would.
- `bars`, `dive`, `choir`, `graves` (`page/bossChoir.ts`): wave 10's boss bar naming the Cantor, warded by the guards
  standing, and each guard's own bar; a guard's ghost diving at a hero near its bell, not one who steps aside or stands
  off; the choir's ring hurting outside alone, after its warning, never inside; its stones at their most, never in a
  hero, never walling a spot in, stopping arrows, sinking as it falls.
- `compiles`: a guard's toll, the Cantor's grave hands, a dirge, a ring, its ward and its heart bared, its choir's ring
  and a gravestone, drawn: no pipeline made (`PIPELINES.made`); its canary draws a material of a blending, side and
  depth none else has together.
- `ttk` (`encounterTtk`): the encounter at 10 from the hero's damage a second: its two guards one after the other
  (each `asGuard.life` of a Bell-Warden's), then the Cantor with its heart bared `bared` s of every `every` (its weak
  window's `taken`).
- For the eye, asked for alone: `encounterPictures` (the encounter at each of its moments), `cantorLook` (the Cantor
  alone from its front, back and sides and its skull close, its triangles held to 45k: `page/bossCantor.ts`), `film`
  (a guard's toll as the game draws it from low at its side, `page/bossFilm.ts`, and the guards as wave 10 sends them,
  `page/bossGuardFilm.ts`), `choirPictures`; and `frames`, the frame's time through each of the Crypt's boss waves in
  turns (`page/bossFrames.ts`). Pictures in `tools/lab/out/boss`.
