# Rust engine experiment: state

The overnight run's state file (2026-11-20). Branch `experiment/rust-engine`, draft PR #797, never to merge as it is.

- Engine: `G:\Git\bulwark`, private `VictorZakharov/bulwark`. Build: `bash scripts/build.sh` there, then copy `pkg/bulwark{.js,.d.ts,_bg.wasm,_bg.wasm.d.ts}` into `src/engine/pkg/`.
- Game side: `src/engine/bridge.ts` (the scene handed over), `src/engine/index.ts` (boot, canvas), the hook in `core/renderer.ts` `render`.
- Measure: `npm run lab -- rust [--village --hour 12] [--biome forest --foes 24] [--three]` (pictures in `tools/lab/out/rust`).
- From the owner (2026-11-20 evening): on this branch only the Rust renderer matters; baselines come from other worktrees.

## What works

- The village, the forest, the crypt; hero, foes, skinned meshes; top view and first person (roughly).
- Sun and its shadow map, sky's halves, point lights, the village's lamps, fog.
- The post chain: an HDR target, bloom, the eye's adaptation, the game's grade.
- A material's own look as WGSL hooks (`custom.ts`); the village's meadow by it (`looks/meadow.ts`).
- Particles (sprites), overlays (three's canvas over the engine's), alpha maps, instanced meshes, batching.
- The engine with no browser: `lab rust --capture 512` writes a frame's tape, the engine's `replay` draws it in 2.5 s.
- The preview at pr-797 serves the wasm. A fight with skills ran in the lab on the first day's build (`lab perf`); not run again since.

## Measured (1080p, medians of 60 frames, shared PC)

| Stand | Renderer | CPU | GPU | Draws |
| --- | --- | --- | --- | --- |
| Forest, 24 foes | three WebGPU | 6.5 ms | 5.3 ms | 142 |
| Forest, 24 foes | engine | 4.0 ms | 1.1 ms | 886 + 205 |
| Village, noon | three WebGPU | 9.8 ms | 1.7 ms | 260 |
| Village, noon | engine | 3.1 ms | 1.7 ms | 228 + 326 |
| Village, noon, replayed natively | engine | 0.7 ms (no walk) | 1.05 ms | 224 + 326 |

The engine's rows now have the meadow (1.09M triangles in the village) and the whole post chain; three's are the first day's. Still not like for like: flames, sky, portal glows, moss and wind aren't drawn, nor the lamps' shadows.

## Next, in the order they'd show

1. The looks left, each a file in `looks/`: flames (`world/fireNodes.ts`), the sky (`world/skyNodes.ts`), the portals' membranes, the ground's moss and damp, the Thornwood's grass in the wind, the fountain's water, the ghost's shade. `lab rust --census` lists them where the hero stands.
2. The night: the village at midnight reads brighter than three's.
3. First person: the hero's body hidden, the arms' own pass; a sky.
4. The lamps' shadows; the point lights'.
5. The walk of the scene is most of the CPU's part (2.3 to 2.8 ms of 3 to 4): records kept between frames for what didn't move, then the scene itself kept in the engine (from the owner: what's slow in TypeScript moves into the engine and stays there).
6. Where a frame's CPU goes with the engine drawing (the game's update, the walk, the engine, the page): measured before any of the game is ported.
7. About 170 meshes are handed over again in 60 frames standing still (a geometry rewritten each frame): find which, and send only what changed.
8. Play the preview in a visible browser and on a phone; time it on an idle GPU.

## Log

- 20:10 first frame: the village at night.
- 20:25 sun shadows from every opaque mesh, alpha maps, `lab rust --census --tune`.
- 20:35 draft PR #797, the engine the branch's default, `lab rust --three`.
- 20:40 overlays, particles, the see-through hole's numbers (unproven: no stand showed a hole).
- 20:50 look-alike materials shared: 1,807 draws to 887.
- 21:00 lamps; three's warm-ups and per-render hooks left out (boot 31 s to 23 s in the lab; the hero drawn upright).
- 21:05 the GPU's time was one stale reading a run: `lab rust` lets the browser go each frame now.
- Day 2, 07:25 a material's own look as WGSL hooks; the meadow drawn by it, matching three's frame at first sight.
- 07:45 the post chain (an hour lost to a black frame: a timestamp asked of a pass with neither end set; `lab rust` reports what the GPU says now).
- 07:55 the engine's core apart from its web shell; a frame's tape replayed natively in 2.5 s; a 2 s build for it.
