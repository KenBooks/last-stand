# `tools/lab/naga`

`lab naga`'s checker: a Rust program of naga's (wgpu's shader compiler, Firefox's) that takes the page's shader
modules from a folder and checks each stage as Firefox's WebGPU takes it. The command, what it reads and what it was
measured against are [`../commands/naga.md`](../commands/naga.md); the Node side that writes the folder, builds this and
reads its lines is `../node/nagaCheck.mjs`.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md), the lab's own [`tools/lab/AGENTS.md`](../AGENTS.md).

- **naga is pinned to the engine's** (`=30.0.2`, Bulwark's wgpu 30): moving it is a change of what's checked, its own
  PR, read beside the old with `lab naga --ab`.
- **Built into the lab's `out/naga/target`** (`CARGO_TARGET_DIR`, set by `nagaCheck.mjs`), never here: run by hand,
  set it too.
- **A backend's refusal may be its options, not the shader**: MSL at naga's default 1.0 refused every lit stage (no
  instance's number, no `@invariant`), where wgpu writes 2.x for a Metal device. Set an option as wgpu sets it for a
  real device before calling a refusal the game's.
- **`canary.wgsl` must stay refused** by the naga pinned: if a naga moved to fixes #938's bug, the canary is another
  shape it refuses, so the check still proves it checks.
