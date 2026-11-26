# `tavern`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`tavern`: the tavern's keeper, his mugs and his ale (`page/tavern.ts`, `page/keeperWatch.ts`, `page/keeperGait.ts`,
`page/keeperShirt.ts`, `page/keeperBoost.ts`, `page/takeAle.ts`, `page/tavernEyes.ts`; `src/world/tavernKeeper.ts`,
`src/game/mugs.ts`, `src/game/aleBoost.ts`, `src/entities/models/keeper.ts`,
`src/entities/models/flask.ts`, `src/combat/skills/ale.ts`), any `--class`.

Use `--parts eyes,seated,touch,cost,boost` to run a subset without the full tavern sequence:

- `eyes` runs the first-person serving and drink. It must reach each recorded beat, starting at 10% before the
  choice is answered. Its canary hides the mug at 10%, and the later beats must still pass.
- `seated` drinks on a bar stool in all three views, verifies the reached swallows and keeps the hero seated
  through the drink. The mug reaches the lips in the two external views and stays visible at each swallow
  through the eyes. Its canary rests the drinking hand on the thigh. Run both `eyes,seated` for each class.
- `touch` taps a served mug on the canvas, taps Put down and takes the same full mug again, then taps Drink and
  verifies the same mug returns dirty. Both rendered buttons must fit and be hittable, and the pending boost's
  notice must fit. Its canary disables pickup for the first tap and then re-enables it for the full sequence.
- `cost` samples draws and triangles from inside the tavern with the keeper in frame, subtracting the frames
  with the mugs and then the keeper hidden. A sample must draw both the keeper and mugs.
- `boost` drinks two ales and checks the lobby notice. Entering and clearing a training wave keeps the boost
  waiting. Entering a normal run applies it once, and using Continue shows one fewer HUD wave per real clear
  until it expires. The fixture empties the wave's queue before enemies spawn and lets the production run update
  clear it. Further runs cover early Bank and death with waves remaining, via the summary's Return button.
  Its canary stacks the two ales and verifies the wrong max health arrives through the normal portal.

For a landscape phone viewport, run `npm run lab -- tavern --parts touch --screen 844x390@3`.
The other layout sizes are `1024x700@1`, `1920x1080@1`, `1180x820@2`, and `820x1180@2`.

**His day.** Into the Ember & Oak by its door, the hero by the door while the keeper's tasks are set and run to their
work in turn (the bar wiped in passes along its length, sweeping, the fire stoked, the small table wiped), each
pictured, his hands against their goals (`handsOff`: a held thing's own place against its goal). Then the hero at the
bar: he must come to the tap.

**The ale.** E: the talk card must open within the window, its first reply a free beer. Picked (1): the card closes
and he takes a clean mug off the back counter (it must be empty as he takes it), fills it and slides it across; within
his serving's time the mug must wait on the bar, 2 s on still not drunk; taken up by E with the pointer on it
(`takeAle.ts`, stepped through the watch), the choice must show and hold the drink at 16%; put down (F), the mug must be
back on the bar full and clean; taken up again and drunk (E), the drink goes on from there. The drink must last its 5 s (whatever his casting speed),
with W held over its first 40 frames he must move under 2 cm, the mug must be in his hand in the flask's place from 12%
to 92% of it, the rim's nearest point within 1.5 cm of his lower lip (the head's `mouth` point, 6 mm under it) at each
swallow's middle, the mug tipped no more than 70 degrees from upright in the world from 20% to 75% of it and further
at each swallow than the last, the mug on the bar gone once his hand has it; after it he must walk.

