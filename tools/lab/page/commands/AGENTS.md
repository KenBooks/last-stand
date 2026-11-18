# `tools/lab/page/commands`

The functions the lab's commands call on the page, a module each: `<fn>.ts` exports `fn`, which a command's work calls by name (`side.command('<fn>', options)` in `node/side.mjs` imports `/tools/lab/page/commands/<fn>.ts` and calls it with the lab and the options). `setup.ts` is what `side.probe` runs before a probe. A new command adds its own modules here and touches no other (`node/commands/AGENTS.md`); `lab:test` fails on a function a command calls with no module here, and on a module no command calls.

The rules across the game are the [root AGENTS.md](../../../../AGENTS.md), the lab's own [`tools/lab/AGENTS.md`](../../AGENTS.md) and its page side's [`page/AGENTS.md`](../AGENTS.md).

- **Each loads its measure as it runs** (`await import('../gait')`), and imports nothing else but types: an A/B copies `page/` into the other commit's tree, and a module importing game code that commit hasn't got (a new skill, a new look) would stop the commands loading there. Once these were one file (`page/commands.ts`), so one such import stopped every command.
- Each sets its fixture up afresh and checks it, so a command's result doesn't depend on the last.
- An options type the function alone takes lives here (`sheet.ts`'s `SheetCommand`); the measure's own (`GaitOptions`) is the measure's module's.
