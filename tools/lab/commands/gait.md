# `gait`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`gait`: the hero's walk judged as a person's, over level ground and the dais's steps, nothing drawn (standing,
off at a run, turned round and stopped; a long run straight on), strafing drawn, tapping, changing direction every
third of a second and going round in circles, nothing drawn and drawn
(`--scenarios walk,run,drawn,taps,zigzag,circle,circleDrawn,stairs,stairsDrawn`): each foot's share of the time on the
ground against the share the gait plans, both down and neither (a walk has a foot always down), the steps a second
and the ground a step covers, the steps' width (footprint to footprint across the way: a runner's 5 to 10 cm, a
walker's 10 to 15; over 30 the legs are apart), the hops (both feet leaving or landing within a few frames of each
other), the gallops (a foot leaving within 0.3 of a stride of the other's, the legs swinging together: a person's
leaves half a stride after it; the hops missed the set-off's, its second foot 6 frames after the first), a foot
dance's short steps, the hips' rise and fall a step and their height in the air, on one foot and on both, a planted
foot dragged (its leg short of it even on its toes) and one up on its toes out of a flat foot's reach (a push off),
the trunk against the legs as `form` reads it (`page/trunkSwing.ts`: said, not judged, as going round, zigzagging
and strafing turn the trunk for the way as well as the stride; `--tune trunk.drop=0` and the rest of `trunk.*` take
each part of it out, as `form --tune` does), each hand's swing fore and aft against its own
side's knee (a person's arm swings against the hip's swing, about
-1; the ankle trails the thigh as the knee folds, so no arm reads -1 against it), over the whole and over each
half second (the median and the worst stretch, with its frames; a hand that hardly moves is held, a bow drawn, and
left out), the rhythm (how many strides leave near their window's start, in step with the walk cycle, and which
don't; how many land already out of reach, and where), the steps a foot takes back under a body that had stopped
(its feet were out ahead of it), the jerks (a change of the
change of the hips' or an ankle in the air's speed in a frame: a smooth swing's speed changes steadily, by up to 3.5
m/s a frame at a run, and counted by that, an ordinary run read as a hundred jerks), and what a person wouldn't do,
said as such. A scenario whose body moves well short of its own velocity was held up by something in its way (the
nearest obstacle is named) and the command fails: from where the level walks first started, the walk had run into
a prop and every walk number measured a body stopping and starting. Every frame is also judged as a body's
(`page/balance.ts`): its centre of mass from the pose, each segment weighted after de Leva (1996) for an 80 kg man,
with what he wears and carries (`page/gearWeight.ts`: boots, a coat, a robe or plate and mail on the segments they
cover, a helmet, gloves, and the bow, weapon, shield or staff and the quiver where their meshes are that frame);
with a foot down, where on the ground the push must come from for every mass to move as it does (the zero moment
point of the masses, each one's acceleration at its own height, so a foot stopped by the ground under it moves it
hardly at all: taken as one mass at the centre, every landing read as a fall) against the planted soles' parts on
the ground (outside them the body would tip, the way it lies), whether the feet's grip could give the push along the
ground, and that the ground never pulls; in the air, that nothing pushes the centre along and it falls as anything
does (held up, a run hung from a string); a push beyond any feet's grip that the game's own movement asks (its
acceleration is the gameplay's) counted apart. Each such episode names what moved the centre so (the game's
movement, the trunk, the legs, the arms, the gear) and, for a tip, how far the weight itself lay off the soles. And
every joint against its range, as `range` judges it. `--frames` lists every step: its foot, where in
its window it left and why (the IK's `Foot.leftFor`), how long it was down, its swing against the plan, every
jerk, every episode a body couldn't move so (its frames, the feet, what and why, at its worst) and each hand's swing
half second by half second; `--trace` every frame (`--span from,to` only those): the way the body faces and goes and
its speed over the ground, the pelvis, the curve
it is on, the pelvis's drop, the plan's share on the ground and the speed it plans for, the cycle's phase and rate,
backing or not, and each foot (planted, with its distance from its hip, `!` out of reach and `d` dragged, or its
stride's progress, `~` in a timed step), where it is in its window, its ankle's speed and how far its way turned,
and what a body couldn't do that frame (`page/legTrace.ts`, which `range --trace` shares). Each
scenario is measured, then run again to film it from the side round its first hop or gallop (else its middle),
a picture every few frames, so the motion is seen as well as measured; each film is a sheet of its own (`film-1.png` on,
an A/B's other side `film-main-1.png` on: both sides in one page, or all eight films, took the browser down) and an
A/B compares the reports.
