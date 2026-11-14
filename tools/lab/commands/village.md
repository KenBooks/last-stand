# `village`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`--since ref` (`--since origin/main`) runs only the checks the files changed since `ref` can touch, committed or not (`node/villageSince.mjs`: the fog's file its fog checks, a check's own module its checks, the village's own files every check; the lines it prints first say which and why): the run for a change in progress, the whole suite kept for before a push.

`--only names` runs the checks whose names have any of these in them (`--only lampsAlike,hallWalls`; the names are
the check functions' in `page/village.ts`): the whole takes minutes.

The chest's lid is read off the object drawn (`page/villageChestLid.ts`: from play, "stash chest should open when I
approach it, and close when I move away"): shut far off and in the hall's door beside it, open at its stand, shut once
he has walked off; `--canary` keeps him far off where it should be open.

`village`: the lobby's village as a player walks it (`page/village.ts`; `src/game/village.ts`), the run left for
the lobby. Each check in turn: every object (the portals, the chest, the hall, the campfire, the chronicle, the ghost by the yard's gate, the
notice board) used from where the hero stands to use it, and what it opens shown; the notice board and the
chronicle used by E, put away by their own button and used by E again where he stands, and put away by E itself
(`page/villageUseAgain.ts`: from play, "when I press got it, I cannot press E again until I move away", the notice
board and the campfire held as open until he walked off; `--canary` leaves the second press out); his skills armed
in the training yard and not on the square; straight walks out from the square at angles round it, and along each
way out, stopped inside the palisade or the way's walls; walks along each way at its portal, through its middle
and round its sides, stopped before it (from play: "for village portals, I should not be able to walk past
them"; the commit before its walls let six of ten past); walks on the terrace at the hall's side walls and its front
beside the door, the first surface drawn ahead of his middle at a knee's height at least 0.15 m off
(`page/villageHallSide.ts`: from
play, "can pass through textures here", the plinth course along the hall's foot drawn and not in the wall;
`--canary` counts him half a metre further); the hall's front wall's blocks of walling, their maps read at each corner
against its place, one grid at most 1% of a tile apart (`page/villageWalling.ts`: from play, "misaligned texture",
the block over the door a part course off the wings, 45%; `--canary` moves one block's map a third of a tile); at 9:30
from the middle of the hall turned to the dais, the hero hidden, at least 0.9% of the frame lit by the sun, drawn with
it and without it
(`page/villageWindows.ts`: from play, "windows need to be real, and let sun/moonlight through"; with them shut
0.58%, open 1.38%; `--canary` draws both without the sun); through
the eyes on the square, the view tilted from over level down toward the ground, the grass's rings' middle (`focusOf`
in `world/meadow.ts`) moving at most 2 m a frame (the old rule
threw it 22 m at a sight just under level: "grass a near circle that keeps updating in front of me"); over the
shoulder at noon by open meadow, the meadow's blades drawn alone twice, the rings' middle moved 2 m ahead between
(`page/villageGrassRing.ts`, `moveMeadowFocus`), each metre's band's grain (the light's step between blade pixels
side by side) changing by at most 15% (from play, "the circle of changing grass is still there... and it keeps moving
as I'm moving": the far rings' wide blades, drawn whole, changed it 30 to 33%, cut into strands 9%; `--canary` draws
them whole); sent across
each cottage to a spot behind it, and from each portal to every other object's stand, as a place picked on the map
sends him (`goTo`), there within 600 and 1500 frames (walked straight at the spot, he ran into a cottage and stood
there: "map waypoints dont work, when path is long and curved... it just runs into obstacles"); every kind of light
the village has at midnight (a street lamp's lantern, a hall torch, a cottage's window, and each of its own ten
point lights: the portals, the hall's braziers, the stair's lamps, the campfire, the chronicle's candle; and the chronicle's book at midnight and noon, which burned white under the porch's torch),
stood by from a few metres off and looked at in each close view, its pixels read back from the frame
(`page/villageLights.ts`, each pictured in the close view in `out/village/sheet.png`): over 12% of its box blown out
(its brightest channel past 0.97) or 2% of the ring round it out to 2.5 times as far fails it as blinding (from
play: "lights too bright, can't see geometry even", "we should always check all lights for blinding": the lantern
read 18.6%; a new kind of light gets a case there); the pool's lights lit at midnight with the hero standing
still, none changing by over 1% a frame (`page/villageSteady.ts`: from play, "lamps have high frequency flicker",
every pooled light shaken by a random tenth a frame, 10.1%; a fire's own light swells with its flames and isn't
read; `--canary` shakes one by a tenth); a street lamp's ground read from one camera over it with the hero 24 m off
and 4.5 m off, the point lights' shadows held off, within 8% (`page/villageLampsAlike.ts`: from play, "I dont like
when lights change from low quality to high quality when I come close", a painted pool far off and a pooled light
close by, 45.7% apart; `--canary` puts the lamp out in the shaders' list while he's far off); the street lamps'
light summed frame by frame as the hero walks from the hall's door into it, the list's and the casting lights'
together, within 1% (`page/villageDoorLamps.ts`: from play, "lights turn off when I enter the hall", the lamps
switched over to the torches at its door; `--canary` puts one out as he goes in); the hero's shadows from each
street lamp in turn at midnight, 1.5 m and 3 m off it (from play, by the stair's lamp: "no shadows FROM LIGHT, only
from moon"), and the moon's at each: the most of a patch's light his shadow takes away from the moon, at least 5% (16
to 82%, 9% by a lamp on the grass, where its light is most of the ground's)
(the lamps' shadows held off for its readings: "moon shadow always there plus 1 or more shadows from lights"); the
most the lamps' shadows take of a patch behind him (on paving where
there's some round it) while he casts over what they take there while he doesn't, at least 15% by every lamp
(`page/villageHeroShadow.ts`: from play, "no shadows from lights", the lamps' shadows drawn once with him hidden;
0.0% before, 59 to 85% now; `--canary` stops him casting by the last lamp); his two shadows standing between two
lamps, the two nearest him (the two casting lights), the same reading behind him away from each, at least 15% each
(from play, "supposed to be 2 shadows here, right ? from both lights": 18 to 54% each; the far lamp's is the faint
one, lit by the near lamp; a pair with nowhere to stand between, the fountain, is listed but no fault; `--canary`
stops him casting for the last pair's second reading); every street lamp casting, the hero in
the hall so none holds a casting light: the ground within 3.5 m of each lamp's foot drawn from four sides 6 m off
it and 9 m up, with the lamps' shadows and held off (the shadows' map and the casting lights'), at least 1% of it
darker by 30% (`page/villageLampShadows.ts`: from play, "your light test for each light need to test SHADOW, it
was missing for half of them"; straight over a lamp the camera stood where its light does and saw every shadow
hidden behind its caster; 0.0% for every lamp without the shadows' map, 2.6 to 9.7% with it; `--canary` holds the
last lamp's shadows off for both readings); each road's tightest bend no tighter than its half width and 0.3 m
for its curb (`page/villageRoads.ts`: the yard's road's inner curb folded into slivers at its gate, 0.9 m against
1.6, now 2.9; `--canary` adds that road as it was); the props' hole (`core/seeThrough.ts`) drawn open and held
shut in one frame, the hero beside a cottage's wall over the shoulder (none of the frame outside him may change:
from play, "should not see through here, because I'm in the front", 20% did) and behind its roof from above (at
least 5% of him must open; `page/villageSeeThrough.ts`, `--canary` the round hole as it was); the hall's walls at
midnight from inside it, the frame drawn and drawn again with the camera 0.5 mm aside, at most 1.5% of it jumping
by over 8 levels (`page/villageHallSteady.ts`: from play, "this wall in hall of heroes is z-fighting /
flickering", its inner walls on the lamps' shelter's edge, 5% jumped; `--canary` reads each surface's side of the
shelter on it again, as it was); every street
lamp's ground round its foot read from over it lit and put out as the hero walks to each lamp in turn at midnight,
the casting lights handed over as his walk hands them, each lamp giving at least 30% of the light there
(`page/villageLampsCast.ts`: from play, "why this light is off", a lamp beside him lighting nothing; not reproduced,
the least 74%; `--canary` puts each lamp out for both its readings at the last stop); the frame with the sun's map
kept (`sunShadowKept`, `world/moonShadow.ts`) against it redrawn whole at one moment, at three spots, the last by the
chest: 0.00% changed (`--canary` leaves what moves out of it, 1.1 to 1.3%); every curb's top facing up (`curbsFaceUp`,
`--canary` reads them wound the other way); what the chest's hoard draws, read as the frame with it and without at one
moment, with the stash at 0, 1, 30 and 60 of 60, and the vertices it draws growing with it (its share of the frame stops growing as the chest's mouth fills: 38% at 30, 29% at 60)
(`housesBesideFence`, `page/villageFence.ts`, from play: "at border of map, the house behind player suddenly disappeared": from above, stood by the palisade facing in at three stands where the line from the camera to his chest meets the palisade first, a plain house of what's built planted beside him on the camera's side: the frame drawn as the game draws it, then with the houses' hole shut (at most 0.05% of it changed, 0.00%), then the fence's (at least 1%, 11 to 18%); pictured; `--canary` reads the palisade as built, as it was, 1.1 to 8.4% of the frame taken apart) (`housesPastFence`, the same file, from play "where did the house go?": at night from above at the same stands, a plain house of what's built planted 3 m past him, the frame drawn with it and without: at least 1% of it changed, 2.2 to 3.3%; pictured; `--canary` orders the palisade among what blends by its middle, as it was, 0.3 to 0.8%) (`doorLineSteady`, `page/villageHallSteady.ts`, from play "moving back and forth here flickers the columns": at night from above, the camera held, he steps 4 cm either side of the hall's door's line, four frames a side, eight times: at most 2% of the frame changes between two frames, 0.4%; `--canary` has the fog's eye cross the line with him, as it did, 8.9%, the portico's columns flipping whole) (`hallEntrySteady`, `page/villageHallEntry.ts`, from play, the hall's left and right columns flickering as he enters: he walks in a step a frame along three lines through the doorway, from 2.5 m out to 3.5 m in, the camera and its lens held where they settled, from above and over the shoulder, at midnight and noon, his body hidden; the frame read in 64 by 36 patches, a patch flickering when its light jumps 6 levels of 255 one way and straight back (the torches' light wavers 4 a frame): at most 0.4% of them in a frame (2.2 to 4.5% before, 0.04 to 0.35% now). A walk that fails is walked again without the hall's thinning, the fog, the doors and the fog's fades, each one's worst said, and pictured: the frames either side of its worst and what flickered; `--canary` thins the front wall and the columns whole and keeps them in turns frame by frame (the columns alone thin only on the way to him), 6.3 to 26%) (`heroBehindProps`: behind the stair's cheek, the fountain, a lamp post and from above a column of the hall's portico ("why this not becoming transparent ?"), how much of him shows, read where he alone is drawn, and what of the frame the hole opens round him, from play "character and context around character needs to be visible even if the character is behind props"; the stair's cheek hides him under his waist alone and opens nothing, at most 0.05% of the frame ("dont thin if obstacle is below waist"); `--canary` needs each scenario to hide him with the hole shut. `wallsStayWhole`: at a cottage's corners and along the hall's walls over the shoulder, the hole changing nothing of what's built and the near plane cutting no wall, from play "I should not able to see through walls like this"; `--canary` thins what's built and leaves the near plane at 0.5 m as they were) (`hallFloorSteady`: rays down over the hall's floor, no second surface within a millimetre of it, from play "this floor is now flickering"; `--canary` plants a sheet in the floor's plane) (`heroesBuiltAhead`: the lobby let run unpaused till the heroes are built behind it, then the hall's screen opened and another hero chosen, the first time of each, no hero built in the choice's frame or the next; `--canary` lets the spare heroes go) (`hallBuiltBehind`, `page/villageBuiltBehind.ts`, from play "keep loading the game in the background, as long as it does not slow down the player": the hall's heroes and the spares let go and built again behind the lobby, each frame's building timed by the browser's own clock: the frames, the pieces, the longest frame's building at most 30 ms, and the slowest pieces named; `--canary` builds them all in one frame, 300 ms and more) (`hallHoleOpens`: from above, a hall column before him, the frame as the game thins it against everything before him held whole: at least 10% of it opened, the floor before him whole; `page/villageHallHole.ts`, pictured; `--canary` leaves a hole his own size alone) (`heroChosenQuick`: another hero chosen in the hall, each frame timed by the browser's clock, the programs compiled;
`--canary` stalls a frame) (`heroFaceNotBlinding`: round his head at midnight, before each portal and under the street lamps; `--canary` puts a
light by his head) (`cameraBeforeWalls`: walked out from the square, the hall, the portico and just inside the door each way to what's
built, his back to it and along it, then turned round in the doorway, over the shoulder: the camera on his side of what's
built, its near plane clear of him, his crown in the frame, settled to under 2 cm a frame (0.65 m unfixed), each close
spot pictured; `--canary` lets it stand behind and leaves it at his shoulder) (`hallFrontFades`: from above, the frame
against the frame with the front wall hidden, 15 to 90% of its share left as a ghost, at most 15% thinner a frame, and over
the shoulder not thinned; `page/villageHallFade.ts`; `--canary` hides it, as it was) (`firesWhereTheyStand`: each ember
spawned over 240 frames within 1.5 m of a fire's flames, each fire's shader told its place; 16 strays and 2 shaders
unfixed; `page/villageFires.ts`; `--canary` throws them off)
(`cancelledOnHisFloor`: the hall opened on the terrace and cancelled, his body on its floor every frame back, 100 cm under it and rising before; its canary drops him.) (`hallShownAtOnce`: the hall opened, another hero picked and the hall left with motion on, as under the lab's reduced motion the camera always cut: the camera on its shot within 10 cm a frame after each, the view settled as it's left; its canary picks by a drag's glide. `heroLeftStands`: each hero left in the row at two moments of his showcase, the frames of 120 a foot is up, at most 25, 35 for the warrior before, and the warrior long at rest for a control) (`daisOpensCompileNothing`: the hall opened by E at its dais, as the village's own update hears it, every frame's point lights casting counted and the programs compiled; then a piece of the hero in focus hidden and the shadow map drawn once, his shadow cast as one made again round it, and no mesh the shadow map alone draws left shown after it (from play, "as I enter hall of heroes ... it lags": the trace's one late program the mage's shadow cast as one in its own basic material; one draw read, as the lab's frame draws the shadow map again for each of its renders and the next hid it; 1 before, 0 now); `--canary` leaves another pooled light casting and the shadow shown) (`heroesSeenOnApproach`: on the stair and from before the fountain, 22 m off the door, the heroes standing on the dais with the door in view (from afar held still, no matrix of theirs made each frame, and posed again from the stair), and none with it behind him; `--canary` reads the look away as the look at the door) (`heroesStandOnBothFeet`: each hero chosen away from at moments through his showcase, both ankles at rest on the dais every frame; `--canary` lifts a foot) (`arrowsStickInGround`: an arrow standing in the yard and the meadow with either biome chosen, glancing off the square; `--canary` reads the square as ground)
(`wornStaysOn`: a worn item clicked by I stays on him, at the chest goes to the stash; `--canary` reads the chest as I)
(`grassRingsGentle`: the light changed per band in a 0.5 m stride of the rings' middle, at most 10%; `--canary` hands
over as they did) (`hoardShowsStash`: empty none at all, more as it fills; `--canary` reads
five items as empty); how to play closed by Esc with the pointer locked, the browser's letting go of the lock as Esc is
let go played by the page (`escClosesHelp`: no pause menu; `--canary` asks for the lock with Esc still down); from inside the hall of
heroes over the shoulder, turned to its door (V pressed: the village's top view is its panels'), the frame drawn
with what stands outside culled by the doorway (`world/hallPortal.ts`) and drawn whole, at midnight and noon:
the scene's draws must fall and at most 0.05% of the pixels change (`page/villageHallCull.ts`: 425 draws to
297, none changed; `--canary` culls all outside the hall, the doorway or not: 0.74% changed); the terrace's
stair walked up, the body's height on its top (`obj.position.y`:
the player's `pos.y` is always 0, and a reading of it said 0 m up); in the close view (V), mouse look asking for the
pointer on the square and letting it go once the hall of heroes is used (`pointerWanted` in `core/input.ts`: its
screen kept the lock and the mouse was gone over its cards, from play); the first visit's training begun afresh
(`restartTraining`: the lab's boots are a returning player's), each step taken as a player takes it (the yard walked
into, the middle dummy struck by the basic attack held and let go, as the ranger's bow looses only as it's let go,
M pressed, the chest and the notice board used) and ticked, the crypt's portal card warning with no Enter till it's
done, the notice board's Restart training clicked (under way afresh, every step to do, the tracker out, the board put away; none offered from the pause menu's How to play; pictured; its canary doesn't click it), and begun again and skipped, Enter there at once; and the village held at six hours of the day, drawn, with
no program compiled (`G.renderer.info.programs`). `--canary` plants a fault for each (an object's stand moved off it,
the yard's reading taken outside it, a hero put past the palisade after a walk, one put past a portal, the rings'
middle moved 20 m in a frame, a walk round a cottage and one from a portal walked straight (`routing.on`), an orb far
past white hung in the first light, the
stair
walked at beside it, the
pointer asked of the square, the notice board never read, a new material shown at one hour), each listed and each must
be caught. It found the chest's stand off the terrace's edge, below it, where the hero could never use it.

`minimapOut` (`page/villageMinimap.ts`, the tracker pictured over the square and the yard; from play: "we need a minimap in wardenhollow too"): read off the page, the
minimap out on the square and in the yard, titled for the village, with no run's objectives or spoils, the hero's arrow
on its canvas where he stands as the camera has it turned, the bottom bar in the yard alone, the tracker under it on the
right, and both away with the inventory and back after. `--canary` reads the arrow half a turn off and sets the tracker
over the minimap.

`portalAtNight` (`page/villagePortalNight.ts`, needs `--cold`, says it wasn't measured without; from play, "when using a
portal to the main game, it hangs"): a portal's Enter pressed at midnight with the fight's programs cold, the programs
the warm-up made and those the run's first frames made, none. In real Chrome that was 38 s and then 11 s with no frame:
a biome drawn in the village's place to warm it, with the lamps' two casting lights on beside its own, compiled every
program for four, and the run's first frame compiled them again for two. Walk the real path on the real GPU with stalls:
`--before` clicking the map's portal name and `#btn-start`, on `?hour=0`. `--canary` leaves a spare light casting.

`hallSillsSteady` (`page/villageHallSteady.ts`, from play: "bottom / sill of windows are flickering, probably z
fighting"): rays down onto every window sill of the hall, no second surface in the plane of its top. `--canary` plants
a sheet there.

`heroPickedNear` (`page/villageHeroNear.ts`, from play: "in top down, the hero selection is not based on proximity"):
top-down, stood before each other class's plinth, that hero is the one the dais opens on. `--canary` asks for the other.

`roofsFromAbove` (`page/villageRoofsSeen.ts`, pictured behind a cottage, its roof and gables thinned; from play: "it needs to match the previous screenshot, logically", "we
should make roof semi-transparent"): beside the hall with the camera turned each way, its roof gone and walls thinned
where it meets a line to him, a ghost where it doesn't; behind a cottage, the frame opened against his own size.
`--canary` puts the roof back as it's read.

`grassStillFromAbove` (`page/villageGrassRing.ts`, from play: "in top down, grass is visibly redrawing"): the blades alone
from above, again with the rings' middle moved a stride: no band's light changing past 3%. `--canary` draws the rings.

`staffAtNight` (`page/villageStaff.ts`, from play: "bug at night, mage's staff flickers too bright at times during its idle pulsing, thought we had a test for that"; `hall --glow` reads the hall alone, whose copy of the hero is dressed for it, so the village's polished crystal went unread): by midnight, beside a lamp, by the campfire and on the square, in each view, a box round the staff's tip frame by frame: its brightest against its median (at most 1.6, 4.12 before), near white, a frame's move and its flashes; its canary polishes the crystal again. `dummyLabelsFade` (`page/villageMeter.ts`, from play): a dummy's readout read each frame as he steps into and out of the yard, at most 0.15 of it a frame (1.00 before), all of it in and none out, and hits counted before he left gone as he comes back; its canary makes the fade all but instant. `fountainStopsArrows` (`page/villageFountain.ts`, `--class ranger`, from play): held armed out of the yard (`armedEverywhere`), shots from above at the fountain's tiers and basin from two sides ending by it (11.3 m out before), and a rain over it leaving arrows on the basin's floor, wholly under the water, and none under the floor, pictured from beside the basin; aimed from above, as the close views aim at the crosshair; its canary takes off what the fountain's obstacles meet an arrow with. `portalReturn` (`page/villagePortalReturn.ts`, from play: "this is what I saw when lower end player returned to sanctuary", the top half of the frame the crypt gate's dark stone, him in a hole cut through it): stood back from each portal as `enterMenu` stands him (its exit, `exitPlace` in `data/village.ts`; the lab's runs begin at no portal, so their end stands him on the square), from the lobby's view at noon, lines from the camera to the ground within 6 m of him: at most 10% met first by something over 2.4 m (100% at the crypt and 54% at the forest before, 3.3 m out of the portal; 2% and 1% inside the gap); its canary stands him where the exits were. `grassOnLow` (`page/villageGrassLow.ts`, loaded as it runs, from play: an S25 Edge's grass 21 ms of an 80 ms frame): at noon on open meadow, from above and over the shoulder, the frame drawn on High and on Low (`useQuality`), the vertices the grass's rings shade counted from what each lists as it's drawn: Low at most a third of High's (30% from above, 26% over the shoulder; 67% and 36% while its tiles grew with the cells), no program compiled by the switches, each pictured; its canary leaves the blades as close on Low as on High. `lampsOnLow` (`page/villageLampsLow.ts`, loaded as it runs, from play: an S25 Edge's lamps 5.5 ms and their shadows 5 of an 80 ms frame): at midnight where the set-up stands him on the square, from above and over the shoulder, High and Low (`useQuality`): over the ground within 20 m of him, the lamps lighting each point read from the list as the shaders read it (lit, within reach): Low's mean at most 60% of High's (2.5 against 4.6; at a reach of 55%, 1.5, the square's middle lay dark), its shadows' map not read, no program compiled by the switches, each pictured; its canary leaves Low's lamps as High's. `shadowsOnMove` (`page/villageShadowsOnMove.ts`, loaded as it runs, from play: an S25 Edge's shadow maps 8 ms of an 80 ms frame): on Low, by midnight and noon, over the shoulder: the frames that drew the movers over the kept maps with him standing (at most a fifth: 0 to 8%, and what moved a step) and walking (at least 90%: 98%), and stood again after the walk, the frame as the maps were left against drawn again at one moment (at most 0.75%: 0.30% and 0.35%), both pictured, no program compiled; its canary draws them every frame for the counts and never for the frame (1.2 to 2.7%). `bloomOnLow` (`page/villageBloomLow.ts`, loaded as it runs, from play: an S25 Edge's bloom 6 ms of an 80 ms frame): by midnight at the campfire and back from the crypt's portal, over the shoulder and from above, on Low: the pixels bloom's passes draw, Low's (half each way) at most a third of full share's (25%), and the light it adds to the frame's mean, drawn with it and held off at one moment, within half a thousandth of white of full share's (0.00 to 0.45 against 0.01 to 0.36: as a share that small, noise moved it -81% to +58%), pictured, no program compiled; its canary leaves Low's bloom at full share. (`profileRows`, which switched each row of the perf overlay's own Profile off and on, went with that Profile: main's Profile this spot, `lab profile`, is what it became.) `sightBlacksOut` (`page/villageSight.ts`, from play: "hide the areas player cannot possibly see"): from above at noon, each place read with the fog and held off at one moment: the hall's floor from outside it at most 20% of its light, the ground past its wall and across a cottage colder, and at most 50% of its light where it was bright (the fog holds a floor under what's already dark, not to fall to black), the hall's floor from in it and through its door, what's beside him, his long wall facing him and over the shoulder untouched; its canary holds the fog off. `heroBesideFire` (`page/villageFire.ts`, from play: "blinding reflections from fire"): by midnight, at the campfire's stand and as near as he can stand, in each view, the share of his whole figure burned past 0.9 in its lightest channel; a box round his head alone read 1.4% where the picture was plainly burned; round the fire at 1.6 and 2.6 m, eight ways, the camera on the fire's side, the box round his quiver's mouth at most 0.5% near white (from play, "arrows still blinding reflection near fire": its pale vanes, 2.6% and pictured at its worst); its canary brings the light to his head's height. `campfireBurns` (`page/villageFire.ts`, from play: "there is no light from fire"): what its own light adds to the red of what it lights by midnight, against the light out, and where the renderer's matrix has it; the campfire by night and day, over the shoulder and from above, pictured, and
what its flames draw of each frame. `--canary` hides them.

`fogHoldsSteady` (`page/villageFog.ts`, from play: "fog of war should ease in/out, not jerk", "we need to stabilize fog of war, sometimes it's jerking left and right as I'm walking in straight line"): he walks 14 m straight past a cottage's corner from above, and each frame reads how seen each place on a grid 24 m round him is (`seenShareAt`, the shader's own reading off the rays), but within a metre of a wall's line: a place's most in a frame, its turns back, where the worst is and that place frame by frame. `--canary` shows the rays as they're cast, at once. `firesStillInFog`: the campfire's flames over 30 frames from the back of the hall (none) and beside it; `--canary` holds the fog off. `leavesInFog` (from play: "and tree leaves should be grey too ?"): the share of the frame plainly green from four stands by the hall's walls at noon, the greenest pictured; `--canary` holds the fog off. `startSpots`: every place a game may open at, clear and pictured. `topKeepsHim` (from play: "head cut off"): from above zoomed in, his head's place in the frame on the square and up on the terrace. `heroBesideFire` also reads his skin round the fire by day and night, eight ways round and each distance: burned pixels of his own (the frame drawn with him and without, its flames hidden both times) that its light alone burns. `fogUnderRoofs` (from play, "fog of war bugs"): from before each cottage, the light the fog takes from the ground just past its back wall, seen through its ghost of a roof, read with the fog on and held off; `--canary` has the roofs keep their depth, so the fog reads them as roofs. `hallWallsHold` walks at the hall's four sides, its wings from the grass and each cottage's four walls (from play, "can walk through buildings too": blended walls were taken for glass by the wall's own test).

`wallsPastHimWhole` (`page/villageSeenPast.ts`, from play: "not supposed to make walls transparent like this, because I'm front of the wall", "these pillars in hero hall are oddly cut", "it shows green where it should not"): from above, stood on the hall's floor, on its portico, before a cottage and at its corner, places on what stands past him or beside him, drawn as the game thins and with what's built and the hall's columns whole (a ghost of what stands free before it is no fault of the wall's); pictured. `--canary` has what thins reach past him and what's built open round him whatever it hides. `portalOverAll` (from play: "some kinda glitch at the portal, only under some angles"): from six stands and two views, the share of the middle of the crypt's portal the frame shows unchanged with it hidden: what draws over it, at most 6% (3.5%); `--canary` sorts what thins by blending among the glows, 100%.

`columnsStayGhosts` (`page/villageSeenPast.ts`, from play: "this geometry is messed up", "but this is a defect, right ?"):
stood behind a portico's column, the column shows over the wall past it (the share of it shown, drawn against the frame
without the columns); stood with a capital at the edge of what thins round him, the frame on the capital's top doesn't
change with the shaft under it taken out. `--canary` draws the columns in with the walls and takes their depth away.

`ghostsOverHim` (`page/villageGhosts.ts`, the owner's choice: "Fewer layers thin less", where ghosts overlap alone): stood past each cottage from above, at the first spot where two ghosts or more lie over his chest (the count read back), how much of him shows: his own light (the frame with him against it without him, over his pixels) against it with what blends hidden; the least over the cottages at least 31% (34% now, 27% as it was); `--canary` keeps each ghost as it is alone, as it was.

`roofShowsWhatHeSees` (`page/villageFog.ts`, the owner's choice: "grass that cannot be seen by me, but can be seen by player should be
green"): stood at each cottage's back corner, the ground he sees round it on a 0.5 m grid, seen through its roof alone (no wall's
ghost on the way), shows as he sees it, read by the share of its light the fog takes against the same frame drawn again with the fog
off (the roof's grey ghost tints it), through a roof held thinner than the game's; `--canary` takes it all as unseen, as it was, with
the ghost of a far wall through a roof ("why we cut off a portion / triangle ?"). `doorConeOpens`, `heroSeenPastHall`, `noDotsBesideHall` (`page/villageHallOpens.ts`): at the hall's door
the floor he sees through it shows through the wall over it ("here should open the wall above hero"), none with the cone held shut, and the floor beside the door, under
the front wall's inner face, which his own rays can't reach past the jambs, shows too: the room is seen as from the doorway ("no slanted walls that make it small";
its canary holds the doors off, `holdDoorsOff`, and the floor beside the door showed 20%, 100% with them); past its
side wall from the camera he shows through it ("and here cannot see hero"); while the hall alone is thinned for him what stands free
stays whole ("also this is broken": the terrace's coping in dots; the hole round him reaching to the floor did that again, 3.74% of
the frame, now opened over the line from the eye to his feet alone). Each `--canary` holds it as it was. `hallWallsOneByOne`,
`heroLitInHall`, `roomColumnsStay`, `heroesSeenFromAbove`, `objectsWalkedShort` (`page/villageHallWalls.ts`, each stand after one of the owner's
pictures, at their zoom): a wall thins whole while it hides him, the floor near him or floor he sees, and no other
does (at least 75% of its places thinned, or at most 20%: a cone of his sight cut across a wall fails it; the portico's
beam told by its share; under each stand, how many of each wall's places hid floor he sees, and where; from play,
"didnt we agree to thin whole wall? but mark unseen regions with fog of war ?", "also this top concrete bar should be
thinned too"), read on each wall's places
with nothing thinned against as the game thins, those seen through another wall left out; in the doorway the room's shafts seen
over the wall show, also on the jambs' line, where they had all gone (0 of 6 places, now 6 of 6); from above the plinths' heroes
stand with a plinth in his sight; a clicked object's spot is reached by about the shortest way into its reach (the campfire 12 m
for 6); by night on the hall's floor his pixels hold a mean light of 0.1 (0.045 with his light off) and at most 0.3% of the frame
burns. `--canary`: every wall thinned, his light off, the shafts hidden, the heroes read as none, the shortest way read as half.
`doorConeFromStair` (there too): from a step down the hall's stair and on down it, looking in, the room's floor past the door
shows from above ("when player is down even one stair, then in top down he cannot see into the hall"): 0%, 0% and 25% of its
marks at 0.3, 1.5 and 2.9 m down, the cone shut from 4 m out and the roof and the portico's beam over the room; now all. Marked
deeper than the doorway alone shows (in it, the floor showed with the cone shut), those in the frame read. From each stand the
room's floor beside the door, 4.5 m aside, past his line of sight through the jambs, is seen at most 25% (from play, "new
thinning ignores line of sight": the whole room came out of the fog from the stair; 100% before, 0% now). `--canary`: the cone
held shut and the door's rays cast without his line of sight (`holdDoorWedgeOff`).

`fogPastCottages` (`page/villageFogPast.ts`, from play: "still seeing green where character cannot see"): at noon from
above, stood outside each wall of each cottage, the camera behind him, every place round him a cottage's wall hides (each
neighbour within 0.75 m hidden too, none within 1 m of a wall) projected into the frame and its pixel read: at most 3% of
them plainly green (the far roofs' overhang let the fog off over the grass past their eaves: 0.0% now), the trees hidden, as
their crowns stay seen over what he can't see; the greenest stand pictured with what the rays say of its green places.
`--canary`: the fog held off.

`fogUnderEaves` (`page/villageFog.ts`, from play: "and here should be all grey, right ?"): stood beside a cottage, the
ground under its far eaves, past its wall, holds no plainly green pixel. `--canary` lets the fog off under the eaves.

`hallFacesSteady` (`page/villageHallSteady.ts`, from play: "still flickering"): rays at the hall and each cottage from
above and from each side, and each plane two faces turned the same way share, with the sizes of their triangles; a ray
on a seam or a turned box's corner is left out by the rays a hair to each side of it. `--canary` plants a sheet in the
portico's beam's face.

`grassSteadyInWind` (`page/villageGrassWind.ts`, #604; from play, of High's tufts: "grass shading flipping between dark/bright is still an issue, happens in idle (from wind)... you need to improve lab so you could see it", then "grass is flickering now, I just stand idle, and it flickers"): he stands still over the shoulder on the open meadow and by the campfire, the camera given 4 s to come to rest (it glides for some two seconds after a view is taken, and read sooner its last centimetres moved every thin blade a pixel: a sixth of the grass's cells swung with no wind at all). The frame is read in cells of 12 px, those the blades change kept (the frame drawn with the blades and without). Three readings: the share of the grass's cells whose light swings over 40% of its mean in 3 s (at most 8%; 15% with the wind as hard as it was), all of it together (at most 8%: a fire's light on a whole patch), and from one frame to the next, pixel by pixel over 8 frames, the same read with the blades hidden taken off it (the grade's film grain changes every pixel every frame: 2.7% of the light there), at most 3%: 0.6 to 1.1% as merged, 8.5% with a tuft's seed unrounded, main's own blades 1.7 to 4.4%. A still, or frames a fifth of a second apart, show nothing of the last. Its canary has the wind as hard as it was and the seed unrounded (`holdGrassWindWild`, `holdGrassDropByPixel` in `meadow.ts`), about 10% a frame, which must be found. It reads no level but the one booted: run it at High (the lab's default).

`heroCoarseFromAfar` (`page/villageHeroFar.ts`; from play, in the hall, "1.3m not expected either": a hero is about 140k triangles on High at any distance): from above he must be drawn from fewer triangles (`models/farDetail.ts`: at most three quarters of his own), and the frame drawn so and whole at one moment must be the same to the eye, at most 0.4% of its pixels apart over what two draws of one thing differ by (0.05% the warrior, 0.10% the ranger, 0.26% the mage, his robe the largest thing simplified); over the shoulder he must be whole. Its canary holds the coarse geometries off, which must be found.
