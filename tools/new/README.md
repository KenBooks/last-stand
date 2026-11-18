# New

Starts a piece of content as a copy of a sibling's files under its own id, and says what is left to do.

```bash
npm run new -- foe spitter                 # src/data/foes/spitter.ts, src/entities/foes/spitter.ts, from the imp's
npm run new -- boss bonelord               # a boss, from the Thornheart's
npm run new -- house forge                 # its data and its room's build, from the house of records'
npm run new -- place well --like rack      # a village place with a build of its own, from the weapons rack's
npm run new -- screen bazaar --like trade  # src/ui/screens/bazaar/: module, markup, styles
npm run new -- lab-command reach           # tools/lab/node/commands/reach.mjs, from eval's
```

Every file it writes starts with a marker, and in code a name nothing declares, so `npm run typecheck` names each
file until it's rewritten and the marker deleted. The sibling's id is renamed wherever it stands as a word of its
own, in paths too: an import of a module the sibling shares with others (`loot/trade` for a copy of the trade
window) comes out renamed, and the typecheck names it to put back.

Tests: `npm run new:test`.
