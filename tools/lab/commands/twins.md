# `twins`

The Ossuary Twins (`page/twins.ts`, their belt skulls `page/twinsBelt.ts`; `src/entities/twins.ts`,
`src/entities/twinSkulls.ts`, `src/entities/bossKit.ts`), the Crypt's special boss wave (`bossWaves` in
`src/data/biomes.ts`).

## The parts

- `waves`: each battleground's boss waves (5 to 35) set off as the game sets them off, the run's wave and its timer,
  and stopped before anyone comes: the bosses the run holds (`RunState.boss`), the banner's line and the Continue
  button's name, against what each should send (the Twins on the Crypt's 15th and 35th, the Colossus on its others, the
  Thornheart on every one of the Thornwood's); then the Crypt's 15th let come, its foes taken out, until both twins
  have risen: within their chain's reach of each other.
- `fight`, each on a fresh set-up with the pair risen abreast 5 m apart: two hits of a tenth, one on each, leaving 0.8
  of the pair's life on both; Reliquary set past the chain's reach across the hero, the chain snapping, hurting him and
  dragging them 2 m nearer at least; Slab struck harder past half, he alone falling, paying nothing, and Reliquary in its
  phase; Reliquary hurt with the hero far off, its mend raising the pair's life by its `heal` (10% under at most), the
  next stunned a second in raising it by under half that.
- `belt`: the pair left to fight for 52 s a hero held where he stands, both standing where they rose (out of the slam's
  and the charge's reach, so the belt and the volley are what's left): each throws its belt's 4 skulls and no more, none
  sooner than 9 s after its last nor while its last is still out; every throw's start and flight finite and its landing
  a flight after it left; each model's rope shows what its belt holds whenever it holds none in its hand (read every 10
  frames, by the skulls' scale as drawn); no two of the pair's warned hits (a volley, a slam, a charge, a bomb's blast, a
  poison's landing) closer than their 1.6 s beat. Its first run found two: the skulls flew from a NaN and landed as
  they were thrown, and `claimBeat` kept the last claim alone, so a volley claimed after a bomb's throw landed 0.83 s
  from its blast (it keeps every claim still to come now). Read: 4 each, the closest two hits 1.57 to 1.70 s apart (a bomb's landing is claimed from the twin's middle and thrown from his hand, about 0.03 s sooner: within the slack). The twins are held at 1 mm/s, not none (`STILL`): at none a foe's seek divides by its reach, and every joint of its model came out NaN (the skulls' first starts, and a twin drawn nowhere in the pictures).
- `bomb`: a bomb thrown beside a hero standing still lands on its glow (0 m off), its skull's mesh lying where it
  landed every frame of its fuse (120 of 120; the canary takes it off the floor as it lands), and bursts its fuse after landing
  (2.00 s), hurting him once and stunning him 1.20 s where he stands; a second bursting within the first's rest hurts
  him and stuns him not; a cloud landed on him 0.4 s before a blast ticks none of the stun and 8 to 9 times after (with
  the chain and the cloud passing nothing, it ticked 3 times while he was held); with `--class warrior` a raised shield
  turned to it takes the stun with the hurt (another hero says it has none); stepped 5 m out of its glow as it lies,
  not hurt. The beat (`belt`) counts a bomb's from its stun's end.
- `poison`: a cloud with the hero 0.3 m outside its edge never hurts him; one on him hurts him 12 times in its 6 s, a
  tick each 0.5 s, the most 3% of his life a tick, and is gone 6.00 s after landing, its skull lying where it landed
  all 360 frames.
- `inherit`: a bomb thrown, then Slab collapsing at half: Reliquary holds his 3 bombs left with its own 4 poison, and
  its ropes show both so.
- `compiles`: every effect of their fight sent through `fx` with the pair drawn (the chain's snap, a volley, a charge, a
  slam's ring and blow, a mend begun and done, the phase, a bomb thrown, lying and bursting, a poison cloud), the
  browser let go after each frame (`lab.step` never yields, and a pipeline is compiled aside in the browser's time): no
  pipeline first asked for (`PIPELINES_ASKED`).
- `cost`: the frame by the browser's clock with a bomb lying and a cloud out against none, 6 turns of 30 frames each
  within one page: 3.0 to 6.7 ms both ways as the PC's load was, the two within 0.15 ms; then the GPU's frame by the engine's clock
  (`gpuTurns.ts`'s `costInTurns`), their two skulls and four glows shown and hidden in turns, the game held (the
  particles and the pooled light shared with every effect, left on): 0.00 ± 0.56 and 0.39 ± 0.39 ms at the lab's 1920
  by 1080 (the second with the skull's new model), -0.26 ± 2.63 at `--screen 2880x1800@2`, told from nothing at any.
  It fails a cost told from nothing over 0.5 ms.
- `pictures` (asked for alone): nine moments, the pair from behind the hero and above.
- `look` (asked for alone): each twin alone from four sides and its skull close up, Reliquary's casket and its
  orbiting skulls close up (`userData.casket`), its triangles as drawn at most 45k with its belt (Slab 42.4k,
  Reliquary 39.7k, main's 42.2k and 43.9k: every sculpted bone simplified, `docs/agents/twins.md`), with each bone's.
- `beltPictures` (asked for alone): a belt skull alone on clear floor, lit, from its front, its side and its front
  quarter, and its triangles; the belts close on both, each from the front quarter of its belt's side with
  the chain between them hidden, a throw from Slab's throwing side (unhook, wind-up, release, flight, landing; his
  brother stood behind him, or it stood between the camera and him), the survivor with both belts, then the bomb's
  fuse, its blast and the hero stunned and the poison skull in its cloud as the player's screen shows them
  (`lab.screen`) in each view, top-down, over the shoulder and through the eyes, each set up afresh in it (the lab
  holds its view to the set-up's: a view set by the renderer alone came out top-down). The hero stands on a spot
  with the floor clear 7 m before him (`clearStand`: from the run's own spot a shrine filled the view through his
  eyes), the skulls 2.4 m ahead and 1.4 m to his side (straight ahead his own body hid them over the shoulder).

`coop --scenarios belt` plays them in two games: the twins held where they stand throwing at the guest, the host far
off. Read: the same 3 skulls on both screens, 0 cm apart; the belts alike at the end; the guest hurt, the host not;
each skull's mesh of its kind lying where it landed on both screens for its whole life (120 frames a bomb, 360 a
poison; by place alone a bomb lying on a cloud's spot counted for the poison skull, 480 frames), the canary taking the
guest's off its floor as they land, each read over its own life from its landing (over the whole run, two bombs on one
spot counted each other's, 240 frames of 120; a skull whose life runs past the run's end isn't judged); the guest
stunned 72 frames a bomb on his own screen and his copy as long on the host's, the host never, and no hurt landing on
the guest while a stun held him.

## Canaries

`--canary`: the Crypt's special wave taken out; the pair's `shares`; a chain whose reach is a kilometre; Slab's `hurt`
hook; a mend that heals nothing; a belt of six on a 2 s cooldown with no beat, and a rope never told its belt; a stun
of 0.1 s on a 0.2 s fuse, no rest, and a held hero not passed by; a cloud past its ring; a survivor whose model shows its own rope alone; a box of a blending,
side and depth no other material has, which must ask for a pipeline. `cost` and the pictures plant nothing.

About 70 s for the default parts on a page `lab:serve` booted ahead.

## Known

- The bomb threw the hero 4 m before it stunned him (#900's first rounds): given in one frame, the throw took his hip
  35° back while he stood, 5° past its range (`watchBody`'s report).
