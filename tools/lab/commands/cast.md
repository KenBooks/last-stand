# `cast`

The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `cast <skill>`: a skill cast as the player casts it, its effect seen frame by frame (`page/cast.ts`; the skill
  named by its key, its behaviour or its name, `--class` for whose; `--gear` and `--weapon` what he holds). The hero
  stands in each biome and view
  (`--biomes`, `--views`, `--facing` in degrees, `--at x,z`: off the dais by default; `--at 0,0` its middle) with the biome's commonest foes coming at him from 13 m ahead
  (`--foes`, 4 by default), and the key is pressed over an aim 8 m ahead: held for a held skill, drawn to full for a
  drawn shot, held 3 s for a channel. Every frame from the press until the effect is over is drawn as the game draws
  it and read back from the canvas (`page/screenCells.ts`: as stored, 0 to 255, and as light by sixteenths of the
  frame). Its light is held to the budget taken from the owner's screenshots: the frame's mean raised by 50 at most
  over the scene before the press, a sixteenth of it 150 at most and 5% of it bright (200 or more) at most, those two
  not judged where the scene alone is past them. The flashes are counted as WCAG counts a general flash
  (`page/flashes.ts`: a pair of opposing changes of a tenth of white in a sixteenth's light, the darker under 0.8),
  three in any second a problem; the changes the worst cell's worst second counted are listed, each the light it
  reached and when (its light every third frame was listed: a hand swung through the cell in a frame or two read as a
  steady fade, and what was counted could not be told). A cell with two or more flashes in a second has them
  shared out among what's in the scene (`page/flashSources.ts`, from play: "our lab should be able to tell what
  flashes exactly... for every skill, every env prop"): the cast is played again from its set-up, and at each
  counted change's two frames (the one it came from, the cell's darkest or brightest since the change before, and
  the one it reached) the frame is drawn again with each thing taken out in turn, and the light the cell loses
  without it is that thing's. A thing is whatever the scene holds under one name (an effect's mesh, a pool of
  particles, a crowd, a biome's prop: name a mesh an effect adds, or it reads `unnamed Mesh (its material)`), and
  each lit light alone, put out by its intensity (a light hidden changes the lights every material is compiled
  for; a group holding one is opened into its parts). Each change is a line: how much of it each thing lit, the
  most first, and `the rest`, what none accounts for (the grade's adaptation, the exposure, one thing covering
  another). It says where the replay's light wasn't the cast's (0.03 of white apart): what it names lit another
  frame then. Read it with these in mind: a thing's share is also what it hid or showed of another (a foe before a
  beam); a light that leaves a cell for its neighbour and comes back is a thing that moved, so look at what moved it
  before the effect's own light (Void Lance's third person, #482: the lance's light left a cell for the one under
  it within a frame, 4 flashes a second, three fixes to the effect changing nothing; pictures of the two frames of
  a change showed the whole lance swung, the hero's aim wheeling to a foe beside him under the crosshair, `lab
  nearaim`); and scenarios run one after another on a page may differ from the same one run alone (the crypt's
  third person counted 4 flashes after `top` and 1 alone, three times in three, by the same aim). It also lists the frame's mean
  every tenth of a second through the cast, and the blinks, listed and not judged (`page/blinks.ts`: a patch of a
  64 by 36 grid brightening by 20 or more over the frame before and back within 3 frames, an effect's own crackle
  among them; a broken prop's rubble piece drawn full size at the world's middle for a frame, beside a hero on the
  dais, was one). `--what s,x,y` says what the eye's ray meets at that moment and point of the screen (% across and
  down), nearest first (`page/whatIsAt.ts`): the runs give the same frames, so a blink one finds, the next can look
  into. It casts through each camera that drew the frame, on the layers it draws: through the eyes, the arms' own
  first, as it draws over the world's. Cast on every layer from the world's camera, it listed the hero's hidden hair at
  the eyes and missed the arms, drawn through a narrower view. The world's ray meets the foes too, by their own
  meshes, on the layer no camera draws, where their crowd draws them (the camera stood inside a husk Bull Rush threw
  ahead of it, and the ray met only the walls past it); and it says what the hero was doing then: his cast and how
  far through it, his channel, a dash, a stagger, a fall, his life. Shaders compiled after loading, and nothing cast,
  are problems too. The
  props a cast broke stand again before the next. `--times` (0.4,1.5,3 by default) are the moments pictured, the
  screen as the player sees it with the HUD, into `out/cast/<skill>`; `--canary` strobes the exposure in the first
  biome and view (5 a second), which the flashes must catch. `--gear` holds the weapons a style's way (Thunder
  Crescent takes a two-hander), and a skill the hero knows but hasn't on a key is bound to its own first.
