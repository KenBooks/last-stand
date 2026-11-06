# `trace` and `recorder`

The performance traces slow games send with their player's consent (`src/perf/AGENTS.md`, the service
`server/traces/AGENTS.md`). The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `trace [code]`: a performance trace a slow game sent with its player's consent (`src/perf/AGENTS.md`), fetched
  from the traces service (`server/traces`; `--server`, else `TRACES_SERVER`, else `https://ls.wellscoped.dev`) with
  the token: `TRACES_TOKEN=...` in `tools/lab/traces.env` (ignored by git; the owner's, Dokci's `LS_TRACES_TOKEN`) or
  the environment. A code, `--latest`, or `--build <sha>` (the newest from a commit, a PR's number or a bundle's
  name); `--list` lists those kept, newest first (`--build` one's alone); `--file <path>` reads one saved before
  without the server (each fetched is kept in `tools/lab/out/traces/<code>.lspt.gz`). Read as the perf overlay's
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
  frame's recording 0.2 ms slower, which must break the budget.
