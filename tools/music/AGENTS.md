# `tools/music`

The music's tool (`README.md`): `loops` finds where a piece can loop, `map` pictures it against itself, `make` cuts a track from it and checks its seam, `seam` checks any track's, and `levels` says how loud each is. How the game plays the tracks is the Music note in `docs/agents/audio.md`.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- **The pieces are never committed**: they are the owner's WAVs, and what the tool writes stays in its own `out/`.
- **A track made again prints its loop**, which goes in `TRACKS` (`src/data/music.ts`); then run `npm run lab -- music` to hear it played as the game plays it.
- `seam --canary` must catch a seam put 37 ms off: a check that hears nothing there measured nothing.
