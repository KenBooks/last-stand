# `lab trophies`

The default check inspects every trophy place with empty and completed records and pictures the hall in both
states. Its canary shows an unearned trophy and moves a different trophy off its place.

`npm run lab -- trophies --earned` spawns the Colossus in a solo Crypt run, waits for it to become targetable
and deals a lethal hit. It leaves through the pause menu, loads the saved profile and opens the house of records.
The saved kill must count once. A ray through the Colossus display must hit the trophy, and the other trophies
must stay hidden. `--earned --canary` removes that kill from the loaded in-memory record before opening the room.
The ray must then meet the empty mount.
