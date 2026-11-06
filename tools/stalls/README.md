# stalls: the browser's own stalls

The game played in the installed Chrome on this machine's GPU, its frames recorded and the browser traced, for the
stalls the lab never shows. Chrome on Windows draws through ANGLE on Direct3D 11. When the page needs a Skia program
that isn't built yet, building it holds up Chrome's GPU process, and the game's canvas with it, for up to seconds. The
lab runs Playwright's Chromium on a fixed clock with nothing drawn between its pictures, so it can't see this: these
stalls are the real browser's, at its own pace.

```bash
npm run stalls                                   # this tree built and served, a 45 s fight in headless Chrome
npm run stalls -- --url https://last-stand.cc/      # production
npm run stalls -- --url https://pr-194.ls.wellscoped.dev/,https://last-stand.cc/
npm run stalls -- --url this,https://last-stand.cc/  # this tree, then production
npm run stalls -- --headed --links --seconds 30  # a window on the screen, every program built listed
npm run stalls -- --variants base,cpuCanvas      # the page as it is, then every 2D canvas drawn on the CPU
npm run stalls -- --scenario boot --variants base,noParallelCompile  # then WebGL without parallel shader links
npm run stalls -- --scenario lobby --js --variants seeded --url "this?renderer=webgpu,this?renderer=webgpu&x=0"
                                                 # two URLs' heroes in the same gear (every page's dice one seed)
npm run stalls -- --scenario lobby               # standing, then walking round the lobby
npm run stalls -- --scenario storm --listed 120  # the mage's Maelstrom cast into the foes, every stall of 120 ms+
npm run stalls -- --scenario hover --hero warrior --stash 40 --view first --scale 1.25 --perf  # a report's lobby
npm run stalls -- --scenario hover --stash 40 --variants base,stillGlow  # hovering with the stash's glow held still
npm run stalls -- --scenario sweep --stash 60 --view top --window 1536x695 --seconds 12  # moving between items
npm run stalls -- --scenario sweep --stash 60 --item-ms 100 --seconds 8 --rounds 3  # the owner's pace, fast
npm run stalls -- --scenario hover --stash 60 --listed 40   # every frame of 40 ms+ listed with what was busy
npm run stalls -- --scenario stow --view top --perf --press-ms 100 --rounds 4  # Space pressed 10 times a second
npm run stalls -- --scenario heroes --seconds 20 --listed 50  # the hero screen opened and left three times
npm run stalls -- --scenario boot --url this,https://last-stand.cc/ --rounds 3  # the boot
npm run stalls -- --scenario boot --cpu-slowdown 4 --js   # on a phone's CPU, its JS by function
npm run stalls -- --scenario boot --url this,ref:HEAD~2 --rounds 3  # this tree beside a commit of its own
npm run stalls -- --url "this,this?castAsOne=0" --rounds 4 --js  # a switch of the game's, in turns, one build
npm run stalls -- --scenario boot --film --perf --window 799x384 --scale 3.75 --auto low@518400  # a phone's exit
npm run stalls -- --scenario boot --film --blink-exit 2   # the film's canary: two blinks to find
npm run stalls -- --scenario boot --resize 1920x1080       # full screen and back 5 times: the exit follows the window
npm run stalls -- --scenario boot --resize 1920x1080 --stale-wind  # its canary: an exit placed once is caught
npm run stalls -- --scenario boot --url "this?renderer=webgpu&builds" --read "window.__builds"  # a page's own record
npm run stalls -- --scenario lobby --before "window.__G.someMesh.visible = false"  # a change just before the picture
npm run stalls -- --scenario sweep --stash 60 --seconds 8 --rounds 3 --variants base,iconFilter,stillGlow+noTooltip
                                                 # one page, the variants in turn three times over, by their medians
npm run stalls -- --scenario sweep --stash 60 --seconds 6 --js   # and the page's JS, a frame's by function
npm run stalls -- --scenario lobby --js-under _renderObjectDirect --url "this?renderer=webgpu"  # what one function spends on
npm run stalls -- --scenario boot --builds --url "this?renderer=webgpu"  # each step's WebGPU node builds and new shaders
npm run stalls -- --scenario boot --view third --biome crypt --url "this?renderer=webgpu,this"  # both renderers' ends
npm run stalls -- --scenario boot --view third --cast 3@1500 --url "this?renderer=webgpu,this"  # a skill held for it
npm run stalls -- --scenario sweep --stash 60 --seconds 2 --passes  # the compositor's render passes a frame, exact
npm run stalls -- --help
npm run stalls:test                              # the tool's own unit tests
```

