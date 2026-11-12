# `coop`

`coop --scenarios colours` checks live colour changes without running the combat suite: host and guest picker changes,
competing requests for the same colour, Any, and agreement of the colours actually drawn on every game across the
delayed link. `--party 3|4` includes the remaining party members; `--canary` deliberately puts the guest in the
host's colour and must detect the duplicate. It finishes by changing colour from Settings during a run. The normal
combat scenarios keep their existing room checks.

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
Every room's heroes' colours are judged as it fills (`judgeColours`, unit-tested; a line `colours: Host red (picked
red), Guest gold (picked none)...`): each page picks as `PARTY_PICKS` says (the host red, the guest none, the third
the host's red, taken, the fourth none, kept where the game keeps a pick before it opens or joins), and every
player must wear a colour no other does, its pick where no one before it had it, every game knowing each partner's
colour as that partner's own game has it and drawing its cloth as that game draws it (`Dye.shown`, the main cloth's
colour as drawn). An older tree has none and says so. `--canary` (a pair's alone) dresses the guest's hero in the
host's colour behind the room's back once it's in (`coopWearColour`): two in one colour must be caught.
`--pictures` pictures both screens at a scenario's moments into `out/coop` (`down`'s: the guest downed across the
arena, its marker at the edge of the host's screen, then over it, then raised; `shoot`'s last: the host holding Tab,
the scores). The lab's link reports each game's round trip to "the server" once a second as the relay's pings would
(half the ping, up to the jitter more), so the scores show a ping and its graph.

