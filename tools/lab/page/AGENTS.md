# `tools/lab/page`

- `heropick` changes to Gold only after the alternate playable spare has been prepared, then picks it. Both the first cached switch and same-hero selection must keep that colour; the fixture restores the prior preference afterward. Its canary also removes the chosen dye and must catch that loss, separately from click-through and a missing spare. Exercise unfinished-hero navigation first. If a prebooted page already warmed every alternate, the fixture explicitly holds one hero's readiness at 50% for the guard check, through `chill`/`heroWarming` and a before-frame hook, then restores the previous shares/warm flag/visibility. Report that controlled state honestly: it checks the readiness guard and hidden model, not a cold GPU compile. Never depend on machine speed to provide an unfinished hero.

- `uiPause.pauseShown` reads the pages' own cell (`.pb-pages`), which is what scrolls: the box round it never does, and read alone it called every tab unscrolled, its canary's row twice the window's height unseen on every tab. Developer mode's help on the Controls page (`.dv-help`, 240 px, dev builds and previews alone) is set aside while it measures: the lab's is a dev build, and with it every tab scrolled here where no player's does. On a phone held sideways the Performance tab with a profile listed scrolled 23 px, on main too: Send the report stands beside Profile this spot now (`ui --states pausePerformance --screen 844x390@3`).

