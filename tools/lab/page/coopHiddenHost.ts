// A co-op host advances a wave from the worker's tick while its game frames and page timer are held.
import { holdBackgroundTicks } from '../../../src/core/backgroundTick';
import { isHost } from '../../../src/net/role';
import { G } from '../../../src/state';
import type { Lab } from './lab';

const COUNTDOWN = 0.4;
const REAL_LIMIT_MS = 2500;
const POLL_MS = 25;

/** Wait in the browser's time without calling a game frame. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Model timer throttling and visibility independently, then observe the ordinary wave starting and spawning. */
export async function coopHiddenHost(_lab: Lab, { canary }: { canary: boolean }): Promise<{
  started: boolean;
  spawned: boolean;
  unchanged: boolean;
}> {
  const run = G.run;
  const clock = window.__labClock;
  if (!isHost() || G.mode !== 'run' || !run || run.phase !== 'countdown' || run.held || G.paused
    || document.hidden || clock.mode !== 'manual' || G.enemies.some((foe) => foe.alive)) {
    throw new Error('lab: hidden-host check needs a visible host at an unheld countdown on the parked clock');
  }
  const previous = Object.getOwnPropertyDescriptor(document, 'hidden');
  // Let a visible tick align the background clock with the last stepped frame before hiding the host.
  await wait(250);
  const startedWave = (): boolean => run.phase === 'fighting';
  const spawnedFoe = (): boolean => G.enemies.some((foe) => foe.alive);
  const before = G.time;
  run.timer = COUNTDOWN;
  holdBackgroundTicks(canary ? 'both' : 'page');
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  clock.flow(true);
  try {
    document.dispatchEvent(new Event('visibilitychange'));
    const deadline = clock.realNow() + REAL_LIMIT_MS;
    while (!(startedWave() && spawnedFoe()) && clock.realNow() < deadline) await wait(POLL_MS);
    return {
      started: startedWave(),
      spawned: spawnedFoe(),
      unchanged: G.time === before && run.timer === COUNTDOWN,
    };
  } finally {
    clock.t = performance.now();
    clock.flow(false);
    if (previous) Object.defineProperty(document, 'hidden', previous);
    else delete (document as { hidden?: boolean }).hidden;
    holdBackgroundTicks(null);
    document.dispatchEvent(new Event('visibilitychange'));
  }
}
