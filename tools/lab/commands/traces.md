# `trace` and `recorder`

The performance traces slow games send with their player's consent (`src/perf/AGENTS.md`, the service
`server/traces/AGENTS.md`). The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `trace [code]`: a performance trace a slow game sent with its player's consent (`src/perf/AGENTS.md`), fetched
  from the traces service (`server/traces`; `--server`, else `TRACES_SERVER`, else `https://ls.wellscoped.dev`) with
  the token: `TRACES_TOKEN=...` in `tools/lab/traces.env` (ignored by git; the owner's, Dokci's `LS_TRACES_TOKEN`) or
  the environment. A code, `--latest`, or `--build <sha>` (the newest from a commit, a PR's number or a bundle's
  name); `--list` lists those kept, newest first (`--build` one's alone); `--file <path>` reads one saved before
  without the server (each fetched is kept in `tools/lab/out/traces/<code>.lspt.gz`), or the JSON the stalls tool
  reads off a page (`npm run stalls -- --scenario lobby --read "window.__traceNow()"`: a real trace of the installed
  Chrome's); `--sizes` says what each part weighs gzipped, and the trace packed each other way the format can
  (`node/tracePacking.mjs`: other steps, floors, columns as each frame's change) against its own, which the format is
  tuned by. Read as the perf overlay's
  report reads (`src/perf/traceReport.ts`): why it was sent (the scene, the detector's verdict, or the boot's or a
  loading bar's time), the boot's steps and how long it waited on its files, the frame rate and frame times over its
  play, the CPU and GPU, draws, triangles and programs, the quality and screen, the GPU by pass, the device; the
  histories a second at a time (frames, ours, late, GPU, the frames' states); the five worst seconds with the marks of
  the 5 s before each (a scene changing, a wave, a hero built, a cast); the worst frames with their slowest stages;
  the long frames; the stages; the shaders compiled late; the marks; and the `perf` command that plays it again on
  its hero, biome, screen and quality (`--throttle 4` guessed for a phone). Runs in its own process, no browser.
  The format and the report have unit tests (`test/trace.test.mjs`: a planted slow second must be named the worst,
  with the cast before it).
- `recorder`: what the always-on recorder (`src/perf/recorder.ts`) costs a frame: a fight played (`--frames`, 300;
  the foes coming, the basic attack pressed and let go, every frame drawn), each of its calls (`begin`, `lap`, `end`,
  `gpu`, `longFrame`) timed by the browser's clock, each frame's sum against 0.05 ms a frame (0.02 to 0.03 on the
  owner's PC; the timer ticks in 0.1 ms, so the mean is read). Then the trace a send would make: its snapshot timed
  apart (taken mid-fight as a slow stretch is found), packed and gzipped, read back as `trace` reports it, sent to a
  traces service of the lab's own (`node/tracesService.mjs`, for the page's origin alone) and read back with its
  token: a trace without stages or casts, one never sent or changed on its way, are problems. `--canary` makes each
  frame's recording 0.2 ms slower, which must break the budget. Then a slow boot's trace: its reveal stood in for
  (`slowBootRevealed`) and the lobby played on through its wait (`BOOT_TAIL_MS`, 45 s), the trace taken read back: it
  must hold the 45 s after the reveal and say the play after it beside the boot's time; `--canary` also takes it at
  the reveal, as before, which must be caught.
- `auto`: Auto quality's walk down from High on a slow device (`page/autoQuality.ts`, `src/core/quality.ts`). Auto is
  set as a player sets it, which starts it over from High, and fed each frame's time as a GPU-bound device takes it:
  in proportion to the scene's pixels, at the level's cost (the integrated GPU of trace JGNM-1NCF and its tester's
  report, 5 frames a second at High on a 2864x1536 canvas: run it `--screen 1432x768@2`). Each step is listed with
  when it came, and the time until the device holds 50 frames a second must be at most 20 s (12.6 s there; 36.7 at
  the old pace, a step a 4 s window and half the pixels a step). A fast device's frames with an 800 ms hitch every
  2 s must never step it down (Auto never steps back up). `--canary` runs the old pace too, which must be too slow.
