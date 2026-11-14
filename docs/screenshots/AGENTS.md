# `docs/screenshots`

The README's pictures: the one place pictures may be committed (the root's Product rules). Each is made by a command, so it can be made again when the game changes:

- **The screenshots** (`village`, `campfire`, `hall`, `stash`, `forest`, `crypt`, `choice`, `party`, `down`) are `npm run lab -- readme --screen 1600x900@1 --class mage`, and `forest` with `--class warrior --shots forest` (`tools/lab/COMMANDS.md`'s `readme`: what each poses). It writes PNGs to `tools/lab/out/readme`; save each here as a JPEG at quality 86 (150 to 460 KB at 1600x900; the PNGs are 2 MB each).
- **The key diagrams** (`keys-<class>.png`) are `npm run icons -- keys`, read from the classes' data (`tools/icons/README.md`).

What a picture is for:

- **A picture has content**: the heroes, foes and effects fill it (from the owner: "dont make 90% empty room"). Bring the camera in (the over-the-shoulder view, the top view's close zoom) and stand the scene by something to look at.
- **A picture shows one thing**: nothing on the screen that isn't what it's about (from the owner, of a wave's choice left up in the picture of a downed partner: "focus people attention of what you're showing").
- **Nothing a player doesn't see**: no dev tab, no "Click to look around", and never an unbanked item's name.
- The party's partners are stood in on one page, not four linked games: fine for showing how a party looks, and to be said where it matters.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).