After the scenarios the run ends as players end it (`page/coopEnd.ts`, `node/coopEnd.mjs` `firstRunsEnd`): the
host's wave is cleared to its choice, the guest banks (B), then holds his attack 90 frames and key 3 (an aimed skill)
30 more: out of the run he must cast, draw and aim nothing, and no bow's sight may be drawn (read from the scene by
its uniforms: main's banked ranger drew on, his sight drawn in 103 frames); the party's others leave the run (Leave
the run held) and the host last, and with nothing clicked every game must be back in the lobby by itself (from play:
"once the run ends and no one is playing any wave it should automatically spawn you back with the others"), every
summary shown before the run ended gone with it (main left them all on their summaries, "You Have Fallen" up). The
host's own summary, its end's, stays over the lobby and is closed there. Every game turns its camera there by a
middle drag (its panels shown, then practising), and practises in the lobby, whose skill bar must show on every game
(after a co-op run the HUD kept the run's watching look, its bars and skills hidden, through the lobby: main fails).
Then the host throws an item on the floor (shown there: its shard and its name) and opens the hall of heroes (Change
hero) for 180 frames as every partner casts its first skill in its lobby: no partner may show there, nor play a
cast (main played the guest's in 110 frames: four in a room stood among the hall's heroes, a warrior's ward glowing
over a plinth), and none of the floor (main showed the item's shard and name among the heroes); back in the lobby,
a middle drag begun on the item's name must turn the camera (main's floor took the press: 0 rad). Over the whole
command each game counts the heroes its camera shows in a room and those without their name tag drawn over them,
its own among them (`watchTags`): any is a problem.

Then a second run, watched (`watchedRun`): started from the lobby, the guest leaves it at once and closes its
summary to watch the others. Its watching bar must show and no "You are down" (main told it it was bleeding out:
the host's word of its fall came after it left), and it must follow the first partner by slot, held to the hero at
its screen's middle; LMB (a real click on the game) the next by slot, RMB the one before, the bar's next and previous
buttons tapped by a finger likewise; F a free camera that W flies (at least 3 m in 60 frames), F again following,
the bar's free camera button tapped twice likewise; E held 30 frames, a middle drag of 200 px and two fingers
twisted 0.9 rad clockwise must each turn the view (0.5 rad, the drag 0.6), still following, the twist turning the
world on the screen the fingers' way (a point east of the hero followed, round the screen's middle: the first twist
turned it against them). The bar is then fitted on a desktop's, phones' held sideways (751x298 at 3.75 the shortest)
and tablets' screens each way (`coopBarFit`, `BAR_SCREENS`): within the window, each button 28 px tall at least on
touch, over no other part of the HUD (on an upright tablet its two stacked rows lay over the partners' frames) and
no further than 40% down the window, over the hero it follows (on the short phone it reached 48%). Then the others
leave and the host last, every game back in the lobby by itself. `--party 4` plays the watching over three partners
(LMB and RMB round them in their slots' order: its taps on the bar's next button caught the bar laid out again for
touch as the first tap went down, its click landing on another button). `--pictures` pictures the guest's screen as
it watches (`out/coop/watching-guest.png`) and the bar on each screen it's fitted on (`watching-bar-<n>.png`).
`--canary` (a pair's) also begins a cast on the banked guest (its sight drawn with it, a ranger's), shows its summary
again over its lobby and pads the watching bar a window tall: each must be caught. Each lobby's middle drag says what
lies over its canvas there (a middle press there turns nothing): a party of 4's lobby has what a pair's has.

`wave` (`spawnsLost: 360`): the host lets wave 4 come for real, its foes rising at the gates and fighting, and the
lab's link drops every spawn the host reports to the guest for its first 6 s, as a guest whose run started late
heard of none. Each screen's risen foes are held to being drawn (none undrawn past 250 ms, with the reason the game
gives: out of the scene, hidden, dissolved, out of its crowd), and every foe on the host's screen must come to the
guest's: on main 6 of them never did, their attacks playing from nowhere ("mobs missing in the first 10 sec... but
they're firing"). The guest asks the host about them (`src/net/AGENTS.md`).

`ping` (`page/coopPing.ts`, judged by `node/coopPings.mjs`, unit-tested): the guest pings a dazed foe and a spot with
Left Shift held and let go, the foe again held first over the floor (its preview must move from the floor onto the
foe while held), then a spot by a finger held on the minimap (a tap first puts its
page in touch mode, as a phone's first touch does; the finger goes down on whatever the page has there, so a minimap
that lets the finger through pings nothing), and the host pings a spot (`PINGS`). Each key ping must show as a preview
on its sender's screen (its kind, where it's made, its pin and ring) through the last 10 frames it's held, and nothing
of it on the partner's screen before it's let go. Each must be made on its sender's
game as meant (its kind, within 0.3 m of the spot, 0.7 m on the minimap), every ping one size, a foe's pin within 3 px
of the foe's middle across the screen on both screens, and shown on
both screens: its pin over it and its ring on the floor in the world, and on the minimap within 0.7 m of where it
points (read back from the minimap's pixels by the module's own sums), on the partner's screen within a second, the
two screens within 0.3 m of each other (a foe's ping on the same foe). `--pictures` pictures both screens at the
foe's ping, the moved one's, the minimap's and the guest's first person view. Then the guest goes into first person (V
twice), the host's ping off to its side: through 30 settled frames at least it must be held at the screen's edge,
its pin's head within 16% of the screen's smaller side of an edge and never over the minimap (`firstPersonEdge`,
unit-tested), and the guest goes back to the top-down view.

`chat` (`page/coopChat.ts`, judged by `node/coopChat.mjs`, unit-tested): the guest opens the chat with Enter and says a
line holding markup; the host answers, and later says one of 320 characters; the guest says seven in a breath, then opens the
box and presses Esc in it. Every line must show on the sayer's screen and its partner's within a second, under the
sayer's name tag, as typed (the markup as text) or cut to 200 characters; of the seven, the burst's five on both,
the guest told twice it's too fast; Alt pressed in the open box must reach the game (held there, for its cursor over mouse look); Esc must shut the box and
leave the pause menu shut; the guest's chat must still
show 7.5 s after its last line, be faded 11 s after it, and be back with the host's next line. `--pictures` pictures
both screens as the long line has come and as the host's answer has.

`ghosts` (`diesLost`): the host kills three dazed foes by the guest, and the lab's link drops every death report on
its way to the guest, as a game in #579 lost them (its copies stood, still, with their bars, through the choice after
the wave and on into the next). Each copy must go from the guest's screen within 1.6 s of the host's foe
(`judgeGhosts`, unit-tested): a guest drops a copy the host's snapshots haven't named for a second, and any copy
still standing as the host's wave ends (`src/net/AGENTS.md`). On main they never went.

Last, each game says what every hero's update cost it a frame (`page/coopCost.ts`, `Player.update` timed by the
browser's clock, lines that differ from run to run): its own hero's and a partner's copy's, in a run, in the lobby
and in the hall of heroes (the hall's own heroes left out). On this machine a hero took 1.2 to 1.4 ms a frame in a
run and 1.3 to 1.8 in the lobby, more than half of the mage's his skirt's drape (`poses --profile=drape`); hidden
under the hall, the host's own hero took 1.60 ms and the guest's copy 1.49 until a hidden hero was no longer posed
(0.01 each). A co-op trace's player stage read 5.7 ms a frame (KXRQ-WWX3). The lobby's higher time isn't the
lobby's: its frames here are the first after the run, as the lobby settles in (the next run's props built ahead,
the garbage collected), and every part of a hero's update runs about 45% slower then; settled, a hero costs the same
there as in a run (`poses --lobby`: his update 1.05 ms a frame against 1.13, measured 300 frames after the lobby
came; 1.51 measured as it came).
