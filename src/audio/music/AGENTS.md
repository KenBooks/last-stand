# `src/audio/music`

The music's tracks, one for each biome's lobby (and between its runs' waves) and one for its waves' fights, played by `core/music.ts` (the Music note in `docs/agents/audio.md`) where `data/music.ts` says each loops. `tools/music/README.md` says how each was cut from its piece.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md).

- **Never edit a track by hand.** Each is made by `npm run music -- make` from its piece, which prints where it loops; that loop goes in `TRACKS` (`data/music.ts`), to the last digit, every time a track is made again.
- **The pieces aren't committed.** They are WAVs the owner keeps; any in the repo's root are waiting to be made into tracks: leave them untracked.
- The tracks are MP3s at 44.1 kHz, LAME's VBR quality 5 (about 110 kbps), within a dB of each other (`npm run music -- levels`); keep a new one the same.
- A new track needs its id and loop in `TRACKS`, its import in `core/music.ts`'s `URLS`, a biome's `music` that plays it, and its place in `lab music`'s `EXPECTED` (`tools/lab/page/music.ts`).
