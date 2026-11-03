# `tools/lab`

The lab as an agent works with it: what every command measures, in a line here and in full in [`COMMANDS.md`](COMMANDS.md), how to write a measure, how the lab works and what keeps it repeatable. `README.md` is the short guide for people. The rules across the game are the [root AGENTS.md](../../AGENTS.md); `node/`, `page/`, `test/` and `examples/` have an AGENTS.md of their own.

## Rules

- **Every harness is permanent.** A measure is a lab command from its first use (a module in `page/`, an entry in `page/commands.ts`, one in `node/commands.mjs`, its options in `node/options.mjs` and its entry in `COMMANDS.md`), or part of one that measures the same thing, never a probe left in `.tmp`.
- **A probe never takes the pointer.** Measure through the lab, whose browser stubs pointer lock, keyboard lock and fullscreen (a measure of mouse look has the page play the lock, `lab.pointerLock`); a page of your own grabbed the user's mouse.
- **A check run often takes minutes**, not half an hour (Don't waste compute in the root's Workflow): `--profile` it, cut what its measures don't read, run side by side what doesn't depend on each other, and while iterating run only the scenarios a change can touch.
- **Send a long run's output to a file** in `.tmp` (an `--ab` run, a check) and read its parts: read through `head` or `tail`, a run's end was lost.
- **Stop the server with `npm run lab -- stop`**: its supervisor starts a killed server again. It stops every command running in a process of its own from this tree too (`check`, `pwa`, one run without the server: `node/running.mjs`), which a stopped task doesn't: under Git Bash, `npm run lab` leaves its command no line back to the task, and a stopped check ran on to its end, eight browsers at full load.
- **Don't load the shared PC for more than about two minutes unasked** (the root's Workflow): a whole check of the old harness for a "before" number pinned the CPU and GPU for over 17 minutes. Take old timings from past runs' `out/check/durations.json` and logs, or time one narrow job.
- **The lab runs below normal priority, and lowers itself** (`node/priority.mjs`, #283): its command line, its server's supervisor and the server lower themselves as they start, before any browser, Vite or worker, which inherit it on Windows; each browser's processes Chrome raises (its GPU process as it starts, a page's renderer as it shows it) are lowered again after its launch and each page's load (`lowerProcesses` in `node/browser.mjs`, by the browser's own `SystemInfo.getProcessInfo`). At normal priority its runs froze the owner's desktop for 10 to 20 s, about a dozen times over one task. `lab status` and the supervisor's first line say what it runs at; check its browsers with their process tree's `PriorityClass` (a page's renderer may sit at Idle, lower still).

## Commands at a glance

- `npm run lab:serve`: boots each command's page ahead of it (every command runs on a fresh boot and gives the same result every time)
- `npm run lab -- sheet`: pictures the hero in the player's views with each arm's load beside them
- `carry`: measures the carried bow
- `feet`: the feet against the ground round the dais's edges and on level ground (standing at full draw, walking across, strafing drawn, running reversals: out of reach, wobbling, sliding, in a riser, the rhythm)
- `range`: every joint against a body's ranges frame by frame (standing, walking each way, attacking, and walks that change direction while he attacks, held or tapped, or runs: each angle past its range, its worst and where, each frame's pose timed by the browser's clock (two frames over 20 ms fail, or one over 30), each scenario's fastest ankle and weapon tip, a two-hander let go of by the other hand, an arm held at two or more of its joints' stops at once (said, #307), the weapon through his own legs or trunk (said), the forearms and hands in the trunk, head or legs (said), a cast's weapon nearest the floor and its blade's tilt, the weapon's tip traced through a cast and drawn (its fast frames off a straight line from above), `--foe` a foe ahead and the weapon's lowest over it, `--at`/`--facing` stood elsewhere (the dais's edge), `--trace` the leg IK frame by frame as `gait --trace` lists it, each frame's joints past their ranges beside it)
- `eyes <skill>`: a skill cast through the eyes, frame by frame (where the blade goes across the view, wound up, through the blow and where it ends, how fast, where it is as the skill fires; a two-hander let go of by the other hand, seen or not, or seen in one hand; a fist open on its handle; the arm drawn against its swing's keys, the weapon's way and flat too; the arms' joints past their ranges where they're seen; the arms in the body the view hides, said; the weapon and the elbows jumping between frames; a film of the frames)
- `swing <name>`: a swing through the eyes keyed from a pose (the key that holds a grip and a weapon's way, and what of it the swing's plane can't hold; each key placed as the game places it at its share: the grip, the weapon and its share in the frame, the elbow, the wrist, a two-hander's lower grip against the other arm's reach, where it starts against the swing before's end; turned as the trunk turns the cut or its way back; the whole swing in 1% steps, an elbow turned over and a lower grip past reach between the keys; `all`: every swing of every weapon each way held, as `check` runs it)
- `match <picture>`: the hero standing through the eyes beside a reference's screenshot, on a screen of its shape (the screenshot, his frame, the two blended, the points marked on it and his drawn on each, and how far his are off)
- `coop`: two games playing together, the host's and a guest's beside it, their messages carried as a link of a high ping and jitter carries them (`--ping`, `--jitter`: how far behind and how roughly each shows the other's heroes and foes, how its timeline plays them out, whether an arrow that struck a foe on the guest's screen counted, each foe's duck or blink out of the guest's shots on both screens, whether a blow it dodged hurt it, the lava thrown at it landing alike and hurting it, a vine holding it and its copy shown held on the host's, a guest brought down and raised, a guest's blink as the host's screen shows it: when it hid the copy, where the copy came out, the foes it dazed on both screens, `--class mage`; a guest's charge carrying foes on both screens, and a Power Strike landed in it, `--class warrior`)
- `stops`: the hero coming to a stop from a run as a person stops (runs let go at different points of a stride, on level ground, drawn and by the dais's edges: the steps once still, a foot put out and drawn back, steps back, a foot on another level than the body's or stepped onto one once still, `--trace`, `--only`)
- `gait`: the walk judged as a person's (level ground and the steps, nothing drawn, drawn, tapping, changing direction often and going round in circles: each foot's time on the ground against the plan, both and neither, the steps a second and their length, hops, a foot dance's short steps, the gallops (a foot leaving within 0.3 of a stride of the other's: counted as hops, both feet within a few frames, a gallop at every set-off went unseen), the steps' width, the hips' rise and fall, a planted foot dragged, each hand's swing against its knee half second by half second, the rhythm against the walk cycle, steps back under a body that stopped, the jerks, each step's swing against its plan and why it left, every frame judged as a body's: its centre of mass with its gear against the push its motion needs from the planted soles, in the air falling as a body does, and every joint within its range, `--trace` each frame (`--span` some), a scenario held up by a prop failing it, and a film of each round its first hop)
- `form`: the run judged against a runner's (published runners' cadence, time on the ground, joint curves over the stride, lean, bounce and arm swing, at a man's size, with each way the hero holds his weapons: stick figures of his stride over a runner's, and the hero pictured from both sides, in the game's views and his arms close up, at eight points of it; the set-up's `--gear` holds them any way his class can)
- `probe <module>`: runs a measure of your own on the lab's clock and set-ups
- `live <step>`: a page kept between steps for trying by hand (start, picture in any look with a reference over
  it, inspect, eval, frames): under a second a picture
