// Asking the player before a trace is sent (src/perf/AGENTS.md). A slow stretch the recorder found waits for a moment
// that isn't a fight (the choice after a wave, the summary, the lobby, the hero selection screen), then the player is
// asked in a small prompt that blocks nothing: Send, Not now or Always. Always is kept and sends from then on without
// asking (the pause menu's Slow-game reports turns it back, or off); Not now asks no more this session, and after
// three the game stops asking. In co-op each game asks its own player about its own frames.
import { G } from '../state';
import { sfx } from '../core/audio';
import { isReadying } from '../game/warm';
import { recorder, type Slow } from './recorder';
import { canSend, packTrace, sendTrace } from './upload';

/** what the player chose: asked each time, sent without asking, or never */
export type TraceConsent = 'ask' | 'always' | 'off';
interface Kept { consent: TraceConsent; refusals: number }

const KEY = 'last-stand-perf-traces';
/** after this many Not nows the game stops asking */
const MOST_REFUSALS = 3;
/** sent without asking: at most this many a session, this long apart (ms) */
const MOST_SENT = 3;
const SENT_APART_MS = 10 * 60_000;
/** how often a waiting stretch looks for its moment (ms), how long after a moment starts it's shown (ms) */
const LOOK_EVERY_MS = 1000;
const CALM_MS = 1500;
/** the gap under the choice after a wave, the prompt's place while it shows (css px) */
const UNDER_GAP = 8;
/** how long the sent note stays (ms) */
const NOTE_MS = 9000;

let askedThisSession = false;
let sentThisSession = 0, lastSent = -Infinity;
let calmSince = 0, packing = false, sending = false, noteTimer = 0;
/** the stretch the player was asked about (shown again after a fight hid it) */
let askedFor: Slow | null = null;
let packed: { slow: Slow; body: Uint8Array } | null = null;

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

function kept(): Kept {
  try {
    const k = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Kept> | null;
    const consent = k?.consent === 'always' || k?.consent === 'off' ? k.consent : 'ask';
    return { consent, refusals: Number(k?.refusals) || 0 };
  } catch { return { consent: 'ask', refusals: 0 }; }
}
function keep(k: Kept): void { try { localStorage.setItem(KEY, JSON.stringify(k)); } catch { /* private mode */ } }

export const traceConsent = (): TraceConsent => kept().consent;
/** The pause menu's choice: asking again starts the refusals over. */
export function setTraceConsent(consent: TraceConsent): void { keep({ consent, refusals: 0 }); }

/** Whether a slow stretch found now could go anywhere: the recorder snapshots one only then. */
function wanted(): boolean {
  if (!canSend()) return false;
  const k = kept();
  if (k.consent === 'off') return false;
  if (k.consent === 'always') return sentThisSession < MOST_SENT && performance.now() - lastSent > SENT_APART_MS;
  return !askedThisSession && k.refusals < MOST_REFUSALS;
}

/** A moment the prompt may show in: no fight, no loading bar, the tab in view, the pause menu shut. */
const calm = (): boolean =>
  !(G.mode === 'run' && G.run?.phase === 'fighting') && !isReadying() && !document.hidden && !G.menuOpen
  && !document.querySelector('#loading');

export function initTraceConsent(): void {
  recorder.wanted = wanted;
  const box = $('#perf-ask');
  box.querySelector<HTMLElement>('.pa-send')!.onclick = () => { sfx.click(); void send(); };
  box.querySelector<HTMLElement>('.pa-always')!.onclick = () => { sfx.click(); keep({ consent: 'always', refusals: 0 }); void send(); };
  box.querySelector<HTMLElement>('.pa-later')!.onclick = () => {
    sfx.click();
    const k = kept();
    keep({ ...k, refusals: k.refusals + 1 });
    letGo();
  };
  box.querySelector<HTMLElement>('.pa-close')!.onclick = () => { sfx.click(); hide(); };
  setInterval(look, LOOK_EVERY_MS);
}

