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
| Forest, 24 foes | three WebGPU (day 1) | 6.5 ms | 5.3 ms | 142 |
| Forest, 24 foes | engine | 4.3 ms | 1.6 ms | 932 + 218 |
| Village, noon | three WebGPU (day 1) | 9.8 ms | 1.7 ms | 260 |
| Village, noon | engine | 3.5 ms | 1.75 ms | 226 + 327 |
| Forest over the shoulder, replayed natively | engine | 1.0 ms (no walk) | 1.2 ms | 340 + 227 |

The engine's rows have the trees it lacked before, the looks and the whole post chain. In the village nothing is left undrawn where the hero stands; in the forest one instanced geometry. Three's rows are the first day's.

## Next, in the order they'd show

1. The looks left are small: the kit's hair tint, item glow, hood shade and shine cap; the water's share of the sky and capped glints; the paving's unrepeated maps (the cobbles read browner than three's); membranes and flames fading as their prop dissolves. The ghost by the yard was only compared with three's on another kind of foe (it's picked at random a boot).
2. The night: the village at midnight reads brighter than three's.
3. First person: the hero's body hidden, the arms' own pass.
4. The lamps' shadows; the point lights'.
5. The walk of the scene is most of the CPU's part (2.5 to 2.9 ms of 3.5 to 4.3): records kept between frames for what didn't move, then the scene itself kept in the engine (from the owner: what's slow in TypeScript moves into the engine and stays there).
6. Where a frame's CPU goes with the engine drawing (the game's update, the walk, the engine, the page): measured before any of the game is ported.
7. About 170 meshes are handed over again in 60 frames standing still (a geometry rewritten each frame): find which, and send only what changed.
8. A look that moves its vertices casts no shadow (the grass, the meadow): the shadow's pass would need its vertex hook. One that leaves them casts (`casts`).
9. Play the preview in a visible browser and on a phone; time it on an idle GPU.

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
- 08:30 the skies, the portals, the forest's moss, grass wind and shafts; instanced meshes left whole (the forest had no trees); colour-off meshes shadow-only (the hall was under a white shell, the owner saw it).
- 08:50 volumes, a clamped sampler and a premultiplied blend in the engine; the flames by the game's own WGSL.
- Day 2, later: the crypt's floor, embers, dazed stars; the foes' kit look, shared so bodies batch (forest, 24 foes: 363 draws + 228 for the shadow, 4.4 ms CPU, 1.8 ms GPU); the fountain's water; looks that cast; an alpha map's repeat (the falls' streaks were 8 times too wide); a mark on the page while the engine draws.
