# `coop`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`coop`: two games playing together, the host's in the side's page and a guest's in a partner page beside it
(`Side.openPartner`), stepped together a turn of frames at a time on the lab's clock. Each page's BroadcastChannel
(the game's `?net=local` link) is replaced by one the lab carries (`page/coop.ts`), and the messages go from one
page to the other as a link of `--ping` (the least round trip, 300 ms by default) and `--jitter` (how much later each
way, 60 by default) delivers them: in the order sent, as a WebSocket's TCP does, a late one holding up those behind
it, and every couple of seconds a stall of several jitters (`node/coop.mjs`). The heroes play scenarios (`walk`: the
host running round in circles, the guest zigzagging; `foes`: foes chasing them; `shoot`: the guest shooting at a foe
that chases the host; `evade`, played by a hero with a shot (a ranger or a mage): the guest shooting at a Rift
Witch and a Sporecaller in turn, which may blink or duck out of its shots as its own game judges them; `dodge`: the
guest running from every other blow as it sees it coming; `down`: a foe bringing
the guest down and the host raising it; `blink`, played only by a hero with a blink, `--class mage`: the guest
blinking between two spots as foes close on it; `rush`, played only by a hero with Bull Rush, `--class warrior`:
the guest charging through three dazed foes once; `strike`, the same but for a Power Strike charged first and the
charge cast over it 0.35 s from its blow; `throws`: a Cinder Brute 15.5 m off and a Barkhide Hulk 11 m off
throwing at the guest, which stands, walking only while a vine holds it, the host far off: the Brute's first chunk
lands in the settling, and from there it throws again before it walks into slamming range), each one's input frame
by frame from what its own screen shows. The guest
practises in its lobby while it waits (stowed, as Space and a phone's Practice stow it), as a player does, and a
game whose hero casts freely in the run the host starts is a problem (on main the guest's did, no costs or
cooldowns through the whole run: `practice` measures the casts).
What each game showed is judged against the other's in the same frame (`node/coopJudge.mjs`): each copy's delay (the
one that lines its path up best with its own game's), how far off that path and how roughly it moves (its speed
against its own, its largest move a frame), how each game's timeline plays its partner out (how far behind the
freshest report, how often a stall held it, how far its clock strayed), the arrows that struck on the guest's screen
and whether the host counted them, each foe that ducked or blinked out of the guest's shots on its screen (a copy
gone in a blink is left out of the foes' paths: it slides to where it went unseen) against the host's foe ducking or
jumping there within a second, and how far from where the host's came out the copy came back, an evade on the host's
screen alone a problem too (in `evade`: 3 ducks and a blink for the ranger, the copy back 8 cm off; 4 and 3 for the
mage, 15 cm), the blows at the guest against whether it stood in their reach on its own screen,
when the guest went down and was raised on each screen, what the slammers threw (each screen's chunks of lava as
they came down, read from the scene by their meshes' names, `Sample.thrown`: as many on each and within 0.3 m, each
hurting the guest within 3 frames of landing at its feet; as many vines on each; the guest held on its screen,
moving under 0.1 m though it walks, and its copy shown in coils on the host's for at least half its held frames; the
host never held: at 300 ms one chunk 13 cm apart, held 90 frames, all 90 in coils), and each blink: when and how
long it hid the guest's copy on the host's screen, how far from where it came out on its own screen the copy came out and how far it moved after,
and the foes it dazed on the guest's screen against those dazed on the host's, and each foe the guest's charge met
on its screen: whether the host's carried and threw it too, where it was let go, came down and ended on each
against where the guest stopped there (one ending behind it or level with it is a problem), and its largest move a
frame on the guest's screen and when (eased at once onto the host's late reports as its own carry ended, a copy
slid back 1.2 m a frame; carried into a copy not yet met, one was shoved 73 cm off it), and the guest's Power Strike
under its charge on each screen (each game's hooks on each hero's pose and `fire`: `Sample.acts`): the frame it
landed and whether the charge ran then, the frames the charge was shown in its place, and whether it was still
building as it landed (a copy, replayed, was taken as landed as the charge cast over it landed, and its build-up
stopped short). Scenarios run on from each other, so a scenario alone can differ.
`--party 3` or `4` fills the room first (`node/coop.mjs` `fillTheRoom`): the party's others in partner pages of their
own, every page's messages carried to every other over a way of its own (two pages draw their delays as a pair always
has). The third joins first as the guest's name tag, which the host must refuse and ask it to rename
(`session.renameAsked`), then as its own, and the fourth after it; every game must then have every other as a
partner, each in a slot of its own, known by its tag (`judgeRoom`, unit-tested). The others stand off the scenarios'
action (`EXTRA_SPOTS` in `page/coop.ts`) and play nothing; the host and the guest are judged as ever. Every page's
random numbers are seeded alike, again each frame, so each of the others draws its share apart just before it joins
(`drawApart`): two joining on the same frame drew the same link id, and the room took them for one. A wait that gives
up says where each page stood (its status, slot and partners).
`--pictures` pictures both screens at a scenario's moments into `out/coop` (`down`'s: the guest downed across the
arena, its marker at the edge of the host's screen, then over it, then raised; `shoot`'s last: the host holding Tab,
the scores). The lab's link reports each game's round trip to "the server" once a second as the relay's pings would
(half the ping, up to the jitter more), so the scores show a ping and its graph.