- `pwa`: a deploy as a returning player meets it (main's production build loaded until its offline worker has the page and the fonts, this tree's served in its place and reloaded under the old worker, the new one and offline: the game's fonts on every load, this tree's build on every one after the swap), and the installed app after a PR's previews were visited (opened offline, at a pruned preview build and at a closed PR's: the game every time)
- `check`: runs every hero's checks of a change to how they move side by side (`--ab`: against main, its side kept once it has run; each gait scenario from three starts, its turns at other points of a stride, as a frame's change anywhere sends a scenario's later strides elsewhere: judge a change on the counts over all of them, each side's in the log; a page kept from job to job where that was shown to change nothing, `--reuse=false` and `--like` to show it again; `--plan` the jobs' order and end, `--only` some of them)
- `ui`: pictures the UI in its states (the lobby, a tooltip, the stash's items lit for a hovered item's slot, at set moments of the glow, its loops animating only what the compositor moves and running on the hovered item and the slots alone, How to play, the save slots, the hero selection screen over the hall of heroes (the hero framed in the room its panel leaves, a neighbour clicked into focus, Esc back), a battleground button clicked and a key pressed after it, the lobby's views switched with each label against its anchor through every glide, the dummies' labels hidden behind a prop planted before them, the run's HUD with a hurt foe's bar and damage numbers, the scores, the perf overlay, the choice after a wave with each button's label on one line, the pause menu, the summary, every skill's tooltip within the window, opened by the mouse over the hotbar and by a tap in the lobby, the battle log, and on touch, clear of the touch HUD and letting touches through; a stash item's sheet by a tap, its long cards scrolling and its buttons in view; a worn item's long press lighting its slot's items until a tap elsewhere; the touch HUD's corners at the
screen's edges, and the choice after a wave within a short screen's top 30%) with each named element's and label's box as a share of the window, the game's own cursor over every element the mouse can be over, and every digit shown on its line, on the page and over the world
- `wind`: the loading screen's exit as it hands over to the lobby's logo (run on the lab's clock, the window resized as the particles fly with `--resize`: the particles' picture as each column of it rests, read from the exit's canvas, against the logo once the exit is done, at the screen's own pixels: the pixels apart and which way the logo stands from them)
- `touch`: the touch controls' move stick pushed by a finger, its touches sent as a touch screen's (slid out through the stick's travel, to its edge and far past it, half the window across: the stick's push, the knob against the finger and the hero's speed, a push further out never giving less)
- `practice`: casting in the lobby and the runs it starts (each skill with a cooldown cast twice at once in the lobby, in practice, shown again, folded and in runs started from it and begun in practice, a co-op guest's: free where the lobby shows, a run's costs and cooldowns elsewhere)
- `tap`: the touch buttons of every skill aimed by holding, the other thumb on the move stick (tapped standing, at once and walking: a movement skill the way he moves, any other at the nearest foe; dragged while the stick moves: the skill's own preview following the drag, cast where it last showed, the stick still walking him)
- `light`: the frame's light as the player sees it (the hero standing in each biome, view and facing, the frame drawn and read back from the canvas: its light as a share of the screen's white, by thirds, its brightest pixels, near white and past it; `--hdr` draws each again in HDR and checks it against the SDR frame)
- `envcost`: what the environment's lookups take of the GPU (the frame with the scene's environment and without, in turns within one page; with `--ab` each commit against itself)
- `fire`: each biome's fire as the player meets it (read from beside it with its own light and without: how tall and wide it burns, its light and hue from its base up, what of it is blown out white, its tongues, the smoke over it, how it moves and swells, its flashes on the screen; its flames alone from round them, turning with the camera or holding their shape; the plants over it; `--cost` what its flames take of the GPU; pictured beside it, alone, from above, round it and in the game's views)
- `hall`: the hero in focus in the hall of heroes showing off his skill and standing after it (each hand, elbow and the weapon's tip frame by frame in his own frame: a move a frame changing by over 12 cm a jerk, 40 as the weapon flies, the tip's by its speed; `--gear`/`--weapon` the weapon in his hand there), then the hall left mid-showcase and any sound it leaves playing; `--glow` the light round the weapon's tip frame by frame (the staff's crystal: near white, its median and brightest frames, its flashes, pictured at its brightest)
- `glance`: the hero's casual look round as he stands idle (the head's turn from the chest and the eyes' in their sockets, frame by frame: in the countdown, the lobby and the hall after his showcase; none walking, attacking or through the eyes; within a neck's range, its speed, a jerk, the eyes leading, never a loop; a strip of the first glance)
- `poses`: the hero's pose a move at a time as a digest to the last bit (every object's world matrix, every moving point of cloth: standing, walking, strafing attacking, stopped), and his `animate` timed each frame: a change made to cost less keeps the pose when an A/B's digests agree
- `coat`: the hero's skirts and hood as he stands at idle (every point of the cloth in its own space frame by frame: a move a frame changing by over 1 cm a jerk, with the hand nearest)
- `haze`: the hero's held weapons' light through the eyes (each way he looks: their surface blown out near white, their bloom past it, and the frame round them darkened by the adaptation to them)
- `spawns`: the foes coming in (boss waves one after another, a seed each: the gate every foe came by, its spot against the props, the gates each group and wave left idle, when the boss came against the rest of its wave, and its walk to the hero from each gate)
- `health`: the low-Health look (the hero's Health held at shares of his most in each biome, view and facing: the colour drained, the blood's cover and how far in it reaches, nothing in the view's middle, more of both as the Health falls, none above where it starts)
- `hood`: the mage's hood against its reference (`--ref marks.json`): its outline from three sides over the reference's in the face's unit, the head under it in that unit (to lay the reference's outline out as a stand-off from the head), its rim, point and capelet against the reference's sizes (its marks' `sizes`), its fullness behind the head at the chin and the nape, its opening round the face from the front and the side against the reference's piping (where the rim runs down to the throat, the face shown ahead of it), its seam's straightness, the capelet's lie and his body through the hood above it, standing and walking, its sway as he walks
- `turnaround`: the hero standing in a plain studio from a sheet's four sides and his head close, with a reference sheet's panels in a row under ours (`--ref`, `--panels`), and his triangles
- `neck`: each hero's neck, bare, dressed and in his hat, at rest and looking aside (ledges, the head's skin's seam on the neck, girth, skin through the clothes, the ground seen through round the collar; pictured from six sides)
- `held`: every held skill's preview as the player holds it (ready, then through its cooldown and short of energy: its own look, red and counting down until a release would cast; Quarry Mark's outline round its foe in every view, its pixels near the foe and none away; Starfall's ring against its strikes, every foe inside it struck on every cast; every mark on the floor held across the dais's step, on each level and down its faces, none of it under the floor or standing off it; no shader compiled meanwhile)
- `shots`: the bow's shots at a boss with its foes packed round it (each biome and view, the bow drawn to full over points across them and loosed, its flight followed frame by frame: the first foe drawn along it struck, none if none, and one aimed inside a foe reaching it unless another is in the way)
- `blink`: the mage's blink cast as the player casts it (open ground, past his reach, into a prop, past one, the arena's edge, onto the dais, his own feet: where it came out against its preview and his reach, the frames he was hidden and the blows that landed in them, the foes near and far it dazed and how they stood)
- `draw`: each drawn shot held at full draw as the player holds it (the glint round its arrowhead every frame in every view: none as it's drawn, held at full until it's loosed, the pixels it lights as the player sees it, and no blob of glare; the bow's light lit at full draw alone; the crosshair bold at full draw alone, its one beat into it about its middle, none with reduced motion)
- `cast`: a skill cast as the player casts it, its effect seen frame by frame (each biome and view with the biome's foes coming at him, every frame drawn and read back: its light against the budget, the frame's mean every tenth of a second, the flashes in any second and the changes counted in the worst cell's, the shaders compiled late)
- `trail`: the trail a swung weapon leaves (each strike in each view, every frame drawn with it and without: its light where the weapons swept over the last 0.15 s, lit through every blow, its newest end on the blade, nothing while the weapons are still)
- `death`: each skill's kills as they fall (foes stood dazed where it strikes, a hair from death and with little to spare: how hard each body was thrown and which way, how far it flew, when it lay still; its drawn pose against the floor, the props, the wall and its points)
- `hits <skills>`: each skill's blows as they land on foes stood where it strikes (when each landed from the press, the gaps between them, the damage a second; held to `--apart` and to `--than`'s pace)
- `log`: the battle log held to every hit as it lands (each skill cast at foes, in each way of holding weapons: each hit listed once and in turn, under its skill, on its foe, for what it dealt, of its type, a crit and a kill as they were, the panel showing every line; three foes striking, one shooting and one slamming the hero: each blow under the foe's name and attack, for what it took and what was stopped; each row naming the hero alone on his side; paused, nothing listed)
- `tooltips`: each damage skill's tooltip held to the hits it deals (the hero given modifiers of every kind, each skill cast at foes in each way of holding weapons: every hit within a figure its tooltip states, a crit raised by its share, a crit's chance the hero's, a channel's ticks as often as it says; the hotbar's tooltip following a weapon's damage changed; the draught's heal and Iron Bellow's ward as stated)
- `spin`: mouse look turned one way for a long while in each close view, then the other, the browser's own jump under the lock sent mid-spin (no frame turning the view past three times the spin's steady turn, #318)
- `cursor`: the cursor drawn over mouse look while Alt is held, in each close view (the lab's browser playing the pointer lock: the view held still as the mouse moves, the cursor drawn where it went and lit over a button, the battle log's Pause clicked without an attack, a hotbar slot's tooltip, the wheel scrolling the log's lines and not zooming, the world not attacked; Alt let go, mouse look again; the lock held and the run going on)
- `rush`: the foes Bull Rush sweeps up (stood dazed on its line and at its sides, killed, an elite and the boss, in a lane clear of props: when each was met, how long it rode before the hero and how near his body, how it was let go and where it ended against his stop), and skills cast with it (a Power Strike charged and the charge cast over it, a cleave and Twin Fangs as it runs, a strike at its stop, the charge cast over a held Steel Tempest: when each was cast and landed, what the charge's own blows struck, what was shown, his strides)
- `evade`: the shooters getting out of the hero's attacks (each foe that evades held before him and each attack of his it evades cast at it try after try: from in front about half evaded, none struck after evading, every other struck; from behind none evaded; a ducked foe struck at its feet; each blink within its reach, clear of the props, the wall and the hero)
- `throws`: what the slammers throw at a hero too far off to slam (the Brute's lava at him stood still: landing where he stood as it was thrown, its ring there every frame it flies, its splash and pool hurting him; stepped off, nothing hurting him; up close, a slam and no throw; the Hulk's vine holding him for its hold, his walking going nowhere; stepped aside, never caught; stepped back onto it as it lies, held; a dash tearing him free)
- `crowd`: a crowd of foes killed at once and what the frame costs as they fall (each frame timed by the browser's clock with the game drawn, the bodies' part apart, at each CPU slowdown, as a low-end device's, and frame rate)
- `draws`: one frame's draw calls with the crowd standing, by what drew them (the geometries drawn most often, those that drew the most triangles, the triangles drawn outside the view of the pass that drew them, the draws that drew nothing, the scene's draws by their material's look, through the eyes what the arms' own camera drew, the hero's arms and what they hold alone; the scene's objects whose matrices are made again each frame)
- `perf <skills>`: skills cast in turn with the biome's foes coming, every frame timed as the game's performance report times it (the frame, the update by stage, the render, the GPU by pass, the draws, triangles and the particles' fill), on a phone's screen, boot and CPU if asked
- `programs`: the programs the boot compiled, from the game's dev-only ledger (how many each loading step made, behind the lobby too, by the warm-ups' compile or by a draw; each kind with the fields of its key that set its programs apart; those never drawn; those made after the reveal); `--cost`: each compiled again alone, salted so no cache answers, and timed (by kind, by what uses them, each step's by what uses them, by its point lights, the longest, a plain lit material by part)
- `compiles`: whether the boot's warm-up compiled what a fight draws (a prop of every kind broken, the first wave fought and a Brute's and a Hulk's throws in each biome, and again by a hero built afresh: every program compiled meanwhile, and the draw that first used it; the point lights each pass is lit by, against the boot's; `--switch` picks another class on the hero selection screen first, each hero shown in the hall of heroes, whose room and skills are warmed with the heroes)
- `maps`: the procedural maps a first visit's workers make, each timed alone with a digest of its pixels (a map made faster must keep every one: `--ab`), its seams (a repeated map must tile) and its means; `--pictures` shows each as a surface takes it
- `tiles`: how big each repeated map's tile comes out on each surface of a biome, in metres along u and v, how stretched and its pixels a metre (a surface's UVs decide it: size a map's repeat by it); `--pictures` shows each surface as the player meets it
- `winding`: which way every model's and biome's faces point (each mesh split into its parts, each judged by its signed volume: a part wound inside out on a one-sided material shows its inside)
- `wall`: how near the hero walks up to the wall (at angles round the ring he walks straight out until it stops him; the gap between his body and the nearest surface drawn)
- `rim`: the hero walked round the wall pressed into it, each way (a frame he moved further than a run takes him, thrown by the wall; a stop he can't walk back in from, stuck)
- `beyond`: the ranger's arrows loosed over the wall at the ground and the trees beyond it, over the shoulder; each arrow left standing must have a surface drawn at its point
- `trees`: the trees in the play area as the ranger's arrows meet them (every tree inside the wall a wooden prop, an arrow shot at each one's trunk standing in it; then another biome shown, and no arrow left)
- `columns`: the crypt's broken columns roll after roll (no open edge in a mesh, no cliff across a break's face)
- `shadows`: the hero's shadow cast as one against his pieces cast alone (each weapon style, armoured and bare, each view: the frame drawn both ways, pixels apart past a texel's rounding; `--cost` the shadow map's draw)
- `gear`: full sets of gear rolled for every class at each tier (the Health, regeneration and draught they give, and the damage they multiply)
- `weapons`: each of the hero's weapons alone in a lit studio (face on, edge on, from behind, from three-quarters and its head close up, with its size and its triangles)
- `hands`: the hero's right hand alone in the studio, flat, open, relaxed, in a fist and round a handle, from each side and close up (its size against a man's, its triangles, where it was sculpted)
- `music`: each biome's music as the player hears it (its lobby, a run's countdowns, fights and wins, a hidden tab and the bank back: which track plays, how it fades, where it comes in, what reaches WebAudio)

