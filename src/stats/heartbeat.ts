// Anonymous play stats (src/stats/AGENTS.md): once a minute while the tab shows, the game tells the traces service
// it is being played, so the dashboard can count players online, active players and playtime (server/traces
// stats.mjs). A beat holds a random id this browser made for it alone (never an account, a name, a save or a room),
// where the player is (the lobby or a fight), whether in co-op, and whether it starts this page's session or is the
// browser's first. The pause menu's Anonymous play stats turns it off; a browser asking sites not to track it (Global
// Privacy Control) starts with it off. The dev server and automated browsers (the lab) send nothing.
import { G } from '../state';
import { isCoop } from '../net/role';
import { serverHttp } from '../net/transport';

/** the player's choice, and the browser's id */
const CHOICE_KEY = 'last-stand-play-stats';
const ID_KEY = 'last-stand-play-id';
/** a beat a minute: the service counts a minute a beat */
const EVERY_MS = 60_000;
/** how long a beat may take before it's let go */
const TIMEOUT_MS = 10_000;

export type PlayStats = 'on' | 'off';

/** What the browser asks of sites it visits: Global Privacy Control, where it has it. */
const asksNotToTrack = (): boolean => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

/** Whether this game sends beats: the player's choice, else off where the browser asks not to be tracked. */
export function playStats(): PlayStats {
  try {
    const chosen = localStorage.getItem(CHOICE_KEY);
    if (chosen === 'on' || chosen === 'off') return chosen;
  } catch {
    // (no storage: nothing is sent, as no id could be kept; see `idOf`)
  }
  return asksNotToTrack() ? 'off' : 'on';
}

/** The pause menu's choice. Turned off, the browser's id is deleted too: turned on again, it's a new player. */
export function setPlayStats(choice: PlayStats): void {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
    if (choice === 'off') localStorage.removeItem(ID_KEY);
  } catch {
    // private mode: nothing kept, nothing sent
  }
}

/** This browser's id, made on its first beat (`first`); null where nothing can be kept (each visit would be new). */
function idOf(): { id: string; first: boolean } | null {
  try {
    const kept = localStorage.getItem(ID_KEY);
    if (kept && /^[A-Za-z0-9_-]{22}$/.test(kept)) return { id: kept, first: false };
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem(ID_KEY, id);
    return { id, first: true };
  } catch {
    return null;
  }
}

/** Whether this page may send at all: a built game, played by a person. */
const sends = (): boolean => !import.meta.env.DEV && !navigator.webdriver && typeof fetch === 'function';

let sessionStarted = false;

/** One beat, if the player allows it and the tab shows. Fails quietly: stats never get in the game's way. */
function beat(): void {
  if (document.visibilityState !== 'visible' || playStats() === 'off') return;
  const who = idOf();
  if (!who) return;
  const body = JSON.stringify({
    id: who.id, where: G.mode === 'run' ? 'fight' : 'lobby', coop: isCoop(), start: !sessionStarted, first: who.first,
  });
  sessionStarted = true;
  // (a plain request: a string body, no headers of its own, no cookies, so no preflight)
  fetch(`${serverHttp()}/traces/beat`, {
    method: 'POST', body, cache: 'no-store', credentials: 'omit', keepalive: true, signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined);
}

/** Starts the beats once the game shows (its loading screen gone): one now, then once a minute. */
export function startHeartbeat(): void {
  if (!sends()) return;
  beat();
  setInterval(beat, EVERY_MS);
}
