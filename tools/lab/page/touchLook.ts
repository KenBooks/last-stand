// A finger dragged over the world in the close views (tools/lab `touchlook`): in third person and through the eyes,
// a touch put down on the right of the screen, clear of the skill buttons, and slid sideways, sent as a touch
// screen's, and how far the camera turned. From play on a phone: "when on mobile in 3rd or 1st person, cannot use
// right finger to turn the camera... otherwise 3rd and 1st person pretty much unplayable" (#812). The line says what
// lay under the finger, since the game takes a look only from a touch that lands on its canvas.
import type { Fixture, Lab, PagePoint, Report } from './lab';
import { cameraYaw, viewMode } from '../../../src/core/renderer';
import type { ViewMode } from '../../../src/core/renderer';
import { input } from '../../../src/core/input';

export interface TouchLookOptions {
  fixture: Fixture;
  canary?: boolean;
}

/** the close views a finger looks round in */
const VIEWS: ViewMode[] = ['third', 'first'];
/** where the finger goes down, as shares of the window (the right half, over the skill buttons' arc), how far it
 *  slides to the left (css px) and by how much a move */
const DOWN = { x: 0.72, y: 0.36 };
const SLIDE = 160;
const SLIDE_STEP = 16;
/** the frames given to the view to settle, and after each move */
const SETTLE = 40;
/** the least the camera must turn for the slide (rad): the mouse's 0.0025 a px, a finger's 1.6 times that, is 0.64 */
const LEAST_TURN = 0.3;

/** where the other thumb holds the move stick, as shares of the window (the move pad, the left half below the
 *  top quarter), how far it pushes it up the screen (css px), and the fingers' numbers */
const STICK = { x: 0.2, y: 0.7 };
const STICK_PUSH = 60;
const LOOKS = 0;
const MOVES = 1;
/** the least push the stick must still give while the other finger looks (0 to 1) */
const LEAST_PUSH = 0.9;

/** What a drag in one view gave. */
interface Dragged {
  view: ViewMode;
  /** the move stick's push as the drag ended, where the other thumb held it (0 to 1) */
  push: number | null;
  /** what lay under the finger as it went down */
  under: string;
  /** how far the camera turned (rad, either way) */
  turned: number;
}

/** A page element as a line says it: its tag, its id and its classes. */
function named(element: Element | null): string {
  if (!element) return 'nothing';
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList].map((name) => `.${name}`).join('');
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

/** The angle from `a` to `b` the short way round (rad). */
const turnBetween = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

/** A finger put down at `DOWN` in `view` and slid `slide` px to the left: what lay under it, and the camera's turn. */
async function dragged(lab: Lab, fixture: Fixture, view: ViewMode, slide: number, moving = false): Promise<Dragged> {
  await lab.setup({ ...fixture, view });
  await lab.step(SETTLE);
  if (viewMode() !== view) throw new Error(`lab: touchlook: the view is ${viewMode()}, not ${view}`);
  // (a first touch puts the game in touch mode, its controls shown from the next frame: `ui/touch.ts`)
  const down: PagePoint = { x: Math.round(innerWidth * DOWN.x), y: Math.round(innerHeight * DOWN.y) };
  await lab.touchDown(down);
  await lab.touchUp();
  await lab.step(SETTLE);
  if (moving) {
    const thumb: PagePoint = { x: Math.round(innerWidth * STICK.x), y: Math.round(innerHeight * STICK.y) };
    await lab.touchDown(thumb, MOVES);
    await lab.touchMove({ x: thumb.x, y: thumb.y - STICK_PUSH }, MOVES);
    await lab.step(2);
  }
  const before = cameraYaw();
  const under = named(document.elementFromPoint(down.x, down.y));
  await lab.touchDown(down, LOOKS);
  for (let out = SLIDE_STEP; out <= slide; out += SLIDE_STEP) {
    await lab.touchMove({ x: down.x - out, y: down.y }, LOOKS);
    await lab.step(1);
  }
  const push = moving ? Math.hypot(input.stick.x, input.stick.y) : null;
  const turned = turnBetween(before, cameraYaw());
  await lab.touchUp(LOOKS);
  if (moving) await lab.touchUp(MOVES);
  await lab.step(SETTLE);
  return { view, under, turned, push };
}

/** `lab touchlook`: a finger's drag in each close view must turn the camera; with `canary` the finger never moves. */
export async function touchLook(lab: Lab, options: TouchLookOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const view of VIEWS) {
    const drag = await dragged(lab, options.fixture, view, SLIDE);
    const degrees = (drag.turned * 180 / Math.PI).toFixed(1);
    lines.push(`${view}: a finger slid ${SLIDE} px over ${drag.under} turned the camera ${degrees}°`);
    if (drag.turned < LEAST_TURN) {
      problems.push(`${view}: a finger's slide of ${SLIDE} px turned the camera ${degrees}° (over ${drag.under})`);
    }
    // (and with the other thumb on the move stick, as a player walks and looks: both must go on)
    const both = await dragged(lab, options.fixture, view, SLIDE, true);
    const turn = (both.turned * 180 / Math.PI).toFixed(1);
    const push = (both.push ?? 0).toFixed(2);
    lines.push(`${view}, the other thumb on the move stick: the camera turned ${turn}°, the stick's push ${push}`);
    if (both.turned < LEAST_TURN) {
      problems.push(`${view}: with a thumb on the move stick a finger's slide turned the camera ${turn}°`);
    }
    if ((both.push ?? 0) < LEAST_PUSH) {
      problems.push(`${view}: the move stick's push fell to ${push} as the other finger looked`);
    }
  }
  if (options.canary) {
    const still = await dragged(lab, options.fixture, VIEWS[0], 0);
    const caught = still.turned < LEAST_TURN;
    lines.push(`canary, a finger that never moves: ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) problems.push('canary: a finger that never moves turned the camera');
  }
  return { text: lines.join('\n'), problems };
}
