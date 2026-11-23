# Writing a lab measure

From [`AGENTS.md`](AGENTS.md): how a measure is written and what keeps every command's result the same on every boot. Paths are under `tools/lab/` unless they're given whole.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

A measure starts as a probe module: a TypeScript file whose default export takes the lab and the command's options,
and returns text, anything JSON can hold, or a `Report` (`{ text, problems }`: its problems fail the command).
[`examples/handSpeed.ts`](examples/handSpeed.ts) is a short one with every part a measure needs:

```ts
import type { Lab, Report } from '../page/lab';

export default async function handSpeed(lab: Lab, options: { canary?: boolean }): Promise<Report> {
  const start = lab.player.pos.clone();
  const rows = await lab.step(150, (frame) => ({ keys: frame < 60 ? [] : ['w'] }), (frame) => {
    // measure the frame as it would be drawn (the world matrices are up to date)
  });
  const problems = lab.player.pos.distanceTo(start) < 1 ? ['the hero never walked'] : [];
  return { text: '...', problems };
}
```

It runs on a page booted for it, after the set-up the command's options ask for (the run held in its countdown, the
hero placed, stopped and settled), and may import the game's modules by relative path. While you work on it, keep it
in `.tmp`: it is compiled afresh on every run, with the modules beside it it imports. With `--ab` those files are
copied into the other commit, so the same measure runs on both sides.

What the lab gives a probe (`page/lab.ts`):
- `lab.player`, `lab.model`, `lab.joints`, and `lab.THREE` (three.js as the game has it);
- `lab.setup(fixture)`: the run set up afresh (`at`, `facing`, `view`, `nocked`, `gear`, `fresh`, `yaw`), checked, and its
  report. The keys go by the camera, and the top-down camera is as the boot left it unless `yaw` turns it (0: `d` runs
  +x), which differs by class: the village opens at a spot of its own, at random (the warrior's boot faces it a half turn
  round from the ranger's), so a measure whose keys must go one way in the world sets `yaw`.
  The hero is built afresh unless the fixture says `fresh: false` (`compiles`, which measures the boot's own): the boot
  steps the lobby by the browser's time as its warm-ups run, and the boot's hero came to a command in a state of his
  own, `lab poses` giving other digests on one tree run to run (#852; its check sets him up again afresh after other
  frames, and its canary sets him up over himself).
  A probe may set up many cases one after another, but each follows on from the ones before it: the hero is the same
  one, and the game's clock, which his idle runs on, only goes forward (to the next whole minute at each set-up, so
  the idle is at the same moment whatever ran before; the hero's own state still carries over). A scan is the same
  every time it runs, but one of its cases run alone may come out otherwise, so trace a case by running the cases
  before it first (an option of the probe's own: `--trace=<case>`, say), or run each on a page of its own as a check
  runs the gait's;
- `lab.step(count, input?, measure?)`: frames run with each frame's input (`keys`, `m0` / `m2` for the mouse buttons,
  `look` for mouse look, `aim` for the point the mouse is over, `sight` for a point the close views' crosshair is
  turned onto: a mouse-look move a frame, over it in one or two) and measured after each, a row a frame;
- `lab.until(done, limit, what, input?)`: frames until `done`, throwing `lab: <what>` if it never is;
- `lab.spawnFoe(type, at, options)`: a foe for a measure that needs one (a mark, a lure; `options` as the game's
  `EnemyOpts`: a hero foe with its name, say), which the set-up keeps while it clears every other until the next
  set-up; it rises first as a spawned foe does (`Enemy.spawning`), and a training dummy (`dummy`) stands still;
- `lab.letWavesCome()`: the run's waves let come until the next set-up, the hero still kept whole; a measure sets one
  off itself (`G.run.wave`, its `timer` to 0) and reads its foes as they rise;
- `lab.capture(views)`: pictures of this moment as PNGs (`lab.drawing = true` draws every frame instead), and
  `lab.picture(label, views, notes)` one moment of a report's `moments`: the lab writes them as a sheet
  (`out/probes/<probe>/sheet.png`, and `sheet-2.png`... past 8 rows: `writeSheet`, as one page of every row was too
  big for the browser, which closed) and compares them in an A/B, as the sheet's (to see the frames a measure
  flagged, run the measure's input to them and picture each);
- `await lab.screen(label, notes, around?)`: this moment as the player sees it, the game drawn by its own camera with the
  page's UI over it (the HUD, a menu, a tooltip), pictured by the browser, whole, clipped round the element a CSS
  selector names (`'#hotbar'`) or to an area of the page (`screenArea(points)`: round points of the world as the
  camera shows them), as a moment of the report's `moments` (`picture`'s views show the game's canvas alone), the
  page's running animations settled first (they run on the browser's clock: an A/B's two sides caught the wave's
  banner at other moments of its fade; one a command holds paused is left as it is, and so is one a scroll drives,
  at rest while its scroll is: ended, the stash's fade was held hidden over the row it fades, `onTheClock`); taken
  through the DevTools protocol at the screen's own pixels (Playwright's screenshot put the page back on the screen
  Playwright had given it, and on a `--screen` every picture after the first showed 1920x1080);
- `timeCalls(owner, method)` (`page/timing.ts`): every call of a method timed by the browser's own clock (the page's
  `performance.now` is the lab's, which stands still within a frame), for a cost: its calls, total, median and 90th
  percentile. The timer ticks in 0.1 ms, so take a frame's mean over many, and compare sides within one A/B (the
  machine's load drifts between commands). Its `lap()` says what the calls took since the last lap: a frame's, read
  after each frame (`crowd`);
- `await lab.showOn(screen)`: the page put on another screen as the command runs (`{ width, height, ratio }`, css
  px, as `--screen` names one), as the player's window is taken to full screen or onto another monitor: the page lays
  itself out again and hears a resize, and the browser draws a frame (`wind --resize`);
- `await lab.throttle(rate)`: the page's CPU slowed `rate` times as the browser emulates a slower device's (DevTools'
  presets: 4 a mid-range phone, 6 a low-end one), sent through the DevTools protocol: times read by the browser's
  own clock take that much longer, while the lab's frames stay as long as ever. Set it up at full speed and slow
  only what's measured (`crowd`);
- `lab.aim` and `lab.pointAt(point)`: where the mouse is;
- `await lab.touchDown(at, finger)`, `touchMove(at, finger)`, `touchUp(finger)`: a finger on the page (css px) as a
  touch screen gives it, sent through the DevTools protocol, so the page's own pointer events follow with their
  pointer ids and its touch controls take it as a player's (no frame runs; each returns once the page has handled
  it). `finger` (0 by default) tells fingers down at once apart: a thumb on the move stick and the other on a skill
  (`tap`). Each touch names only the finger it changes, by its id, as Puppeteer sends them: sent as the protocol's
  docs have it (every finger down in each touch, the one lifted left out), a finger left out was never lifted. The
  game's first touch puts it in touch mode, as a player's does, and its controls show from the next frame.
  `await lab.tap(at)` puts a finger down and lifts it, and returns once the page has handled the click the browser
  makes of it, which comes in a task after the lift (`touchUp` returns before it: a button tapped hadn't heard it);
- `await lab.click(at)` and `lab.press(code)`: a click of the mouse's left button on the page (css px) and a key
  (`KeyW`, `Space`) as a mouse and a keyboard give them, sent through the DevTools protocol, so the browser handles
  them as a player's, the focus with them (a script's `click()` and events moved none and showed no focus ring);
  `lab.type(text)` puts text in the focused field as a paste or a phone's keyboard does (`Input.insertText`: a key
  pressed types nothing, as the protocol's key has no text), its input events with it;
  `lab.mouseDown(at)` / `mouseUp(at)` press the left button and hold it (a button held to act), `lab.clickOn(element)` clicks an element at its middle, scrolled to and once the page's CSS transitions are over
  (the lab's frames outrun the browser's clock, and a panel sliding back in took a click 31 px off its tab; a move
  to where the mouse already is makes no pointer move, so a click there skips it), `lab.mouseTo(at)` moves the
  mouse alone, `lab.wheel(at, deltaY)` turns its wheel, and `lab.keyDown(code)` /
  `keyUp(code)` hold a key and let it go (`AltLeft`, `ControlLeft` too). A frame the lab runs holds a key in the game
  only if its input does (`Frame.keys`): hold it there too, by the game's name (`altleft`);
