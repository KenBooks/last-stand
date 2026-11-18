# `sit`

The report stays in the page until its pictured moments are transferred one at a time: all five seats' pictures in
one Playwright message exceeded Node's string limit. The far-end close-up aims above the ground surface, even when a
point is buried, and keeps each camera above the terrain where it stands; for a laid two-hander it follows the drawn
vertex nearest the tip, since the lowest mesh can instead be its grip. Nearby seats or the hero can still obscure
individual views, so inspect the other views too.

The unobstructed front close-up hides the brazier's whole assembly, including its stepped plinth: hiding the flames
alone left the mage's lower body behind the step. The ordinary views still show the scene as played.

The mage's crystal and rings turn continuously: the held-again check compares their mount and scale, while the
frame-by-frame motion check still follows the meshes as drawn. Comparing their spin at two times reported a 140°
change even when the grip had returned.

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`sit`: an idle hero's sit on a log, a stone or the floor by a fire (`page/sit.ts`; `entities/sitting.ts`, `models/sit.ts`,
`world/seats.ts`), read from what's drawn. On each seat (`--seats`: the forest's `log`, its lowest `stone`, the
crypt's fallen `column`, the floor by the forest's `fire` and the crypt's `brazier`, and in the village's lobby a
`bench` round its campfire and the floor by the `campfire`, and in its houses the tavern's `stool` and
its `tavernbench` and the library's `armchair` (sat facing its way alone, `Seat.faces`), each room gone into as its door
takes him in (`intoRoom`), the run set up and left for it each case and the hero put off each seat
there, `showPlace` and `standAt` (nearer than 3 m where a room has no clear floor that far off); the set-up's `--gear`,
`--weapon` and `--tune` reach it) he's set up 3 m off it on clear floor, facing it, and left idle (the lab's set-ups
hold sitting off, `Player.sits`; this one lets him once set up) until he has walked there and sat (by 16 s): on the
spot nearest where he stood, within 5 cm; his thighs' pivot 6 to 17 cm over the seat's top as drawn under it, every
frame he sits for 7 s (by a fire, over the floor); his feet hanging (every ankle over 16 cm off the floor) on the
log and the column, down (under 13 cm) and still (3 cm at most) on the stone and the floor; every joint within its
range as `range` reads it (the drawn hand on its grip), sitting down and sat (and standing idle before it, said, not
his sit's); nothing of him drawn over 3 cm under the floor but a weapon stood on its point, as far as the model says
it's in (`userData.stuckIn`; the mage's staff went 40 cm in on the stone, then his robe 6 cm, a hidden weapon read
as one, and by a fire his book 21 cm and the shield 11), and what's stood on its end on the floor
(`userData.stoodOn`, set by `footOutOfFloor`) drawn on it, 3 cm over at most (slid by the world's rise read in the
hand's frame, the mage's staff stood 18 cm over it on the log and 77 on the stone); a glance past 15° as he sits;
every hand holding nothing (no rigid piece shown under it) resting on his legs, its palm within 6 cm of the rig's
thigh and shin capsules and no more than 3 cm into them, the clothes over them (from review: an empty hand hung
beside the knee, palm forward, touching nothing, 9 to 19 cm off; `armOffThigh` had swung it off the thigh; rested
before the look, a glance moved it 8 cm); by a fire, his hips facing it within 15° (a review read 30 to 45 off from
the above view, which stands behind him to one side). His skirts are followed as he sits, as `coat` follows them
standing (`coat.ts`'s `follow`): a point whose move a frame changes by over 1 cm jerked (`--frames` lists them), and
from 1.5 s after he's sat, once the cloth has eased into place, no point may wander over 10 cm (a hood turns with
his glance and is let be). From play, "on log cloth is jerking few times per sec": the mage's robe jumped up to 17
cm a frame on the log (162 frames in 7 s) and 54 by a fire, the drape between his raised knees going round one or
the other as his hanging feet swung and the cloth's flutter moved it a few millimetres (`Skirt.ease`). Then he's
asked to act from it, a step and an attack, tapped (3 frames) and held: he must begin getting up within 2 frames,
attack nothing before he's up, be up within the time his body and his hands take back (`riseMost`: 0.8 s and 0.4 to spare bare-handed, about 1.3 and more with a two-hander's weight), and once up do nothing after a tap (moved 5 cm at most, no
attack: a tap isn't queued) and do a held key (walked off 0.6 m, or attacked). Pictured half way down and sat, from
the front, the left and above behind, and sat in the game's own views (`top`, `third`); by a fire from his right,
behind and above, and from ahead with the fire hidden, framed on his knees (`fromBeyond`: through the flames the
front view saw nothing of his legs, and the robe's panels standing out from his knees through his hands went unseen,
"lots clipping near fire, how did you miss it ?"). Sitting down and sat, his forearms and hands are read against
his legs' and trunk's capsules (`armsInLegs`, `armsIn`) and the weapon in his hand and the ranger's bow against his
body (`WeaponBody`), each allowed 3 cm in (`INTO_BODY`: "ranger hands clipping through legs, in sitting pose near
fire", "bow clipping through body in log sitting"), and the moment any went deepest is pictured close from his
right, ahead, his left and above, his skeleton drawn over him and his skirts, the fire, the plants and the rocks
round him hidden (`IntoBody`, `DEEPEST_VIEWS`): the depth alone didn't say which way an arm went in, and fixes tried
blind took a minute a round, two agents' worth of them, without converging on the floor pose.
The same close-up is retained for each later sit before an ask: a second sit on the stone put a greataxe's haft
15 cm into the chest even though its first sit was clear, and the temporary report discarded that picture.

What he carries is followed from his set-up until he's up again (`page/sitCarried.ts`): every rigid mesh of his model
(a weapon's, the shield's, the staff's, the bow's, the book's), grouped by the object over it hung from a joint. A
piece the pose moves (one hung from a hand that a palm is on at some frame, within 6 cm of its box, or one taken over
15 cm from where it hangs) may move only in a hand or lie still: one that went over 3 cm in all with no palm on it,
moving in the world and on the joint it hangs from, moved on its own; and any mesh turned over 25° or thrown over 12 cm
in a frame jumped. Once a tap has left him up and still, what he held as he began to sit must be held as it was,
every corner within 3 cm on its joint and turned under 10°; a hold the walk to the seat moved is said apart, as
the walk's (`as he began to sit, his bow ... before he walked there`: read from the set-up, before the walk, the
ranger's bow by the fire had moved 6 cm in his hand on the way from the stone's set-up, and he got up holding it as
he sat down with it). From play, both passed by every measure before: "staff dropping
in a weird way" (the mage let go of it at a fifth of the way down and it went on to the floor on its own, 8 m of
movement in all), "staff rotated when he stands up" (140° turned in his hand), "he just summons the bow into his hand
using jedi force", "when warrior sits on a log, weapons are being pulled around with jedi force too, on sit down, and
on stand up" (his sword flew 113 cm in a frame). A piece held is moved by the hand, not in it: each frame adds the
lesser of its move in the world and in the hand's frame (with the hand, it moves in the world alone; a palm moved
over a piece standing still, in the hand's frame alone), frames under 0.5° and 3 mm left out as the grip's own
fitting, and it may turn 20° and slide 5 cm (its group's origin: a grip, a bow's handle) in all while gripped. From
play, both passed every measure: "warrior magically rotates the sword in his hand" (the greatsword swung half round in
his fist as he lowered it, 2° a frame), "ranger uses force pull to grab his bow from seated near fire" (2.6 m through
his hand). Gripped is a palm on it, round it (not within the last tenth of its length of an end: a palm resting on a
pommel, as a greatsword is pushed upright under it, read 34° turned in the hand) and, where the game tells that
hand's fist (`Model.fists`), not open: its fingers curled 0.5 rad or more, as `eyes` has it. A blade may swing round
in a hand let go of, as a swordsman regrips one; each time a fist opens, and every 30 frames while it's open (four
times a sit at most), it's pictured close on the hand (`his right fist let go of, curled N°`): opened too far, the
blade swung past a flat palm, held by nothing. A closed fist's handle may lie at most 35 degrees off the way across
its palm (`Fist.across`), past a slant, or the fingers go round nothing; it may close at most 3 cm off its handle's axis
(`Fist.off`: a hand short of a stood maul read as held) and at most 1 cm past the handle's end (`Fist.along` against
`userData.handleTo`: "he needs to hold the two handed weapon by the handle, not by the blade"), with a canary; and each fist is pictured close once he's sat
(`his right fist close`; what's stood on the floor, `the far end on the floor`), the one distance at which a closed hand can be told from an open one: reviews of the other
rows read a closed fist as open four times. The trace (`--trace`) says each frame where each palm is along the
piece, each frame an arm was at its stops, and the hold as he began to sit however little it moved on the walk. And no arm may be held at two or more of its joints' stops at once (`page/armStrain.ts`, as `range` reads
it; pictured at its most): "if a real warrior would put a sword down like that, he would snap his arm" (by the fire,
the forearm turned to its end and the wrist bent to its). No finger may go into the floor (`page/fingersUnder.ts`: each
finger's and thumb's joints and tip as balls of its radius against the ground, frame by frame; the hands are
skinned, which the floor's check of what he wears never read: laying the bow down, the ranger's open fingers
seemed to hang through the floor, and nothing could say whether they did; the canary puts his left hand under
it). The trace also says how near his fingers came to the floor and the weapon to his body (a foot, a leg, the
trunk), in or not. His legs are read against his skirts (`page/sitCloth.ts`): every
triangle's corners, edges' middles and middle against the thighs' and shins' capsules at their drawn radii, a point
over 1.5 cm inside one the leg through the cloth, the deepest pictured as it deepens ("knees clipping through robe
when sitting near fire": the mage's thigh 9 cm through his robe; the skirts' wander and jerks were read, never what
they cover). The first way down and the first way up are filmed (`page/sitFilm.ts`), every 5th frame in the seat's
first view and the game's third-person view, each labelled with how far down he is: the two moments pictured never
showed what moved between them. And zoomed in all the way over his shoulder (`page/sitFraming.ts`, the game's own
camera code given `Player.framedHeight`), his neck sits on the screen within 0.15 of the screen's half height of where
it sits standing: "zoom in/out with mouse wheel in 3rd person should zoom in on the seated character, not the
standing one (if seated)" (by a fire it sat 0.67 under it, the camera at a standing hero's shoulders).