/** Each second: a waiting stretch shown (or sent) once a calm moment has lasted; hidden again if a fight starts. */
function look(): void {
  const slow = recorder.pending();
  const box = $('#perf-ask');
  if (!slow) return;
  place();
  // (turned off in the pause menu while it waited)
  if (kept().consent === 'off') { letGo(); return; }
  if (!calm()) {
    calmSince = 0;
    if (box.classList.contains('asking')) box.classList.add('hidden');
    return;
  }
  calmSince ||= performance.now();
  if (performance.now() - calmSince < CALM_MS || packing || sending) return;
  if (askedFor === slow) { if (box.classList.contains('hidden')) box.className = 'asking'; return; }
  if (!wanted()) { letGo(); return; }
  if (packed?.slow !== slow) { void pack(slow); return; }
  if (kept().consent === 'always') void send();
  else ask(slow, packed.body.length);
}

async function pack(slow: Slow): Promise<void> {
  packing = true;
  try { packed = { slow, body: await packTrace(slow) }; } catch { letGo(); } finally { packing = false; }
}

/** what slowed, said to the player */
const WHERE: Record<Slow['scene'], string> = {
  boot: 'took long to load', readying: 'took long to get ready', heroes: 'ran slowly on the hero selection screen',
  lobby: 'ran slowly in the Sanctuary', fight: 'ran slowly in the fight', break: 'ran slowly',
};

function ask(slow: Slow, bytes: number): void {
  const box = $('#perf-ask');
  askedThisSession = true;
  askedFor = slow;
  box.querySelector('.pa-title')!.textContent = `The game ${WHERE[slow.scene]}`;
  box.querySelector('.pa-size')!.textContent = `${Math.max(1, Math.round(bytes / 1024))} KB`;
  box.className = 'asking';
  place();
}

async function send(): Promise<void> {
  const box = $('#perf-ask');
  const body = packed?.body;
  if (!body || sending) return;
  sending = true;
  box.className = 'sending';
  box.querySelector('.pa-note')!.textContent = 'Sending the performance report...';
  const sent = await sendTrace(body);
  sending = false;
  sentThisSession++;
  lastSent = performance.now();
  box.querySelector('.pa-note')!.innerHTML = 'code' in sent
    ? `Performance report sent, thank you. Its code: <b class="gold">${sent.code}</b>`
    : `The performance report couldn't be sent (${sent.error}).`;
  box.className = 'sent';
  letGo(false);
  clearTimeout(noteTimer);
  noteTimer = window.setTimeout(hide, NOTE_MS);
}

/** The waiting stretch let go: the recorder may find the next. */
function letGo(close = true): void {
  packed = null;
  askedFor = null;
  recorder.release();
  if (close) hide();
}

/** The prompt at the top of the screen, or under the choice after a wave while it shows (both stand at the top
 *  middle: the prompt hid the choice's buttons). Its top is zoomed with it, so it's given in the UI's px. */
function place(): void {
  const choice = document.getElementById('decision');
  const under = choice && !choice.classList.contains('hidden') ? choice.getBoundingClientRect().bottom + UNDER_GAP : 0;
  $('#perf-ask').style.top = under > UNDER_GAP ? `calc(${Math.round(under)}px / var(--ui, 1))` : '';
}

function hide(): void { $('#perf-ask').className = 'hidden'; }

/** The prompt shown now over a snapshot of the last minute, for a harness (`lab ui --states perfAsk`): nothing is
 *  sent unless a button is pressed. */
export async function askNow(): Promise<void> {
  const slow: Slow = { scene: G.mode === 'run' ? 'break' : 'lobby', verdict: recorder.judged(), tookMs: 0, at: performance.now(), snapshot: recorder.snapshot() };
  packed = { slow, body: await packTrace(slow) };
  ask(slow, packed.body.length);
}

/** The prompt put away, as Not now does without counting it. */
export function putAway(): void { letGo(); }