Options every command takes:

- `--screen WxH@ratio`: puts a command's page on a screen of that size and pixel ratio
- `--insets l,t,r,b`: with `--screen`, the screen's safe-area insets (css px), as a phone's camera cutout gives them
- `--screens a,b`: runs it on two screens and compares them as `--ab` compares two commits (`ui --screens 3840x2160@1,1280x720@3`: a 4K screen at 100% and 300%)
- `--ab`: runs any of them on `origin/main` too and says which lines and pictures differ (a commit against itself agrees, line for line), and for each picture that differs, where and how bright this side is there against main's (`×0.72 as bright there`: a look kept or lost, `node/pictures.mjs`)
- `--watch`: runs one again on each change to the source
- `--profile`: says where a command's time went
- `--tune name.field=v,...;...`: sets the game's tunable values before a command's set-up (`src/core/tuning.ts`: `warriorEyes.oneOn=0.75,-1.1,0.5`), so a pose or a camera is compared across values in seconds, without editing the source and booting again; `name.field[i,j]=v` sets some of a list's numbers alone (a swing's keys); given twice, the two are joined (any other option given twice is refused: a second `--tune` once replaced the first unsaid)
- `--sweep name.field=a|b|c;...`: runs a command once for each value, or each combination of several, over its `--tune`, on the lab's server, each run's problems in full and the runs with the fewest named (a filter on the runs' output hid three failures on the runs it called best)
- `--boot level[@pixels]`: the page booted as a device whose Auto settled on that quality (`low@518400`: #243's phone): Auto's cookie set before the boot, so its warm-ups run at that level and the hero is built at its detail; a page booted ahead counts as ready only for the same boot
- `--cold`: the page booted as a player's first visit (or a new build's) leaves it: the lab's own boot asks for everything the game warms after the lobby shows (`src/game/warm.ts`: the fight's programs, the other heroes') and waits for it; a cold one asks for nothing, so those stay cold until something needs them, as in the owner's lobby (`programs --cold`: its performance report counted every program as compiled late)
- `--wear helm,chest,hands|none` (any command that sets the run up): the armour the hero wears, every piece not named left off (the set-up's report says what he `wears`): with `--screen` at the owner's window, a picture of what they see (the lab's hero is otherwise as the boot rolled him, bare-handed, and his first-person hands looked nothing like the owner's gloved ones)

A command exits with 1 when it failed or found a problem (an error in the page, a canary missed; not the dev server's own client's, whose socket the lab never uses: on a machine short of sockets it failed to connect, and failed jobs the game had passed, `fromDevClient` in `node/side.mjs`). An A/B's pictures that differ are pictured where they differ (`tools/lab/out/ab/<command>/`), a probe can return moments pictured (`lab.picture`, or `lab.screen` for the screen as the player sees it, the page's UI over the game, whole or round one element; written as a sheet and compared in an A/B), and `page/timing.ts` times a method's calls by the browser's own clock (the page's `performance.now` is the lab's). Write a new measure in the lab (`tools/lab/examples/handSpeed.ts` shows its parts: the state it measures checked to have happened, a canary it must catch), never as a script with a boot and a clock of its own, and keep it: from its first use it is a lab command, or part of one that measures the same thing, never a probe left in `.tmp` (every harness is permanent). The probes and films the AGENTS.md files and their notes name (the bow probe, the range probe, `legdet`, the zigzag and aim probes...) were such scripts and aren't in the repo: each is a measure to port into the lab the first time it's needed again, as the carry's was (`carry`). The lab's own code has unit tests: `npm run lab:test`.

## Commands

Each command in full (what it measures and what it was measured against, its options, the looks a picture takes and
the options every command takes) is in [`COMMANDS.md`](COMMANDS.md), out of this file, which every session working on
the lab loads whole, as it neared 120k characters. Read a command's entry there before running it for a measure or
changing it; a new command gets its line in Commands at a glance above and its entry there. The largest entries are
notes of their own in [`commands/`](commands) (`eyes`, `ui`, `gait`, `held`, `coop`, `swing`, `rush`, `check`), a line in
`COMMANDS.md` pointing to each, as `COMMANDS.md` neared 120k in turn: an entry that grows past some 4k characters
moves there too.

## Writing a measure

A measure starts as a probe module: a TypeScript file whose default export takes the lab and the command's options,
and returns text, anything JSON can hold, or a `Report` (`{ text, problems }`: its problems fail the command).
[`examples/handSpeed.ts`](examples/handSpeed.ts) is a short one with every part a measure needs:

```ts
import type { Lab, Report } from '../page/lab';

export default async function handSpeed(lab: Lab, options: { canary?: boolean }): Promise<Report> {
  const start = lab.player.pos.clone();
  const rows = await lab.step(150, (frame) => ({ keys: frame < 60 ? [] : ['w'] }), (frame) => {
    // measure the frame as it would be drawn (the world matrices are up to date)
  });
  const problems = lab.player.pos.distanceTo(start) < 1 ? ['the hero never walked'] : [];
  return { text: '...', problems };
}
```

It runs on a page booted for it, after the set-up the command's options ask for (the run held in its countdown, the
hero placed, stopped and settled), and may import the game's modules by relative path. While you work on it, keep it
in `.tmp`: it is compiled afresh on every run, with the modules beside it it imports. With `--ab` those files are
copied into the other commit, so the same measure runs on both sides.

