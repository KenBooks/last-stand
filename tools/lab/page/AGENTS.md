# `tools/lab/page`

The lab inside the game's page: TypeScript, typechecked with the game (`tsconfig.json` includes it) and imported as the game imports its modules, so there's one copy of each. `lab.ts` is the lab a measure is given (the clock, input, set-ups, pictures), `commands.ts` what the session calls, and each command has a module of its own (`gait.ts`, `spawns.ts`...), with the pieces measures share (`geometry.ts`, `corners.ts`, `screenCells.ts` and its sums on the GPU `gridSums.ts`, `flashes.ts`, `legTrace.ts`...), the pictures' looks (`looks.ts`: wireframe, faces, parts, skeleton) and the drawing buffer read back (`pixels.ts`), and `live`'s steps (`live.ts`).

The rules across the game are the [root AGENTS.md](../../../AGENTS.md), the lab's own [`tools/lab/AGENTS.md`](../AGENTS.md) (what the lab gives a measure, and what keeps it repeatable).

- **A command's module is loaded as it runs** (`commands.ts`): an A/B copies these modules into the other commit's tree, and one importing game code that commit hasn't got would stop every command loading there.
- **The mouse has its three buttons** (`lab.mouseDown(at, button)`, `mouseUp`, `clickWith`, `mouseTo` moving it
  held: a middle drag), sent through the DevTools protocol with the mask of those held, as a mouse sends them.
- **The page runs on the lab's clock.** Its `performance.now` stands still within a frame, and its frames run as fast as the page can; what happens in the browser's own time (a decode, a CSS animation, audio) is waited for with `__labClock.realNow` and real timeouts, and kept out of a report's lines, which must be the same on every run.
- **Check the state happened, and carry a canary** (Writing a measure in `tools/lab/AGENTS.md`).
- A measure reads what the game sends out (the frame drawn, the WebAudio nodes, the page's styles), not the game's own bookkeeping, which is what it checks.
- Pure helpers a measure uses get a unit test in `test/` (`flashes.ts`, `patches.ts`, `sweptArea.ts`, `jumps.ts` have theirs).
