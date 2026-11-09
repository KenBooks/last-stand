# `fire`

The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `fire`: each biome's fire as the player meets it (`page/fire.ts`, `page/fireMeasure.ts`, tested in
  `test/fireMeasure.test.mjs`; `--biomes crypt,forest`). Found by its light, the warm one of the biome's ten, the hero
  stood 4.5 m before it towards the middle. For `--seconds` (2), 30 times a second, it's drawn from beside it with its
  own light, without (what draws unlit within 1.5 m of its light, and the glow particles) and without its smoke too:
  the differences are its light alone (graded: the tone curve carries the logs' grain into it) and its smoke (a pale
  smoke over the daylit forest, read as light, was counted into the tips). Read: its size, its light and hue in four
  bands from its base up, the share drawn white, the parts its top 40% breaks into (glow particles count as parts),
  its light's spread, the share above it its smoke changes, how much of it moves a moment, its light's and its point
  light's swing and strongest frequency, and the top-down view's flashes over a second at least. Then at one moment
  its flames alone (all else hidden by its materials, as the culled plants show themselves again each render; the
  adaptation held off, which exposed each picture by itself) from four sides, level from 10 m through 12°: a flame's
  light passes through it, so from behind it's its own mirror, while sheets turned to the camera show one face from
  either side (the owner: "fire rotates when camera rotates"). Its detail (light less its local mean) from behind
  under 0.6 alike its front's mirror, or more alike its front as it is, turns with the camera, unless its front is
  over 0.9 alike its own mirror, too even to tell (main's disc of coals, edge on). And the plants over it
  (`page/fireClear.ts`): the instanced meshes' points the top-down view last drew in its column (its half-width and
  0.3 m round, 2.5 m up). A fire in a bowl (a solid round its bed reaching 0.3 m under it) is read from under the
  rim too (`page/fireBelow.ts`, #291): the share of the bowl's pixels (its meshes' in the `parts` look) its flames
  light, its coals and embers hidden. The flames are a box marched in its shader, depth-tested at its faces, whose
  corners stand out past the bowl's wall: main's lit 22.8% of it, as a pale band up the bowl. Over 2% is a problem.
  A fire with logs its flames know (`uLogs`) is read from above them as the player stands over it
  (`page/fireLogs.ts`): the share of the logs' pixels (the meshes named `logs`) its flames brighten by over 40
  levels, against the same with the logs taken from the shader, and the share knowing them changed. Before the
  shader knew them, the logs inside the box were drawn over by the flames behind them and those reaching out of it
  hid the flames in front ("half of campfire ignores it"): 64% lit from above, 45% since (the flames in front of
  the logs and their bloom over dark bark). Over 55% is a problem. The flames read alone (round them, the logs
  hidden) have the logs taken from the shader too: hidden, they still carved the flames, 0.42 alike their mirror.
  And with the see-through hole's end across the flames' box (`page/fireFade.ts`; the hole round the line to the
  hero ends in a plane across the view, short of him): the flames alone with the hole and without, each pixel's
  light kept, in linear light, and the share of them off the median by over 0.2, over 5% a problem. The flames
  faded each pixel by its place on the box's faces, and the plane cut the fire in two as the camera came near (the
  owner: "a plane that cuts the fire in two parts"): 52% of the bonfire's apart, 64% of the brazier's. They fade
  as one now, by five points along the view through their middle. The hole's end is put between the box's nearest
  corner (beside it, the box is seen corner-on) and the nearest of those points, so the fire fades not at all: a
  partial fade, even, reads uneven through the bloom and the grade's curve. Its canary dims half the frame's flames.
  Nothing drawn, still, blown out (20% white), turning, plants over it and 3 flashes a second are problems. `--cost`
  (`page/fireCost.ts`) times its flames on the GPU from beside them (in the top-down view they cost under the
  timer's noise), each render by a query of its own, drawn and not in turns: its times differ run to run, so they're
  in the lines only when asked. `--canary`: a still flame, one drawn white, one put out, a 4 Hz strobe, the front
  shown from behind, a leaf over the bed, the bowl and the logs taken from the flames' shader, half its flames
  dimmed, and with `--cost` the flames drawn four times over (twice their cost at least). Pictured (`out/fire/`):
  close (beside it at 0, 0.13, 0.27 s, its light alone, from above, from below and where the bowl and the flames
  through it were found, over the logs, as they were unknown, and where the logs and the flames over them were
  found), round (the four
  sides, the first's light alone), and the top, third, first and lobby views. Main's fires (a disc of
  coals under glow particles): 1.4 to 1.6 m by 0.9, dim orange-red throughout (7 to 25°, at most 0.22 of white), no
  smoke, 19 to 37% moving a moment, six fern clumps over the bonfire. As sheets turned to the camera they turned with
  it (0.52 alike their mirror); as a volume 1.55 m by 0.6 to 0.7, 0.33 to 0.41 of white at 30° low to 0.13 at 25° at
  the tips, 0.86 alike its mirror, the bonfire's smoke over 47% above it, 7 to 9% moving, no plant over either, 0.16 ms
  (crypt) and 0.34 (forest) of a frame from beside them on the lab's desktop GPU.
