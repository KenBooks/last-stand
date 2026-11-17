# `src/ui/guide`

The in-game guide (`#guide` in `index.html`, styles `src/ui/styles/_guide.scss`): every foe and boss, each hero, and tips, browsed by section and entry. Opened by **G** anywhere (but over the hero selection screen or a run's summary), the pause menu's **Guide** tab (a door per section), and How to play's **Open the guide** (the notice board). The panels' lobby has no link of its own for it: its row of links is laid out in rows of three that keep the panel from scrolling (`docs/agents/ui-menus.md`'s bug report note), and G and the pause menu reach it there. It always opens over the pause menu (`showGuide` in `main.ts`): opened from elsewhere the menu is opened under it, holding the game as a pause does, and put away with it; Esc or G closes the guide first.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md); the UI's are [`src/ui/AGENTS.md`](../AGENTS.md).

- `index.ts`: the modal, its sections and entries, where it was left (`last-stand.guide-page` in local storage), and the dev build's warning of notes missing.
- `foes.ts`: a foe's or boss's page from `data/enemies.ts` (stats grown by `SCALING`, elites by `HERO`, a boss's fight by `BOSS_AI`, throws, evasion), `data/biomes.ts` (where and from which wave it comes), its blow against the hero's own armour or resistance now.
- `heroes.ts`: a class's page from its data: base figures, every skill as its tooltip states it (`skillTooltip`: the played hero's own figures, the others' base ones), the weapon styles (gear made from the class's own bases, each style shown where its default loadout differs: `STYLE_TRIES`), the staffs' schools, loadouts and combos, the gear bases per slot.
- `tips.ts`: banking, loot chances, items and the lobby floor, block, daze and freeze, staying alive, waves and score, co-op, duels (`PVP`, `DUEL_WINS` and `WINS_USUAL` in `game/duel.ts`), controls, each figure from `data/balance.ts`, `data/waves.ts`, `data/items.ts` and the classes' skills.
- `portraits.ts`: each foe's and hero's own model drawn into a picture by a small WebGL renderer of the guide's own (never the game's, which links no program for them), **made behind the lobby a piece a frame** (`game/behind.ts`, queued by `main.ts` with the heroes, after them; stepped too while the guide is open over a paused game): the renderer, each model (a hero's in his build's own pieces), its staging, its textures sent a piece each, its draw, its picture encoded by `toBlob`. While the browser compiles it and encodes its picture the build leaves the queue and comes back as each is done, so nothing behind the lobby waits on it (`lab behind` waited 1200 frames for it otherwise). A production build keeps the pictures in IndexedDB for its own build (`CACHE`, keyed by `__BUILD__`), another build's let go; a dev build makes them afresh. Opening the guide makes nothing: a picture not made yet comes as it is, the page's own moved to the front (`hurryPortrait`).
- The words are `src/data/guide.ts`: how and why, **never a figure** (every number is read from the data as a page opens).

## Keeping it current

**Any change that adds or changes a foe, boss, skill, weapon style, staff school, item base or mechanic updates the guide in the same PR.** The figures follow by themselves; the words don't:

- A new foe fails the typecheck until it has a `FOE_NOTES` entry (`Record<EnemyId, ...>`).
- A skill or class with no note still shows from its data, and the dev build's console warns (`guide: no notes in data/guide.ts for ...`) as the guide opens. Write its `CLASS_NOTES[cls].skills[impl]`, and add it to a loadout or combo where it belongs.
- A loadout or combo names skills by `impl` and shows only where the class has them all: notes for a skill still in an open PR can land before it, and appear as it merges.
- A new weapon style shows once its default loadout differs from the styles before it; give it a `STYLE_NOTES` entry (and a `STYLE_TRIES` gear set if none of them makes it). A new school needs a `SCHOOL_NOTES` entry.
- A behaviour change that the words describe (a foe that now dodges, a skill that now dazes) means rereading its note: the notes say "slow", "dazes", "cannot be knocked back".
- A number in a behaviour's code (as the boss's summons and volleys were) belongs in the data, where the guide can read it.

## Gotchas

- **Nothing heavy may run as the guide opens or changes page** (Victor on #665: "lags for 1-2sec, unacceptable"). Made all at once as it opened, its pictures held the page 1.2 s (`lab guide --canary`); one a frame, 90 to 110 ms a frame for a second. Made behind the lobby, the opening's frame is 12 to 17 ms and the longest moment of a walk through every page, its pictures still being made, 45 to 62 ms (a hero's first draw, which sends his geometry to the card). Check with `npm run lab -- guide` (and `--canary`), and `npm run lab -- behind`, whose queue the pictures share.

- Its figures read `G.player` (armour, resistance, speed, the hero's own skill figures): a page is made as it opens, so open it again to see a gear change.
- The foes' pictures take a frame or more each; under the lab's clock they come slowly (its frames hold `requestAnimationFrame`, and `compileAsync` polls on real time): run `live frames` a few hundred times before a picture.
- Checked at 1920x1080, 1024x700, 820x1180@2 and 832x384@2.8125 with `npm run lab -- live` (G pressed by `live eval`, a frame run before clicking its sections); its opening's cost by `npm run lab -- guide`.
