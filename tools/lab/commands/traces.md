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
  token: a trace without stages or casts, one never sent or changed on its way, and a frame's count (draws, foes,
  particles...) packed as anything but a count are problems (an update stage named `particles` took the count's
  column, and the report read its time as the count: 0.0999 particles, trace Z8GY-RHSN; the lab's clock times every
  stage at 0, so the column's kind shows it, not its values). `--canary` makes each frame's recording 0.2 ms slower,
  which must break the budget, and packs the particles' count as a time in a copy of the header, which must be
  caught. Then a slow boot's trace: its reveal stood in for
  (`slowBootRevealed`) and the lobby played on through its wait (`BOOT_TAIL_MS`, 45 s), the trace taken read back: it
  must hold the 45 s after the reveal and say the play after it beside the boot's time; `--canary` also takes it at
  the reveal, as before, which must be caught against the required normal wait (not the injected zero).
  It also exercises the actual manual Start/Stop/Send controls (`page/manualRecording.ts`): exact interval and
  first-frame markers, paused/menu frames, privacy-preserving delayed-key timing, automatic-report suppression,
  failed upload and retry of identical bytes, touch Start, both capture limits, and sending despite an earlier
  automatic client quota. Its test uploads go only to the lab's own service and are read back with the token.
  Manual capture reuses the bounded ring, stopping at 60 s or before its start would be overwritten; oversized
  recordings are shown as such rather than silently trimmed. `--canary` also rejects an automatic-reason trace
  substituted for the manual recording.
- `auto`: Auto quality's walk down from High on a slow device (`page/autoQuality.ts`, `src/core/quality.ts`). Auto is
  set as a player sets it, which starts it over from High, and fed each frame's time as a GPU-bound device takes it:
  in proportion to the scene's pixels, at the level's cost (the integrated GPU of trace JGNM-1NCF and its tester's
  report, 5 frames a second at High on a 2864x1536 canvas: run it `--screen 1432x768@2`). Each step is listed with
  when it came, and the time until the device holds 50 frames a second, or reaches Low where at the screen's own
  pixels it can't (Auto keeps them at every level), must be at most 8 s (to Low in 3.4 s there, where it holds 7.8
  frames a second; 12.5 at the old pace, a level a 4 s window). A fast device's frames with an 800 ms hitch every
  2 s must never step it down (Auto never steps back up within a session). Then Auto as a boot starts it, at a level
  it settled on before (`bootAuto`, its cookie set as a boot finds it): once its frames are the device's it tries the
  level above, which a fast device settled on Medium or Low must keep (and save), and a device that holds only the
  settled level must leave for it at once, never past it, the cookie as it was, each within 10 s (from play, a
  4070 Ti on Medium "somehow", trace 0HSJ-60QV). A phone that runs the level above under the target but not far
  under it (trace 9JA7-BSSS: Medium held, High at 26 to 47 frames a second for 6 s a boot) must leave it within its
  settle and a quick window (3.2 s; 6.1 at the old pace), and booted 12 times in a row must try it at boots 1, 3, 6
  and 11 alone (each miss skips twice the boots the last did, up to 8). `--canary` runs the old pace too, which must
  be too slow and keep the phone's trial too long, a boot at the settled level as Auto used to, whose fast device
  must be found never stepped back up, and the phone's boots with the trial's cookie lost, found trying every boot.
