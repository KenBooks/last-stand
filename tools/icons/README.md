# Icons

The painted skill icons (`src/ui/skillArt/<impl>.webp`, found by the skill's `impl` name): every class's side by side
as the player sees them, how each fits the round touch buttons, and a painted original made into one. What a new icon
must match is in `src/ui/skillArt/AGENTS.md`.

Needs Python with Pillow and numpy (`pip install -r tools/icons/requirements.txt`).

```bash
npm run icons -- sheet                                   # every class's icons: tools/icons/out/sheet.png
npm run icons -- sheet --try blink=.tmp/art/blink.png    # a picture tried in a skill's place, as `add` makes it
npm run icons -- check                                   # how each icon fits the round buttons
npm run icons -- add blink .tmp/art/blink.png            # the original made into src/ui/skillArt/blink.webp
npm run icons -- keys                                    # each class's keys drawn: docs/screenshots/keys-<class>.png
```

- **`sheet`** draws a row a class, each skill's icon large, then at a hotbar slot's size (60 px, the size the set is
  judged at) square and cut round as a touch button draws it, its name and its `icon.color` under it. `--try
  impl=picture` (repeatable) shows a picture in that skill's place, padded and sized as `add` would make it and marked
  new, so a candidate is judged beside the others before it's added. `--classes ranger,mage` shows only those.
- **`check`** gives each icon's fit: the share of its light the round button's circle cuts off (`cut`), the radius
  (in half the square's side, 1 the circle) inside which 99.5% of its light lies, and its content's nearest approach
  to the square's edges. It fits with 99.5% of its light inside the circle and its content 4% clear of the edges, and
  `check` exits with 1 when an icon doesn't, or a skill has none (it shows its glyph). The warrior's and the mage's
  first icons were made before that rule, and most of them reach past the circle (Twin Fangs and Raise Shield have 10%
  of their light cut off).
- **`add impl picture`** squares the original, shrinks it onto a larger black square about its middle until it fits
  (exact on a black background, and the art is left as it was; one that fits already is kept as it is), and writes
  it as a 384 px square WebP at quality 88, with the original's fit and the icon's.
- **`keys`** draws each class's default keys as a diagram for the README (`docs/screenshots/keys-<class>.png`): the
  mouse with what each button casts beside it (every school's spell for the mage's left click, what the warrior's
  right click casts with each way of holding weapons), and the keys 1 to 4 and Q in a row, each skill by its icon,
  its name and a few words (`keys.py` `NOTES`), a HOLD tag on a channel or a drawn shot. The bindings are read from
  the class's data as the game reads its defaults, so run it again when a class's keys or skills change.
  `--classes`, `--out <folder>`.

The sources are small modules: `skills.py` reads the classes' skills from their data, `fit.py` measures the fit,
`export.py` pads and writes an icon, `sheet.py` draws the sheet, `keys.py` draws the key diagrams and `icons.py` is the command line (`icons.mjs` runs
it with the system's Python).
