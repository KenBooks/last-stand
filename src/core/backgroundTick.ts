// A tick for what must go on while the page is hidden (a co-op host's fight, `backgroundStep` in main.ts). The
// page's own timers are slowed there: run once a second, and after five minutes hidden once a minute (Chrome's
// intensive throttling), so a host who looked at another window for a while left every foe standing still on the
// guests' screens (#845: "the game freezes for the other player too", the foes stood while both heroes ran). A
// dedicated worker's timers aren't slowed, and its messages reach the page as they come: they tick it. The page's own
// timer ticks too, as before, where no worker can be made.

/** how often it ticks (ms) */
const TICK_MS = 100;

/** `tick` run every `TICK_MS`, by a worker's clock and by the page's own. */
export function everyTickEvenHidden(tick: () => void): void {
  setInterval(tick, TICK_MS);
  try {
    const worker = new Worker(new URL('./backgroundTick.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = tick;
    worker.postMessage(TICK_MS);
  } catch {
    // (no worker: the page's own timer alone, slowed while hidden)
  }
}
