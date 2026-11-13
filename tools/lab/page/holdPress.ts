// A hold-to-act button pressed as its hold ending would act (`src/ui/holdButton.ts`: the pause menu's Abandon run,
// held 2 s since #380): its hold made 0 ms, Enter pressed and let go on it, its timer let fire by the browser's clock.
// A click alone does nothing there: the lab's set-ups that clicked Abandon stayed in the run under the pause menu, and
// the village's checks found V doing nothing (`lab village`: "V never came round to the third view").

/** the browser's time given the button's timer to fire, ms (its hold is 0 ms: it fires on the next task) */
const HOLD_FIRES_MS = 5;

/** A wait of `ms` on the browser's own clock (the page's timers fire by it, not the lab's). */
const browserWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** `button` held to act at once, its hold put back after; a button that acts on a click (an older tree's, with no
 *  hold) clicked. */
export async function pressHeld(button: HTMLElement): Promise<void> {
  const holdMs = button.dataset.holdMs;
  if (holdMs === undefined) {
    button.click();
    return;
  }
  button.dataset.holdMs = '0';
  try {
    button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
    await browserWait(HOLD_FIRES_MS);
    button.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter', bubbles: true }));
  } finally {
    button.dataset.holdMs = holdMs;
  }
}
