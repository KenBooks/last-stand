// The screen kept on while a measure runs (the Screen Wake Lock API): a phone left alone through Profile this spot
// dims and locks its screen in half a minute, and the browser stops the page's frames with it, the profile never
// ending (from play, "can we prevent phone from sleeping while profiling ? mine likes to do that"). Held by name,
// so a profile within a manual recording lets go only when both have, and a measure ended twice lets go once;
// asked again when the page comes back, as the browser drops the lock whenever the page is hidden. A browser
// without the API, or one that refuses (a battery saver), measures as before.

/** the measures that hold the screen on now, by name */
const holders = new Set<string>();
/** the browser's lock while it's held, and whether one is being asked for */
let lock: WakeLockSentinel | null = null;
let asking = false;
let listening = false;

/** Asks the browser for the lock where a measure holds the screen and none is held or asked for. */
async function ask(): Promise<void> {
  if (holders.size === 0 || lock || asking || document.visibilityState !== 'visible') return;
  const wake = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
  if (!wake) return;
  asking = true;
  try {
    const got = await wake.request('screen');
    got.addEventListener('release', () => { if (lock === got) lock = null; });
    lock = got;
    // (let go while it was asked for: the measure ended first)
    if (holders.size === 0) void letGo();
  } catch {
    // (refused: a battery saver, or the page hidden as it asked. The measure runs on without it)
  } finally {
    asking = false;
  }
}

/** Gives the lock back. */
async function letGo(): Promise<void> {
  const held = lock;
  lock = null;
  try { await held?.release(); } catch { /* (already released by the browser) */ }
}

/** The screen kept on for the measure `who` from its `on` true to its `on` false: its start and its end. */
export function keepAwake(who: string, on: boolean): void {
  if (on) holders.add(who);
  else holders.delete(who);
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => { void ask(); });
  }
  if (holders.size > 0) void ask();
  else void letGo();
}

/** For a harness (tools/lab): the measures that hold the screen on, and whether the browser's lock is held. */
export function awakeNow(): { holders: string[]; locked: boolean } {
  return { holders: [...holders], locked: lock !== null };
}
