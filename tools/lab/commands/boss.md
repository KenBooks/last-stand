# `lab boss`: the Ossuary Cantor's encounter

The Crypt's wave 10: the Ossuary Cantor and its two Bell-Warden guards (`page/bossEncounter.ts`;
`src/entities/cantor.ts`, `src/entities/bellWarden.ts`). The Bell-Warden is the Cantor's guard alone: no part stands
one up as a boss of its own. The ladder, `stand` and `ttk` are in `COMMANDS.md`'s entry.

- `toll`: a Bell-Warden risen as a guard (its guard's size) left to think and toll at the hero 4 m off (he must be
  stunned for its `stun` within 0.1 s, its ring reaching him no sooner than its warning's end after the bell began its
  swing), 8 m off (the ring reaches him past `stunsTo`: never stunned), and with his shield raised towards it (a
  warrior with `--gear shield`: never stunned; the part says so where the hero has none); its ghost is held over the
  bell, so it dives at no one (its dive is `dive`'s), and the hero is turned to it and kept where he stands.
- `swing` (`page/bossSwing.ts`): a guard's bell read off its own joint through a toll at the hero: its turn about its
  crown's axis and off it (0.5 degrees at most), its swing's angular acceleration (20 rad/s² at most: a pendulum's is
  its swing times its rate squared, about 9; the old swing back and fling through, 350), and the body's turn as it
  tolls (none); pictured from its side through the toll; its canary swings it four times as far.
- `encounter`: first the run's own wave 10 set off twice (`page/bossGuardSpots.ts`): its guards must rise at the same
  two spots both times, each within 5 cm of the other's mirror through the middle, on the crypt's walks (a ray down
  meets them), 1.2 m of room past their bodies to any prop and 30 degrees off any gate. Then the Cantor and its guards
  risen at wave 10's strength, each guard at most half the Cantor's height (from play, full-size bells were "almost
  like main boss"), and left to fight the hero (kept whole) for 28 s: no stun from a guard's toll further than its
  `BELL_WARDEN.toll.stunsTo` (the hero's body and 0.5 m over), no frame seized by a guard's ghost, a guard at 15% of
  its life still in its first phase, neither guard moved over 1 mm from where it rose nor turned, each raising the dead
  round it (its first group by `raise.first`, the next `raise.every` apart, half a second's slack; none near it after
  it falls; never more foes up than the wave's `maxAlive`: the lab keeps what the fight raises, `Lab.keepRisen`), each
  hovering, its bell's lip over the floor at every frame, and its one ghost about it (the bell's joint, the ghosts'
  `seen`); the Cantor warded every frame (2 frames' slack) and taking the ward's `taken` of the damage. Then the
  guards killed and 24 s more: never warded, at least one cast landed, its heart bared after one (`weak`); every one of
  the Cantor's hits landed 0.9 to 3 s after a ring of its own; the guards tolled, and no two bosses' warned hits (tolls,
  grave hands, dirges) landed closer than `CANTOR.beat`, two frames' slack. Its canary wards nothing and sends guards at
  a whole bell's size that walk, rising at the gates and raising the dead every 3 s, their tolls stunning as far as a
  whole bell's would.
- `bars`, `dive`, `choir`, `graves` (`page/bossChoir.ts`): wave 10's boss bar naming the Cantor, warded by the guards
  standing, and each guard's own bar; a guard's ghost diving at a hero near its bell, not one who steps aside or stands
  off; the choir's ring hurting outside alone, after its warning, never inside; its stones at their most, never in a
  hero, never walling a spot in, stopping arrows, sinking as it falls.
- `compiles`: a guard's toll, the Cantor's grave hands, a dirge, a ring, its ward and its heart bared, its choir's ring
  and a gravestone, drawn: no pipeline made (`PIPELINES.made`); its canary draws a material of a blending, side and
  depth none else has together.
- `ttk` (`encounterTtk`): the encounter at 10 from the hero's damage a second: its two guards one after the other
  (each `asGuard.life` of a Bell-Warden's), then the Cantor with its heart bared `bared` s of every `every` (its weak
  window's `taken`).
- For the eye, asked for alone: `encounterPictures` (the encounter at each of its moments), `cantorLook` (the Cantor
  alone from its front, back and sides and its skull close, its triangles held to 45k: `page/bossCantor.ts`), `film`
  (a guard's toll as the game draws it from low at its side, `page/bossFilm.ts`, and the guards as wave 10 sends them,
  `page/bossGuardFilm.ts`), `choirPictures`; and `frames`, the frame's time through each of the Crypt's boss waves in
  turns (`page/bossFrames.ts`). Pictures in `tools/lab/out/boss`.
