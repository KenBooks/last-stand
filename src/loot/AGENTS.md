# `src/loot`

Items and what keeps them.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `items.ts`: item generation and stat aggregation (a class's bases and the stats it can't roll).
- `profile.ts`: the persistent profiles, one per class and save slot (equipment, stash, records; classes share nothing). `loadout.ts`: which skill is on which key, per weapon style for a class with gear-driven skills. `saveSlots.ts`: the three saves. `slotData.ts`: a slot's whole content as plain data (every key it keeps, read, written, rearranged).
- Cloud saves (#382, milestone "Cloud saves"; the service is `server/saves`): `cloud.ts` the sync on this device, `cloudApi.ts` the service's calls and the browser's passkey prompts. Their screens are `ui/cloudSaves.ts`.

Where each is stored is the `src/loot/` row of the root's Architecture.

## Gotchas

- **Rarities** are `RARITIES` in `data/items.ts`, worst to best: Common, Magic, Rare, Epic, Legendary and Ascendant (#403, orange, from play: "orange rarity, more rare than purple"; 5 or 6 affixes, power 2.5, a name of its own before its base: `ASCENDANT_NAMES`). Everything that orders, counts or colours them reads that list (`rarityIndex`, `rarityCounts`, `byValue`, the icons' gems, the glow's order), so a new tier is one entry there, a weight in `LOOT.rarityWeights` (`data/waves.ts`, in the same order), a tone in `sfx.loot` and its id in `RarityId`; the lab's and the stalls' own lists of rarities (`tools/lab/node/commands.mjs`, `options.mjs`, `page/uiGlow.ts`, `tools/stalls/page.mjs`) name it too. An item crosses the wire whole (co-op's loot and the lobby floor's drops), so a new tier bumps `PROTOCOL` (`net/session.ts`): an older build would read it as Common. A saved profile only holds the ids it was given, so a new tier loads every old one as it was.
- **Save slots** (`loot/saveSlots.ts`; the screen is `ui/saves.ts`, from the lobby's "Save slot N"):
  - Everything saved for the heroes goes through `saveKey`: profiles, loadouts, stash filters and the lobby's class. A slot's delete (`erase` in `ui/saves.ts`) must remove each of them, so new per-hero storage needs both. Preferences (quality, battleground, perf overlay) are shared by all slots.
  - Slot 1 keeps the keys from before there were slots. A cached production build shares this origin's storage and only knows those keys, so don't rename slot 1's keys (cloud saves move a slot's content between slots, never its keys).
  - **A new key kept per hero or per slot goes in `slotData.ts` too** (`heroEntries`): it is what cloud saves upload, move and download. A key missing there stays behind on this device when slots move, and never syncs.
  - Switching slot (`switchSaveSlot` in `main.ts`) rebuilds the hero in place, like a class switch, and in co-op sends the new look. While the screen is open the hero stands idle and the screen takes Esc.

- **Cloud saves** (`cloud.ts`):
  - The cloud save is slot 1. At the first sign-in on a device the player chooses which slot goes up, or the account's save comes down. Then slots are rearranged (`rearrangeSlots`: each read before any is written) and slot 1 is played at once (`setSaveSlot(1)` with the move, so a save of the hero in memory can't land on the slot his save just left).
  - Parts: `hero.<class>` (his `heroEntries`, as stored) and `shared` (the class last played, the co-op name tag and colour, the volumes, the portraits; not the quality: a phone's isn't a PC's).
  - Each part's last synced copy is kept (`last-stand.cloud.v1`, with the session's token), so a change on either side is told by content: an older build, cached, writes slot 1 with no idea of syncing, and is still caught.
  - Changed here only, a part is uploaded over the version it came from. Changed in the cloud only, it is downloaded, in the lobby alone (a run's hero is never swapped under the player; `canApply`), and the hero is rebuilt (`reloaded`). Changed on both, a hero's is the player's choice (`ui/cloudSaves.ts` `askConflicts`): never merged, never picked. The copy not kept goes to an empty slot, or the dialog says it will be lost. `shared` takes the cloud's.
  - Synced 3 s after a save of slot 1 (`cloudTouched`, from `saveProfile` and `saveLoadout`), every 60 s while the page is in view, when it comes back into view, and when the network does.
  - Offline, slot 1 plays as a local save.
  - A refused session (401) signs the device out; slot 1 stays.
  - **Google** (`goToGoogle`, #503): the page goes to Google through the service and comes home reloaded, with `#cloud-google=<code>` in its address (or `-error=<why>`), which `initCloud` takes off the address and finishes as the game boots (a sign-in's session, or a link finished with this device's production session) (`googleLanding`, shown once the lobby is: `main.ts`). The tab binds the sign-in with a nonce in its session storage, sent as it goes and again with the code: a code from a link someone sent is refused. Its buttons show only when the service's health says Google is on; Link and Unlink Google are production's alone.
  - Google sign-in binds to the origin's site, not every game environment. A preview Google sign-in does not claim that Google identity on production or another preview. Copying production heroes asks for a one-time code made by a separately signed-in production session (`makeCopyCode`, `copyProduction`), then syncs the preview account's new copy.
  - `/saves/health` is public: ask it without the account's bearer token. A signed-in browser preflights a token-bearing GET; if that preflight fails, `googleOn` reads false and hides Link Google even while saves and `/saves/health` otherwise work.

- records.bestReached holds each biome’s highest attempted normal-run wave for Training grounds, per hero and save slot. Old profiles seed it from bestBanked only: their global bestWave cannot identify a biome. Training never writes progression or banks items.
