# `range`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`range`: every joint of the hero against a body's ranges (`models/anatomy.ts`, as the dev builds' `watchBody`
measures them), frame by frame, over standing, walking each way, attacking standing, and walks that change
direction while he attacks (held or tapped) or runs (`--scenarios stand,walk,shoot,reverse,taps,run`), and with
`--skill` a skill cast standing and its end held (`cast`: its key held as long as the player would, `holdFor`, a
channel through; pressed for a frame, Steel Tempest stopped at once), the weapons held `--gear`'s way throughout
(`--weapon` the base): each angle past its range, on how many frames, its worst and where (for a leg, whether its
foot was planted; for a shoulder, its raise, the plane it rises in and its turn against what each allows), each
scenario's pose timed frame by frame by the browser's clock (`page/poseCost.ts`: its slowest frame, median and
p90; two frames over 20 ms fail, or one over 30 (one frame alone read 21 to 23 by the noise of a check's eight
sessions), canary one frame's made 40 ms slower: the lab's frames run on its own clock, and a
blow onto a pillar or a log that read the prop's every triangle for each point its stop tried took 571 ms a frame
unseen), its fastest ankle, its weapon tip's fastest move a frame between moves and through them, each with how far
the hand moved then and the joint whose own turn changed most (`page/tipMoves.ts`, in the hero's own frame: between
moves, where a pose eases back to the stance, a jump shows; Thunder Crescent's end was back at rest in a frame,
131 cm, and a two-handed swing's end turned the hand over, `handR turned 178°`), a two-hander's lower grip let go
of by the other hand (on how many frames, how often, from which frames and moments of a move, and why at the worst:
the grip past the arm's reach, its joints past their ranges, the arm into the body; a failure. Its frames on the
shoulder or the flask in hand are counted apart, `LowerGrip.free`), and its worst moment pictured, and the weapon
under the floor (`page/weaponFloor.ts`: every corner of the surface of what the main hand holds, on how many frames,
the deepest and how far along the weapon; Thunder Crescent put an axe's or a maul's head into the floor to its
middle; a prop's top counts as floor, and the arena's wall as drawn: how far into it, the less of under its top and
past its face, read by rays of the lab's own through `Wall.cast`, so a commit with no `wallTopAt` reads a blow into
the wall too; `--biome` and `--at`/`--facing` stand him by it: two-handed Power Strike went 2.6 m into the crypt's
wall, `--biome crypt --at 24.9,14.4 --facing 1.047`, and now holds on it; in a cast, the weapon's nearest the floor and its blade off the blow's line, the flat's normal against
his side's axis, so a blade lying flat or turned across the blow fails, its canary the grip turned a quarter:
"axe needs to strike with blade perpendicular to ground"; a prop's top counts as floor, `propTopAt`, so a blow
into a pillar or a stone is read where it stops on it; `--frames` lists each frame's weapon in the body or under
the floor), and an arm held at its stops (`page/armStrain.ts`:
two or more of one arm's joints within 2° of an end of
their ranges on the same frame, a gripping wrist by a gripping wrist's: the arm IK stops the forearm's turn and the
wrist at their ends, so a pose asking more of an arm than it gives is held there, within every range; two-handed
Power Strike's end held the forearm at 89.9° of its 90 and the wrist at 30° of its 30, and looked "broken". On how
many frames, the first with the most stops pictured, and each stop's frames tallied: said, not failed, until every
hero's are fixed, #307), and the weapon through the body (`page/weaponBody.ts`: every corner of the same surface
against the thighs and shins, capsules round their bones at their drawn radii, and the belly and chest, the
anatomy's solids; on how many frames, the deepest, in which part and how far along the weapon, pictured: said, not
failed, as main has it too. Thunder Crescent's end and Rending Cleave put the haft's butt 10 cm into a thigh, "axe
shaft going through leg"). The arms against the body: each forearm and hand against the trunk and head
(`page/armsIn.ts`, as `eyes` reads them) and against the thighs and shins (`page/armsInLegs.ts`, capsules at their
drawn radii), the deepest pictured, said, not failed (from play: "power strike ending pose makes hand go through
body, its a regression, pls figure out how it went past our guards": range read the joints' angles and the weapon
alone, on level ground, and two-handed Power Strike's end put a fist 9 cm into the left thigh and the right forearm
16 cm into the belly in the hall of heroes, on a plinth; `--at 0,4.3`, 0.9 m back from the dais's step, shows it, 23
frames); their canaries plant the right elbow in the chest and a hand in the left thigh. In a cast, the weapon's tip
is traced frame by frame (`page/weaponPath.ts`) and drawn as a line in the pictures (red where it moves fast, a mark
every third frame; from the front, the left and above, framed on the path): a heavy weapon swung hard keeps its line
("axe should go down in 1 line, without changing direction/turning", "just draw a line of the same point of the
axe"), so its fast frames on the way down (from its highest: the raise crosses the body from a guard held across it)
should run straight from above, and the line says how far they stray off it (two-handed Power Strike: 39 to 49 cm
with its shoulder turned across him as it's raised, 11 to 12 raised across instead); its canary moves one fast point
30 cm aside. The cast scenario runs 4.5 s from the press, through the stand after the end until a two-hander goes
onto his shoulder (at 2.5 s a 1.5 s cast's stand went unread).
`--at x,z` and `--facing` stand every scenario elsewhere (`--at 0,4.7`: the dais's edge facing off it, the ground ahead a step lower than under
his feet, as off a plinth in the hall of heroes, where the left hand let go of a two-hander after Power Strike).
`--foe <kind>` stands a foe `--ahead` m before him (1.8 by default) for the cast scenario (`page/weaponOnFoe.ts`):
the weapon's lowest over its body, a share of its height ("power strike should
land on the enemy its striking"), its canary moving the foe 3 m aside for a reading, which must find nothing.
`--canary` turns the head past the neck's range on one frame and sinks the hero below the floor by the weapon's
height over it and 2 m for one measure (the weapon must be found under the floor: sunk 2 m alone, a weapon raised in
a cast's charge stayed over it, and the canary was missed on main too), moves the weapon's grip to the left
thigh's middle for one
(it must be found in it), and reads an arm whose forearm and wrist are at their ends (it must read pinned),
`--frames` lists every frame with a joint past its range, every frame an arm was pinned, every frame the weapon was
under the floor or in the body and every frame between moves the tip moved 10 cm or more (with every joint that
turned: an elbow swung round its arm turns the shoulder alone), and `--trace` (`--span a,b` for some frames) the leg IK frame by
frame as the gait's trace does (`page/legTrace.ts`: each foot down, in the air or in a timed step `~`, dragged `d`),
each frame's joints past their ranges after it. `--tune` sets the game's tunable values first (a pose's numbers
compared without editing them, `--sweep` for many).
