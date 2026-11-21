# Rust engine experiment: state

The overnight run's state file (2026-11-20). Branch `experiment/rust-engine`, draft PR #797, never to merge as it is.

- Engine: `G:\Git\bulwark`, private `VictorZakharov/bulwark`. Build: `bash scripts/build.sh` there, then copy `pkg/bulwark{.js,.d.ts,_bg.wasm,_bg.wasm.d.ts}` into `src/engine/pkg/`.
- Game side: `src/engine/bridge.ts` (the scene handed over), `src/engine/index.ts` (boot, canvas), the hook in `core/renderer.ts` `render`.
- Measure: `npm run lab -- rust [--village --hour 12] [--biome forest --foes 24] [--three]` (pictures in `tools/lab/out/rust`).
- From the owner (2026-11-20 evening): on this branch only the Rust renderer matters; baselines come from other worktrees.

## What works

- The village, the forest, the crypt; hero, foes, skinned meshes; top view and first person (roughly).
- Sun and its shadow map, sky's halves, point lights, the village's lamps, fog, ACES.
- Particles (sprites), overlays (three's canvas over the engine's), alpha maps, instanced meshes, batching.
- The preview at pr-797 serves the wasm. A fight with skills runs in the lab (`lab perf`).

## Measured (1080p, medians of 60 frames, shared PC)

| Stand | Renderer | CPU | GPU | Draws |
| --- | --- | --- | --- | --- |
| Forest, 24 foes | three WebGPU | 6.5 ms | 5.3 ms | 142 |
| Forest, 24 foes | engine | 3.4 to 4.0 ms | 0.85 ms | 886 + 205 |
| Village, noon | three WebGPU | 9.8 ms | 1.7 ms | 260 |
| Village, noon | engine | 2.6 ms | 0.75 ms | 227 + 327 |

Not like for like: the engine's frame has no post chain, no meadow, no custom materials.

## Next, in the order they'd show

1. A way for a material to bring its own WGSL (a vertex and a colour hook with a block of numbers): the game has about 85 custom materials and patches, and each needs one. The village's meadow first (`world/meadow.ts`, `meadowNodes.ts`).
2. The post chain: an HDR target, bloom, the grade.
3. First person: the hero's body hidden, the arms' own pass; a sky.
4. The lamps' shadows; the point lights'.
5. Play the preview in a visible browser and on a phone; time it on an idle GPU.
6. The walk of the scene is most of the CPU's part now (1.5 to 2.1 ms): keep records between frames for what didn't move.

## Log

- 20:10 first frame: the village at night.
- 20:25 sun shadows from every opaque mesh, alpha maps, `lab rust --census --tune`.
- 20:35 draft PR #797, the engine the branch's default, `lab rust --three`.
- 20:40 overlays, particles, the see-through hole's numbers (unproven: no stand showed a hole).
- 20:50 look-alike materials shared: 1,807 draws to 887.
- 21:00 lamps; three's warm-ups and per-render hooks left out (boot 31 s to 23 s in the lab; the hero drawn upright).
- 21:05 the GPU's time was one stale reading a run: `lab rust` lets the browser go each frame now.
