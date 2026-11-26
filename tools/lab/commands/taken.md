# `taken`

What a wave's foes deal a second to one hero standing among them who doesn't fight back (`page/taken.ts`): the most
a wave can put on him, as a player moving and killing takes less. Made to tune the healing beam (Lifethread,
`src/combat/skills/lifethread.ts`) against wave 40, where it was found not to keep up (from play: "it doesn't help
on higher levels like wave 40 when everyone has 5-6k health").

Each wave (`--waves`, 40 by default) is set off in each biome (`--biomes`) from a seed of its own and played at the
game's own pace, the hero standing at the arena's middle (`--at` moves him). He's kept up past any blow (his Health
held at a thousand times his most every frame) and every blow on him is read as it lands (`Player.takeDamage`
wrapped on him): what the foe sent, and what reached his Health past his block, ward and armour. From the first
blow on, over `--seconds` (30) of the game's time, it says the blows, both a second, the worst second (a window
sliding blow to blow) and the most foes standing. Then the beam's heal a second, read off the mage's data
(`threadHeal`): at an early hero's Health (1000) and wave 40's (6000), the healer at no gear and at +150% All
Damage, unramped and at its most (×2).

A wave that lands no blow on him in 40 s is a problem. `--canary` makes him untouchable as the wave comes
(`guardUntil`), which must be found so.

Read on 2026-11-26 (one seed a wave, so a wave's figures move by a few tens of percent with the seed):

| Wave | Crypt a second (worst second) | Thornwood a second (worst second) |
| --- | --- | --- |
| 5 | 289 (726) | 198 (577) |
| 20 | 1023 (2447) | 760 (2243) |
| 40 | 522 (2520) | 1123 (3200) |

Sent and taken were the same in every wave: a hero's armour takes nothing off a blow before his Health (his block
and ward alone do). The command takes 40 s with a page booted.