What the lab gives a probe (`page/lab.ts`):

- `lab.player`, `lab.model`, `lab.joints`, and `lab.THREE` (three.js as the game has it);
- `lab.setup(fixture)`: the run set up afresh (`at`, `facing`, `view`, `nocked`, `gear`, `fresh`), checked, and its report.
  A probe may set up many cases one after another, but each follows on from the ones before it: the hero is the same
  one, and the game's clock, which his idle runs on, only goes forward (to the next whole minute at each set-up, so
  the idle is at the same moment whatever ran before; the hero's own state still carries over). A scan is the same
  every time it runs, but one of its cases run alone may come out otherwise, so trace a case by running the cases
  before it first (an option of the probe's own: `--trace=<case>`, say), or run each on a page of its own as a check
  runs the gait's;
- `lab.step(count, input?, measure?)`: frames run with each frame's input (`keys`, `m0` / `m2` for the mouse buttons,
  `look` for mouse look, `aim` for the point the mouse is over, `sight` for a point the close views' crosshair is
  turned onto: a mouse-look move a frame, over it in one or two) and measured after each, a row a frame;
- `lab.until(done, limit, what, input?)`: frames until `done`, throwing `lab: <what>` if it never is;
- `lab.spawnFoe(type, at, options)`: a foe for a measure that needs one (a mark, a lure; `options` as the game's
  `EnemyOpts`: a hero foe with its name, say), which the set-up keeps while it clears every other until the next
  set-up; it rises first as a spawned foe does (`Enemy.spawning`), and a training dummy (`dummy`) stands still;
