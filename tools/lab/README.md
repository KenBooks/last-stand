# The lab

The lab plays the game in a headless browser and measures it as the player sees it. Each command boots a fresh page,
runs the game on a fixed clock with scripted input, and reports numbers and pictures. A command gives the same result
every time, so a change can be compared with `main` line by line and pixel by pixel.

What each measure checks, how it works and why it was built that way is in [`COMMANDS.md`](COMMANDS.md) and
[`AGENTS.md`](AGENTS.md).

## Quick start

```bash
npx playwright install chromium   # once (or have Edge or Chrome installed)
npm run lab:serve                 # keep this running in a terminal of its own
npm run lab -- help               # every command and its options
npm run lab -- sheet              # the hero pictured in the game's views: tools/lab/out/sheets/latest/sheet.png
npm run lab -- gait --ab          # the hero's walk, judged against main's
```

With `lab:serve` running, the next command's page is booted before you ask for it, so most commands answer in
seconds. Without it, each command boots a page of its own first, which takes about 15 s. `npm run lab -- stop` stops
the server.

## Commands

**The hero's body**

| Command | What it measures |
| --- | --- |
| `sheet` | The hero in the states the player sees him in, pictured from the game's views and close up |
| `gait` | The walk and the run, judged as a person's: the steps, the feet on the ground, hops, balance |
| `stops` | The hero coming to a stop from a run, as a person stops |
| `form` | The run against a real runner's: cadence, joint curves, lean, arm swing |
| `feet` | The feet against the ground, on level ground and by the dais's edges |
| `range` | Every joint against the range a real body's joint has |
| `eyes` | A skill as the eyes see it: the blade across the view, the blow, both hands on a two-hander |
| `carry` | The ranger's carried bow against his body |
| `check` | All of the above that a change to how the heroes move needs, side by side |

**What the player sees**

| Command | What it measures |
| --- | --- |
| `ui` | The UI in each of its states, pictured, with every element's box |
| `touch` | The touch controls' move stick pushed by a finger |
| `tap` | The touch buttons of the skills aimed by holding, tapped and dragged |
| `light` | How bright the frame is, in each biome and view |
| `health` | The look of the screen as the hero's Health runs low |
| `cast <skill>` | A skill's effect frame by frame: its light, its flashes, late shaders |
| `trail` | The trail a swung weapon leaves: on the weapon's path, through every blow, gone once it's still |
| `draw` | A drawn shot held at full draw: the glint on the arrowhead, the crosshair |
| `held` | Each held skill's preview, ready and on its cooldown |
| `blink` | The mage's blink: where he lands, and the foes it dazes |
| `death` | Each skill's kills as they fall: how hard and which way they're thrown, and nothing through the floor |

**How the game plays**

| Command | What it measures |
| --- | --- |
| `spawns` | How the foes come in: by which gates, where, and when the boss comes |
| `gear` | What full sets of gear give each class |
| `crowd` | A crowd killed at once: what its bodies cost the frame, as on a low-end device |
| `music` | Which music plays where, and how it fades, as WebAudio plays it |
| `sound` | A skill's sounds written as WAV files to listen to, and what they're made of |
| `coop` | Two games playing together over a slow link, each judged against the other |

**Your own**

| Command | What it does |
| --- | --- |
| `probe <module>` | Runs a measure of your own (below) |
| `eval <expression>` | Evaluates an expression in the page, with `lab` in scope |
| `live <step>` | A page kept between steps, for trying a pose or a look by hand (below) |
| `status`, `stop` | Shows what the server has booted; stops it |

## Trying things by hand

`lab live` keeps one page up between steps, each on the state the last one left, so a look takes under a second:

```bash
npm run lab -- live start --class warrior --view first --gear twoHanded --weapon Maul
npm run lab -- live picture --over reference.jpg          # a reference laid over the frame
npm run lab -- live picture --look parts --crop 0.5,0,1,1 # each part a colour, and where each is
npm run lab -- live eval "lab.joints.elbowR.rotation.x += 0.2"
npm run lab -- live inspect handR                          # what's in the hand, and where
npm run lab -- live stop
```

The pictures go to `tools/lab/out/live/`. When the source changes, the next step boots the page again and replays
the steps so far. `--look wire|faces|parts|bones` works on `sheet` too.

## Options

Every command takes these:

- `--ab`: also run it on `origin/main` (or `--ab=<ref>`) and show what differs: the lines, and the pictures that
  differ, marked in `out/ab/<command>/`.
- `--canary`: plant a known fault, and fail if the measure doesn't catch it. Most commands have one.
- `--watch`: run it again each time the source changes.
- `--profile`: show where the command's time went in the page.
- `--screen 1280x720@3`: put the page on a screen of that size and pixel ratio (a 4K screen at 300%).
- `--screens a,b`: run it on two screens and compare them.

Many also take `--pictures=false` for the numbers alone, and the hero's set-up: `--class`, `--view top|third|first`,
`--at x,z`, `--facing`, `--gear`. `npm run lab -- help` lists each command's own.

A command exits with 1 when it fails or finds a problem, so it can gate a script.

## Output

Everything the lab writes goes in `tools/lab/out/`: each command's pictures in a folder of its own, an A/B's
differences in `out/ab/`, and the other side of an A/B kept in `out/ab-cache/` so it isn't run again.

## Writing a measure

A measure starts as a probe: a TypeScript module whose default export takes the lab and the command's options and
returns a report. [`examples/handSpeed.ts`](examples/handSpeed.ts) is a short one:

```bash
npm run lab -- probe tools/lab/examples/handSpeed.ts --canary
```

A good measure checks that the state it measures happened (a walk that never walked reads as clean), and carries a
canary: a fault it plants and must catch. A measure worth keeping becomes a command of its own. `AGENTS.md` says how,
and lists everything the lab gives a measure.

## Tests

`npm run lab:test` runs the unit tests of the lab's own code in about a second. The PR build runs them too.
