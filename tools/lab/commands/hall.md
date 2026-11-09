# `hall`

The rest of the commands are in [`COMMANDS.md`](../COMMANDS.md).

- `hall`: the hero in focus in the hall of heroes (`page/hallMoves.ts`; `src/game/hall.ts`), the lab's run left
  for the lobby and Change hero clicked: his showcase and the stand after it, 480 frames, each hand, elbow and the
  weapon's tip in his own frame, and each jerk: its move a frame changing by over 12 cm from the frame before (a
  jump, a stop or a start in a frame), 40 cm while the weapon flies (its tip 25 cm a frame or more, this frame or the
  two before: a blow speeding down and coming to rest), the tip's by its speed (0.7 of its larger move, at least
  20 cm: its arc turns its way by about its speed squared over its reach). `--gear` and `--weapon` put the weapon in
  his profile, which the hall dresses him from; `--frames` lists each jerk with its action and its moves; the canary
  turns his right shoulder for a frame. From play: "warrior arms jerk in various poses after he finishes power
  strike, in char selection screen". The hall's heroes are remote copies beside the lobby's own hero, hidden but
  still posed, which `range` never saw: the warriors shared the way back's state (`DRAWN_*`, `BACK_*` at the module's
  top), and the hall's went back to its guard from where the lobby's hero had drawn his weapon, the axe's tip 2.2 m in
  a frame. Found with it too: the first frame of the landing's hold turned the arm 65 degrees down onto the stage
  under the plinth, the hands 84 cm; the left hand onto the haft off the shoulder in a frame, 39 cm; the way back
  into the guard stopping dead, the lift onto the shoulder and the move off it starting at full speed. Then the hall
  is opened again and left by Back 1 s into his showcase, and any oscillator still not told to stop 60 frames on in
  the lobby is a sound left playing (`page/soundsLeft.ts`); its canary starts Void Lance's hum there and never stops
  it. From play: "if mage was attacking in hall of heroes, going back to lobby keeps the attack sound": the hall
  closed with his channel open, and its hum (3 tones) played on.
  `--glow` (`page/hallGlow.ts`) reads the light round the weapon's tip instead, the mage's staff's crystal, frame by
  frame from his showcase on (540 frames, the camera's flight in left out), read back from the frame drawn as the
  player sees it: a box 0.5 m across there, its share near white (0.75 of white), its mean light, the median frame's
  and the brightest against it, the flashes of its mean in any second (`page/flashes.ts`), and its mean every 0.25 s;
  and how much of it glows (its pixels' brightest channel 0.1 of white or more, the crystal and its halo), the
  median frame's and the largest against it, every 0.25 s; pictured round the staff's head at its brightest, at its
  largest glow, at its dimmest and as he stands after his showcase (`--pictures=false` for none). It fails on any
  frame over 0.25 of white, the brightest over 3 times the median, over 2 flashes a second, a glow over 1.25 times
  its median frame's (a flare) or under 30% of the box the median frame (a flat stone). By its brightest channel,
  not its luminance: a saturated pink's luminance is a third of its red, and a facet's flare that doubled the glow
  moved the box's luminance by a few hundredths. From play: "in hero selection screen, the staff's light is too
  bright when its flickering, pls lower": raised, the crystal came within 0.86 m of the hall's key light, which lit
  its glossy facets white (main's brightest frame 0.34, its glow flaring 1.53 times on 84 frames); then, lit less,
  "it still flickers bright, but most of the time its completely boring" (its glow 25% of the box, flaring 2.1 times
  as a facet turned to the light every 0.7 s). Now it's lit by its own light: its faces under the bloom's threshold,
  and a halo and a hot core of its own (`HEAD`, `HALO`, `CORE` in `src/game/hall.ts`).
  Its canary lights the crystal as main lit it, its colour its glow's hue. `--lobby` reads the hero as he stands in
  the lobby instead, the run's camera on him (from play: "staff still flickers at its brightest peak"): polished,
  a facet turned to a light flashed the crystal white, its brightest frame 3.18 times its median, 8.9% of the box
  near white; its facets rough and its coat thin, 1.3 times and none. There its glowing area isn't judged: the
  crystal's rings turning face-on to the camera above swell it 1.4 times, slowly. Its canary makes the gem glow
  three times over for a second.
