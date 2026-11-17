# `tools/lab/examples`

`handSpeed.ts`, the example probe that `tools/lab/WRITING.md` walks through: every part a measure needs, the state it measures checked to have happened and a canary it must catch (`npm run lab -- probe tools/lab/examples/handSpeed.ts --canary`). It's typechecked with the game: keep it compiling and its canary caught.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md), the lab's own [`tools/lab/AGENTS.md`](../AGENTS.md).
