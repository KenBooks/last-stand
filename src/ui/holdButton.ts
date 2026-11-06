// A button that acts only once held down for a while (the pause menu's Abandon run): pressed, a fill runs across it
// as long as the hold takes; let go before it's full, it says to hold instead, so a stray click or tap never ends a
// run. By the mouse, a finger or the keyboard (Enter or Space held while it has the focus).

/** what a hold-to-confirm button does */
export interface HoldOptions {
  /** how long it's held (ms) before it acts */
  ms: number;
  /** what it says, over its label, when let go too soon */
  hint: string;
  /** what it does once held long enough */
  done: () => void;
}

/** how long the hint stays over the label (ms) */
const HINT_MS = 1800;
/** the keys that hold a focused button, as a click of it */
const HOLD_KEYS = ['Enter', 'Space', 'NumpadEnter'];

/** `button` made to act only once held for `ms` (`.hold-btn`, `styles/_modals.scss`); a click alone does nothing. */
export function holdToConfirm(button: HTMLElement, { ms, hint, done }: HoldOptions): void {
  let held = 0;
  let hinted = 0;
  button.classList.add('hold-btn');
  button.dataset.hint = hint;
  button.dataset.holdMs = String(ms);

  const start = () => {
    if (held) return;
    clearTimeout(hinted);
    button.classList.remove('hinting');
    // (read at each press: `lab ui --states pauseAbandon --canary` sets it to 0, and a click must be caught acting)
    const holdMs = Number(button.dataset.holdMs);
    button.style.setProperty('--hold-ms', `${holdMs}ms`);
    button.classList.add('holding');
    held = window.setTimeout(() => {
      held = 0;
      button.classList.remove('holding');
      done();
    }, holdMs);
  };
  const letGo = () => {
    if (!held) return;
    clearTimeout(held);
    held = 0;
    button.classList.remove('holding');
    button.classList.add('hinting');
    hinted = window.setTimeout(() => button.classList.remove('hinting'), HINT_MS);
  };

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // (held on its own pointer: a finger drifting a little off it doesn't let go)
    button.setPointerCapture(e.pointerId);
    start();
  });
  button.addEventListener('pointerup', letGo);
  button.addEventListener('pointercancel', letGo);
  // a long press on a phone opens no menu over it
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  button.addEventListener('keydown', (e) => {
    if (!HOLD_KEYS.includes(e.code)) return;
    e.preventDefault();
    if (!e.repeat) start();
  });
  button.addEventListener('keyup', (e) => {
    if (HOLD_KEYS.includes(e.code)) letGo();
  });
  button.addEventListener('blur', letGo);
}

/** `button`'s hold let go and its hint taken away, unsaid (the menu it's on closed). */
export function resetHold(button: HTMLElement): void {
  button.classList.remove('holding', 'hinting');
}
