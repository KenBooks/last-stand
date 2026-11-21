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

## Direction (from the owner, 2026-11-21)

The engine outlives this game: "this game might fly, or it might not fly... but the engine will stay to make other games". So a change is judged by what any game on Bulwark gets from it, and by whether its cost stops growing with content ("if we focus on optimizing the game in its current state... when we add new content, it will become slow again"). A day of making this village's frame 5 to 30% cheaper a part at a time was the wrong direction: "I was hoping you'd extract some pieces into our engine, this way improving performance 5-10 TIMES (not 5-10%)". The targets: the screen's own pixels everywhere ("pixelated is not the way"), a phone at a stable 60 at High, 4K on integrated graphics at 60.

## Next: pieces the engine takes over

1. **Lights that never move, baked by the engine.** A lamp or a torch is worked out at every pixel every frame, up to eight a pixel with a shadow read each: 11 ms of a 19 ms frame in the hall at night at High (the lent 4080 as the phone), 16 to 20 ms on the phone itself. The game marks a light as still; the engine bakes its light and shadow once into a volume and a pixel reads it in one lookup, however many lamps a game has. Light leaking through thin walls is the thing to get right.
   **Wired in (2026-11-21, night):** the street lamps and the hall's torches are baked (`lightCache.ts`; this folder's AGENTS.md has the numbers): at night at High on the lent 4080 at 5760 by 3600, the square 7.9 ms to 5.4 and the hall 5.6 to 4.2. Not the whole of the 11 ms yet: each lamp is still the loop's within 3 m, and the places' own point lights (the hall's braziers) aren't baked. Next here: those lights, then the phone's own profile.
2. **A scene the engine keeps.** The page walks three's scene every frame and writes a record for every mesh (`bridge.ts` `walk`): 1 ms on a desktop, 3 to 5 on a phone, and the game's own culling for three on top (6 to 8 ms of update walking the village on the phone). What stands still is handed over once and culled in Rust; a frame reports what moved.
3. **The sun's shadow by layers.** The still world's map kept, what moves drawn over it: the map is kept whole only while nothing that casts has moved (`Plan::shadow_mark`), and a hero's idle breath moves him every frame.
4. **The pass at a share of the scene's pixels** (`gpu/low.rs`, a record's `LOW_RES`, a mesh's `userData.lowRes`) takes the fires' flames. The owner's rule is the screen's own pixels: he was told it draws soft volumes alone at a quarter of them, blended back over a scene at full size, and that it's one switch (`TUNE.lowRes`). Smoke and glows could ask for it; nothing with an edge should.
5. Not looked at: the scene's two samples a pixel at High and Medium are drawn as one (WebGPU has 1 or 4), so the engine's frame has no antialiasing there.

6. **The scene's depth drawn first** (Bulwark `set_depth_first`, `TUNE.depthFirst`, on): what's opaque and stands still shaded once a pixel. Proved in the engine's own lab (`lab depth-first`: 128 walls, 17.1 ms a frame to 1.6); here, the hall at night at High on the lent 4080 as the phone, its part is 3.7 ms and the frame 18.2 to 17.9.

**The architecture is Bulwark's `ARCHITECTURE.md`** (2026-11-21, from the owner: primitives whose cost content can't grow, each proved at scale in the engine's own lab before it's wired in here). Virtual geometry is built there and proved in its lab (`lab clusters`: 256 balls of 2 million triangles, 33 ms a frame as they are, 2.2 cut), with a first budget; none of it is in this game's frame yet: a record says nothing of clusters, the page's build has no builder, and materials that cut out, meshes that bend and clustered shadows aren't started. That wiring is next, then fields and occlusion.

**Virtual geometry and this game's frame (2026-11-21, evening).** Bulwark has since measured its graphs' errors
again, ended them in one cluster and left out what's hidden (16,384 balls of 2 million triangles: 46 ms to 1.6;
behind a wall 2.45 ms to 0.30: its `ARCHITECTURE.md`). Before wiring it in here the village's frame was counted
(`lab rust --village --hour 12 --census`, which lists the meshes in view by their triangles now): 934 thousand
triangles drawn, about 500 thousand of them the meadow's grass (moved by its look), 66 thousand the trees' leaves
(cut out), the heroes skinned, and 231 thousand in 140 meshes that could be clusters, 167 thousand of those the
trees' bark at 700 to 1,300 triangles a tree, each a handful of clusters already. Nothing here is a mesh finer
than the screen: clusters would take a few percent of the triangles of a frame whose time is its lights (11 ms
of 19 in the hall at night). Not wired in for that reason: what this game's frame wants of the architecture is
the light cache and fields (the grass). Virtual geometry waits for content that needs it.

