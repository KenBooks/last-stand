# `src/data`

Pure tuning data, typed against `types.ts`, with no behaviour: keep it so.

The rules across the game are the [root AGENTS.md](../../AGENTS.md); each directory under this one has an AGENTS.md of its own.

- `balance.ts`: the global knobs (the camera, the arena, the run, block, the damage numbers' colours).
- `classes/`: the playable classes. `enemies.ts`: the foes (`ai` picks a behaviour in `entities/enemyAI.ts`, `model` a builder in `entities/models/`, `evade` how a shooter gets out of a hero's attack, `entities/evade.ts`; `throws` what a slammer throws at a hero too far off to slam, `entities/throws.ts`; stats at wave 1, `SCALING` for their growth).
- `biomes.ts`: each biome's enemy pool, boss, minimap, surfaces and music. `waves.ts`: how a wave is made from its budget, and the loot rules (`LOOT.rarityWeights`: a weight per rarity in `RARITIES`' order; Ascendant only from wave 8, whatever the wave's reward bonus, about 1 reward in 160 there and 1 in 70 by wave 15).
- `items.ts`: slots, rarities, stats and affixes. `quality.ts`: the graphics presets (none changes a shader). `tips.ts`: the loading screen's tips. `music.ts`: where each track loops and how the music fades. `heroColours.ts`: the colours a player's hero can wear (`entities/models/dye.ts`). `bugReport.ts`: the kinds of trouble the bug report's form offers, each with the labels an issue of it takes, and the form's limits (`src/ui/AGENTS.md`).

How a wave comes in is `src/game/AGENTS.md`; the quality presets, `src/core/AGENTS.md`; adding a class or a biome, the root's Architecture.