Once its asks are done, each seat is sat on again by E: the mouse put over the seat's middle (on its top; a fire's
0.4 m over the floor), it must be outlined white within 3 frames (`SIT.look` is none: from the owner, "point at item
it highlights right away (no wait)") (`outlinedLook`, round its first target) and is pictured as the
player sees it (`seat: pointed at, outlined`); E then must set him off at once, the outline gone, and pressed sat, E
must get him up.

`--canary` raises his body 12 cm off the log as he sits: it must be read as sitting on air; pushes what he holds out
of his hand, 15 cm and a centimetre further each frame for half a second as he sits, read on its own by a `Carried`
of its own: at least 15 cm of it must read as moved with no hand on it; turns what he holds 0.5 rad in his hand once
he's up, read against how he held it a moment before: it must read as held otherwise; turns what a palm grips 0.03
rad further in his hand each frame for half a second, sat, which must read as turned over 40° in it (not run, and
said, when nothing is gripped sat); holds the right arm at its
stops (`pinnedCanary`); and reads a cloth point at his
left knee's joint, which must read 4 cm deep or more. The owner's words: "if there is a nearby log or not high stone ... and character is idle,
they need to walk up to this prop and sit on it, should sit on the closest side", "when user presses any action,
they should stand up first, then perform the action if user is still pressing it (do not queue)", "while seated,
they should continue looking left/right like now", "it should be also possible to sit near fire after idle... just
on the ground".

A two-hander's right hand may be open only with the left closed on the handle (`his right hand let go with no left hand on the handle`, with a canary; the report says how many frames it was open, so a run that never regripped shows): only a review caught a left hand that never came, then one that let go halfway.

By a fire his weapon must stay out of the flames every frame (`sitFire.ts`, `FireClear`: `his weapon in the flames`), and a two-hander laid down must be let go of and lie still (`LaidStill`: `what he laid down stirred`, `never let go of`), each with a canary. What he lays down must lie at least 15 cm outside the fire's ring of stones (`describeRing`), and at no moment may the weapon touch the stones: every point of its line under 30 cm over the floor keeps 8 cm outside the ring, half a maul's head (`describeTouch`: `his weapon touched the fire's ring of stones`; from play, "it should not touch rocks/fire"), each with a canary.

`--poses` measures nothing: the warrior sat, each way of holding his gear (`HOLDINGS` in `sitPoses.ts`) on each seat asked for, three pictures a row, each numbered across the run (`#12 right`), for the owner to name what's wrong by its number without playing his way to it. Send it after a change to a sit (from the owner: "send me each sitting combination pose of warrior, as screenshot, with each weapon type, from 3 different angles", "label each image with a unique number").

`--round` measures nothing else and pictures nothing (`sitRound.ts`): every seat of each kind asked for (each stone, log, column or fire, not only the one the sit is measured on), E pressed from 12 ways round it at 1.8, 4, 8 and 11 m once it's outlined, and he must sit whole within 15 s; where he doesn't, it says where he stopped and why (given up in his walk, how far from the spot, how long no nearer and how long held, the props he was by, and whether his own side of it was taken). From play: "sit on stone no longer works at some angles, here press Sit, nothing happens, he runs up to the stone but does not sit": where his own side of a stone was taken by another prop, E sat him on its far side, and he walked straight into the stone and stood pressed into it until he gave up (14 of 173 starts round the forest's stones), and steered round the props alone he was wedged between a column's drums or circled a log (7 of 231 round the crypt's columns); every start round every stone, log and column sits him now. A failure lists his way every half second and the point he headed for then. Run it after a change to how he walks to a seat (`Sitting.walkGoal`, `walk`) or to where its spot is (`world/seats.ts`).

A shield by a fire must rest on the floor (`shieldRimOver`: `his shield's rim ... the floor`, within 3 cm). `--poses` keeps `--tune` and `--wear`. The fires' films have a view from behind him, the fire in frame: a blade catches its light two metres off, and from the sides that reads as a blade in the flames.

A piece's slide in the hand counts what goes across its length alone where what hangs from the hand says it slides along itself (`userData.slidesAlong` on the grip: a maul stood head up, its fist going up the haft as its butt comes onto the floor); the flag is read from the piece hung from the hand and over it, so it goes on the grip.

A two-hander off the floor (its lowest point over 4 cm up, read from its vertices as drawn: by its handle's ends, a maul lying on the floor read 10 cm up on its head) and off his shoulder (its line over 20 cm from his right shoulder's joint) while he stands in a sit's hands stage must have his left fist closed on it (`sitAloft.ts`, `HeldAloft`: `his two-hander up in one hand`, with a canary; from play: "as soon as sword lifts off ground, he needs both hands to manipulate it"). Its ends are read once from its meshes along the grip's up. Getting up, its far end must not hang more than 10 cm under his fist (`liftedHeadDown`, with a canary), and the weapon in his hand is read through his legs and trunk too, as sitting down (`IntoBody`: read sitting down alone, a haft through his thighs as he took it up went unsaid). The fire's checks read the weapon from the end of its handle behind his fist to its far end (from his fist on, a greataxe's haft behind it went through his legs into the fire unread). It says how far his left arm was from holding its lower grip as it was first plainly lifted, over 10 cm (past its reach, its joints past their ranges, the arm into the body), as why it didn't hold it. Getting up with it still on the floor, it says how many frames his left fist was closed on it, his fists' nearest along its handle, and why his left last wasn't on it; taken up with his fists under 30 cm apart along it (`takenBunched`, with a canary) fails, from review: "both fists are bunched at the butt end of the haft ... nobody lifts a heavy axe that way". It was first read with his left fist on it 0 of 40 frames: his left hung by his right, 7 cm short of where it was asked.

Two weapons in his hands must stay apart: each hand's blade is its largest shown mesh that isn't skin, along its box's longest side, and their middle lines may come no nearer than 2 cm (`sitBlades.ts`, `BladesApart`: `his two weapons through each other`, with a canary; from play, of two swords crossed through each other: "this is messed up"). The report says how near they came. Read off the grips' up the lines were wrong (160 and 40 cm long): the pieces under a hand aren't laid along its grip's axis.

A held weapon may not move along itself through his right fist with no other hand moving it (`sitSlide.ts`, `HaftSlide`: `his weapon slid N cm through his fist as it moved, with no hand moving it`, over 2 cm a sit, with a canary; from play, of a maul stood on its butt: "maul slides up with jedi force, still"). A frame counts when the weapon moved over 2 mm along its length and the right fist slid over 2 mm along it, and the left fist isn't closed on it moving with it (its own slide along the haft at most half the right's: a fist kept by the right one slid as far, and a fixed line read a joint's drift of a millimetre as sliding). A fist going up a haft whose butt stays on the floor isn't counted: the weapon didn't move. The maul read 131 cm on a log before its fix, and 3 to 6 cm after, a cm or two a frame as both fists close on it for the lift. It may slip down through his loosened fists under its own weight with his left closed round it, guiding it (`falls`, `guided`: from the owner, of a maul set down sat, "let it slide down"), but never rise so; the canary has one risen with his left closed on it, one slipped down with no hand on it, and one slipped down guided.

A held weapon's far end (a maul's or an axe's head, a blade's point: its last 24 cm to the tip, 7 cm round) may not come within 12 cm of his head's skin (`sitFace.ts`, `FaceClear`: `his weapon's far end by his face on N frames, the nearest N cm`, and its nearest said for every seat; a canary lays it at his head's middle). From review of a maul stood on its butt: from a fifth of his way up until he lifted it, its head was at his cheek, and no clip check saw it, as it never went in. It read 5 cm on a log before the hold was moved ahead, 15 to 17 half a metre ahead, 24 to 25 stood low out to his right, 29 to 33 shouldered before he stands.

Nor may it stand before his face from ahead of him for more than a moment (`sitFace.ts`, `weaponBeforeFace`: the weapon from its tip back 1.2 m, its far end 7 cm round, ahead of his head's middle and inside a window 20 cm wide and 22 high about it, as a camera ahead of him sees it; 9 frames in a row pass, as a hand passes; `his weapon before his face from ahead of him on N frames, N in a row`; a canary stands one upright 30 cm ahead of his face and one 40 cm out to his side). From review of the maul shouldered before he stands: "the spiked head sits at face height and overlaps the right side of his face", which the gap above never saw, as it was 29 cm off. It read 45 frames in a row as he planted it between his feet sat. It also reads the mage's staff stood upright before him through his whole sit (532 in a row), and nothing for the ranger or the warrior's other weapons.

Nothing he moves may change its speed at once (`sitJerks.ts`, `SitJerks`: each hand, elbow and the weapon's grip and far end, in his own frame, their change of move from one frame to the next; `a hand, an elbow or the weapon jerked over 6 cm a frame N times`, with a canary; each seat's worst for every point, its 12 worst frames and the worst point's moves frame by frame round its worst, which tell a step from a flip back and forth). Read only while each frame follows on from the one before. From play, of the warrior by a fire: "campfire is jerky and lame", while the log and the stone were fine. The jump check above never saw it: his left hand went 37 cm onto the haft in a frame and off it again as he got up (its ease was skipped until it was fully on), flipped 13 to 26 cm a frame between two arm solves as he let go, and every hero's whole upper body rose 6 to 9 cm for a frame halfway down on every seat (the leg IK started afresh there, `OWNED_BELOW` in `models/ik.ts`). The log and the stone jerk 4 to 5 cm at most now, and those faults were 15 to 74, so a fault is 6 cm; 0.6 cm (22 m/s²) is listed, as a hand stopped dead from 1 m/s in under 0.05 s, and even the smooth sits have a hundred such frames.
