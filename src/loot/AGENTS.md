# `src/loot`

Items and what keeps them.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `items.ts`: item generation and stat aggregation (a class's bases and the stats it can't roll).
- `profile.ts`: the persistent profiles, one per class and save slot (equipment, stash, records; classes share nothing). `loadout.ts`: which skill is on which key, per weapon style for a class with gear-driven skills. `saveSlots.ts`: the three saves.

Where each is stored is the `src/loot/` row of the root's Architecture.

## Gotchas

- **Rarities** are `RARITIES` in `data/items.ts`, worst to best: Common, Magic, Rare, Epic, Legendary and Ascendant (#403, orange, from play: "orange rarity, more rare than purple"; 5 or 6 affixes, power 2.5, a name of its own before its base: `ASCENDANT_NAMES`). Everything that orders, counts or colours them reads that list (`rarityIndex`, `rarityCounts`, `byValue`, the icons' gems, the glow's order), so a new tier is one entry there, a weight in `LOOT.rarityWeights` (`data/waves.ts`, in the same order), a tone in `sfx.loot` and its id in `RarityId`; the lab's and the stalls' own lists of rarities (`tools/lab/node/commands.mjs`, `options.mjs`, `page/uiGlow.ts`, `tools/stalls/page.mjs`) name it too. An item crosses the wire whole (co-op's loot and the lobby floor's drops), so a new tier bumps `PROTOCOL` (`net/session.ts`): an older build would read it as Common. A saved profile only holds the ids it was given, so a new tier loads every old one as it was.
- **Save slots** (`loot/saveSlots.ts`; the screen is `ui/saves.ts`, from the lobby's "Save slot N"):
  - Everything saved for the heroes goes through `saveKey`: profiles, loadouts, stash filters and the lobby's class. A slot's delete (`erase` in `ui/saves.ts`) must remove each of them, so new per-hero storage needs both. Preferences (quality, battleground, perf overlay) are shared by all slots.
  - Slot 1 keeps the keys from before there were slots. PR previews and a cached production build share this origin's storage and only know those keys, so don't move slot 1.
  - Switching slot (`switchSaveSlot` in `main.ts`) rebuilds the hero in place, like a class switch, and in co-op sends the new look. While the screen is open the hero stands idle and the screen takes Esc.

- records.bestReached holds each biome’s highest attempted normal-run wave for Training grounds, per hero and save slot. Old profiles seed it from bestBanked only: their global bestWave cannot identify a biome. Training never writes progression or banks items.