**His mugs** (the ledger every mug is in: the back counter's slots, his hand, the bar, a table, a hero's hand, the
tub): at the drink's end the hero sets the mug down on the bar, and the keeper must collect it (a mug at the bar's far
side drawn in across its top first), wash, dry and shelve it, in that order. Two fixtures: every mug left dirty on the
bar and one asked for, he must wash one first and serve it; every mug out in heroes' hands, he serves none until one
comes back (and he must never take one up from a hero's hand: a job whose mug has gone is given up). The last waits
for six dirty mugs washed one after another (about 15 s each).

**Through the eyes** (`tavernEyes.ts`; from Victor's review, "no mug in 1st person"): every mug not in his hand stood
back on the shelf, the hero at the bar, the view brought through the eyes and held on the keeper before every frame
(the lab's own aiming turned it away). The talk card by E within the window; the beer's mug in the world's view at some
frame of its slide; at 10, 25, 45, 60, 75 and 85% of the drink the mug in the hero's hand shown (it and every parent),
on a layer the camera the hands are seen through draws (`armsCamera`), inside that camera's view (its screen place
said) and its nearest point past the near plane; once drunk, the mug set down on the bar. Each beat pictured as the
player sees it. Before the fix the warrior's and the mage's drink was left out through the eyes (no mug at all), and
the ranger's mug was held at his mouth, inside the camera.

**Every frame** (watched; `forget` after the lab's own stands, presses and fixtures, and when he's been put somewhere
at once, `placings`):

- the mugs must add up to `MUG_COUNT`; none may move more than 12 cm in a frame (a slide is about 3 m/s) or go from
  sight but into a hero's hand; every mug must be held, standing on the bar, the back counter or a table, or in the
  tub, never in the air (`MugsHeld`);
- a planted foot may not slip more than 1.5 cm, read at the sole as `feet` reads the heroes' (`slipOf`: the least any
  point on the floor moved, so rolling or turning on the ball isn't a slip);
- his body may not move more than 3 cm in a 60th of a second (scaled by the frame's own time: now and then the game
  is stepped two frames' time in one);
- his hands, in his chest's frame (`HandsSmooth`): no hand moving more than 5 cm in a frame (3 m/s, a quick hand's),
  its move changing by no more than 4.5 cm from the frame before (a snap), no elbow bending more than 15 degrees in a
  frame; the frames before and after the worst jump said with it. Before the keeper's hands followed their goals on a
  spring, they read 87 cm, 118 cm and 115 degrees ("Hand glitching when wiping table");
- his trunk, head and elbows (balls round their joints) no more than 2 cm into the bar, the back counter or a table,
  walking or leaning (`BodyClear`; from Victor's review, "him walking inside the counter sometimes").

The engine's pipeline counter starts before the room opens. Frames drawn during the check must request no new
pipelines.

**Pictures**: the tasks, the talk card, each step of a mug's round once (taken, filled, slid, collected, washed, dried,
shelved: from the keeper's sides along the aisle behind the bar, the hero hidden), frame strips of the table wiped,
a mug taken, a mug washed and a stretch of his walk (four frames each), the drink at its beats from his side and
before him, the set-down, and the first person's. The sheet comes in pages (`sheet.png`, `sheet-2.png`...).

`--canary` makes the ale a cast he may walk through, which must be caught. In co-op, `coop --scenarios tavern`
(`commands/coop.md`).

`coop --scenarios tavern-recovery` checks the guest who joins with a mug already held and the holder who disconnects.

**Round 3's additions.** Sat on the bar stool nearest the tap (as `lab sit` lets him sit idle), ale asked from it, its
mug taken up and drunk: he must stay sat from the ask to the drink's end. The ale's boost read after the drinks
(`keeperBoost.ts`): waiting, x1 in the village, x1.05 as a run begins and through 4 waves, x1 after the 5th, x1.05 again
after a fresh ale once that run is over. His shirt's stripes across its seams (the chest's over the belly's, the
collar's over the chest's) read every 20 frames all day by rays either side (`keeperShirt.ts`): at most a tenth of a
repeat apart. His walk (`keeperGait.ts`) and his arms and tools against his body (`keeperWatch.ts`'s `LimbsClear`).
`--canary` adds the belly's piece of his shirt shifted a third round and a second ale stacked on the first; each of
its seven plants must be caught.

**Round 4's follow-ups.** Sat on the bar stool, his ale is drunk three times: from above (the screen as the player sees
it at two-thirds of the drink, `sat-at-the-bar`, and close from either side), over the shoulder and through the eyes;
in the first two the rim must be within 1.5 cm of his lower lip at each swallow, as stood. Every hero's sat pose laid
his drinking hand on his thigh over the drink's (`restHands` in `models/sit.ts`, its `free`), and he drank from a mug
in his lap: 85 cm from his lips, which nothing read. `--canary` plants that again (`SIT_FREE.drink`). The eyes' case
aims at his serving spot, not where he stands as it begins (off clearing a mug, the view was 35 degrees off the bar).
The mug put back on the bar as the hero leaves the tavern is forgotten by the watch, as a fixture's move is.
`--looks` adds his bent elbow as he wipes the small table and the tub as he washes, each as the player sees it from
above and over the shoulder, and the tub close, him and the hero hidden. Still flaky: his feet at a walk's end
(crossed by up to 10 cm, ankles under 10 cm apart, a different walk each run).

**Round 5** (`page/keeperRound5.ts`, `page/tubSeen.ts`). Every frame: sweeping, his hands at least 33 cm apart along
the handle at the median and never under 20, the handle at least 20 degrees from upright and across him (his top hand
and its head 15 cm apart across him), past the hands' blend between holds (0.7 s); carried, the handle within 25
degrees of upright, his other hand 10 cm off it, never the sweep's hold before his first stroke (the old way); his
rag spread on a top only with his grip down on it (within 8 cm across and 6 cm over its middle) and never in his fist
at the same time; wiping the cask, his free hand never over his hips; waiting at the bar, his rag spread under his
palm at least 60% of the frames. His body against the tables as their tops are drawn (`world/tavernTables.ts`: a round
top a drum, the long one a box), his thighs against each top's slab: the tables were squares of their `reach` round
their middles, and he stood in the long table from the hips down unread. Then fixtures: the tub's water from above,
at least 1.6 times as bright as the wood round it and its suds 5% of it; a mug left at the sides of every table,
collected with his middle at least 15 cm past the top's edge all the while; a hero putting his mug down (F) by every
table's sides and the bar, on the nearest top, its edge on his side, a hand's width in; E with a mug in hand and the
pointer on a bar stool (he sits, nothing drunk), and sat with the pointer off the seats (he drinks), never two E
prompts in a frame (from above alone: over the shoulder and through the eyes the crosshair is, which the lab doesn't
turn); his day with a hero stood in each of his narrow ways (the bar's end both sides, between the tables, by the door,
on each bar stool's spot) and his tasks broken into at seeded random frames, the longest he got no nearer along his way
on a walk under 3 s, and never put back at his stand. `--canary` adds a plant for each, set for its own part alone:
the old sweep, the old carry, the rag spread before his hand was down, his free hand on the cask, his rag bunched at
the bar, a mug collected from inside the table, the mug put back on the counter, E both sat him and drank, the tub's
water dark, and a wall across his way in behind the bar, which must read as stuck and put him back at his stand once
(his watch's last resort: `KEEPER_STUCK`). `--looks --round5` pictures round 5's moments alone as the player sees them
(from above, over the shoulder, and close in the room's light); with `--canary` too, as they were before it.