The report is printed and written to `tools/stalls/out/report.txt`.

## What a measure does

- **A fresh Chrome:** the installed one (`CHROME_EXE`, or Chrome's usual places) with a profile made fresh for each
  measure, so its shader caches are empty, as on a first visit after an update (the worst case). It runs headless
  unless `--headed`, with `--use-angle=d3d11` on Windows, and muted (the game's sound still plays, out of no
  speaker: the owner heard its music from a headless one), fetching nothing in the background. Its whole process
  tree is killed when the measure ends (a browser connected over CDP outlives `browser.close()`), and its profile is
  deleted. A shell whose sandbox can't delete files Chrome wrote is told which profile was left.
- **The page:** the lab's `noCapture` and `freshStorage` (`tools/lab/node/browser.mjs`), so it never takes the pointer
  and starts as a first boot. The battleground (`--biome`, the forest by default), the High preset and the performance
  overlay (`--perf`) are set by cookie, and a `--variants` change is applied before the page's scripts (`a+b`: both).
  The window is `--window` css px (1536x864 by default; a report's `window`), scaled `--scale` times (its
  `devicePixelRatio`).
- **Rounds** (`--rounds N`): each URL's page booted and set up once in one Chrome, then the URLs and their variants
  played in turn N times over, each variant's stylesheet put on the running page (`page.mjs` `useStyle`: variants
  that only add styles). A boot is most of a measure's time, and measures side by side in time are slowed alike by
  whatever else uses the GPU meanwhile. The pages not playing are paused in the debugger, so they draw nothing; the
  report says what other pages' renderers did through a measure if it was anything (20 ms or more).
- **The lobby set up as a player's is:** the hero chosen (`--hero`); his stash filled with `--stash` items (copies of
  his own in each rarity: an item moved off him so his profile is saved, the copies kept in the session and put back
  over the next load's fresh storage, `page.mjs` `seededProfile`); the view stepped to with V (`--view`), the panels
  shown again with Space. A report says which: its `Mode`, `view`, `devicePixelRatio`, and the weapon in its shaders.