- `lab.pointerLock(on)`: the pointer lock played by the page (`noCapture` in `node/browser.mjs`; the real one is never
  taken): asked for after a click or a key, it's taken, and while it's held the mouse's every event goes to the
  locked element, at the point where it was taken, its moves told as movement alone, a cancelled pointer's down
  holding back the mouse's own as the browser does. Off, it's let go, which the game hears as a lock lost (a run's
  pauses): put the view top-down first, so the game lets go of it itself (`cursor`). `lab.browserLetsGoOfLock()`
  lets it go as the browser does on the player's Esc, and `lab.lockAnswersLate(on)` holds the browser's answers
  (`pointerlockchange`) till it's set back, as a real one's come a frame or more late; `lab.keyRepeat(code)` is a
  held key's repeat (`cursor`'s Esc);
- `await lab.reduceMotion(reduced)`: the page's `prefers-reduced-motion` as the browser emulates it. Every page opens
  with it reduced (the page's decorative animation left out); a measure of such an animation (the crosshair's beat,
  `draw`) lets it run and puts it back as it ends. CSS's animations run on the page's clock, not the lab's: read them
  with `getAnimations()`, and hold one at a moment to picture it;
- in `page/geometry.ts`, the body's meshes skinned into the world as drawn (`BakedBody`), what a line crosses among
  them (`crossingsAlong`), and the distance between segments (`segmentDistance`);
- `distinctCorners(positions)` (`page/corners.ts`): a mesh's corners, each place once (a mesh repeats one for each
  face whose normals part there: the mage's staff has 12,234 points at 2,515 places).