- `lab.letWavesCome()`: the run's waves let come until the next set-up, the hero still kept whole; a measure sets one
  off itself (`G.run.wave`, its `timer` to 0) and reads its foes as they rise;
- `lab.capture(views)`: pictures of this moment as PNGs (`lab.drawing = true` draws every frame instead), and
  `lab.picture(label, views, notes)` one moment of a report's `moments`: the lab writes them as a sheet
  (`out/probes/<probe>/sheet.png`) and compares them in an A/B, as the sheet's (to see the frames a measure flagged,
  run the measure's input to them and picture each);
- `await lab.screen(label, notes, around?)`: this moment as the player sees it, the game drawn by its own camera with the
  page's UI over it (the HUD, a menu, a tooltip), pictured by the browser, whole, clipped round the element a CSS
  selector names (`'#hotbar'`) or to an area of the page (`screenArea(points)`: round points of the world as the
  camera shows them), as a moment of the report's `moments` (`picture`'s views show the game's canvas alone), the
  page's running animations settled first (they run on the browser's clock: an A/B's two sides caught the wave's
  banner at other moments of its fade; one a command holds paused is left as it is, and so is one a scroll drives,
  at rest while its scroll is: ended, the stash's fade was held hidden over the row it fades, `onTheClock`); taken
  through the DevTools protocol at the screen's own pixels (Playwright's screenshot put the page back on the screen
  Playwright had given it, and on a `--screen` every picture after the first showed 1920x1080);
