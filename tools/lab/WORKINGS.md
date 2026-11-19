# How the lab works

From [`AGENTS.md`](AGENTS.md): how the lab boots and serves its pages, its two sides and its clock, and what tests the lab itself. Paths are under `tools/lab/` unless they're given whole.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

With `lab:serve` up, the next command's page is booted as soon as a command finishes, and again once the source has
been left alone for a moment after a change, so a command finds it ready: the sheet takes about 2 s, the carry 5.
Without it, a command boots a session of its own (about 15 s) and closes it. The server runs under a supervisor of
the lab's own, which starts it again when what the lab's Node code says changes (not on every change Windows
reports: a file read now and then counts as one, and a server started again under a command closed its browser),
launches its browser again if it has closed (it crashed: every command after it failed until the server restarted),
and every command carries a hash of the code it was sent from: a server that loaded other code starts again before it
runs it (`node --watch` once stopped noticing changes, and the server ran old code that dropped an option the command
line had just learnt). Its Vite server starts again when `vite.config.ts` or the packages change. Stopping the
terminal's task stops it all.

A boot that fails fails at once, with why (`side.mjs` `openPageIn`): a boot that threw says so on the game's loading
screen, and a module Vite couldn't compile answers its request with an error, which the lab asks for again to say
Vite's message (where it went wrong in which file), and a module that won't link (importing a name another doesn't
export: a page booted between two edits) throws a `SyntaxError` on the page. Waited for the loading screen to go
alone, each was waited out to the timeout, three minutes: a module that wouldn't compile or link never runs, so its
loading screen never says it failed, and the command after it waited behind it.
- `lab.mjs`: the command line. Reads and checks the command (`node/options.mjs`, every command a module of its own
  in `node/commands/`), and sends it to the server on 127.0.0.1 on this tree's own port (`treePort`, or `LAB_PORT`;
  `node/client.mjs`), or runs it in a session of its own.
