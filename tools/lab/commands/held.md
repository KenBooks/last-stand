# `held`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`held`: every held skill of the hero's class (`SkillDef.aimed`: the ranger's Hedgeward and Strawman, the mage's
Starfall and Veilstep; `page/held.ts`, `--class`) held as the player holds it, over a training dummy the way the
camera looks: ready, its preview shown in its own look with no countdown, and let go it casts; then held through
its cooldown and short of energy (`page/heldCooldown.ts`, as `blink`'s), red and counting 3, 2, 1 until a release
would cast. Quarry Mark's red outline (`ui/overlay/outline.ts`) is checked in the top-down view, over the shoulder
and through the eyes: round the foe the cast would mark, the pixels it lit (red risen over the same frame drawn
without it) near the foe on the screen and none away from it; and in the top-down view over the biome's commonest
foe too, standing dazed (a creature, drawn in its kind's crowd: its own meshes are on a layer of their own, which
the outline must still draw). And over each biome's boss with its summons about it (one between it and the hero)
and two of the biome's commonest foes beside it, each a hair off its circle (`bossWithSmall`), dazed, in each view (`page/heldBoss.ts`, the screen read by `page/onScreen.ts`): the key held and the aim swept a frame each across a grid over each foe's box on the screen
(the crosshair turned onto each point in the close views), the outline must be round the foe drawn there at every
point, met by the eye's ray on its meshes as they're drawn, skinned and rigid, a breakable prop in front leaving
the point out (a miss says where the game's aim was against the point drawn); let go over the boss where it lies
deepest in another foe's circle, with the aim moving on onto a small foe as the cast goes, and again while a shot
is drawn (the cast waiting for it), the boss must take the mark (`main`'s aim, met on the rigid meshes alone,
outlined the thornheart at 53 of 119 points through the eyes and marked a small foe in every view; and the mark,
given to the foe nearest the cast's point on the floor, went to a small foe pressed against the boss, which the
outline had never been round). The boss marked, its reticle (`page/markSeen.ts`) must stand over its top as drawn
and be seen whole from the camera, its middle and its ring's points round it, none of them met by the eye's ray on
a body before it (off the screen, a close view's near a tall boss, they're said but aren't problems); `main`'s,
placed by its height, stood inside a boss's crown. With `--pictures`, each round pictures the mark over the dazed
boss, its stars with it.
Starfall is cast ten times over the dummy with more
standing round it inside its ring as drawn and outside it (`page/heldArea.ts`): every one inside must be struck on
every cast (each one's casts struck by its distance). Each skill is then held across the dais's step from off it
and let go: every mark it lays on the floor (`fx/floorPatch.ts`) is read triangle by triangle against the floor
under it, and must lie on more than one level with no point under the floor or standing off it. Then the shaders
compiled meanwhile, which must be none (the rounds they came in are said). A preview missing, in the wrong look or
off its countdown, a release that cast when it mustn't or didn't when it must, an outline off its foe, a foe inside
Starfall's ring missed, a mark off the floor and a late compile are problems. `--pictures` (on by default) pictures
each preview ready, on its cooldown and across the step into `out/held`; `--canary` reads each preview ready with
no countdown on its cooldown, draws Quarry Mark's outline round the hero (the programs it compiles aren't counted:
the game never outlines a hero), moves its outline over the forest's boss onto a thornling and the boss's mark onto
it, puts the mark's reticle at the boss's middle (which must be found hidden), reads Starfall's ring as drawn round all its crystals may strike, lays the marks
across the step point by point on the floor under them, as they were, and compiles a shader mid-game.
