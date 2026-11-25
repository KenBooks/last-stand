// Game-time scheduler (respects pause, unlike setTimeout).
interface Timer { t: number; fn: () => void }
const timers: Timer[] = [];

export function schedule(delay: number, fn: () => void): void { timers.push({ t: delay, fn }); }

/** The timers due this frame taken out first, then run: one may clear them all (a run's clean-up) or schedule more,
 *  and run from inside the walk, one that cleared them left it reading past the list's end. */
export function updateTimers(dt: number): void {
  const due: Timer[] = [];
  for (let i = timers.length - 1; i >= 0; i--) {
    const timer = timers[i]!;
    timer.t -= dt;
    if (timer.t <= 0) { timers.splice(i, 1); due.push(timer); }
  }
  for (const timer of due) timer.fn();
}

export function clearTimers(): void { timers.length = 0; }
