# `src/perf`

Performance reports a slow game sends with its player's consent, for agents to read and fix (`npm run lab -- trace`).

The rules across the game are the [root AGENTS.md](../../AGENTS.md); the service they go to is `server/traces/AGENTS.md`.

- `recorder.ts`: always on, from the boot to the page's end, in every scene (the boot, the hero selection screen, the lobby, a fight, a loading bar's wait). Each frame's times and counts go into a ring of columns (`RING`: about the last minute), beside the boot's steps, the long animation frames and marks (a scene changing, a wave, a biome, a hero built, a cast or channel of the local hero's, a loading bar's end). `perfHud.ts` hands it every frame: its timings run whether the overlay shows or not.
- `detect.ts`: pure. Once a second the last stretch is judged: over 20 s of play (a paused game, the pause menu, a hidden tab, a warm-up, a loading bar and the 3 s after a scene starts left out), a 1% low under 30 frames a second, or over a fifth of the display's frames missed with the mean under 50 (the display's rate is the fastest second seen); over every frame shown but a hidden tab's, stalls (one of a second or more, or three of 250 ms); a boot whose own work (its time less the time it waited on its files) took over 15 s; a loading bar up over 8 s.
- `consent.ts`: the prompt (`#perf-ask`, `styles/_perfAsk.scss`) and what the player chose (`localStorage` `last-stand-perf-traces`; the pause menu's Slow-game reports: Ask, Always, Off).
- `upload.ts`: the snapshot packed with the device, the settings and the build, gzipped by the browser and posted to `<relay host>/traces`.
- `traceFormat.ts`: the packed format (pure, no imports: Node runs it as it is, the lab and the service's tests import it). `traceReport.ts`: a trace read as the perf overlay's report reads (pure: `lab trace`).

## Gotchas

- **Never during a fight, never blocking.** A slow stretch found is kept as a snapshot at once (only copied: 1.9 ms for a full minute in the lab's browser, `lab recorder --frames 3600`), and the player is asked once a calm moment has lasted 1.5 s: the choice after a wave (the prompt under it: both stand at the top middle, and the prompt hid its buttons), the summary, the lobby, the hero selection screen. A fight starting hides it, and it's shown again at the next calm. The packing and gzip wait for the calm too.
- **Asked at most once a session; three Not nows and it stops asking.** Always keeps sending without asking, at most 3 a session and 10 minutes apart. Off never snapshots anything (`recorder.wanted`: nothing is copied unless it could go somewhere). In co-op each game asks its own player about its own frames.
- **Nothing about the player**: no names, items, rooms, invite codes or address beyond the page's path and its render switches (`KEPT_SWITCHES`). The prompt says what's in it and its size.
- **The 1 MB the service takes**: a minute at 240 frames a second of values as noisy as can be came to 0.8 MB (`tools/lab/test/trace.test.mjs`), so a trace over 1 MB is cut to its newest half until it fits (`packTrace`). Real traces are some tens of KB.
- **The service worker never sees an upload**: it answers GETs of the game's own files alone (`scripts/pwa.ts`), so a POST to another host passes it by, under any build's worker. The request is a plain one (no headers of its own, no cookies), so no preflight.
- **Measure it with `npm run lab -- recorder`**: the recorder's calls timed each frame in a fight (0.02 to 0.03 ms a frame on the owner's PC, against a budget of 0.05), the trace packed, sent to a traces service of the lab's own and read back with its token; `--canary` makes each frame's recording 0.2 ms slower, which it must catch. The prompt's states are `lab ui --states perfAsk,perfAskBreak,perfAskTouch`. The detector's and the format's unit tests are in `tools/lab/test/trace.test.mjs`.
- The lab's frames run back to back without yielding a task, and the GPU's timer queries come back only after one, so `lab recorder` sees few GPU times or none (`lab perf` yields after each frame for them): a player's paced frames have them.
