# `src`

The game itself, booted by `main.ts`.

The rules across the game are the [root AGENTS.md](../AGENTS.md); each directory under this one has an AGENTS.md of its own.

- `main.ts`: the entry point. Boots every system (behind the loading screen, yielding between steps) and owns the main loop and the flow between the lobby and a run: the lobby's sandbox and practice, starting and leaving a run, the bank and continue choices, a class or save slot switch, the views, and the music wanted where the player is.
- `state.ts`: `G`, the shared mutable state systems read and write instead of passing long parameter lists. Keep it flat and documented.
- `events.ts`: a typed event bus, so systems react to each other without importing each other.
- `types.ts`: the shared types, data definitions (`SkillDef`, `ClassDef`, `EnemyDef`, `Item`...) and runtime ones (`Model`, `Effect`...). Type new data against them.
- `util.ts`: small maths and random helpers, among them the seeded `mulberry` for anything built deterministically.

| Directory | Contents |
| --- | --- |
| `audio/` | The music's tracks |
| `combat/` | Damage both ways, projectiles, lures, and the skills' behaviours (`skills/`) |
| `core/` | The renderer and its post chain, the views, input, sound and music, textures and materials, quality |
| `data/` | Pure tuning data, typed against `types.ts` |
| `dev/` | The developer mode (dev builds and PR previews only): the free camera, freezing, the dev panel |
| `entities/` | The player, the enemies and their AI, first person; their models (`models/`) |
| `fx/` | Particles, the pooled point lights, transient effects and the skills' looks |
| `game/` | The run (waves, loot, bank or continue), the warm-up at boot, the lobby floor, the scores |
| `loot/` | Items, profiles, loadouts, save slots |
| `net/` | Co-op |
| `ui/` | The page's UI, its styles (`styles/`), the world's overlays (`overlay/`), the skill icons |
| `world/` | The biomes' arenas, their props, the wall, navigation |

## Gotchas

- **Lobby sandbox:** in the lobby `player.sandbox = true` (free casting, no costs or cooldowns) while its panels are open, a note above its skill bar saying so (`.lo-free`). With them all out of the way (`lobbyPractice` in `ui/menus.ts`: stowed, with Space or V into a close view, or laid out side by side each folded away) it is practice as a run is (`syncPractice` in `main.ts`): the run's bottom bar (`#hud.lobby`: health, the skill bar, energy, nothing else of a run's) and real costs and cooldowns; shown again, the cooldowns clear and the energy fills. A run clears it (`beginRun`), and practice is the lobby's alone: a run begun in practice, a co-op guest's as its host starts, kept free casting through it (`npm run lab -- practice`).
