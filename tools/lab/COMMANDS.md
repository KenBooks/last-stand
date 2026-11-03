# `tools/lab`'s commands

Every command of the lab in full: what it measures and what it was measured against, its options, the looks a picture
takes and the options every command takes. [`AGENTS.md`](AGENTS.md) has the lab's rules, each command in a line
(Commands at a glance), how to write a measure, how the lab works and what keeps it repeatable.

- `sheet`: the hero in the states the player sees (`--states stand,walk,full,cast`), pictured from the game's views
  and close up (`--views lobby,top,third,front,left,right,back,above`; `eyes` with `--view first`, the whole frame
  at the row's height; `--focus <joint>`
  frames the close-ups on a joint), with each arm's load and posture beside them. `cast` casts `--skill` (its key, its
  behaviour or its name; bound to its own key if the hero knows it but hasn't it on one) ahead of him and pictures
  it at shares of its cast (`--shares`, 0.3,0.55,0.8 by default; a channel at shares of its key's hold, `holdFor`),
  with where its cast point (the weapon's tip) is: how high over the floor, how far ahead, and the way the weapon
  points (up, from ahead, and in the chest's frame, as a two-hander's holds are placed). While the healing draught's
  flask is out (`--skill potion`), how far its mouth is from the lips and how far its bulb is tipped, and where a miss
  comes from: the wrist off where the drink put it, or the fist closed off where it planned the grip (`page/drink.ts`:
  at the sip the fist swung 13 cm off the lips while the wrist landed true; the reference is the owner's Codex photos
  of a man drinking from a flask held by its neck, `.tmp/references/drink`). `--gear` holds the weapons a
  style's way (`--weapon` the base). `--look` draws the pictures another way (below: the hero's wireframe, his
  faces' orientation, his parts with where each is, his skeleton). Writes `out/sheets/<--tag>/sheet.png` and
  `notes.txt`.
- `feet`: the hero's feet against the ground round the dais's edges and on level ground (`--scenarios edge,level,
  strafe,cross`): standing at full draw by the edges (a foot moving in the hold, a sole in a step's riser, a dip under
  its own level), and walking across them, strafing up and down the steps with a shot drawn and on level ground (per
  stance: the frames out of the leg's reach, a planted foot's pitch turning back and forth, its slide, the slip of
  the sole's point on the ground that moved least, added up frame by frame (a foot rolling or turning on its ball
  keeps one point still); a sole in the ground, the fastest ankle, breaks in the left, right rhythm, frames with both
  feet up). `--canary` plants a slid and a sunk ankle, `--frames` lists what was flagged (the stances, each foot's
  runs of frames with its sole in the ground, and where the rhythm broke), `--trace` prints each frame of each walk
  with the leg IK's own state (the pelvis's drop and turn; each foot's state, window, spot, ankle, heading, tip, depth
  in the ground, clearance, landing and its shift off a riser; each walk's feet measured as the IK has them); the worst stance of each walk is pictured whole, as the player sees it and from the
  front and the side (`out/feet/sheet.png`). A walk follows on from the ones before it (the hero, the gait and the
  game's clock carry over), so compare runs of the same `--scenarios`.
- `gait`: the hero's walk judged as a person's: in full in [`commands/gait.md`](commands/gait.md).
- `form`: the hero's run judged against a runner's (`page/runner.ts`: the cadence and each foot's time on the ground
  by speed after Dorn, Schache and Pandy (2012), the hips', knees' and ankles' curves over the stride after Novacheck
  (1998) and Fukuchi (2017), the arms' after Hinrichs (1987), and the trunk's lean and the hips' rise and fall), with
  each way he holds his weapons (`--gear oneHanded,shield,twoHanded,dual`: the class's own by default). He runs
  straight across open ground at full speed, judged at a man's size (his speed and lengths scaled by his legs against
  a man's, `MAN_LEG`); each leg's frames are folded onto its own cycle from its foot's touchdown to the next, the
  stance and the swing each stretched onto the runner's so the curves line up at the touchdown and the push off. Says
  the steps a second and their length, a foot's time down and in the air, the hips' rise and fall, each joint at the
  touchdown, mid-stance, the push off and the swing's most against the runner's (and how far off on average and at
  its worst), the trunk's lean and the head's tip, the pelvis's and chest's turn, each arm's swing in the chest's
  frame and its elbow's bend, and what is unlike a runner. Each way is pictured at eight points of the stride
  (`out/form/<way>.png`, one sheet a way: all four in one took the browser down): stick figures of his run (the left
  limbs blue, the right orange) over a runner's on his lengths (grey, the hips rising and falling as a body flies),
  the hero from both sides, the game's own views and his arms close up, measured first and run again to picture the
  frames chosen. `--frames` lists each leg's cycles (touchdown, push off, the next touchdown) and the curves bin by
  bin; `--canary` holds the left knee straight through its stances, which the knee's curve must show.
- `coop`: two games playing together: in full in [`commands/coop.md`](commands/coop.md).
- `stops`: the hero coming to a stop from a run, judged as a person stops (a step or two as the body slows, the last
  foot landing under it or beside the other on the ground it stands on, and once still nothing moving), over runs let
  go at different points of a stride: on level ground each way, strafing drawn, and out over the dais's edge, in onto
  it, on a slant, along it astride its step and stopping to shoot along it
  (`--scenarios level,drawn,edgeOut,edgeIn,edgeSlant,edgeAlong,edgeShot`). From the frame the keys are let go: the
  steps once the body was still, a foot put out ahead and drawn back (a waste of motion), a step back against the way
  it went, a foot on another level than the body's once still and whether it ended so, a foot stepped from one level
  onto another once still (put down a step below and stepped up a second later), both feet up once one had landed
  for more than 6 frames running (up to 6, the run's own flight going on as the braking foot comes down, as a
  runner's does, are listed apart), how long the feet took to settle and their travel once still. `--frames` lists each stop: where it was let go and
  rested along the way, and each step with where it left and landed from there and on which level; `--trace` adds
  each frame (the body, the hips, each ankle and where each foot in the air is aimed, the lean); `--only 'd 23'` runs
  the stops whose names contain that. Within one run each stop starts at its own moment of the clock, so a stop run
  alone can differ from the same one in the whole run: compare the totals. (The gait's steps back counted only steps
  that left once the body stood, and missed every stop's: the step back began as the body slowed.)
- `range`: every joint of the hero against a body's ranges (`models/anatomy.ts`, as the dev builds' `watchBody`
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
- `eyes <skill>`: a skill cast through the eyes: in full in [`commands/eyes.md`](commands/eyes.md).
- `swing <name>`: a swing through the eyes keyed from a pose: in full in [`commands/swing.md`](commands/swing.md).
- `match <picture>`: the hero through the eyes matched to a reference (`node/match.mjs`; another game's, the one the
  owner names), not by eye: handed over as matching three Vermintide 2 screenshots from a one-line summary of them, a
  rest leaned in where they lean out, was twice as wide and had its head out of the frame. He stands at rest, or is
  caught at a moment of a strike: `--skill` cast ahead, at `--share` of its cast (0.5 by default; `page/sheet.ts`'s
  cast state). The reference is a screenshot, or a frame of a clip of the other game's swings (`.mp4`, `.webm`, `.mkv`,
  `.mov`; `--frame <s>`, cut by ffmpeg into `out/match/frames` once, `node/clipFrames.mjs`). He's put on a screen of
  the reference's shape (`--gear`, `--weapon`, `--wear` and `--tune` set him up; it takes no `--screen`), and
  `out/match/<picture>/match.png` shows the reference, his frame and the two blended, with the reference's marks (red)
  and his (blue) on each. The marks are written once beside the picture, `<picture>.marks.json` (a clip's frame's:
  `<clip>@<ms>.marks.json`): `crop` (px: the game's frame within a screenshot of a video), `points` (`in`, where the
  weapon comes into the frame, and `tip`, its tip or head; shares of the frame across and down), `wide` (the weapon's
  width, a share of the frame's: a bar across its line at its middle shows it), `box` (the part of the frame it covers,
  [left, top, right, bottom]) and `outline` (the weapon's and the fist's, shapes of [x, y] shares). His are the sheet's
  (`page/inFrame.ts`: read off the frame as drawn, through the camera that draws the arms; which of the weapon or the
  arm each cell of a 96 by 54 grid shows is the two drawn alone in flat colours, `page/pickGrid.ts`: a ray a cell
  against the skinned hands took 43 s a frame at a strike, and saw them skinned another way than the game draws
  them). It says each frame's numbers (the points, the lean between them, the width, the box), how far his are off the
  reference's, and how much of each outline his frame covers. Check the marks on the reference's own panel before
  trusting a comparison. `--fit a.b,c.d` searches tunable values (`--tune`'s) for the rest nearest the marks `--near`
  names (`line`, `wide`, `box`, `outline`, by default; `page/fitRest.ts`; a rest only), then pictures it with the
  `--tune` that gives it: fitted one number at a time, a rest matched every number with the blade out of the frame and
  the hand in it. `--canary` takes his points as the reference's moved 10% across, which the comparison must find so,
  and with `--fit` fits him to his own frame from values moved off it, which must find its way back.
- `carry`: the ranger's carried bow against his body through a carry's round (standing, walking, a draw and its shot,
  waiting with the next arrow, putting it back). `--canary` plants faults it must catch; `--frames` lists every frame
  with a clip, what crossed what and how deep.
- `probe <module>`: a measure of your own (Writing a measure in `AGENTS.md`). Options the lab doesn't know are passed to it (`--frames=30`), and
  `--setup=false` skips the set-up.
- `ui`: the game's UI as the player sees it, in its states: in full in [`commands/ui.md`](commands/ui.md).
- `wind`: the loading screen's exit as it hands over to the lobby's logo (`page/wind.ts`, `src/ui/logoWind.ts`).
  The loading screen is put back over the lobby (index.html's, fetched) and its exit run on the lab's clock into the
  lobby logo, the window put on the screens `--resize` names one after another as the particles fly (on
  `--screen 1536x864@1.25`, `--resize 1920x1080@1.25,1536x864@1.25` is full screen and back at 125%, the owner's; the
  lobby logo's snapshot, taken again on the browser's clock, is waited for at each change, and one that never came is
  a problem). Each column of the particles' picture round the logo is read from the exit's canvas at the last frame
  its points all rest there (`restOf`, which the exit exports: when they've all landed and before the logo takes the
  column over), laid over the lobby as it shows behind the logo (its letters hidden), and set against the logo once
  the exit is done, both at the screen's own pixels, the logo's glow hidden in each (`page/windCompare.ts`): the
  logo's pixels apart by more than 8 of 255 (more than 0.1% of them is a problem: the logo jumps as it takes over),
  the most and the mean, and the move of the particles' picture that fits the logo best, in quarter pixels, a pixel's
  blur taking the metal's grain out (`the logo 0.25 px left and 1.00 px down of them`). The lobby is pictured twice,
  which must agree. `--canary` pictures the logo a pixel lower than it is: the move must find it a pixel down. The
  particles, the logo and where they're apart are pictured (`out/wind`). On main at `1536x864@1`, the owner's complaint
  ("when it settles it doesn't directly hit the final location, so this layout shift is visible (from particle logo
  to regular)", the window resized before the exit's end, at 125%): 42% of the logo's pixels apart, the mean 21.7, the
  logo 1 px down and 0.25 px left of the particles; at 1.25x 28% and 0.5 px left; at 1920x1080 14% and in place (the
  particles' drop shadow and edges darker where several points land on one pixel, and the metal's grain drawn
  otherwise). Landing into the logo's snapshot, which the logo is then shown as, none apart on each, the most a
  channel apart 1 (rounding). Once the exit is done the window is made a tenth smaller each way, which sizes the UI
  again: the logo must show as itself then, any picture of it gone. The stalls' `--resize` checks the exit's places as
  the window changes; this, its picture.
- `light`: the frame's light as the player sees it. The hero stands in each biome (`--biomes crypt,forest`), in each
  view (`--views top,third,first`), the close views looking each way (`--facings 0,90,180,270`, degrees: the camera
  turned by mouse look, which the body follows), and the frame is drawn by the game's own camera and read back from
  the canvas. Its light is a share of the screen's white: the mean, by thirds (through the eyes the sky is the top's),
  the 50th, 90th and 99th percentiles, the brightest pixel, and the shares near white and past it. An SDR frame is
  read as an SDR screen shows it (gamma 2.2), an HDR one as the browser shows its extended sRGB. Each frame is
  pictured (`out/light/`; `--pictures=false` for the numbers alone). With `--hdr` (`--paper`, `--peak`), the same
  moment is drawn again in HDR, on any display, and checked against the SDR frame: every pixel under the knee as the
  SDR screen shows it at the paper white, nothing past the peak, and the canvas shown (the WebGPU one, read back) the
  frame drawn. `--canary` draws the first frame at twice the exposure, which must come out brighter, and in HDR at
  1.2 times the paper white, which the check under the knee must catch. With `--ab` the SDR frames agree with main,
  line for line.
- `envcost`: what the environment's lookups take of the GPU (`page/envCost.ts`), the hero standing in each biome
  and view (`--biomes`, `--views`: top and third): the frame timed on the GPU with the scene's environment and
  without it in turns (`page/gpuTurns.ts`, which `fire --cost` shares: `--rounds` of 6 renders a side), so a run's
  load falls on both. Every lit standard material looks its environment up twice a pixel; three r187 swapped the
  packed atlas's lookup (`textureCubeUV`: a face picked, up to four fetches) for a cube map's one, and `perf --ab`
  read the scene pass 1.5 ms cheaper, about as far as a commit against itself read apart. With `--ab` each commit
  is timed against itself (an exported commit whose lockfile differs is served its own packages). `--canary` draws
  the frame twice with the environment: it must read 1.6 times the frame without. The GPU's timer counts the
  time its queue took, others' work with it: on a GPU another program holds at 100% the canary failed (1.24
  times) and the readings were noise; check `nvidia-smi` first. On the owner's idle 4070 Ti the lookups cost under
  a millisecond on both 0.185 and 0.187 (0.3 to 0.9 ms against frames of 3.9 to 6.7), while one scene's whole frame
  read 3.8 to 11.8 ms from run to run: run it twice, and believe only what both runs agree on.
- `fire`: each biome's fire as the player meets it (`page/fire.ts`, `page/fireMeasure.ts`, tested in
  `test/fireMeasure.test.mjs`; `--biomes crypt,forest`). Found by its light, the warm one of the biome's ten, the hero
  stood 4.5 m before it towards the middle. For `--seconds` (2), 30 times a second, it's drawn from beside it with its
  own light, without (what draws unlit within 1.5 m of its light, and the glow particles) and without its smoke too:
  the differences are its light alone (graded: the tone curve carries the logs' grain into it) and its smoke (a pale
  smoke over the daylit forest, read as light, was counted into the tips). Read: its size, its light and hue in four
  bands from its base up, the share drawn white, the parts its top 40% breaks into (glow particles count as parts),
  its light's spread, the share above it its smoke changes, how much of it moves a moment, its light's and its point
  light's swing and strongest frequency, and the top-down view's flashes over a second at least. Then at one moment
  its flames alone (all else hidden by its materials, as the culled plants show themselves again each render; the
  adaptation held off, which exposed each picture by itself) from four sides, level from 10 m through 12°: a flame's
  light passes through it, so from behind it's its own mirror, while sheets turned to the camera show one face from
  either side (the owner: "fire rotates when camera rotates"). Its detail (light less its local mean) from behind
  under 0.6 alike its front's mirror, or more alike its front as it is, turns with the camera, unless its front is
  over 0.9 alike its own mirror, too even to tell (main's disc of coals, edge on). And the plants over it
  (`page/fireClear.ts`): the instanced meshes' points the top-down view last drew in its column (its half-width and
  0.3 m round, 2.5 m up). A fire in a bowl (a solid round its bed reaching 0.3 m under it) is read from under the
  rim too (`page/fireBelow.ts`, #291): the share of the bowl's pixels (its meshes' in the `parts` look) its flames
  light, its coals and embers hidden. The flames are a box marched in its shader, depth-tested at its faces, whose
  corners stand out past the bowl's wall: main's lit 22.8% of it, as a pale band up the bowl. Over 2% is a problem.
  Nothing drawn, still, blown out (20% white), turning, plants over it and 3 flashes a second are problems. `--cost`
  (`page/fireCost.ts`) times its flames on the GPU from beside them (in the top-down view they cost under the
  timer's noise), each render by a query of its own, drawn and not in turns: its times differ run to run, so they're
  in the lines only when asked. `--canary`: a still flame, one drawn white, one put out, a 4 Hz strobe, the front
  shown from behind, a leaf over the bed, the bowl taken from the flames' shader, and with `--cost` the flames drawn
  four times over (twice their cost at least). Pictured (`out/fire/`): close (beside it at 0, 0.13, 0.27 s, its
  light alone, from above, from below and where the bowl and the flames through it were found), round (the four
  sides, the first's light alone), and the top, third, first and lobby views. Main's fires (a disc of
  coals under glow particles): 1.4 to 1.6 m by 0.9, dim orange-red throughout (7 to 25°, at most 0.22 of white), no
  smoke, 19 to 37% moving a moment, six fern clumps over the bonfire. As sheets turned to the camera they turned with
  it (0.52 alike their mirror); as a volume 1.55 m by 0.6 to 0.7, 0.33 to 0.41 of white at 30° low to 0.13 at 25° at
  the tips, 0.86 alike its mirror, the bonfire's smoke over 47% above it, 7 to 9% moving, no plant over either, 0.16 ms
  (crypt) and 0.34 (forest) of a frame from beside them on the lab's desktop GPU.
- `haze`: the hero's held weapons' light through the eyes (`page/haze.ts`), standing in a biome (`--biome`, the
  forest by default) looking each way (`--facings`), held as `--gear` and `--weapon` say. The frame is drawn with the
  weapons and without them, each also with the grade's adaptation held off, and their surface found in the `parts`
  look. Held off, the share of their surface near white is their glare (5% at most), and the share of the frame past
  them that their light brightens by 0.03 of white is their bloom (0.5% at most): the sun on a dual wielder's blade
  held up by the eyes blew it out over 16% of its surface and bloomed over 7.7% of the frame. Past their own pixels,
  a pixel the adaptation darkens more with them than without is hazed (0.5% at most). Each frame is pictured with its
  map: the weapons blue, their glare yellow, their bloom pink, the haze red (`out/haze/`). `--canary` plants a veil
  (the frame at 0.8 of its exposure), which must haze, and the weapons lit white, which must glare and bloom. Not
  yet within its haze: on main as here, a single sword hazes up to 4.9% of the frame looking 135 to 315 degrees.
  `--part hands` measures the hands instead and `--view third` looks over the shoulder: the mage's glowing hand, its
  light at the palm and its outline at 3.2, blew out 12 to 23% of its surface (the owner: "his hands glows too
  bright", "we should never have blinding lights in our game"); a halo is held to the part's own size when that's
  under 0.5% of the frame, as a hand's is.
- `touch`: the touch controls' move stick pushed by a finger, its touches sent by the browser as a touch screen's
  (`lab.touchDown`): put down on the move pad and slid right, within the dead zone, through the stick's travel, to its
  edge and far past it, and half the window across, each push from a fresh set-up. Each push's line says what the
  game made of it: the stick's push (0 to 1), how far out the knob stood and the hero's speed against his full. It is a
  problem when the knob isn't under the finger within the travel, when a push further out gives less than a nearer
  one, or when a push past the edge falls short of full speed. On main, the knob was held to the edge and the push
  divided by the finger's whole distance, so half a screen out the hero walked at a seventh of his speed. `--canary`
  slides the furthest push's finger back to 20 px before it's read. Try it on a phone too
  (`--screen 844x390@3`): the stick is drawn at the touch controls' scale, and so is its travel.
- `tap`: every skill of the hero's class aimed by holding (`SkillDef.aimed`: `--class mage` Starfall and Veilstep,
  `ranger` Quarry Mark and Strawman), its touch button pressed by a finger, the other thumb on the move stick
  (`lab.touchDown(at, finger)`), each from a fresh set-up with a training dummy standing clear at the hero's side.
  Tapped standing, tapped down and up between two frames (a slow phone's quick tap: the release takes the aim as the
  press would have) and tapped while he walks away from the dummy across the way he faces: a movement skill
  (Veilstep) must go within 3° of the stick's way, or of his facing standing, and any other be cast at the dummy where
  it stood as the finger lifted. Each cast is read as the skill is given it (its `cast` wrapped for the round). No
  tooltip may open after a tap. Then dragged from the button through three stops, the stick slid to a new way at
  each: the skill's own preview must show within 3° of the drag's way from the hero (Quarry Mark's outline round the
  dummy standing along it), no plain ring beside it, and let go it must be cast where the preview last showed, the
  stick still pushed and the hero walking on. On main a tapped Veilstep went at the dummy (87° to 177° off), no held
  skill showed its own preview on touch, and a tap opened its tooltip over the buttons. `--canary` taps a movement
  skill with the stick let go and the hero turned to the dummy, another with the dummy carried out of reach, reads
  each drag's last preview before a frame showed it, holds its cast against the stop before's preview, and reads the
  plain ring as shown beside a preview: each must be caught. (A dummy risen outside the arena or in a prop is pushed
  in over its first frames, metres for one off the edge: spots are picked where one stands clear.)
- `practice`: casting in the lobby and in the runs it starts, the hero's every skill on a key with a cooldown of a
  second or more (its effect's own `fire` counted) cast, then cast again as soon as he is free (no cast, channel, aim
  or charge under way), from full energy. In the lobby as it shows, and shown again after practice, casting is free:
  both casts must be made (nothing left cooling from practice). In practice (stowed, by the control the screen shows:
  a phone's rail's Practice, or the hint over the arena that Space works), with every panel folded on a screen that
  shows them side by side (not played on one showing one at a time, where folds don't count), in a run started by the
  lobby's start the screen shows, and in a run begun in practice (a co-op guest's, as its host starts: no button of
  a stowed lobby starts one, so `#btn-start` is clicked by script), the second must be refused while the first cools,
  the HUD must count it down on its key, and the cast must spend at least half its energy as the HUD shows it. A run is
  held in its countdown with a dummy before the hero, and left from the pause menu (`lab.clickOn`: scrolled to, as a
  phone's has its Abandon below the screen's edge). On main the run begun in practice kept the lobby's free casting
  through it: every skill cast twice, no countdown, no energy spent. `--canary` plays that run again with free casting
  planted, which must be caught. Run with `--screen 832x384@3.75` for a phone's (the rail's controls).
- `spawns`: the foes coming in. Boss waves (the 5th, 10th, 15th and 20th in turn, `--waves 32` in each biome,
  `--biomes`) are set off one after another, each from a seed of its own (every set-up seeds the same numbers, which
  would roll the same gates), the hero at the arena's middle (`--at`). Every foe is read as it rises: the gate it
  came by, how far into the arena and to the side of the gate's middle, and its room from the props and the edge. The
  first group is left standing, each of its foes timed as it comes within its reach of the hero (its range and his
  body, as the AI strikes within), as the boss's time is reckoned from it; a later group is taken out once its last
  foe has risen, and the next called at once. The boss's summons are held off (they rise round it, not by a gate).
  The report says each gate's share of the foes, how many groups came by one, two, three and four gates and the
  packs' sizes (a number of gates no group came by, though enough had foes for it, is a problem, as is a gate sent
  under half its share), the waves that left a gate idle though their packs were enough for all four, the spots and
  the least room, the gates the bosses came by, whether each boss rose after its
  wave's first group and when against that group reaching the hero, and from each gate the first boss's walk to the
  hero (how long from its rise it took to come within its slam's reach). Each of those is a problem when it's wrong,
  as is a foe risen inside a prop or a boss outside its time (`bossJitter` either way, and 1.5 s for the game's
  estimate, a straight walk at each foe's wave's pace). Then waves 1, 5 and 10 are played at the game's own pace, each
  foe taken out as it reaches the hero, as a player killing each one as it comes: when each group came, its foes, and
  when the wave was over (the same seed needn't give main the same foes, as the waves before leave the clock
  elsewhere). On main each group came by two gates picked at random, often one twice, every boss in the first group
  by one gate, and by the Thornwood's west gate foes rose in a log. `--canary`, in the first biome: every foe read
  again moved onto one gate, the first half into a prop, and waves of their own with the boss put first, come late
  and frozen where it rose.
- `cast <skill>`: a skill cast as the player casts it, its effect seen frame by frame (`page/cast.ts`; the skill
  named by its key, its behaviour or its name, `--class` for whose; `--gear` and `--weapon` what he holds). The hero
  stands in each biome and view
  (`--biomes`, `--views`, `--facing` in degrees, `--at x,z`: off the dais by default; `--at 0,0` its middle) with the biome's commonest foes coming at him from 13 m ahead
  (`--foes`, 4 by default), and the key is pressed over an aim 8 m ahead: held for a held skill, drawn to full for a
  drawn shot, held 3 s for a channel. Every frame from the press until the effect is over is drawn as the game draws
  it and read back from the canvas (`page/screenCells.ts`: as stored, 0 to 255, and as light by sixteenths of the
  frame). Its light is held to the budget taken from the owner's screenshots: the frame's mean raised by 50 at most
  over the scene before the press, a sixteenth of it 150 at most and 5% of it bright (200 or more) at most, those two
  not judged where the scene alone is past them. The flashes are counted as WCAG counts a general flash
  (`page/flashes.ts`: a pair of opposing changes of a tenth of white in a sixteenth's light, the darker under 0.8),
  three in any second a problem; the changes the worst cell's worst second counted are listed, each the light it
  reached and when (its light every third frame was listed: a hand swung through the cell in a frame or two read as a
  steady fade, and what was counted could not be told), and the frame's mean
  every tenth of a second through the cast, and the blinks, listed and not judged (`page/blinks.ts`: a patch of a
  64 by 36 grid brightening by 20 or more over the frame before and back within 3 frames, an effect's own crackle
  among them; a broken prop's rubble piece drawn full size at the world's middle for a frame, beside a hero on the
  dais, was one). `--what s,x,y` says what the eye's ray meets at that moment and point of the screen (% across and
  down), nearest first (`page/whatIsAt.ts`): the runs give the same frames, so a blink one finds, the next can look
  into. It casts through each camera that drew the frame, on the layers it draws: through the eyes, the arms' own
  first, as it draws over the world's. Cast on every layer from the world's camera, it listed the hero's hidden hair at
  the eyes and missed the arms, drawn through a narrower view. The world's ray meets the foes too, by their own
  meshes, on the layer no camera draws, where their crowd draws them (the camera stood inside a husk Bull Rush threw
  ahead of it, and the ray met only the walls past it); and it says what the hero was doing then: his cast and how
  far through it, his channel, a dash, a stagger, a fall, his life. Shaders compiled after loading, and nothing cast,
  are problems too. The
  props a cast broke stand again before the next. `--times` (0.4,1.5,3 by default) are the moments pictured, the
  screen as the player sees it with the HUD, into `out/cast/<skill>`; `--canary` strobes the exposure in the first
  biome and view (5 a second), which the flashes must catch. `--gear` holds the weapons a style's way (Thunder
  Crescent takes a two-hander), and a skill the hero knows but hasn't on a key is bound to its own first.
- `trail`: the trail a swung weapon leaves (`page/trail.ts`, `fx/swingTrail.ts`; `--class warrior`). Each strike
  (`--strikes skill@style,...`: every warrior strike and Rending Cleave with every weapon style by default) is cast
  in each view (`--views`) in the crypt (`--biome`), and every frame from the press until his weapons are still again
  is drawn twice, with the trail and without it (its meshes hidden), both without bloom (`holdBloom` in
  `core/renderer.ts`: from the top-down view, where the trail is a few pixels wide, the glow round its newest end was a
  hundred across, and read as trail off the blade's path), so the pixels it lit are told apart (`page/sweptArea.ts`).
  Where it may be is where his weapons swept over the last 0.15 s: each frame every weapon in his hands is placed from
  its grip to its far end, read off its own meshes and not the trail's points, in his own frame (as the trail is
  kept), and each gap between two frames is cut into steps along the curve through its places round it (joined by
  straight lines, a blade swung round the eyes 80 degrees a frame was placed half a metre inside its arc), and drawn on
  the screen as the camera drawing his arms sees them now, with a margin round them. Problems: more than 5% of the
  trail's light outside that; a blow (frames moving at 12 m/s and 0.4 of the strike's fastest, three or more, a
  weapon's far end in the frame) lighting less than 0.02% of the screen; the lit pixel nearest a blade swung at a
  blow's speed in the frame further from it than the margin (the median through the blows); the newest column of the
  trail's own geometry over 3 cm from the weapon through a blow; and pixels lit before the press or while the weapons
  have been still (under 3 m/s) for longer than the window. Each strike's frame its trail lit most is pictured into
  `out/trail`: as the player saw it, its trail's pixels (white where the weapons swept, red outside, where they swept
  tinted blue) and those close up. `--frames` lists every frame (the weapons' speed, the pixels lit and outside, the
  newest column against the weapon); through the eyes, Steel Tempest's blade was put back 53 cm in a frame as it ended
  and the trail drew that as a slash across the top of the view, now a place is as fast as the slower of the moves
  into it and on from it. `--canary` plants three faults in the first strike: the trail lasting a second (lit away
  from the last 0.15 s and while still), never lit, and through the eyes drawn by the world's camera instead of the
  arms' own.
- `health`: the screen as the hero's Health runs low (`page/health.ts`). Standing in each biome, view and facing
  (`--biomes`, `--views`, `--facings`), his Health is held at shares of his most (`--shares`, 1 down to 0) and at
  each the frame is drawn three times at the same moment: without the low-Health look twice (the pixels that differ
  between those two are unsteady, the forest through the eyes shimmering a level every other frame, and left out),
  then with it (`light.ts`'s `drawFrame`, read back from the canvas). Reported for each share: the look's strength,
  the share of the pixels it changed, the colour it drained (off the blood), the blood's cover of the screen and of
  its middle third, and how far in from the edges it reaches (the furthest blood pixel and where). A frame changed
  above where the look starts, blood in the view's middle, a lower Health that drains or covers less, and a look
  too faint with nothing left are problems. `--pictures` (on by default) pictures the frames under the share the
  look starts at into `out/health`; `--canary` draws the look with the Health whole and drives its blood into the
  middle.
- `blink`: the mage's blink cast as the player casts it (`page/blink.ts`, `--class mage`): the key held over the
  aim and let go, on open ground, past his reach, at a prop's middle, past a prop, out at the arena's edge, up onto
  the dais and at his own feet. Each says where it was aimed, where the preview showed and where he came out, how
  far, in how many frames, how many of them he was hidden and whether a blow tried in each landed (none may, and one
  just after must). Then held through its cooldown (`page/heldCooldown.ts`): pressed with 2.5 s of it left, let go
  while the preview is red (nothing may be cast), pressed again and held until it's green, and let go (it must cast),
  the preview read every frame as it's drawn: red on every frame of the cooldown, its countdown the seconds left
  rounded up (3, 2, 1), green within a quarter of a second once ready; then held short of energy (red, no countdown,
  nothing cast). Then foes stood near where he vanished and further off: how long each was dazed, its speed
  while dazed and after, and the stars over it. A landing off its preview, past his reach or in a prop, a blow
  landed while he crossed, a near foe moving while dazed or never coming on again and a far one dazed or stopping
  are problems. `--pictures` (on by default) pictures the held preview, his coming apart, the crossing, his forming
  again, the preview counting down and the dazed foes into `out/blink`; `--canary` reads the preview a metre off,
  takes the guard off as he comes apart, reads it green with no countdown on its cooldown and clears a near foe's
  daze at once.
- `death`: each skill's kills followed as they fall (`page/death.ts`). `--skills` names them by key, behaviour or
  name; by default every skill of the hero's that deals damage (Thunder Crescent needs `--gear twoHanded`, Twin Fangs
  `--gear dual`). The biome's commonest foe is stood dazed where each skill strikes (`STANDS`), and the skill is cast
  twice, each on a fresh set-up: first at foes a hair from death (1 Health: thrown hard), then at foes holding 80% of
  what the first cast's killing hit dealt them (thrown softly). Every body is followed as drawn until it has
  dissolved: how hard it was thrown, how far it flew and how high, when it lay still (or began to dissolve: a frozen
  body shatters as it lands), and how far one struck off its middle turned its blow's way over its first 0.2 s (its
  shoulders' heading). These are problems:
  - a drawn part more than 4 cm under the floor (a ball's depth into its own level or a higher one, `depthInFloor`)
    or 6 cm into a prop;
  - the pose more than 10 cm off its points, a bone stretched over 8%, NaN, or a body past the wall;
  - a body lying with its hips over 0.6 of their standing height above what's under it;
  - a body going back at the hero, or against its throw for a skill that strikes from elsewhere (Hailfletch's
    shower, Starfall's crystals); a body going against a sweep's swing;
  - a body struck off its middle turning more than 5° against its blow;
  - a storm's kill not going round it (its path at least twice its way, its hips up a metre);
  - the bodies killed with little to spare thrown as hard;
  - a shader compiled meanwhile.

  `--trace` lists every hard-thrown body frame by frame: each point's clearance as drawn, its pose's error, its
  point's own clearance, a prop touched, and its fastest point (what keeps a body from lying still). `--pictures`
  (on by default) pictures the bodies as the player sees them, and close from the hero's left and from behind, at
  0.15 s, at 0.5 s and lying still, into `out/death`. `--canary` puts a body a metre under the floor for a frame,
  throws one back at the hero, and turns the first struck off its middle the other way.
- `hits <skills>`: each skill's blows as they land (`page/hits.ts`): foes stand dazed where it strikes (`death`'s
  stands), living past every blow, and it's cast at them on a fresh set-up as the player casts it (`cast.ts`
  `holdFor`). Every hit is caught as it lands, a blow being the hits within a frame of each other (one cut striking
  three foes): each blow's time from the press, the gaps between them, when the hero was free again and the damage a
  second till then. Striking nothing, a gap past `--apart s`, and blows no quicker than `--than`'s (held down 1.2 s
  for a row of its blows: the basic attack, `cleave`) are problems. `--canary` strikes a blow of its own 1 s after the
  first (with `--apart` or `--than`), or else keeps the foes from harm. In `check` as `hits twinFangs --than cleave
  --apart 0.2 --gear dual`: Twin Fangs' two cuts came 0.35 s apart, slower than a dual wielder's cleave at 0.30 (the
  owner's "too slow", "both hits in a rapid succession"); they're 0.15 s apart now. Its cast (`castAt`, each hit's
  type, crit and kill caught too, a canary's plant tried each frame, followed on for `lasting` s from the press for
  an effect that strikes on after the hero is free: a firestorm's ticks) is `log`'s and `tooltips`'.
- `log`: the battle log (`src/ui/battleLog.ts`) held to the hits as they land (`page/log.ts`). Each skill the hero can
  use (`--skills` for fewer), in each way of holding weapons for the warrior (`--gear` for one), is cast at foes as
  `hits` casts it, with the log cleared first, and the basic attack once more at foes it kills. Every hit caught as
  the foe takes it must be listed once and in turn: under the skill cast, on the foe it struck (its name and id), for
  what it dealt, of its type, a crit and a kill as they were; and the panel must show every line of the log, each
  row saying what its line says. Then foes of each way of attacking (three Hollow Husks striking at once, a Rift
  Witch's bolt, a Cinder Brute's slam) come at the hero for two blows each, every one listed under the foe's name and
  attack, for the life it took and what his armor, shield and ward stopped. Each row must name the hero alone on his
  side of its arrow and count no more of a foe on theirs than there were: three Mossbacks' blows on one line read
  "Mossback strike ▸ You ×3", the hero counted in their place, and no check said so (`--ab` on that commit fails
  it). Paused from its panel's button, the log must list none of the basic attack's hits, its head saying it's
  paused, and list them again once it goes on. Each cast's lines are listed as the panel shows them. `--canary`
  strikes a hit at each cast's press under a misnamed skill and a blow on the hero from no foe, counts the hero in
  the panel's first row, and lets the pause go at the press. Every hero in
  `check`, 4 to 15 s each. (The owner, testing #255: a Bull Rush cast over a charging Power Strike seemed to deal
  the lobby's dummies nothing; it had hit, its number shown a moment after Power Strike's, and was missed.) The game's
  module is found through `page/battleLog.ts` (none on an A/B's older commit: `no battle log in this tree`). The
  ways of holding weapons a class has, each as a set-up's gear, are `page/gears.ts`, `tooltips`' too.
- `tooltips`: each damage skill's tooltip held to the hits it deals (`page/tooltips.ts`, `src/ui/skillDamage.ts`,
  each skill's `hits` in `src/combat/skills`). The hero is given modifiers of every kind, his stats set (40% all
  damage, 30% arcane, 25% elemental, a 35% crit for 70% more, 20% casting speed), so a tooltip leaving one out is
  caught. First the hotbar's tooltip is hovered, the weapon's all damage raised by 30%, the hero's stats made again
  from his gear (`recomputeStats`) and hovered again: each figure must follow, by the measure's own rule. Then each
  skill he can use (`--skills` for fewer), in each way of holding weapons his class has (`--gear` for one), has its
  tooltip read as the player reads it (its text: each kind of hit's range, how often it comes, the least share it
  says a hit falls to, the crit's chance and share), and is cast at foes stood where it strikes as `hits` casts it
  (a drawn shot at full draw; a firestorm followed for as long as it lasts). Every hit that lands must be within a
  figure stated per hit (a crit's raised by the crit's share; down to its least share, and one hit at its full
  figure), and a hit dealt over time must come as often as it says (on the foe struck most, past its first three
  hits: a spin comes up to speed). Stating no damage, landing no hit, and a crit's chance not the hero's are
  problems. Last, each skill whose tooltip states what it gives the hero (the draught's Health, Iron Bellow's ward)
  is cast: what it gave must be the figure (the amounts asked of `Player.heal`, before his most Health caps them; the
  ward's). `--canary` raises all damage and his most Health by 50% once each tooltip is read, as a tooltip behind a
  change would be: its hits must be found above what it states, and what was given off it. On `--ab` against a
  commit before it, every tooltip states no damage.
  (Issue #256: the tooltips showed the base damage alone, not what the hero deals with his gear.)
- `spin`: mouse look turned one way for 240 frames in each close view (`--views third,first`), then the other way,
  24 px a frame, the pointer locked as the player's click takes it (`page/spin.ts`; `src/core/input.ts` `lookMove`).
  Chrome on Windows sends a move of its own under the lock now and then, about half the window across in one event,
  as it puts its hidden cursor back: taken as the hand's, it turned the view by about 180 degrees at once, and back
  again spun the other way (#318, from play: "the jump will happen if rotating to one side for the while"). Mid-spin
  that move is sent as Chrome sends it, and no frame may turn the view past three times the spin's steady turn
  (main: 141 degrees in a frame, each way in each view). `--canary` sends that move twice running (the second, the size
  of the one before, is taken as the hand's): the view turns round in a frame, which must be found each way in each
  view.
- `cursor`: the cursor drawn over mouse look while Alt is held (`src/ui/altCursor.ts`, `page/cursor.ts`). In each
  close view (`--views third,first`) the battle log is filled past its height and the pointer is locked as the
  player's click takes it: the lab's browser plays the lock (`lab.pointerLock`, `noCapture` in `node/browser.mjs`),
  so while it's held every event of the mouse goes to the game's canvas, as Chrome sends it, and a click on the HUD
  lands there. The mouse moved with nothing held must turn the view (else the command stops: no mouse look to
  measure). Then Alt is held, by the keyboard and in the game's frames: the mouse moved onto the log's Pause must
  leave the view still and draw the cursor there (within 1.5 px: the mouse's events come in whole px) and lit, as the
  page's cursor is over a button; its click must pause the log and not attack (the basic attack's key not pressed in
  the game); over the hotbar's first slot its tooltip must show, and go as the cursor leaves; the wheel over the
  log's lines must scroll them, and the game must take none of it as a zoom; a click on the world must not attack.
  Alt let go, the cursor must be gone and the mouse turn the view again, and a click on the world must attack (else
  the command stops: no attack to see). The lock must be held, and the run going on, through every frame. `--canary`
  holds Ctrl instead, a key that frees nothing: the view turning and the click on Pause landing on the world must be
  found. On `origin/main` the view turned 1.62 rad as the mouse went to Pause, no cursor was drawn, the click
  attacked and the wheel zoomed. (The owner: "in 3rd and 1st person user cannot press on those battle log buttons".)
  About 2 s.
- `rush`: the foes Bull Rush sweeps up: in full in [`commands/rush.md`](commands/rush.md).
- `evade`: the shooters getting out of the hero's attacks (`page/evade.ts`, `--class ranger`, `mage`, `warrior`):
  each foe that evades (`EnemyDef.evade`: the Sporecaller ducks into the ground, the Rift Witch blinks away) stood
  7 m before the hero, held to its spot (or where it blinked to: left to its AI, it walked back into a rain of
  arrows), kept from shooting and from dying, and each attack of his it evades (`--skills`; by default every one of
  his that one does: Nockshot, Briarflight, Lancewood Shot, Hailfletch, Splintering Bolt, Void Lance, Starfall,
  Thunder Crescent, Bull Rush) cast at it try after try as the player casts it, over the shoulder by default (from
  above, the aim met a cap's or a hood's rim first, and a swaying body let the shot graze past): `--tries` from in
  front of it (30 by default), a third as many from behind it (it faces away), and for a ducking foe and a drawn shot
  as many at its feet (ducked as the shot is loosed, the shot aimed at what's left of it). Each try's evade is
  caught as it's played (`Enemy.evade`) and each hit as it lands. From in front, an evaded share outside 0.3 to 0.7
  (its `chance`, 0.5), a try struck after it evaded, and one missed without it (the try measured nothing) are
  problems, and so is a blink out of its reach, into a prop, by the wall or the hero, or through a prop, judged as it
  goes (Thunder Crescent breaks the props in its way); from behind, any evade; at its feet, a shot that missed.
  `--trace` lists each try: its evade and where to, its hits, where the hero's aim was as he let go and where each
  shot ended against the foe's feet and top. `--canary` lets the foes see all round them and duck without going
  down, which the tries from behind and the struck ducks must catch. The lab's frames draw nothing, so it places the
  foe's meshes itself each frame (`updateMatrixWorld`): unplaced, a ducked foe's body was met standing. It found a
  five-arrow volley judged arrow by arrow (a foe got out of 30 of 30 volleys: now a cast's shots are judged as one),
  a Lancewood Shot meeting a duck half down (it crosses 7 m in five frames: now a duck counts as down at once) and
  going into the ground through a ducked foe's cap untouched, and an arrow at a ducked Sporecaller's cap flying
  through it (its skinned body is met by its hulls, which leave the cap's top out). About 3 min for the ranger, 1 for
  the mage, 20 s for the warrior.
- `throws`: what the slammers throw at a hero too far off to slam (`page/throws.ts`; `EnemyDef.throws`,
  `src/entities/throws.ts`), a throw a case, each thrower risen 12 m before the hero along the screen's W, pinned to
  its spot before every frame (it turns and throws as its AI has it, but never walks up) and its cooldown held out
  after its throw. The Cinder Brute's lava: at him stood still, the chunk must land within 0.25 m of where he stood as
  it left the hand, its ring (`Thrown.ring`) on the floor every frame it flies and within 5 cm of where it lands, its
  splash hurt him as it lands and its pool burn him at least twice after; stepped off as it's thrown (D for a
  second), nothing may hurt him; up close (2.5 m) it must slam and throw nothing. The Barkhide Hulk's vine: at him
  stood still and walking (D) from the moment it holds him, it must hold him for its hold (90 frames, 3 frames
  either way), his walking moving him under 0.1 m, and let him walk on after (0.5 m in the frames left); stepped
  aside as it's sent, it must never hold him; stepped aside as it's sent (D for half a second) and back onto it
  once it lies there (A from frame 80), it must hold him, and not before; held, a dash of his (Bull Rush,
  Veilstep: `--class warrior` or `mage`; the ranger has none, and says so) pressed 20 frames in and let go after
  its own hold must free him within 3 frames of its start and carry him a metre (aimed 6 m to the screen's left:
  to its right a prop 2 m off cut Veilstep short).
  The hurts are counted at `Player.takeDamage`, the hold by `Player.rooted`. `--canary` plants a splash of 6 m (the
  step off is hurt), a vine catching 4 m off its line (the step aside is held) and a dash that leaves the hold on
  (still held after it), each a problem unless caught. `--trace` lists the frames. About 5 s with `lab:serve` up.
- `crowd`: a crowd of foes killed at once (`page/crowd.ts`), and what the frame costs as their bodies fall: the low-end
  device's measure. `--count` sets the crowd (38 by default, the most a wave keeps alive); it's killed by a blow each
  from the hero, or by `--skill` cast at it. Each round sets the crowd up afresh, times 60 frames with it standing,
  kills it, and times every frame until its bodies are gone, with the game drawn and waited out on the GPU (`finish`:
  what the GPU draws runs behind the page, and the page's time alone left out what the bodies' smoke and embers cost
  it), every time taken by the browser's own clock: the frame, its draw calls, the particles alive, the deaths
  (`Enemy.die`), the bodies (`Corpse.update`) and, of those, the ragdolls' steps and poses (`timeCalls`' laps).
  There's a round for each CPU slowdown (`--throttles`, by default 1,4,6: as it is, then DevTools' mid-range and
  low-end phones; `lab.throttle`) at each frame rate (`--rates`, 60,30: a device already slow steps each body twice
  as far a frame). Two things are problems, each judged against the
  frame with the crowd standing so it holds on any machine:
  - the frame as the crowd fell more than 15% slower (its 90th percentile);
  - the bodies' part over 20% of the standing frame.

  `--canary` runs the first round again with each body made 0.1 ms slower a frame, which must show. The machine's load
  drifts, so compare rounds within one run. Drawn mesh by mesh, a foe was about 77 draw calls (#222); in its kind's
  crowd (`src/entities/models/crowd.ts`) the 38 are about 20, and the frame standing went from 20 ms to 6 to 9 on a
  desktop.
- `draws`: one frame's draw calls (`page/draws.ts`), the crowd `crowd` times standing before the hero (`--count`, 38
  by default; 0 for none) in the biome (`--biome`; the crypt's top view is 368k triangles, 13% of them outside the
  view) and view the set-up asks for, each of the renderer's draw calls recorded with
  its pass (the scene's, its shadow map's, the post and overlays after it), its geometry and its material. Its lists
  (`--rows` each, 16 by default): the geometries drawn most often (one drawn many times a frame is one an instanced
  mesh would draw once), the geometries that drew the most triangles (the GPU's vertices: 38 mossbacks are about half
  of a forest frame's 2.5 million), the triangles drawn outside the view of the pass that drew them (an instanced
  mesh's instances, each by its own sphere, beyond the scene's camera or the shadow map's box: three culls an
  instanced mesh only whole, and half the forest's top view was such until `world/culling.ts`), the draws that drew
  nothing, alike ones together, saying why (an instanced mesh of no instances, a range of nothing: the renderer's work
  for a draw each on the CPU, though an instanced mesh of none never reaches the GPU, so the perf overlay's count,
  which counts GL draws, leaves them out; the rubble's empty pools were 46 a frame), and the scene's draws by their
  material's look (draws of one look, a merge of what doesn't move would make one). Its head line says the draws in
  each pass and how many drew nothing, the triangles and how many lay outside the view, the scene's objects whose
  matrices are made again each frame, and how many of them are off the camera's layer (a crowd's bodies' own meshes).
  Through the eyes (`--view first --class warrior`), the arms' own camera's draws are a pass of their own
  (renderer.ts `drawArms`), and what it drew is listed, the hero's and what isn't his. Anything that is neither under the
  hero's model nor his weapons' trail (`fx/swingTrail.ts` `swingTrailsOf`) is a problem, drawn over the frame at the
  arms' narrower view. The crowds' bodies' own meshes shared the arms'
  layer, and 38 mossbacks were 656 draws of it a frame (`core/layers.ts` now). `--canary` stands seven boxes of one
  geometry before the hero, which must come out as seven draws of it, seven instanced boxes, four far behind the
  camera, which must come out as four outside the view, and an instanced mesh of none, which must come out as a draw
  of nothing. Through the eyes it also stands a box on the arms' layer before them, which must come out as drawn by
  their camera, not the hero's.
- `perf <skills>`: skills cast in turn as the player casts them (`page/perf.ts`; `maelstrom,glacialNova`), the
  biome's foes coming at the hero (`--foes`, 10), every frame timed as the game's performance report times it
  (`ui/perfHud.ts`, on the browser's clock: `perfClock`) and summed by phase: standing (60 frames), then from each
  press (`--apart` s, 1) to the next, the last to `--after` s (4). Each frame is timed whole by the browser's clock,
  drawn and waited out on the GPU (`gl.finish`), then a task yielded (the GPU's timer queries come back only then);
  each phase says the frame, the page's work (the update by stage, the render), the GPU whole and by pass (where the
  browser times it, `EXT_disjoint_timer_query_webgl2`), the draws (the GL draws, as the overlay counts them) and
  triangles, and the particles' fill (`page/particleFill.ts`: each live particle's disc as its shader sizes it, in
  the scene's pixels, every layer: the fill a phone's GPU pays, which a desktop's GPU times don't show; Glacial
  Nova's was 15 times the scene's pixels on #243's phone while the particles were sized by the canvas, 1.4 times
  since); `--frames` lists every frame. `--biome` (forest), `--view` (top), `--facing`, `--at`, `--gear`. Run it on
  a phone's screen, boot and CPU: `--screen 832x384@3.75 --boot low@518400 --throttle 4` (#243's phone: booted as Auto
  settled there, the hero built at Low's detail and the warm-ups run at it), or `--quality low@518400` on the lab's
  own boot (the level and the most pixels Auto lets the scene render, put to use before the set-up, the hero built
  again at its detail, and at the page's after). Read the GPU at `--throttle 1` alone: a slowed CPU feeds the GPU slowly, and a pass's time runs from its
  start to its end, its waits for the page's commands with it; on a desktop the scene pass's GPU time often matches
  the render's CPU time, as the GPU waits on it, so a triangle cut shows smaller there than on a phone whose GPU sets
  the pace. A cast pressed and never made, a shader compiled while it was timed, and frames all read 0 ms are
  problems. `--canary` runs a round with the hero's update made 2 ms slower (it must read at least 0.8 of that) and
  the scene drawn twice (the scene pass's GPU time must read at least 1.3 times more), and the particles twice as
  wide (their fill must read at least 2.5 times more). The machine's load drifts: compare an A/B run `--fresh`, both
  sides then, not one side from the cache and the other now. Then the report as the overlay copies it is read
  (`page/perfReport.ts`): its histories, 30 buckets each (frames a second, our frame's time, how late it started, the
  GPU's for our draws), and its long frames (Chrome's Long Animation Frames API: what the main thread did in each),
  where a task of 120 ms run by a message must be listed with what ran it (`--canary`: one of 30, under the
  browser's 50, must be found missing). The owner's lobby fell to 28 a second hovering items, frames late by 20 to 46
  ms where ours took 11 to 18, and the report couldn't say whether the page's thread or something outside it held
  them up. A click's long frame ends at the page's next rendering, which the lab's held frames put off past the
  read: the task is a message's.
- `programs`: the programs the boot compiled (`page/programs.ts`), read from the game's ledger of them
  (`watchPrograms` in `src/core/shaders.ts`, dev builds alone: the boot's programs are made before any command can
  watch). How many each loading step made, and how many of those a draw made rather than the warm-ups' `compile()`
  (a draw's program is linked as it's drawn, the page held up meanwhile); each kind (the material's type and its
  shader), with the fields of its key that set its programs apart (`page/programKeys.ts`: three r187's key read by
  field, the names held to three's own code by `test/programKeys.test.mjs`; `custom` is the material's own key,
  three's default left out), a kind of one with what it was made for; what uses them (the scene's top-level object
  of each object compiled or drawn with one, every foe's kind as `foes`: a program the foes alone use is one a lobby
  shown before them could compile later); the programs no draw ever used (compiled for
  nothing) and those a draw made, each with its step and what it was made for; those made after the reveal (the
  lab's set-up). #275's boot made 32 by a draw, each a first visit's wait inside it: the post chain's and the
  environment maps' (now compiled with the biome), the shadows' (`compileShadows`) and the outline's
  (`compileOutline`). Now none. It found 177 programs at boot, 92 of them lit (each for
  15 point lights), 17 of those never drawn: the crowd bodies' own materials, on a layer no pass draws (now left out
  of the warm-ups' compile; the kit's variants made uniforms, 146 were left). The lobby shows before the fight's
  programs are warm (`src/game/warm.ts`): the lab's boot asks for them at once and waits for them, listed as made
  `behind the lobby` (40 of the 146). `--cost` compiles each program again from the GLSL three gave it, alone, salted
  so no cache can answer (`page/programCost.ts`), and times it from its source to its link: the CPU a first visit's
  ANGLE spends on it; summed by kind, by what uses them, each step's by what uses them (what that step's warm-up
  waits for its links on) and by the point lights they're lit by, the longest listed with their fragment shader's
  size, and a plain lit material's compile as the scene lights it and with its point lights, environment map,
  shadows and fog each taken away. Its canary is the cache: the longest compiled again with its salt must come back
  in under a quarter of its time, and with a new salt in over half. It found the lit programs 36 of the 40 s (0.56
  s each, 16 point lights written out), 23 s once lit in a loop; and the spells' 91 programs 14.4 s, the hero's 6 s,
  the effects' samples 3.9 s, the lobby's biome 3.5 s (now compiled as the arena is built). A minute or more.
  `--canary` warms a box of a kind nothing else is (it must be listed compiled and drawn) and one on a layer no
  camera sees (it must be listed never drawn). The performance report's count of programs compiled after load (each
  a hitch, as it says) must be the ledger's made after the reveal: a new build's lobby, its fight not yet warm,
  counted every program the boot made (83, 106 in the owner's), the load marked only once the fight's were warm; run
  it `--cold` to boot as that lobby shows. Its canary draws a box of a new kind in the lobby and marks the load again
  after it, as that did: the report then misses the box's program, which must be found.
- `compiles`: whether the boot's warm-up compiled what a fight draws (`page/compiles.ts`). In each biome (`--biomes`,
  both) the hero stands in the view (`--view`, top) and a prop of every kind the biome has is worn down (its gauge
  over it, chips knocked off) and broken in turn, its rubble, debris and smoke drawn as they fly and settle; then the
  run's first wave is set off and fought as the game plays it, the hero (kept whole) casting each skill on his bar
  in turn at the nearest foe, until it's cleared or 40 s are up, its foes killed as a fight kills them (no other
  check lets a foe die of a fight); then a Cinder Brute and a Barkhide Hulk throw at him from 12 m off towards the
  arena's middle for 420 frames (out the other way they stood beyond the wall, rose inside it 6 m off and only
  slammed), each piece of their throws drawn (the chunk, its ring, burst and pool, the vine and its coils: a piece
  never drawn is a problem, read from the scene by its name); then the first biome's wave is fought again by a hero
  built afresh, as the lobby's class switch builds him. Each round counts from before its set-up, whose frames are
  the game's (the view entered, the hero rebuilt: counted from after it, the rebuilt hero's arms compiled unseen).
  Every program compiled meanwhile is a problem, said as the game's perf report says it and with the draw that first used it, its
  object, its material and its pass (the game can't name a shadow's: three keeps its shadow materials). Run it as a
  phone boots, `--boot low@518400`: a Low boot's warm-ups draw other shadows (small parts cast none there). Each
  fight's line counts the point lights each pass is lit by, as three counts them (shown, and on a layer its camera
  sees): the scene's, and through the eyes the arms', drawn by a camera of their own (the warrior's); a pass lit by
  another count than the boot's is a problem, as its programs were compiled for that count and all it draws
  compiles again. `--gear` and `--weapon` hold the hero's weapons
  (`--class warrior --view first --gear twoHanded --weapon Greataxe`: #268's report). It found #243's mid-fight
  compile, the forest's wood rubble's shadow (`steadyShadowPrograms` in `src/core/shaders.ts`), and #268's: the
  hero built afresh brought his own light in after the arms' pass had put the scene's lights on its layer, which it
  did once, and through the eyes 11 programs of his arms and the shadows compiled at the run's start (15 lights to
  14). `--switch ranger` first picks the ranger on the hero selection screen, as a player does (Change hero
  clicked, each hero in the hall of heroes shown 150 frames, his showcase and all, and every program compiled
  meanwhile a problem; then the ranger's name and the choice), and waits for him (the lab's boot waits for every
  warm-up, so it says 0.0 s); the boot's class (`--class`) is another. A class's skills
  are warmed with the heroes, not the lobby, so only a switch tells whether they were: with the ranger's left out of
  `heroParts` (`src/game/warmup.ts`), `--class mage --switch ranger` found 9 programs compiled in his first wave.
  `--canary` draws a material nothing else does before the hero, which must come out as compiled, and puts a point
  light in the scene, which the count must find.
- `maps`: the game's procedural maps (`page/maps.ts`; `--maps forestFloor,steel`, every one `PRELOAD` lists in
  `src/core/pbr.ts` by default), each made on the page as a loading worker makes it, `--runs` times (its time the
  fastest, by the browser's own clock), with a digest of its pixels and of a face's grid. A map made faster must
  keep every pixel: with `--ab` each digest must be main's, the times side by side. A map a surface repeats must
  tile (`page/mapSeams.ts`): each edge (the last column against the first, the last row the first) is read on the
  albedo's brightness and on the height against every two neighbouring lines inside, by its mean step and by the
  share of it that jumps past both neighbours' steps (a slab's shade changing, not its bevelled joint); a seam
  reads past every line inside and twice their median (main's steel, slabs and fur had them). Its means (the
  albedo's brightness, the roughness) show a new look's drift from main's. `--pictures`: each map's albedo and
  height laid twice each way, its corner at its own pixels and its material lit on a square and a ball, a sheet a
  group (`page/mapPictures.ts`). `--canary` changes a byte (its digest must change) and plants a ramp across u in a
  copy (a seam must be found).
- `tiles`: how big each repeated map's tile comes out on each surface of a biome (`page/tiles.ts`; `--biomes`,
  `--maps bark,grunge` by their recipe's name, every repeated map by default). A surface's UVs decide it, with its
  instances' scale and the map's repeat: one tile of the forest's bark ran round a whole trunk and up a section of
  it (ez-tree's UVs), 2.2 m by 1.3 m at a trunk's foot and 9 m along a root, where the oak photo it's drawn from
  covers 0.36 m. For each surface, a mesh by its name (an instanced mesh's first 16 instances, from its drawn copy
  or its shadows' one, whichever holds more), the metres a tile covers along u and along v on each triangle
  (`page/tileSpans.ts`), weighed by its area in the world: the middle and a tenth to nine tenths of the area, how
  stretched it is (the longer over the shorter) and the map's pixels a metre. It reports, as `maps` reports means
  (a map drawn for a stretch is right on its surfaces); it fails where a biome shows no repeated map. `--pictures`
  pictures each surface as the player meets it (`page/tilePictures.ts`): from the arena's middle, at its nearest
  point facing its camera (60 degrees off at most: a boulder's top, seen level, was a smear of streaks) and in view
  from 2 m (a ray from the camera meeting it first, every culled instance packed for the ray, and one back out to
  the camera meeting nothing: a camera inside a plinth saw the stone's underside edge on), a hero's height up, the
  cut-outs and see-through things (ferns, leaf cards, a gate's membrane) left out, a sheet a biome; `--ab` sets them beside another commit's. `--canary` lays a board 2 m by 0.5 m in each biome, its
  map repeated twice along u, which must read 1 m by 0.5 m.
- `winding`: which way the game's faces point (`page/winding.ts`, `page/windingParts.ts`, tested in
  `test/windingParts.test.mjs`; `--models husk,ranger` by id, every one by default; `--biomes`). Every model
  (`MODELS`: the heroes with all they can wear, the foes, the dummy) built afresh and each biome's props, each
  geometry once. Each mesh is split into its parts (triangles joined by a corner, the corners welded by where they
  are: a merged mesh's parts share none) and each part's signed volume read about its middle: a closed part whose
  faces point out encloses a positive volume, one wound inside out a negative one. A part with more than a quarter
  of its edges open, or enclosing under 5% of its box, isn't judged (a card, a cloth, a blade's fuller: a groove
  reads below 0 wound as it is); a mesh drawn by its back faces (the sky) is seen from inside on purpose, and a
  mirrored mesh's winding needs nothing of its own (three turns its front-face test round). A part wound inside out
  on a one-sided material is a problem, listed with its mesh (or its material and colour), its triangles and where
  it is in its model or biome; on a double-sided one it's listed apart (three turns a back face's normal to the
  camera). `--canary` plants a box wound inside out, one sided, in the first biome. Main before #289: 254 parts of
  11 models (every creature's `taperTube`s, the shelf fungi's and caps' lathes, the bow's brass leaf); none since.
- `wall`: how near the hero walks up to the wall (`page/wallGap.ts`; `--biomes`, `--angles 48`). In each biome, at angles round the ring (the gates' openings and those with a prop in the way skipped), he's put 3 m in from the wall's face and walks straight out with the touch stick (`Frame.stick`) until he goes no further out; then rays run out from him at 0.6, 1.1 and 1.6 m, 75° either side of his way, against every surface the biome draws (its culled meshes drawn once unculled first: the lab's frames aren't drawn, and a culled mesh holds only the instances last in view; the grass, the weeds and the pebbles walked through, the thicket's leaves brushed up against), and the nearest, named, is the gap between his body and the wall. More than 20 cm is air between them, under -7 cm his body in it (a banner's hem gives that much); short of the thicket's leaves he may stop 30 cm (their cards are ragged), and in them he may stand up to 8 cm from his middle (leaves give, brushed through; kept off the bushes' outlines, a card hanging low at his thigh came 9 cm from it). A walk that put a joint past its range (the anatomy's warnings it logged, each the first of its kind) is named with them: stopped by the wall in a frame from a run, or sliding to and fro in a corner, his hips went 50 to 100° past their ranges, where an ordinary run's go 10 (`lab gait`). He walks for at most 600 frames: settling into a notch between two bushes took longer than 240. He's stopped once he goes less than 5 mm further out in 10 frames (braked near the wall, he creeps the last centimetres into a corner along a face he met at a slant); a walk that never stops says where he went, every 50 frames. `--canary` reads the first walk's gap a metre short of his stop. Main before the wall was drawn (`world/wall.ts`): he stopped 54 cm to 3.2 m short in the crypt, 14 cm to 2.1 m in the forest.
- `rim`: the hero walked round the wall pressed into it (`page/wallRim.ts`; `--biomes`). In each biome, each way round, he's put 2.5 m in from the wall's line and walks with the touch stick along the ring, turned out into the wall: 40° (pressed in, sliding along its faces and into the gaps between its bushes, rocks and buttresses) and 10° (hugging it, as a player walks along it). A frame he moves more than 20 cm (a run goes about 10) is a jump: the wall threw him. Where he stops (under 5 cm round the ring in 40 frames) he walks back in to the middle, and one that doesn't get 1 m in within 90 frames is stuck; then he's put again a few metres on. Each lap's stops are listed, each with what bounds the floor nearest him there (the mesh, a `wall` or `foliage`, the height it was met at): the crypt's buttresses and gates, the thicket's rocks and bushes jutting in. Kept off each stretch of the line by its side alone, he was thrown up to 1.7 m in a frame 36 times round the two biomes, and stuck once in the forest at 213°; the thicket's rocks and bushes read into that line from the middle, each hid the floor beside and behind it, and pressed in at 40° he stopped 19 to 23 times a lap round the forest, at a square face in the open; kept off their outlines and held from sliding only within 10° of square on, 11 or 12 (hugging it, 4 or 5, as in the crypt). Main's ring at 26.6 m stopped him twice a lap. `--canary` plants a 1 m jump on the first lap and holds its first stop in place: both must be caught.
- `beyond`: the ranger's arrows over the wall (`page/beyond.ts`; `--class ranger`, `--biomes`, `--angles 8`). In each biome, at angles round the ring, he stands 6 m in from the face over the shoulder and looses his basic attack drawn to full, the crosshair on the ground 8 m past the wall and on the nearest tree that way (the forest's, the crypt's dead trees) 1.5 and 5 m up its trunk (from above the aim is the ground under the cursor, and every shot flew low). Each flight is followed till it ends and what it struck has come to rest; every arrow it left standing is judged by the surfaces drawn, not the game's own wall: a ray along it from a metre behind must meet one within 30 cm of its point, and one lying on the floor must have nothing drawn over it (the grass, the weeds and the pebbles aside). An arrow standing in the air or lying inside something is a problem; one that flew on out of the world is listed. `--canary` plants an arrow standing in the air past the wall. Main before #290: 11 of the forest's 18 arrows stood in the air at the wall's line.
- `trees`: the trees in the play area as the ranger's arrows meet them (`page/trees.ts`; `--class ranger`, `--biomes`). In each biome every instance of a tree mesh whose foot stands inside the wall must have a wooden prop's circle at its foot, and an arrow loosed at its trunk 1.2 m up, drawn to full over the shoulder from 7 m off it (towards the middle, or turned round it to a line 0.5 m clear of the other props), must be left standing within 0.7 m of the trunk's line. Then an arrow is stuck in the floor and the arena shows another biome: none may be left. `--canary` makes the first tree stone (its arrow glances off) and sticks an arrow again after the switch: both must be found. Main: no tree inside either wall, and the floor's arrow stayed through the switch.
- `columns`: the crypt's broken columns as built, roll after roll (`page/columns.ts`; `--seeds`, 1 to 12 by default). For each run's seed the columns are rolled (`G.arena.rollProps`) and each one's mesh welded by its positions: an edge only one triangle uses above the shaft's foot is open, a hole the sky shows through. The break's face inside the flutes (0.3 m of the axis) is read for its steepest triangle, which must stand under 75 degrees (its roughness stands facets to 67). `--canary` takes a triangle out of the first column's break: its open edges must be found. Before the fix every column had 3 open edges and a vertical triangle at its middle: the break's slope, taken round by the angle alone, twisted the face about its middle ("still seeing holes in concrete pillars").
- `shadows`: the hero's shadow cast as one (`page/shadows.ts`, `models/castAsOne.ts`; `--views`, `--canary`, `--cost`). In each way the hero holds his weapons, in all his armour and in none (the merged mesh made again between), and in each view, the frame is drawn with his pieces cast as one and each alone, after one drawn the other way, and compared pixel by pixel; the frame drawn alone twice is listed beside it (none apart). A piece cast as one passes through other float matrices (its bone's), so a shadow's edge moves by a texel here and there: up to some 250 pixels by 16 levels (the dual-wielder over the shoulder) pass, more than 600 or by more than 24 fail. It caught the merged mesh hidden for the frame it was made again (1.7k to 3.3k pixels top-down, by 56 to 133) and the body cast through the eyes (86k to 112k pixels by 38: three makes a skeleton's matrices again as it draws, over bones zeroed before). `--canary` moves the pieces' shadow 30 cm by the mesh's bind matrix: it must be seen. `--cost` times the shadow map's draw a frame each way and with the hero casting nothing, in turns, the GPU let finish after each frame; read it as a lead only: the lab's frames run back to back, and its readings moved by a millisecond with the turns before them. The frame's cost is the installed Chrome's: `npm run stalls -- --url "this,this?castAsOne=0" --rounds 4 --js` (#270: the shadow pass 0.1 ms cheaper for the ranger and the mage, the warrior's within the noise).
- `weapons`: each of the hero's weapons alone (`page/weapons.ts`; `--weapons Sword,Maul`, the class's bases by
  default): a copy of the one in his right hand, at its own frame (unturned in the fist), put in a plain, lit
  studio of its own and pictured face on (a blade's flat, an axe's bit to the side), edge on, from behind (a face
  wound inside out shows there as a hole), from three-quarters and its head close up, each framed on its own length
  and width, with its size and how many triangles it's drawn with. A weapon is judged here as it's made, before
  it's seen in a hand. Its pictures are read from the drawing buffer and taken as opaque: the game draws its frame
  with an alpha of 0 (`core/hdr.ts` adds it to the page as light), and copied onto a 2D canvas every picture came
  out black; and the lab draws nothing outside its pictures (`Lab.drawing`). A picture with next to nothing of the
  weapon in it is a problem, and `--canary` pictures an empty studio, which must read as nothing drawn. Compare a
  change to a model with `--ab`. The studio, its camera and its pictures are `page/studio.ts`, which `hands` shares.
- `hands`: the hero's right hand alone (`page/hands.ts`): a copy of it on a wrist of its own (`handLike` in
  `models/hands.ts`), in its glove or bare as the hero's is (`--glove`, `=false`: bare), laid flat, open, relaxed, in
  a fist and closed round a handle of a sword's grip (`--poses`), from the back, the palm, the thumb's side, the
  little finger's, the fingertips and three-quarters (`--views`), and close up when asked for: `cuffs`, the glove's
  cuffs over the fingers, and `web`, the thumb's web (where a bent thumb once pressed the glove into the skin). Said
  beside it: its length, breadth and thickness against a man's (anatomy's tables: 10.9% of his height, 46% of the
  length, 38% of the breadth) and each finger's length against the middle's, the triangles and meshes it's drawn
  with, how long a side takes to sculpt on the page, and whether both sides were sculpted by workers as the game
  loaded (one sculpted on the page is a problem: it held the boot up). `--look` draws it in a look (wire, faces,
  parts, bones), and `--canary` pictures an empty studio, which must read as nothing drawn, and builds the hand 10%
  larger, which must measure so. On `--ab` against a game whose hands were pieces, the old hand is built again from
  the materials its pieces were made in (`userData.own`).
- `hood`: the mage's hood against its reference, by numbers (`page/hood.ts`), as tuning it by eye didn't converge (one
  change to its cut reshaped the whole of it, and four reviews in a row failed it). Its outline: the hero taken into
  the studio and drawn flat white from the front, his left and the back (what he holds hidden), and the reference's
  figure cut from its plain backdrop (`--ref <marks.json>`: each view's picture beside the file, with where its eyes
  and chin are, shares of it, and the sizes below as `"sizes": { "brim": [least, most] }` in cm where the reference
  was made to others than the first's), both read on one grid in the face's unit `E` (the eye line to the chin; ours
  from the head's anatomy, `toGroup`): how much of the two outlines is shared, how high it stands over the eyes, and
  its width (from the side, its reach ahead and behind) at the crown, the temples, the chin, the nape, the neck and
  the shoulders, ours beside the reference's, with each view's pictures cut to that window (through a 6° lens: at the
  studio's 20° the hood's back, 20 cm nearer the camera than the eyes the scale is set at, read 10% wider) and the
  outlines laid over each other (both white, the reference's alone red, ours alone green); its fullness held to the
  reference's within 0.1 E at the chin (from his left how far behind the eyes it reaches, and at the nape; from the
  back how wide: pulled in to the neck, it read as a shell where the reference's cloth hangs loose behind the head and
  gathers at the nape, "do you see bagginess in the ref? where is ours?", and cut fuller, as a sack; below the nape
  it's the capelet's, read, not held); and the head under it in the same unit (its scalp's height, its brow ahead of
  the eyes, its skull's back behind them and its half width at four heights), so the reference's outline reads as how
  far the hood stands off the head (the mage's snug hood was laid out from it). Its shape on the head, from its cloth
  (`HoodCloth`'s `userData.grid`) and the face's skin: the rim ahead of the brow and of the cheeks and out from the
  cheeks, the point above the scalp and the capelet below the nape, each against the sizes the reference was made to
  (its marks' `sizes`; the first reference's, from its modelling notes: 6-8, 4-6, 4-6, 5-7 and 16-18 cm), outside them
  a problem; and how far its top half moves from its standing shape over a walk (more than 4 cm, a tip flipping, is a
  problem). Its opening round the face from the front and his left (`page/hoodOpening.ts`; laid close to those sizes
  and that outline, the hood still hid the face as a tunnel, and neither read it): where its rim crosses each 0.2 E
  from 0.6 over the eyes down to the throat (-1.4), ours from its cloth's edge and the reference's from its piping
  (each row scanned in from the backdrop to the first run of its pale gold, past the seam's on the outline from the
  side; its reads drawn as dots on the pictures), the rim's stand-off from the face shown, and the face shown (E²,
  ours drawn flat with the skin white, the reference's by its skin's colour inside the rim). From the front ours more
  than 0.1 E from the reference's rim from 0.4 down to -1.4 (flared out below the chin, it read as a funnel), from his
  left the face shown ahead of its rim more than 0.05 E from the reference's from 0.4 to -0.8 (the reference's brow,
  nose and chin stand further ahead of its eyes than ours: laid where its rim runs from the eyes, ours hung over the
  brow, "do you see hood overhang in our case?"), or showing less than 85% of its face, is a problem. The seam down
  the back: how far it strays aside from straight, standing and walking (0.3 cm at most; the Z a review saw at the
  nape was the gathers' depth seen from above, not the seam). And the capelet's lie read again as he walks, every 15
  frames (standing it lay clear; walking, the coat's stitched shoulder seam came through it as the arm swung). And how
  deep his body comes through the hood above the capelet, from below the jaw to the join, standing and walking
  (`page/hoodLie.ts`; the harness straps' tops came out through its front below the jaw, where the capelet's reading
  never looked, "cloth should not clip through hood"): looked for within 6 cm out along the cloth's normal, a surface
  met counting where it faces the way the cloth does (in the gathers' valleys at the nape the normal turns down, and
  from 15 cm out its ray met his back from below, and a brass fitting); more than 0.1 cm is a problem, as through the
  capelet (at 0.3, the coat's front of the shoulder stood 2 mm out through it and passed: what's read is the cloth's
  outside, so anything through it shows). `--canary` makes the hood 0.7x as wide, which the rim's clearance, the front
  outline's width at the temples, the back's at the neck and the opening at the eyes must read; moves it 2 cm forward,
  which the rim from his left, the face shown ahead of it and the face shown must read; makes it 0.8x as deep, which
  its reach behind at the chin from his left must read; sinks its front below the jaw 5 cm into him, which his body
  through the hood must read; and puts a point of the seam 1 cm aside, which its straightness must read. `--edges`
  lists each view's outline every 0.2 E down, ours beside the reference's (its edges; from the side, its reach ahead
  of and behind the eyes): five levels didn't show where the side's parted from the reference's. Writes
  `out/hood/sheet.png`.
- `turnaround`: the hero standing as the game has him (its set-up: `--class`, `--gear`, `--wear`), taken out of the
  world into the studio (`page/turnaround.ts`, `page/studio.ts`) and pictured as a character sheet's turnaround shows
  him: from the front, three-quarters to his right, his right side and his back, framed on his whole figure with what
  he holds, and his head close from the front, his right side, three-quarters to his left and behind (a hood is judged
  all round; from his right front the staff came between), with how many triangles and meshes he's drawn with.
  `--ref <sheet> --panels l,t,r,b;...` cuts a reference sheet's panels (shares of it, one a view in that order; an
  empty one leaves its place empty) and sets them in a row under ours, each fitted whole into a tile the size of ours.
  A hero is rebuilt against such a sheet part by part from the same side (the mage against Codex's realistic render
  of him: in the forest the ferns and the light hid what he wore). `--canary` pictures the studio empty, which must
  read as nothing drawn. Writes `out/turnaround/sheet.png`.
- `neck`: each hero's neck (`page/neck.ts`; `--classes`, `--dresses bare,chest,hat`, `--poses rest,aside`), cut
  by level planes in the neck joint's frame and read up 72 lines round it (`neckSlices.ts`; what each says against
  its limit, `neckRead.ts`): ridges and shelves on the free neck (the column's flat top was a ledge under the
  ranger's ears, #261), the step and paint dE where the head's skin meets the neck's, the narrowest girth against a
  man's (0.69 of the head's), skin come out through the clothes, and lines of sight into a loose collar as steep as
  the game's cameras look that meet nothing (`neckGaps.ts`). Pictured close from six sides. `--canary`
  (`neckCanaries.ts`) plants a ridge, skin over the collar, a paler wider neck and a neck stopping short in a loose
  collar; each must be caught.
- `hall`: the hero in focus in the hall of heroes (`page/hallMoves.ts`; `src/game/hall.ts`), the lab's run left
  for the lobby and Change hero clicked: his showcase and the stand after it, 480 frames, each hand, elbow and the
  weapon's tip in his own frame, and each jerk: its move a frame changing by over 12 cm from the frame before (a
  jump, a stop or a start in a frame), 40 cm while the weapon flies (its tip 25 cm a frame or more, this frame or the
  two before: a blow speeding down and coming to rest), the tip's by its speed (0.7 of its larger move, at least
  20 cm: its arc turns its way by about its speed squared over its reach). `--gear` and `--weapon` put the weapon in
  his profile, which the hall dresses him from; `--frames` lists each jerk with its action and its moves; the canary
  turns his right shoulder for a frame. From play: "warrior arms jerk in various poses after he finishes power
  strike, in char selection screen". The hall's heroes are remote copies beside the lobby's own hero, hidden but
  still posed, which `range` never saw: the warriors shared the way back's state (`DRAWN_*`, `BACK_*` at the module's
  top), and the hall's went back to its guard from where the lobby's hero had drawn his weapon, the axe's tip 2.2 m in
  a frame. Found with it too: the first frame of the landing's hold turned the arm 65 degrees down onto the stage
  under the plinth, the hands 84 cm; the left hand onto the haft off the shoulder in a frame, 39 cm; the way back
  into the guard stopping dead, the lift onto the shoulder and the move off it starting at full speed. Then the hall
  is opened again and left by Back 1 s into his showcase, and any oscillator still not told to stop 60 frames on in
  the lobby is a sound left playing (`page/soundsLeft.ts`); its canary starts Void Lance's hum there and never stops
  it. From play: "if mage was attacking in hall of heroes, going back to lobby keeps the attack sound": the hall
  closed with his channel open, and its hum (3 tones) played on.
  `--glow` (`page/hallGlow.ts`) reads the light round the weapon's tip instead, the mage's staff's crystal, frame by
  frame from his showcase on (540 frames, the camera's flight in left out), read back from the frame drawn as the
  player sees it: a box 0.5 m across there, its share near white (0.75 of white), its mean light, the median frame's
  and the brightest against it, the flashes of its mean in any second (`page/flashes.ts`), and its mean every 0.25 s;
  and how much of it glows (its pixels' brightest channel 0.1 of white or more, the crystal and its halo), the
  median frame's and the largest against it, every 0.25 s; pictured round the staff's head at its brightest, at its
  largest glow, at its dimmest and as he stands after his showcase (`--pictures=false` for none). It fails on any
  frame over 0.25 of white, the brightest over 3 times the median, over 2 flashes a second, a glow over 1.25 times
  its median frame's (a flare) or under 30% of the box the median frame (a flat stone). By its brightest channel,
  not its luminance: a saturated pink's luminance is a third of its red, and a facet's flare that doubled the glow
  moved the box's luminance by a few hundredths. From play: "in hero selection screen, the staff's light is too
  bright when its flickering, pls lower": raised, the crystal came within 0.86 m of the hall's key light, which lit
  its glossy facets white (main's brightest frame 0.34, its glow flaring 1.53 times on 84 frames); then, lit less,
  "it still flickers bright, but most of the time its completely boring" (its glow 25% of the box, flaring 2.1 times
  as a facet turned to the light every 0.7 s). Now it's lit by its own light: its faces under the bloom's threshold,
  and a halo and a hot core of its own (`HEAD`, `HALO`, `CORE` in `src/game/hall.ts`).
  Its canary lights the crystal as main lit it, its colour its glow's hue.
- `glance`: the hero's casual look round as he stands idle (`page/glance.ts`, `page/glances.ts`; `models/glance.ts`),
  read from what's drawn: the head's turn from the chest and the eyeballs' in their sockets. He stands `--seconds` (40)
  in the countdown: each glance (past 10°, one carried across joined), their spacing (never a loop, none within 1.5 s
  of the last), the most turn (a neck's 80°), the fastest (200°/s), each jerk (a move a frame changing by over 0.6°),
  the eyes leading every glance, a strip of the first and what `Glance.update` costs. He walks and attacks from the
  middle of one (back ahead in 0.8 s, none after, the way back's jerk against the same walk's with no glance: later,
  the steps jerk the head 3 to 5° on main too), stands through the eyes (none), in the lobby (one at least) and is
  shown in the hall (none before his showcase is done, one within 10 s after). The canary kicks the head 3° for a
  frame and lets him glance as he walks. The owner's words: "when idle, characters should look left/right casually".
- `poses`: the hero's pose a move at a time (`page/poses.ts`): he stands (60 frames), walks ahead (90), strafes
  with the attack held (90) and stops (90), and after each frame every object of his model (its world matrix) and
  every point of the geometries that move (positions drawn as `DynamicDrawUsage`: the cloth, a bowstring) is folded
  into a digest by the bits of each number, a line a move and one for all; then his model's `animate` timed each
  frame by the browser's clock (median, 90th percentile, in all), lines that differ from run to run. A change made
  to cost less poses him exactly as before when `--ab`'s digest lines agree, and its time lines say what it saved:
  a clip or range measure's lines agree for changes far past the last bit, and a gait's later strides go elsewhere
  after one (`check`'s offsets). `--canary` moves a number of the last frame by its last bit, and the digest must
  change. Run it with each `--gear` a change can touch (a hero's arms are fitted per weapon style).
- `coat`: the hero's skirts and hood (`page/coat.ts`; `models/armor.ts` `Skirt` and `models/hood.ts` `HoodCloth`,
  found by their geometries' names, 'skirt' and 'hood', or a commit from before by the ranger's mesh's, 'tunic hem') as
  he stands at idle in his head item and body armour, `--seconds` (5 by default): every point of the cloth in its own
  space, a skirt's hung from the hips and a hood's from the head, so his sway is taken out, and each jerk, its move a frame
  changing by over 1 cm, with where on the cloth and the hand nearest (or, with none, the most any point's did);
  `--frames` lists them; the canary kicks a point out 3 cm for a frame. He stands once at each of `--rates` (60 and
  144 Hz by default): the cloth steps at 1/60 s, so on a faster screen most frames step it none and some once, which
  a 60 Hz clock never shows. From play, "the hood is jerking when idle": held firmly and damped as the free cloth, it
  rang every 0.2 s, at 144 Hz on 34 frames, up to 1.2 cm, and at 60 Hz on none; damped critically, 0.1 cm at most. From play: "ranger has a clothing bug, behind that right arm, in idle", "you should observe
  3-5sec of frames to see it moving unnaturally", "under left arm/hand too, but less": each point a hand or the bow
  reached was put round onto its far side, so as the idle swayed them points jumped by a hand's width, the coat on 224
  of 300 frames, up to 11.2 cm; now none over 1 cm. The mage's robe jerked 1.7 to 2.5 cm on 8 frames by the waist at
  its sides, a line down the cloth from a point inside the thigh's top put round onto the thigh once its deepest moved
  a hair off that point (`Skirt.over`); now none over 1 cm. The warrior's mail shows only with body armour on, which
  the set-up doesn't give him.
- `held`: every held skill of the hero's class: in full in [`commands/held.md`](commands/held.md).
- `draw`: every drawn shot of the hero's class drawn to full and held there as the player holds it (`page/draw.ts`,
  `--class ranger`), in the top-down view, over the shoulder and through the eyes (`--views`): the key held over an
  aim ahead, 120 frames at full draw, and let go. Every frame its motes on the arrowhead (`fx/glintMotes.ts`, on the
  model's `arrowHead`) are read, with nothing drawn, drawn short of full and held at full. Every 4 frames of the hold
  (28 moments: the motes move, and judged at four, their worst went unseen) the glint is judged as the player sees it
  (`page/addedLight.ts`: the frame drawn with it and without it round the arrowhead, only that box read back, the
  pixels it lit by a tenth of white and its glare, those it lit by 0.4, in patches, `page/patches.ts`), the least it
  was seen and the most it glared. A glint before the draw is full (it's the sign that it is), on fewer than 90% of
  the frames held at full or gone for more than 20 of them, one with nothing drawn, a glint lighting less than 0.35 in
  10,000 of the frame's pixels in any view (as glow particles it lit none through the eyes; Briarflight's over the
  shoulder lights 81 to 83 pixels of a 1920x1080 frame, 0.4, as what stands behind it changes), the hero's own light
  (`Player.staffLight`, the class's aura) lit with nothing drawn or on fewer than 90% of the frames held at full (a
  ranger's is lit at full draw alone: lit always, "why ranger emits light from bow on idle"; `--canary` lights it
  always), a patch of glare over
  0.55 in 10,000 (a star of light on the arrowhead glared in one of 0.64 to 3.6, and was too bright, and motes bright
  enough to bloom merged into blobs of 0.9 to 1.6; the motes' specks are 0.41 at most) and a shader compiled meanwhile
  are problems. In the close views the crosshair is read every frame too (`page/crosshair.ts`: its lines' thickness as
  the page's styles draw them, and its animations): bold held at full draw on 90% of the frames, on none before it or
  with nothing drawn, and one beat into it, run once and swelling about its middle, which moves no more than half a
  css px from where it was at the beat's height and once bold (centred by `transform`, it swelled about where its box
  was before that and moved 10 css px up and left; the page's motion is let run meanwhile, `lab.reduceMotion`); with
  motion reduced it comes to bold with no beat. `--pictures` (on by default) pictures each shot held at full at its
  most glaring moment, the screen whole and its arrowhead close, and the crosshair as it's drawn, at its beat's height
  (held there: the beat runs on the page's clock) and bold, into `out/draw`; `--canary` shows the glint and the
  crosshair's bold from half the draw, takes them away once the draw is full, swells the crosshair about its corner,
  and leaves the motion on for the reduced check.
- `shots`: the hero's basic attack loosed at a boss with its foes packed round it (`page/shots.ts`, `--class
  ranger`): each biome's boss with its summons and two of its commonest foes beside it (`held`'s `bossWithSmall`,
  the hero at 12,12 unless `--at` says: from the lab's own spot, 25 m out, they stood 7 m on in the thicket, and once
  the wall was what's drawn it put them back by him),
  their life raised so none dies, in each view (`--views`). `--shots` points (12 a view) are taken from `held`'s grid
  over the foes on the screen, half over the boss, none at their feet (an arrow there goes into the floor first);
  before each shot every foe is put back where it stood (the shots knock them off their places), the point is taken
  again at its spot on the screen (the foes sway), the crosshair is turned onto it in the close views and the bow
  drawn to full over it and loosed. Its flight is followed frame by frame, each frame's step (by the arrow's point,
  half its length ahead) looked along for the first foe drawn on it before the frame runs, as the game meets them:
  against the bodies as last drawn (looked along after the frame, the foe it struck had flinched off its line). It
  must strike that foe and it alone, or none if its flight met none; and one aimed inside a foe on the screen as
  it's loosed (the foe drawn 6 pixels round the aim every way) must meet a foe, the one aimed at unless another is
  in the way. One aimed at an edge may go past it: a pixel off, or the body swayed a centimetre, the aim is past it.
  A basic attack that doesn't fly at the point aimed at (the mage's seeking bolt, level at the hand's height and
  struck within its circle) is said so, as a problem: there's nothing to judge. `main` failed 56 of 72 shots (the
  bosses' crowns and arms flown through, imps struck in the air beside them, shots at a boss's legs striking the
  imp whose circle they passed). `--canary` makes the first shot's foe invulnerable: struck, it takes nothing, and
  the shot must be found missed.
- `gear`: full sets of gear rolled for every class as its loot rolls them (`page/gear.ts`, `--sets` each, 400 by
  default), at each tier (`--tiers`, a rarity at an item level each: `magic@5,rare@15,epic@30,legendary@50`), and
  what a set gives on average: Health (his own and the gear's, and the gear's against the mage's), regeneration a
  second, the draught's heal and how much it multiplies his damage (as the game's damage stats add up on his
  skills). A class whose Health or regeneration from gear is out of the order of his own Health is a problem;
  `--canary` rolls the ranger's Health from gear as the mage's.
- `music`: each biome's music played through as the player hears it (`page/music.ts`, `--biomes forest,crypt` in
  turn). Each round goes through the biome's lobby, a run's countdown, the first wave's fight and its win, the next
  wave's countdown and fight, the tab hidden and shown again mid-fight, and the bank back to the lobby. Every frame
  is judged by what the game sends to WebAudio (each buffer source it starts, `page/musicTap.ts`) and by what each
  track's output carries (an analyser on it), not by the music's own bookkeeping (`page/musicJudge.ts`). These are
  problems:
  - a track rising where another is wanted (`EXPECTED`, the owner's choice for each place: the lobby's track in the
    lobby and between waves, the battle track through each fight);
  - a level that moves faster than a 0.75 s fade;
  - a fresh track that doesn't start at its top, or a track coming back elsewhere than where it was left (the
    lobby's after a fight, the battle's in the next wave, either after a hidden tab);
  - a source looping off its track's loop, or past its samples' end;
  - a battle track not decoded within the run's countdown;
  - a track kept decoded while it's silent and wanted nowhere;
  - a track wanted at full that carries less than -45 dB (listened to for up to 4 s, as a piece may open near
    silence), or a silent one, or any in a hidden tab, that carries anything.

  `--canary` plays a round again with four faults planted: the biome's battle track played as another's, the
  lobby's fade in cut to a twentieth of a second, every fresh track started 5 s in, and every track coming back
  started from its top.
- `eval <expression>`: an expression evaluated in the page, with `lab` in scope (`eval "lab.player.nocked"`). One that
  hasn't settled in 60 s is given up, with an error (a `requestAnimationFrame` waits on the lab's frames, `lab.step`:
  awaited, it never settled, and held up every command after it till the server was stopped; the browser's next
  frame is `window.__labClock.realFrame()`). `live eval` is given up the same way.
- `live <step>`: a page of the game kept between steps, each on the state the last one left, as a modelling
  tool's scene is kept between edits (`node/live.mjs`, `page/live.ts`; needs `lab:serve`). `live start` boots the
  hero (`--class`, the warrior by default), on `--screen`'s screen if it's given (a phone's, `832x384@3.75`: its
  layout and the touch controls' scale), and sets him up (`--view`, `--gear`, `--weapon`, `--at`, `--facing`);
  then `live picture` pictures him from `--views` (through the eyes `eyes`, else `third`, by default; `screen`
  the whole page as the player sees it, the HUD and the touch controls over the frame) in any
  `--look` (a close-up from `--distance` m off what it's framed on: 1.7 from a joint, 4.3 from the body by
  default, or a place in the world, `--on x,y,z`: a prop, the views turned by the hero's facing), with a reference
  laid over each picture and stretched to it (`--over <picture> --strength 0.5`) and a part of it kept (`--crop
  0.5,0,1,0.6`, its edges as shares), each in its own file in `out/live/`; `live inspect [name]` lists the hero (or a joint, or any object by name: the warrior's weapons and shield are named)
  and what's under it (`--depth`), each with where it is in the world, how it's turned, what it's drawn with and
  where its posed vertices are on the screen; `live eval <expression>` evaluates on the page (`lab` in scope: a
  joint turned, a value set); `live frames <count>` runs frames with no input; `live log` lists the steps;
  `live stop` closes it. A picture takes under a second where a command boots and sets up for each look. The
  steps are kept (`out/live/steps.json`, `node/liveLog.mjs`): when the source changes, or the server starts again,
  the next step boots the page again and replays them first (every `eval` is kept, a read too: `live start`
  begins again). It runs in a browser of its own, as a command's page lost the input to a second page in the same
  one. It's for trying by hand: what's found there is measured by a command on a page of its own, as the live
  page is wherever its steps took it. `live picture --canary` hides the hero and pictures him in the `parts` look
  too, where no part of him may be found.
- `status`, `stop`: what the server serves and has booted; stop it.

**Looks** (`page/looks.ts`, `--look` on `sheet` and `live picture`, `CaptureOptions.look`): `lit` is the frame as
the player sees it; `wire` the hero's wireframe; `faces` which way his faces point (front blue, back red, shaded
by how square each faces the camera: a face wound inside out shows red; a hair card's back does too); `parts` each
of his meshes in a flat colour of its own, and a note of each in the picture, the most first, with its share of
it and its box (named by the nearest of it and its parents with a name, a joint's or its own, and its material);
`bones` his skeleton drawn over the lit frame. The first three draw outside the game's chain and read the
drawing buffer back as opaque (`page/pixels.ts`), with the world in its own materials but only its depth: what
the game draws in front of him (a leaf card cut out by its texture, a prop dissolved round him) still hides him.
(Drawn flat, the forest's leaf cards were whole squares, and one by a close-up's camera filled its frame.) A
part's cut-out (a hair card's) keeps its texture's alpha. A pixel is found as a part by its colour within 2 levels
a channel, looked up once (matched against every part's colour, a picture took 10 s).
- `pwa`: a deploy as a returning player meets it, the offline worker and all, which the lab's dev server never has
  (`node/pwa.mjs`; it runs in this process, not the server). Another commit's production build (`--from[=ref]`,
  origin/main by default, exported as `--ab` exports it) and this tree's are built with Vite into `out/pwa/`, and
  served in turn on 127.0.0.1 under `/last-stand/` as Pages serves the game (`node/staticHost.mjs`: `max-age=600`,
  revalidated by ETag, what it serves swapped at once, as a deploy swaps it). A fresh browser loads the old build
  twice (its worker installed, then the page and its fonts fetched through it); then this tree's build is served in
  its place and the page reloaded as a player reloads it: under the old worker, again once the new one has taken
  over, and offline. Each load is known by the worker that served it (asked as the page starts, before a new one
  takes it over: a load under another than it's for measured nothing, a problem). Every load must show the game's
  fonts (a face of Cinzel and of Alegreya Sans loaded), every load after the swap this tree's build (its entry
  script: a plain reload must show a new deploy), and each of this tree's loads the labels' lining twin
  (`overlay/paint.ts`).
  Then the installed app: this tree built twice more as a PR's preview builds (another commit stamped in each, so
  another bundle and worker's cache, as a PR's are), served in their folders under the site
  (`pr-preview/pr-1/aaaaaaa/`, `bbbbbbb/`) and visited in turn, each its worker installed; then the app opened
  offline at its start (production's cache must have outlived the previews' workers), at the first preview's
  folder pruned (a game must show: its worker's cached build, or this tree's by the 404 page) and at a closed PR's
  build never served (the build's `404.html` answering it, as Pages does, must send it to the game at
  `/last-stand/`). Under main's worker the offline start fails.
  `--canary` serves a stale page on the first reload after the swap and the font stylesheet's address broken after
  it, deletes production's cache before the offline start, and answers a missing path with a plain 404: all four
  must be found. About 40 s to 100 s (the canary's two and a half minutes: its waits run out). (The owner's
  installed app on their phone opened Pages' plain 404: it was left on a PR preview's build, pruned since, and the
  previews' workers had deleted the caches that would have shown it.) (The owner, of #263's preview:
  the page's font stylesheet had been asked for with CORS, and the previous deploy's worker answered with the copy
  it kept from a request without, which can't answer one with; the stylesheet failed, and the lobby showed the
  system's fonts, wider, its links wrapping: "increasing font size had unintended side effects".)
- `check`: every hero's checks of a change to how they move, side by side: in full in [`commands/check.md`](commands/check.md).

Options every command run on a page takes:

- a probe or command that doesn't compile says where and why (`.tmp/x.ts:3:10 doesn't compile: Unterminated
  string`), not the browser's "Failed to fetch dynamically imported module";
- the set-up (sheet, carry, probe): `--view top|third|first`, `--at x,z`, `--facing rad` (held in every view: the
  close views' camera turned to it, as through the eyes the hero faces where it looks), `--nocked[=false]`,
  `--gear oneHanded|shield|twoHanded|dual` (the hero holding his weapons that way, from his class's own bases: as the
  profile rolled them by default), `--weapon` the base held so (with `dual` one in each hand);
- `gait --films=false`, `form --pictures=false`: the numbers alone, each run once (a film or a picture runs it
  again); `gait --offset n`: each scenario's first move n frames longer, its later turns and stops at other
  points of a stride (a check's starts);
- `--class ranger|warrior|mage`: the hero (the last one used by default);
- `--screen WxH[@ratio]`: the page put on a screen of that size in css px and pixel ratio once it has booted (`1280x720@3`:
  a 4K screen at 300%), as a window moved onto another monitor is: the game fits its canvas to it on the next frame
  (1920x1080 at 1 by default);
- `--insets left,top,right,bottom` (with `--screen` or `--screens`): the screen's safe-area insets in css px, as a
  phone's camera cutout gives them to the page's `env(safe-area-inset-*)` (DevTools' `setSafeAreaInsetsOverride`):
  `ui --states hudTouch --screen 832x384@2.8125 --insets 34,0,0,0` is the owner's S25 Edge held sideways;
- `--screens WxH[@ratio],WxH[@ratio]`: this tree on two screens, one after the other, compared as `--ab` compares two
  commits: the lines that differ, and the pictures pixel by pixel (both 3840x2160 for a 4K screen at 100% and 300%);
- `--ab[=ref]`: also on another commit (`origin/main` by default), its results beside this tree's, ending with the
  verdict: the lines that differ under the section each is in, and the pictures that differ by more than the GPU's own
  noise, with where (the region of each, and a picture of each in `out/ab/<command>/`: this tree's dimmed, its
  differing pixels magenta). A commit compared with itself (`--ab=HEAD`) agrees, so the other commit's side is kept
  once it has run (`out/ab-cache`, by its commit, the hero, the command and its options, and a hash of the lab's code
  that command runs: the page modules its entry reaches, its Node entry and what that reaches, the browser's scripts,
  `side.mjs` and a probe's own files, `node/labCode.mjs`) and read back after: run again each time, main's side was
  half of every A/B, and keyed on every file of the lab, a change to one command's measure ran every command's other
  side again. `--fresh` runs it again; a side whose page raised an error isn't kept;
- `--profile`: where the command's time went in the page, its busiest functions by their own time and in total,
  each at its line in the source; `--profile=<function>` (its name, or its name and file: `"--profile=animate
  ranger.ts"`) lists only the time in that function, by its share of it (the busiest 14 of a whole profile left the
  ranger's animation, 2.7 ms a frame, unexplained);
- `--tune name.field=v,...;...`: the game's tunable values (`src/core/tuning.ts`) set before the set-up;
  `name.field[i,j]=v` sets those numbers of a list alone, the rest as they are (a swing's keys, six numbers each:
  `warriorSwings.twoBack[41,47,53]=40` the roll of its last three keys);
- `--sweep target=a|b|c[;target=...]` (`node/sweep.mjs`, on the lab's server: `npm run lab:serve`): the command run
  once for each value of a target, a `--tune` path or some of its numbers, and for every combination of several, each
  set over the `--tune` given; each run's problems listed in full under it, then the runs with the fewest, exiting 0
  when one had none (keys tried a dozen ways by hand, each run's output filtered for its problems, missed the speed's
  three failures on the runs the filter called best);
- `--randoms`: what drew the page's random numbers as the command ran (`node/randoms.mjs`): the draws in all and the
  busiest callers, each at its line, and with `--ab` the callers whose draws differ between the sides, the smallest
  differences first. An A/B's pictures of anything random (particles, sparks, motes) differ after the first draw one
  side made and the other didn't: drawn in crowds, the foes' skeletons never made the bone textures three makes as a
  skinned mesh is first drawn, four numbers each for their ids, and every mote after them lay elsewhere;
- `--layers`: the page's composited layers at each screen picture, as Chrome drew them (`node/layers.mjs`): each
  layer's element, its box and why Chrome made it a layer, and with `--ab` the layers the sides didn't share, picture
  by picture. Two sides whose pictures differ only in how bright the UI's thin lines are, nothing moved, were
  rastered two ways;
- `--watch`: run it again each time the source changes, on the page booted for the change, until Ctrl+C.

A misspelt option or a bad value stops the command before anything boots (`carry takes no --canry (did you mean
canary?)`). The exit status is 1 when the command failed or found a problem: an error in the page, or a problem its
result reports (a canary the measure missed).