A measure read every frame costs every frame, in every job a check runs: read each frame only what the frame's
verdicts use, and what can't change (a weapon's head, a geometry's box) once. Through the eyes, each frame read the
weapon's head off its meshes for a share no frame kept, a third of each job; the range's floor and body read every
corner of the weapon five times over, 60% of its jobs. `--profile` shows a measure's share beside the game's frames.

A measure is only as good as what it can catch:
- **Check the state happened.** A measure of a state that never came reads as clean: a probe that scripted the game
  before its run began reported no clips at full draw, because it never drew. Throw `lab: ...` or report a problem
  when the walk didn't walk or the draw didn't draw.
- **Carry a canary.** Plant the fault the measure is for (the bow moved into the hips for a frame, a hand moved
  10 cm) and report a problem when it isn't caught. Run it when the measure changes.
- **Measure, don't choose.** A pose is decided as a person would hold it and looked at in the game's views first
  (`sheet`); a measure checks it (`src/entities/models/AGENTS.md`).

Every measure is kept: from its first use it is a command of its own (its measure a module in `page/`, the command
a module in `node/commands/` and its page function one in `page/commands/`: `node/commands/AGENTS.md`), as the
carry's and the touch stick's are, or a part of one that already measures the same thing, never a probe left in
`.tmp`.

## Repeatability

Every command gives the same result on every boot, its pictures too: a commit compared with itself agrees line for
line, and no pixel of its pictures is more than 2 levels apart (the same view drawn twice with nothing changed comes
out a level apart in a few pixels, the GPU's own rounding). What it takes:
- the clock taken over at the reveal, every time on a grid of 1/1024 ms and a frame a whole number of its steps, so
  the game's frame time is exact; and one frame run with the game held still as the lab installs, so the game's timer
  counts from a lab frame, and the game's pacing of its step held over that frame (`__holdFramePace`,
  `src/core/framePace.ts`), so it starts again at the lab's first: what the browser's frames before the lab left
  it owing, a few hundredths of a millisecond, it paid back a tenth a lab frame, the game's clock stood 37 µs apart
  a minute on from one boot to the next, and the frame's grain, seeded by that clock, differed in 6 to 35% of a High
  picture's pixels, a commit beside itself (Low and Very low, with no grain, agreed). `lab rust` says the moment its
  picture is of in full (the game's clock, the camera), so an A/B names a clock that moved before its pictures do;
- `Math.random` seeded, started again as each command starts (after its modules are imported, in the same task:
  each three.js object made draws a random number for its id, and textures land from the workers while a module
  loads) and at each set-up, and as a hero's profile is found missing, just before a new one rolls its gear; and at
  each lab frame, from the last seed and the frames since (`__labFrame`), so a draw one side made and the other didn't
  moves only what's random after it in its own frame (it moved every particle from then on: a crowd's pictures differed
  by 17% of their pixels where its bodies were drawn the same); timers' callbacks draw from a stream of their own,
  since they fire by the browser's clock;
- the game's clock moved forward to the next whole minute at a set-up, storage and cookies cleared at each boot, one
  page alive at a time, and every command on a page booted for it.

Each of these was found as a cause of runs that differed:
- frames run in real time between the reveal and the lab taking over;
- a yield after every frame (async work landed between different frames);
- the loading screen's tips drawing random numbers on a timer, so a slower boot rolled other weapons;
- a saved profile and cookies kept between boots;
- two pages alive at once (one lost focus; the game lets go of the input on a blur);
- the exported commit's ez-tree alias lowercased by the lab (a second copy of three.js, other random draws);
- `Player.place` keeping the velocity (fixed in the game);
- frame times a few bits apart from boot to boot, taken from the browser's clock (a cast of a whole number of 60ths
  ended a frame early or late, one self-A/B in five);
- commands run on a page an earlier one had used;
- the random numbers started again before a command's imports rather than after (one boot in four, the haze and
  pollen spawned before its set-up lay elsewhere in its pictures);
- the first lab frame measured from the game's last real frame, a browser frame earlier on some boots (every
  emitter's bursts a frame early or late, one boot in three);
- the default profile rolled from wherever the boot had left the sequence: a commit that made one more three.js
  object as its modules loaded rolled the ranger another bow and 2 less Health than main, so every A/B of him
  compared two heroes (`ui --ab` differed in 11 of 12 pictures);
- the wave's banner taken off the page by a timer on the browser's clock: one boot in two it was still there at a
  picture, the HUD's layers laid out another way and the hotbar's thin frame lines rastered 20% brighter or dimmer
  (`light --ab` differed in one picture of 18, one run in two). It goes now as its fade ends (`ui/hud.ts`), which
  follows the lab ending it (`settleRunning`), and `screen` lets the browser draw a frame after each round it ends,
  for their ends to reach the page and its layers to fall without them.

To find where two runs part, record each frame's state and each random draw's caller in a probe and compare boots
(two fresh boots, `--setup=false`, the probe setting up itself): the first frame or draw that differs names the cause.
A page picture whose UI differs in how bright its thin lines are, nothing moved, was rastered two ways: `--layers`
lists Chrome's layers at each picture, and where the sides' differ.
