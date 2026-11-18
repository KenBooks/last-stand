// `lab ui`'s `logTouch` state (`../uiKit.ts` `Steps`): the battle log in touch mode: clear of the touch HUD, touches
// let through (`../uiLog.ts`).
import type { Lab } from '../lab';
import { closeLog, logListed, logShown, openLog } from '../uiLog';
import { describe, TOUCH_FRAMES } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.5, y: 0.4 };

/** The battle log as above, the page put in touch mode first by a finger's tap, as a player's first touch puts it. */
async function openLogTouch(lab: Lab): Promise<void> {
  await lab.touchDown({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
  await lab.touchUp();
  await lab.step(TOUCH_FRAMES);
  await openLog(lab);
}

/**
 * The battle log on a touch screen, besides what `logShown` checks (over none of the touch HUD's corner: the pause
 * and scores buttons, the bars, the buffs): its lines letting a touch through to what lies under them (the move
 * stick's pad reaches up under it).
 */
function logTouchShown(): Found {
  const found = logShown();
  if (logListed.lines < 0) return found;
  if (!document.body.classList.contains('touch')) {
    found.problems.push('log on touch: the tap left the page out of touch mode');
  }
  const row = document.querySelector('#blog .bl-line')?.getBoundingClientRect();
  const under = row ? document.elementFromPoint(row.left + row.width / 2, row.top + row.height / 2) : null;
  found.lines.push(`  a touch on a line of it lands on ${under ? describe(under) : 'nothing'}`);
  if (under?.closest('#blog')) found.problems.push('log on touch: a touch on its lines lands on the panel');
  return found;
}

// (the page is left in touch mode from here on)
const STATE: Steps = {
  order: 510,
  inRun: true,
  open: openLogTouch,
  close: closeLog,
  check: logTouchShown,
};
export default STATE;