- **The scenario** is played with the page's own controls: real key presses (each held 90 ms, as a finger does), mouse
  moves and clicks, as a production build has no dev hooks. Each ends with the hero's kills and damage, read off the
  scores held up on Tab, and a picture of the screen (`out/end-N.png`): a scenario that fought nothing measured
  nothing.
  - `fight`: the warrior through a wave and its choice into the next. Steel Tempest is held with the mouse circling
    and the left button down, now and then another skill, and Continue after a few seconds.
  - `lobby`: standing, then walking round the lobby.
  - `renderer`: the pause menu's renderer switch, on a page of its own: the plain address on WebGL, its button loading
    the WebGPU address, the plain address on WebGL again with an old cookie saying WebGPU. Its notes say `WRONG` where not.
  - `firing`: shooting at the lobby's dummies with the left button, a shot about every half a second (`--hero ranger`).
  - `firingPast`: the same shots away from the dummies: what `firing` costs over it is what striking them costs.
  - `hover`: the lobby's items hovered, a quarter of the time each: the mouse gliding over the world (the frames to
    beat); over each equipment slot and the stash's first ten items in turn, its tooltip following; swept along the
    stash's items in view, a new one every 250 ms (`--item-ms`), as a player runs a row down looking for one; then
    held still on a
    stash item, those that fit its slot lit. Its notes say what it hovered: with nothing in the stash (`--stash 0`),
    nothing lights.
  - `sweep`: `hover`'s sweep alone, three quarters of the time, after a quarter over the world: the same run's
    frames to beat, as a machine busy with something else slows both.
  - `stow`: the lobby's panels stowed and shown again with Space, as the owner pressed it "rapidly": a quarter of
    the time with them shown (the frames to beat), a quarter stowed (practice: the run's bar at the bottom), then
    Space pressed every 200 ms for the rest (`--press-ms`), the mouse over the world throughout.
  - `pause`: the pause menu opened and closed with Esc twice, the screen pictured every 150 ms for 1.5 s after each
    press (`out/end-N-pause-<press>-<n>.png`), and how long the menu took to show or go said for each.
  - `heroes`: the hero selection screen opened by the lobby's Change hero and left by Back, three times, after a
    fifth of the time in the lobby (the frames to beat): each trip's way in and way out a phase of its own, so the
    first opening is read apart from the ones after ("brief lag when reentering hero selection room").
  - `switch`: another hero chosen from the hero selection screen, the warrior, the ranger and the mage in turn, each
    choice a phase of its own, and how long each took to bring the lobby back said ("changing hero is a little
    slow": WebGPU's 306 to 331 ms, WebGL's 213 to 270, the hero's build most of both).
  - `storm`: the mage in a run, walking away from the foes a side of a square at a time and casting Maelstrom back
    at those following him in a line, every other side: its storm draws them in and whirls what it kills.
  - `boot` (`boot.mjs`): no set-up and nothing played. In a fresh Chrome the game is loaded as a first visit has it
    (every cache empty, no saved game, its own settings: Auto's quality, its battleground; the perf overlay with
    `--perf`), then loaded again as a return (its caches, the offline worker and the saved game kept), each
    recorded from the document's start and traced from the navigation to `--seconds` after the lobby's reveal (3
    by default). Its steps are the loading screen's, read off it as it's drawn (`page.mjs` `bootRecording`), so
    a build without marks of its own is timed alike: the document fetched, `Loading…` (the scripts fetched and
    run), each label `loadingStep` shows, the loop started (the bar full, waiting for smooth frames), the logo
    blown away, the lobby revealed. `--cpu-slowdown N` slows the page's CPU as a phone's (any scenario).
    `--stall-blow ms` holds the page up once in the logo blow's first frames, as a fast machine stalled by the GPU
    busy elsewhere: the blow's watchdog must not take it for a slow device (`src/ui/logoWind.ts`). A build that
    warms the fight's programs after the lobby shows (one with the fight's loading bar, `#readying`) is watched till
    they're warm (the game's `fight warm` mark), Start pressed first where they aren't by then, as a first visit
    leaves them for it (`page.mjs` `startIfCold`). `--before`'s value, if it gives one, goes to `out/read-N.before.json`, its trace stopped by then (the page's frames with no trace on them). `--warm-behind`: Start is never pressed, and the lobby is watched till the fight has warmed behind it and 5 s after. `--cold-return`: the first visit leaves without pressing Start,
    so the return finds its maps kept and the fight's programs never compiled (a visit that never fought, a deploy
    that changed a shader); a build that warms its fight before the lobby is said to have left it warm all the
    same, its return no cold one. `--stall-lobby ms` holds up each of the lobby's frames for a second after its reveal, the
    canary of its frames a second (50 ms: 16 to 17). `--angle` traces ANGLE's own work too (any scenario): a shader
    compiled at a draw (`D3DCompile`), a program linked or waited for. Each boot says how long after the reveal the
    loading screen was gone (its plain fade is 0.9 s). `--film` films the loading screen's exit (`film.mjs`): the
    frames Chrome's compositor drew, from half a second before it begins to leave till half a second after it's gone,
    written as a sheet (`out/film-N.png`, each frame with its time from the reveal), and any frame (or run of up to
    three) unlike the frames either side of it, where those are like each other, listed as a flicker, with a sheet of
    their own (`out/flickers-N.png`). `--blink-exit n` is its canary: the loading screen hidden for a frame n times,
    every 4th frame from the reveal, each of which the film must find. `--auto level@px` boots as a device whose Auto
    settled there (a report's Quality line: `low (setting auto, at most 0.52 Mpx)` is `low@518400`): on Low the exit
    is the plain fade, as on the owner's phone. `--resize WxH` takes the window to that size and back as the page
    loads, `--trips` times (5 by default): the first time it waits there till the exit is made ready, so it's made at
    one size and shown at another (`windFit.mjs`). At each of the exit's draws on screen, the places it draws with
    (the loading letters' box, the lobby logo's corner and size, the canvas's size) are checked against where they
    are; each boot says the most any was off, and which, past 0.1 px, and how far the lobby logo moved once the exit
    was gone from where its last draw left it (`wind-N.json`: each draw's places, the lobby logo's snapshot's size and
    the page's). `--stale-wind` is its canary: each place the exit sets after its first ignored, so it must read them
    left behind. `--film-logo` films the exit at the window's full size and cuts its frames from the reveal on to the
    lobby logo (`out/logo-N.png`): the particles landing and the logo taking over from them, as the player sees it
    (the variants `noLobbyLogo` and `noWind` film each half alone). How the particles' picture at rest stands against
    the logo is measured, pixel by pixel, by the lab's `wind` (`tools/lab/COMMANDS.md`).
- **Recorded in the page:** every animation frame's interval and whether the item tooltip showed in it, every change
  to the page's HTML (a `MutationObserver`: what changed and on which element), and the scenario's phases
  (`markPhase`). The page marks the trace (`console.timeStamp`) as its clock starts, which puts them all on one clock.
- **Traced in the browser:** `toplevel`, `gpu`, `viz`, Skia's shaders and the timeline. Only Skia's
  `driver_compile_shader` and `driver_link_program`, the page's mark, and work of 0.5 ms or more on any thread (by its
  name, thread and times alone) are kept, as they stream in: a 20 s trace with Skia's draws in it was 250 MB.
  With `--js`, V8's sampler too (a sample every 0.1 ms), this tree then built unminified with its source maps, so
  each function is named where it's written (`render core/renderer.ts:610`). With `--passes`, the compositor's
  draws too (`disabled-by-default-viz.quads`: each frame it drew, each render pass it began and each quad, of what),
  in a buffer of 400 MB: they're 20 MB of trace a second, and a sweep's filled Chrome's 200 MB, which then dropped the
  trace's start, so measure 2 s with it (a buffer of 1 GB was never sent back within the minute). The page marks the
  trace again as it stops (`<mark>:end`), which puts a trace that lost its start on the page's clock all the same.
  A trace Chrome never ends (no `tracingComplete` in a minute) is lost: in rounds its measure is played again.

## The report

For each measure:
- **Frames:** how many, their median, how many took over 100 ms and how long those took in all, and the worst five;
  and each phase's: frames a second over its time and the share that **missed the screen's refresh** (1.5 times the
  fastest phase's median or longer), its median, 90% of them within what, the worst, the share the tooltip showed in
  (a phase meant to show it that reads 0% hovered nothing), and **the browser's work for the page**, ms a second (its
  style, layout, paint, layers, raster and compositor frames; not the page's scripts nor the GPU running its commands).
  Under each phase of two seconds or more, **a second at a time**: the frames drawn in each of its whole seconds and
  the browser's work in each, ms: a cost that piles up as the player goes on falls through it, which the phase's
  sums average away (the owner's overlay fell from 144 to 28 over 4 s of moving between items).
  With `--perf`, **the perf overlay's GPU time** too, for the phase and a second at a time (ms a frame, read off the
  overlay as it shows it: its timer queries over the game's draws, and whatever else the GPU did between them). The
  trace's GPU work is the CPU's side of it: the hover's drop was the browser's compositor drawing the stash's masks
  every frame, which raised that reading from 5.4 to 6.3 here (variants `noArcMask`, `noStashMask`) and the owner's
  from 5 to 14, where nothing else in the report moved.
  Under each phase, **a frame's work**: what each thread spent its time on, shared out a frame, the most first (each
  piece's own time, less the work the trace kept inside it; the GPU's waits for the screen left out), and **a missed
  frame's**, the same over the frames that missed.
  With `--js`, **a frame's JS** too: each function's own time, and its time with what it calls.
  With `--passes`, **the compositor's draws**: the frames it drew, its render passes and quads a frame, and the
  quads' kinds, the most first. A pass is a texture drawn and drawn again into the frame: the page alone is one, and
  each mask, filter or opacity round more than one layer that changes in a frame is one more (the stash's hover drew
  2.6 a frame, where the glow's fade and its arc's mask were 0.8 each).
- **The changes of the page's look:** every change its scripts made at once (one call of the page's observer), by
  kind (the change it made most, the element named by its classes after it: `div.sitem.match` the stash's items
  lit), the costliest kinds in all first: how many, of how many changes each, the browser's work in the time after
  each (to the next change, 300 ms at most) over the quiet phase's in as long (the phase of the least work), and the
  share of the frames in it that missed. A change's time runs to the next one, so a fade's cost lands on the small
  changes after it: confirm with a variant.
- **Programs:** the Skia programs linked, how long in all, and the longest. With `--links`, every one: when, how long,
  the innermost tasks it was built in, and the page's changes in the 150 ms before it.
- **Each stall of 300 ms or more** (`--listed` sets it, down to 20):
  - the programs built in it, and the tasks each was built inside;
  - the longest tasks (20 ms or more) on any thread through it, and the work in it as a frame's work is given;
  - with `--js`, its JS by function, with what each calls: a phase's is a frame's mean, where one stall's is lost
    among the frames round it (it named the hero screen's reopening: the hall's heroes built again each time);
  - the page's changes in the 400 ms before it, by kind and element, the most frequent first.

A boot's report says when the lobby was revealed and the page first painted, the files fetched (bytes over the
network: a cache's are none), the maps the game's workers made (how many, from when to when, their work in all, how
much of it asked the store for them, the longest, and when the workers were asked for and came up: the game times
each, `src/core/textures.ts`; a build before that lists none, or not all), how the loading screen
left (the logo blown away, its blow cut short by its watchdog, or a plain fade and why), when the fight was warm (and
when Start was pressed for it), the game's warm-ups with their steps, the longest first (`warm <part>` measures:
its build, compile, waits for its maps, their uploads and its links, and draw, each but the waits one task the
lobby waits on), the lobby's
frames a second till Start was pressed (counted as the perf overlay counts them, the frames of the second up to each
quarter second from a second after the reveal: the fewest and when, till when they fell short of 90% of the screen's
rate, and what the threads and the page's JS spent the fewest's second on) and, for each step, when it began, how
long it took, its frames and the longest the page was held up in it, its long tasks and Skia programs, what each
thread spent its time on in all and the GPU process's main thread apart (it runs every page's GL and the compositor:
anything long on it holds every frame up), the threads its GPU compiles ran on (ANGLE's tasks: how many, how many at
once on average and at most, which says whether a wait for links is bound by the threads or by the work handed to
them), with `--links` its Skia programs counted by where they were built (the innermost tasks: a tile's raster,
the compositor's frame), with `--js` its JS by function, its own time and with what it calls; at
the end, each URL's boots by visit over the rounds, each step's median and range, and the lobby's fewest frames a
second.

With more than one measure, they are listed side by side at the end, each phase's frames a second and share missed
with them; with `--rounds`, then by variant: each phase's frames a second and the browser's work, the median over the
rounds and the range.

## Reading it

- **A program linked in the stall:** something on the page drew a new kind of thing (a shadow's blur, a gradient, a
  filter). The changes listed before it say what moved. Make it draw nothing new mid-game: put it on a layer of its
  own, draw it in WebGL (as `ui/overlay` does), or show it once at load.
- **Long GPU tasks, no program:** the game's own WebGL work, such as a three.js program compiled mid-game, which
  `core/shaders.ts` and `game/warmup.ts` exist to prevent, or ANGLE translating one.
- **Neither:** the stall came from outside this browser: another program on the GPU, or the driver.
- **A phase slower than its run's away phase:** its frame's work says which thread pays and for what. On the page's
  main thread, `UpdateLayoutTree` (style), `Layerize` and `Commit` grow with each layer an animation keeps moving
  (each is styled again every frame the page has one, and the tooltip following the mouse gives it one a move); on
  the GPU process, `DirectRenderer::DrawFrame` draws every layer, filter and mask again each frame something in them
  moves; `DoEndRasterCHROMIUM::Flush` is a layer painted again. `FunctionCall` on the main thread is the game's own
  frame (about 5 ms here).
- **The GPU is the game's first.** The owner's scene takes 6 ms of the GPU a frame (its report's GPU split), and at
  144 Hz a frame is 6.9 ms: whatever the page adds there in a frame (a filter's pass drawn again, a layer painted)
  costs that frame. In a missed frame's work, `CommandBufferService:PutChanged` of 14 to 30 ms is the GPU process
  held up running what it was sent.
- **Frames a second move with whatever else is on the GPU; the browser's work doesn't.** With another game open in
  a browser beside it (the owner's), one variant read 102 to 124 a second measure to measure, base 98 to 123 run to
  run, and the away phase fell to 127, while the browser's work held within a tenth. Compare variants by the
  browser's work, over `--rounds`, and trust frames a second only from runs whose away phase holds the screen's rate.
  With the screen off or locked, Windows paces frames at 60: every phase reads 60, and only the work compares.

**Look at the machine first.** In October 2026, 1.4–1.9 s stalls in the owner's Chrome (RTX 4070 Ti, driver 610.88) went
away with a reinstall of the NVIDIA driver. This tool, run in a fresh profile on the same machine, never showed them.
When stalls show in one person's browser alone:
- ask for a run of this tool on that machine before tracing the game;
- on a machine shared with other agents' browsers, run it again and compare medians: their GPU work is in no trace of
  this browser.

**A 20 s fight** on this tree in headless Chrome 154 (RTX 4070 Ti): 38 programs linked, 455 ms in all, the longest
27 ms. 2 frames took over 100 ms (243 and 174), and none took 300 ms or more.

**Hovering the stash** (issue #267: the owner's lobby fell from 140 frames a second to 44 while hovering items):
production as the report had it, the warrior with 40 items in his stash, in first person at 1.25, his weapon held on
for 10 s, ran its median frame at 20.9 ms (48 a second) against 6.9 away from the items; with the glow's loops held
still (`stillGlow`), 6.9. Each of its three loops alone cost as much (`stillPulse`, `stillArc`, `stillSheen`: 20.8
to 20.9), and on layers of their own, 13.9 (`glowLayer`): each painted its glow again every frame. Moved by the
compositor alone, 6.9 (`src/ui/styles/AGENTS.md`). With the stash empty (every measure before it), nothing lit and
nothing showed: 145 a second, headless or in a window, the tooltip shown or not.

**Moving between the stash's items** (the owner's next report, on #269's first preview: down to 34 a second): the top
view in the forest, 1536x695 at 1.25, 60 items. Its glide phases read 143 a second; the sweep, 72 (13.9 ms) against
6.9 away. A frame's work showed why: with 30 items lit, their 90 loops (composited) cost the main thread 1.8 ms of
`Layerize`, 1.1 of style and 0.8 of `Commit` a frame, and the compositor 3.7 ms of `DrawFrame`; with the game's own
5 ms, a frame took two of the screen's. Each loop stopped alone changed nothing (`stillPulse`, `stillArc`,
`stillSheen`), nor did the lit items' filters (`noFocusFilter`, `noLitFilter`, `noDimFilter`) or the stash's mask
(`noStashMask`); all three loops stopped, 7.0 (`stillGlow`). The loops on the item hovered and the slots alone held
143 a second in every phase (`focusLoops`; the pulse kept on every lit item too, `focusLoopsPulse`: 143, its
compositor's draw 1.7 ms a frame against 0.3). What was left were frames of 100 to 250 ms as the hovered item changed:
the 60 items whose focus changed made layers for their fades and painted again, the worst 167 ms; every item a layer
all along, 49 (`itemLayers`; `will-change: transform` alone, `itemMoveLayers`, 195). The focus kept across the gap to
the next item (`src/ui/menus.ts` `focusSlot`) took the glide's and the held item's frames to 90% within 7.1 ms.

That preview still dropped for the owner (105 a second, its 1% low 36), and the sweep's median of 7.0 had hidden it:
its frames came at 99 a second, a third of them a refresh late (hence frames a second and the share missed, above).
A missed frame held three times an average frame's style, layers, painting and compositor's draw: a change of slot,
the 60 items' fades into and out of the focus and the glow's, the tooltip's new card. Over rounds, the glow's fade cut
read 7 to 19 a second more in frames but no less work; the items' filters moved onto their icons (`iconFilter`) did
a fifth less every run (538 to 559 ms a second against 616 to 747): each filter on an item, itself a layer, was a pass
of the compositor's own, drawn again every frame its glow moved. Its look kept by colours painted once
(`src/ui/styles/_items.scss`). This tree against that preview, 3 rounds each: 422 ms a second against 556 sweeping.

That still dipped for the owner, hovering "pretty quickly": at 100 ms an item (`--item-ms 100`) the sweep read 95 a
second. Split by variants over rounds, the tooltip's new card was a small part (`noTooltip` 105) and the focus's look
nearly all of it (`noFocusLook`: nothing lit or dimmed, 143; the browser's work 282 ms a second against 703). Hence
the focus moved only once the pointer rests on an item for 200 ms (the owner's own idea, `src/ui/menus.ts`
`FOCUS_DELAY_MS`), the glow's loops on that item (`.focal`) rather than the one under the pointer: at 100 ms an item,
144 a second, none missed. Resting on each item in turn (300 ms an item), each change of focus still cost about
70 ms of the browser's work, 133 to 136 a second (4% missed): no one part of it (the fades, `snapFocus`; the items'
colours painted again, `keepColours`; the glows painted at load, `glowLayers`, twice the work) but all of them, fades
cut and colours kept together 142.

The owner found the whole focus waiting laggy: the item under the pointer is lit at once now, the others once it
rests. Each kind of change's own cost (the changes of the page's look) found two things. The tooltip's comparison was
taken apart and stacked again on every mouse move (`attr class on div.tt-cards`, 150 a sweep, 10 to 16 ms of work
after each), now measured once a card (`src/ui/tooltip.ts`). And a change of focus cost 40 to 90 ms of work over the
away phase's, half of it the 30 to 60 items fading at once and the rest painting them again: the others lit by their
glow and size alone and the rest dimmed by opacity, at once, the item under the pointer alone fading in
(`compositorFocus+snapFocus+focalFade`), 125 to 138 a second resting on each item against 78 to 90; fading in alone
(`snapOut`), no better than all the fades. `--js` showed why so little is left to the page: the game's lobby frame is
4.7 to 4.9 ms of JS of the 6.9 a frame has at 144 Hz.

**Stowing the lobby with Space** (the owner: pressed rapidly, 144 frames a second fell to about 70 in the perf
overlay): the warrior in the top view, 1536x695 at 1.25, 60 items, the overlay shown, Space pressed 10 times a second
(`--scenario stow --press-ms 100`). Headless, production held 118 a second pressing (6% missed) against 143
standing. A press cost a refresh: about 2 ms more of the game's JS, 1.5 to 2.4 of style and 1 of paint over a
frame's 5. By kind, two changes paid for nothing: the hotbar built again each time the lobby's practice started (22
to 55 ms of work after each), and the overlays down the left moved by `left` on every frame the panels slid (300 to
326 moves a measure, each laid out and painted again, the fold tab's box read every frame). Neither is left
(`src/ui/AGENTS.md`): this tree read 128 a second (10% missed), and over 4 rounds in turns the browser's work was
no different (407 ms a second against 383): the rest is the panels' own fade and slide. The owner's 70 isn't seen
headless.

**A 60 s storm** (the mage's Maelstrom, after a report of lag with 7 or 8 bodies in it), on #221's tree and on
production (no ragdolls): 14 and 21 kills, the median frame 16.7 ms on both. Each had one frame over 100 ms (167 and
183 ms), at 0.8 s into the run: the HUD's first paint in it, 18 Skia programs built for its hotbar. After that the
worst frame was 50 and 67 ms.

## The code

| File | Job |
| --- | --- |
| `stalls.mjs` | The command line: each URL and variant measured in turn, the report written |
| `options.mjs` | Its options read and checked, and the usage |
| `chrome.mjs` | The installed Chrome started on a fresh profile, connected over CDP, its tree killed |
| `serve.mjs` | This tree's production build (into `out/dist`), served by Vite's preview server |
| `scenarios.mjs` | What the player does |
| `boot.mjs` | The boot: a first visit and a return in a fresh Chrome, each traced |
| `variants.mjs` | Changes tried on the page before its scripts |
| `page.mjs` | What runs in the page: the recording, and the states the scenarios wait for |
| `trace.mjs` | The browser's trace, its events filtered as they stream in |
| `within.mjs` | Waiting on the browser with a limit |
| `analyze.mjs` | The page's frames and the trace on one clock: the programs, the stalls, what was busy, what each change cost |
| `profile.mjs` | The page's JS as V8 sampled it (`--js`), summed by function |
| `sourceMap.mjs` | The build's source maps read, to name the page's functions where they're written |
| `report.mjs` | The findings as text |
| `test/` | Unit tests of the command line, the analysis, the JS profile and the report on made-up traces |
