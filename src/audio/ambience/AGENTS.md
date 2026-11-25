# `src/audio/ambience`

The ambience's recordings, played by `core/ambience.ts` (the Ambience note in `docs/agents/audio.md`): the
village's forest by day (`ambience-day.mp3`) and by night (`ambience-night.mp3`), the fountain's water
(`ambience-water.mp3`) and a fire burning (`ambience-fire.mp3`, every fire built in the game).

The rules across the game are the [root AGENTS.md](../../../AGENTS.md).

- **An exception to the game's sounds made in code**, as the music is (the root's Product rules). The ambience was
  noise until #891's review: "Sounds need a lot of work, the water does not sound like water, and the crackling does
  not sound like crackling. Use attached sounds instead" (Kenneth, who supplied these four, on 2026-11-24).
- **Never fetched with the game.** Each is fetched the first time it's wanted and the install leaves them out
  (`ON_DEMAND` in `scripts/pwa.ts`): together 2.3 MB, against the rest of the game's 3. Their names start with
  `ambience-`, which is how the worker knows them: a new one keeps that start.
- **Their seams are the game's work, not the file's.** A recording is made a loop as it's decoded (`seamless` in
  `core/ambience.ts`: its faded ends cut, its last 1.5 s blended into its first), so a file needn't loop by itself,
  and an MP3's padding never reaches the seam. A new one is checked by `npm run lab -- village --only ambienceSeams`.
- They're as supplied: stereo MP3s of 13 to 28 s, 128 to 205 kbps. Made mono at a lower rate they'd be a quarter of
  the size (`npm run music` has the tools, with ffmpeg on the path): not done yet.
- Each is evened to the same loudness as it's decoded (an RMS of 0.1, `LOUDNESS`), and set by its layer's level
  (`LEVEL`): a new one needs no level of its own in the file.
