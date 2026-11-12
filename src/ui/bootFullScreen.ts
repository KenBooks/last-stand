// Inlined into the initial HTML by Vite: accept a loading-screen gesture before the game bundle has evaluated.
export interface BootFullScreen {
  pending: Promise<void> | null;
  entered: boolean;
  stop(): void;
}

declare global {
  interface Window { __bootFullScreen?: BootFullScreen }
}

/** Self-contained because the build serializes this function into a classic script before any game imports. */
export function installBootFullScreen(force = false): void {
  if (window.__bootFullScreen) return;
  const events = ['pointerdown', 'pointerup', 'keydown'];
  const state: BootFullScreen = { pending: null, entered: false, stop };
  window.__bootFullScreen = state;

  function stop(): void {
    for (const type of events) window.removeEventListener(type, gesture, true);
  }

  function gesture(event: Event): void {
    if (state.pending || state.entered || document.fullscreenElement) return;
    // A fullscreen button handles its own click. Entering on pointerdown would make that click exit again.
    if (event.target instanceof Element && event.target.closest('#btn-fullscreen, #btn-full')) return;
    if (event instanceof KeyboardEvent) {
      if (event.key === 'Escape') return;
    } else if (event instanceof PointerEvent) {
      const mouse = event.pointerType === 'mouse';
      if (event.type === 'pointerdown' ? !mouse : mouse) return;
    } else return;
    try {
      // Request synchronously inside the activating event; saving the gesture for boot loses user activation.
      state.pending = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      void state.pending.then(() => {
        state.entered = true;
        state.pending = null;
        stop();
      }, () => { state.pending = null; });
    } catch { state.pending = null; }
  }

  const off = document.cookie.split(';').some((part) => part.trim() === 'last-stand-auto-full-screen=off');
  // A standalone app can still enter HTML fullscreen; a fullscreen display-mode window is there already.
  if (!document.fullscreenEnabled || off || matchMedia('(display-mode: fullscreen)').matches) return;
  if (!force && (navigator.webdriver || new URLSearchParams(location.search).get('fullscreen') === '0')) return;
  for (const type of events) window.addEventListener(type, gesture, true);
}
