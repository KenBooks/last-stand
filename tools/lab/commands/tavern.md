# `tavern`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`tavern`: the tavern's keeper, his mugs and his ale (`page/tavern.ts`, `page/keeperWatch.ts`, `page/tavernEyes.ts`;
`src/world/tavern.ts`, `src/game/mugs.ts`, `src/entities/models/keeper.ts`, `src/entities/models/walker.ts`,
`src/entities/models/flask.ts`, `src/combat/skills/ale.ts`), any `--class`.

**His day.** Into the Ember & Oak by its door, the hero by the door while the keeper's tasks are set and run to their
work in turn (the bar wiped in passes along its length, sweeping, the fire stoked, the small table wiped), each
pictured, his hands against their goals (`handsOff`: a held thing's own place against its goal). Then the hero at the
bar: he must come to the tap.

**The ale.** E: the talk card must open within the window, its first reply a free beer. Picked (1): the card closes
and he takes a clean mug off the back counter (it must be empty as he takes it), fills it and slides it across; within
his serving's time and a second the hero must be drinking. The drink must last its 5 s (whatever his casting speed),
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

No program may compile from the room's coming in to the end.

**Pictures**: the tasks, the talk card, each step of a mug's round once (taken, filled, slid, collected, washed, dried,
shelved: from the keeper's sides along the aisle behind the bar, the hero hidden), frame strips of the table wiped,
a mug taken, a mug washed and a stretch of his walk (four frames each), the drink at its beats from his side and
before him, the set-down, and the first person's. The sheet comes in pages (`sheet.png`, `sheet-2.png`...).

`--canary` makes the ale a cast he may walk through, which must be caught. In co-op, `coop --scenarios tavern`
(`commands/coop.md`).