- `timeCalls(owner, method)` (`page/timing.ts`): every call of a method timed by the browser's own clock (the page's
  `performance.now` is the lab's, which stands still within a frame), for a cost: its calls, total, median and 90th
  percentile. The timer ticks in 0.1 ms, so take a frame's mean over many, and compare sides within one A/B (the
  machine's load drifts between commands). Its `lap()` says what the calls took since the last lap: a frame's, read
  after each frame (`crowd`);
- `await lab.showOn(screen)`: the page put on another screen as the command runs (`{ width, height, ratio }`, css
  px, as `--screen` names one), as the player's window is taken to full screen or onto another monitor: the page lays
  itself out again and hears a resize, and the browser draws a frame (`wind --resize`);
- `await lab.throttle(rate)`: the page's CPU slowed `rate` times as the browser emulates a slower device's (DevTools'
  presets: 4 a mid-range phone, 6 a low-end one), sent through the DevTools protocol: times read by the browser's
  own clock take that much longer, while the lab's frames stay as long as ever. Set it up at full speed and slow
  only what's measured (`crowd`);
- `lab.aim` and `lab.pointAt(point)`: where the mouse is;
- `await lab.touchDown(at, finger)`, `touchMove(at, finger)`, `touchUp(finger)`: a finger on the page (css px) as a
  touch screen gives it, sent through the DevTools protocol, so the page's own pointer events follow with their
  pointer ids and its touch controls take it as a player's (no frame runs; each returns once the page has handled
  it). `finger` (0 by default) tells fingers down at once apart: a thumb on the move stick and the other on a skill
  (`tap`). Each touch names only the finger it changes, by its id, as Puppeteer sends them: sent as the protocol's
  docs have it (every finger down in each touch, the one lifted left out), a finger left out was never lifted. The
  game's first touch puts it in touch mode, as a player's does, and its controls show from the next frame.
  `await lab.tap(at)` puts a finger down and lifts it, and returns once the page has handled the click the browser
  makes of it, which comes in a task after the lift (`touchUp` returns before it: a button tapped hadn't heard it);
- `await lab.click(at)` and `lab.press(code)`: a click of the mouse's left button on the page (css px) and a key
  (`KeyW`, `Space`) as a mouse and a keyboard give them, sent through the DevTools protocol, so the browser handles
  them as a player's, the focus with them (a script's `click()` and events moved none and showed no focus ring);
  `lab.clickOn(element)` clicks an element at its middle, scrolled to and once the page's CSS transitions are over
  (the lab's frames outrun the browser's clock, and a panel sliding back in took a click 31 px off its tab; a move
  to where the mouse already is makes no pointer move, so a click there skips it), `lab.mouseTo(at)` moves the
  mouse alone, `lab.wheel(at, deltaY)` turns its wheel, and `lab.keyDown(code)` /
  `keyUp(code)` hold a key and let it go (`AltLeft`, `ControlLeft` too). A frame the lab runs holds a key in the game
  only if its input does (`Frame.keys`): hold it there too, by the game's name (`altleft`);
- `lab.pointerLock(on)`: the pointer lock played by the page (`noCapture` in `node/browser.mjs`; the real one is never
  taken): asked for after a click or a key, it's taken, and while it's held the mouse's every event goes to the
  locked element, at the point where it was taken, its moves told as movement alone, a cancelled pointer's down
  holding back the mouse's own as the browser does. Off, it's let go, which the game hears as a lock lost (a run's
  pauses): put the view top-down first, so the game lets go of it itself (`cursor`);
- `await lab.reduceMotion(reduced)`: the page's `prefers-reduced-motion` as the browser emulates it. Every page opens
  with it reduced (the page's decorative animation left out); a measure of such an animation (the crosshair's beat,
  `draw`) lets it run and puts it back as it ends. CSS's animations run on the page's clock, not the lab's: read them
  with `getAnimations()`, and hold one at a moment to picture it;
