# `lab odo`

From [`COMMANDS.md`](../COMMANDS.md): Odo's day in his shop, in full.

Odo's day in his shop as a player meets it (`page/odo.ts`; `src/entities/models/odoLife.ts`, posed by
`merchant.ts`, his shop `src/world/houses/merchant.ts`, its goods `merchantWares.ts`). The hero walks in with Odo dusting: the duster must be set down, his
desk reached within 9 s, the hero greeted and his head within 25 degrees of him. With the hero by the door he must
be back at work within 16 s; each task is then taken up (`OdoLife.force`) and pictured at its heart within 40 s (a
jar lifted and the second set on the shelf, the shelves dusted, the dagger turned in his hands, the coin at his eye,
the ledger written in), and a glance at the hero within 30 s at his ledger. Every frame he's posed, a foot standing
on the floor must move under 4 mm and each ankle stand within 1 cm of where his day puts it; no program may be
compiled in the shop; his update must cost under 0.5 ms a frame at its 90th percentile by the browser's clock (the
figure in the glance's notes, so the report's lines are the same every run). Pictures are taken round him by
turning the hero, whose facing the views follow: from his front three-quarters and side at the counter, over each
shoulder at the shelves, from the room and along behind the counter (his legs, which the counter hides) as he
walks; the room's walls aren't cut away for them, so a camera past a wall pictures the wall. `--canary` drags his
standing feet along under him, which the slip must catch. Close-ups of what was asked after play: his walk in four
frames a fifth of a second apart along behind the counter (his breeches, boots and steps), waiting at his desk, the
room round him, his bent elbow, and each thing he handles in his hand (the jar, the duster, the dagger, the coin,
framed on the coin itself, and the pen); the coin read at its size within 4.5 cm of his fingertips' last joints
(stuck to his palm it was 4 cm from any). Every frame he's posed, his arm (the upper arm's middle, the elbow, the
forearm's middle, the wrist) must go no more than 1.2 cm into the counter, his arms no more than 2 cm into his
trunk (`anatomy.ts` `overlaps`, the worst moment pictured as `odo-into-body` when it fails, with where he stood, what
he held and where each hand was wanted), and the quill's shaft and the dagger's blade no more than 4 mm into his
hands' capsules (`handCapsules`). Close-ups from above (the lab's `above` view, its turn taken off the hero's
facing) of the pen and the dagger, his shoulder from behind, and the scale and the gems. About 3 minutes booted
alone.

The frame as the player sees it is reported (its draws and triangles: the screen's render's, shadows' passes among them), so a change to the shop's goods says what it costs, and before and after pictures of the room from its door, the showpieces (`odo-showpiece-sword`, `odo-showpiece-circlet`) and the display table are made with `--ab`. `lab merchant` waits for Odo to reach his desk before picturing him at the trade.
