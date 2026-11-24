# `tools/lab/examples`

`handSpeed.ts`, the example probe that `tools/lab/WRITING.md` walks through: every part a measure needs, the state it measures checked to have happened and a canary it must catch (`npm run lab -- probe tools/lab/examples/handSpeed.ts --canary`). It's typechecked with the game: keep it compiling and its canary caught.

`beacon.ts`, the example of a thing an invited agent makes in the owner's live game (`npm run lab -- join make beacon --file tools/lab/examples/beacon.ts`, `tools/lab/commands/join.md`): the shape every made thing takes, typechecked against the game's `MakeKit`. `lab invite` builds it to check a made thing is drawn, and its canary follows the line `kit.group.add(post, stone);`: keep that line.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md), the lab's own [`tools/lab/AGENTS.md`](../AGENTS.md).
