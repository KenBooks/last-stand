// Whether this page runs the newest build, said in the pause menu's footer beside the build (#587). The build writes
// `version.json` beside the page (`buildVersion` in vite.config.ts: the same commit and time as `__BUILD__`); the
// pause menu reads it from the host past every cache and compares its time with this build's.
// (`version.json` is never precached by the offline worker, scripts/pwa.ts: a cached copy would always agree.)

declare const __BUILD__: { ref: string; time: string };

/** what the footer says: still asking, the newest, a newer one deployed, or no answer (offline) */
type Status = 'checking' | 'latest' | 'newer' | 'unknown';

const SAID: Record<Status, string> = {
  checking: 'Checking for updates…',
  latest: 'Latest version',
  newer: 'Newer version available: reload to update',
  unknown: 'Could not check for updates',
};

/** a check's answer is kept this long (ms): the pause menu opened and shut again doesn't ask the host each time */
const KEEP_MS = 30_000;
/** how long the host has to answer (ms) */
const WAIT_MS = 5_000;

let checkedAt = -Infinity;
let last: Status = 'checking';

/** The build the host serves now: its time, or null when it can't be read. */
async function servedBuildTime(): Promise<string | null> {
  const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), WAIT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: stop.signal });
    if (!response.ok) return null;
    const served = (await response.json()) as { time?: unknown };
    return typeof served.time === 'string' ? served.time : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether the build served is this page's, or a newer one. */
async function check(): Promise<Status> {
  const served = await servedBuildTime();
  if (!served) return 'unknown';
  if (served === __BUILD__.time) return 'latest';
  // (an older build served is a deploy rolled back, or a host behind its cache: this page is the newest there is)
  return Date.parse(served) > Date.parse(__BUILD__.time) ? 'newer' : 'latest';
}

/** Says the status in `into` (the pause menu's footer), asking the host again once the last answer is old. */
export function showBuildStatus(into: HTMLElement): void {
  const say = (status: Status): void => {
    into.textContent = SAID[status];
    into.dataset.status = status;
  };
  if (performance.now() - checkedAt < KEEP_MS && last !== 'unknown') {
    say(last);
    return;
  }
  checkedAt = performance.now();
  say('checking');
  void check().then((status) => {
    last = status;
    say(status);
  });
}