- in `page/geometry.ts`, the body's meshes skinned into the world as drawn (`BakedBody`), what a line crosses among
  them (`crossingsAlong`), and the distance between segments (`segmentDistance`);
- `distinctCorners(positions)` (`page/corners.ts`): a mesh's corners, each place once (a mesh repeats one for each
  face whose normals part there: the mage's staff has 12,234 points at 2,515 places).

A measure read every frame costs every frame, in every job a check runs: read each frame only what the frame's
verdicts use, and what can't change (a weapon's head, a geometry's box) once. Through the eyes, each frame read the
weapon's head off its meshes for a share no frame kept, a third of each job; the range's floor and body read every
corner of the weapon five times over, 60% of its jobs. `--profile` shows a measure's share beside the game's frames.

A measure is only as good as what it can catch:

- **Check the state happened.** A measure of a state that never came reads as clean: a probe that scripted the game
  before its run began reported no clips at full draw, because it never drew. Throw `lab: ...` or report a problem
  when the walk didn't walk or the draw didn't draw.
- **Carry a canary.** Plant the fault the measure is for (the bow moved into the hips for a frame, a hand moved
  10 cm) and report a problem when it isn't caught. Run it when the measure changes.
- **Measure, don't choose.** A pose is decided as a person would hold it and looked at in the game's views first
  (`sheet`); a measure checks it (`src/entities/models/AGENTS.md`).

Every measure is kept: from its first use it is a command of its own in `page/` (a module, an entry in
`page/commands.ts`, one in `node/commands.mjs` and its options in `node/options.mjs`), as the carry's and the touch
stick's are, or a part of one that already measures the same thing, never a probe left in `.tmp`.

## How it works

With `lab:serve` up, the next command's page is booted as soon as a command finishes, and again once the source has
been left alone for a moment after a change, so a command finds it ready: the sheet takes about 2 s, the carry 5.
Without it, a command boots a session of its own (about 15 s) and closes it. The server runs under a supervisor of
the lab's own, which starts it again when what the lab's Node code says changes (not on every change Windows
reports: a file read now and then counts as one, and a server started again under a command closed its browser),
launches its browser again if it has closed (it crashed: every command after it failed until the server restarted),
and every command carries a hash of the code it was sent from: a server that loaded other code starts again before it
runs it (`node --watch` once stopped noticing changes, and the server ran old code that dropped an option the command
line had just learnt). Its Vite server starts again when `vite.config.ts` or the packages change. Stopping the
terminal's task stops it all.

A boot that fails fails at once, with why (`side.mjs` `openPageIn`): a boot that threw says so on the game's loading
screen, and a module Vite couldn't compile answers its request with an error, which the lab asks for again to say
Vite's message (where it went wrong in which file), and a module that won't link (importing a name another doesn't
export: a page booted between two edits) throws a `SyntaxError` on the page. Waited for the loading screen to go
alone, each was waited out to the timeout, three minutes: a module that wouldn't compile or link never runs, so its
loading screen never says it failed, and the command after it waited behind it.

- `lab.mjs`: the command line. Reads and checks the command (`node/options.mjs`), and sends it to the server on
  127.0.0.1:5196 (`LAB_PORT`; `node/client.mjs`), or runs it in a session of its own.
