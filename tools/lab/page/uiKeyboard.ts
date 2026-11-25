// `lab ui`'s keyboard diagram (`keyboardDiagram` in src/ui/menus.ts, the pause menu's Controls tab and How to play):
// every lit key whole, ending before the diagram's faded edge (#741, photo mode's P cut off by it; from review,
// "Nothing fixed": sized for the column alone, on a 1920 screen the keys at their 46 px left the box no room after P).
// Said: each keyboard's width, its last lit key's end and where its fade begins. Its canary (`KEYBOARD_CANARY`)
// shrinks the box to its rows, as it was, so P lies under the fade again.
import type { Found, Planted } from './uiKit';

/** how wide the diagram's faded edge is (css px of the diagram: `.kb`'s mask in src/ui/styles/_modals.scss) */
const FADE_PX = 24;
/** a key's end this close past the fade's start (screen px) is rounding, not a key under it */
const ROUNDING_PX = 0.5;

/** The problem the canary must raise, and what it plants. */
export const KEYBOARD_CANARY: Planted = { name: 'under the faded edge', what: 'the keyboard fitted to its rows' };

/** The keyboard diagrams shown now. */
const shownKeyboards = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('.kb')].filter((keyboard) => keyboard.checkVisibility());

/** The canary's plant: each keyboard shown fitted to its rows, no room after its last key (the fault as it was). */
export function plantKeyboardFitted(): void {
  for (const keyboard of shownKeyboards()) keyboard.style.width = 'fit-content';
}

/** Each keyboard shown: every lit key's end before the start of its faded edge. */
export function keyboardWhole(): Found {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const keyboard of shownKeyboards()) {
    const box = keyboard.getBoundingClientRect();
    // (the fade is in the diagram's own css px; the box on screen is that times the menu's scale)
    const scale = box.width / keyboard.offsetWidth;
    const fadeFrom = box.right - FADE_PX * scale;
    const lit = [...keyboard.querySelectorAll<HTMLElement>('.kb-key.on')];
    let last = { name: '', end: -Infinity };
    for (const key of lit) {
      const end = key.getBoundingClientRect().right;
      const name = key.querySelector('b')?.textContent ?? '?';
      if (end > last.end) last = { name, end };
      if (end > fadeFrom + ROUNDING_PX) {
        problems.push(`keyboard: ${name} ${KEYBOARD_CANARY.name} (its end ${(end - fadeFrom).toFixed(1)} px past it)`);
      }
    }
    lines.push(`  keyboard: ${Math.round(box.width)} px wide, its last lit key ${last.name} ending `
      + `${(fadeFrom - last.end).toFixed(1)} px before the faded edge`);
  }
  // (none on touch, which lists the touch controls instead)
  if (!lines.length) lines.push('  keyboard: none shown');
  return { lines, problems };
}
