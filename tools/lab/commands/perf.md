# `perf`

The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `perf <skills>`: skills cast in turn as the player casts them (`page/perf.ts`; `maelstrom,glacialNova`), the
  biome's foes coming at the hero (`--foes`, 10), every frame timed as the game's performance report times it
  (`ui/perfHud.ts`, on the browser's clock: `perfClock`) and summed by phase: standing (60 frames), then from each
  press (`--apart` s, 1) to the next, the last to `--after` s (4). Each frame is timed whole by the browser's clock,
  drawn and waited out on the GPU (a pixel read back: `gl.finish` returned at once under ANGLE's D3D11, and the
  frame read 7 ms with the GPU's timer at 13 to 29), then a task yielded (the GPU's timer queries come back only then);
  each phase says the frame, the page's work (the update by stage, the render), the GPU whole and by pass (where the
  browser times it, `EXT_disjoint_timer_query_webgl2`), the draws (the GL draws, as the overlay counts them) and
  triangles, and the particles' fill (`page/particleFill.ts`: each live particle's disc as its shader sizes it, in
  the scene's pixels, every layer: the fill a phone's GPU pays, which a desktop's GPU times don't show; Glacial
  Nova's was 15 times the scene's pixels on #243's phone while the particles were sized by the canvas, 1.4 times
  since); `--frames` lists every frame. `--biome` (forest), `--view` (top), `--facing`, `--at`, `--gear`. `--lobby`
  casts in the lobby, the run abandoned for it (its camera lower and nearer than a run's, its dummies the only
  foes; the aim `--facing`'s way from where the lobby stands him): a report from play had Void Lance at half the
  lobby's frame rate, which no way of casting it there showed (the GPU 4 to 5 ms with it and without, each of four
  ways; its particles' fill twice the lobby's own, 3 times the scene's pixels) and the report's own casts before and
  after that stretch didn't either: the PC's other load. A channel counts as cast if it was ever channelled (by
  its cooldown alone, Void Lance held 3 s read "pressed and never cast"). Run it on
  a phone's screen, boot and CPU: `--screen 832x384@3.75 --boot low@518400 --throttle 4` (#243's phone: booted as Auto
  settled there, the hero built at Low's detail and the warm-ups run at it), or `--quality low@518400` on the lab's
  own boot (the level and the most pixels Auto lets the scene render, put to use before the set-up, the hero built
  again at its detail, and at the page's after). Read the GPU at `--throttle 1` alone: a slowed CPU feeds the GPU slowly, and a pass's time runs from its
  start to its end, its waits for the page's commands with it; on a desktop the scene pass's GPU time often matches
  the render's CPU time, as the GPU waits on it, so a triangle cut shows smaller there than on a phone whose GPU sets
  the pace.
  `--device phone|phone-hot|laptop` plays a device players reported a slow game on (`node/devices.mjs`), at the frame
  rate it had: no browser slows its GPU and the shared PC's GPU isn't clocked down, so its GPU is played by this one
  drawing its screen (in css px, as its reports give it) at more pixels, the factor set so the GPU's time here reads
  what the device's reports read, on the owner's RTX 4070 Ti (another GPU needs its own); its quality is Auto's there
  (`--quality` overrides it), its CPU left at full speed (the devices are held up by their GPUs, and a slowed CPU's
  waits swell the GPU's timer: the phone read 24 ms at 1.5 times slower, 13 at full speed), and each phase says
  `as the <device>: the frame N ms, M fps`, its GPU's. Set on the forest lobby (`--foes 0`): the phone cool 6 times
  its pixels, 75 fps (its reports: 65 to 83), hot 23, 24 fps (24 to 26, from its 15th s on Low, a cheaper level
  slower: the phone heating, not the game), the tester's laptop (AMD 0x15E7 at 1440x731@2) 25, 24 fps (its GPU 35
  to 47 ms, 24 fps). It's an estimate: a phone's tiled GPU spends its time otherwise than a desktop's, so a scene
  far from the lobby may read off; set a new device on its own reports (`lab trace`) the same way. A cast pressed and never made, a shader compiled while it was timed, and frames all read 0 ms are
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
- **`--village --fly`** (`page/perfFly.ts`; from the owner: "we support free camera via dev tools now, can you add a lab test that flies above the village? might catch some other performance issues this way"): the dev tool's own free camera (`src/dev/freeCam.ts`, taken from the top view as F9 takes it, put at each frame's place by `placeFreeCam`) flown round the village high up looking in, round it low looking along the way and straight across it over the roofs, 240 frames a leg, each a phase timed as the others are. Flown twice: the first flight meets what no frame has drawn yet, the second is the village as it stays. Each leg says what it made for the GPU and where its three dearest frames were, by the render, the triangles and the draws (the camera's place and the way it looked). Each frame is checked to have been drawn from where the flight put the camera; `--canary` plants 200 boxes over the middle, which the high round's draws must count (1026 a frame against 826). On the owner's 4070 Ti at High, 1536x864 at 125%: from high up 825 draws and 3.0M triangles, the render 8.2 ms and the GPU 9.9; low 362 draws, 4.4 and 8.4; a frame now and then of 7M triangles and 1100 draws (the lamps' still shadows drawn again). About 150 frames into the first leg the page's whole frame, its update too, takes 1.7 times as long for 25 to 50 frames, whichever side the camera is on and never in the second flight: a moment's cost, not a place's. **It is the lobby's crest leaving** (`src/ui/crestBlow.ts`, 8 s after the village shows: its fade, 1.2 s of `.logo-art`'s opacity, or its sand): held from leaving, no frame of two flights was slow. What the game does in those frames is what it does in the others (one update, the same draws and program switches, the lamps' list unchanged, nothing warming or built behind the lobby, the same quality, the hero as still), and neither a full collection of the heap before the flight nor the logo on a layer of its own (`will-change`) moved it; why a page animation slows the game's own frames here isn't known, nor whether a player's browser, which presents every frame anyway, pays it (the lab's frames run back to back and are presented only while the page animates). Found by `--profile`'s kept profile cut into frames.
- **`--village --parts` runs over the shoulder too** (`--view third`): it left for the village a second time, and Esc there put the view back on top, the run saying only "the view is third, not top" (a measure's own error is said now, not the set-up's after it). **Read its GPU rows with the GPU loaded** (`--screen 2880x1800@2`): at the owner's 2 Mpx a part's row wanders by 0.4 ms and its canary misses. What it read on the 4070 Ti at High, over the shoulder on the square: the GPU's frame 4.4 to 7.1 ms by the way he looks at 2 Mpx, so the GPU keeps 144 a second there but for a third of the ways; loaded (20.7 Mpx, 22 ms), all but the sky 15.3 ms, the meadow 6.3 of it and the ground 2.0, no other part over 0.2. **The page's work is what holds the frame**: 8.3 ms (the update 1.8, the render 6.5) against 6.9 for 144 a second, and the hero is over half of it: 2.2 ms of the render for his 68 draws, 1.0 for his shadows, 1.2 of the update. On WebGPU his parts are drawn as one (`models/drawAsOne.ts`); on WebGL each draws on its own.