- `node/`, the Node side:
  - `server.mjs`: `lab:serve`. One command at a time, the next page booted between them, and `--watch`'s changes. It
    only answers the lab's own command line: a POST of JSON for 127.0.0.1 or localhost, from no web page (a page in
    your browser could otherwise send it an `eval`). `supervisor.mjs` runs it (`serverProcess.mjs`) in a child
    process and starts it again when the lab's code says something else (`codeStamp.mjs`, the hash every command is
    checked against), and stops it when whatever started the supervisor is gone.
  - `session.mjs`: a command run on each side it asks for, its report, problems and A/B verdict; `commands.mjs`:
    what each command does on a side and how its results are compared.
  - `side.mjs`: a tree of the game served by a Vite dev server of the lab's own (HMR off, so a measure never meets a
    stale copy of a module) and booted in a page; `commits.mjs`: another commit exported for an A/B.
  - `browser.mjs`: Playwright's Chromium in its native headless mode, and the scripts every page runs first (the
    clock, seeded random numbers, no pointer lock but the page's own when asked, fresh storage).
  - `pwa.mjs`: `lab pwa`, two production builds served in turn by `staticHost.mjs` (as Pages serves the game) to a
    browser of its own, the offline worker and all.
  - `compare.mjs` (the reports' verdict), `pictures.mjs` (the pictures'), `profile.mjs` and `sourceMaps.mjs`
    (`--profile`, its functions traced back through Vite's source maps to their lines in the source),
    `sheetImage.mjs` (the sheet as one image), `probeFiles.mjs`, `errors.mjs`, `paths.mjs`.
- `page/`: the lab inside the game's page, TypeScript typechecked with the game (`tsconfig.json` includes it, and
  `examples/`), imported as the game imports its modules, so there is one copy of each. `lab.ts` (the clock, input,
  set-ups, pictures), `commands.ts` (what the session calls: each command's module loaded as it runs, as an A/B copies
  these modules into the other commit's tree, and one measuring game code that commit hasn't got stopped every command
  loading there), `sheet.ts`, `carry.ts`, `comfort.ts`, `geometry.ts`,
  `ranger.ts` (the bow's handle, `bow.group.userData.bow`).
- `test/`: the Node side's tests, `npm run lab:test`.
- `out/`: everything the lab writes (sheets, exported commits, Vite's cache, the browser's profile), never the user's
  temp folder.

Some of what that takes:

- **Every command on a fresh page.** A page a command ran on is left as that command left it (the game's clock on,
  the hero wherever it took him), and a set-up on it starts from another moment, so it is never used again. Within
  one command its steps run in order on its page (the sheet's states one after another), the same order every time.
  A check alone keeps pages from job to job, for the commands shown to come out the same that way, each set-up
  afresh in a run of its own (`commands/check.md`). A page is booted once every map the loading workers make has
  come (`mapsCome`: one landing mid-command drew the crypt's foes otherwise on a loaded machine).
- **The clock.** From the moment the loading screen reveals the game, its frames run on the lab's clock: each a hair
  over a 60th of a second, as fast as the page can, nothing drawn unless asked (the scene's matrices are still
  updated). Every time the page reads is on a grid of 1/1024 ms, so the game's frame time is exact and the same on
  every boot. Frames run back to back, with nothing landing between them (an A/B's side on a commit from before the
  heroes' capes were taken off steps its capes in the frame, on the main thread, `stepCapesHere`: in the game they
  stepped in a worker, whose results landed a frame or two late, and a commit's pictures against itself differed).
- **Set-ups check themselves** (`Lab.setup`, the `Fixture`): the run held in its countdown (no foes and none coming),
  the hero placed, stopped and settled, an arrow nocked if asked, the view made as the player makes it (V pressed: the
  game sets the camera's view from its own every frame, and set on the camera alone it was top-down again a frame
  later, so `--view first` never took); each step throws if it didn't take, and so does a boot that didn't boot the
  hero asked for.
- **A/B** (`--ab[=ref]`): the commit is exported with `git archive` into `out/commits/<sha>` (no worktree, no links),
  served with its own dependency cache, the lab's page modules copied into it, and each side runs alone in the
  browser, this tree's first. The pictures are compared pixel by pixel in the lab's browser.
- **Rays against the body** (`geometry.ts`, `BakedBody`): the meshes skinned into the world as drawn, each bone's
  matrix made once a frame (three's own way made it again for every vertex, 30 ms a frame), and only the meshes that
  may reach the lines measured, by a bound that holds for any pose (each bone's sphere round its own vertices); every
  baked vertex is checked against it.

## Repeatability

Every command gives the same result on every boot, its pictures too: a commit compared with itself agrees line for
line, and no pixel of its pictures is more than 2 levels apart (the same view drawn twice with nothing changed comes
out a level apart in a few pixels, the GPU's own rounding). What it takes:

- the clock taken over at the reveal, every time on a grid of 1/1024 ms and a frame a whole number of its steps, so
  the game's frame time is exact; and one frame run with the game held still as the lab installs, so the game's timer
  counts from a lab frame;
- `Math.random` seeded, started again as each command starts (after its modules are imported, in the same task:
  each three.js object made draws a random number for its id, and textures land from the workers while a module
  loads) and at each set-up, and as a hero's profile is found missing, just before a new one rolls its gear; and at
  each lab frame, from the last seed and the frames since (`__labFrame`), so a draw one side made and the other didn't
  moves only what's random after it in its own frame (it moved every particle from then on: a crowd's pictures differed
  by 17% of their pixels where its bodies were drawn the same); timers' callbacks draw from a stream of their own,
  since they fire by the browser's clock;
- the game's clock moved forward to the next whole minute at a set-up, storage and cookies cleared at each boot, one
  page alive at a time, and every command on a page booted for it.

Each of these was found as a cause of runs that differed:

- frames run in real time between the reveal and the lab taking over;
- a yield after every frame (async work landed between different frames);
- the loading screen's tips drawing random numbers on a timer, so a slower boot rolled other weapons;
- a saved profile and cookies kept between boots;
- two pages alive at once (one lost focus; the game lets go of the input on a blur);
- the exported commit's ez-tree alias lowercased by the lab (a second copy of three.js, other random draws);
- `Player.place` keeping the velocity (fixed in the game);
- frame times a few bits apart from boot to boot, taken from the browser's clock (a cast of a whole number of 60ths
  ended a frame early or late, one self-A/B in five);
- commands run on a page an earlier one had used;
- the random numbers started again before a command's imports rather than after (one boot in four, the haze and
  pollen spawned before its set-up lay elsewhere in its pictures);
- the first lab frame measured from the game's last real frame, a browser frame earlier on some boots (every
  emitter's bursts a frame early or late, one boot in three);
- the default profile rolled from wherever the boot had left the sequence: a commit that made one more three.js
  object as its modules loaded rolled the ranger another bow and 2 less Health than main, so every A/B of him
  compared two heroes (`ui --ab` differed in 11 of 12 pictures);
- the wave's banner taken off the page by a timer on the browser's clock: one boot in two it was still there at a
  picture, the HUD's layers laid out another way and the hotbar's thin frame lines rastered 20% brighter or dimmer
  (`light --ab` differed in one picture of 18, one run in two). It goes now as its fade ends (`ui/hud.ts`), which
  follows the lab ending it (`settleRunning`), and `screen` lets the browser draw a frame after each round it ends,
  for their ends to reach the page and its layers to fall without them.

To find where two runs part, record each frame's state and each random draw's caller in a probe and compare boots
(two fresh boots, `--setup=false`, the probe setting up itself): the first frame or draw that differs names the cause.
A page picture whose UI differs in how bright its thin lines are, nothing moved, was rastered two ways: `--layers`
lists Chrome's layers at each picture, and where the sides' differ.

## Testing the lab

- `npm run lab:test`: the Node side's unit tests (the command line, the verdicts, the server's checks, the source
  maps), in a second; the PR build runs them.
- Each measure's canary (`carry --canary`, the example's `--canary`): run it when the measure changes.
- `npm run lab -- carry --ab=HEAD` and `sheet --ab=HEAD`: a commit against itself must agree, line for line and pixel
  for pixel; anything else is a cause of runs that differ, to be found and removed as above.