- `node/`, the Node side:
  - `server.mjs`: `lab:serve`. One command at a time, the next page booted between them, and `--watch`'s changes. It
    only answers the lab's own command line: a POST of JSON for 127.0.0.1 or localhost, from no web page (a page in
    your browser could otherwise send it an `eval`). `supervisor.mjs` runs it (`serverProcess.mjs`) in a child
    process and starts it again when the lab's code says something else (`codeStamp.mjs`, the hash every command is
    checked against), and stops it when whatever started the supervisor is gone.
  - `session.mjs`: a command run on each side it asks for, its report, problems and A/B verdict; `commands.mjs`:
    the commands that run on a side (their modules' `each`, how their results are compared), and the pages a
    check may keep for them; `commands/`: a module a command, its options and its work (`commandKit.mjs` and
    `optionKit.mjs` what several share; `commandDocs.mjs` COMMANDS.md's list made from them, `lab docs`).
  - `side.mjs`: a tree of the game served by a Vite dev server of the lab's own (HMR off, so a measure never meets a
    stale copy of a module) and booted in a page; `commits.mjs`: another commit exported for an A/B.
  - `browser.mjs`: Playwright's Chromium in its native headless mode, and the scripts every page runs first (the
    clock, seeded random numbers, no pointer lock but the page's own when asked, fresh storage).
  - `trace.mjs`: `lab trace`, a trace fetched from the traces service and reported (`src/perf/traceReport.ts`), kept
    in `out/traces`; `tracesService.mjs`: `lab recorder`'s traces service of its own (`server/traces`).
  - `pwa.mjs`: `lab pwa`, two production builds served in turn by `staticHost.mjs` (as Pages serves the game) to a
    browser of its own, the offline worker and all.
  - `compare.mjs` (the reports' verdict), `pictures.mjs` (the pictures'), `profile.mjs` and `sourceMaps.mjs`
    (`--profile`, its functions traced back through Vite's source maps to their lines in the source),
    `sheetImage.mjs` (the sheet as one image), `probeFiles.mjs`, `errors.mjs`, `paths.mjs`.
- `page/`: the lab inside the game's page, TypeScript typechecked with the game (`tsconfig.json` includes it, and
  `examples/`), imported as the game imports its modules, so there is one copy of each. `lab.ts` (the clock, input,
  set-ups, pictures), `commands/` (what the session calls by name, a module a function: each loads its measure as it
  runs, as an A/B copies these modules into the other commit's tree, and one measuring game code that commit hasn't
  got stopped every command loading there), `sheet.ts`, `carry.ts`, `comfort.ts`, `geometry.ts`,
  `ranger.ts` (the bow's handle, `bow.group.userData.bow`).
- `test/`: the Node side's tests, `npm run lab:test`.
- `out/`: everything the lab writes (sheets, exported commits, Vite's cache, the browser's profile), never the user's
  temp folder.

Some of what that takes:
- **Every command on a fresh page.** A page a command ran on is left as that command left it (the game's clock on,
  the hero wherever it took him), and a set-up on it starts from another moment, so it is never used again. Within
  one command its steps run in order on its page (the sheet's states one after another), the same order every time.
  A check alone keeps pages from job to job, for the commands shown to come out the same that way, each set-up
  afresh in a run of its own (`commands/check.md`). A page is booted once every map the loading workers make has
  come (`mapsCome`: one landing mid-command drew the crypt's foes otherwise on a loaded machine).
- **The clock.** From the moment the loading screen reveals the game, its frames run on the lab's clock: each a hair
  over a 60th of a second, as fast as the page can, nothing drawn unless asked (the scene's matrices are still
  updated). Every time the page reads is on a grid of 1/1024 ms, so the game's frame time is exact and the same on
  every boot. Frames run back to back, with nothing landing between them (an A/B's side on a commit from before the
  heroes' capes were taken off steps its capes in the frame, on the main thread, `stepCapesHere`: in the game they
  stepped in a worker, whose results landed a frame or two late, and a commit's pictures against itself differed).
- **No page of the lab's reaches production** (`node/production.mjs`, #595): every context a side opens routes production's host (`ls.wellscoped.dev`, the saves service, the co-op relay and the traces service) through a guard. The save slots screen and Play together ask the saves service for its health as they open, which production refuses a page on localhost (CORS: two errors of the page's that failed every command opening either, `ui --states saves,heroes,coop`); the lab answers that call itself (no Google sign-in). A slow-game report (`POST /traces`, which the game sends itself as a co-op run or a `ui` state meets a slow stretch) is answered with nothing too (204): no fault of the command's, and no lab page's report belongs in production (#675). Any other request or WebSocket there is refused and kept as an ask, which fails the command (`session.mjs`; `ui` states each judge their own, and its `--canary` lifts the lab's answer so the save slots ask production's host and must be caught). A command with services of its own (`cloud`, `recorder`, `profile`) points the page at them on localhost, which the guard never touches.
- **Set-ups check themselves** (`Lab.setup`, the `Fixture`): the run held in its countdown (no foes and none coming),
  the hero placed, stopped and settled, an arrow nocked if asked, the view made as the player makes it (V pressed: the
  game sets the camera's view from its own every frame, and set on the camera alone it was top-down again a frame
  later, so `--view first` never took); each step throws if it didn't take, and so does a boot that didn't boot the
  hero asked for.
- **A/B** (`--ab[=ref]`): the commit is exported with `git archive` into `out/commits/<sha>` (no worktree, no links),
  served with its own dependency cache, the lab's page modules copied into it, and each side runs alone in the
  browser, this tree's first. The pictures are compared pixel by pixel in the lab's browser.
- **Rays against the body** (`geometry.ts`, `BakedBody`): the meshes skinned into the world as drawn, each bone's
  matrix made once a frame (three's own way made it again for every vertex, 30 ms a frame), and only the meshes that
  may reach the lines measured, by a bound that holds for any pose (each bone's sphere round its own vertices); every
  baked vertex is checked against it.
- A blocked boot reports the loading-screen stage and recent page errors. `LAB_BOOT_TIMEOUT_MS` can shorten the usual 180000 ms wait on a shared PC. Navigation waits for DOM content, not every background asset; `loadingOutcome` waits for the game’s loading screen, then `warmAll` runs the warm-ups' frames in the page itself.

## Testing the lab

- `npm run lab:test`: the Node side's unit tests (the command line, the verdicts, the server's checks, the source
  maps), in a second; the PR build runs them.
- Each measure's canary (`carry --canary`, the example's `--canary`): run it when the measure changes.
- `npm run lab -- carry --ab=HEAD` and `sheet --ab=HEAD`: a commit against itself must agree, line for line and pixel
  for pixel; anything else is a cause of runs that differ, to be found and removed as Repeatability in `WRITING.md` says.
