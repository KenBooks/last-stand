# `hood`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`hood`: the mage's hood against its reference, by numbers (`page/hood.ts`), as tuning it by eye didn't converge (one
change to its cut reshaped the whole of it, and four reviews in a row failed it). Its outline: the hero taken into
the studio and drawn flat white from the front, his left and the back (what he holds hidden), and the reference's
figure cut from its plain backdrop (`--ref <marks.json>`: each view's picture beside the file, with where its eyes
and chin are, shares of it, and the sizes below as `"sizes": { "brim": [least, most] }` in cm where the reference
was made to others than the first's), both read on one grid in the face's unit `E` (the eye line to the chin; ours
from the head's anatomy, `toGroup`): how much of the two outlines is shared, how high it stands over the eyes, and
its width (from the side, its reach ahead and behind) at the crown, the temples, the chin, the nape, the neck and
the shoulders, ours beside the reference's, with each view's pictures cut to that window (through a 6° lens: at the
studio's 20° the hood's back, 20 cm nearer the camera than the eyes the scale is set at, read 10% wider) and the
outlines laid over each other (both white, the reference's alone red, ours alone green); its fullness held to the
reference's within 0.1 E at the chin (from his left how far behind the eyes it reaches, and at the nape; from the
back how wide: pulled in to the neck, it read as a shell where the reference's cloth hangs loose behind the head and
gathers at the nape, "do you see bagginess in the ref? where is ours?", and cut fuller, as a sack; below the nape
it's the capelet's, read, not held); and the head under it in the same unit (its scalp's height, its brow ahead of
the eyes, its skull's back behind them and its half width at four heights), so the reference's outline reads as how
far the hood stands off the head (the mage's snug hood was laid out from it). Its shape on the head, from its cloth
(`HoodCloth`'s `userData.grid`) and the face's skin: the rim ahead of the brow and of the cheeks and out from the
cheeks, the point above the scalp and the capelet below the nape, each against the sizes the reference was made to
(its marks' `sizes`; the first reference's, from its modelling notes: 6-8, 4-6, 4-6, 5-7 and 16-18 cm), outside them
a problem; and how far its top half moves from its standing shape over a walk (more than 4 cm, a tip flipping, is a
problem). Its opening round the face from the front and his left (`page/hoodOpening.ts`; laid close to those sizes
and that outline, the hood still hid the face as a tunnel, and neither read it): where its rim crosses each 0.2 E
from 0.6 over the eyes down to the throat (-1.4), ours from its cloth's edge and the reference's from its piping
(each row scanned in from the backdrop to the first run of its pale gold, past the seam's on the outline from the
side; its reads drawn as dots on the pictures), the rim's stand-off from the face shown, and the face shown (E²,
ours drawn flat with the skin white, the reference's by its skin's colour inside the rim). From the front ours more
than 0.1 E from the reference's rim from 0.4 down to -1.4 (flared out below the chin, it read as a funnel), from his
left the face shown ahead of its rim more than 0.05 E from the reference's from 0.4 to -0.8 (the reference's brow,
nose and chin stand further ahead of its eyes than ours: laid where its rim runs from the eyes, ours hung over the
brow, "do you see hood overhang in our case?"), or showing less than 85% of its face, is a problem. The seam down
the back: how far it strays aside from straight, standing and walking (0.3 cm at most; the Z a review saw at the
nape was the gathers' depth seen from above, not the seam). And the capelet's lie read again as he walks, every 15
frames (standing it lay clear; walking, the coat's stitched shoulder seam came through it as the arm swung). And how
deep his body comes through the hood above the capelet, from below the jaw to the join, standing and walking
(`page/hoodLie.ts`; the harness straps' tops came out through its front below the jaw, where the capelet's reading
never looked, "cloth should not clip through hood"): looked for within 6 cm out along the cloth's normal, a surface
met counting where it faces the way the cloth does (in the gathers' valleys at the nape the normal turns down, and
from 15 cm out its ray met his back from below, and a brass fitting); more than 0.1 cm is a problem, as through the
capelet (at 0.3, the coat's front of the shoulder stood 2 mm out through it and passed: what's read is the cloth's
outside, so anything through it shows). `--canary` makes the hood 0.7x as wide, which the rim's clearance, the front
outline's width at the temples, the back's at the neck and the opening at the eyes must read; moves it 2 cm forward,
which the rim from his left, the face shown ahead of it and the face shown must read; makes it 0.8x as deep, which
its reach behind at the chin from his left must read; sinks its front below the jaw 5 cm into him, which his body
through the hood must read; and puts a point of the seam 1 cm aside, which its straightness must read. `--edges`
lists each view's outline every 0.2 E down, ours beside the reference's (its edges; from the side, its reach ahead
of and behind the eyes): five levels didn't show where the side's parted from the reference's. Writes
`out/hood/sheet.png`.