## Left from before

- The looks left are small: the kit's hair tint, item glow, hood shade and shine cap; the water's share of the sky and capped glints; the paving's unrepeated maps; membranes and flames fading as their prop dissolves.
- The village at midnight reads brighter than three's.
- A look that moves its vertices casts no shadow (the grass, the meadow).
- `bridge.ts` is at 408 lines: split before more is added (the records' flags and casting are one job).

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
- Day 2, later: the crypt's floor, embers, dazed stars; the foes' kit look, shared so bodies batch (forest, 24 foes: 932 draws + 219 for the shadow as before it, 4.5 ms CPU, 1.7 ms GPU; comparing all 192 of a look's numbers a piece a frame, the walk went from 3.2 to 4.7 ms); the fountain's water; looks that cast; an alpha map's repeat (the falls' streaks were 8 times too wide); a mark on the page while the engine draws.
- Day 2, 09:30 where a frame's CPU goes (forest, 24 foes, a loaded PC): the game's update 5.4 ms, the render 5.45 (matrices 1.75, walk 2.15, engine 1.1). Matrices made only for what moved and hidden places left alone, unchanged kit materials not described again: the render 4.25 (matrices 0.85, walk 1.8). Next by size: the game's update (the foes' `animate`, the hero's IK), which is game code.
- Day 2, 10:30 the owner played the preview: foes hidden (crowds on at the plain address), 5 to 20 s freezes at each change of place (maps read back to bytes, three pipelines a look), the hero a pace off his outline in the hall (matrices), the hall lit as outdoors (no shelter): all four fixed and pushed. A lantern's light moved out from its wall (the library's orange discs, in three's frame too). The pause menu offers the engine alone. Left from that play: the rooms darker than three's away from their lights, the hearth's and a desk candle's glow, the meadow "should look fancier" at High, the fight dipping to 115-120 fps, the performance overlay still showing three's counts (Draws 1), pipelines made ahead for a cold browser, about 170 meshes handed over again every 60 frames.
- Day 2, 11:40 second round of play. A report (Q8CV-74H0): 5.7 s and 1.3 s stalls with no script running, the browser waiting on the GPU's first compile of the engine's pipelines: places are handed over ahead now (`prepareAhead`: 30 ms a frame under the loading screen, 2 after), not yet proven on a cold browser. The GPU's copy of a canvas nothing had drawn on stopped the engine for good (wgpu unwraps the error): such a canvas is given a context first. The hall's roof stood black from above (the shelter had no height). The overlay's draws, triangles and GPU time are the engine's. Open: the game's own Opening bar at a house took 15 s in play (the rooms' and the heroes' builds behind the lobby; not measured against main), the lab's --cold run went in after 0.2 s; a 3.7 s first frame of the village on a --cold page; `update arena` 1.1 s as a place is shown.
- Day 2, 12:00 the freezes found in the real browser (`npm run stalls -- --scenario boot --js`): the warrior's wrist wrap casting rays for 11 to 14 s a build, the game's own, fixed on main the night before; rebased onto it. First visit to the village: the lobby at 9.2 s (25.3), no hold over 0.5 s (14 s); the cold village walked: no frame over 42 ms. A moving mesh's vertices written in place (170 meshes a second made anew in a fight, now none). Houses lit: the place's own point lights asked of the game (the engine saw none), a decay past 2 read as softness. Alpha maps alone copied on the GPU. Bulwark's gpu.rs split in five; the rule on file size. `lab rustcheck` 16 of 16 for each hero.
- Day 2, 13:30 third round of play: the hall's walls striped (its shelter's box ended on their inner faces: it reaches into them now); pipelines compiled aside by the page (`pipelinesAside.ts`: the browser's async call in wgpu's place, a draw left out till its pipeline is ready) and asked for by the warm-ups, so a skill's first cast makes none (2 to 4 s from play; cold in Chrome: 6,302 frames of Maelstroms, one over 100 ms); the engine at the quality level's samples and shadow map (a phone at Very low: 26 ms GPU, report H37Q-PEYK); the lamps' shadows (`lampShadows.ts`, Bulwark's gpu/lamps.rs). Beside production, cold: the lobby at 9.95 s against 13.35 s, the longest hold under the loading screen 0.99 s against 1.72 s: what's left under the bars is the game's own boot, proposed as a task on main. `lab rustcheck` 18 of 18.
