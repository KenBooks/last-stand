// `lab profile`'s check that a profile keeps the screen on (`src/perf/awake.ts`): the browser's wake lock stood in
// for by one that counts, so the check reads what the game asks of the browser, not the game's own count. A phone
// left alone through a profile locked its screen and the profile never ended.

/** What the game asked of the browser's wake lock while it was watched. */
export interface WakeWatch {
  /** the locks asked for, and those given back */
  asked: number;
  released: number;
  /** the browser's own lock put back */
  restore(): void;
}

/** A lock as the browser hands one out, counted as it's given back. */
function countedLock(watch: WakeWatch): WakeLockSentinel {
  const lock = new EventTarget() as EventTarget & { released: boolean; type: 'screen'; release(): Promise<void> };
  lock.released = false;
  lock.type = 'screen';
  lock.release = async () => {
    if (lock.released) return;
    lock.released = true;
    watch.released += 1;
    lock.dispatchEvent(new Event('release'));
  };
  return lock as unknown as WakeLockSentinel;
}

/** The browser's wake lock replaced by one that counts what's asked of it, till `restore`. */
export function watchWakeLock(): WakeWatch {
  const own = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
  const watch: WakeWatch = {
    asked: 0,
    released: 0,
    restore: () => {
      if (own) Object.defineProperty(navigator, 'wakeLock', own);
      else delete (navigator as unknown as Record<string, unknown>).wakeLock;
    },
  };
  const request = async (): Promise<WakeLockSentinel> => {
    watch.asked += 1;
    return countedLock(watch);
  };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return watch;
}

/** What's wrong with what `watch` saw over a profile that has ended: the screen never held, or left held. */
export function wakeProblems(watch: WakeWatch, what: string): string[] {
  if (watch.asked < 1) return [`${what}: the screen was never kept on (no wake lock asked for)`];
  if (watch.released < watch.asked) {
    return [`${what}: the screen was left kept on (${watch.asked} wake locks asked for, ${watch.released} given back)`];
  }
  return [];
}
