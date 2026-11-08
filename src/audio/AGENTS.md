# `src/audio`

The one kind of audio the game doesn't make as it plays: the music (`music/`). The sound effects are synthesized with WebAudio (`core/audio.ts`), and no other audio file may be added.

The music plays through a volume of its own and the master's (`musicOutput` in `core/audio.ts`, the pause menu's Music and Master sliders, #408), not straight to the speakers.

The rules across the game are the [root AGENTS.md](../../AGENTS.md); each directory under this one has an AGENTS.md of its own.
