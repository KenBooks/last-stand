# Rust engine experiment: state

The overnight run's state file (long-autonomous-pr-runs). Branch `experiment/rust-engine`, draft PR, never to merge as it is.

- Engine: `G:\Git\bulwark`, private `VictorZakharov/bulwark`. Build: `bash scripts/build.sh` there, then copy `pkg/bulwark{.js,.d.ts,_bg.wasm,_bg.wasm.d.ts}` into `src/engine/pkg/`.
- Game side: `src/engine/bridge.ts` (the scene handed over), `src/engine/index.ts` (boot, canvas), the hook in `core/renderer.ts` `render`.
- Measure: `npm run lab -- rust [--village --hour 12] [--foes n]` (pictures in `tools/lab/out/rust`).
- From the owner (2026-11-20 evening): on this branch only the Rust renderer matters; baselines come from other worktrees.

## Log

- 20:10 first frame: the village at night, 472 records, 248 draws, GPU 0.69 ms, walk 2.8 ms, engine 0.4 ms.
