# `coop`

`coop --scenarios colours` checks live colour changes without running the combat suite: host and guest picker changes,
competing requests for the same colour, Any, and agreement of the colours actually drawn on every game across the
delayed link. `--party 3|4` includes the remaining party members; `--canary` deliberately puts the guest in the
host's colour and must detect the duplicate. It finishes by changing colour from Settings during a run. The normal
combat scenarios keep their existing room checks.

`coop --scenarios houses` runs alone, in the village with no run (`node/coopHouses.mjs`, `page/coopHouses.ts`): the
host stands before the tavern's door and the guest goes into the tavern. The host's game must draw the marker over
its door with the guest's name (`ui/houseMarks.ts`), a dot for him at the door on its minimap, and his name under the
tavern's on the village's map; none of them before he goes in or once he's out. Then a partner's casts in the yard
while the other is in the house (from play: a mage in the yard holding his right click, "it would actually appear
inside the village house where the Player 2 is"): one stands in the tavern, the other then holds his right click
aimed across the square (over the ground the rooms stand on) for 5 s and casts every skill in turn for 6 s; then the
other holds it first and the one walks in under it; the one inside read every half second, all none, both ways round
(`--class mage`, `ranger`, `warrior`). As main had it the beam held through his going in stood in the tavern for good
(its channel, 2 lights, its particles: its end never reaches a game it's away from), pictured
(`houses-beam-from-house-*.png`); a cast begun after he went in never showed (his actions are passed over while he's
away). Then nothing of the training yard may show in a house: both heroes cast every
skill of theirs in the yard in turn, each held 40 frames (channels and draws held), then one walks into the tavern
while the other casts on, and the one inside is read every half second for 6 s: the projectiles, the effects (not
those standing with the game, `Effect.standing`), the particles and pooled lights within 12 m of the yard, the numbers
floating, the heroes holding a channel or a cast and the spent arrows, all none (as main kept them: up to 5 effects,
40 particles, 2 casts held, 24 arrows); host inside, then the guest. Then the host enters the tavern and
creates a party inside it: every guest joining from outside in the village must spawn inside the tavern (zoom locked,
spaced apart with `--party 3|4`, all partners visible to each other), and leaving back to the village must restore
zoom with zero late shader compiles (#740); last, a guest inside the tavern joining a host outside in the village must
leave the tavern and appear with the host outside. `--pictures` takes the marker, the map and the party in the tavern
(`out/coop/houses-*.png`, the host in the tavern with the guest casting in the yard among them); `--canary` takes the
host's marker off the screen once drawn, keeps the yard's going as a room shows (`holdVillageKept`), takes a partner
in another of the village's places as here (`holdPlacesIgnored`, as if `away` didn't cover a house), and moves the
guest out of the tavern after joining, all of which must be found.

`coop --scenarios choir` runs alone, in a run in the crypt (`node/coopChoir.mjs`, `page/coopChoir.ts`): the Ossuary
Cantor's choir's ring and rising graves on two games. The host raises the Cantor, dazed, then casts its ring and warns
six stones at spots it rolls as its fight does (`graveSpot`); every game shows them from the host's fx. Each frame each
game keeps the rings it shows (`ringsShown` in `entities/cantor.ts`: middle, radius, age) and its stones. Judged: the
ring in one place on both screens, its radius the same at every age (within 5 cm, the wire rounding to centimetres),
shown as long on each; the same stones at the same spots. Over a 300 ms link the ring read 0.000 m apart in place and
radius over 983 frames, shown 16.38 s and 16.37 s, the six stones 5 mm apart at most. `--canary` has the guest's game
raise each stone a metre off the spot it's told, which must read as the stones apart (1.001 m).

`coop --scenarios seats` runs alone, in the village with no run (`node/coopSeats.mjs`, `page/coopSeats.ts`): a seat a
partner sits on can't be used (`seatTaken` in `world/seats.ts`; from the owner, "need to check if another player is
already sitting, if yes, then cannot use an object", "it should work in coop ofc (in village)"). The guest sits on one
of the campfire's logs; the host, stood by it, points at it as a cursor over its middle would: it must not be outlined
for him while the guest's game reports him sat, a free log beside it must be, and once the guest is up his log must be
again. `--canary` clears the host's copy of the guest's sit just before it points, which must read as the log free.

`coop --scenarios tavern` runs alone, in the village with no run (`node/coopTavern.mjs`, `page/coopTavern.ts`): the
tavern's keeper and his mugs as two games share them (`src/world/tavern.ts`, `src/game/mugs.ts`, `tv`/`tv?` in
`src/net/session.ts`). The host's game runs the keeper and rules the mugs; a guest's asks of it and takes its word.
Both heroes stand at the bar; the guest asks for ale, and the host's keeper must serve it, the guest drink it and the
host see him drinking. Then both ask at once: each must drink a mug of his own, never the same one, and every mug
must come back to the back counter on both games. At every look both games' mugs must add up to their count, and once
settled (a second on) agree mug for mug. `--pictures` takes the guest drinking (`out/coop/tavern-*.png`); `--canary`
stops the host telling its guest of the mugs (`mute`), so the guest's mug never reaches him, which must be found.

`coop --scenarios tavern-recovery` starts with a host and a guest in the tavern. The guest takes a full mug and holds
it while a third, fresh page joins. The new guest must receive the entire ledger without a mug moving first. The
holder then disconnects from the party, and the other two games must agree that the same full mug returned to its
original bar spot. The remaining guest takes it up again. `--canary` mutes the host after the first guest takes the
mug, so the missing welcome snapshot must be detected.

`coop --scenarios looks` (alone, as `colours`) checks a hero's look across the room (`data/heroLooks.ts`, `Look.hl` in
`src/net/session.ts`): the host opens its hero selection screen and picks another look and a hair colour on its Look
page (`coopPickLook`: the hall's hero built again in it, the screen closed), and every partner must build its copy of
him in that look (`look/hair` as his own game has it) and draw his face with the same hair shift (`KitLooks.hair`),
and have the host's best wave as his save has it (17, set as he picks: `Look.best`, the rooms' party cards', rides the
same message, and the two were merged by hand when the looks met the rooms); then a hair colour alone. A partner that hasn't made the look yet shows him in one it has until its workers have
painted the face and made the head, in real time: waited for up to 90 s (`LOOK_MADE_MS`). `--pictures` takes the
guest's screen with its camera brought close onto the host's copy (`out/coop/looks-guest.png`, `coopFacePartner`);
`--canary` drops the host's look messages on the way out (`wire.dropLooks`), which must be caught.

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
lands in the settling, and from there it throws again before it walks into slamming range); `stag`
(`page/coopStag.ts`, `node/coopStag.mjs`): the Stag of Ash with the guest before its head and a log behind the guest,
which walks back up to it when thrown or knocked off: the host's game breathes over the log as it begins, takes its
life under half (its shed, as soon as it's free) and strikes a stake three times a quarter-second apart, a second after
the stakes stand; both screens must show the stakes in
one place with one life each, the same wood alight and the thrown guest up in the air (its own game throws it, the
host's copy lifted by its reports, StateMsg `hl`), no hit landing on it in the air; its canary leaves the guest deaf to
the stakes' life (stood with the guest behind it, it kicked 15 times and never tossed; three hits in a frame told the
first alone, `hurtProp`'s 140 ms between words), each one's input frame
by frame from what its own screen shows. The guest
practises in its lobby while it waits (stowed, as Space and a phone's Practice stow it, in the village's training yard,
where alone a hero is armed), as a player does, and readies the run the host starts slowly: its fight's programs kept
cold for 6 s past the host's start, longer than the countdown, the host's countdown must hold ("Waiting for players")
and no wave come until the guest is in, then go on (from play, "readying the fight for slower device takes forever, and
first wave already launched"; `--canary` tells the host no guest readies, and its wave must be found coming). Meanwhile
the guest's joining bar (#561, `node/coopJoin.mjs`, `page/coopJoin.ts`) must show on top of its screen saying "Joining
the fight", filled as far as its warm-up, which the lab sets to half midway; the host's party frame of the guest must
say `Readying 50%` from the guest's reports and its held countdown "Waiting for Guest…"; once the guest is in, its bar
must have been drawn in the frame before its run began and be gone, the host's frame and line saying no more of it.
The second run's start, its fight warm, is held to the same (the bar drawn before the run, gone after). `--canary`
also hides the guest's bar every frame, which must be found; and a
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
it watches (`out/coop/watching-guest.png`), the bar on each screen it's fitted on (`watching-bar-<n>.png`) and the
guest's lobby before and after its middle drag, its panels shown (`lobby-turn-guest-before.png`, `-after.png`: the
proof asked for when the lobby's turn was reported again, 2026-11-15, the report #389's own).
`--canary` (a pair's) also begins a cast on the banked guest (its sight drawn with it, a ranger's), shows its summary
again over its lobby and pads the watching bar a window tall: each must be caught. Each lobby's middle drag says what
lies over its canvas there (a middle press there turns nothing): a party of 4's lobby has what a pair's has.

`--scenarios ends` (alone, a pair's; `node/coopEnds.mjs`, `page/coopEnds.ts`): the ways a run ends that
left a player apart from the party. The host leaves the run, closes his summary to watch the guest play on, and opens
the pause menu to leave again: his game runs the guest's fight, so it must still be in the run 4 s later (main offered
Leave the run again and went to the lobby: the guest stood in a stopped fight, no wave to come and no end to send him
back, the host's lobby 26.7 m away and not showing him); then the guest leaves, and every game must be back in the
lobby by itself. Then a second run in which the whole party falls (the guest struck down, then the host, each by a
deadly blow judged on its own game): every game back by itself again. Each time the heroes must stand together on
every screen, each game showing its partner, within 6 m and not in one another (0.6 m at least: in the village each
game put its hero on the portal's one spot, 0.0 m apart). Then a third run that a third player joins in the middle of
(his page opened then and added to the party's, `Pair.add`: his time on the link counts from his joining): he must be
let in and wait in the lobby, the run going on for the two in it, and once they have left it every game must be in
the lobby by itself, each showing both of the others (where he stands isn't judged: he waits where he joined, the two
come out by the portal). `--pictures`: every screen as the host has left again, once back together, as the third has
joined and once the party has met him (`out/coop/ends-<moment>-<host|guest|joiner>.png`). `--canary` drops the host's
game out of the run behind its back as the guest plays on, which must be caught. About 100 s.

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

`afk` (`page/coopAfk.ts`, judged by `node/coopAfk.mjs`, #847): the guest's page hidden from frame 60 to 240, as a player switching tabs hides it (`document.hidden` and its event), both pages noting input each frame otherwise: on the host's screen the guest's name tag, as drawn, a line taller (Idle over the name) within a second of it hiding and back within a second of it shown, never before; the guest's own tag says it too (away from frame 74, back from 251). `--canary` keeps the guest's state from ever saying it's away (`holdAwayWord`).

`hidden-host` (#875) runs alone on a pair. It sets `document.hidden` on the host, parks animation frames, and
holds the page's fallback timer. A real dedicated worker must tick the ordinary game update through the end
of the countdown and spawn a foe. After the host is shown again, the guest must receive that wave's start.
`--canary` holds the worker as well and must leave the countdown unchanged. Visibility and page-timer
throttling are simulated, so this check completes without spending minutes in a real background tab.

`chat` (`page/coopChat.ts`, judged by `node/coopChat.mjs`, unit-tested): the guest opens the chat with Enter and says a
line holding markup; the host answers, and later says one of 320 characters; the guest says seven in a breath, then opens the
box and presses Esc in it. Every line must show on the sayer's screen and its partner's within a second, under the
sayer's name tag, as typed (the markup as text) or cut to 200 characters; of the seven, the burst's five on both,
the guest told twice it's too fast; Alt pressed in the open box must reach the game (held there, for its cursor over mouse look); Esc must shut the box and
leave the pause menu shut; the guest's chat must still
show 7.5 s after its last line, be faded 11 s after it, and be back with the host's next line. `--pictures` pictures
both screens as the long line has come and as the host's answer has.

`trade` (`node/coopTrade.mjs`, `page/coopTrade.ts`), alone and between two games in the lobby: each stash stocked with items named for it (`Lab Host 1`...) and others of every rarity, the host's 59; the host asks from Play together's list, the guest takes it up from the ask at its top, each puts an item in, the host accepts, and the guest's offer changed must take the host's accept back on both screens; both accept, and each stash must be exactly what it kept and the other gave, every stocked item in one stash alone, nothing locked, each game's word a trade done, and on both games, the moment it's done and with nothing clicked, the inventory as drawn (the stash's count and each tile's icon in the inventory's order, the worn slots' labels) and the hero's gear must be the profile's (#739: the stash showed its old items until clicked; the stock is drawn as it's stocked, as a banked stash is). The window is fitted on the host's page on 1024x700, 1920x1080, 844x390@3, 751x298@3.75, 1180x820@2 and 820x1180@2, by mouse and again by touch (the box in the window, both offers, the stash, the line and the buttons within it, on touch each button a finger's height). Then a second trade the other way, by taps: the host's stash full, the guest's item with nothing back must be refused with its reason, then the host's own item in and its accept given, and the guest's link lost as a closed tab's is: nothing moves on either game, the host's window closes and its items are free. `--canary` loses the guest's changes to its offer on the host's link, which the accept's reset must find, and puts an item in the guest's stash without drawing it, which the inventory's check must find. `--pictures`: `out/coop/trade-*.png` (the list, the ask, both windows accepted, the word of the trade done, each fit). About 100 s.

`duel` (`node/coopDuel.mjs`, `page/coopDuel.ts`; #406), alone and between two games: first the places (`node/coopDuelPlaces.mjs`, #627's review), each step from parts the host sets: the guest clicks a free side and must stand there on both games, taps a free side likewise (its page in touch mode), clicks the host's place and the host must be asked (its prompt naming the side, the guest's line saying it asked), gives it up by a click and watches on both, and the host taps the guest's place, the guest is asked and keeps it by a tap, both where they were and the host told it was kept; then the rack's card and the prompt are fitted on the guest's page on 1024x700, 1920x1080, 844x390@3, 751x298@3.75, 1180x820@2 and 820x1180@2, an ask of its place by a partner of a 16-letter name put in its state: the card within the window with every place and the prompt within it, and with the card shut the prompt within the window (laid over the card from the top, the prompt covered it on both phones). `--canary` loses every pick and answer the guest sends on the host's link, and pushes the fit's prompt a window down: every step and every screen must find it. Then the host sets a duel up in
the weapons rack's menu by its own buttons (the Thornwood, first to 3, No gear) and the guest's menu must show the
same, its button Ready and the host's Begin dead until it's pressed; begun, each game must have its one rival among its
foes and no other foe, and no hero may cast through the count; then four rounds, in each the hero who is to lose it
down to a little life on its own game and the other striking at it with its first skill where its own screen shows
it: the struck hero down on both screens, the score the same on both and on the HUD, the guest's the match 3 : 1,
"Victory" on its screen and "Defeat" on the host's, and both back in the village, each hero's most life as it was
before the duel (less in it, with no gear). `--canary`: the struck hero's life put back every frame on its own game,
so no round is won, which must be found. `--pictures`: both screens at the menu, the count, a fight, the result and
back in the village (`out/coop/duel-*.png`).
With `--party 3` or `4` it plays a party's duel instead (`node/coopDuelParty.mjs`), first to 1: each player takes his
own place in the menu by a click (three: host against guest, the third watching; four: host and guest against the
other two), the guests who fight ready and the host begins. Judged on every game: the same places, each fighter's
rivals among its foes (1, or 2 in a 2 v 2; none for the watcher, whose hero must be out of the arena with the
watching bar up) and no other foe; in a 2 v 2 the round must go on with one of the struck side down and end with
both; the match's score and winner the same on every game, "Victory", "Defeat" or "The duel is over" each player's
own, no hero of the side that struck down, and every game back in the village with no hero left out
(`out/coop/duel3-*.png`, `duel4-*.png`: the host's and the guest's screens).

`wall` (`--class ranger`): the guest raises its Hedgeward between it and a Sporecaller shooting at it, the host
standing off. The wall must stand on both screens in one place (its middle within a few centimetres), a breakable
prop on each (the host's health told the guest by the `ward` fx), and standing on both at the end.

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

- `rootburrow` (`page/coopRootBurrow.ts`; `src/entities/rootBurrow.ts`): both heroes far off the Rootmother and
  standing still (the host at the arena's far side), her cage and heart held off and her wait given over, so she
  burrows to the one she goes for. Her sink must show on the guest's screen within 30 frames of the host's (16 over
  the lab's link), the spot she rises on in one place on both (0 cm), her depth under the floor on the guest's within
  0.5 m of the host's (lagged by the link) all but 5% of the frames (0 of 645), and struck-proof on both every frame
  she's wholly under. Its canary has the guest's game deaf to her `burrow` fx: never seen there, caught.
- `rootcage` (`page/coopRootCage.ts`; `src/entities/rootCage.ts`): the Rootmother cages the guest standing still,
  the host pacing off so she cages the guest and never it; once the guest's cage stands, the host comes up 3 m
  outside the root nearest it and strikes it till it breaks, its aim on the root's foot all the while (aimed at
  nothing as it walked, the host's aim fell back on her); the guest walks out through the first gap its own screen
  shows. The cage must shut in one place on both screens with its roots where they stand, each root's life on the
  guest's screen the host's now or 30 frames before, the root the host broke broken on both, the guest caged on its
  own screen, out as her blow lands on it and unhurt by it, her blow landing on both screens (`describeRootCage` in
  `node/coopJudge.mjs`). Its canary has the guest's roots deaf to the host's word of their life (`cageRoot`), and
  must read them apart and the guest held. It found that the roots' meshes kept their matrices from the page's last
  draw on a page that draws nothing, every arrow passing through them (`placePooled` makes them now).
- `staffs` (`--class mage`, #402): the guest holds a fire staff and casts at three dazed foes, every orb setting
  what it strikes alight (its chance made sure), then a healing staff, its beam held on the host, hurt to 300 of
  800 Health as the guest takes it up. The foes alight on the guest's screen must show alight on the host's
  and lose life there; the host must gain 60 Health or more under the beam on its own screen; and its frame on
  the guest's must show it healed (`describeStaffs` in `node/coopJudge.mjs`).

## At a glance, in full

The line `tools/lab/AGENTS.md`'s Commands at a glance gave it, before it grew too long for a line:

- `coop`: two games playing together, the host's and a guest's beside it, their messages carried as a link of a high ping and jitter carries them (`--ping`, `--jitter`: how far behind and how roughly each shows the other's heroes and foes, how its timeline plays them out, whether an arrow that struck a foe on the guest's screen counted, each foe's duck or blink out of the guest's shots on both screens, whether a blow it dodged hurt it, the lava thrown at it landing alike and hurting it, a vine holding it and its copy shown held on the host's, a guest brought down and raised, a guest's blink as the host's screen shows it: when it hid the copy, where the copy came out, the foes it dazed on both screens, `--class mage`; a guest's charge carrying foes on both screens, and a Power Strike landed in it, `--class warrior`; `--party 3` or `4`: the others join after the guest, the third first as the guest's name tag, which must be refused and asked to rename, and every game must have every other in a slot of its own by its tag; every room's heroes in colours no two share, a free pick kept, each game showing each partner's as its own game draws it, `--canary` the guest in the host's; `wave`: wave 4 let come, the guest hearing of no spawn for 6 s, every host foe on its screen; `trade`, alone: banked gear traded between the two in the lobby through the window's own controls, both stashes right on both games after it, an offer changed after an accept taking both back, a full stash refused with its reason, the guest's link lost mid-trade moving nothing, the window fitted on six screens by mouse and touch, `--canary` the guest's changes lost on the host's link; `afk`: the guest's page hidden, Idle over its name tag on the host's screen meanwhile; `chat`: lines said on each screen as typed (markup as text, a long one cut), a burst held back, Esc shutting the box without pausing; `ping`: a foe, a spot, a preview moved from the floor onto a foe and a minimap long press pinged, each on both screens' world and minimap, one size, a foe's centred on it; then the run's end: the guest banks and holds his keys, casting and aiming nothing, the rest leave, and every game is back in the lobby by itself, the summaries shown before the end gone; a middle drag turning each lobby's camera, from a floor item's name too; its skill bar there, the host's hall of heroes opened as the others cast, showing neither them nor the floor, and every hero shown with its name tag every frame; then a second run watched by the guest: the first partner followed, LMB, RMB and the bar's buttons, F's free camera, Q/E, a middle drag and two fingers twisted (the world turning their way), the bar fitted on phones', tablets' and a desktop's screens; `commands/coop.md`)
