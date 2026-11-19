# `boss`

The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `boss`: the bosses' fights (`page/boss.ts`; `src/entities/bossKit.ts`, `src/entities/bellWarden.ts`), in parts
  (`--parts`, all by default). `ladder`: in each battleground, boss waves 5, 10, 15 and 20 set off from their
  countdown as the run sets one off (its wave and timer), the boss the run holds for it (`RunState.boss`) against its
  ladder's rung (`data/biomes.ts` `bosses`, round again past its end: the Crypt's Colossus, Bell-Warden, Colossus,
  Bell-Warden; the Thornwood's Thornheart, Rootmother and Stag of Ash), the banner's line and the Continue button's name. `phases`: a Bell-Warden
  held still, its life taken to a hundredth over and under each phase's share: in the phase before, then the next,
  and the next's banner shown. `toll`: a Bell-Warden left to think and toll at the hero 7 m off (he must be stunned,
  for its `stun` within 0.1 s, its ring reaching him no sooner than its warning's end after the bell began its swing),
  19 m off (past where its ring fades, `stunsTo`: never stunned), and with his shield raised towards it (a warrior
  with `--gear shield`: never stunned; the part says so where the hero has none); the hero is turned to it and kept
  where he stands, the set-up keeping him whole. `chains`: each chain struck from its own side (5 m off, a share of
  its life and a little more): each must break, all four drop the bell for its window (`down` s within 0.1, `taken`
  times the damage), it mustn't toll while down, and the chains are whole after. `swing` (`page/bossSwing.ts`): the
  bell read off its own joint through a toll at the hero and a walk after a hero circling it 8 m out: its turn about
  the yoke's axis and off it (0.5 degrees at most), its swing's angular acceleration (20 rad/s² at most: a pendulum's
  is its swing times its rate squared, about 9; the old swing back and fling through, 350), the body's turn as it
  tolls (none) and as it walks (its `EnemyDef.turn`, 0.8 rad/s; at a small foe's quick turn, 1.6, the whole bell
  spun on the spot); pictured from its side through the toll and from above walking; its canary swings it four times
  as far and lets it turn at 20 rad/s. `stand`: the hero walks into a Bell-Warden held still for 3 s: it may give way 2 cm at most (none, its rounding aside), and he must reach its body and be held off it (from play, a boss was walked across the arena by a hero pressing into it). `grab`: the hero stood 3.7 m from a held Bell-Warden's middle, at its ghosts' ring, for up to 30 s: he must be seized, lifted near its `rise`, carried within 0.6 m of its `away`, hurt as he lands, and not seized again within his grace; stood 9 m off for 10 s, never seized. `compiles`: its tolls, a shard, the
  chains broken and the bell dropped, drawn: no program compiled. `ttk`: the hero's basic attack (LMB) held 8 s on a
  Colossus held still 3.6 m off, its damage a second, and from it the time the Colossus takes at wave 5 and the
  Bell-Warden at 10 (its life by `SCALING`), with its weak windows counted as opening each time its chains' share of
  its life is dealt (a best case: a hero who never circles it breaks one chain, not four). With the lab's starting
  gear, the same gear for both, so it reads the step up between them, not the fight a geared hero meets. `--canary`
  plants a fault each part must catch (the ladders turned round, the second phase's share moved, a toll that
  stuns no one, a shield that stops nothing, chains that take no harm, a boss that yields as a small foe does, ghosts that seize no one, a program compiled, an attack that deals
  nothing). Run it for each hero: `--class mage`, `--class ranger`, `--class warrior --gear shield`.
  The Rootmother's parts (`page/bossRootmother.ts`; `src/entities/rootmother.ts`), the hero 14 m from the
  Thornwood's middle where nothing stands between him and her (on the diagonal a stump took the arrows): `rootPhases`:
  her life a hundredth over and under her second phase's share, its banner, the canopy closed 4 s into it (`shade`
  over 0.95) and open 4 s after her death. `vines`: one vine sent at him standing still must hold him its `hold`
  within 4 frames, and she must drag herself towards him meanwhile (at least 0.6 of what her speed covers in
  the hold) and stand still once he's free (0.15 m, her slowing); with a bow (`--class ranger`) a shot at the floor 2.5 m back along it towards her must cut it and
  let him go within 15 frames of the loose. `pods`: her pods flung (as many as she flings, each `near` to `far` from
  her), one left alone bursting into its brood `hatch` s after it rose (within 0.15 s), one struck by his basic
  attack held on it popped within 3 s, nothing hatching from it. `heart`: her heart brought to open (1 s in, as its own
  45 s are too long to wait): open its `open` s (within 0.1), its banner, nothing attacked through it, `pods` pods
  flung; the spot read at points on her (in her heart its `taken`, her flank and back 1, shut 1); with a bow, in a
  second opening with her pods held back (flung between him and her, they took the arrows), two shots at her flank
  and the rest in her heart, his crits held off: those in it `taken` times the others within 0.2; and in her second
  phase an eruption at him hurting him no sooner than its warning and opening nothing. `compiles` draws her fight's every effect too, and `ttk` adds the
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
  as he lands from each toss: its longest stretch neither acting, walking nor turning at most 0.6 s, and at least two tosses and two
  sweeps; Kenneth played it standing before him doing nothing); `compiles` draws its every effect and `ttk` adds it at wave 15,
  struck throughout and with every charge crashed. Its canary's faults: a fire that reaches no one, a crash that stuns nothing, its second
  phase's share moved, a toss that carries him nowhere, a stand of 2.5 to 3 s between its attacks up close. `stagPictures` (alone)
  pictures it and each stage of its fight, its triangles held to 45,000; `stagMoves` (alone) its gallop through a stride from its side
  (galloping in place where its sides are clear: along its lane a tree or a stone came between it and the eye) and in the game's view,
  and its toss step by step (its head down scraping the earth, the hero on its tines, thrown, in the air, landed).
  `rootPictures` (asked for alone) pictures her fight's moments, and `rootLook` (alone too) her model: from
  above and over the shoulder as the player meets her, then close (whole from four sides, her face, body, roots,
  her heart shut and open), and her triangles against the Thornheart's and the Bell-Warden's, at most 45,000. Her canary's faults: her second phase's
  share moved, a vine that reaches no one, pods that never hatch, a heart that never opens (its window of none). About 15 s a hero.
