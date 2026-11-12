// Temporarily leave the game's HTML fullscreen for an external dialog, then restore only that prior state.
// A return from another window may have no user activation: retry on the next game gesture if refused.
let previousTrip: { original(): Element | null; cancel(): Promise<void> } | null = null;

export function fullScreenTrip(leave: () => Promise<boolean>, resumeAuto: () => void): {
  ready: Promise<void>; finish(restore?: boolean): void;
} {
  const previous = previousTrip;
  previousTrip = null;
  const inherited = previous?.original() ?? null;
  const settled = previous?.cancel();
  let original: Element | null = null;
  const ready = (async () => {
    // A retry clicked during a pending restore must wait for it, then exit again before opening another popup.
    if (settled) await settled;
    original = document.fullscreenElement ?? inherited;
    if (document.fullscreenElement) {
      const left = await leave();
      if (!left && document.fullscreenElement) throw new Error('Could not leave fullscreen. Exit fullscreen and try again.');
    }
  })();
  let finished = false;
  let pending = false;
  let requesting = false;
  let restoration: Promise<void> = Promise.resolve();
  const events = ['pointerdown', 'pointerup', 'keydown', 'focus'];
  const stop = (): void => {
    pending = false;
    for (const event of events) window.removeEventListener(event, gesture, true);
    document.removeEventListener('fullscreenchange', changed);
    if (previousTrip === own) previousTrip = null;
  };
  const attempt = (): void => {
    if (!pending || requesting) return;
    if (document.fullscreenElement) { stop(); return; }
    requesting = true;
    try {
      restoration = original!.requestFullscreen({ navigationUI: 'hide' }).then(stop, () => { requesting = false; });
    } catch { requesting = false; }
  };
  const changed = (): void => { if (document.fullscreenElement) stop(); };
  const gesture = (event: Event): void => {
    // Manual fullscreen controls own their toggle; Escape explicitly keeps the game windowed.
    if ((event instanceof KeyboardEvent && event.key === 'Escape')
      || (event.target instanceof Element && event.target.closest('#btn-fullscreen, #btn-full'))) { stop(); return; }
    if (event instanceof PointerEvent) {
      if (event.type === 'pointerdown' ? event.pointerType !== 'mouse' : event.pointerType === 'mouse') return;
    }
    attempt();
  };
  const own = { original: () => original, cancel: (): Promise<void> => { stop(); return restoration; } };
  previousTrip = own;
  return { ready, finish: (restore = true) => {
    if (finished) return;
    finished = true;
    resumeAuto();
    if (!original || !restore || document.fullscreenElement) { stop(); return; }
    pending = true;
    for (const event of events) window.addEventListener(event, gesture, true);
    document.addEventListener('fullscreenchange', changed);
    try { window.focus(); } catch { /* the next real interaction can restore fullscreen */ }
    attempt();
  } };
}