- **A measure of what compiles turns drawing on** (`lab.drawing`, off by default: only the scene's matrices are updated) and **lets the browser go between frames while a warm-up runs** (`__labClock.realFrame()` after each `lab.step`): `lab.step` never yields, so a warm-up's tasks and link waits never ran under it, and without draws no program is ever compiled. `bosswave` read "0 programs compiled" as the Twins rose before it drew, and its first canary (the Twins unwarmed) compiled nothing either way, their crowd sharing every program with the foes warmed: its plant is a material with a program key of its own.
- **A canary's plant must still reach the measure as the game changes.** `village --only hallWallsSteady --canary` went unseen once the hall's walls were dimmer at midnight (its flips 0.56% of the frame by over 8 levels, 4.05% by over 2: it counts from 2 now, `WALL_JUMP`), and `cursor --canary`'s Ctrl once the game dropped a move under the lock far larger than the last (#318): the held move to Pause goes in hops (`HOP`). A canary run of `village` writes its pictures too.

- `uiPause.pauseColourChecked` checks all twelve solo colour swatches plus Any, actual 40 px touch targets, and a real Settings pick being selected/saved/worn. A touch fixture must tap: switching to mouse input changes touch sizing before its press lands. `coopPickColour` drives the live party picker, while its explicit request mode tests a competing request that became occupied in flight.

- `heropick` must choose an alternate class on the first screen as soon as its readiness allows it, before any lobby background frames. Record `Player.built` immediately around the event, before advancing frames: the old check picked the current class and missed a whole playable-body build inside the first different-hero click. Keep the unfinished-hero guard and click-through checks too.

- `uiFullScreen` also checks the `?keyboardLock=0` comparison with a lock-capable browser spy: no lock call, fullscreen remains available, and browser-owned Escape still opens pause. The lab never engages a real native keyboard hook; passing it cannot rule out a native Chrome input delay.
- `uiFullScreen` checks both manual fullscreen controls at the activating pointer event and their click. The auto listener must make no request on either control; the control makes exactly one. Keep each touch phase's request count relative to the start of that phase, because earlier manual requests are counted by the same spy.

- `manualRecording.ts` is part of `recorder`: it operates the real Start/Stop/Send controls, captures paused frames and first-frame resolution/key-delay marks, rejects outside marks, forces an upload failure and retries identical bytes, tests touch Start and sending after the automatic client quota, checks time/frame limits, and sends only to the lab's local service. Its fetch wrapper redirects every trace POST and is restored in `finally`; never let a fixture upload to production. `uiPause` shows recording review alongside all profiler results and checks the recording buttons inside the modal. The recorder's zero-tail canary must compare captured time with the required normal wait, not its own injected zero: depending on a missing boundary mark made it pass or fail incidentally after other fixtures advanced the clock.

- `behind` also changes quality while the hall is open, presses Back without choosing, and reopens it. No new head-cache misses may be sculpted on the page; background pieces retain their timing budget. Its canary finishes missing-detail jobs synchronously and must detect those misses. Worker messages use real time, so idle build polling and `hallMoves.openHall` yield real time as well as advancing the parked game clock; exhausting hundreds of simulated frames instantly can falsely report a preparation deadlock.

- `cloud` opens the save slots as the village has them (`cloudAtChronicle` in `cloud.ts`): the Save slot button is on the chronicle's card, so the hero is stood at the chronicle with its card open first. Clicked where the village hides it, `cloud` and `cloud --google` stopped at their first step.

`uiCloudIdentity` uses explicit account snapshots with the real identity renderer inside Save Slots: Google email/logo, linked methods, passkey/code distinction, legacy Google sessions and hostile email text. Its canary removes the email; service OAuth/session persistence is checked separately in `server/saves/test/google.test.mjs`.

The lab inside the game's page: TypeScript, typechecked with the game (`tsconfig.json` includes it) and imported as the game imports its modules, so there's one copy of each. `lab.ts` is the lab a measure is given (the clock, input, set-ups, pictures), `commands/` the functions the session calls by name (a module each: `commands/AGENTS.md`), and each command's measure has a module of its own (`gait.ts`, `spawns.ts`...), with the pieces measures share (`geometry.ts`, `corners.ts`, `screenCells.ts`, `flashes.ts`, `legTrace.ts`...), the pictures' looks (`looks.ts`: wireframe, faces, parts, skeleton) and the drawing buffer read back (`pixels.ts`), and `live`'s steps (`live.ts`).

The rules across the game are the [root AGENTS.md](../../../AGENTS.md), the lab's own [`tools/lab/AGENTS.md`](../AGENTS.md) (what the lab gives a measure, and what keeps it repeatable).

- **A state of `lab ui` is a module of `uiStates/`** (`uiStates/<state>.ts`, the file's name the state's), default-exporting its `Steps` (`uiKit.ts`): its `order` (steps of 10, the lobby's states before the run's, `inRun`), how it opens, checks and closes, its pictures and its canary's plants (`caught(...)`). `ui.ts` keeps what every state gets (the boxes, the cursors, the digits, the run set up) and loads each state's module as it runs (`import.meta.glob`); `node/commands/ui.mjs` reads the folder for `--states` and the run's order, and `labCode.mjs` keys `ui`'s A/B side on every module there. A new state adds its module and touches no shared list; what several states share is a module beside `ui.ts` (`uiKit.ts`, `uiLog.ts`, `uiSkillTips.ts`, `uiReadying.ts`, `uiPause.ts`...).
- **A command's module is loaded as it runs** (`commands/`): an A/B copies these modules into the other commit's tree, and one importing game code that commit hasn't got would stop every command loading there.
- **The mouse has its three buttons** (`lab.mouseDown(at, button)`, `mouseUp`, `clickWith`, `mouseTo` moving it
  held: a middle drag), sent through the DevTools protocol with the mask of those held, as a mouse sends them.
- **The page runs on the lab's clock.** Its `performance.now` stands still within a frame, and its frames run as fast as the page can; what happens in the browser's own time (a decode, a CSS animation, audio) is waited for with `__labClock.realNow` and real timeouts, and kept out of a report's lines, which must be the same on every run.
- **Check the state happened, and carry a canary** (`tools/lab/WRITING.md`).
- A measure reads what the game sends out (the frame drawn, the WebAudio nodes, the page's styles), not the game's own bookkeeping, which is what it checks.
- Pure helpers a measure uses get a unit test in `test/` (`flashes.ts`, `patches.ts`, `sweptArea.ts`, `jumps.ts` have theirs).
- `portraits` checks the real party card at the five required desktop/phone/tablet sizes: class accent, name/class alignment, host portrait star, own border, ordering and overflow. Show the HUD before measuring it (the solo lobby hides it), and yield to the browser after opening native `details`: its deferred `toggle` populates the picker after the click.
- `heropick` checks Escape/pause before any hero is chosen, with navigation blocked behind pause. It then navigates to an unfinished alternate hero, repeats its tab and presses Enter: none may save or choose him, nor show his cold model. After choosing, real W and Escape events must reach play immediately. `behind` ensures cached spares exist, disposes them before drawing (the live hero's shared lights must stay), rebuilds them, chooses a cached hero and really draws the first lobby frame: no new shader programs.

## Notes by module

What's learned about one module or folder here goes in this list, one bullet a note, led by the module's name in
backticks (`` `merchant.ts`: ... ``), in its alphabetical place, never at the end: two PRs appending at a file's
end touch the same lines and conflict (`npm run check:sorted` holds the order; the root's Workflow).

<!-- sorted -->
- `behind.ts`, `villageBuiltBehind.ts`: the browser let go every frame of the building, not only frames with no piece built: the guide's pictures, queued behind the heroes, wait a piece a frame for a boss's file to load and for the card's fence, both on the browser's own time, and stepped without a break they spun the 1200 (1500) frames away ("still building", on main too). What's left queued is named (`queuedBehind`), and the guide's slowest pieces said: the mage's picture staged, shrunk and asked to compile in one piece was 31 to 34 ms, now a frame each. `hallBuiltBehind` builds them all again once where a frame's building passed 30 ms, and fails only if that build does too: on the lent laptop held to 86% of its clock with 8 sessions at once, the hall mage's piece 84 took 78 ms once, its other pieces 23 ms at most, where here it's not among the 8 slowest (all under 10 ms): a pause landing in one piece, not its work, which is slow both times.
- `bossWave.ts`: what the game's own clock brings (a boss's rise, as the wave's first group would reach him) is waited for by the game's time (`stepUntilInGame`, 120 s of it), what the browser's brings (a warm-up's links) by the browser's: waited for by the browser's 60 s, on a shared PC and on the lent laptop with 8 sessions at once the Twins "never came" with nothing readying, and came run alone. Its error says the run as it stands (its phase, the boss's time to come, the foes come, the hero).
- `budgetSources.ts`, `budgetLines.ts`: `cast`'s canary for the budget's breakdown is a white ball (`lab canary:
  glare`) stood in the camera's sight at the middle of a sixteenth, in a run of its own: at the skill's aim 8 m ahead
  it stood inside the crypt's wall, 3 m ahead of him his body hid it over the shoulder, at the screen's middle four
  sixteenths met and it lit a quarter of each, and under the strobe its light was given the strobe's change (the
  flashes' canary missed). Broken (no thing taken out), the breakdown names nothing and the canary fails.
- `cast.ts`, `flashSources.ts`: a flash's change is shared out among the scene's things with its start read at its
  end's exposure too (`TUNE.exposure`), so a change of the exposure alone is left to the rest: read each at its own, the
  canary's strobe scaled every thing's light and was given to the sun's light (0.091 of 0.126). It names Steel Tempest
  through the eyes in the forest, 3 flashes a second at the screen's foot, not looked into.
- `compiles.ts`, `programs.ts`: a pipeline first asked for is counted off the engine's census (`PIPELINES_ASKED`), named
  by its descriptor (`what`). Under the engine three's programs are none, and three's `renderBufferDirect` watcher threw
  at its first draw; a canary of a three material of its own (sheen, iridescence) makes no pipeline of its own there,
  the engine's pipelines being set apart by blending, side and depth writing (`describe` in `engine/materials.ts`), so the
  canaries draw a blending none else has.
- `death.ts`: the hero never lands a critical hit while a pass is measured (`onePass`): the second pass leaves each foe 0.8 of the first's damage short of death, and a crit left it standing, so which bodies fell changed from run to run.
- `draws.ts`: the ghosts' count is a pass of its own (`ghosts`, its camera the scene's on `GHOST_COUNT_LAYER`): counted as the scene's, its 40 to 50 draws read as the scene's own. Its last list names the programs and looks drawn by more than one material (each a draw of its own however alike): what's left to merge, found by it (the village's ghost was 46 draws drawn mesh by mesh).
- `gpuPasses.ts`: the frame by its parts is the engine's breakdown (`gpuParts`), the canary the bloom taken out: its
  passes keep a fifth of their time with `TUNE.bloom` 0 (0.17 ms of 0.78 at 2880 by 1800 at 2), so it asks them to
  halve, not to go.
- `gpuTurns.ts`: a change's GPU time is the engine's clock's (`gpuClock`, Bulwark's timestamps): it timed three's renders by WebGL's timer queries, and `scenecost`, `glowcost`, `fire --cost`, `envcost` and `perf --parts` stopped at their first timed render under the engine. The clock takes one frame at a time and leaves untimed a frame drawn while one's time is on its way, so each frame is drawn in a browser frame of its own and waited for, the frame drawn untimed meanwhile so the GPU never idles (the profiler's way, `engineTiming`), and a canary's frame drawn twice is timed render by render and added (`times`). Each side is drawn whole before its turns (`drawnWhole`: no pipeline still compiling aside, whose draws are left out). Read it with the GPU loaded (`--screen 2880x1800@2`): at 1920 by 1080 on Low the 4070 Ti's frame is 0.35 ms, its clock wanders, and the drawn-twice canary read 1.34 times once (1.99 loaded). `scenecost`'s parts are the engine's own (`frameParts`, the profile's), and its `--frame` MSAA says what the engine draws: WebGPU has 1 or 4 samples, so High's 2 are drawn as one and no level asks for 4. `glowcost` dropped its third way (the glow's code taken out of three's programs: the engine's kit shader is one), and found the engine's shared kit materials never sent the glow's numbers past the 32 that tell them apart (its clock, shape and strength: `sendTail` in src/engine/materials.ts), so the glow stood still and Settings' Gear glow off left it drawn.
- `guideOpen.ts`: a page's own picture is timed from its opening less the card's time on the pictures' draws (`onCard`: from each draw sent to its fence, `portraitTimes`' `sent` and `onCard`), as the browser's compile is left out: a program's first draw is where ANGLE compiles it, and the Twins' draws, sent before their pages opened, were done on the card 200 to 350 ms after, or waited for the picture before theirs (one is drawn at a time); a late picture's pieces say when each began. The browser is let go after each click (`realWait(0)`): `lab.step` never yields, so the click, the spinners' styles and the frame after it were one long task, the mage's page 150 to 195 ms, on main too, where alone it made none.
- `hallNear.ts`: the lab's boot gives every warm-up up behind the lobby by its own gaps between frames
  (`WARM_BEHIND.givenUp` holds the fight, the heroes and the rooms as a command begins), so `hallnear` clears it
  and sets `heldMost` itself (0 held, none not held) before walking him up: read as the boot left it, the heroes'
  warm-up never began near the hall in any run. Its run is left for the village first (`toLobby`): the set-up's
  run kept him out of it. Under the engine a return's boot asks for the heroes as it ends (`main.ts`), so
  they're warm before he nears the hall, `--cold` or not: it says there's nothing to measure (it failed asking for
  `--cold`).
- `haze.ts`: the weapons are the named ones a blow is measured by and whatever else a hand holds (`isHeld`: the staff, the bow): by name alone the mage's and the ranger's runs said "no weapons in the frame" with the staff filling a third of it.
- `houses.ts`, `housesFaces.ts`: `lab houses` hung on main, unseen, its page held in one task: the faces round a door are read by some 80 thousand rays, sent at each of the room's meshes whole, and the rooms' still parts had become merged meshes of thousands of triangles (`mergeRoom`). They go at chunks now (`rayChunks.ts`), and only those that reach the front wall, where every ray starts (`reachesFront`): 6.5 s a room, the check 61 s. While it couldn't run three more of its readings went stale, found by its canary once it ran: the chandeliers against the beams read each one's meshes, of which a merge leaves none, so it passed with nothing read (it reads `mergedParts` now, the box of each mesh a merge took, kept by `mergeStill` in dev builds, and throws where a chandelier or a ceiling has no part); the programs compiled going in were three's, none under the engine (it counts the engine's pipelines made, `PIPELINES.made`, 0 in every visit; the plant that compiled one is gone); and it found a real fault, the shop's crates' posts in their lids' top face. A check that sends thousands of rays at a place sends them at chunks, and a command's work on its page has a limit now (`COMMAND_TIMEOUT_MS` in `node/side.mjs`, 20 minutes), so one held so fails saying it.
- `lab.ts`: `drawn`'s lit pictures (`lab.drawn`, the close-ups `glow` and others read) are read off the engine's canvas in the task that drew them (`shownIn`, `readOpaque`): they were cropped from three's canvas, blank under the engine, and `lab glow` read no glow on any item, every reading of it passing over nothing. A measure that reads pixels names the canvas it reads (`drawnCanvas` in `pixels.ts`), never `G.renderer.domElement`, which is three's (the pointer's target still).
- `lobbyStart.ts`, `lobbyFrames.ts`: `lab lobbystart` lets the page's time pass between the frames it steps (`LabClock.flow`) and puts the browser's clock in `perfClock`'s place: the game times the slices it spreads over frames by them (`builtInSlices`, `tickDetail`, a warm-up's compile), and on the lab's clock, standing still, none ever ended, so a hero's whole build, 11 poses of a hall hero and every hero's simplified triangles each read as one task of 60 to 350 ms that a player's browser spreads over frames. What held the page between frames is the message round trips that ran a task (`untilResumed`), not the time a slice waited for a worker. Its ceiling is 25 ms (two warm-up tasks of up to 10 ms can run between two frames); the aim is 12. The heroes' fewer triangles are made in the game's worker under it (`detailOnPage(false)`), and on the page everywhere else in the lab, by the fixed clock (`detailOnPage` in `lab.ts` calls the game's where the tree has it: an A/B copies the lab's page code into main's tree, and a named import of an export main hasn't got stopped the page loading there). `--held` sets `WARM_BEHIND.heldMost` to 0, as a phone's GPU holds the frames behind which the lab's never does.
- `looks.ts`, `haze.ts`: a look (wire, faces, parts) is drawn by the engine (`drawnByEngine`), its pipelines made
  first on the browser's time (`readyLook`, which a command awaits before picturing in it; a draw left out throws).
  Three drew it on a canvas of its own and the engine's, last drawn as the player sees it, was read: `sheet --look
  parts` found none of the hero in any view and passed, and `haze` read no weapon surface. The engine grades every
  pixel, a flat colour too, so a part is found by its colour as shown, read off a palette of every part's colour laid
  just past the camera's near plane and drawn with each picture (`shownPartColours`): matched to the colours given,
  only the first part was found. A look puts the meshes in materials of its own and back, and the engine makes their
  pipelines again: the frames drawn next leave them out (`haze`'s weapons, shown and hidden alike, read 0%), so a
  measure that reads the scene after a look draws it whole first (`drawnWhole`). The engine draws no wireframe (the
  `wire` look draws the parts filled) and nothing with its colour write off, so the world doesn't hide the
  hero in a look. `haze --class warrior` reads the axe hazing 0.9% of the frame at 270 degrees in the forest, on main
  too, where its missing surface had every case fail on a halo instead: not looked into.
- `music.ts`: the village's lobby plays the hour's battleground's track (`biomeOfHour`): each round holds the hour to its battleground's (`HOUR_OF`), and the lab's own hour had the forest's lobby play the crypt's.
- `perf.ts`, `uploads.ts`: each phase says what a frame sent the GPU: the engine's device's queue's writes
  (`writeBuffer`, `writeTexture`, `copyExternalImageToTexture`: their calls and bytes, the queue's prototype wrapped as
  the first count is asked), and the scene's buffers whose version changed, by object and attribute (each handed to the
  engine again): on a phone's GPU a buffer written while a frame queued still reads it holds the page. They were the
  WebGL context's calls, none under the engine: empty. The village at High sends some 375 to 470 KB of buffers a frame
  in 50 to 60 calls (the particles' pools the most) and a 208 KB texture every other frame. Its draws and triangles
  are the engine's (the scene's and the sun's map's), and what it calls compiled as it was timed is named: the
  village's walk at High asked for two lit pipelines at 1 sample, culling back faces, not looked into.
- `perf.ts`, `programSwitches.ts`, `matrixWalks.ts`: each phase counts the programs switched and the objects walked as well as the draws (`gl.useProgram` and three's `updateMatrixWorld` wrapped as the page loads; no switches on WebGPU): a switch sets again every uniform a program reads that its material's don't, and the walk went down every hidden part too. Exact counts, where the page's ms moved by a millisecond or two with the shared PC's load: compare those first, then time on the lent 4080 (`--exclusive`).
- `perfParts.ts`: the ways of drawing timed in turns are the engine's switches (`TUNE.depthFirst`, `nearFirst`,
  `shadows`, `shadowTurns`): three's draw order, a depth pass of three's own and three's shadow map's `autoUpdate`
  reached nothing the engine draws (it reads no `renderOrder`). What the switches ask for themselves (15 pipelines:
  the depth in one pass) is said apart from what play compiled late, which `perf` failed on. Its canary is caught
  with the GPU loaded (`--screen 2880x1800@2`) and missed at 2 Mpx, as its entry says.
- `pickGrid.ts`, `inFrame.ts`: the picked meshes are drawn by the engine (`drawRust`, flat unlit, a channel a group,
  on a layer of their own over black) and read off its canvas in the task that drew it, drawn again on the browser's
  time while their pipelines compile: three's render target and `readRenderTargetPixels` had nothing to draw into,
  and `framed` (the eyes' notes of `sheet`, `live`, `fitrest`) threw at its first frame. `framed` is async now.
- `programCompiles.ts`: the compiles are keyed as the browser keys them, a stage's module, entry point and
  constants: the census by fields (`programs.ts`) counted 102 pipelines where 33 fragment stages were compiled and
  the rest came back from those in a millisecond or two, so a count of pipelines said nothing of what a boot pays.
  Modules are told apart by their labels (Bulwark names each shader's by its id, a joined one's apart), named by the
  game's shader (`Bridge.shaderNames`). Its canary is a look whose shader no list names, so a module of its own.
- `programCost.ts`: a time is the browser's clock's (`__labClock.realNow`): by the page's `performance.now`, the lab's,
  every compile read 0 ms. Salted by a comment at the code's end, the 80 pipelines took 21.5 s here; the same salt
  again came back in 1 ms of 519, the browser's caches keying a shader by its code. Salted alone, every pipeline
  pays its module's whole compile, which the game pays once a module: `costsShared` salts a module once for all its
  pipelines, the reading of what a boot pays (13.6 s where alone read 25.7).
- `screenCells.ts`, `trail.ts`, `fire.ts`: a frame is read off the engine's canvas in the task that drew it (`webGpuPixels`) and summed on the CPU. The sums were made on the GPU by a WebGL program of the lab's own (`gridSums.ts`, gone), and `cast`, `fire` and `trail` stopped at their first frame under the engine ("gl.readPixels is not a function"). What still meant three under the engine, and what reads the engine now: a wait for the GPU is the engine's device's queue (`gpuDone` in `core/webgpu.ts`, `engineWorkDone`: three's queue alone never waited for the engine's frame), the exposure a canary strobes is the engine's (`TUNE.exposure`: three's `toneMappingExposure` reached nothing, and `cast`'s strobe went unseen), a count of what compiled is the engine's pipelines (`PIPELINES.made`: three's `info.programs` is undefined on its WebGPU renderer, and sixteen checks read 0 whatever compiled), and a particle pool hidden by `visible` is hidden from the engine too (`engine/sprites.ts`). **The engine's first frame after the camera is aimed isn't its steady one**: `fire`'s fire put out read lit by the fire's bed (77 pixels 0.09 of white apart from the next frame), so a reading taken right after a camera cut draws a frame first and lets it go.
- `shadows.ts`: the hero's shadow from fewer triangles (the engine's `casterGeometry`, held whole by
  `holdShadowsWhole`) against every triangle, the pieces counted by the engine's `casters`, and his shadow taken away
  in every case: it compared his pieces cast as one (`castAsOne.ts`, since taken out) in three's shadow pass, which
  the engine never ran. Through the eyes he looks down at the ground away from the sun (`lookAtHisShadow`): level, his shadow falls
  below the view, and a check there read nothing whatever was cast (#869 failed every case through the eyes on it).
  His hidden body must cast there too (`castsUnseen`, #893: from #270 it cast nothing by design, his arms' shadow
  alone); its canary leaves it uncast. Close up, fewer triangles differ in up to 3.5% of his shadow's pixels, held
  to a share of it there (`COARSE_SHARE_EYES`).
- `studio.ts`, `looks.ts`: the studio draws by the engine (`drawRust` with a scene and a camera of its own), its
  tile read off the engine's canvas in the task that drew it; three's `readPixels` it used before has no drawing
  buffer under the engine, and `hood`, `hands`, `weapons`, `turnaround`, `neck`, `herolooks` and `maps --pictures`
  stopped at their first picture. A picture is drawn again on the browser's time until no draw is left out for a
  pipeline still compiling (the studio's lights ask for 11 of their own), with a plain grade (no vignette, no bloom)
  and the game's particles held out (the engine draws their pools with any scene: the lobby's motes were dots on the
  backdrop). The backdrop is read as the engine draws it, its mean over an empty studio and its grain's reach as the
  slack. The `faces` look is a front material and a back-faces twin of each mesh: chosen by `gl_FrontFacing` in a
  patch of three's shader, every face drew alike, and the fist read as seen through from every side.
- `throws.ts`: the vine's shot lets the bow go `SHOT.loosedAfter` frames into the hold, drawn as far as it is: held for its whole draw and the quiver's fetch from the throw, the arrow left a frame after the vine let him go (on main too).
- `trail.ts`: the trail is read with the engine's bloom out (`TUNE.bloom` 0): the game's `holdBloom` holds three's
  passes alone, and the trail was read with its glow.
- `twins.ts`: the compiles' canary is a material of a blending, side and depth none else has together (as `compiles`'s):
  a flat-shaded Phong of its own made no pipeline under the engine, and went uncaught.
- `twinsBelt.ts`: the Twins' belt skulls (`lab twins --parts belt,bomb,poison,inherit,cost,beltPictures`). A throw's record is held by itself, never by its index in `SKULLS_THROWN`: the log keeps the last 16, and `compiles` waited 300 frames for a bomb whose index had run past its end. A cloud judged through a stun is thrown to land before the blast (`CLOUD_BEFORE`): landed after it, its ticks proved nothing. The floor's pictures in each view set the view up through `lab.setup` (`setView` alone came out top-down), and found a real leak: a bomb's skull and glow stayed lying for good where a set-up cleared the effects on its fuse.
- `uiCloudIdentity.ts`: the service's health is asked once a visit (`serviceHealth` in `loot/cloudApi.ts`), so the state forgets it before and after its stub answers: a state before it asked the lab's server, and Google's button stayed hidden in a run of every state, alone it passed.
- `uiPerfAsk.ts`, `uiStates/decisionTouch.ts`: a canary's plant must land where it's judged: the prompt's moved to the window's top, onto the choice (moved down to the middle it left the choice on a 1080 screen, and went unseen on main), and the choice's padding is planted and judged on a short screen alone.
- `villageBloomLow.ts`: the bloom's pixels are the engine's own sizes at the share it was told (`Levels.now`'s
  `bloomSent`, Bulwark's post.rs), the bloom taken out by `rust.bloom`: it read three's bloom passes, 0 pixels both
  ways. Low's level switched in play makes its plain set aside (`plainSet.ts`), 72 pipelines, waited for with frames
  drawn (the switch begins as a frame tells the engine the level); and what a view first draws at Low asks for its
  own, so the bloom's switches are counted from a frame of each view on.
- `villageDaisOpens.ts`: in the hall it reads the heroes' pieces cast from fewer triangles in its frame (the engine's
  `casters`) and no mesh the shadow map alone draws shown: it drew three's shadow map to make his shadow cast as one
  again, which three's WebGPU renderer and the engine never do, and stopped there.
- `villageHallCull.ts`, `villageStillHeroes.ts`, `villageSweep.ts`: a frame is counted by the engine's own stats
  (`countedFrame`: its scene's draws and triangles, the meadow's blades among them): it was three's draws round
  `renderBufferDirect`, which three's WebGPU renderer hasn't got, and all three stopped there. The sweep's budgets were
  read again so; the switches (`materialSwitches`, `programSwitches`) stay 0. The still heroes' frames hold the sun's
  turns off (`rust.shadowTurns` 0): kept every other frame, the frames merged and apart differed by 0.5 to 1.1% with
  the heroes the same to the pixel close. Stood on the square with the heroes warm and both standing, the game never
  merged them under the engine (0 merged meshes; merged by the check's own `standHeroes`, 48 draws fewer): not looked
  into.
- `villageSunStep.ts`, `villageLampHandOver.ts`, `villageHeroShadow.ts`: a frame's draws are the engine's counts
  (`FrameStats.lampFaces`, `moverFaces`, `shadowDraws`, `shadowTriangles`); a map drawn whole is told from the movers
  over a copy by its triangles, the draws alike as the idling hero is among the movers. The moon's map at midnight is
  drawn whole every frame, a Bulwark fault (`commands/village.md`). Between two lamps his moon shadow read 0% at every
  pair, as the by-lamp reading's hold of the shadow's turns (`engineShadowTurns`) was missing there: a frame between
  turns read the map from before he stopped casting. One lamp's shadow of him reads 3 to 14% between four pairs on
  main and here, under the 15% the check asks.
- `villageSweep.ts`, `villageBudgets.ts`: the culled frame is read first and the whole one right after it in the same moment, and the second reads fewer materials and programs switched (a cottage's 158 and 76 against 135 and 49), as what the first frame of a moment draws (most likely the shadow maps) isn't drawn again: the budgets are the culled frame's alone. The draws are the game's camera's alone (`countedFrame`) and agree. Square facing 0 reads 235 draws at midnight against 187 at noon at High in every boot read (187 both at Very low); its cause wasn't looked into. The canary's plant (the hall culling all it may) is set again before the moment's second culled frame: letting the culls run again sets the hall's back to the doorway, and the canary's moments never stood still.
