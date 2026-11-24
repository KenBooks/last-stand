# `tools/lab`'s commands

Every command of the lab in full: what it measures and what it was measured against, its options, the looks a picture
takes and the options every command takes. [`AGENTS.md`](AGENTS.md) has the lab's rules; each command in a
line is At a glance below, made from its module; [`WRITING.md`](WRITING.md) how to write a measure and what keeps it repeatable,
[`WORKINGS.md`](WORKINGS.md) how the lab works.

## At a glance

<!-- made by `npm run lab -- docs` from each command's module: edit those, not this list -->
- `auto`: Auto quality's walk down from High on a slow device (fed a GPU-bound device's frame times: each step, the time until it holds 50 fps, at most 20 s; a fast device with long hitches never stepped), and its boots from a level it settled on (the level above tried: kept on a fast device, left at once on a slow one, within 3.2 s on a phone just under the target there, and put off for 1, 2, 4, then 8 boots after each miss); the GPU's own time a frame (a CPU-bound strong GPU kept on High, a GPU-bound one stepped down, a hitch's step tried again); and a strong GPU's real boot and lobby walk played from its trace (the owner's 4070 Ti, P307-C0HE), ending on High
- `behind`: the heroes built behind the lobby a piece a frame (the hall's heroes and the spares let go and built again: each frame's building by the browser's clock, at most 30 ms, the slowest pieces named; then the hall opened and another hero chosen, building none; and none of the guide's pictures made with it never opened)
- `beyond`: the ranger's arrows loosed over the wall at the ground and the trees beyond it, over the shoulder; each arrow left standing must have a surface drawn at its point
- `blink`: the mage's blink cast as the player casts it (open ground, past his reach, into a prop, past one, the arena's edge, onto the dais, his own feet: where it came out against its preview and his reach, the frames he was hidden and the blows that landed in them, the foes near and far it dazed and how they stood)
- `bosswave`: bosses loaded at their wave (game/bossReady.ts): booted cold, none loaded; Continue into the Crypt's waves 5 and 15 shows the bar readying the Colossus and the Ossuary Twins, who rise warm, nothing compiled late (`--canary` spawns the Twins unwarmed in wave 14).
- `bowprop`: the ranger drawing at a prop he stands against, his bow's end in it (each biome, each kind of prop, 0.25 and 0.5 m off it: the nocked arrow, the bow's tip and the hero must not turn back frame after frame; the point the pose aims from within 5 cm of the arrow drawn level; the aim preview stopped by the prop, never through it; `--canary` aims the pose from the arrow as posed, #317)
- `carry`: measures the carried bow
- `cast <skill[,skill...]>`: a skill cast as the player casts it, its effect seen frame by frame (each biome and view with the biome's foes coming at him, every frame drawn and read back: its light against the budget, the frame's mean every tenth of a second, the flashes in any second and the changes counted in the worst cell's, each shared out among what's in the scene by a replay with each thing taken out of the frame in turn, the shaders compiled late) (in full: [`commands/cast.md`](commands/cast.md))
- `check`: runs every hero's checks of a change to how they move side by side (`--ab`: against main, its side kept once it has run; each gait scenario from three starts, its turns at other points of a stride, as a frame's change anywhere sends a scenario's later strides elsewhere: judge a change on the counts over all of them, each side's in the log; a page kept from job to job where that was shown to change nothing, `--reuse=false` and `--like` to show it again; `--plan` the jobs' order and end, `--only` some of them) (in full: [`commands/check.md`](commands/check.md))
- `cloud`: cloud saves end to end, two devices each with a passkey against a saves service of the lab's own (an account made and slot 2 chosen as the cloud save, a second device signed in by a code with every slot full, a hero changed on both while one was offline, different heroes changed on each, the second device opened again cold with a change waiting in the cloud and its play saved before its warm-up ends (#556): each device's slots and the service's save read back; the bar and dialogs pictured within the window at desktops', a tablet's and a phone's sizes, `out/cloud`; `--canary` drops an item from a download, and the cloud's change from the hero played after the reboot)
- `cloud --google`: real sign-in controls/window and lightweight callback, with local OAuth replies: no game reload, one nonce-bound finish, link, cancel and blocked-popup redirect; `--canary` supplies an invalid code.
- `coat`: the hero's skirts and hood as he stands at idle (every point of the cloth in its own space frame by frame: a move a frame changing by over 1 cm a jerk, with the hand nearest)
- `columns`: the crypt's broken columns roll after roll (no open edge in a mesh, no cliff across a break's face)
- `compiles`: whether the boot's warm-up asked the engine for every pipeline a fight draws (a prop of every kind broken, the first wave fought and a Brute's and a Hulk's throws in each biome, and again by a hero built afresh: every pipeline first asked for meanwhile, as the engine describes it; `--switch` picks another class on the hero selection screen first, each hero shown in the hall of heroes, whose room and skills are warmed with the heroes)
- `coop`: two games playing together, a host's and a guest's, over a link of a high ping and jitter: what each shows of the other's heroes and foes and whether the hits counted, parties of 3 and 4, colours, looks, trade, chat, pings, the run's end and spectating (`--scenarios`; in full in `commands/coop.md`)
- `crest`: the village's crest blown away: its first blow on the context the boot made at its start (made half way through the boot, it waited 3.7 s behind the lobby's compiles), a blow at High by the wind, one at Very low faded with no context made; the loading screen's exit's context made at High alone, and none lost by hand
- `crowd`: a crowd of foes killed at once and what the frame costs as they fall (each frame timed by the browser's clock with the game drawn, the bodies' part apart, at each CPU slowdown, as a low-end device's, and frame rate)
- `cursor`: the cursor drawn over mouse look while Alt is held, in each close view (the lab's browser playing the pointer lock: the view held still as the mouse moves, the cursor drawn where it went and lit over a button, the battle log's Pause clicked without an attack, a hotbar slot's tooltip, the wheel scrolling the log's lines and not zooming, the world not attacked; Alt let go, mouse look again; the lock held and the run going on); then Esc pressed again and again, quickly, held and repeating, as each browser hands it over with the lock held (in a window, full screen with and without Esc locked, the lock's answers late): each press toggling the pause menu once, in a run's views and the lobby's (`--parts esc`, #554)
- `death`: each skill's kills as they fall (foes stood dazed where it strikes, a hair from death and with little to spare: how hard each body was thrown and which way, how far it flew, when it lay still; its drawn pose against the floor, the props, the wall and its points)
- `denied`: the sound a press that casts nothing makes (#572: a skill pressed while it cools, held, mashed no faster than its throttle, short of energy, a channel short of energy, an aimed skill let go while it cools: each heard once as a knock or a fizzle; ready, in free casting and for a partner's copy, nothing; `--canary` breaks the throttle)
- `dev`: developer controls, the panel opened by its DEV tab, five viewport layouts, frozen training start, refills and reset, and slow first-person entry (`--canary` plants a drained resource).
- `docs`: COMMANDS.md's list of every command made again from the commands' modules (each its `summary`, else its `help`; `npm run lab:test` fails while the list is stale)
- `draw`: each drawn shot held at full draw as the player holds it (the glint round its arrowhead every frame in every view: none as it's drawn, held at full until it's loosed, the pixels it lights as the player sees it, and no blob of glare; the bow's light lit at full draw alone; the crosshair bold at full draw alone, its one beat into it about its middle, none with reduced motion)
- `draws`: one frame's draw calls with the crowd standing, by what drew them (the geometries drawn most often, those that drew the most triangles, the triangles drawn outside the view of the pass that drew them, the draws that drew nothing, the scene's draws by their material's look, through the eyes what the arms' own camera drew, the hero's arms and what they hold alone; the scene's objects whose matrices are made again each frame)
- `envcost`: what the environment's lookups take of the GPU (the frame with the scene's environment and without, in turns within one page; with `--ab` each commit against itself)
- `evade`: the shooters getting out of the hero's attacks (each foe that evades held before him and each attack of his it evades cast at it try after try: from in front about half evaded, none struck after evading, every other struck; from behind none evaded; a ducked foe struck at its feet; each blink within its reach, clear of the props, the wall and the hero)
- `eval <expression>`: an expression evaluated in the page, with `lab` in scope: npm run lab -- eval "lab.player.nocked"
- `eyes <skill>`: a skill cast through the eyes, frame by frame (where the blade goes across the view, wound up, through the blow and where it ends, how fast, where it is as the skill fires; a two-hander let go of by the other hand, seen or not, or seen in one hand; a fist open on its handle; the arm drawn against its swing's keys, the weapon's way and flat too; the arms' joints past their ranges where they're seen; the arms in the body the view hides, said; the weapon and the elbows jumping between frames; a film of the frames) (in full: [`commands/eyes.md`](commands/eyes.md))
- `feet`: the feet against the ground round the dais's edges and on level ground (standing at full draw, walking across, strafing drawn, running reversals: out of reach, wobbling, sliding, in a riser, the rhythm)
- `fire`: each biome's fire as the player meets it (read from beside it with its own light and without: how tall and wide it burns, its light and hue from its base up, what of it is blown out white, its tongues, the smoke over it, how it moves and swells, its flashes on the screen; its flames alone from round them, turning with the camera or holding their shape; the plants over it; from above, the flames over the logs in it; the see-through hole cutting it in two; `--cost` what its flames take of the GPU, `--levels` at each quality level within one page; pictured beside it, alone, from above, round it and in the game's views) (in full: [`commands/fire.md`](commands/fire.md))
- `form`: the run judged against a runner's (published runners' cadence, time on the ground, joint curves over the stride, lean, bounce and arm swing, at a man's size, with each way the hero holds his weapons: stick figures of his stride over a runner's, and the hero pictured from both sides, in the game's views and his arms close up, at eight points of it; the set-up's `--gear` holds them any way his class can)
- `friends`: co-op's friends end to end, three games against a saves service and a relay of the lab's own (a friend code asked and accepted, a friend's room joined from the list, an invite joined from its toast, a room kept from friends shown with no Join, every picture's text checked for text drawn over other text and its lists' columns for one edge each, nothing moved as a request comes; `--canary` a request counted as a friendship, a hidden room shown, the room's cards laid out as before #700's review, the rows' buttons sized by what they hold and the note's and the badge's room let go)
- `gait`: the walk judged as a person's, on level ground and the steps, drawn and not, tapping, turning and circling: each foot's time on the ground, the steps' rate, length and width, hops and gallops, the hips, the hands' swing, the jerks (in full in `commands/gait.md`)
- `gear`: full sets of gear rolled for every class at each tier (the Health, regeneration and draught they give, and the damage they multiply)
- `glance`: the hero's casual look round as he stands idle (the head's turn from the chest and the eyes' in their sockets, frame by frame: in the countdown, the lobby and the hall after his showcase; none walking, attacking or through the eyes; within a neck's range, its speed, a jerk, the eyes leading, never a loop; a strip of the first glance)
- `glow`: each worn item's glow in its rarity's colour (the hero in a player's colour, green by default, each slot given the rarity alone, drawn close up from the front and back with its glow and without at the same moment: the share it lit, its brightest and median light, how much of it in one light (flat), its hue against the rarity's, none on a Magic item, its pixels over 4 s: how much they change a tenth of a second (slow, not still), and the step as its cycle starts over against those beside it (a join); no program compiled)
- `glowcost`: what the worn gear's rarity glow takes of a frame (the same frame drawn with it and, in turns within one page, off by the setting and on plain gear: the whole frame by the engine's GPU clock, each side proven by its pixels; `--scenes` the hero alone in each view, a party of four, the hall of heroes, a fight; `--cpu` the frame's work on a slowed CPU, with and without the glow's material copies; `--canary` the frame drawn twice)
- `guard`: #399, attacks while blocking in third person and through the eyes, a damage control during the exposed swing, immediate return/release/failure cases, independent shield and attack touch fingers. `--canary` leaves a shield raised during a swing and must detect it.
- `guide`: the guide's first opening by G and a walk through every page (each frame and the page's long tasks by the browser's clock, at most 100 ms; the game's renderer links nothing), with none made before and the lobby's own building held: each page's own picture drawn within 150 ms of its opening or of its compile's end, every one within 20 s of G, and a spinner in every place still waiting (`--canary=stall` makes every picture again at once, `--canary=slow` makes them behind the lobby alone)
- `hall`: the hero in focus in the hall of heroes showing off his skill and standing after it (each hand, elbow and the weapon's tip frame by frame in his own frame: a move a frame changing by over 12 cm a jerk, 40 as the weapon flies, the tip's by its speed; `--gear`/`--weapon` the weapon in his hand there), then the hall left mid-showcase and any sound it leaves playing; `--glow` the light round the weapon's tip frame by frame (the staff's crystal: near white, its median and brightest frames, its flashes, pictured at its brightest) (in full: [`commands/hall.md`](commands/hall.md))
- `hallnear`: the other heroes' warm-up as he nears the village's hall on a cold lobby (`--cold`, a new deploy's): with `--held` every frame held, as a phone's GPU holds them, it must give up and compile nothing after, the heroes not asked for; without, they must be warm before long, behind the lobby
- `hands`: the hero's right hand alone in the studio, flat, open, relaxed, in a fist and round a handle, from each side and close up (its size against a man's, its triangles, where it was sculpted)
- `haze`: the hero's held weapons' light through the eyes (each way he looks: their surface blown out near white, their bloom past it, and the frame round them darkened by the adaptation to them)
- `headshots`: the bow's and the fists' headshots (#750: every kind of foe, bosses and the dummy too, stood before the ranger and shot with each aimed shot at the middle of its head and at its chest, his own crit chance put to nothing: over the shoulder every head shot must strike and crit, every chest shot strike and not; top-down none crits; `--class warrior` punches them with Savage Fists: through the eyes the head punches crit, from outside none) (in full: [`commands/headshots.md`](commands/headshots.md))
- `health`: the low-Health look (the hero's Health held at shares of his most in each biome, view and facing: the colour drained, the blood's cover and how far in it reaches, nothing in the view's middle, more of both as the Health falls, none above where it starts)
- `heard <skills>`: the sounds each skill plays as its key is held as a player holds it, at foes stood where it strikes (every sound the game asks for, when from the press, a held sound's start and stop; a skill playing nothing, a held sound never stopped, a sound it's known to play missing; `--hold`, `--biome`, `--awake` for the blows foes strike at a lure, `--canary`)
- `hedgeward`: the ranger's wall (`--class ranger`), an ordinary breakable prop: broken in the training yard, a few thin sticks no bigger than its stakes, gone soon after, the renderer heard as they fall (`debris`); placed where aimed, square across his line to it; a boss's bolts flying over it or wearing it; a melee foe going round it with a way open, and breaking through only when walled in; his arrows breaking it, every arrow wearing it as the cursor finds it from near and far (`played`); a slam wearing it, a Brute walking through it; standing 30 s on, gone at none of its life, four standing at once; his own arrow over it at a foe beyond (`--canary`, `--pictures`)
- `held`: every held skill's preview as the player holds it (ready, then through its cooldown and short of energy: its own look, red and counting down until a release would cast; Quarry Mark's outline round its foe in every view, its pixels near the foe and none away; Starfall's ring against its strikes, every foe inside it struck on every cast; every mark on the floor held across the dais's step, on each level and down its faces, none of it under the floor or standing off it; no shader compiled meanwhile) (in full: [`commands/held.md`](commands/held.md))
- `herolooks`: each class's looks (`data/heroLooks.ts`) made by the workers and a hero built in each (his head sculpted nowhere on the page, its face, hair and beard there, no program compiled as the game draws him), pictured in the studio, the hair colours on one hero of each, two colours compared on the hair's cards, the brows and the beard and not the cheeks, and a look picked kept (`--classes`, `--canary`)
- `heropick`: a first visit's hero picked on the hero selection screen, by a finger's tap and by the mouse (each landing in the lobby, no run started or waiting for the warm-up, the click after the press reaching nothing past the screen; `--screen 640x360@3` puts Enter the Arena under the hero, `--canary` lets the tap's click through; `--quick` the mage picked at once on a slowed CPU, the others still warming, the view changed meanwhile: every hero drawn where he stands, none on the fountain)
- `hits <skills>`: each skill's blows as they land on foes stood where it strikes (when each landed from the press, the gaps between them, the damage a second; held to `--apart` and to `--than`'s pace)
- `hood`: the mage's hood against its reference (`--ref marks.json`): its outline from three sides over the reference's in the face's unit, the head under it in that unit (to lay the reference's outline out as a stand-off from the head), its rim, point and capelet against the reference's sizes (its marks' `sizes`), its fullness behind the head at the chin and the nape, its opening round the face from the front and the side against the reference's piping (where the rim runs down to the throat, the face shown ahead of it), its seam's straightness, the capelet's lie and his body through the hood above it, standing and walking, its sway as he walks (in full: [`commands/hood.md`](commands/hood.md))
- `houserule`: a house seen from above held to the three rules of what thins, as the Rust engine draws it, from a round of standing places at the hall of heroes and the cottages: ground he sees shows through what covers it, ground he does not see stays covered, and enough of the cover goes however many layers lie over it (`--only terrace` the views so named)
- `houses`: the village's houses walked into and out of by E held at their doors in each view (a tap taking him nowhere, the prompt naming the house and filling; no two faces round a door inside in one plane; the room shown, the village and the yard's dummies not, every frame drawn and no pipeline made, its cut away walls, a walk held in by its back wall, the trophies for the bosses beaten alone, the ledger's card within the window, the party table opening Play together, the library's Codex opening the guide, its scholar talked to and his card within the window, out before the cottage's door, the yard's dummies still on their spots, and the square and yard pictured after); `--canary` keeps the dummies in the room's walls, leaves the room drawn going out, makes the hold a press, lays a sheet in the door frame, makes the talk card wider than the window and lets the room's zoom go (from above in a room, the wheel out and in kept to its range, his own zoom given back out of it). `coop --scenarios houses`: the guest goes into the tavern, the host's game shows his name over its door, a dot at it on the minimap and his name under it on the map, all gone as he comes out (`node/coopHouses.mjs`, `page/coopHouses.ts`; `--canary` takes the marker away).
- `invite`: the agent invited into a game (#529, `lab join`'s other end) end to end against a relay of the lab's own (server/relay on localhost; once: `npm ci --prefix server/relay`), every step of the game's the player's own clicks: Invite agent pressed in the developer panel and its code read off it, an agent joined with the code and held at the question (a step sent before the answer never runs), a second agent refused on the same code, let in by Let it in with the badge up, `look`, `set`, `eval` and `picture` (the player's view, and a camera placed, drawn beside his frame, which must not change) answered and checked against the page's own state, a thing made in the scene (`join make`) and seen drawn in a picture of its spot, made again in its place, sent again as its file is saved, and unmade, a stroke the owner draws on the screen read by `look` and seen in a picture, cleared, kicked by the badge, the used code refused, and an agent sent away as a co-op room opens, where none is offered; pictures in `out/invite` (`--canary` draws the player's frame from the agent's camera, builds the made thing hidden and starts the relay leaving a used code good, each of which it must catch, and passing an unaccepted agent's messages on, which the page alone must then hold)
- `join <code or step>`: joins the game the owner is playing on a PR preview or a dev build, as he invited it (F8, Invite agent, which shows the code; he then lets it in from the game), and runs the lab's steps on that live game: `join <code>` holds the link in a process of its own (start it as a background task) until the game ends it, and `join look` (the hero, the camera, what's under the crosshair, the settings and the panel's controls, the frame's parts, what he drew on the screen), `join picture` (the player's view with what he drew on it, or from a camera placed with `--at`, in `out/join`), `join set name=value...` (what the developer panel sets; bare, its controls), `join eval <code>` (run in the game's page, `G`, `THREE` and `dev` in scope), `join make <name> --file thing.ts` (a module built into the scene as he watches, and built again in its place each time it is sent; `join makes`, `join unmake`), `join status` and `join leave` go through it (never production: the relay opens agent rooms for previews and dev builds alone) (in full: [`commands/join.md`](commands/join.md))
- `labels`: a world label a full atlas kept out (the atlas filled with name tags until one finds no slot, a few given back, too few to pack it again: the tag drawn within 3 frames)
- `light`: the frame's light as the player sees it (the hero standing in each biome, view and facing, the frame drawn and read back from the canvas: its light as a share of the screen's white, by thirds, its brightest pixels, near white and past it; `--hdr` draws each again in HDR and checks it against the SDR frame; `--levels`, `--resolutions` draw each again at every quality level and Resolution, none brighter than the first; `--at`, `--zoom` by what can be too bright)
- `live <step>`: a page kept between steps for trying by hand (start, picture in any look with a reference over it, inspect, eval, frames): under a second a picture
- `lobbystart`: a return's lobby from its reveal, frame by frame, till nothing is left to do behind it: the page reloaded as a player opens the game again, each frame stepped and drawn and timed by the browser's clock (the game's frame, the queue's building, each warm-up's slices after it), over its first 2 s, to 10 s and after; the most work behind the lobby a frame at most 25 ms (`--canary`: each hero built whole behind it)
- `log`: the battle log held to every hit as it lands (each skill cast at foes, in each way of holding weapons: each hit listed once and in turn, under its skill, on its foe, for what it dealt, of its type, a crit and a kill as they were, the panel showing every line; three foes striking, one shooting and one slamming the hero: each blow under the foe's name and attack, for what it took and what was stopped; each row naming the hero alone on his side; paused, nothing listed)
- `longpress`: a finger held on every touch control (the skill buttons, the move stick, Bag, Map, Use, the view, full screen and pause), in the village's training yard and in a run: no long press may be left to the browser, whose own menu opened over the game, and nothing of a control may be draggable, call out or have text to select (run it with --class for each hero)
- `maps`: the procedural maps a first visit's workers make, each timed alone with a digest of its pixels (a map made faster must keep every one: `--ab`), its seams (a repeated map must tile) and its means; `--pictures` shows each as a surface takes it
- `match <picture>`: the hero standing through the eyes beside a reference's screenshot, on a screen of its shape (the screenshot, his frame, the two blended, the points marked on it and his drawn on each, and how far his are off)
- `merchant`: Odo's prices against the drop rates (no rarity sold from a wave where trading beats playing for it, none above epic) and his trade at his counter (the screen within the window, its three steps lit in turn and the stash dimmed till a ware is chosen, the legendary not offered, Auto-fill cheapest paying with rares, his full stock, a trade one common short held off and refused, one with enough made and saved, the stock one fewer, his restock after three runs; Odo pictured close and over the shoulder); `--canary` puts the piece bought back in his stock and leaves the stash dimmed with a ware chosen.
- `music`: each biome's music as the player hears it (its lobby, a run's countdowns, fights and wins, a hidden tab and the bank back: which track plays, how it fades, where it comes in, what reaches WebAudio)
- `nearaim`: the hero's aim as a foe stands under the crosshair near him, in each close view (a training dummy under it from abreast of him to 7 m ahead: the aim's way from the hero within 10 degrees of the camera's at each, the dummy still the foe aimed at; `--canary` takes the aim's least distance off, #482)
- `neck`: each hero's neck, bare, dressed and in his hat, at rest and looking aside (ledges, the head's skin's seam on the neck, girth, skin through the clothes, the ground seen through round the collar; pictured from six sides)
- `odo`: Odo's day in his shop (the hero walking in on him dusting: the duster set down, his desk reached and the hero greeted, looked at; back to work with the hero by the door; each task pictured at its heart, stocking, dusting, the dagger looked over, a coin weighed, the ledger; a glance; close-ups of his face and ears, his elbow, each thing in his hand, the showpieces and the display table; his standing feet never sliding, each ankle where it's put, his arms off the counter and out of his body, the quill and the blade out of his hands, no program compiled, the frame's draws and triangles; in full in `commands/odo.md`); `--canary` drags his standing feet under him.
- `overui`: the skill keys pressed in a fight with the pointer resting on the page's UI: each keyboard key a skill is on must cast it, the mouse's buttons must not (from play, #816: hovering the skill bar, the number keys did nothing)
- `pace`: the hero walking on a 60 Hz screen whose browser times its frames on a 145 Hz screen's ticks, and moved from a 144 Hz screen to it (a shown frame's step within 6% of the steady pace, the game's time keeping the frames' clock; `--canary` steps the frames as they come, #552)
- `parity`: the same scenes pictured as the player sees them, to compare what two commits draw (`--ab`: each biome's arena, the village at noon and midnight from its places, from above and over the shoulder; the pictures are the page's own, as WebGPU's canvas can't be read back; what differs is the A/B's verdict and the pictures side by side)
- `passes`: each of the frame's passes timed by the engine within one frame (its breakdown, the profile's "the frame by its parts": the shadows, the depth drawn first, the scene a pass for each kind of its draws by one shader, the bloom, the grade...; `--features` the lit shading's parts taken out of the whole frame in turns; `--paused` the game paused as its menu pauses it; `--village` stood in the lobby's village; the frame pictured for `--ab`)
- `perf [skills]`: skills cast in turn with the biome's foes coming, every frame timed as the game's performance report times it (the frame, the update by stage, the render, the GPU by pass, the draws, triangles and the particles' fill), on a phone's screen, boot and CPU if asked, or as a slow device players reported (`--device`: its frame rate there, its GPU played by this one drawing its screen at more pixels); `--village` the lobby's village standing and walking, `--fly` the dev tool's free camera flown over it (round it high and low and across it, twice: where each leg's dearest frames were) (in full: [`commands/perf.md`](commands/perf.md))
- `photo`: photo mode as a player uses it (the village, its pause menu's button, by touch, each house, both battlegrounds: opened by P, the page's UI and the world's overlays left out, the solo game still, the camera flown and turned, the look set with no program compiled, Hide hero, a photo saved at the canvas's pixels under a dated name, letterboxed, Esc putting all back; in a house the camera kept to its room and its walls cut away; never over a dialog; pictured with its panel, a shot set up, the camera low and far) (in full: [`commands/photo.md`](commands/photo.md))
- `pipelines`: the engine's scene pipelines the boot asks for, step by step and by kind (whole, after the depth, depth first, shadow, sprites), against those the lobby's frames then draw with: what the loading screen waits for that nothing draws
- `portraits`: optional portrait requests and the real co-op picker; no downloads before use, current class only, selection, peer picture rendering and clearing, a class's default picture shown with none chosen, no two classes' alike. `--canary` requests another class and must detect it.
- `poses`: the hero's pose a move at a time as a digest to the last bit (every object's world matrix, every moving point of cloth: standing, walking, strafing attacking, stopped), and his `animate` timed each frame, his update, skirts and drape beside it: a change made to cost less keeps the pose when an A/B's digests agree; `--lobby` in the lobby
- `practice`: casting in the lobby and the runs it starts (each skill with a cooldown cast twice at once in the village's training yard, the inventory open, put away by I and opened again, on the square, and in runs started at the crypt's portal and begun in practice, a co-op guest's: free where the inventory shows, a run's costs and cooldowns elsewhere, none out of the yard)
- `probe <module>`: runs a measure of your own on the lab's clock and set-ups
- `profile`: the game's own profiler, the pause menu's Profile this spot, run where the hero stands (`--biome`, `--view`, `--at`, `--level`, `--device`): each part of the frame taken out in turns by the browser's clock, as a player's device times itself (`--village` stood in the lobby's village), the programs it compiled (over 8 fails; WebGPU's pipelines, over 24), a run cancelled midway, and its result sent and read back as `lab trace` reports it; `--canary` the frame drawn twice
- `programs`: the engine's scene pipelines and what sets them apart (by kind, by shader, by targets, depth, samples, culling; those never drawn; the performance report's count of those first asked for in play against the engine's); `--cost`: each compiled again alone, its shaders salted so no cache answers, and timed (by kind, by shader, by samples, the longest); `--limits`: what the engine's device uses of WebGPU's limits against what every device gives
- `pwa`: a deploy as a returning player meets it (main's production build loaded until its offline worker has the page and the fonts, this tree's served in its place and reloaded under the old worker, the new one and offline: the game's fonts on every load, this tree's build on every one after the swap), and the installed app after a PR's previews were visited (opened offline, at a pruned preview build and at a closed PR's: the game every time)
- `range`: every joint against a body's ranges frame by frame, standing, walking, attacking and turning: each angle past its range and where, the frame's time, the weapon through his body, the arms at their stops (in full in `commands/range.md`)
- `readme`: the README's pictures, each a moment posed and pictured as the player sees it (the village, the party round its campfire, the hall of heroes, the stash, a fight in each battleground, the choice after a wave, a party of four in a fight and one of them down, a partner raising him; `--shots`, `--class`, `--after`: `docs/screenshots/AGENTS.md`)
- `recorder`: what the always-on performance recorder costs a frame in a fight (its calls timed against 0.05 ms a frame), the trace a send would make of it, sent to a traces service of the lab's own and read back with its token
- `resize`: what the window's change of size costs, as going full screen on a phone changes it (two steps and full, with a screen-sized touch canvas): zero drawing-buffer reallocations into full screen, rotation, pixel parity, blood mask and photo crop (`--canary` sizes the canvas to the window on every resize)
- `rim`: the hero walked round the wall pressed into it, each way (a frame he moved further than a run takes him, thrown by the wall; a stop he can't walk back in from, stuck)
- `rooms`: Play together's rooms end to end against a co-op relay of the lab's own (server/relay on localhost; once: `npm ci --prefix server/relay`), the command's page hosting and a partner's joining, every step their own clicks and typing (a public room opened from the create page, listed in the partner's browser with its host, name, map and size, joined from its row, the relay counting two, gone once its host left; a password room listed locked, its password nowhere in the list, a wrong password turned away with the dialog asking for it, the right one let in; a private room never listed, joined by its code; both pages pictured at `--screen` in `out/rooms/<screen>`; `--canary` starts the relay letting any password in and listing private rooms)
- `roomwarm`: every warm-up that draws a place (each battleground built, the hall, each room) drawn as the game builds it with the hero in Odo's shop: its place alone shown at its draw, the shop alone after (`--canary` hides the village alone, as before #746)
- `rush`: the foes Bull Rush sweeps up (stood dazed on its line and at its sides, killed, an elite and the boss, in a lane clear of props: when each was met, how long it rode before the hero and how near his body, how it was let go and where it ended against his stop), and skills cast with it (a Power Strike charged and the charge cast over it, a cleave and Twin Fangs as it runs, a strike at its stop, the charge cast over a held Steel Tempest: when each was cast and landed, what the charge's own blows struck, what was shown, his strides), and packs rammed (#397, #560: the load each bears against its most, how far it goes, a boss struck and never moved, and the stagger at the stop against the weight met, no move or cast in it; none for a small or a killed pack) (in full: [`commands/rush.md`](commands/rush.md))
- `rust`: the frame of the Rust engine (`src/engine`, Bulwark) where the hero stands, pictured and timed: the walk of the scene and the work of the engine by the clock of the browser, the GPU by its timestamps, its draw calls and triangles, what it could not draw by its kind, its boot (`--village`, `--foes n`; `--census` the shown materials by what they ask of a renderer; `--tune rust.debug=1` the reach of the sun alone; `--capture 512` the frame written down as a tape, its maps no larger than that a side, which the `replay` of the engine draws, pictures and times with no browser)
- `rustcheck`: what the first play of the preview of the Rust engine found wrong, each held as a check on the page a player gets (the plain address): the engine drawing and offered alone, every shown object where its position puts it, the shelter of the hall set in the village and gone in a fight, a house walked into, out of and into again with no frame held, three drawing nothing of its own and its own lights lighting it, a canvas nothing has drawn on taken as a map, every foe of a fight drawn, and each skill on the keys of the hero held with nothing of it left undrawn (`--class` whose; run it for each)
- `scenecost`: what each kind of work in the frame takes of the GPU at the screen's own pixels and a level's other settings, by the engine's clock (its own parts, the profile's: the point lights and lamps, the sun's shadow, the lit shading and its parts, the bloom, the depth drawn first...; and the particles, the hero, the grass, what's cut out or blended, each taken out in turns, each row with how far it may be off and "within the noise" where it says nothing: run it with the GPU loaded, `--screen 2880x1800@2`, or a strong GPU reads its idle clock's wander; `--each` each see-through mesh alone; `--hero` the hero's parts and a change of nothing; `--frame` the level's MSAA; `--biomes village` the lobby's village where he stands, its own parts too: its largest parts, the hall's heroes)
- `scholar`: the library's Brother Hollis (his reading loop posed through frame by frame, its wrap included: no joint snapping, his head and hands moving, his sleeves never through his table, the book's prints reaching the spine, the page he turns never under the book and landing flat, his fingers on its edge while he holds it, the page never through either hand, his forearms clothed to the wrist, nothing on his table inside his sleeves, his fingertips never sunk into what they rest on; a hero come near glanced up at and walked off from, the hero held in his eye while talked to; then his rounds (a browse, a keep, a restock, a dusting, a row squared and the globe turned, each frame: no joint turning over 8 degrees, his head on his way as he walks, no shoe through his robe, his cowl clear of his neck and head and close round his neck, the book in his hands the shelf's own and its gap on the shelf, never into what stands in the room, the ladder or the furniture, his hips and joints never cut from one beat to the next (a browse on uneven frames too), a book in his hands at a hand, its shelf's book hidden while it's off it, a hero come close looked up at and his task going on, the hero in his way gone round, talked to and he stops; nothing compiled over them, the frame sat and walking); pictured at the loop's beats close up from each side and over his shoulder, his face, and as the player sees him); `--film` a picture a moment; `--moments` him pictured at each beat of each task; `--canary` jumps his loop on mid-way, raises his table, lowers the page's spine, draws the prints back from the spine, drops the page on his resting hand, strips his undersleeves, puts his quill back under his arm and holds a book he carries off his hands, jumps his pose from sat to standing, loosens his cowl, gives him another book, puts him under the ladder, sets a stand where the shelf's book stood and cuts the end of his rise.
- `seals`: what the village's walls cost to seal (the rays out from each room's middle the boot casts: 2 to 5 s of a village boot at 4x CPU), each sealed again on the browser's clock, and what each bounds as a digest, the same before and after (`--ab`: the same as main's)
- `seams`: the hero's sewn seams as he moves (every point two skinned pieces share as built, a sleeve's top in its armhole, followed standing, walking, attacking and through each skill: the pieces over 2 mm apart there an open seam, and their normals over 6 degrees apart as built a line in the light)
- `serve`: boots each command's page ahead of it (every command runs on a fresh boot and gives the same result every time)
- `shadows`: the hero's shadow cast from fewer triangles against every triangle (each weapon style, armoured and bare, each view: the frame drawn both ways, pixels apart past a texel's edge; `--cost` the frame on the engine's GPU clock)
- `sheet`: pictures the hero in the player's views with each arm's load beside them
- `shots`: the bow's shots at a boss with its foes packed round it (each biome and view, the bow drawn to full over points across them and loosed, its flight followed frame by frame: the first foe drawn along it struck, none if none, and one aimed inside a foe reaching it unless another is in the way)
- `sit`: an idle hero's sit on every seat (logs, stones, columns, by fires, the village's bench and campfire, the tavern's stools and bench, the library's armchair): E on the seat pointed at, walked to, sat on its top, every joint within its range, up first when asked to act; --poses a sheet from round him (in full in `commands/sit.md`)
- `sound [sounds]`: a skill's sounds rendered offline as the game plays them and written as WAV files to listen to (Splintering Bolt held and its bursts, Void Lance's portal, beam and release, or any sound of the game's played once: each one's peak, loudest half second, level over time, brightness (centroid, share above 2 kHz), share above 150 Hz, most tonal peak, the nodes it made, its silence at its end)
- `spawns`: the foes coming in (boss waves one after another, a seed each: the gate every foe came by, its spot against the props, the gates each group and wave left idle, when the boss came against the rest of its wave, and its walk to the hero from each gate)
- `spin`: mouse look turned one way for a long while in each close view, then the other, the browser's own jump under the lock sent mid-spin (no frame turning the view past three times the spin's steady turn, #318)
- `staffs`: the mage's staffs by school (the lightning staff tapped and charged to full at foes held out from its strike: a tap the middle alone for its share of a full charge, a full charge out to its reach and no further, each landing once its arc has travelled, the daze by how near the middle and none on an elite; the fire staff's burn: its bites, their pace, alight only meanwhile; whom the healing beam lands on and its heal on himself every frame) and a held skill's charge mark at the aim (the cursor filling top-down, the ring round the crosshair in third person; `--class ranger` runs that part alone); `--canary` a tap as strong as a full charge
- `status`: what the server serves and has booted
- `stop`: stop the server
- `stops`: the hero coming to a stop from a run as a person stops (runs let go at different points of a stride, on level ground, drawn and by the dais's edges: the steps once still, a foot put out and drawn back, steps back, a foot on another level than the body's or stepped onto one once still, `--trace`, `--only`)
- `swing <swing>`: a swing through the eyes keyed from a pose (the key that holds a grip and a weapon's way, and what of it the swing's plane can't hold; each key placed as the game places it at its share: the grip, the weapon and its share in the frame, the elbow, the wrist, a two-hander's lower grip against the other arm's reach, where it starts against the swing before's end; turned as the trunk turns the cut or its way back; the whole swing in 1% steps, an elbow turned over and a lower grip past reach between the keys; `all`: every swing of every weapon each way held, as `check` runs it) (in full: [`commands/swing.md`](commands/swing.md))
- `talk`: a whole conversation with the library's Brother Hollis as a player has it: in full in [`commands/talk.md`](commands/talk.md).
- `tap`: the touch buttons of every skill aimed by holding, the other thumb on the move stick (tapped standing, at once and walking: a movement skill the way he moves, any other at the nearest foe; dragged while the stick moves: the skill's own preview following the drag, cast where it last showed, the stick still walking him)
- `throws`: what the slammers throw at a hero too far off to slam (the Brute's lava at him stood still: landing where he stood as it was thrown, its ring there every frame it flies, its splash and pool hurting him; stepped off, nothing hurting him; up close, a slam and no throw; the Hulk's vine holding him for its hold, his walking going nowhere; stepped aside, never caught; stepped back onto it as it lies, held; a dash tearing him free; an arrow shot into it cutting it, `--class ranger`)
- `tiles`: how big each repeated map's tile comes out on each surface of a biome, in metres along u and v, how stretched and its pixels a metre (a surface's UVs decide it: size a map's repeat by it); `--pictures` shows each surface as the player meets it
- `tooltips`: each damage skill's tooltip held to the hits it deals (the hero given modifiers of every kind, each skill cast at foes in each way of holding weapons: every hit within a figure its tooltip states, a crit raised by its share, a crit's chance the hero's, a channel's ticks as often as it says; the hotbar's tooltip following a weapon's damage changed; the draught's heal and Iron Bellow's ward as stated)
- `touch`: the touch controls' move stick pushed by a finger, its touches sent as a touch screen's (slid out through the stick's travel, to its edge and far past it, half the window across: the stick's push, the knob against the finger and the hero's speed, a push further out never giving less)
- `touchlook`: a finger dragged over the world in the close views, sent as a touch screen's: in third person and through the eyes a touch put down on the right of the screen and slid sideways must turn the camera, and the line says what lay under the finger (from play on a phone, #812: the right finger couldn't turn it)
- `touchpad`: where a finger put down starts the move stick (a grid over the screen in a run, each point touched and slid a little, buttons left alone, with the overlays down the left put away and shown: every point of the move area, the left half below the top quarter, must start it, no control there larger than a finger's button; a picture of each with the points marked; the performance overlay tapped copying a report, held still lifted, moved with the finger and kept inside the window, `--canary` pinning it to its corner)
- `trace [code]`: a performance trace a slow game sent (`src/perf`), fetched from the traces service with the token in `tools/lab/traces.env` and read as the perf overlay's report reads (why it was sent, the boot's steps, the frame rate, timings, device and settings, the histories a second at a time, the worst stretches with what happened before each, the worst and long frames, the stages, and the `perf` command that plays it again on its settings); `--latest`, `--build <sha>`, `--list`, `--file` (runs in its own process, no browser)
- `trail`: the trail a swung weapon leaves (each strike in each view, every frame drawn with it and without: its light where the weapons swept over the last 0.15 s, lit through every blow, its newest end on the blade, nothing while the weapons are still)
- `training`: Training grounds (#405): attempted-wave persistence/migration, the village's ghost talked to and its card's battleground and wave controls, harmless projections, no rewards or records, repeat and leave; `--canary` plants ordinary damage and a solid ghost.
- `trees`: the trees in the play area as the ranger's arrows meet them (every tree inside the wall a wooden prop, an arrow shot at each one's trunk standing in it; then another biome shown, and no arrow left)
- `trophies`: the house of records' trophies (every boss a battleground brings with a trophy, a place and a model of its own; none beaten, an empty shield or stand at each place, a ray at it meeting the mount; all beaten, each trophy shown on its place; no pipeline made, every frame drawn; the room's draws and triangles; the back wall and the cabinet pictured over the shoulder and from above, each place close up from the front and three-quarters, beaten and not); `--canary` shows a trophy unbeaten and sets another off its place.
- `turnaround`: the hero standing in a plain studio from a sheet's four sides and his head close, with a reference sheet's panels in a row under ours (`--ref`, `--panels`), and his triangles (`--parts`: by joint and material)
- `tutorial`: the village's tutorial walked as a player walks it, from the notice board, with keys and mouse or by a finger (`--touch`): each step done the way its words say, the tracker read and pictured as it asks for each (in full: `commands/tutorial.md`)
- `twins`: the Ossuary Twins (the Crypt's 15th wave and every 20th after sending them, the Colossus on its other boss waves, both risen within their chain's reach; one life between them, the chain snapping past its reach, the collapse at half, a mend a stun breaks; their belt skulls: each throws its four at most, its rope showing what's left, the cooldown held, the bomb bursting where marked after its fuse and throwing a hero about 4 m onto clear floor, the cloud hurting only inside it and gone on time, the survivor taking the fallen's; no program compiled in their fight; `--parts pictures,look,beltPictures` for the eye, each twin's triangles held to 45k) (in full: [`commands/twins.md`](commands/twins.md))
- `ui`: pictures the UI in its states (the lobby, the stash, tooltips, the dialogs, the hero selection screen, the run's HUD, the pause menu's tabs, the summary, the touch HUD...) at each screen size, each fitting the window (`--states`, `--screens`; in full in `commands/ui.md`)
- `village`: the lobby's village as a player walks it: every object usable from its stand, walks and ways, the grass and the lamps by quality, the light at midnight, the fog from above, the hall and the houses (`--only`; in full in `commands/village.md`)
- `village --only signpostsReadable`: the signposts, each arm pointing where its name leads, each post off the paving, the paths and what stands, each arm read face on from the paving near it (`--canary` turns an arm and stands a post in a road)
- `wall`: how near the hero walks up to the wall (at angles round the ring he walks straight out until it stops him; the gap between his body and the nearest surface drawn)
- `weapons`: each of the hero's weapons alone in a lit studio (face on, edge on, from behind, from three-quarters and its head close up, with its size and its triangles)
- `wind`: the loading screen's exit as it hands over to the lobby's logo (run on the lab's clock, the window resized as the particles fly with `--resize`: the particles' picture as each column of it rests, read from the exit's canvas, against the logo once the exit is done, at the screen's own pixels: the pixels apart and which way the logo stands from them)
- `winding`: which way every model's, the library's scholar's and biome's faces point (each mesh split into its parts, each judged by its signed volume: a part wound inside out on a one-sided material shows its inside)
<!-- end of the list `npm run lab -- docs` makes -->

## In full

- `sheet`: the hero in the states the player sees (`--states stand,walk,full,cast`), pictured from the game's views
  and close up (`--views lobby,top,third,front,left,right,back,above,below`, `below` from under the chin and round to the left, as under a beard; `eyes` with `--view first`, the whole frame
  at the row's height; `--focus <joint>`
  frames the close-ups on a joint), with each arm's load and posture beside them. `cast` casts `--skill` (its key, its
  behaviour or its name; bound to its own key if the hero knows it but hasn't it on one) ahead of him and pictures
  it at shares of its cast (`--shares`, 0.3,0.55,0.8 by default; a channel at shares of its key's hold, `holdFor`),
  with where its cast point (the weapon's tip) is: how high over the floor, how far ahead, and the way the weapon
  points (up, from ahead, and in the chest's frame, as a two-hander's holds are placed). While the healing draught's
  flask is out (`--skill potion`), how far its mouth is from the lips and how far its bulb is tipped, and where a miss
  comes from: the wrist off where the drink put it, or the fist closed off where it planned the grip (`page/drink.ts`:
  at the sip the fist swung 13 cm off the lips while the wrist landed true; the reference is the owner's Codex photos
  of a man drinking from a flask held by its neck, `.tmp/references/drink`). `--gear` holds the weapons a
  style's way (`--weapon` the base). `--look` draws the pictures another way (below: the hero's wireframe, his
  faces' orientation, his parts with where each is, his skeleton). Writes `out/sheets/<--tag>/sheet.png` and
  `notes.txt`.
- `feet`: the hero's feet against the ground round the dais's edges and on level ground (`--scenarios edge,level,
  strafe,cross`): standing at full draw by the edges (a foot moving in the hold, a sole in a step's riser, a dip under
  its own level), and walking across them, strafing up and down the steps with a shot drawn and on level ground (per
  stance: the frames out of the leg's reach, a planted foot's pitch turning back and forth, its slide, the slip of
  the sole's point on the ground that moved least, added up frame by frame (a foot rolling or turning on its ball
  keeps one point still); a sole in the ground, the fastest ankle, breaks in the left, right rhythm, frames with both
  feet up). `--canary` plants a slid and a sunk ankle, `--frames` lists what was flagged (the stances, each foot's
  runs of frames with its sole in the ground, and where the rhythm broke), `--trace` prints each frame of each walk
  with the leg IK's own state (the pelvis's drop and turn; each foot's state, window, spot, ankle, heading, tip, depth
  in the ground, clearance, landing and its shift off a riser; each walk's feet measured as the IK has them); the worst stance of each walk is pictured whole, as the player sees it and from the
  front and the side (`out/feet/sheet.png`). A walk follows on from the ones before it (the hero, the gait and the
  game's clock carry over), so compare runs of the same `--scenarios`.
- `gait`: the hero's walk judged as a person's: in full in [`commands/gait.md`](commands/gait.md).
- `form`: the hero's run judged against a runner's (`page/runner.ts`: the cadence and each foot's time on the ground
  by speed after Dorn, Schache and Pandy (2012), the hips', knees' and ankles' curves over the stride after Novacheck
  (1998) and Fukuchi (2017), the arms' after Hinrichs (1987), and the trunk's lean and the hips' rise and fall), with
  each way he holds his weapons (`--gear oneHanded,shield,twoHanded,dual`: the class's own by default). He runs
  straight across open ground at full speed, judged at a man's size (his speed and lengths scaled by his legs against
  a man's, `MAN_LEG`); each leg's frames are folded onto its own cycle from its foot's touchdown to the next, the
  stance and the swing each stretched onto the runner's so the curves line up at the touchdown and the push off. Says
  the steps a second and their length, a foot's time down and in the air, the hips' rise and fall, each joint at the
  touchdown, mid-stance, the push off and the swing's most against the runner's (and how far off on average and at
  its worst), the trunk's lean and the head's tip, the pelvis's and chest's turn, each arm's swing in the chest's
  frame and its elbow's bend, the trunk against the legs (`page/trunkSwing.ts`: the pelvis's turn and the
  shoulders' against the feet's split, the pelvis's tip and the hips' sway against the foot down, each as a
  correlation a person's reads about +1, the shoulders -1: the walk cycle moved each the wrong way for a year, which
  no other line saw, #571), and what is unlike a runner. Each way is pictured at eight points of the stride
  (`out/form/<way>.png`, one sheet a way: all four in one took the browser down): stick figures of his run (the left
  limbs blue, the right orange) over a runner's on his lengths (grey, the hips rising and falling as a body flies),
  the hero from both sides, the game's own views and his arms close up, measured first and run again to picture the
  frames chosen. `--frames` lists each leg's cycles (touchdown, push off, the next touchdown) and the curves bin by
  bin; `--canary` holds the left knee straight through its stances, which the knee's curve must show. The run goes +x
  along z -8.5 past the dais's side, `d` with the top-down camera turned to the battleground's own (`Fixture.yaw`), the
  floor's clearest lane (`page/straightRun.ts`: should a prop come within 1.5 m of it, the nearest clear lane beside it,
  or the command fails), and says how straight it held: the command fails when the facing lies over 3 degrees off the
  way set or turns over 3 degrees across the measured frames, with a canary of made-up runs (held straight, turning 10
  degrees, the other way) it must judge right. Run from the boot's camera along z 14, the warrior's `d` went -x into the
  crypt's wall and turned 60 to 80 degrees, the side views blocked, and its trunk's numbers measured the turn; turned
  +x, a prop at -5.6, 13.9 stood in the lane.
- `coop`: two games playing together: in full in [`commands/coop.md`](commands/coop.md) (`--scenarios looks`: a
  hero's look and hair colour seen by his partners).
- `stops`: the hero coming to a stop from a run, judged as a person stops (a step or two as the body slows, the last
  foot landing under it or beside the other on the ground it stands on, and once still nothing moving), over runs let
  go at different points of a stride: on level ground each way, strafing drawn, and out over the dais's edge, in onto
  it, on a slant, along it astride its step and stopping to shoot along it
  (`--scenarios level,drawn,edgeOut,edgeIn,edgeSlant,edgeAlong,edgeShot`). From the frame the keys are let go: the
  steps once the body was still, a foot put out ahead and drawn back (a waste of motion), a step back against the way
  it went, a foot on another level than the body's once still and whether it ended so, a foot stepped from one level
  onto another once still (put down a step below and stepped up a second later), both feet up once one had landed
  for more than 6 frames running (up to 6, the run's own flight going on as the braking foot comes down, as a
  runner's does, are listed apart), how long the feet took to settle and their travel once still. `--frames` lists each stop: where it was let go and
  rested along the way, and each step with where it left and landed from there and on which level; `--trace` adds
  each frame (the body, the hips, each ankle and where each foot in the air is aimed, the lean); `--only 'd 23'` runs
  the stops whose names contain that. Within one run each stop starts at its own moment of the clock, so a stop run
  alone can differ from the same one in the whole run: compare the totals. (The gait's steps back counted only steps
  that left once the body stood, and missed every stop's: the step back began as the body slowed.)
- `range`: every joint of the hero against a body's ranges: in full in [`commands/range.md`](commands/range.md).
- `eyes <skill>`: a skill cast through the eyes: in full in [`commands/eyes.md`](commands/eyes.md).
- `swing <name>`: a swing through the eyes keyed from a pose: in full in [`commands/swing.md`](commands/swing.md).
- `match <picture>`: the hero through the eyes matched to a reference (`node/match.mjs`; another game's, the one the
  owner names), not by eye: handed over as matching three Vermintide 2 screenshots from a one-line summary of them, a
  rest leaned in where they lean out, was twice as wide and had its head out of the frame. He stands at rest, or is
  caught at a moment of a strike: `--skill` cast ahead, at `--share` of its cast (0.5 by default; `page/sheet.ts`'s
  cast state). The reference is a screenshot, or a frame of a clip of the other game's swings (`.mp4`, `.webm`, `.mkv`,
  `.mov`; `--frame <s>`, cut by ffmpeg into `out/match/frames` once, `node/clipFrames.mjs`). He's put on a screen of
  the reference's shape (`--gear`, `--weapon`, `--wear` and `--tune` set him up; it takes no `--screen`), and
  `out/match/<picture>/match.png` shows the reference, his frame and the two blended, with the reference's marks (red)
  and his (blue) on each. The marks are written once beside the picture, `<picture>.marks.json` (a clip's frame's:
  `<clip>@<ms>.marks.json`): `crop` (px: the game's frame within a screenshot of a video), `points` (`in`, where the
  weapon comes into the frame, and `tip`, its tip or head; shares of the frame across and down), `wide` (the weapon's
  width, a share of the frame's: a bar across its line at its middle shows it), `box` (the part of the frame it covers,
  [left, top, right, bottom]) and `outline` (the weapon's and the fist's, shapes of [x, y] shares). His are the sheet's
  (`page/inFrame.ts`: read off the frame as drawn, through the camera that draws the arms; which of the weapon or the
  arm each cell of a 96 by 54 grid shows is the two drawn alone in flat colours, `page/pickGrid.ts`: a ray a cell
  against the skinned hands took 43 s a frame at a strike, and saw them skinned another way than the game draws
  them). It says each frame's numbers (the points, the lean between them, the width, the box), how far his are off the
  reference's, and how much of each outline his frame covers. Check the marks on the reference's own panel before
  trusting a comparison. `--fit a.b,c.d` searches tunable values (`--tune`'s) for the rest nearest the marks `--near`
  names (`line`, `wide`, `box`, `outline`, by default; `page/fitRest.ts`; a rest only), then pictures it with the
  `--tune` that gives it: fitted one number at a time, a rest matched every number with the blade out of the frame and
  the hand in it. `--canary` takes his points as the reference's moved 10% across, which the comparison must find so,
  and with `--fit` fits him to his own frame from values moved off it, which must find its way back.
- `carry`: the ranger's carried bow against his body through a carry's round (standing, walking, a draw and its shot,
  waiting with the next arrow, putting it back). `--canary` plants faults it must catch; `--frames` lists every frame
  with a clip, what crossed what and how deep.
- `bowprop`: the ranger drawing at a prop he stands against, his bow's end in it (`page/bowProp.ts`, `--class ranger`;
  `shotFrom` in `src/combat/skills/ranger.ts`). First the shot is drawn level ahead and the point the pose aims from
  is held within 5 cm of the nocked arrow's middle. Then in each biome (`--biomes`), against one prop of each kind
  (the one nearest the middle with room to stand at each distance), from 0.25 and 0.5 m off its circle, the shot is
  drawn and held for 150 frames on a point on the prop from the top-down view, the mouse over it (in the close views
  the crosshair's point within 5 m goes on along its ray, `AIM.near`, so the aim never sits on a prop beside him).
  From the tenth frame on, the nocked arrow's middle, the bow's upper tip and the hero are read in the world every
  frame, and a move over 1 cm that turns back on the frame before's is a reversal: more than 3 over the hold is a
  flicker. A stand whose shot was never drawn, or whose aim never met the prop, is a problem too. Aimed from the arrow
  as posed, the pose's angle moved the arrow to where the next frame's turned it back (#317): main turned back on 59
  to 138 of the 140 frames against the crypt's stone and wood and the forest's stone and mushrooms, the arrow's
  middle up to 1.07 m and the bow's tip 1.29 m in a frame, now none, 2 to 6 cm a frame at most. From the same frame
  on, the aim preview shown (`laserPaths` in `src/fx/aimLaser.ts`) may run no more than 0.3 m past the prop's far side
  where the prop stands over the arrow: loosed from the arrow pressed into the prop, it went on through it (#640, from
  Victor: "laser goes through, it should not"; 2 to 150 frames of a hold, 94 m past it), now loosed from over his feet
  where a prop stands between him and the arrow (`loosedFrom`), every stand stops at it. And in each biome a training
  dummy 0.1 and 0.3 m off his reach, held on its chest the same way: the preview must stop at it (it went 1.35 m on
  through it, from Victor on #640; a foe between him and the arrow looses it from over his feet too). `--canary` aims the
  pose from the arrow as posed again (`shotFrom.steady=0`), which must flicker; `--pictures` films four frames running
  round the arrow's largest move in each biome's first stand (played again to it), the whole body from his right and
  from above behind, each with the arrow's height (`tools/lab/out/bowprop`).
- `probe <module>`: a measure of your own ([`WRITING.md`](WRITING.md)). Options the lab doesn't know are passed to it (`--frames=30`), and
  `--setup=false` skips the set-up.
- `ui`: the game's UI as the player sees it, in its states: in full in [`commands/ui.md`](commands/ui.md).
- `readme`: the README's pictures (`page/readmeShots.ts`, written to `out/readme/<shot>.png` at the screen's own
  pixels: `--screen 1600x900@1`), each a moment posed and pictured by `lab.screen`, the page's UI over the frame:
  `village` (the hero before the fountain at 17:30, over the shoulder), `campfire` (a party of four round it at
  21:30), `hall` (the hero selection screen), `stash` (the chest's panels, a full set worn and 34 items of every
  rarity), `forest` (over the shoulder, the hero's skill cast at seven of its foes), `crypt` (from above at the
  game's close zoom, before the dais), `choice` (the choice after a wave, nine items in the bag by rarity), `party`
  (four heroes in the Crypt, each in a colour, class and gear of its own) and `down` (one of them down, the local
  hero holding E to raise him). `--shots a,b` takes some; `--class` is the local hero (the README's are the mage's,
  and `forest` the warrior's: `--class warrior --shots forest`); `--after n` pictures a fight n frames after its
  skill is let go, to choose a moment. The dev build's tab and the close views' hint to click are
  hidden. The partners are heroes built as a room builds them (`net/session.ts` `makePlayer`) and stood by their
  reported state, the game's role set to host: one page and no room, so it shows how a party is drawn and says
  nothing of the link (`coop` plays real rooms). A shot taken alone comes out a little otherwise than in the whole run (the same scene, its particles and the idle elsewhere: 5% of the crypt's pixels), as each follows on from those before it. It is for pictures, not a measure: its one problem is the partner
  not down as `down` is taken. Copy the chosen pictures into `docs/screenshots` as JPEGs (quality 86: 150 to 460 KB
  each at 1600x900; `docs/screenshots/AGENTS.md`).
- `wind`: the loading screen's exit as it hands over to the lobby's logo (`page/wind.ts`, `src/ui/logoWind.ts`).
  The loading screen is put back over the lobby (index.html's, fetched) and its exit run on the lab's clock into the
  lobby logo, the window put on the screens `--resize` names one after another as the particles fly (on
  `--screen 1536x864@1.25`, `--resize 1920x1080@1.25,1536x864@1.25` is full screen and back at 125%, the owner's; the
  lobby logo's snapshot, taken again on the browser's clock, is waited for at each change, and one that never came is
  a problem). Each column of the particles' picture round the logo is read from the exit's canvas at the last frame
  its points all rest there (`restOf`, which the exit exports: when they've all landed and before the logo takes the
  column over), laid over the lobby as it shows behind the logo (its letters hidden), and set against the logo once
  the exit is done, both at the screen's own pixels, the logo's glow hidden in each (`page/windCompare.ts`): the
  logo's pixels apart by more than 8 of 255 (more than 0.1% of them is a problem: the logo jumps as it takes over),
  the most and the mean, and the move of the particles' picture that fits the logo best, in quarter pixels, a pixel's
  blur taking the metal's grain out (`the logo 0.25 px left and 1.00 px down of them`). The lobby is pictured twice,
  which must agree. `--canary` pictures the logo a pixel lower than it is: the move must find it a pixel down. The
  particles, the logo and where they're apart are pictured (`out/wind`). On main at `1536x864@1`, the owner's complaint
  ("when it settles it doesn't directly hit the final location, so this layout shift is visible (from particle logo
  to regular)", the window resized before the exit's end, at 125%): 42% of the logo's pixels apart, the mean 21.7, the
  logo 1 px down and 0.25 px left of the particles; at 1.25x 28% and 0.5 px left; at 1920x1080 14% and in place (the
  particles' drop shadow and edges darker where several points land on one pixel, and the metal's grain drawn
  otherwise). Landing into the logo's snapshot, which the logo is then shown as, none apart on each, the most a
  channel apart 1 (rounding). Once the exit is done the window is made a tenth smaller each way, which sizes the UI
  again: the logo must show as itself then, any picture of it gone. The stalls' `--resize` checks the exit's places as
  the window changes; this, its picture.
- `parity`: the same scenes pictured as the player sees them, to compare what two commits draw (`page/parity.ts`,
  `--ab`; made to compare two renderers, which no option boots now): each biome's arena from the run's countdown, then the village at noon and midnight
  (`--hours 12,0`) from the square, the hall's door and inside it, the training yard, the campfire and a cottage, from
  above and over the shoulder (`--scenes square,crypt`: those whose names hold any). The pictures are the page's own
  (`lab.screen`), as WebGPU's canvas can't be read back by WebGL's `readPixels`. It finds nothing itself: what
  differs is the A/B's verdict and the pictures side by side (`out/parity`, `out/ab/parity`). Its first run, on the
  village's branch, found WebGPU drawing the paving, the plaster and the hero near black at noon, and the arenas far
  darker than WebGL after a biome switch, where main's WebGPU arenas match its WebGL ones.
- `light`: the frame's light as the player sees it. The hero stands in each biome (`--biomes crypt,forest`), in each
  view (`--views top,third,first`), the close views looking each way (`--facings 0,90,180,270`, degrees: the camera
  turned by mouse look, which the body follows), and the frame is drawn by the game's own camera and read back from
  the canvas. Its light is a share of the screen's white: the mean, by thirds (through the eyes the sky is the top's),
  the 50th, 90th and 99th percentiles, the brightest pixel, and the shares near white and past it. An SDR frame is
  read as an SDR screen shows it (gamma 2.2), an HDR one as the browser shows its extended sRGB. Each frame is
  pictured (`out/light/`; `--pictures=false` for the numbers alone). With `--hdr` (`--paper`, `--peak`), the same
  moment is drawn again in HDR, on any display, and checked against the SDR frame: every pixel under the knee as the
  SDR screen shows it at the paper white, nothing past the peak, and the canvas shown (the WebGPU one, read back) the
  frame drawn, its alpha 1 everywhere (#575: the forest's shafts of light, added, left 2 and 3 there, up to 8.7 by
  its portals, which a Mac's screen multiplied the colour by). `--canary` draws the first frame at twice the exposure, which must come out brighter, and in HDR at
  1.2 times the paper white, which the check under the knee must catch. With `--ab` the SDR frames agree with main,
  line for line.
  **At every quality level, on demand** (`--levels high,medium,low,verylow`, `--resolutions 1,0.5,0.25`): the same
  moment drawn again at each level and Resolution, set live as the pause menu sets them, each frame's light held to
  the first's: a mean or a brightest hundredth over 1.12 times it, or 0.2% more of the frame near white, is a problem
  (a level is there to cost less, never to look brighter), and each is pictured. `--at x,z` stands the hero by what
  can be too bright (`--at=-6.5,3.5 --zoom 0.4`: a standing stone's rune in the forest), `--zoom` zooms the top-down
  view in. `--canary` draws the last at twice the exposure, which must be found brighter. Run it for a change to what
  a level draws (its shadows, bloom, lights, the Resolution): the forest's stone read within 10% at all twelve. From
  play, a preview whose Low and Very low took no shadows on WebGPU had its fires "blinding" and "other objects also
  too bright", which no check had been asked: the lab's light was measured at the boot's level alone.
  `--walk 90` walks the hero that many frames at each level too, every frame drawn, and says how much the frame's
  light changes from a frame to the next (its mean change and its most, shares of the frame's mean), a problem over
  1.5 times the first level's: a glow that flickers as the view moves, which a still frame never shows (from play, at
  Very low: "blinding light... it only happens when I'm moving"; by the forest's rune main read 0.18% a frame at
  High, 0.29% at Low and 0.46% at Very low, bloom's bright pass reading a sixteenth of the pixels under it there).
  The canvas is read through a 2D canvas in the same task as the draw (`webGpuPixels` in
  `page/pixels.ts`, SDR only): with `--levels`, it caught WebGPU's Low and Very low a fifth brighter than High in the
  forest, their shadows untaken. Run it with `--boot verylow` too, where a level's pipelines are built plain.
- `passes`: what each of the frame's passes takes of the GPU (`page/gpuPasses.ts`, `--device` to play a slow
  device's GPU), as the engine times them within one frame (`src/perf/gpuParts.ts`, Bulwark's `gpu/parts.rs`, the
  profile's "the frame by its parts"): every pass stamped at its start and its end, the scene a pass for each run of
  its draws of one kind by one shader (the page's own shaders named: `crypt-damp`, `forest-moss`, the kit...), the
  rows adding up to the frame broken down, beside the frame as it is by the engine's GPU clock over `--frames` (30).
  Read it with the GPU loaded (`--screen 2880x1800@2`): an idle desktop GPU's frame under a millisecond reads several
  times its time broken down. `--features` times each of the lit shading's parts in the whole frame (the point lights
  and the lamps, the sun's shadow, the lamps' shadows, the maps read, the fog, each part of the lit shader), taken out
  and put back in turns by the engine's own switches (`frameParts` in `src/perf/sceneParts.ts`, `costInTurns`), each
  with how far it may be off. `--canary` takes the bloom out and breaks the frame down again: the bloom's passes must
  fall to half their time or less (the engine keeps a fifth of them with it off: 0.17 ms of 0.78 at 2880 by 1800 at
  2). It pictures the frame it timed, as the browser shows it, so `--ab` compares the look of a cost cut. `--paused`
  pauses the game as its pause menu does (no update, the same scene drawn): a phone's GPU took 11.5 ms a frame paused
  and 24 in the lobby, the same view and level (traces N5TH-2XC9, R5FJ-9TNN). `--village` stands the hero in the
  lobby's village, as `draws --village` does (`--at` there, the square by default): a phone's slow report was taken
  there (FJJ1-Z9XM), and `--biome` stands him in a fight's arena. `--hour h` holds the village's hour (0 by night,
  its lamps lit): left to the page's own, the sun moved between an A/B's two sides and its shadows differed by 5% of
  the pixels. (Under three it read three's timestamps, every render call named by what it drew, and `--features`
  took three's environment, shadows, point lights and fog off its scene pass: the engine replaced three's drawing,
  and both read nothing.)
- `profile`: the game's profiler (`src/perf/profiler.ts`, the pause menu's Performance tab: Profile this spot) run
  in the lab (`page/profile.ts`), the hero stood at `--at x,z` in `--biome` (forest), or in the lobby's village
  with `--village` (`standAt` in `page/draws.ts`), in `--view` (top) at `--level`
  (the player's own otherwise; with `--device`, that device's level and screen). The game's frames are held, the
  frame drawn again and again with each part of it taken out and put back in turns (`--rounds`, 6, of 3 frames a
  side), one in each of the browser's frames (`__labClock.realFrame`), each waited for and timed by the browser's
  clock (`__labClock.realNow`), and the parts listed by what they take, as the player's device lists them, with how
  long it took and the programs it compiled: over 8 fails (a part changing the scene's programs compiled them all
  again, 66 s of a 69 s run). The page's parts are timed by the frame's interval as the browser shows it; the lab gives one of its own, 30 ms of work a frame while shown, which must read at least 15 ms (28.7 here; an interval steps by the display's refresh, and a 60 Hz screen reads 17 or so). Then a second profile cancelled after 20 frames must stop there, leave the scene as it
  was (the pixel ratio, what's shown, what casts, the lights' reach) and let the game's frames go (the hero walks).
  On this PC it says what this GPU pays, which is not what a phone's tiled GPU pays for cut-out and blended pixels:
  for that, have the player press the button and read their trace with `lab trace` (its Profile section).
  `--canary` draws the frame twice, which must read 1.6 times once (on WebGPU the GPU waited out between the two),
  and walks the hero again with the game's frames held, which must read stuck; a walk that reads stuck is pictured,
  before and after (`out/profile/film-1.png`: on the lent 4080 laptop, the HUD over a black scene).
  `--arrows <n>` stands n spent arrows in the ground round the hero first, timed as their own part (1,000, the
  most kept, read nothing of a phone's 8.5 ms frame at Very low: `--device phone --level verylow --arrows 1000`).
  The forest at 15.4,15.4: the frame 4.6 to 4.9 ms here, profiled in 3.4 s, 4 programs compiled, the canary 1.75 to
  1.97 times (2 frames a side read 1.57 once). Its result is sent as the tab's Send sends it, to a traces service of
  the lab's own, and read back as `lab trace` reports it: its Profile section must hold the lines as sent. The
  pipelines made count (over 24 fails: the plain colour's 12 to 16; the lit shading's own parts, the depth drawn first's and,
  at Low and Very low, the lit shader whole against the plain levels' (72 in the forest) make
  theirs and are left out of it: 94 in the crypt at the phone's pixels, the profile 24 s), and the forest's frame
  read 6.8 to 9 ms, the canary 1.99
  to 2.1 times. It keeps no copy of the
  parts: it runs the game's, so it can't be run `--ab` against a commit from before it.
- `scenecost`: what each kind of work in the scene pass takes of the GPU (`page/sceneCost.ts`), at a level's
  settings (`--level`, low) and the screen's own pixels, whatever the level's cap: the resolution is never what's
  cut, what a pixel costs is. The scene pass alone is drawn, each part taken out and put back in turns
  (`page/gpuTurns.ts`, `--rounds` of 6 renders a side): the point lights, their lighting where they reach (the
  lights put out of reach: the same programs, so the loop's own cost over them is left out; the most a shorter
  reach can save, 0.08 ms of the forest's 4.3 at 8.3 Mpx), their shadows, the sun's shadow, the
  environment, the lit shading against a plain colour, what's see-through or cut out, the particles, the hero;
  `--each` times each see-through or cut-out mesh alone too and lists the costliest. Run it on the screen that's
  slow (`--screen 1432x768@2`: a laptop's 2864x1536 at 200%, whose integrated GPU spent 86% of a 10 fps frame on
  the scene pass). `--canary` draws the scene twice, which must read 1.6 times once. The GPU's timer counts what
  else holds the GPU: with another session's work on it (40%, its clock at 1320 MHz) a part read -0.9 to +1.9 ms
  from run to run, so check `nvidia-smi`, run it twice with `--rounds 12`, and believe what both agree on. It
  found the point lights at 59 to 70% of the forest's scene pass (each pixel lit all 20, the pool's idle ones and
  those out of reach too), 2.29 ms of 3.9 on the owner's 4070 Ti at 4.4 Mpx, 0.96 once skipped where they light
  nothing (`--ab`). `--frame` times the whole frame too (`page/frameTurns.ts`), by the browser's clock with the GPU
  waited for (WebGL's `finish` and the HDR output's WebGPU queue), each change on and off in turns: HDR's output
  (forced on, a WebGPU copy the GPU's timer queries can't see) and the level's MSAA against none; with `--canary` the
  frame drawn twice must read 1.6 times once. At a 4K laptop's screen (`--screen 1280x720@3`) HDR's output was 7.1 to
  9.0 ms of a 12 ms frame on the owner's 4070 Ti, as on the laptop (26 ms of 38, trace BN6P-FN12), and MSAA 0.5 to
  0.6 ms.
  **Each row says how far it may be off** (`page/gpuTurns.ts`): what a part takes is the median over the rounds of
  each round's own difference, its two turns sent back to back and in the other order each round, with that
  median's standard error after it (`1.86 ms ±0.03`), and "within the noise" where it's under twice its error: such
  a row says nothing, neither a cost nor a saving. Every turn is sent before any is read (read turn by turn, the GPU
  idled while each was waited for and its clock fell).
  **Time it with the GPU loaded.** A strong GPU drawing a phone's or a laptop's pixels is nearly idle, its clock at
  a fraction of its top, and what it reads is the clock's wander: at 4.5 and 5.2 Mpx on a 4080 laptop the rows
  were off by ±0.2 to ±0.5 ms and the hero read 1.4 to 2.8 ms, "half the crypt's scene pass"; at 20.7 Mpx
  (`--screen 2880x1800@2`: four times the laptop's pixels) every row is within ±0.04 and the hero is 0.35 ms, 6%.
  A device that is slow is loaded at its own pixels, so the loaded shares are the ones it has: there the crypt's
  lit shading is 86% of the scene pass and its 20 point lights 51%. Two changes judged at the idle sizes were
  called no gain and a loss; one of them, measured loaded, saves 13%. So run it at a size that gives errors of a
  few hundredths, alone on the machine (Loaner's `--exclusive`), and believe nothing a row with a wide error says.
  `--hero` times the hero's parts too, over 24 rounds: his head, his hands, his cloth, the rest of him and that rest
  a material at a time, the shadows he casts (his pieces' casting switched with his one shadow let go, `castingAsOne`, three's and since taken out:
  switched alone, the one shadow was merged again at every turn, and the merge was what read, 1.9 ms), and a change
  of nothing, which must read nothing: told from nothing and over 0.15 ms is a problem. With `--rarity` (every item
  he wears of it: Rare and up glow) it times the glow of his gear too, each glowing material's colour put to black, so
  its lit shader skips the pattern, the same program either way. `--level verylow` takes Very low's settings: at a
  phone's screen (`--screen 832x384@3.75`) on an AMD integrated GPU the forest's thicket leaves were a quarter of its
  scene pass (`--each`), and the point lights' shadows and the environment taken off by a uniform's value saved
  nothing there, as only what the program is built of read.
- `glowcost`: what the worn gear's rarity glow takes of a frame (`page/glowCost.ts`; `ITEM_GLOW` in
  `core/materials.ts`; from play: "we also need to disable clothing shader effect, for rarity -- measure how much it
  would impact the performance"). The heroes of a scene are dressed in `--rarity` (legendary) and the same frame is
  drawn with the glow and, in turns within one page (`page/gpuTurns.ts`, `--rounds` of 6 frames a side), each way
  without it: off by the setting (its strength a uniform at 0), on plain
  gear (each glowing material's colour black, as `ItemGlows.set` leaves it: the code passed over a pixel), and gone
  (its lines taken out of every program that has them, in copies of the scene's materials made here alone, each
  running its original's hook as the original and keyed by that hook's source too). The whole frame is timed, the
  post chain with it, by the GPU's timer, with a change of nothing beside them (the noise). Each scene proves its
  sides: the glow must change pixels, every way without it must draw the same frame as the one with its code gone
  (where and by how much it differs is said), and no mesh may still draw with the glow's code once it's taken out.
  `--scenes`: `top`, `third`, `first` (the hero alone), `party` (three partners of the other classes stood before him,
  over the shoulder), `fight` (28 of the biome's foes round him, top-down), `hall` (the hall of heroes; run last, as
  it leaves the run). `--level` with `--boot` of the same level; `--cpu n` times three's work on the frame by the
  browser's clock too, the CPU slowed `n` times, against plain gear and against plain gear drawn in the kit's own
  materials (the glow's copies, `kitCopy`, are materials of their own whether an item glows or not); `--canary` the
  frame drawn twice, 1.6 times once at least. Run it with the GPU loaded (`--screen 1920x1080@2`): at 1080p on a
  desktop card the frame read 5 to 13 ms from pair to pair, its clock idling. Two scenes of 20 rounds take about
  100 s. On an RTX 3060 at 3840x2160 (the mage): top-down and a fight nothing told from the noise (±0.1 to 0.2 ms);
  over the shoulder 0.3 to 0.4 ms of 11.5 (2 to 4%); through the eyes 0.5 to 0.7 of 10 (5 to 7%) at High, of 7 at Low
  (8 to 10%); a party of four 0.4 of 13.5 at High, 0.4 to 0.8 of 7.5 at Very low; the hall 0.7 to 1.2 of 18 at High,
  0.5 to 0.7 of 14 at Low and 13 at Very low. The setting off saved nothing in any scene (-0.2 to +0.2 ms, within
  the noise) while its strands were worked out and multiplied by 0, and plain gear as much as the code gone, within
  the noise: since then the setting off passes them over a pixel, as plain gear does, and Very low has it off. The CPU slowed 4 times read no difference
  for the copies (±1 to 2 ms on a 25 ms frame). No level leaves the glow out. What it got wrong on the way: a hero
  dressed again each turn (`setGear`) had his staff and coat built anew, out of every swap; two swaps of materials
  put back in the wrong order left the glow on a dozen meshes "without" it; copies keyed alike shared one program.
- `envcost`: what the environment's lookups take of the GPU (`page/envCost.ts`), the hero standing in each biome
  and view (`--biomes`, `--views`: top and third): the frame timed on the GPU with the scene's environment and
  without it in turns (`page/gpuTurns.ts`, which `fire --cost` shares: `--rounds` of 6 renders a side), so a run's
  load falls on both. Every lit standard material looks its environment up twice a pixel; three r187 swapped the
  packed atlas's lookup (`textureCubeUV`: a face picked, up to four fetches) for a cube map's one, and `perf --ab`
  read the scene pass 1.5 ms cheaper, about as far as a commit against itself read apart. With `--ab` each commit
  is timed against itself (an exported commit whose lockfile differs is served its own packages). `--canary` draws
  the frame twice with the environment: it must read 1.6 times the frame without. The GPU's timer counts the
  time its queue took, others' work with it: on a GPU another program holds at 100% the canary failed (1.24
  times) and the readings were noise; check `nvidia-smi` first. On the owner's idle 4070 Ti the lookups cost under
  a millisecond on both 0.185 and 0.187 (0.3 to 0.9 ms against frames of 3.9 to 6.7), while one scene's whole frame
  read 3.8 to 11.8 ms from run to run: run it twice, and believe only what both runs agree on.
- `npm run fire-bake -- [key=value ...]` (`node/fireBakeSheet.mjs`, no browser): the fire's simulation
  (`src/world/fireBake.ts`) run alone, six of its frames drawn from the side as the ray-march draws them, in
  seconds, with how long it took and how high the flames stand: for trying `FireTuning`'s and `FLAME_LOOK`'s
  values; its picture isn't the game's light. It says what the loop takes, kept and on the GPU, and fails over
  its budget (`BUDGET_KB` in `src/world/fireBake.ts`, which `lab:test` holds it to as well) or with any of the flame cut off outside the kept box.
- `fire`: each biome's fire as the player meets it: in full in [`commands/fire.md`](commands/fire.md).
- `glow`: each worn item's glow in its rarity's colour (`page/itemGlow.ts`, #404, `src/entities/models/AGENTS.md`).
  At Very low with nothing chosen the gear must glow not at all, and glow once On is pressed there (`judgeLevel`:
  the level's say, `QualityPreset.gearGlow`; main, where every level glowed, fails it).
  The hero (`--class`) wears every item his class shows, the warrior with a shield, dyed in a player's colour
  (`--colour`, green by default: a Rare item's green on it). Each slot's item alone is given the rarity
  (`--rarity`, rare by default), and the front and back close-ups drawn with its glow and with `ITEM_GLOW.strength`
  at 0, at the same moment (his gear set again between the two could seat his hands anew). What it added: the
  share of the close-ups it lit (under 0.1%: unseen), its 99th percentile (over 0.25 of white, the weapon's 0.5 as it's made to bloom: too bright), how much of it within a fifth of its median
  (over half: one flat light, the highlight the owner ruled out), its hue against the rarity's (a cosine under
  0.9), and a Magic item's (any: a problem). Then every slot at the rarity over 4 s, the hero held still and the
  glow's clock alone moved on, a sample a tenth of a second: its pixels' mean change between two, a share of its
  light (over 50%: not slow; under 5%: still); and the step as its cycle starts over against the steps just
  before and after it (over 1.5 times them: a join; a frame a whole cycle on against now can't tell, the shader
  given only the share of the cycle, and that check passed a join the owner saw). Any program compiled meanwhile is a problem. Pictured close up front and back,
  every item Common and every item at the rarity (`out/glow/`). `--canary` draws the chest's glow ten times as
  strong and at nothing, skips 2 s as its cycle starts over, and leaves the Gear glow setting on where it's
  pressed off, each of which must be caught. The setting: Settings' Off pressed (its own button), nothing of the
  gear may glow; On again, it must. `--tune
  itemGlow.strength=0.1` compares a strength. As tuned before (0.12; now 0.07), in green: the glow lit 0.3% (hands) to 13.8% (the
  mage's robe) of the close-ups, its 99th percentile 0.04 to 0.09 of white, 6 to 35% of it in one light, its hue
  0.97 to 1.00; its pixels changed 11 to 33% a tenth of a second (the mage: 20 to 30%), and as its 16 s cycle starts over
  no more than the steps beside it (it was 105% against 20% with `turns` 3: a join).
- `haze`: the hero's held weapons' light through the eyes (`page/haze.ts`), standing in a biome (`--biome`, the
  forest by default) looking each way (`--facings`), held as `--gear` and `--weapon` say. The frame is drawn with the
  weapons and without them, each also with the grade's adaptation held off, and their surface found in the `parts`
  look. Held off, the share of their surface near white is their glare (5% at most), and the share of the frame past
  them that their light brightens by 0.03 of white is their bloom (0.5% at most): the sun on a dual wielder's blade
  held up by the eyes blew it out over 16% of its surface and bloomed over 7.7% of the frame. Past their own pixels,
  a pixel the adaptation darkens more with them than without is hazed (0.5% at most). Each frame is pictured with its
  map: the weapons blue, their glare yellow, their bloom pink, the haze red (`out/haze/`). `--canary` plants a veil
  (the frame at 0.8 of its exposure), which must haze, and the weapons lit white, which must glare and bloom. Not
  yet within its haze: on main as here, a single sword hazes up to 4.9% of the frame looking 135 to 315 degrees.
  `--part hands` measures the hands instead and `--view third` looks over the shoulder: the mage's glowing hand, its
  light at the palm and its outline at 3.2, blew out 12 to 23% of its surface (the owner: "his hands glows too
  bright", "we should never have blinding lights in our game"); a halo is held to the part's own size when that's
  under 0.5% of the frame, as a hand's is.
- `touch`: the touch controls' move stick pushed by a finger, its touches sent by the browser as a touch screen's
  (`lab.touchDown`): put down on the move pad and slid right, within the dead zone, through the stick's travel, to its
  edge and far past it, and half the window across, each push from a fresh set-up. Each push's line says what the
  game made of it: the stick's push (0 to 1), how far out the knob stood and the hero's speed against his full. It is a
  problem when the knob isn't under the finger within the travel, when a push further out gives less than a nearer
  one, or when a push past the edge falls short of full speed. On main, the knob was held to the edge and the push
  divided by the finger's whole distance, so half a screen out the hero walked at a seventh of his speed. Each push
  starts 10 m from the arena's middle against its way, so it walks him in across open ground; a push read within 3 m
  of the wall is a problem, as the wall brakes him there (`Player.slowForWall`): from the lab's own spot (12, 22) a
  push to the right walked the ranger into it, and every push past the edge read 6.55 of his 7 m/s. `--canary`
  slides the furthest push's finger back to 20 px before it's read, and pushes once more from the set-up's own spot,
  into the wall: both must be caught. Try it on a phone too
  (`--screen 844x390@3`): the stick is drawn at the touch controls' scale, and so is its travel.
- `heropick`: a first visit's hero picked on the hero selection screen (`page/heroPick.ts`, `ui/heroSelect.ts`). It
  boots as `--first` does (no saved hero, the screen open over the hall, the mage in focus; `--class` another if the
  first visit's hero changes). Escape must first open pause/settings without choosing a hero, navigation behind it
  must do nothing, and closing pause must preserve the selection. It then navigates to an alternate hero before its bar finishes, repeats its tab
  and presses Enter: the hall stays responsive, the cold model stays hidden and no hero is saved. It then taps
  a different hero as soon as his bar finishes, at his middle with a finger as a touch screen sends it, then
  opens the screen again as a first visit's and clicks him with the mouse: each pick must land in the lobby, the
  screen closed and the lobby's panels shown, with no run started and no press waiting for the fight's warm-up, and
  the browser's click after the press must reach nothing outside the screen (each line says what of the lobby lay
  under the pick). No whole body may be completed inside the picking event; the current-hero pick missed that
  first different-hero stall. The canary drops the prepared spare and must detect this build as well as click-through.
  From play on the owner's phone: "I picked mage, it entered the area, enemies spawned and started
  attacking me, happens every time": the screen closed as the finger lifted, and the tap's click, which comes after
  it, pressed the lobby's Enter the Arena, which stands under the mage on a 640x360 screen; a first visit's fight
  still cold, the Start waited under the fight's loading bar and began the run once it was warm (on WebGPU, whose
  fight warms under the loading screen, at once). `--canary` lets that click through (`heroSelectEatsClicks(false)`),
  which must be found. Run it at `--screen 640x360@3` (Start under the hero), a phone's `832x384@2.8125`, a
  desktop's. `--quick` instead picks the mage at once, the other heroes still
  warming (hidden on their plinths), the CPU 12 times slower (at 4 they were warm before the hall closed), the view
  changed every 40 frames (V, the training's first step: from above, the hall's dais is seen from the square), and
  follows every frame until their warm-up and builds are done: every shown hero in the scene must be drawn where he
  stands (his object's world matrix within 1 cm of his position) and be someone's (a player's, the hall of heroes'
  open, or on the dais), and the others must have come to stand on the dais, or nothing was measured. It pictures the
  fountain from beside it as they first do. From play on a slow first visit (a PR preview): the warrior and the
  ranger stood on the fountain, the hall of heroes' plinths in the village, their dais's matrices held where its
  room had them (hidden there, still warming, the frame's render had left them out of the world's matrices). Its
  `--canary` holds the first hero on the dais drawn on the fountain, which must be found.
- `touchpad`: where a finger put down starts the touch controls' move stick (`page/touchPad.ts`). In a run, a 16x8 grid of points
  over the screen, each touched by a finger (`lab.touchDown`) and slid 30 px right, the stick read a frame after:
  pushed, or not. A point whose topmost element is a control (a button, a skill's slot, a link) is left alone, as
  a tap there would act. Every point of the move area (the left half, below the top quarter: the old pad's) must
  start the stick, and a control there may take no more room than a finger's button (72 css px square, measured
  on the part of it that takes touches: a control that lets touches through but for its head is its head's size).
  Run twice, the overlays down the left put away and shown (the performance overlay, the battle log, as the pause
  menu shows them), each pictured with its points marked (`out/touchpad/`: green the stick, blue a button left
  alone, red the move area's misses, grey nothing elsewhere). On main the performance overlay, a button the whole
  panel round, took 15 of the move area's 48 points on the owner's phone (`--screen 832x384@3.75`): from play,
  "they only activate in a small area now". A touch the browser takes as a pan (a page element whose
  `touch-action` isn't none) is cancelled and heard no more: the lab's touches know it (`lab.touchPanned`).
  Then the performance overlay's frame rate and its graph are each tapped, a finger put down and lifted, with the
  touch controls shown and hidden (a menu open), and each must copy a report (the overlay says so): on the owner's phone the panel let touches through to the stick, its
  frame rate alone a button, and a tap on the panel copied nothing (the frame rate's own click came one tap in two).
  Then the overlay moved by a finger (`page/perfDrag.ts`, #245: on a phone it shared the top left corner with the
  pause button): a finger held still on it must lift it (no sooner than a tap ends, 350 ms), slid 160,-60 px the
  overlay must follow it within 3 px with the hero standing (the stick unpushed), and let go its place must be kept
  (the cookie `last-stand-overlays-place`), pictured; a finger sliding at once from it must walk the hero and leave
  it, and one pushed far past the window's top left must leave it whole inside the window.
  `--canary` lays a clear sheet over the move area's lower left, and pins the overlays to their corner for the drag,
  which must both be caught.
- `tap`: every skill of the hero's class aimed by holding (`SkillDef.aimed`: `--class mage` Starfall and Veilstep,
  `ranger` Hedgeward and Strawman), its touch button pressed by a finger, the other thumb on the move stick
  (`lab.touchDown(at, finger)`), each from a fresh set-up with a training dummy standing clear at the hero's side.
  Tapped standing, tapped down and up between two frames (a slow phone's quick tap: the release takes the aim as the
  press would have) and tapped while he walks away from the dummy across the way he faces: a movement skill
  (Veilstep) must go within 3° of the stick's way, or of his facing standing, and any other be cast at the dummy where
  it stood as the finger lifted (a skill that settles where it's cast, the Hedgeward's wall within its reach and
  clear of the props, aimed at the dummy and cast where its `settle` placed that aim). Each cast is read as the skill
  is given it (its `cast` wrapped for the round). No
  tooltip may open after a tap. Then dragged from the button through three stops, the stick slid to a new way at
  each: the skill's own preview must show within 3° of the drag's way from the hero (Quarry Mark's outline round the
  dummy standing along it), no plain ring beside it, and let go it must be cast where the preview last showed, the
  stick still pushed and the hero walking on. On main a tapped Veilstep went at the dummy (87° to 177° off), no held
  skill showed its own preview on touch, and a tap opened its tooltip over the buttons. `--canary` taps a movement
  skill with the stick let go and the hero turned to the dummy, another with the dummy carried out of reach, reads
  each drag's last preview before a frame showed it, holds its cast against the stop before's preview, and reads the
  plain ring as shown beside a preview: each must be caught. (A dummy risen outside the arena or in a prop is pushed
  in over its first frames, metres for one off the edge: spots are picked where one stands clear.)
- `rooms`: Play together's rooms end to end (#676; `node/rooms.mjs`, `page/rooms.ts`), against a co-op relay the
  command starts in its own process on a free port for the page's origin (`startRelay` from `server/relay/relay.mjs`, its
  grace 400 ms so a host gone leaves the list soon; its packages once: `npm ci --prefix server/relay`). The command's page
  hosts and a partner's page joins, both on the command's screen, each press their own (`lab.clickOn`, `lab.type`), the
  relay's own list read beside the browser's as a page of the origin reads it: a public room opened from the create page,
  listed with its host, name and size, joined from its row (the relay counting two), gone once its host left; a password
  room listed locked and its password nowhere in the list, a wrong one turned away (said, the password asked for again),
  the right one let in where the dialog asks; a private room never listed, joined by its code. Pictures of both pages
  (the create page, the browser, a wrong password, joined, hosting) in `out/rooms/<WxH>`, the relay's log in
  `out/rooms/relay.log`. `--canary` starts the relay with its `faults` (any password let in, private rooms listed), each
  of which must be caught. About a minute after the boot.

- `friends`: co-op's friends end to end (#676, part 2; `node/friends.mjs`, `page/friends.ts`), three games against a
  saves service (`savesService.mjs`, as `cloud` starts it) and a co-op relay of the command's own, each page pointed at
  them by `?saves=` and `?server=` (dev builds alone read them, loopback alone). The command's page is Brannoch and two
  partners' pages Ysolde and Pell, on the command's screen, each signed up with a passkey of its own (a virtual
  authenticator its browser is given), each press their own: a friend code typed and sent, the request shown in the
  asked one's tab with the tab's badge and not a friendship till accepted from its row, then both listing each other
  online; a private room opened with "Friends can see and join it", shown in a friend's list with Join, which takes
  them in; a friend invited from the room's invite list, the invite's toast on their game, its Join taking them in; a
  room opened without the tick shown to friends as in a room, with no Join and no code. Pictures in
  `out/friends/<WxH>` (the tab, a request, a friend in a room, the room's invite list, the invite, the party).
  `--canary` starts the saves service with its faults (`setFriendFaults` in `server/saves/friends.mjs`: a request
  counted as a friendship, a hidden room shown), each of which must be caught. Each picture's text is checked: none
  drawn over other text in a room's cards, the friends' rows or the invite's banner (`page/textOverlap.ts`, from
  Victor's review of #700); the canary lays the cards out as they were before it (a class name run on over the stats'
  labels), which must be found.

- `practice`: casting in the lobby and in the runs it starts, the hero's every skill on a key with a cooldown of a
  second or more (its effect's own `fire` counted) cast, then cast again as soon as he is free (no cast, channel, aim
  or charge under way), from full energy. In the lobby as it shows, and shown again after practice, casting is free:
  both casts must be made (nothing left cooling from practice). In practice (stowed, by the control the screen shows:
  a phone's rail's Practice, or the hint over the arena that Space works), with every panel folded on a screen that
  shows them side by side (not played on one showing one at a time, where folds don't count), in a run started by the
  lobby's start the screen shows, and in a run begun in practice (a co-op guest's, as its host starts: no button of
  a stowed lobby starts one, so `#btn-start` is clicked by script), the second must be refused while the first cools,
  the HUD must count it down on its key, and the cast must spend at least half its energy as the HUD shows it. A run is
  held in its countdown with a dummy before the hero, and left from the pause menu (`lab.clickOn`: scrolled to, as a
  phone's has its Abandon below the screen's edge). On main the run begun in practice kept the lobby's free casting
  through it: every skill cast twice, no countdown, no energy spent. `--canary` plays that run again with free casting
  planted, which must be caught. Run with `--screen 832x384@3.75` for a phone's (the rail's controls).
- `spawns`: the foes coming in. Boss waves (the 5th, 10th, 15th and 20th in turn, `--waves 32` in each biome,
  `--biomes`) are set off one after another, each from a seed of its own (every set-up seeds the same numbers, which
  would roll the same gates), the hero at the arena's middle (`--at`). Every foe is read as it rises: the gate it
  came by, how far into the arena and to the side of the gate's middle, and its room from the props and the edge. The
  first group is left standing, each of its foes timed as it comes within its reach of the hero (its range and his
  body, as the AI strikes within), as the boss's time is reckoned from it; a later group is taken out once its last
  foe has risen, and the next called at once. The boss's summons are held off (they rise round it, not by a gate).
  The report says each gate's share of the foes, how many groups came by one, two, three and four gates and the
  packs' sizes (a number of gates no group came by, though enough had foes for it, is a problem, as is a gate sent
  under half its share), the waves that left a gate idle though their packs were enough for all four, the spots and
  the least room, the gates the bosses came by, whether each boss rose after its
  wave's first group and when against that group reaching the hero, and from each gate the first boss's walk to the
  hero (how long from its rise it took to come within its slam's reach). Each of those is a problem when it's wrong,
  as is a foe risen inside a prop or a boss outside its time (`bossJitter` either way, and 1.5 s for the game's
  estimate, a straight walk at each foe's wave's pace). Then waves 1, 5 and 10 are played at the game's own pace, each
  foe taken out as it reaches the hero, as a player killing each one as it comes: when each group came, its foes, and
  when the wave was over (the same seed needn't give main the same foes, as the waves before leave the clock
  elsewhere). On main each group came by two gates picked at random, often one twice, every boss in the first group
  by one gate, and by the Thornwood's west gate foes rose in a log. `--canary`, in the first biome: every foe read
  again moved onto one gate, the first half into a prop, and waves of their own with the boss put first, come late
  and frozen where it rose.
- `cast <skill>`: a skill cast as the player casts it, its light, its flashes and what lit them: in full in [`commands/cast.md`](commands/cast.md).
- `trail`: the trail a swung weapon leaves (`page/trail.ts`, `fx/swingTrail.ts`; `--class warrior`). Each strike
  (`--strikes skill@style,...`: every warrior strike and Rending Cleave with every weapon style by default) is cast
  in each view (`--views`) in the crypt (`--biome`), and every frame from the press until his weapons are still again
  is drawn twice, with the trail and without it (its meshes hidden), both without bloom (`holdBloom` in
  `core/renderer.ts`: from the top-down view, where the trail is a few pixels wide, the glow round its newest end was a
  hundred across, and read as trail off the blade's path), so the pixels it lit are told apart (`page/sweptArea.ts`).
  Where it may be is where his weapons swept over the last 0.15 s: each frame every weapon in his hands is placed from
  its grip to its far end, read off its own meshes and not the trail's points, in his own frame (as the trail is
  kept), and each gap between two frames is cut into steps along the curve through its places round it (joined by
  straight lines, a blade swung round the eyes 80 degrees a frame was placed half a metre inside its arc), and drawn on
  the screen as the camera drawing his arms sees them now, with a margin round them. Problems: more than 5% of the
  trail's light outside that; a blow (frames moving at 12 m/s and 0.4 of the strike's fastest, three or more, a
  weapon's far end in the frame) lighting less than 0.02% of the screen; the lit pixel nearest a blade swung at a
  blow's speed in the frame further from it than the margin (the median through the blows); the newest column of the
  trail's own geometry over 3 cm from the weapon through a blow; and pixels lit before the press or while the weapons
  have been still (under 3 m/s) for longer than the window. Each strike's frame its trail lit most is pictured into
  `out/trail`: as the player saw it, its trail's pixels (white where the weapons swept, red outside, where they swept
  tinted blue) and those close up. `--frames` lists every frame (the weapons' speed, the pixels lit and outside, the
  newest column against the weapon); through the eyes, Steel Tempest's blade was put back 53 cm in a frame as it ended
  and the trail drew that as a slash across the top of the view, now a place is as fast as the slower of the moves
  into it and on from it. `--canary` plants three faults in the first strike: the trail lasting a second (lit away
  from the last 0.15 s and while still), never lit, and through the eyes drawn by the world's camera instead of the
  arms' own.
- `health`: the screen as the hero's Health runs low (`page/health.ts`). Standing in each biome, view and facing
  (`--biomes`, `--views`, `--facings`), his Health is held at shares of his most (`--shares`, 1 down to 0) and at
  each the frame is drawn three times at the same moment: without the low-Health look twice (the pixels that differ
  between those two are unsteady, the forest through the eyes shimmering a level every other frame, and left out),
  then with it (`light.ts`'s `drawFrame`, read back from the canvas). Reported for each share: the look's strength,
  the share of the pixels it changed, the colour it drained (off the blood), the blood's cover of the screen and of
  its middle third, and how far in from the edges it reaches (the furthest blood pixel and where). A frame changed
  above where the look starts, blood in the view's middle, a lower Health that drains or covers less, and a look
  too faint with nothing left are problems. `--pictures` (on by default) pictures the frames under the share the
  look starts at into `out/health`; `--canary` draws the look with the Health whole and drives its blood into the
  middle.
- `staffs`: the mage's staffs by school (`page/staffs.ts`, `--class mage`, #402), what nothing else measures of
  them. The lightning staff's Stormcall is tapped and charged to full at five foes held frozen from its strike's
  middle outwards (the middle, 2 m and 3.6 m to the side, 6.5 m beyond its reach, an elite 1.4 m off), each
  cast's charge read as the skill is given it: a tap must strike the middle alone for the skill's `least` of a
  full charge's damage, a full charge every foe inside its radius and none beyond, the near one for less than
  the middle, each landing at least 6 frames after the key is let go (its arc travels first), the middle dazed
  for the skill's time, the near for less, the elite not at all. The fire staff's burn is set on a training
  dummy (`igniteEnemy`): its bites counted against the burn's time over `BURN_TICK`, their size against its
  pace, and the dummy alight for the burn's time and no longer. The healing beam's choice is asked with
  stand-in allies in the room for a call (`threadTarget`: one in the cone, the nearer the aim of two, one 40
  degrees off, one past his reach, a fallen one, none), then held on the hero himself with his Health kept at
  30%: every frame must heal, at the pace its tooltip states with his regeneration, the beam drawn while held
  and gone after. Void Lance is cast with a staff, and with none from its first key, its second and both
  together, at a foe held in its line: a strand from every finger of the hands casting it and none from the
  other's, each hand's damage and Energy a second a staff's, both hands' 1.5 times one's. Then the charge mark (`src/ui/chargeMark.ts`) in the top-down view and third person: none for
  a tap, the cursor's fill or the ring's arc within 0.03 of the charge while held, the browser's cursor put
  away under the drawn one, both gone once let go, pictured as the player sees it (`out/staffs`); `--class
  ranger`, or any class without schools, runs that part alone on its own drawn shot. The hero faces the arena's
  middle unless `--facing` says: from the lab's spot facing out, 7 m ahead is past the wall, and foes stood
  there were moved back inside, 4 m off the strike (a training dummy is moved off its spot too, and is never
  dazed: the strike's foes are the biome's commonest, frozen). `--canary` makes a tap as strong and wide as a
  full charge, which the first part must catch.
- `blink`: the mage's blink cast as the player casts it (`page/blink.ts`, `--class mage`): the key held over the
  aim and let go, on open ground, past his reach, at a prop's middle, past a prop, out at the arena's edge, up onto
  the dais and at his own feet. Each says where it was aimed, where the preview showed and where he came out, how
  far, in how many frames, how many of them he was hidden and whether a blow tried in each landed (none may, and one
  just after must). Then held through its cooldown (`page/heldCooldown.ts`): pressed with 2.5 s of it left, let go
  while the preview is red (nothing may be cast), pressed again and held until it's green, and let go (it must cast),
  the preview read every frame as it's drawn: red on every frame of the cooldown, its countdown the seconds left
  rounded up (3, 2, 1), green within a quarter of a second once ready; then held short of energy (red, no countdown,
  nothing cast). Then foes stood near where he vanished and further off: how long each was dazed, its speed
  while dazed and after, and the stars over it. A landing off its preview, past his reach or in a prop, a blow
  landed while he crossed, a near foe moving while dazed or never coming on again and a far one dazed or stopping
  are problems. `--pictures` (on by default) pictures the held preview, his coming apart, the crossing, his forming
  again, the preview counting down and the dazed foes into `out/blink`; `--canary` reads the preview a metre off,
  takes the guard off as he comes apart, reads it green with no countdown on its cooldown and clears a near foe's
  daze at once.
- `death`: each skill's kills followed as they fall (`page/death.ts`). `--skills` names them by key, behaviour or
  name; by default every skill of the hero's that deals damage (Thunder Crescent needs `--gear twoHanded`, Twin Fangs
  `--gear dual`). The biome's commonest foe is stood dazed where each skill strikes (`STANDS`), and the skill is cast
  twice, each on a fresh set-up: first at foes a hair from death (1 Health: thrown hard), then at foes holding 80% of
  what the first cast's killing hit dealt them (thrown softly). Every body is followed as drawn until it has
  dissolved: how hard it was thrown, how far it flew and how high, when it lay still (or began to dissolve: a frozen
  body shatters as it lands), and how far one struck off its middle turned its blow's way over its first 0.2 s (its
  shoulders' heading). These are problems:
  - a drawn part more than 4 cm under the floor (a ball's depth into its own level or a higher one, `depthInFloor`)
    or 6 cm into a prop;
  - the pose more than 10 cm off its points, a bone stretched over 8%, NaN, or a body past the wall;
  - a body lying with its hips over 0.6 of their standing height above what's under it;
  - a body going back at the hero, or against its throw for a skill that strikes from elsewhere (Hailfletch's
    shower, Starfall's crystals); a body going against a sweep's swing;
  - a body struck off its middle turning more than 5° against its blow;
  - a storm's kill not going round it (its path at least twice its way, its hips up a metre);
  - the bodies killed with little to spare thrown as hard;
  - a shader compiled meanwhile.

  `--trace` lists every hard-thrown body frame by frame: each point's clearance as drawn, its pose's error, its
  point's own clearance, a prop touched, and its fastest point (what keeps a body from lying still). `--pictures`
  (on by default) pictures the bodies as the player sees them, and close from the hero's left and from behind, at
  0.15 s, at 0.5 s and lying still, into `out/death`; those stand back to frame every body, and a few centimetres
  of an arm in the floor don't show in them. `--close` pictures each skill's body that lay deepest under the floor
  close up from its left, its right and behind, framed on that part at that frame, its pass cast again as it was
  (with `--ab`, each side's own deepest: a change to the aim fells other bodies). `--canary` puts a body a metre under the floor for a frame,
  throws one back at the hero, and turns the first struck off its middle the other way.
- `heard <skills>`: the sounds each skill plays as its key is held (`page/heard.ts`): foes stand where it strikes and
  it's cast at them as `hits` casts it (`castAt`), its key held as a player holds it (`cast.ts` `holdFor`: a drawn
  shot to full and a moment more, a channel 3 s) or for `--hold s`, and followed for its cast time, its effect's own
  time and 2 s more. Every sound the game asks for (`sfx` in `src/core/audio.ts`) is caught as it's asked for: its
  name, what it was given, when from the press (a row of more than four as its count and span), and for a held sound
  (one that returns its stop: a bow's creak, a beam) when it was stopped. A skill that plays nothing, a held sound
  never stopped and a sound the skill is known to play that never came (`EXPECTED`, the ranger's) are problems.
  `--biome crypt|forest` stands him in a biome (an arrow glances off the crypt's stone floor and sticks in the
  forest's earth); `--awake` leaves the foes awake once they've risen, so they come at the hero, or at his lure and
  strike it (`heard strawman --awake`: the Strawman's blows must be heard). `--canary` starts a bow's creak in each cast and never stops it, which must be caught. It says which sounds play
  and when; what each sounds like is `sound`'s (`heard nockShot,fanShot,piercingShot,arrowRain,quarryMark,strawman
  --class ranger`).
- `hits <skills>`: each skill's blows as they land (`page/hits.ts`): foes stand dazed where it strikes (`death`'s
  stands), living past every blow, and it's cast at them on a fresh set-up as the player casts it (`cast.ts`
  `holdFor`). Where the set-up's props stand in the 9 m before him (the crypt's columns are rolled with each run) and
  `--at` doesn't say where he stands, he's set up again at the nearest lane clear of them (`page/lanes.ts`, `rush`'s
  too): at the lab's spot a column stood between him and the foes in some runs, and the log's bolts struck nothing
  (`log --class mage`). Every hit is caught as it lands, a blow being the hits within a frame of each other (one cut
  striking three foes): each blow's time from the press, the gaps between them, when the hero was free again and the
  damage a second till then. Striking nothing, a gap past `--apart s`, and blows no quicker than `--than`'s (held down
  1.2 s for a row of its blows: the basic attack, `cleave`) are problems. `--canary` strikes a blow of its own 1 s
  after the first (with `--apart` or `--than`), or else keeps the foes from harm. In `check` as `hits twinFangs --than
  cleave --apart 0.2 --gear dual`: Twin Fangs' two cuts came 0.35 s apart, slower than a dual wielder's cleave at 0.30
  (the owner's "too slow", "both hits in a rapid succession"); they're 0.15 s apart now. Its cast (`castAt`, each
  hit's type, crit and kill caught too, a canary's plant tried each frame, followed on for `lasting` s from the press
  for an effect that strikes on after the hero is free: a firestorm's ticks) is `log`'s and `tooltips`'.
- `log`: the battle log (`src/ui/battleLog.ts`) held to the hits as they land (`page/log.ts`). Each skill the hero can
  use (`--skills` for fewer), in each way of holding weapons for the warrior (`--gear` for one), is cast at foes as
  `hits` casts it, with the log cleared first, and the basic attack once more at foes it kills. Every hit caught as
  the foe takes it must be listed once and in turn: under the skill cast, on the foe it struck (its name and id), for
  what it dealt, of its type, a crit and a kill as they were; and the panel must show every line of the log, each
  row saying what its line says. Then foes of each way of attacking (three Hollow Husks striking at once, a Rift
  Witch's bolt, a Cinder Brute's slam) come at the hero for two blows each, every one listed under the foe's name and
  attack, for the life it took and what his armor, shield and ward stopped. Each row must name the hero alone on his
  side of its arrow and count no more of a foe on theirs than there were: three Mossbacks' blows on one line read
  "Mossback strike ▸ You ×3", the hero counted in their place, and no check said so (`--ab` on that commit fails
  it). Paused from its panel's button, the log must list none of the basic attack's hits, its head saying it's
  paused, and list them again once it goes on. Each cast's lines are listed as the panel shows them. `--canary`
  strikes a hit at each cast's press under a misnamed skill and a blow on the hero from no foe, counts the hero in
  the panel's first row, and lets the pause go at the press. Every hero in
  `check`, 4 to 15 s each. (The owner, testing #255: a Bull Rush cast over a charging Power Strike seemed to deal
  the lobby's dummies nothing; it had hit, its number shown a moment after Power Strike's, and was missed.) The game's
  module is found through `page/battleLog.ts` (none on an A/B's older commit: `no battle log in this tree`). The
  ways of holding weapons a class has, each as a set-up's gear, are `page/gears.ts`, `tooltips`' too.
- `tooltips`: each damage skill's tooltip held to the hits it deals (`page/tooltips.ts`, `src/ui/skillDamage.ts`,
  each skill's `hits` in `src/combat/skills`). The hero is given modifiers of every kind, his stats set (40% all
  damage, 30% arcane, 25% elemental, a 35% crit for 70% more, 20% casting speed), so a tooltip leaving one out is
  caught. First the hotbar's tooltip is hovered, the weapon's all damage raised by 30%, the hero's stats made again
  from his gear (`recomputeStats`) and hovered again: each figure must follow, by the measure's own rule. Then each
  skill he can use (`--skills` for fewer), in each way of holding weapons his class has (`--gear` for one), has its
  tooltip read as the player reads it (its text: each kind of hit's range, how often it comes, the least share it
  says a hit falls to, the crit's chance and share), and is cast at foes stood where it strikes as `hits` casts it
  (a drawn shot at full draw; a firestorm followed for as long as it lasts). Every hit that lands must be within a
  figure stated per hit (a crit's raised by the crit's share; down to its least share, and one hit at its full
  figure), and a hit dealt over time must come as often as it says (on the foe struck most, past its first three
  hits: a spin comes up to speed). Stating no damage, landing no hit, and a crit's chance not the hero's are
  problems. Last, each skill whose tooltip states what it gives the hero (the draught's Health, Iron Bellow's ward, the
  Hedgeward's wall's life, `tt-wall`, read off the wall raised through `page/hedgeward.ts`)
  is cast: what it gave must be the figure (the amounts asked of `Player.heal`, before his most Health caps them; the
  ward's). `--canary` raises all damage and his most Health by 50% once each tooltip is read, as a tooltip behind a
  change would be: its hits must be found above what it states, and what was given off it. On `--ab` against a
  commit before it, every tooltip states no damage.
  A skill whose damage a way of holding the weapons tunes (`styles`: Bull Rush's shield, #398; Rending Cleave's
  two-hander and blades) must state, held that way, the one-hander's figure times its tuning's share of its own
  damage (each figure whole: half a point each way); `--canary` also drops the shield's tuning from the skill the
  hero knows as he holds a shield, as a bonus lost would be, which must be found short.
  (Issue #256: the tooltips showed the base damage alone, not what the hero deals with his gear.)
- `spin`: mouse look turned one way for 240 frames in each close view (`--views third,first`), then the other way,
  24 px a frame, the pointer locked as the player's click takes it (`page/spin.ts`; `src/core/input.ts` `lookMove`).
  Chrome on Windows sends a move of its own under the lock now and then, about half the window across in one event,
  as it puts its hidden cursor back: taken as the hand's, it turned the view by about 180 degrees at once, and back
  again spun the other way (#318, from play: "the jump will happen if rotating to one side for the while"). Mid-spin
  that move is sent as Chrome sends it, and no frame may turn the view past three times the spin's steady turn
  (main: 141 degrees in a frame, each way in each view). `--canary` sends that move twice running (the second, the size
  of the one before, is taken as the hand's): the view turns round in a frame, which must be found each way in each
  view.
- `pace`: the hero walking on a screen whose browser times its frames on another screen's ticks (`page/pace.ts`;
  `src/core/framePace.ts`, #552). Chrome on Windows gave a window on a 60 Hz monitor beside a 145 Hz one its frames
  on the 145 Hz ticks, 13.8 and 20.7 ms in turn, while the screen showed each for 16.7 (traces T9NG-CZ79, GYKX-N2GP,
  0HSJ-60QV): stepped by those, the hero went a half further in one shown frame than the next. Each scenario
  (`--scenarios even,ticked,moved`) sets up afresh and walks him (`w`) 180 frames a screen, the lab's clock handing
  each frame the time its browser would (the screen's refresh rounded up to the next tick, on the clock's grid):
  `even` an even 60, `ticked` the 60 Hz screen on 145 Hz ticks, `moved` a 144 Hz screen and then the window moved to
  the 60 Hz one (`lab.showOn`, 2560x1440 to 1920x1080). After 40 frames a screen, his pace in each shown frame (how
  far he went over the time it was shown) is judged by its jerk: how far it stands off the mean of the frames either
  side of it, a share of the steady pace, at most 6%. A judder flips frame to frame; his own stride
  (`entities/movement.ts`) changes his pace over many frames, and judged against the median it read as a 7% judder at
  an even 60. The game's step (`G.dt`) over the time shown is reported beside it (its stray from the median), he must
  walk 2 m, and the game's time must keep the frames' clock within a 60th. `--canary` walks the ticked screen with the
  frames stepped as they come (`window.__holdFramePace`, which a dev build's `framePace.ts` sets: the page's own
  import of the module is another copy than the game's, and a hold set on it held nothing); a commit without it (main
  before #552) says so and runs the scenarios alone, which are the canary there. Its judder must be found. On
  2026-11-14, against main (e575a9b): main's `ticked` and `moved` jerk 50.0% (the step strays 50.0%) and fail; this
  tree's 3.2% (the step 2.9% and 3.7%, the game's time 2.89 and 2.08 ms off the clock); `even` 2.5% on both (his
  stride), the canary 50.0%, caught.
- `nearaim`: the hero's aim as a foe stands under the crosshair near him (`page/nearAim.ts`; `src/core/input.ts`
  `aimAlong`, `AIM.near`). In each close view (`--views third,first`) a training dummy is stood under the
  crosshair's ray from abreast of the hero to 7 m ahead of him the way the camera looks, a set-up each, and the
  aim's way from the hero is held within 10 degrees of the camera's, the dummy still the foe aimed at (`input.foe`);
  a view that met it at fewer than 3 depths, or none within 1.5 m, measured nothing. The hero aims from his own
  place at the crosshair's point and the camera stands behind and beside him: on a foe hugging him the point was
  beside him, and his aim wheeled 75 degrees to it and back as its paw crossed the crosshair (#482: Void Lance's
  whole beam with it, 4 flashes a second in `cast`). `--canary` takes the aim's least distance off (`--tune
  aim.near=0`), which third person must show (46 degrees at 0.5 m).
- `cursor`: the cursor drawn over mouse look while Alt is held (`src/ui/altCursor.ts`, `page/cursor.ts`). In each And the cursor's layer: every element of the page whose z-index is the cursor's or more, shown or not, is a problem (the loading screen and the turn-your-phone cover aside): it would be drawn over the cursor, as a notice at the window's top once was; `--canary` plants such a layer too.
  close view (`--views third,first`) the battle log is filled past its height and the pointer is locked as the
  player's click takes it: the lab's browser plays the lock (`lab.pointerLock`, `noCapture` in `node/browser.mjs`),
  so while it's held every event of the mouse goes to the game's canvas, as Chrome sends it, and a click on the HUD
  lands there. The mouse moved with nothing held must turn the view (else the command stops: no mouse look to
  measure). Then Alt is held, by the keyboard and in the game's frames: the mouse moved onto the log's Pause must
  leave the view still and draw the cursor there (within 1.5 px: the mouse's events come in whole px) and lit, as the
  page's cursor is over a button; its click must pause the log and not attack (the basic attack's key not pressed in
  the game); over the hotbar's first slot its tooltip must show, and go as the cursor leaves; the wheel over the
  log's lines must scroll them, and the game must take none of it as a zoom; a click on the world must not attack.
  Alt let go, the cursor must be gone and the mouse turn the view again, and a click on the world must attack (else
  the command stops: no attack to see). The lock must be held, and the run going on, through every frame. `--canary`
  holds Ctrl instead, a key that frees nothing: the view turning and the click on Pause landing on the world must be
  found. On `origin/main` the view turned 1.62 rad as the mouse went to Pause, no cursor was drawn, the click
  attacked and the wheel zoomed. (The owner: "in 3rd and 1st person user cannot press on those battle log buttons".)
  About 2 s.
  Then Esc and the pause menu (`page/pauseEsc.ts`, #554: "pressing Esc to close the pause menu sometimes opens it
  again, or leaves it open"; `--parts alt,esc`, either alone). Esc is pressed in sequences, 2 or 3 presses 1, 2, 6
  or 30 frames apart, and held 40 frames with the keyboard's repeats (`lab.keyRepeat`), as each browser hands it
  over with the lock held, the page playing the browser's part: `windowed` (Chrome in a window: the lock let go by
  the browser, `lab.browserLetsGoOfLock`, the keydown kept, its keyup and repeats handed over), `keyboardLock` (full
  screen with Esc locked: the keydown handed over, the lock kept, and with the browser's answers to the game's own
  letting go held 3 frames, `lab.lockAnswersLate`), `both` (the lock let go and the keydown handed over too) and
  `fullScreen` (the lock let go and full screen left, its change heard 1 frame and 30 frames late). Each press must
  toggle the menu once, and nothing change it in the second after the last, in a run in each close view and
  top-down, and in the lobby over the shoulder. `--canary` reads Esc as the game did before (`readEscAsBefore` in
  `src/core/input.ts`): the doubles must be found. As before the fix the run's third view toggled 13 of 23 sequences:
  a second press within 300 ms of a lost lock dropped, the game's own letting go answered late reopening the menu, a
  repeat read as a press, and a frame between the browser clearing the lock and telling the page taking the lock
  back, its Esc never pausing; all 23 now. About 40 s a view.
- `rush`: the foes Bull Rush sweeps up: in full in [`commands/rush.md`](commands/rush.md).
- `evade`: the shooters getting out of the hero's attacks (`page/evade.ts`, `--class ranger`, `mage`, `warrior`):
  each foe that evades (`EnemyDef.evade`: the Sporecaller ducks into the ground, the Rift Witch blinks away) stood
  7 m before the hero, held to its spot (or where it blinked to: left to its AI, it walked back into a rain of
  arrows), kept from shooting and from dying, and each attack of his it evades (`--skills`; by default every one of
  his that one does: Nockshot, Briarflight, Lancewood Shot, Hailfletch, Splintering Bolt, Void Lance, Starfall,
  Thunder Crescent, Bull Rush) cast at it try after try as the player casts it, over the shoulder by default (from
  above, the aim met a cap's or a hood's rim first, and a swaying body let the shot graze past): `--tries` from in
  front of it (30 by default), a third as many from behind it (it faces away), and for a ducking foe and a drawn shot
  as many at its feet (ducked as the shot is loosed, the shot aimed at what's left of it). Each try's evade is
  caught as it's played (`Enemy.evade`) and each hit as it lands. From in front, an evaded share outside 0.3 to 0.7
  (its `chance`, 0.5), a try struck after it evaded, and one missed without it (the try measured nothing) are
  problems, and so is a blink out of its reach, into a prop, by the wall or the hero, or through a prop, judged as it
  goes (Thunder Crescent breaks the props in its way); from behind, any evade; at its feet, a shot that missed.
  `--trace` lists each try: its evade and where to, its hits, where the hero's aim was as he let go and where each
  shot ended against the foe's feet and top. `--canary` lets the foes see all round them and duck without going
  down, which the tries from behind and the struck ducks must catch. The lab's frames draw nothing, so it places the
  foe's meshes itself each frame (`updateMatrixWorld`): unplaced, a ducked foe's body was met standing. It found a
  five-arrow volley judged arrow by arrow (a foe got out of 30 of 30 volleys: now a cast's shots are judged as one),
  a Lancewood Shot meeting a duck half down (it crosses 7 m in five frames: now a duck counts as down at once) and
  going into the ground through a ducked foe's cap untouched, and an arrow at a ducked Sporecaller's cap flying
  through it (its skinned body is met by its hulls, which leave the cap's top out). About 3 min for the ranger, 1 for
  the mage, 20 s for the warrior.
- `twins`: the Ossuary Twins and their belt skulls: in full in [`commands/twins.md`](commands/twins.md).
- `throws`: what the slammers throw at a hero too far off to slam (`page/throws.ts`; `EnemyDef.throws`,
  `src/entities/throws.ts`), a throw a case, each thrower risen 12 m before the hero along the screen's W, pinned to
  its spot before every frame (it turns and throws as its AI has it, but never walks up) and its cooldown held out
  after its throw. The Cinder Brute's lava: at him stood still, the chunk must land within 0.25 m of where he stood as
  it left the hand, its ring (`Thrown.ring`) on the floor every frame it flies and within 5 cm of where it lands, its
  splash hurt him as it lands and its pool burn him at least twice after; stepped off as it's thrown (D for a
  second), nothing may hurt him; up close (2.5 m) it must slam and throw nothing. The Barkhide Hulk's vine: at him
  stood still and walking (D) from the moment it holds him, it must hold him for its hold (90 frames, 3 frames
  either way), his walking moving him under 0.1 m, and let him walk on after (0.5 m in the frames left); stepped
  aside as it's sent, it must never hold him; stepped aside as it's sent (D for half a second) and back onto it
  once it lies there (A from frame 80), it must hold him, and not before; held, a dash of his (Bull Rush,
  Veilstep: `--class warrior` or `mage`; the ranger has none, and says so) pressed 20 frames in and let go after
  its own hold must free him within 3 frames of its start and carry him a metre (aimed 6 m to the screen's left:
  to its right a prop 2 m off cut Veilstep short).
  The hurts are counted at `Player.takeDamage`, the hold by `Player.rooted`. `--canary` plants a splash of 6 m (the
  step off is hurt), a vine catching 4 m off its line (the step aside is held) and a dash that leaves the hold on
  (still held after it), each a problem unless caught. `--trace` lists the frames. About 5 s with `lab:serve` up.
  Held, an arrow of his (`--class ranger`: Nockshot, drawn as the vine is sent and aimed at the floor 2.5 m along it
  towards the Hulk) must cut it: let go within 15 frames of the loose, its vine gone (from play: "arrows should kill
  the Hulk's rooting vine in one hit"; main held him 47 frames after it). `--canary` makes arrows cut nothing too.
- `hedgeward`: the ranger's Hedgeward (`page/hedgeward.ts`; `src/combat/skills/hedgeward.ts`, `src/world/wards.ts`,
  `src/world/destructible.ts`), `--class ranger`, its key held 12 frames over a point and let go, each case on a way
  round the hero with room for the wall and a line out past it to 14 m (the first of 16 ways from the camera's ahead).
  It's an ordinary breakable prop, and each case reads it as one. Debris (first, in the village's training yard, `page/hedgewardDebris.ts`): raised from the yard's spot and broken, then every frame for 8 s its rubble read off the pools (each axis's length from a piece's matrix: a piece shrunk away is a matrix of no size, which three's `decompose` calls 1): at most 16 pieces, none thicker than a stake (15 cm) or longer (2 m), none resting over 2.5 m from its line, all gone within 6 s; the renderer silent meanwhile and nothing newly left undrawn by the engine; the frame's draws standing and with its pieces down; pictured as the player sees it at 0, 0.17, 0.67, 2 and 5 s; its canary takes its own break away (`BREAKS.sticks`). Placed: aimed 3 m out (its reach), its line within 0.12 m of the
  aim (its line stands 0.08 m out from its foot), within 0.02 of square across his line to the aim, its front (+z of
  its look) away from him, its body in the arena's obstacles. Bolts: the biome's boss risen 12 m out past it, pinned
  and its cooldown held out, fires the game's own bolt (enemyAI's `fx('bolt')`) at him over it, three, one at a time:
  each flies over it or meets it, said, and one that meets it must wear it (a foe's bolt on a prop). Round: the wall
  aimed 2.5 m out, the hero stood still 0.75 m behind its line and a Husk risen pressed against its far side, a way
  round open: it must go round one of its ends and reach him, never strike him over it, and never be pushed more than
  0.08 m into its body. Walled: four walls raised round him 2.2 m out (no limit), their ends meeting, him held still,
  and a Husk risen 5.5 m out: within 900 frames it must break one with its blows (no way round left), and never strike
  him over a wall still standing.
  Arrows: the wall aimed 3 m out and Nockshot loosed at points across its width and up its face, one after another:
  each must wear it, and it must break. Played: the wall aimed 3 m out, him stood 3, 6 and 10 m before it and 6 m
  aside (43°), Nockshot let go just past its least draw and at full draw at six points on it (its middle 0.15, 0.5 and
  0.85 m up, its ends 0.15 m and one 0.5 m up), its life set back before each: every arrow that ends at it must wear
  it (from Victor's review of #647, "Sometimes arrow can fly through without dealing damage, I get it more than half
  the time": from above the cursor finds the earth at its foot through the gaps between its stakes, and an arrow aimed
  there put its point in the ground before its middle met the wall; 48 arrows, about 110 s). Slammed: a slam of 80 (`fx('slam')`) on its middle must wear it. Trampled: a Brute (the forest's Bark
  Hulk) risen 5 m beyond it, its throws held out, must break it walking at him within 600 frames. Stays: still standing
  30 s after it rose (it has no time of its own); struck down to none it goes at once, its circles with it; four
  raised round him, a way each, must all stand (no limit); then the wave cleared (`waveCleared`), none may stand and their looks go within 90 frames. Reach: aimed
  6 m past its range it must rise within it (3 m); aimed onto a training dummy it must rise before it, clear of its body;
  with a 3 m prop planted 1.2 m before him (nowhere clear) it must not rise, its outline red, no energy spent. Arrow:
  the wall aimed 3 m out and a training dummy 5 m past it, Nockshot drawn 70 frames at the dummy's chest and let go:
  the arrow must fly at least 0.75 m past the wall's line. `--canary` makes its body a tall prop's for the arrow (a
  shot strikes it), takes its circles out of the obstacles for the round (the husk pushed into it), makes its body
  no breakable prop's for the trample and the walled in (nothing wears it), and plays `played` twice, the wall met as
  drawn alone (through the gaps between its stakes) and the props met by an arrow's middle after its flight (its point
  in the ground first), each a problem unless caught. `--cases` runs some of the cases alone (`--cases played`).
  `--pictures` writes `out/hedgeward`: a husk going round its end, him boxed in and a husk broken through, the wall
  standing, worn half way with arrows standing in it and broken by them, a Brute coming
  up to it and walked through it; the wall alone from its front (the foes' side), three-quarter, side, back, above and
  in plan, him hidden; and in the forest and the crypt from the top-down and over-the-shoulder views its preview held,
  it standing, and a blow just struck on it with its gauge (`lab.screen`, the page's UI over it). The cases aim with
  the mouse from above: run it in the default view, as `--view third` aims elsewhere.
- `crowd`: a crowd of foes killed at once (`page/crowd.ts`), and what the frame costs as their bodies fall: the low-end
  device's measure. `--count` sets the crowd (38 by default, the most a wave keeps alive); it's killed by a blow each
  from the hero, or by `--skill` cast at it. Each round sets the crowd up afresh, times 60 frames with it standing,
  kills it, and times every frame until its bodies are gone, with the game drawn and waited out on the GPU (`finish`:
  what the GPU draws runs behind the page, and the page's time alone left out what the bodies' smoke and embers cost
  it), every time taken by the browser's own clock: the frame, its draw calls, the particles alive, the deaths
  (`Enemy.die`), the bodies (`Corpse.update`) and, of those, the ragdolls' steps and poses (`timeCalls`' laps).
  There's a round for each CPU slowdown (`--throttles`, by default 1,4,6: as it is, then DevTools' mid-range and
  low-end phones; `lab.throttle`) at each frame rate (`--rates`, 60,30: a device already slow steps each body twice
  as far a frame). Two things are problems, each judged against the
  frame with the crowd standing so it holds on any machine:
  - the frame as the crowd fell more than 15% slower (its 90th percentile);
  - the bodies' part over 20% of the standing frame.

  `--canary` runs the first round again with each body made 0.1 ms slower a frame, which must show. The machine's load
  drifts, so compare rounds within one run. Drawn mesh by mesh, a foe was about 77 draw calls (#222); in its kind's
  crowd (`src/entities/models/crowd.ts`) the 38 are about 20, and the frame standing went from 20 ms to 6 to 9 on a
  desktop.
- `draws`: one frame's draw calls (`page/draws.ts`), the crowd `crowd` times standing before the hero (`--count`, 38
  by default; 0 for none) in the biome (`--biome`; the crypt's top view is 368k triangles, 13% of them outside the
  view) and view the set-up asks for, each of the renderer's draw calls recorded with
  its pass (the scene's, its shadow map's, the post and overlays after it), its geometry and its material. Its lists
  (`--rows` each, 16 by default): the geometries drawn most often (one drawn many times a frame is one an instanced
  mesh would draw once), the geometries that drew the most triangles (the GPU's vertices: 38 mossbacks are about half
  of a forest frame's 2.5 million), the triangles drawn outside the view of the pass that drew them (an instanced
  mesh's instances, each by its own sphere, beyond the scene's camera or the shadow map's box: three culls an
  instanced mesh only whole, and half the forest's top view was such until `world/culling.ts`), the draws that drew
  nothing, alike ones together, saying why (an instanced mesh of no instances, a range of nothing: the renderer's work
  for a draw each on the CPU, though an instanced mesh of none never reaches the GPU, so the perf overlay's count,
  which counts GL draws, leaves them out; the rubble's empty pools were 46 a frame), and the scene's draws by their
  material's look (draws of one look, a merge of what doesn't move would make one). Its head line says the draws in
  each pass and how many drew nothing, the triangles and how many lay outside the view, the scene's objects whose
  matrices are made again each frame, and how many of them are off the camera's layer (a crowd's bodies' own meshes).
  Through the eyes (`--view first --class warrior`), the arms' own camera's draws are a pass of their own
  (renderer.ts `drawArms`), and what it drew is listed, the hero's and what isn't his. Anything that is neither under the
  hero's model nor his weapons' trail (`fx/swingTrail.ts` `swingTrailsOf`) is a problem, drawn over the frame at the
  arms' narrower view. The crowds' bodies' own meshes shared the arms'
  layer, and 38 mossbacks were 656 draws of it a frame (`core/layers.ts` now). `--canary` stands seven boxes of one
  geometry before the hero, which must come out as seven draws of it, seven instanced boxes, four far behind the
  camera, which must come out as four outside the view, and an instanced mesh of none, which must come out as a draw
  of nothing. Through the eyes it also stands a box on the arms' layer before them, which must come out as drawn by
  their camera, not the hero's.
- `cloud --google`: Google sign-in transport alone (`node/googleWindow.mjs`): clicks real Sign in controls,
  returns through `public/google-signin.html` in another window, checks the game/URL survive and the original
  nonce finishes once, then linking, Cancel and blocked-window redirect. All OAuth/saves replies are local fixtures;
  this does not contact Google. The waiting dialog is checked at five required sizes (pictures in `out/cloud`,
  `--pictures=false` skips them). A changed session discards a late answer. `--canary` returns an invalid landing
  code and must never redeem it.
  Fullscreen is played by a spy: the game must exit before opening and restore on every completion/cancel/error,
  retry a refused restore on the next gesture, and leave an initially windowed game windowed. Native popup close
  dismisses the waiting dialog, even with its address request held unanswered; a provider cancellation adds no
  second cancellation dialog. No native fullscreen or keyboard lock is taken by the fixture.

- `cloud`: cloud saves end to end (#504; `node/cloud.mjs`, `node/cloudDevice.mjs`, `node/savesService.mjs`,
  `page/cloud.ts`). Two devices: the side's page (A) and a partner's in a context of its own (B), each with a passkey
  on a virtual authenticator of the browser's (the DevTools protocol's `WebAuthn` domain: ctap2, internal, resident
  key, the user verified, presence given), so `navigator.credentials` answers with no system prompt. A saves service
  of the lab's own (`server/saves` `start`, its files in `out/saves-service`, emptied as it starts) takes the page's
  origin alone, as `ORIGINS`, `PRODUCTION` (so its sessions may make sign-in codes) and `RP_IDS` `localhost`;
  each page is pointed at it by `?server=` (set on the page's address after the boot: the game reads it on every
  call). The slots are seeded as the game keeps them (`slotData.ts` `writeSlot`), each hero told apart by the ids of
  his stash's items (tags: `A2-mage`), and a hero's stash added to as play saves it (`saveProfile`, which touches the
  sync). The real screen is driven: the lobby's `#btn-saves`, the bar's New account, Use a sign-in code, Sync now,
  and the dialog's buttons. Scenarios, in order, each building on the one before: `link` (A, slots 1 and 2 filled,
  makes an account and chooses slot 2: slots 1 and 2 swap, and the service's save, read back with A's token, holds
  slot 2's heroes; then the bar's Account dropdown opened, pictured, and closed by a click on the screen's title);
  `download` (B, all three slots full, signs in by A's code, first typed on a phone held sideways: the field tapped,
  then a keyboard over the page's lower 215 css px, its layout unchanged as the owner's in full screen, and one that
  shrinks the viewport to the 175 it leaves, each pictured as `code-typing-keyboard-over` / `-shrinks`: the field
  whole above it and still focused, "cannot see code while typing"; the typing layout switched off, `-over` fails; the dialog names slot 3 as lost while
  B's slots are still as they were; confirmed, slot 1 holds the cloud's heroes, the others shifted, slot 3's gone);
  `conflict` (the mage changed on A and on B while B's link to the service was cut, `context.route` aborting: B,
  back online, is asked, the dialog saying its copy will be lost, keeps the cloud's; then the warrior so on A, whose
  dialog says its copy goes to slot 3, where it then is); `merge` (the warrior changed on A, the mage on B: each
  syncs with no question and both devices and the service end with both changes); `reboot` (#556: the hero B plays
  changed on A while B was closed, B opened again as a returning player opens it on a slow device: its page reloaded
  with its storage kept, `Device.reboot`, cold, the lobby shown with the fight's and the other heroes' programs still
  to warm and none of the frames that warm them run yet; its first sync comes down with A's change, B's play saves its
  hero from memory (`cloudPlay`) before the warm-up ends (`cloudWarmUp`), and B's hero in play, its slot 1 and then the
  service must all hold A's change and B's; on main the lobby said "Readying slot 1", B played and saved the old copy
  over the download, and the next sync put it over A's change in the service). A's code is made by the game's
  own call. Each moment (signed out, choosing, signed in, the Account menu, the code, the download, both conflicts) is
  pictured at 1024x700, 1920x1080, 820x1180 and a phone's 844x390@2 in touch mode (a finger's tap on a title) into
  `out/cloud/<moment>-<screen>.png`, the bar's parts and the dialog's held within the window and over no other
  (`cloudFit`). The browser's logged failures of calls made offline are the scenario's own, taken out of the
  page's errors. Each device turns slow-game reports off as it starts (on a loaded machine its boot counted as slow,
  and the prompt lay over the save slots screen, taking every click). `--canary` plays `link`, `download` and `reboot`
  alone: it drops the mage's stash items from every copy of him B downloads (`download` must fail) and A's change from
  the hero B plays just before its save after the reboot (`reboot` must fail).
  `--pictures=false`: the checks alone. About 2 minutes without `lab:serve` (a boot of 50 s), 1 with it.
- `trace [code]`, `recorder` and `auto`: the performance traces slow games send, read back, what recording them
  costs, and Auto quality's walk down on a slow device: in full in [`commands/traces.md`](commands/traces.md).
- `perf <skills>`: skills cast in turn, every frame timed as the performance report times it, or played as a slow
  device: in full in [`commands/perf.md`](commands/perf.md).
- `programs`: the engine's scene pipelines and what sets them apart (`page/programs.ts`), read from the engine's
  census of them (`PIPELINES_ASKED` in `src/engine/pipelinesAside.ts`, each kept with the descriptor it was asked
  for by): how many of each kind (whole, after the depth, depth first, shadow, sprites), and by each field that sets
  them apart (the shader and its entries, the targets, the depth and whether it's written, the samples, the culling,
  the topology); those never drawn (`lab pipelines` says them step by step); and the performance report's count of
  those first asked for in play (`programsCompiledInGame`, `lateCompiles` in `src/core/shaders.ts`: the engine's
  `PIPELINES.late`, a warm-up behind the lobby left out) against the engine's. The lab's boot asks for 80, 44 of
  them never drawn in the lobby. `--cost` compiles each again on the engine's device, one after another, its shaders'
  code salted (`page/programCost.ts`: the code is kept by a page script of the lab's, `shaderCodes` in
  `node/gpuScripts.mjs`, as the game keeps none), and times it from its shaders made to its pipeline ready: by kind,
  by shader, by samples, the longest. It found the 80 at 21.5 s of the GPU's process's time on this PC, the lit
  shader with hooks' 41 at 13 s; the game compiles them several at once, aside. Its canary is the cache: the
  costliest compiled again with the same salt must come back in under half its time (519 ms, then 1). `--limits`
  holds what the engine's device used of each of WebGPU's limits to what every device gives (`page/programLimits.ts`:
  the spec's defaults; what was used recorded as it's made by `gpuUse` in `node/gpuScripts.mjs`, the textures', the
  buffers', the bind groups' and their layouts', each pipeline layout's by stage, the vertex buffers'). The engine
  asks its adapter for all its own limits (Bulwark's `device_on`), so a desktop makes and draws what a phone's
  device, given the defaults, refuses: #470's palettes, under three, hid the hero on an S25 by a limit of that kind.
  It names a limit used within a tenth of its default (the lit shading's fragment stage: 15 sampled textures of 16)
  and the features asked beyond WebGPU's core (`timestamp-query`). Its canary makes a texture one texel past the
  defaults, which must be found. `--canary` hands the engine a box of a blending, side and depth nothing else has
  together, never shown (it must be listed asked for and never drawn), then shows one of another such blending (it
  must be listed drawn). (Under three this read three's WebGL programs from a ledger of the game's, compiled their
  GLSL again for `--cost`, and held their uniform vectors to WebGL 2's minimums for `--limits`.)
- `compiles`: whether the boot's warm-up asked the engine for every pipeline a fight draws (`page/compiles.ts`). In
  each biome (`--biomes`, both) the hero stands in the view (`--view`, top) and a prop of every kind the biome has is
  worn down (its gauge over it, chips knocked off) and broken in turn, its rubble, debris and smoke drawn as they fly
  and settle; then the run's first wave is set off and fought as the game plays it, the hero (kept whole) casting
  each skill on his bar in turn at the nearest foe, until it's cleared or 40 s are up, its foes killed as a fight
  kills them (no other check lets a foe die of a fight); then a Cinder Brute and a Barkhide Hulk throw at him from
  12 m off towards the arena's middle for 420 frames (out the other way they stood beyond the wall, rose inside it
  6 m off and only slammed), each piece of their throws drawn (the chunk, its ring, burst and pool, the vine and its
  coils: a piece never drawn is a problem, read from the scene by its name); then the first biome's wave is fought
  again by a hero built afresh, as the lobby's class switch builds him. Each round counts from before its set-up,
  whose frames are the game's (the view entered, the hero rebuilt). Every pipeline asked for meanwhile
  (`PIPELINES_ASKED` in `src/engine/pipelinesAside.ts`) is a problem, named as the engine describes it (its shaders'
  entries, its targets, its depth, its samples, its culling): one first asked for in a fight leaves what it draws
  out of the frames till it's compiled, the GPU's process busy with it ("first RMB cast in fight lags 2-3sec"). Run
  it as a phone boots, `--boot low@518400`: Low and Very low draw with the plain levels' own lit pipelines.
  `--gear` and `--weapon` hold the hero's weapons (`--class warrior --view first --gear twoHanded --weapon
  Greataxe`: #268's report). `--switch ranger` first picks the ranger on the hero selection screen, as a player does
  (Change hero clicked, each hero in the hall of heroes shown 150 frames, his showcase and all, and every pipeline
  asked for meanwhile a problem; then the ranger's name and the choice), and waits for him; the boot's class
  (`--class`) is another. A class's skills are warmed with the heroes, not the lobby, so only a switch tells whether
  they were. `--canary` draws a box of a blending, side and depth writing nothing else draws together (added, its
  back faces, its depth written) before the hero, which must come out as asking for a pipeline. (Under three it
  counted three's programs and the point lights each pass lit with, a program compiled for each count: it found
  #243's mid-fight rubble shadow and #268's arms' pass lit by another count. The engine lights by a pool of
  uniforms, its pipelines alike whatever the lights.)
- `maps`: the game's procedural maps (`page/maps.ts`; `--maps forestFloor,steel`, every one `PRELOAD` lists in
  `src/core/pbr.ts` by default), each made on the page as a loading worker makes it, `--runs` times (its time the
  fastest, by the browser's own clock), with a digest of its pixels and of a face's grid. A map made faster must
  keep every pixel: with `--ab` each digest must be main's, the times side by side. A map a surface repeats must
  tile (`page/mapSeams.ts`): each edge (the last column against the first, the last row the first) is read on the
  albedo's brightness and on the height against every two neighbouring lines inside, by its mean step and by the
  share of it that jumps past both neighbours' steps (a slab's shade changing, not its bevelled joint); a seam
  reads past every line inside and twice their median (main's steel, slabs and fur had them). Its means (the
  albedo's brightness, the roughness) show a new look's drift from main's. `--pictures`: each map's albedo and
  height laid twice each way, its corner at its own pixels and its material lit on a square and a ball, a sheet a
  group (`page/mapPictures.ts`). `--canary` changes a byte (its digest must change) and plants a ramp across u in a
  copy (a seam must be found).
- `tiles`: how big each repeated map's tile comes out on each surface of a biome (`page/tiles.ts`; `--biomes`,
  `--maps bark,grunge` by their recipe's name, every repeated map by default). A surface's UVs decide it, with its
  instances' scale and the map's repeat: one tile of the forest's bark ran round a whole trunk and up a section of
  it (ez-tree's UVs), 2.2 m by 1.3 m at a trunk's foot and 9 m along a root, where the oak photo it's drawn from
  covers 0.36 m. For each surface, a mesh by its name (an instanced mesh's first 16 instances, from its drawn copy
  or its shadows' one, whichever holds more), the metres a tile covers along u and along v on each triangle
  (`page/tileSpans.ts`), weighed by its area in the world: the middle and a tenth to nine tenths of the area, how
  stretched it is (the longer over the shorter) and the map's pixels a metre. It reports, as `maps` reports means
  (a map drawn for a stretch is right on its surfaces); it fails where a biome shows no repeated map. `--pictures`
  pictures each surface as the player meets it (`page/tilePictures.ts`): from the arena's middle, at its nearest
  point facing its camera (60 degrees off at most: a boulder's top, seen level, was a smear of streaks) and in view
  from 2 m (a ray from the camera meeting it first, every culled instance packed for the ray, and one back out to
  the camera meeting nothing: a camera inside a plinth saw the stone's underside edge on), a hero's height up, the
  cut-outs and see-through things (ferns, leaf cards, a gate's membrane) left out, a sheet a biome; `--ab` sets them beside another commit's. `--canary` lays a board 2 m by 0.5 m in each biome, its
  map repeated twice along u, which must read 1 m by 0.5 m.
- `winding`: which way the game's faces point, the library's scholar as he sits read as a model (`--models scholar`) (`page/winding.ts`, `page/windingParts.ts`, tested in
  `test/windingParts.test.mjs`; `--models husk,ranger` by id, every one by default; `--biomes`). Every model
  (`MODELS`: the heroes with all they can wear, the foes, the dummy) built afresh and each biome's props, each
  geometry once. Each mesh is split into its parts (triangles joined by a corner, the corners welded by where they
  are: a merged mesh's parts share none) and each part's signed volume read about its middle: a closed part whose
  faces point out encloses a positive volume, one wound inside out a negative one. A part with more than a quarter
  of its edges open, or enclosing under 5% of its box, isn't judged (a card, a cloth, a blade's fuller: a groove
  reads below 0 wound as it is); a mesh drawn by its back faces (the sky) is seen from inside on purpose, and a
  mirrored mesh's winding needs nothing of its own (three turns its front-face test round). A part wound inside out
  on a one-sided material is a problem, listed with its mesh (or its material and colour), its triangles and where
  it is in its model or biome; on a double-sided one it's listed apart (three turns a back face's normal to the
  camera). `--canary` plants a box wound inside out, one sided, in the first biome. Main before #289: 254 parts of
  11 models (every creature's `taperTube`s, the shelf fungi's and caps' lathes, the bow's brass leaf); none since.
- `wall`: how near the hero walks up to the wall (`page/wallGap.ts`; `--biomes`, `--angles 48`). In each biome, at angles round the ring (the gates' openings and those with a prop in the way skipped), he's put 3 m in from the wall's face and walks straight out with the touch stick (`Frame.stick`) until he goes no further out; then rays run out from him at 0.6, 1.1 and 1.6 m, 75° either side of his way, against every surface the biome draws (its culled meshes drawn once unculled first: the lab's frames aren't drawn, and a culled mesh holds only the instances last in view; the grass, the weeds and the pebbles walked through, the thicket's leaves brushed up against), and the nearest, named, is the gap between his body and the wall. More than 20 cm is air between them, under -7 cm his body in it (a banner's hem gives that much); short of the thicket's leaves he may stop 30 cm (their cards are ragged), and in them he may stand up to 8 cm from his middle (leaves give, brushed through; kept off the bushes' outlines, a card hanging low at his thigh came 9 cm from it). A walk that put a joint past its range (the anatomy's warnings it logged, each the first of its kind) is named with them: stopped by the wall in a frame from a run, or sliding to and fro in a corner, his hips went 50 to 100° past their ranges, where an ordinary run's go 10 (`lab gait`). He walks for at most 600 frames: settling into a notch between two bushes took longer than 240. He's stopped once he goes less than 5 mm further out in 10 frames (braked near the wall, he creeps the last centimetres into a corner along a face he met at a slant); a walk that never stops says where he went, every 50 frames. `--canary` reads the first walk's gap a metre short of his stop. Main before the wall was drawn (`world/wall.ts`): he stopped 54 cm to 3.2 m short in the crypt, 14 cm to 2.1 m in the forest.
- `rim`: the hero walked round the wall pressed into it (`page/wallRim.ts`; `--biomes`). In each biome, each way round, he's put 2.5 m in from the wall's line and walks with the touch stick along the ring, turned out into the wall: 40° (pressed in, sliding along its faces and into the gaps between its bushes, rocks and buttresses) and 10° (hugging it, as a player walks along it). A frame he moves more than 20 cm (a run goes about 10) is a jump: the wall threw him. Where he stops (under 5 cm round the ring in 40 frames) he walks back in to the middle, and one that doesn't get 1 m in within 90 frames is stuck; then he's put again a few metres on. Each lap's stops are listed, each with what bounds the floor nearest him there (the mesh, a `wall` or `foliage`, the height it was met at): the crypt's buttresses and gates, the thicket's rocks and bushes jutting in. Kept off each stretch of the line by its side alone, he was thrown up to 1.7 m in a frame 36 times round the two biomes, and stuck once in the forest at 213°; the thicket's rocks and bushes read into that line from the middle, each hid the floor beside and behind it, and pressed in at 40° he stopped 19 to 23 times a lap round the forest, at a square face in the open; kept off their outlines and held from sliding only within 10° of square on, 11 or 12 (hugging it, 4 or 5, as in the crypt). Main's ring at 26.6 m stopped him twice a lap. `--canary` plants a 1 m jump on the first lap and holds its first stop in place: both must be caught.
- `beyond`: the ranger's arrows over the wall (`page/beyond.ts`; `--class ranger`, `--biomes`, `--angles 8`). In each biome, at angles round the ring, he stands 6 m in from the face over the shoulder and looses his basic attack drawn to full, the crosshair on the ground 8 m past the wall and on the nearest tree that way (the forest's, the crypt's dead trees) 1.5 and 5 m up its trunk (from above the aim is the ground under the cursor, and every shot flew low). Each flight is followed till it ends and what it struck has come to rest; every arrow it left standing is judged by the surfaces drawn, not the game's own wall: a ray along it from a metre behind must meet one within 30 cm of its point, and one lying on the floor must have nothing drawn over it (the grass, the weeds and the pebbles aside). An arrow standing in the air or lying inside something is a problem; one that flew on out of the world is listed. `--canary` plants an arrow standing in the air past the wall. Main before #290: 11 of the forest's 18 arrows stood in the air at the wall's line.
- `trees`: the trees in the play area as the ranger's arrows meet them (`page/trees.ts`; `--class ranger`, `--biomes`). In each biome every instance of a tree mesh whose foot stands inside the wall must have a wooden prop's circle at its foot, and an arrow loosed at its trunk 1.2 m up, drawn to full over the shoulder from 7 m off it (towards the middle, or turned round it to a line 0.5 m clear of the other props), must be left standing within 0.7 m of the trunk's line. Then an arrow is stuck in the floor and the arena shows another biome: none may be left; and again as a wave is won (`waveCleared`): every arrow still there half way through its dissolve, none 1.5 s on. `--canary` makes the first tree stone (its arrow glances off) and sticks an arrow again after the switch and after the dissolve: all three must be found. Main: no tree inside either wall, and the floor's arrow stayed through the switch.
- `columns`: the crypt's broken columns as built, roll after roll (`page/columns.ts`; `--seeds`, 1 to 12 by default). For each run's seed the columns are rolled (`G.arena.rollProps`) and each one's mesh welded by its positions: an edge only one triangle uses above the shaft's foot is open, a hole the sky shows through. The break's face inside the flutes (0.3 m of the axis) is read for its steepest triangle, which must stand under 75 degrees (its roughness stands facets to 67). `--canary` takes a triangle out of the first column's break: its open edges must be found. Before the fix every column had 3 open edges and a vertical triangle at its middle: the break's slope, taken round by the angle alone, twisted the face about its middle ("still seeing holes in concrete pillars").
- `shadows`: the hero's shadow cast from fewer triangles (`page/shadows.ts`, `models/shadowDetail.ts`, the engine's `casterGeometry`; `--views`, `--canary`, `--cost`). In each way the hero holds his weapons, in all his armour and in none, and in each view, the frame is drawn with every triangle cast (`castingAsOne.whole`) and with fewer, and compared pixel by pixel; the frame drawn twice is listed beside it (none apart), the pieces cast from fewer counted (the engine's `casters`) and his shadow taken away, which must change the frame. The warrior's read 35 to 333 pixels apart by 7 to 18 levels (top and over the shoulder); more than 4000 or by more than 40 fail. Through the eyes he looks down at the ground away from the sun, where his shadow falls, and his body hidden there must cast too: taken away, it changes 99k to 121k pixels (#893; from #270 it cast none there). There fewer triangles may differ in 5% of his shadow's pixels (0.5% to 3.5% read). `--canary` takes his shadow away in the first case, and through the eyes leaves his hidden body uncast: each must be seen. `--cost` times the frame on the engine's GPU clock in turns (`gpuTurns.ts`), every triangle cast against fewer and his shadow against none: on the 4070 Ti at 2880 by 1800 at 2 neither is told from nothing (0.007 ± 0.010 ms, 0.071 ± 0.101). It compared his pieces cast as one (`castAsOne.ts`) against each alone in three's shadow pass, which the engine never runs: the two drew the same, and its cost timed a shadow map never drawn.
- `weapons`: each of the hero's weapons alone (`page/weapons.ts`; `--weapons Sword,Maul`, the class's bases by
  default): a copy of the one in his right hand, at its own frame (unturned in the fist), put in a plain, lit
  studio of its own and pictured face on (a blade's flat, an axe's bit to the side), edge on, from behind (a face
  wound inside out shows there as a hole), from three-quarters and its head close up, each framed on its own length
  and width, with its size and how many triangles it's drawn with. A weapon is judged here as it's made, before
  it's seen in a hand. Its pictures are read from the drawing buffer and taken as opaque: the game draws its frame
  with an alpha of 0 (`core/hdr.ts` adds it to the page as light), and copied onto a 2D canvas every picture came
  out black; and the lab draws nothing outside its pictures (`Lab.drawing`). A picture with next to nothing of the
  weapon in it is a problem, and `--canary` pictures an empty studio, which must read as nothing drawn. Compare a
  change to a model with `--ab`. The studio, its camera and its pictures are `page/studio.ts`, which `hands` shares.
- `hands`: the hero's right hand alone (`page/hands.ts`): a copy of it on a wrist of its own (`handLike` in
  `models/hands.ts`), in its glove or bare as the hero's is (`--glove`, `=false`: bare), laid flat, open, relaxed,
  strained as a caster's (`strainHand`), in a fist, clenched as the warrior's bare fist (`closeFist`) and closed
  round a sword's grip (`--poses`), from the back, the palm, the thumb's side, the
  little finger's, the fingertips and three-quarters (`--views`), and close up when asked for: `cuffs`, the glove's
  cuffs over the fingers, `web`, the thumb's web (where a bent thumb once pressed the glove into the skin), and `joints`, the fingers'
  knuckles and the bones between them from the little finger's side. Said
  beside it: its length, breadth and thickness against a man's (anatomy's tables: 10.9% of his height, 46% of the
  length, 38% of the breadth) and each finger's length against the middle's, the triangles and meshes it's drawn
  with, how long a side takes to sculpt on the page, and whether both sides were sculpted by workers as the game
  loaded (one sculpted on the page is a problem: it held the boot up). `--look` draws it in a look (wire, faces,
  parts, bones), and `--canary` pictures an empty studio, which must read as nothing drawn, and builds the hand 10%
  larger, which must measure so. On `--ab` against a game whose hands were pieces, the old hand is built again from
  the materials its pieces were made in (`userData.own`). `--views` also takes `caster` (the hand as its owner sees
  it held out, the fingers up the picture) and the close-ups `fingers`, `pads` (the fingers out of the glove from
  the back and from the palm's side) and `thumbtip`; `--wear hands` pictures it gloved. Each finger's middle joint is
  measured against the shafts either side of it on the flat hand (`knobsOf`): under 1.04 as broad the finger is an
  even tube, over 1.16 its joint is swollen (from play: "a hand of 90 year old, with bones problems", read 1.25),
  each a problem. It has no canary yet.
  `--poses clenched` defaults to the warrior and shows his bare fist and the game's wrist wrap unless `--glove`
  is set. The wrap is checked against its 400-triangle, one-mesh budget. The command also casts a
  punch in game and measures both fists after they return to guard. Every fingertip must reach the palm within
  6 mm, adjacent middle phalanges must come within 3 mm, the thumb must lie over the middle shaft within 12 mm,
  and each wrist must bend less than 10 degrees. `--canary` applies the old `hold` + `clench` to the same guard.
- `hood`: the mage's hood against its reference, by numbers: in full in [`commands/hood.md`](commands/hood.md).
- `turnaround`: the hero standing as the game has him (its set-up: `--class`, `--gear`, `--wear`), taken out of the
  world into the studio (`page/turnaround.ts`, `page/studio.ts`) and pictured as a character sheet's turnaround shows
  him: from the front, three-quarters to his right, his right side and his back, framed on his whole figure with what
  he holds, and his head close from the front, his right side, three-quarters to his left and behind (a hood is judged
  all round; from his right front the staff came between), with how many triangles and meshes he's drawn with; `--parts` lists them by part, each joint's meshes of a material,
  most first (`--boot verylow` for a level's: the hands, the head, the coat).
  `--ref <sheet> --panels l,t,r,b;...` cuts a reference sheet's panels (shares of it, one a view in that order; an
  empty one leaves its place empty) and sets them in a row under ours, each fitted whole into a tile the size of ours.
  A hero is rebuilt against such a sheet part by part from the same side (the mage against Codex's realistic render
  of him: in the forest the ferns and the light hid what he wore). `--canary` pictures the studio empty, which must
  read as nothing drawn. Writes `out/turnaround/sheet.png`.
- `herolooks`: each class's looks (`data/heroLooks.ts`, `page/heroLooks.ts`; `--classes`): each made by the workers
  (`readyLook`) and a hero built in it as the hall builds one, its head's pieces all from the workers (`headsMadeHere`
  unmoved), a face, hair where the look has it and a full beard where its face has one, and drawn beside the lobby's
  hero in the game's frame with no program compiled. Each pictured in the studio (his face, three-quarters, behind, his
  figure), and one hero of each class in six hair colours. Black and white hair compared on his face from the front
  with the hair's cards hidden (the brows' band and, where the look has a beard, the beard's: at least 1% of each
  changed by over 12 levels), the cheeks' band left as it is (at most 2%), and his head from behind (the cards: at
  least 5%). A look picked for the lobby's class kept in the stored profile and taken as the slot's look again
  (`chooseLooks`), then put back. `--canary` plants a hair colour that leaves the face's paint and the cards' colour
  alone, and a look taken out of the stored profile: each must be caught. Writes `out/herolooks/sheet.png`.
- `neck`: each hero's neck (`page/neck.ts`; `--classes`, `--dresses bare,chest,hat`, `--poses rest,aside`), cut
  by level planes in the neck joint's frame and read up 72 lines round it (`neckSlices.ts`; what each says against
  its limit, `neckRead.ts`): ridges and shelves on the free neck (the column's flat top was a ledge under the
  ranger's ears, #261), the step and paint dE where the head's skin meets the neck's, the narrowest girth against a
  man's (0.69 of the head's), skin come out through the clothes, and lines of sight into a loose collar as steep as
  the game's cameras look that meet nothing (`neckGaps.ts`). Pictured close from six sides. `--canary`
  (`neckCanaries.ts`) plants a ridge, skin over the collar, a paler wider neck and a neck stopping short in a loose
  collar; each must be caught.
- `hall`: the hero in focus in the hall of heroes showing off his skill: in full in [`commands/hall.md`](commands/hall.md).
- `glance`: the hero's casual look round as he stands idle (`page/glance.ts`, `page/glances.ts`; `models/glance.ts`),
  read from what's drawn: the head's turn from the chest and the eyeballs' in their sockets. He stands `--seconds` (40)
  in the countdown: each glance (past 10°, one carried across joined), their spacing (never a loop, none within 1.5 s
  of the last), the most turn (a neck's 80°), the fastest (200°/s), each jerk (a move a frame changing by over 0.6°),
  the eyes leading every glance, a strip of the first and what `Glance.update` costs. He walks and attacks from the
  middle of one (back ahead in 0.8 s, none after, the way back's jerk against the same walk's with no glance: later,
  the steps jerk the head 3 to 5° on main too), stands through the eyes (none), in the lobby (one at least) and is
  shown in the hall (none before his showcase is done, one within 10 s after). The canary kicks the head 3° for a
  frame and lets him glance as he walks. The owner's words: "when idle, characters should look left/right casually".
- `poses`: the hero's pose a move at a time (`page/poses.ts`): he stands (60 frames), walks ahead (90), strafes
  with the attack held (90) and stops (90), and after each frame every object of his model (its world matrix) and
  every point of the geometries that move (positions drawn as `DynamicDrawUsage`: the cloth, a bowstring) is folded
  into a digest by the bits of each number, a line a move and one for all; then his model's `animate` timed each
  frame by the browser's clock (median, 90th percentile, in all), lines that differ from run to run. A change made
  to cost less poses him exactly as before when `--ab`'s digest lines agree, and its time lines say what it saved:
  a clip or range measure's lines agree for changes far past the last bit, and a gait's later strides go elsewhere
  after one (`check`'s offsets). `--canary` moves a number of the last frame by its last bit, and the digest must
  change. Run it with each `--gear` a change can touch (a hero's arms are fitted per weapon style). Beside
  `animate`, what it all took a frame by part: his whole update (`Player.update`), his skirts' update and their
  drape. `--lobby` makes the moves in the lobby, the run abandoned for it (Abandon run held, as a player holds it:
  `toLobby` in `page/hallMoves.ts`) and 300 frames let pass for the lobby to settle in.
- `guide`: the guide's first opening and a walk through every page of it (`page/guideOpen.ts`, `src/ui/guide/`; from Victor's review of #665: "when opening the guide section for the first time, it lags for 1-2sec"). From the lobby, G opens it as a player's key does, every section and entry is opened in turn, a frame each, and frames run on (with real time between them: the pictures' compiles and encodings run on the browser's clock) till every picture laid in it is made. Each frame and each page's build is timed by the browser's own clock, and a `longtask` observer catches what a frame's timing can't (the page's style, layout and paint): the longest of either must stay under 100 ms. A long task begun before G is the lobby's own (a return from a run's set-up: 300 to 400 ms), reported apart and not judged. The game's renderer must link no program (the pictures have a renderer of their own). The report names the pictures' slowest pieces (`portraitPieces` in `ui/guide/portraits.ts`, timed by the browser's clock). The walk starts as a first visit's does while the fight's warm-up runs: no picture made (`forgetPortraits`) and the lobby's own building held (`BEHIND.most` 0), each page's own picture must be drawn within 150 ms of the page's opening, or of the end of its compile if that came later (Victor: "model renders take 5-10sec to appear"; the compile is the browser's own, which the lab's browser at below normal priority on a busy PC took 12 to 21 s over, and is reported apart: `portraitTimes`), every place still waiting for its picture must show its spinner (its `::after` ring, turning unless the page asks for reduced motion), and every foe's, boss's and hero's picture must be drawn within 20 s of G (from play: "icons not loading in guide", one picture 20 s after it opened and most of them after a minute, as they were made behind the lobby alone). `--canary=stall` forgets every picture and makes them all again at once as the guide opens (`remakeAllNow`), as the guide made them before they were made behind the lobby: the stall (1.2 s on the owner's PC) must be caught. `--canary=slow` makes them behind the lobby alone, not while the guide is open (`portraitPlant.notWhileOpen`): the pictures not drawn in time must be caught.
- `behind`: the heroes built behind the lobby a piece a frame (`page/behind.ts`, `src/game/behind.ts`): cached hall heroes and spares are rebuilt behind the live lobby, with the longest building frame limited to 30 ms. Opening and choosing a prepared hero must build none; the first real lobby draw must compile no programs and retain the shared player lights. Then quality changes with the hall open and Back leaves without choosing: no head geometry may be sculpted on the input thread, background building retains its budget, and another opening must complete. Worker waits yield real time as well as parked frames. `--canary` builds all pieces in one frame, drops spares before choosing, and synchronously finishes missing-detail jobs; all three faults must be detected. A paused lobby is unpaused before measuring.
- `photo`: photo mode as a player uses it, in the village, from its pause menu and in both battlegrounds: [`commands/photo.md`](commands/photo.md).
- `labels`: a world label kept out by a full atlas (`page/labels.ts`): the atlas filled with labels the size of a
  partner's name tag until a tag laid after them finds no slot, a twentieth of them given back (too few for the atlas
  to be packed again), and the tag must be drawn in a slot within 3 frames. On main it never was: a label that found
  no slot was marked painted and never asked again, so a co-op tag that met a fight's numbers vanished until its bar
  stepped ("name tags sometimes appear, then disappear"). `--canary` gives none back, and the tag must stay undrawn.
- `seams`: the hero's sewn seams as he moves (`page/seams.ts`; `models/tunic.ts` `SetInShoulders`: the ranger's coat,
  the mage's coat and waistcoat and the warrior's gambeson, each sleeve's top sewn into its armhole). Two skinned pieces sewn together share
  their points as built, and each is carried by its own shares of the joints, so a seam holds only while both give a
  shared point the same share. Every point two skinned pieces share as built (within 0.05 mm in the frame they were
  bound in, a geometry's own copies of a point kept once) is followed standing, walking, with the attack held and
  through each skill on a key, and read as drawn: the pieces over 2 mm apart there are an open seam, a problem, named
  by its pieces with the move it opened in and its height. Before the fix the coat's armhole kept to the chest
  under the shoulder joint (`UNDER`) and the sleeve's top went with the arm: 114.5 mm on the ranger (Briarflight) and
  117.9 on the mage (Starfall), the forest seen through the coat behind a drawing arm; 0.0 and 0.1 since. A hero
  whose sleeves are set in with no seam found is a problem (nothing was measured). A seam sewn shut still shows as a
  line where the light breaks across it, so each seam's points are also read as built for how far apart the pieces'
  normals there are turned, over 6 degrees a problem: the sleeve's top ring was shaded by its own faces' normals alone
  and met the armhole's, the surface's own, up to 15.4 degrees apart round the warrior's shoulder (a line round its
  top, from play), the ranger's and the mage's too; 0.0 since (`setInSleeve` gives the ring the tunic's normal,
  `surfaceNormal`). `--each` lists every seam; `--canary` moves one sewn piece's points 1 cm for a frame's measure (the
  mesh itself moved reads nothing: a skinned mesh is drawn where its bones are). About 50 s a hero on a cold server.
- `sit`: an idle hero's sit on a log, a stone or the floor by a fire: in full in [`commands/sit.md`](commands/sit.md).
- `coat`: the hero's skirts and hood (`page/coat.ts`; `models/armor.ts` `Skirt` and `models/hood.ts` `HoodCloth`,
  found by their geometries' names, 'skirt' and 'hood', or a commit from before by the ranger's mesh's, 'tunic hem') as
  he stands at idle in his head item and body armour, `--seconds` (5 by default): every point of the cloth in its own
  space, a skirt's hung from the hips and a hood's from the head, so his sway is taken out, and each jerk, its move a frame
  changing by over 1 cm, with where on the cloth and the hand nearest (or, with none, the most any point's did);
  `--frames` lists them; the canary kicks a point out 3 cm for a frame. It also says how much of his standing the
  cloth rested through (`CLOTH_REST` in `models/armor.ts`, #590: half of its updates at 60 Hz, 80% at 144, where
  under half fails; the canary holds the rest off, which must read as none). He stands once at each of `--rates` (60 and
  144 Hz by default): the cloth steps at 1/60 s, so on a faster screen most frames step it none and some once, which
  a 60 Hz clock never shows. From play, "the hood is jerking when idle": held firmly and damped as the free cloth, it
  rang every 0.2 s, at 144 Hz on 34 frames, up to 1.2 cm, and at 60 Hz on none; damped critically, 0.1 cm at most. From play: "ranger has a clothing bug, behind that right arm, in idle", "you should observe
  3-5sec of frames to see it moving unnaturally", "under left arm/hand too, but less": each point a hand or the bow
  reached was put round onto its far side, so as the idle swayed them points jumped by a hand's width, the coat on 224
  of 300 frames, up to 11.2 cm; now none over 1 cm. The mage's robe jerked 1.7 to 2.5 cm on 8 frames by the waist at
  its sides, a line down the cloth from a point inside the thigh's top put round onto the thigh once its deepest moved
  a hair off that point (`Skirt.over`); now none over 1 cm. The warrior's mail shows only with body armour on, which
  the set-up doesn't give him.
- `headshots`: the bow's and the fists' headshots, every foe's head and chest shot or punched in each view: in full in [`commands/headshots.md`](commands/headshots.md).
- `held`: every held skill of the hero's class: in full in [`commands/held.md`](commands/held.md).
- `draw`: every drawn shot of the hero's class drawn to full and held there as the player holds it (`page/draw.ts`,
  `--class ranger`), in the top-down view, over the shoulder and through the eyes (`--views`): the key held over an
  aim ahead, 120 frames at full draw, and let go. Every frame its motes on the arrowhead (`fx/glintMotes.ts`, on the
  model's `arrowHead`) are read, with nothing drawn, drawn short of full and held at full. Every 4 frames of the hold
  (28 moments: the motes move, and judged at four, their worst went unseen) the glint is judged as the player sees it
  (`page/addedLight.ts`: the frame drawn with it and without it round the arrowhead, only that box read back, the
  pixels it lit by a tenth of white and its glare, those it lit by 0.4, in patches, `page/patches.ts`), the least it
  was seen and the most it glared. A glint before the draw is full (it's the sign that it is), on fewer than 90% of
  the frames held at full or gone for more than 20 of them, one with nothing drawn, a glint lighting less than 0.35 in
  10,000 of the frame's pixels in any view (as glow particles it lit none through the eyes; Briarflight's over the
  shoulder lights 81 to 83 pixels of a 1920x1080 frame, 0.4, as what stands behind it changes), the hero's own light
  (`Player.staffLight`, the class's aura) lit with nothing drawn or on fewer than 90% of the frames held at full (a
  ranger's is lit at full draw alone: lit always, "why ranger emits light from bow on idle"; `--canary` lights it
  always), a patch of glare over
  0.55 in 10,000 (a star of light on the arrowhead glared in one of 0.64 to 3.6, and was too bright, and motes bright
  enough to bloom merged into blobs of 0.9 to 1.6; the motes' specks are 0.41 at most) and a shader compiled meanwhile
  are problems. In the close views the crosshair is read every frame too (`page/crosshair.ts`: its lines' thickness as
  the page's styles draw them, and its animations): bold held at full draw on 90% of the frames, on none before it or
  with nothing drawn, and one beat into it, run once and swelling about its middle, which moves no more than half a
  css px from where it was at the beat's height and once bold (centred by `transform`, it swelled about where its box
  was before that and moved 10 css px up and left; the page's motion is let run meanwhile, `lab.reduceMotion`); with
  motion reduced it comes to bold with no beat. `--pictures` (on by default) pictures each shot held at full at its
  most glaring moment, the screen whole and its arrowhead close, and the crosshair as it's drawn, at its beat's height
  (held there: the beat runs on the page's clock) and bold, into `out/draw`; `--canary` shows the glint and the
  crosshair's bold from half the draw, takes them away once the draw is full, swells the crosshair about its corner,
  and leaves the motion on for the reduced check.
- `shots`: the hero's basic attack loosed at a boss with its foes packed round it (`page/shots.ts`, `--class
  ranger`): each biome's boss with its summons and two of its commonest foes beside it (`held`'s `bossWithSmall`,
  the hero at 12,12 unless `--at` says: from the lab's own spot, 25 m out, they stood 7 m on in the thicket, and once
  the wall was what's drawn it put them back by him),
  their life raised so none dies, in each view (`--views`). `--shots` points (12 a view) are taken from `held`'s grid
  over the foes on the screen, half over the boss, none at their feet (an arrow there goes into the floor first);
  before each shot every foe is put back where it stood (the shots knock them off their places), the point is taken
  again at its spot on the screen (the foes sway), the crosshair is turned onto it in the close views and the bow
  drawn to full over it and loosed. Its flight is followed frame by frame, each frame's step (by the arrow's point,
  half its length ahead) looked along for the first foe drawn on it before the frame runs, as the game meets them:
  against the bodies as last drawn (looked along after the frame, the foe it struck had flinched off its line). It
  must strike that foe and it alone, or none if its flight met none; and one aimed inside a foe on the screen as
  it's loosed (the foe drawn 6 pixels round the aim every way) must meet a foe, the one aimed at unless another is
  in the way. One aimed at an edge may go past it: a pixel off, or the body swayed a centimetre, the aim is past it.
  A basic attack that doesn't fly at the point aimed at (the mage's seeking bolt, level at the hand's height and
  struck within its circle) is said so, as a problem: there's nothing to judge. `main` failed 56 of 72 shots (the
  bosses' crowns and arms flown through, imps struck in the air beside them, shots at a boss's legs striking the
  imp whose circle they passed). `--canary` makes the first shot's foe invulnerable: struck, it takes nothing, and
  the shot must be found missed.
- `gear`: full sets of gear rolled for every class as its loot rolls them (`page/gear.ts`, `--sets` each, 400 by
  default), at each tier (`--tiers`, a rarity at an item level each: `magic@5,rare@15,epic@30,legendary@50`), and
  what a set gives on average: Health (his own and the gear's, and the gear's against the mage's), regeneration a
  second, the draught's heal and how much it multiplies his damage (as the game's damage stats add up on his
  skills). A class whose Health or regeneration from gear is out of the order of his own Health is a problem;
  `--canary` rolls the ranger's Health from gear as the mage's.
- `music`: each biome's music played through as the player hears it (`page/music.ts`, `--biomes forest,crypt` in
  turn). Each round goes through the biome's lobby, a run's countdown, the first wave's fight and its win, the next
  wave's countdown and fight, the tab hidden and shown again mid-fight, and the bank back to the lobby. Every frame
  is judged by what the game sends to WebAudio (each buffer source it starts, `page/musicTap.ts`) and by what each
  track's output carries (an analyser on it), not by the music's own bookkeeping (`page/musicJudge.ts`). These are
  problems:
  - a track rising where another is wanted (`EXPECTED`, the owner's choice for each place: the lobby's track in the
    lobby and between waves, the battle track through each fight);
  - a level that moves faster than a 0.75 s fade;
  - a fresh track that doesn't start at its top, or a track coming back elsewhere than where it was left (the
    lobby's after a fight, the battle's in the next wave, either after a hidden tab);
  - a source looping off its track's loop, or past its samples' end;
  - a battle track not decoded within the run's countdown;
  - a track kept decoded while it's silent and wanted nowhere;
  - a track wanted at full that carries less than -45 dB (listened to for up to 4 s, as a piece may open near
    silence), or a silent one, or any in a hidden tab, that carries anything.

  `--canary` plays a round again with four faults planted: the biome's battle track played as another's, the
  lobby's fade in cut to a twentieth of a second, every fresh track started 5 s in, and every track coming back
  started from its top.
- `sound [scenes]`: a skill's sounds as the player hears them, rendered offline and written as WAV files to listen to
  (`page/sound.ts`, in `tools/lab/out/sound`; with `--ab` the other side's as `main-<scene>.wav`). The game's
  effects are played into an `OfflineAudioContext` as it plays them (`playInto` in `src/core/audio.ts`: the same
  master, compressor and hall, the throttles on the context's clock), each call at its moment of the scene. The
  scenes (`SCENES`, comma separated, `bolt,boltMiss,lance,lanceEarly` by default): `bolt`, Splintering Bolt held,
  four casts at its pace each bursting on a foe 0.3 s out and its two splits on two others; `boltMiss`, one cast
  striking nothing; `lance`, Void Lance's portal drawn, the beam held 4 s and let go; `lanceEarly`, let go as the
  portal is drawn; the warrior's (`WARRIOR`): `cleave`, `cleaveGreat` and `cleaveDual`, Rending Cleave held with each
  weapon, three swings each biting; `fangs`; `crescent`; `shield`, raised, two blows caught and the guard broken;
  `tempest` and `tempestGreat`, held 3 s and let go; `bullRush`; `powerStrike` and `powerStrikeEarly`; `bellow`;
  `draught`; his fists' (#400), `fists`, six of Savage Fists' punches held, `fistsHot` the same at full Frenzy (two of them hammers, with a grunt), `wrath`, its slam, `unchained`, his roar, and `frenzyFull`, his heart; the ranger's (`RANGER`): `nockshot`, held to full and let go three times; `nockshotQuick`, loosed at
  its least draw into the ground, a foe, a log and off a stone; `nockshotHeld`, held at full for 4 s; `briar`;
  `lancewood` and `lancewoodShort`; `hail`, Hailfletch held for three volleys of 24; `rangerMany`, the loudest a
  ranger gets (two in co-op, a volley landing as a fan and a full Lancewood Shot are loosed); `quarry`, the mark and
  its refresh; `strawman`, raised, struck and sinking; `glance`; `arrowLands`; a press that casts nothing (`DENIED`, #572): `deniedCooldown`, the knock, `deniedEnergy`, the fizzle,
  `deniedMashed`, four knocks at the player's throttle. A cue marked `optional` is a sound an
  older game played nothing for (the bow's creak, an arrow into the ground), skipped quietly on the other side of
  an `--ab`. Any other name is a sound of `sfx` played once (`bow`, `swing`, `clang`), for a loudness to
  hold a spell against. Each scene renders until the hall's ring after its last cue has died (3.5 s), and says its
  peak, its loudest half second (the level to hold against the other heroes' sounds: on #413 a bow's shot was
  -56 dB, a swing -56, a Splintering Bolt cast -36), its level every tenth of a second, its brightness (its
  spectrum's centroid and its share above 2 kHz: #422's exit gust, "hammering on the brain", 5.6 kHz and 74%; made
  soft, 1.5 kHz and 22%), its share above 150 Hz and
  its spectrum's most tonal peak (over a channel's hold for `lance`: the bin standing furthest over the median of
  the third of an octave round it, Welch's spectrum of 4096-sample windows; noise stands 2 to 8 dB, a flanger's
  comb about 10), and the nodes it made, by kind (what a cast costs). A sample not a number, a clip, a note
  standing 15 dB over its noise in a spell's scene (the music hears it as a second tune: #413's "the background
  music gets duplicated"; the warrior's clang may ring, as metal does) and a sound still playing at its end (over
  -60 dB in its last quarter second) are problems. `--canary` renders the first scene again under a 440 Hz note
  never stopped, which must be caught as both. `--ab` runs only against a commit that has `playInto`. The
  measures are pure functions in `page/soundMeasure.ts`, tested in `test/soundMeasure.test.mjs`.
- `denied`: the sound a press that casts nothing makes (`page/denied.ts`; `Player.denied` in
  `src/entities/player.ts`, `sfx.denied` in `src/core/audio.ts`, #572). A skill on a key that's pressed to cast, with
  a cooldown and a cost and needing no target (the warrior's Iron Bellow, the mage's Glacial Nova, the ranger's
  Briarflight), is pressed as the player presses it, a set-up each: once while it cools (a knock, once); held down 2 s
  while it cools (once: the key is tried every frame it's held, and only its press is heard); mashed 3 s while it
  cools, down a frame of every four (no more knocks than the throttle's 0.3 s allows, and at least half of that, or
  the presses went unheard); once short of energy (a fizzle); once ready (nothing, and one cast); once in free casting
  with its cooldown set by hand (refused, and nothing). A channel with a cost is held short of energy (a fizzle,
  once), and an aimed skill with a cooldown aimed and let go while it cools (a knock). A partner's copy runs no input
  (`updateRemote`), so it never presses: the player is asked itself, as a hero not this game's own, to refuse a press
  and play its sound (nothing), and then as this game's own (one, or nothing was asked). What's read is what the game
  asks the sound module to play (`sfx.denied` wrapped), and the casts it fired. `--canary` breaks the throttle (the
  last sound's time set back before every frame), which the mashing must catch. How each sounds is `sound`'s
  `deniedCooldown,deniedEnergy,deniedMashed`.
- `dev`: developer controls through their real panel: opened by its DEV tab and floating over the village, checked frame inclusion, world labels outside flight, opacity floor, five required desktop/phone/tablet layouts, flight speed in the hint, a training start from frozen flight with harmless enemies, continuous No costs refill, reset, and head meshes hidden during 0.1x first-person entry. `--canary` plants a drained resource and requires its detection. Pictures go to `out/dev`.
- `eval <expression>`: an expression evaluated in the page, with `lab` in scope (`eval "lab.player.nocked"`). One that
  hasn't settled in 60 s is given up, with an error (a `requestAnimationFrame` waits on the lab's frames, `lab.step`:
  awaited, it never settled, and held up every command after it till the server was stopped; the browser's next
  frame is `window.__labClock.realFrame()`). `live eval` is given up the same way.
- `live <step>`: a page of the game kept between steps, each on the state the last one left, as a modelling
  tool's scene is kept between edits (`node/live.mjs`, `page/live.ts`; needs `lab:serve`). `live start` boots the
  hero (`--class`, the warrior by default), on `--screen`'s screen if it's given (a phone's, `832x384@3.75`: its
  layout and the touch controls' scale), and sets him up (`--view`, `--gear`, `--weapon`, `--wear`, `--at`, `--facing`);
  then `live picture` pictures him from `--views` (through the eyes `eyes`, else `third`, by default; `screen`
  the whole page as the player sees it, the HUD and the touch controls over the frame) in any
  `--look` (a close-up from `--distance` m off what it's framed on: 1.7 from a joint, 4.3 from the body by
  default, or a place in the world, `--on x,y,z`: a prop, the views turned by the hero's facing), with a reference
  laid over each picture and stretched to it (`--over <picture> --strength 0.5`) and a part of it kept (`--crop
  0.5,0,1,0.6`, its edges as shares), each in its own file in `out/live/`; `live inspect [name]` lists the hero (or a joint, or any object by name: the warrior's weapons and shield are named)
  and what's under it (`--depth`), each with where it is in the world, how it's turned, what it's drawn with and
  where its posed vertices are on the screen; `live eval <expression>` evaluates on the page (`lab` in scope: a
  joint turned, a value set); `live frames <count>` runs frames with no input; `live log` lists the steps;
  `live stop` closes it. A picture takes under a second where a command boots and sets up for each look. The
  steps are kept (`out/live/steps.json`, `node/liveLog.mjs`): when the source changes, or the server starts again,
  the next step boots the page again and replays them first (every `eval` is kept, a read too: `live start`
  begins again). It runs in a browser of its own, as a command's page lost the input to a second page in the same
  one. It's for trying by hand: what's found there is measured by a command on a page of its own, as the live
  page is wherever its steps took it. `live picture --canary` hides the hero and pictures him in the `parts` look
  too, where no part of him may be found.
- `status`, `stop`: what the server serves and has booted; stop it.

**Looks** (`page/looks.ts`, `--look` on `sheet` and `live picture`, `CaptureOptions.look`): `lit` is the frame as
the player sees it; `wire` the hero's wireframe; `faces` which way his faces point (front blue, back red, shaded
by how square each faces the camera: a face wound inside out shows red; a hair card's back does too); `parts` each
of his meshes in a flat colour of its own, and a note of each in the picture, the most first, with its share of
it and its box (named by the nearest of it and its parents with a name, a joint's or its own, and its material);
`bones` his skeleton drawn over the lit frame. The first three draw outside the game's chain and read the
drawing buffer back as opaque (`page/pixels.ts`), with the world in its own materials but only its depth: what
the game draws in front of him (a leaf card cut out by its texture, a prop dissolved round him) still hides him.
(Drawn flat, the forest's leaf cards were whole squares, and one by a close-up's camera filled its frame.) A
part's cut-out (a hair card's) keeps its texture's alpha. A pixel is found as a part by its colour within 2 levels
a channel, looked up once (matched against every part's colour, a picture took 10 s).
- `pwa`: a deploy as a returning player meets it, the offline worker and all, which the lab's dev server never has
  (every load must also end without the loading screen's failure, #856's "Failed to fetch dynamically imported
  module")
  (`node/pwa.mjs`; it runs in this process, not the server). Another commit's production build (`--from[=ref]`,
  origin/main by default, exported as `--ab` exports it) and this tree's are built with Vite into `out/pwa/`, and
  served in turn on 127.0.0.1 under `/last-stand/` as Pages serves the game (`node/staticHost.mjs`: `max-age=600`,
  revalidated by ETag, what it serves swapped at once, as a deploy swaps it). A fresh browser loads the old build
  twice (its worker installed, then the page and its fonts fetched through it); then this tree's build is served in
  its place and the page reloaded as a player reloads it: under the old worker, again once the new one has taken
  over, and offline. Each load is known by the worker that served it (asked as the page starts, before a new one
  takes it over: a load under another than it's for measured nothing, a problem). Every load must show the game's
  fonts (a face of Cinzel and of Alegreya Sans loaded), every load after the swap this tree's build (its entry
  script: a plain reload must show a new deploy), and each of this tree's loads the labels' lining twin
  (`overlay/paint.ts`).
  Then the installed app: this tree built twice more as a PR's preview builds (another commit stamped in each, so
  another bundle and worker's cache, as a PR's are), served in their folders under the site
  (`pr-preview/pr-1/aaaaaaa/`, `bbbbbbb/`) and visited in turn, each its worker installed; then the app opened
  offline at its start (production's cache must have outlived the previews' workers), at the first preview's
  folder pruned (a game must show: its worker's cached build, or this tree's by the 404 page) and at a closed PR's
  build never served (the build's `404.html` answering it, as Pages does, must send it to the game at
  `/last-stand/`). Under main's worker the offline start fails.
  (The previews were served under production's origin by Pages until #352, so players' browsers may still hold
  their workers there; Dokci serves each now at a host of its own, `server/game-preview`.)
  `--canary` serves a stale page on the first reload after the swap and the font stylesheet's address broken after
  it, deletes production's cache before the offline start, answers a missing path with a plain 404: all four must be found. About 40 s to 100 s (the canary's two and a half minutes: its waits run out). (The owner's
  installed app on their phone opened Pages' plain 404: it was left on a PR preview's build, pruned since, and the
  previews' workers had deleted the caches that would have shown it.) (The owner, of #263's preview:
  the page's font stylesheet had been asked for with CORS, and the previous deploy's worker answered with the copy
  it kept from a request without, which can't answer one with; the stylesheet failed, and the lobby showed the
  system's fonts, wider, its links wrapping: "increasing font size had unintended side effects".)
- `check`: every hero's checks of a change to how they move, side by side: in full in [`commands/check.md`](commands/check.md).

Options every command run on a page takes:

- a probe or command that doesn't compile says where and why (`.tmp/x.ts:3:10 doesn't compile: Unterminated
  string`), not the browser's "Failed to fetch dynamically imported module";
- the set-up (sheet, carry, probe): `--view top|third|first`, `--at x,z`, `--facing rad` (held in every view: the
  close views' camera turned to it, as through the eyes the hero faces where it looks), `--nocked[=false]`,
  `--gear oneHanded|shield|twoHanded|dual` (the hero holding his weapons that way, from his class's own bases: as the
  profile rolled them by default), `--weapon` the base held so (with `dual` one in each hand);
- `gait --films=false`, `form --pictures=false`: the numbers alone, each run once (a film or a picture runs it
  again); `gait --offset n`: each scenario's first move n frames longer, its later turns and stops at other
  points of a stride (a check's starts);
- `--class ranger|warrior|mage`: the hero (the last one used by default);
- `--screen WxH[@ratio]`: the page put on a screen of that size in css px and pixel ratio once it has booted (`1280x720@3`:
  a 4K screen at 300%), as a window moved onto another monitor is: the game fits its canvas to it on the next frame
  (1920x1080 at 1 by default);
- `--insets left,top,right,bottom` (with `--screen` or `--screens`): the screen's safe-area insets in css px, as a
  phone's camera cutout gives them to the page's `env(safe-area-inset-*)` (DevTools' `setSafeAreaInsetsOverride`):
  `ui --states hudTouch --screen 832x384@2.8125 --insets 34,0,0,0` is the owner's S25 Edge held sideways;
- `--screens WxH[@ratio],WxH[@ratio]`: this tree on two screens, one after the other, compared as `--ab` compares two
  commits: the lines that differ, and the pictures pixel by pixel (both 3840x2160 for a 4K screen at 100% and 300%);
- `--ab[=ref]`: also on another commit (`origin/main` by default), its results beside this tree's, ending with the
  verdict: the lines that differ under the section each is in, and the pictures that differ by more than the GPU's own
  noise, with where (the region of each, and a picture of each in `out/ab/<command>/`: this tree's dimmed, its
  differing pixels magenta). A commit compared with itself (`--ab=HEAD`) agrees, so the other commit's side is kept
  once it has run (`out/ab-cache`, by its commit, the hero, the command and its options, and a hash of the lab's code
  that command runs: the page modules its entry reaches, its Node entry and what that reaches, the browser's scripts,
  `side.mjs` and a probe's own files, `node/labCode.mjs`) and read back after: run again each time, main's side was
  half of every A/B, and keyed on every file of the lab, a change to one command's measure ran every command's other
  side again. `--fresh` runs it again; a side whose page raised an error isn't kept;
- `--profile`: where the command's time went in the page, its busiest functions by their own time and in total,
  each at its line in the source; `--profile=<function>` (its name, or its name and file: `"--profile=animate
  ranger.ts"`) lists only the time in that function, by its share of it (the busiest 14 of a whole profile left the
  ranger's animation, 2.7 ms a frame, unexplained);
- `--tune name.field=v,...;...`: the game's tunable values (`src/core/tuning.ts`) set before the set-up;
  `name.field[i,j]=v` sets those numbers of a list alone, the rest as they are (a swing's keys, six numbers each:
  `warriorSwings.twoBack[41,47,53]=40` the roll of its last three keys);
- `--sweep target=a|b|c[;target=...]` (`node/sweep.mjs`, on the lab's server: `npm run lab:serve`): the command run
  once for each value of a target, a `--tune` path or some of its numbers, and for every combination of several, each
  set over the `--tune` given; each run's problems listed in full under it, then the runs with the fewest, exiting 0
  when one had none (keys tried a dozen ways by hand, each run's output filtered for its problems, missed the speed's
  three failures on the runs the filter called best);
- `--randoms`: what drew the page's random numbers as the command ran (`node/randoms.mjs`): the draws in all and the
  busiest callers, each at its line, and with `--ab` the callers whose draws differ between the sides, the smallest
  differences first. An A/B's pictures of anything random (particles, sparks, motes) differ after the first draw one
  side made and the other didn't: drawn in crowds, the foes' skeletons never made the bone textures three makes as a
  skinned mesh is first drawn, four numbers each for their ids, and every mote after them lay elsewhere;
- `--layers`: the page's composited layers at each screen picture, as Chrome drew them (`node/layers.mjs`): each
  layer's element, its box and why Chrome made it a layer, and with `--ab` the layers the sides didn't share, picture
  by picture. Two sides whose pictures differ only in how bright the UI's thin lines are, nothing moved, were
  rastered two ways;
- `--watch`: run it again each time the source changes, on the page booted for the change, until Ctrl+C.

A misspelt option or a bad value stops the command before anything boots (`carry takes no --canry (did you mean
canary?)`). The exit status is 1 when the command failed or found a problem: an error in the page, or a problem its
result reports (a canary the measure missed).


- `houses`: the village's houses walked into and out of as a player does (`page/houses.ts`; `src/game/rooms.ts`). Seven visits, the house of records from above and through the eyes, the tavern and the library over the shoulder and from above, and Odo's Wares over the shoulder: stood at its cottage's door, its name the object near, a tap of E takes him nowhere and E held takes him in (`page/housesDoor.ts`: held 0.6 of its time, the hold reads its share and the prompt names the house; pictured mid-hold at each house's first visit; within 600 frames: a cold boot's warm-up under the loading bar). At each house's first visit no two shown faces round its door inside lie in one plane (some 75 thousand rays from inside at the front wall, across the hole's reveal, up into its head and down onto the wall's top with the ceiling cut away; the door's jambs stood half into the wall and flickered against the plaster from inside). Inside: he stands at the door's inside, the village isn't drawn and the room is, the lobby's foes are all dissolved, the walls cut away are the front and the ceiling from above and none in the close views (the camera inside the walls), and every frame is drawn (`lab.drawing`: the lab draws none unasked, and a program is compiled only as a frame draws what needs it, so the count read nothing without it) with no program compiled going in or out. A walk down a lane clear of the furniture (`LANES`) must reach the back wall and stop short of its face. The house of records hangs the Hollow Colossus's trophy (beaten for the command) and an empty mount for the Elder Thornheart; from above its great ledger's card opens by E with its four pages, within the window (`--screen 844x390@3` holds it too). Over the shoulder the tavern's party table opens Play together (the relay's health answered on the page, as down) and E puts it away, the library's Codex opens the in-game guide over the pause menu, within the window, Esc putting both away, and its scholar, Brother Hollis, is seated and talked to by E from his table's stand: the talk card (`#talk`) up, it and each reply within the window, his third reply's key leading on to the door behind the great hall, Esc ending it without opening the pause menu. Out by the door inside, held as going in was and pictured from where he stands to use it: he stands before the cottage's door, the village is drawn and the room isn't. Pictures each visit and the ledger's card. From above, the wheel turned out and then in as far as a player turns it (`page/housesZoom.ts`) keeps the zoom within the room's (`ROOM_ZOOM`), the furthest out pictured, and out again his own zoom from outside (0.8, past the room's) is given back exactly. `--canary` compiles a program of its own as the first room comes in, leaves that room drawn going out, makes the door's hold a press (0 s), lays a sheet in the door frame's face inside, lets the room's zoom go and makes the scholar's talk card twice the window's width; all must be found. A partner in a house shown to the others is `coop --scenarios houses`.
- `scholar`: the library's Brother Hollis as a player meets him (`page/scholar.ts`; `src/entities/models/scholar.ts`, seated by `src/world/houses/library.ts`; his rounds `page/scholarRounds.ts`, `src/world/scholarRounds.ts`: held at his table for the checks of him sat, and let go at the end through a browse, a keep and a restock, then a dusting, a row squared and the globe turned, followed undrawn a frame at a time, each frame his middle at least 8 cm clear of what stands in the room while he's up, a book in his hands within 10 cm of a palm (from its box, a palm 7 cm down the hand from the wrist), its shelf's book hidden while it's off, no gaps once he's back sat after a browse; a hero placed close as he looks for a book is looked up at (his face within 40 degrees: over his shoulder, his back and chest turning) and his task goes on, the hero in his way as he walks is waited for a moment and gone round, or waited for where there's no way round; the open book as he reads it standing held 25 to 42 degrees back from upright, its pages within 40 degrees of facing his eyes, each palm behind its boards within their outline (3 cm), his fingertips no more than 2.5 cm out past its edges nor 4 cm out behind its boards (the old hold, 46 degrees, fails); walked up to as he reads standing and E pressed, he keeps still and faces the hero, and goes on after Esc; each frame no joint of him turning more than 8 degrees (getting up, sitting down, every beat handing on to the next; from play, "like he teleports a bit into these different poses"), his head within 15 degrees of the way he goes on a straight walk (his body within 8 degrees of it, the hero over 2.2 m off: "looking sideways when walking forwards"), no point of a shoe more than 4 mm out through his robe above its hem ("they go through his clothing when walking"), nothing of him (his body as rounds about his middle, his palms, the corners of the book in his hands) more than 5 mm into the ladder's rails and rungs ("should not go through the ladder when standing/walking"), his palms and that book no more than 1 cm into the room's other furniture while he's up (its circles below its tops; not the cases he reaches into, nor the globe he turns), his hips' speed changing by no more than 20 m/s in a second and no joint's turning by more than 25,000 degrees a second in a second from a frame to the next (the most this tree reads: 12.7 and 15,001; "it snaps ... there are two separate ones instead": a beat handed on to the next with a cut), his cowl no more than 3 mm into his neck (a capsule round his neck's joint and his head's, 6.4 to 5.3 cm round) or his head (9.2 cm round its middle) and its top no more than 3 cm off his neck ("the Librarian's hoodie is broken": a ring standing off his neck, his neck and back seen down inside it), and while he has a shelf's book out, the book in his hands that very book (its model, its spine, its colour, its size) and its cover and pages hidden from the shelf, and once he puts it back, the shelf's instance as it stood ("when he grabs a book, he grabs a different model"); his dusting cloth shown and within 8 cm of his right palm throughout (put where his hand was aimed, it was 11 cm off it as his arm fell short), the globe he sets turning turned at least a radian; the game's renderer compiles nothing over them; the frame timed sat and as he walks; pictured as the player sees him, the camera turned to him from the open room; `--canary` also holds a book he carries half a metre off his hands, jumps his pose from sat to standing unfollowed, opens his cowl's top off his neck, puts another book in his hands than the shelf's, walks him straight in under the ladder to read, sets a stand where the shelf's book stood, cuts the end of his rise as he sets off, lifts his hood 3 cm off his back and lays a leather box in the room, each of which must be found). Every 30 frames of each task his hood's edge (its top on the cowl's foot, its sides and point on his back) is read against the triangles it lies on: at most 8 mm off ("Hoodie still does not connect"). Every book in the room is the shelves' model, none a leather box ("These models are not same as books on shelves"). After his tasks, where he stands at the cases: at least 5 spots he can walk to from his table, each gone to once before any twice ("add more spots for him to stand/pick books, not just two"), and none, stood at with his elbows out and a book held, within 3 cm of the ladder. Then a browse on frames of 8, 33, 16 and 50 ms in turn, as a screen of another rate or a hitch gives them, read for the same jumps. His seated loop's frames read his cowl too, against the same limits. Walked in by the library's door over the shoulder. His loop (`SCHOLAR_LOOP`, 64 s) is posed through a frame at a time at 60 a second from 4 s before its end to past its wrap, by his own `update` with no game frame between: every joint of him (a finger's and an eye's too) read each frame, the most any turned in one and where, which must stay under 5° (`SNAP`: his quickest moves turn about 2.5; the elbow's pole switched on as a gesture began turned a shoulder 6.8° in a frame), the turn across the wrap the same, and his head's pitch over the loop at least 8° and each hand's travel at least 0.15 m (a statue's are none). Every frame his sleeves' cloth (the upper sleeves, the bells, their linings and cuffs) is read against his table (`Scholar.table`): no point of it inside the table's edges may be more than 4 mm below its top (`THROUGH`; a point more than 20 cm below is cloth hanging past its edge), and each stretch of the loop it was through is listed with its deepest (from play, the bells hung free through the table: 10 cm at rest, and the elbows rested below its top short of its edge). The book's printed pages are read against the spine once: each print's nearest point to it (in its half's frame, `Scholar.book.prints`) at most 3 mm short of it (`SPINE_GAP`), and the two halves standing at most that far apart there (from play: "fill in the pages, they don't reach the edges here. They should reach the middle": two boxes and a print on each left a plain strip and a dark gap at the spine). Every frame the page he turns is shown, each of its points is read against the book's two halves (each in its own frame, x from the spine to its edge, its top `pageHeight` in `models/book.ts`): none may be under either half's print, the deepest and the share of the page under then reported (from play, the page lifted out from under the blocks, "1/4 of it is under another white piece", and when it landed "it goes through the book, partially, and it glitches out"); at each turn's last frame shown it must lie flat on the left half, at most 4 mm over its print (`LANDED`: hidden a hair short of its landing, it hovered 7 mm over the page and dropped there); and while it's in his hand (`Scholar.holding`) his right hand's nearest fingertip must be within 5 cm of its outer edge (`AT_EDGE`; "he grabs it from thin air, there is nothing on the edges"). Every frame it's shown, each hand's skinned mesh (its vertices posed by its skeleton, `getVertexPosition`) is read against it: a hand with points more than 1.5 mm on both sides of the page, over it and short of the strip by its edge where he pinches it (`PINCH`), is cut through by it ("when he flips the page, it goes right through his hand": the falling page sweeps all the space over the left page within its width of the spine, his left hand rested there, and his right let go of it on the face it falls towards). Once a second of the loop, rays out from points along each forearm from the elbow to the wrist must each meet something that clothes it within 6 cm of its axis (`FOREARM`: a wide bell round an empty arm hides nothing; "the wrists are floating, add arms continuing after wrists"), cast at two-sided stand-ins of the sleeves (cast from inside a one-sided sleeve, a ray meets only its faces' backs, which three skips: every forearm read bare). Four times a second of the loop, each point of the things on his table (his desk's meshes named `scholar desk ...`, but his book's) is read against each of his sleeves' pieces as laid (`inSleeve`: between two of the lathe's rings, inside the ring laid between them there): none may be inside one ("fix weird spike sticking through his arm": his quill, in its inkwell where his left forearm rests, through the bell's side, which lies spread wide on the table; read against capsules round his arms, it read as clear). Every frame each fingertip's pad (the tip less the finger's radius) is read against what's under it, a block's print or else the table's top: at most 3 mm into it (`SINK`; his fingertips hung 7 cm past the book's far edge, and dug 3 cm into it coming back from his spectacles). Then a hero stood at his table: within a second his face points within 25° of the hero's head; walked off across the room and 5 s on, more than 35° off; talked to by E, within 25° again, as the player sees it pictured with the talk card. Pictured at the loop's beats (`BEATS`: reading, musing, turning a page, stroking his beard, pushing his spectacles up, leaning in; `--at` other seconds) from `--views` (`front,left,right,back,above`: `back` is over his shoulder) framed on his chest from 1.7 m, his face from the front and his left from 0.75 m, his arms on the table from the front and each side at its height from 1.1 m, his left forearm close from his left and ahead from 0.6 m, and his book from above ahead of him from 0.8 m, framed on its spine (the close-ups can't be put over his shoulder: from there their camera stands beside him, low, his arm before the book) (the close-ups turn with the hero's facing, so the hero is turned round for it), the hero stood off by the door. `--film` writes a picture a moment, in order (`film-N.png`), for a clip's frames. `--moments` instead pictures him at each beat of each task (`page/scholarMoments.ts`: a browse, a keep, a restock, a dusting, a row squared, the globe turned, each begun from his table, 30 frames into each beat and mid-way as he gets up and sits down, through the eyes of a hero stood at the first of a few spots round him he can stand at: put before him as he faced a case, the hero was pushed out of it into his face), and close up, lit, by the lab's own views turned as he faces: his page turn at four moments; in the browse his walk from round him (his head ahead, his shoes), a strip of five as he gets up and as he sits down, a book taken by its spine, the book he holds and the one he reads from above, what he wears from round him and at his belt, the room's walls and furniture hidden for the shots that stood inside them (their pictures black); with `--film` each its own file, in order. To look at a pose before it's measured, about 2 minutes. `--canary` jumps his loop on 20 s half way, which must be found as a snap, reads his sleeves at rest against a table 8 cm higher, which they must be found through, turns a page from a spine 1 cm lower, which must be found under the book, draws the prints 2 cm back from the spine, which must be found short of it, lets the page fall all the way down onto his left hand as it rests, which must be found cut through, reads his forearms with no undersleeves, which must be found bare, and puts his quill back where it stood, which must be found inside his left bell; each plant's verdict is a line of its own. About 2 minutes, most of it the boot.
- `merchant`: Odo's trade as a player makes it (`page/merchant.ts`; `src/loot/merchant.ts`, `src/ui/merchant.ts`), and his prices against the drop rates (`page/merchantRates.ts`). First the rates, worked out from the game's own `LOOT`, `WAVES` and each biome's pool (expected values, solo: kills, heroes, the clear's reward, a boss's drops): for a run to waves 1 to 15, the worth of its gear below rare and below epic for each rare and epic it drops, against what he asks; a rarity he sells (`STOCKED_FROM`) from a wave where that's more than he asks fails (trading would beat playing), and so does any stock at waves 1 to 20 holding a rarity before its wave. A hero of the first wave meets magics alone. Then a hero of wave 6 is given 40 commons and 6 rares of that level and a legendary, and no stock; at the shop's door its name is the object near, inside E at the counter opens the trade screen, within the window, step 1 lit and the stash dimmed and waiting with its hint (`stepsAre`), his whole stock shown (`STOCK_RARITIES`), none above epic, the legendary not offered and worth nothing in an offer. His epic, which must cost at most 30 commons of its level, is picked by a click (step 2 lit, 1 ticked, the stash open) and one common fewer than he asks given by clicks: Trade held off, the deal saying what's missing ("more value needed"), and the trade asked anyway refused with the stash and stock as they were. One more given: Trade offered (step 3 lit, 1 and 2 ticked) and clicked, the commons gone, the epic in the stash and saved, the stock one fewer. His other epic picked and Pick fewest clicked: the tiles it picks are `fewestFor`'s, none an epic, enough, no more than the rares and one. Then `RESTOCK_RUNS` runs begun: a new stock, full, none of the old. Pictures the shop, Odo close from his front and sides (1.3 m, where `shop.ts` stands him: a view from behind him sees the shop's back wall alone) and over the shoulder at the counter, the trade screen at each step and Auto-fill cheapest's. `--canary` puts the piece bought back in his stock and leaves the stash dimmed with a ware chosen, both of which must be caught. `--screen 844x390@3` holds the screen to a phone held sideways.
- `training`: verifies a failed normal-run wave is saved per biome and survives profile loading; old profiles migrate from banked waves only. Checks the ghost by the village's training yard's gate (drawn as a projection, no foe; at noon the Thornwood's alone, at midnight the crypt's), talks to it by E (its card on its battleground) and picks each battleground on its card (the waves reached offered), tests every damage type and a normal-run damage control, kills a projection, rejects a late loot report, clears/repeats/leaves without changing the saved profile. Pictures the lobby, holograms and wave decision. `--canary` temporarily removes training immunity and must detect damage, and makes the ghost solid and shows both ghosts at noon, each of which must be found.

  `training --coop` uses two actual game pages over the existing 100 ms delayed lab link: a wave-1 guest follows the host’s wave-4 training selection, both reject damage/loot, repeat and leave, and neither save changes.

- `guard --class warrior --canary`: raises a shield, attacks through real input, verifies the enhanced guard is absent through the swing and returns in the same update it ends, and checks release, cooldown/energy failures and isolation of other channels. Pictures guard/swing/return in third person and through the eyes. Uses two actual touch fingers to hold block and attack together, then release each independently. The canary prevents a shield channel from stopping and must be detected.

- `portraits --canary`: audits real image resource entries before the co-op picker opens, opens its enabled male class choices plus None, selects and clears a picture, checks partner-picture rendering, and pictures the picker. JavaScript URL-manifest entries do not count as image downloads. The canary requests another class’s actual image and must catch it. Run with phone/tablet/desktop `--screen` sizes.
