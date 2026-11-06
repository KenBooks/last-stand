# `ui`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`behindProps`: the dummies' labels behind a prop (#288: they showed through an obelisk). A column is planted half way
along the line from the camera to each label (an obstacle, `G.arena.obstacles`, for a frame): every label must hide,
and every one show again with the columns gone. `--canary` plants each column 3 m beside its line, where at least one
label shows through, which must be caught.

`ui`: the game's UI as the player sees it, in its states (`--states lobby,tooltip,glow,help,saves,heroes,readying,
readyingHeroes,clicked,views,behindProps,logLobby,perfAsk,skillTipsTouch,sheetTouch,litTouch,run,scores,perf,decision,
perfAskBreak,pause,pauseSettings,pauseAbandon,summary,skillTips,log,logTouch,hudTouch,decisionTouch,perfAskTouch`, every one by default (the
performance report's prompt, `page/uiPerfAsk.ts`: over the lobby, under the choice after a wave and so on touch, inside
the window, each button on one line, a finger's 28 px tall on touch, over none of the choice, the wave's badge, the
bars or the touch HUD's corners; `--canary` moves it down onto the choice, which must be found):
the lobby, an item's tooltip, the stash given 60 items (more than its view shows, on most screens) and a weapon
among them hovered by the mouse, those that fit its slot lit (`page/uiGlow.ts`: a short screen's rail turned to the
gear first; pictured round the stash, its tooltip put away, at 400, 1000 and 1600 ms into the
glow's loops, each held there, so `--ab` pictures the same moment on both sides; every loop a lit item runs must
animate only what the compositor moves, a layer's transform or opacity, and each that animates anything else, read
off its `@keyframes`, is a problem: its shadow, gradient and background animated, a full stash lit dropped the lobby
from 145 frames a second to 44, #267; and each loop on a stash item not hovered is a problem: 30 lit items' 90
loops, composited, still halved the frames while the mouse moved between them; and each part of the hovered item's
glow shown with a mask within another mask round it is a problem: a pass of the compositor's own within another,
drawn again every frame (the arc kept to the border's ring by one, within the stash's fading mask, raised the GPU's
time a frame from 5.4 ms to 6.3 moving between items (the owner's rose from 5 to 14 as the frames fell to 30), where
either mask alone raised it by 0.1 at the most, `npm run stalls -- --scenario sweep --perf`); and the stash's fade, the panel's colour laid over a
row its scroll cuts (its tab page's `::after`, shown by the stash's scroll), read at the stash's top and its end, the
mouse off the stash meanwhile: not shown at the top with a row cut is a problem, and so is shown at the end or over a
stash that fits (a dark band over the bare panel); `--canary` loops a shadow on the hovered item, turns a lit one's
glow not hovered, masks the hovered item's steady glow within a mask on the stash and holds the fade shown, each of
which must be found),
How to play, the save slots, the hero selection screen over the hall of heroes (`page/uiHeroes.ts`: opened by the
lobby's Change hero clicked with the mouse and pictured once the camera has come to the hero and his showcase is over:
the screen and the hall up, the hero in focus the lobby's own, his card alone shown, the hero in the room the panel
leaves (his middle clear of the panel, the arrows and the heroes' names, his feet clear of the panel, head to feet
within the window, 40% of its height at the least), the screen's parts within the window and none over another, the choice within reach and its
words within its padding (on a phone the buttons' own 24 px ran past it), the choice standing on the hero in focus
and shown as the mouse comes over him, hidden once it leaves him (always shown on a screen with no hover), the hero
beside him clicked and in focus, the save slot under the title clicked (the save slots over the screen, Esc taking
them alone away), each hero's name clicked in turn with the card's parts kept in their places in the
panel (the ranger's tagline on two lines put his traits 30 px lower) and held still by the card's entrance (motion
on, its animations held at their start and end: it slid up 10 px, which read as the panel shifting "like its
adjusting font"), the panel's tabs (`page/uiHeroPages.ts`: each clicked showing its page alone, the equipment
the hero in focus's, slot by slot, and his stash's count, an item's card over it on hover or a tap, nothing draggable
and a click on his items changing nothing, the attributes his, the page chosen still shown as the screen opens again),
a finger dragged across the scene 1.6 heroes' spacing (short of the room), once the camera rests
on the hero, with the camera following it and the hero it carried the row to in focus as it lifts, save slot 2
played from the screen (the screen still up on slot 2's heroes, the lobby's new hero hidden), Esc back to the lobby
with its hero; `--canary` lays Back over the heroes' names, pushes a card's traits down, puts the choice in the
window's corner, puts a glow by the hidden lobby hero's hand, makes one of the focused hero's items draggable and
lets a click through the save slot, which must all be found), the fight's
loading bar over the lobby as a press waiting for the fight's programs
shows it (`ui/readying.ts`, 40% along: within the window, its label on one line, its fill as far as painted;
`--canary` gives the label a letter's width, whose wrap must be found), Change hero clicked with the mouse while
the heroes' programs are kept cold (`game/warm.ts` `chill`), its bar saying it readies the heroes and every label the
bar can show (`readyingLabels`) on one line on this screen (`--canary` puts back the page's own "Readying the fight",
which a class pick once said, and it must be found; a tree from before it can't keep them cold, and says so), the
lobby's battleground button on clicked with the mouse and a key pressed after it as the browser gets them (where the
focus went and whether the browser shows its ring: a problem when the button kept it), the lobby's camera switched with V through every
view and back, each glide played and drawn (every frame, each label over the dummies against where its anchor shows
by the camera as the frame draws it: off by more than a pixel is a problem; placed with the camera's turn of the
frame before, they were up to 1442 px off as a glide set off), the battle log over the lobby with a training dummy
struck (clear of its panels: it first lay over the hero panel, as the performance stats did), each skill's tooltip
in the lobby opened by a finger's tap (the class card's and the skill book's, the book opened by taps: a short
screen's rail turned to the skills, the book's toggle; each tooltip pinned and within the window, the tallest
pictured; the mouse then puts the page back in mouse mode), a stash item's sheet opened by a finger's tap
(`page/uiSheet.ts`: a magic shield beside the common one worn, each card with the block's long note, as on the
owner's phone held sideways, where the sheet scrolled its buttons below the screen with the cards: each button within
the window and within the sheet as it shows, 28 px tall at least, and again with a block three windows tall planted
at the cards' end, their text scrolling and the buttons staying; `--canary` keeps the long cards from scrolling, which
must be found), a worn weapon pressed long by a finger (0.7 s) with the stash holding weapons and other items: every
weapon lit 1.2 s after the finger lifted (it went out with it), still lit after a lit one's sheet is opened by a tap
and closed, put out by a tap on an empty stash cell, then a stash weapon pressed long, lighting them again; neither
long press may open a card, its sheet or the tap's tooltip (the browser clicks after one, and a stash item's sheet
opened with the light; the moment after the stash weapon's is pictured, card and all);
`--canary` puts the light out and opens the sheet as the finger lifts, which must both be found), the run's HUD with a hurt foe's
bar and damage numbers over it, the scores, the performance overlay, the choice after a wave (each button's label on one line, `page/uiDecision.ts`:
narrowed on a short screen, the mouse's labels, their keys beside them, wrapped onto two; `--canary` makes it too
narrow for them, which must be found; put away at once as it closes: folded back into the badge on the browser's own
timers, it was still half shown in the next state's picture), the pause menu on its Controls tab (`pause`, as it
opens every time) and its Settings tab (`pauseSettings`), each fitting the window without scrolling, the box inside
the window, Resume, Abandon, the title and the tabs inside the box (`page/uiPause.ts`: the controls and the settings side by side scrolled on a phone held sideways;
`--canary` makes a settings row 600 px tall, which must make it scroll), Abandon run held as a player holds it
(`pauseAbandon`, with `lab.mouseDown`/`mouseUp`: clicked, it says to hold and stays; held a second and let go, it
fills and stays; held 2 s, it leaves the run; `--canary` makes its hold 0 ms, and the click must be caught abandoning),
the run's summary, each skill's tooltip on the hotbar opened by the mouse moved over its slot (within the window, the
tallest pictured; `--canary` makes each as tall as the window, which must be found past it: issue #256's damage
lines made them taller), the battle log with each skill on a key struck at the foe twice and its blows on the hero
listed, then paused: a row for every line, within the window, over none of the HUD's named elements but the layers as
wide as the screen, no row wider than the panel, its head on one line; and the same in touch mode, put in it by a finger's tap, where its lines must
let a touch through: on a phone the panel first lay over the scores button under the pause button), the run's HUD
in touch mode (`page/uiTouch.ts`: the top corners' controls at the window's edges, the pause button and the minimap
24 px in at the most, whatever the safe area's insets, and none of the corners' controls over another; on the owner's
phone held sideways, its camera cutout's 34 px inset and a margin stood the pause button 44 px in, and the bars at 85;
`--canary` moves the pause button 40 px in, which must be found), the choice after a wave in touch mode with a rare
and a common in the bag (on a short screen, 520 px high or less, down to 30% of the window's height at the most; its
buttons 28 px tall at least; over none of the corners' controls: on the owner's phone it reached 41.6% down, over the
bars, on a 1024x700 touch screen it lay over them too, and an upright tablet's buttons were 26 px tall; `--canary` pads it twice over, which must be found), each pictured
whole as a PNG of its own at the screen's pixels (`out/ui/<state>.png`), with every
named element's box and every label's over the world as shares of the window. In every state, the cursor over each
element the mouse can be over (shown, with an area, taking the pointer) must be the game's own (its art, from
`index.html`) or a text field's caret: the system's (`auto`, `pointer`, a UA stylesheet's `default`) is a problem,
listed by element; `--canary` gives the page's body the system's, which must be found. In every state too, the
digits shown must sit on their line (`page/digits.ts`): each look of the page's text showing digits (its font,
weight, style and numeric settings) has the ten set out alone in it at 64 px (as large as fits across a narrower
window: past its edge the picture was cut short, "no ink of the 1"), white on black over the page, pictured
and each one's ink read, and each font the world's labels are painted in (`overlay/paint.ts` `fontOf`) has each
digit's ink measured by the canvas; their tops or their bottoms more than 8% of their size apart is a problem,
naming the highest and the lowest and where the look shows, with its picture (`out/ui/digits-<n>.png`). Old-style
digits are 11% apart; the display face's 3 and 5 dip 6% by design. `--canary` gives the page's body old-style
digits, with a line of digits in its own text at the window's foot (a phone's stash alone showed digits only in the
display face, which the canary can't change, and went unseen), and takes the labels' lining twin away: both must be
found. (The owner, of the skill tooltips: "digits are
all jumping up and down in the same line".) With `--screens`, whether
the UI is
the same share of both screens: on `3840x2160@1,1280x720@3` (a 4K screen at 100% and at 300%) the lines agree but
the tooltip's place (it keeps off the pointer in css px, as the OS scales the pointer) and the lobby's text, which
drifts by up to 1% of the screen down a panel (Blink rounds each line of text to whole css px), and the pictures
differ by text's antialiasing, 2 to 5% of their pixels (the lobby's states 12 to 16%, with the drift). The page
takes a state at a time: a 4K screen's ten pictures sent back at once were too much for the browser, which closed.
`--hdr` puts HDR on first, as on a display in HDR mode, so the pause menu shows its levels.
