# `headshots`

The ranger's headshots (#750; `page/headshots.ts`): an arrow that strikes a foe's head is always a critical hit
(`HitOpts.head`, `combat/damage.ts`), judged where the shot met the body (`combat/strikes.ts` `onHead`: the piece it
met rides the model's head joint, a rigid mesh under it or a skinned triangle that joint moves the most), and only
over the shoulder or through the eyes (`aimsForHeads` in `skills/ranger.ts`: the owner's choice).

Every kind of foe (the bosses, the Ossuary Twins and the training dummy among them) is stood alone before the hero,
turned to face him, in its idle pose (it thinks as the dummy does and doesn't evade). His own chance of a critical
hit is put to nothing, so a crit is the game judging a headshot. Each aimed shot (Nockshot, Briarflight, Lancewood
Shot; `--skills`) is drawn to full at its head, then the foe is turned side-on and the shot drawn at its chest (from
the front the Mossback's head juts out before its chest, and the game rightly called that shot a headshot). The aim
follows the point each frame until the shot is loosed, as a player's would.

- **Close views** (`third` by default, `first` with `--views`): every head shot must strike and crit, every chest
  shot strike and not.
- **Top-down** (`top`): the first skill alone, and no shot may crit; a miss says nothing there, but at least
  three quarters of its head shots must strike, or "none crit" measured nothing.
- `--canary`: the first foe's head joint taken to be the joint its trunk hangs from (its chest, the dummy's sway): its
  chest shot must be found a headshot.
- `--trace`: how high each shot was aimed and struck (shares of the foe's height), what a straight line from the bow
  to the point meets first (by the joint it rides), and how far the game's own aim was from the point.

Where the head is, is read off the foe as drawn, not off the game's test: the skull is the half of the vertices its
head joint itself moves nearest that joint (the middle of them all lay in the air between the Hulk's branch antlers),
posed as now (`skeleton.update()`: the lab's frames draw nothing, so a skinned mesh's bone matrices are where the last
draw left them). The point aimed at is the one inside the skull nearest its middle that both the bow's line and the
camera's (the crosshair's, which the game aims by) meet on the head first: in some frames of the Colossus's idle a
piece of it stood before its skull's middle.

How it went wrong while it was written: dazed, a foe reeled and its head left the line as the arrow flew (a small
head was missed outright); frozen mid-reel, each round caught it in another pose. The over-the-shoulder aim took a
point met on a head 15 cm in towards the body's middle (`AIM_INTO`), which put a small head's point at its neck: the
Rift Witch's head shots struck her hood or went by. Through the crosshair a head's point now goes in along the eye's
ray (`aimAlong` in `core/input.ts`).

A head's point is one the head is met at from both the bow and the eye with 4 cm round it met too (`HEAD_MARGIN`),
and a head shot drawn to full is held until the game's own aim is on the foe (`SETTLE_FRAMES`), as a player holds
his draw until the crosshair is on the head: loosed as the draw was full, the camera still easing, the husk's and the
Rift Witch's small heads were passed by now and then, the game's aim on the floor beyond. A chest shot is loosed as
drawn: held, the husk's thin chest side on swayed off the line.

The A/B against main (`--foes dummy,husk,colossus --skills nockShot --views third --ab`): on main every head shot
is a body hit (and the dummy has no head joint), here every one a headshot. Over the shoulder every foe takes about
3 min 20 s here, top-down 1 min 15 s.
