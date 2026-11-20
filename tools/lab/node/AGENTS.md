# `tools/lab/node`

- `coop --scenarios colours` checks colour changes alone, sharing `openTogether`, `Pair.run` and the ordinary delayed links, then a Settings change during a run. Do not use `Pair.until(() => true, N)` to wait N frames: it returns after one turn. The live picker changes, host conflict rejection and Any must agree on every page's actual dyed cloth; the canary introduces an unannounced duplicate. A three-player fixture may already occupy a requested test colour: choose genuinely free palette IDs before deliberately racing for one. It runs alone, not mixed with combat scenarios.

The lab's Node side: the commands, a module each (`commands/`: their options and their work on a side, and what several share, `optionKit.mjs` and `commandKit.mjs`), the command line reading them (`options.mjs`), those that run on a side (`commands.mjs`), COMMANDS.md's list made from them (`commandDocs.mjs`, `lab docs`), the session and its sides (`session.mjs`, `side.mjs`: a tree served by a Vite dev server of the lab's own and booted in a page), the other commit of an A/B and its kept side (`commits.mjs`, `sideCache.mjs`), the browser and the scripts every page runs first (`browser.mjs`), the server and its supervisor (`server.mjs`, `supervisor.mjs`, `serverProcess.mjs`, `client.mjs`, `codeStamp.mjs`), the verdicts (`compare.mjs`, `pictures.mjs`), `--profile` (`profile.mjs`, `sourceMaps.mjs`), co-op's link and judge (`coop.mjs`, `coopJudge.mjs`), `check` (`check.mjs`; the order its sessions take the jobs in and its `--plan`, `checkQueue.mjs`; its reports against another check's, `checkReports.mjs`), the lab code each command runs, for the A/B's kept side (`labCode.mjs`), the commands running in processes of their own that `lab stop` stops (`running.mjs`), `pwa` (`pwa.mjs`, its builds served as Pages serves them by `staticHost.mjs`), `live`'s page kept between steps and its steps (`live.mjs`, `liveLog.mjs`), and the sheet, a probe's files, errors and paths.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md), the lab's own [`tools/lab/AGENTS.md`](../AGENTS.md).

- `googleWindow.mjs` runs `cloud --google` through real controls and the static callback with intercepted OAuth responses. Every saves request is handled locally; no player data or Google service is used. The fixture verifies a boot marker survives, the callback imports no game assets, and the original nonce alone finishes. Server OAuth validation stays in `server/saves/test/google.test.mjs`.
- The Google fixture plays HTML fullscreen with instance-level spies, never native fullscreen or keyboard lock. It checks exit-before-open, restore on success/game Cancel/native close/provider cancellation/service error, refused restore on the next interaction, windowed preservation, and native close before a deliberately held address request answers. Keep popup closure coupled to returned focus and a callback grace period; a detached OAuth window handle alone must not cancel.
- Browser waits inside the cloud fixture use timed polling: the lab parks requestAnimationFrame, so Playwright's default waitForFunction polling can time out while the desired dialog is already visible. A redirect fallback is intercepted with a same-origin HTML response; aborting navigation gives Chrome's error document no sessionStorage to verify.

- A new command is a module of its own in `commands/`, its options and its work (each option checked as it's read, so a misspelt one stops the command before anything boots), with its page side in `page/commands/` and `page/`: `commands/AGENTS.md`. It touches no shared file.
- A script `browser.mjs` serializes into the page can use nothing from its module.
- A normal boot runs the lab clock's parked animation frames in the page until the requested warm-ups finish (`warmAll` in `side.mjs`: a frame, then a task for what it set off, then the next). The reveal switches that clock to manual before `Lab` exists; merely polling `allWarm` deadlocks every warm-up waiting on its next frame, and a frame a poll from Node (16 ms and a round trip each) made the warm-ups 23 to 27 s of a 45 to 52 s boot. Cold/first boots still leave background work for the command to exercise. Each boot's line says its steps' seconds (`bootSteps.mjs`).
- What can be tested without a browser is, in `test/` (`npm run lab:test`).
- A change to this code restarts the server under `lab:serve` (its hash, `codeStamp.mjs`, is sent with every command).
- Keep generated output and other checkouts out of Vite's watcher (`UNWATCHED` in `side.mjs`). `tools/stalls/out` can hold hundreds of thousands of browser-profile files: watching it kept the lab busy for minutes and used gigabytes before a picture. If a boot stalls, profile the Node process and check its file traversal before repeating the run; do not delete saved output or references to make it faster.

## Notes by module

What's learned about one module or folder here goes in this list, one bullet a note, led by the module's name in
backticks (`` `merchant.ts`: ... ``), in its alphabetical place, never at the end: two PRs appending at a file's
end touch the same lines and conflict (`npm run check:sorted` holds the order; the root's Workflow).

<!-- sorted -->
- `side.mjs`: an exported tree's page (an A/B's other side) counts as booted only from the lab's page code as it is
  now (`pageStamp`, `isBooted`): it's copied into that tree as its page boots (`copyLabPage`), and a page `lab:serve`
  booted ahead before a measure was written ran it from the copy before (`lab seals --ab` threw on main's side
  alone).
- `tracesService.mjs`: one service a process, shared by the commands that run beside each other (`lab check`'s sessions): `server/traces` keeps its settings, its token among them, in its module, so a second command's start took the token and the first's read back answered 401. It takes the lab's pages on any port, and closes once every holder has let it go.
