// `lab ui`'s pause menu (src/ui/menus.ts): opened on its Controls tab, as every time, and on its Settings tab. Each
// must fit the window without scrolling, the box inside the window and no page of it taller than its cell (the menu
// had the controls and the settings side by side, and grew past a short screen's height as settings were added). Both
// pages share one cell, so the box is the same size on either tab. Resume and Abandon stand either side of the title,
// each inside the box (on a tablet held upright Abandon ran past its edge). Its canary makes a settings row 600 px tall,
// which must make the box scroll.
import { pauseTab, showPause, type PauseTab } from '../../../src/ui/menus';

/** What a state found besides its boxes: lines for its report, and its problems. */
export interface PauseFound {
  lines: string[];
  problems: string[];
}

/** what the canary makes one settings row's height (css px) */
const CANARY_PX = 600;
/** the problem the canary must raise */
export const PAUSE_CANARY = { name: 'scrolls', what: 'a settings row 600 px tall' };
/** what must lie inside the box (shown ones: Abandon is hidden in the lobby) */
const INSIDE = ['#btn-resume', '#btn-abandon', '.pb-title', '.pb-tabs'];
/** a scroll this small (css px) is the box's rounding, not a scroll */
const ROUNDING_PX = 1;

let planted: HTMLElement | null = null;

/** The pause menu opened on `tab`; with the canary, a settings row made too tall to fit. */
export function openPause(tab: PauseTab, canary: boolean): void {
  showPause(true);
  if (tab !== 'controls') pauseTab(tab);
  if (!canary) return;
  planted = document.querySelector<HTMLElement>('#pause .pb-opts .opt-row');
  if (planted) planted.style.minHeight = `${CANARY_PX}px`;
}

export function closePause(): void {
  if (planted) planted.style.minHeight = '';
  planted = null;
  showPause(false);
}

const share = (part: number, whole: number): string => ((100 * part) / whole).toFixed(1);

/** The tab shown, the box's height as a share of the window's, and whether it scrolls or leaves the window. */
export function pauseShown(tab: PauseTab): PauseFound {
  const box = document.querySelector<HTMLElement>('#pause .pause-box');
  if (!box) return { lines: [], problems: [`pause, ${tab}: no pause menu`] };
  const problems: string[] = [];
  const active = document.querySelector<HTMLElement>('[data-pause-tab].active')?.dataset.pauseTab;
  if (active !== tab) problems.push(`pause, ${tab}: the ${active ?? 'no'} tab is shown`);
  const shown = document.querySelector<HTMLElement>(`[data-pause-page="${tab}"]`);
  if (!shown || shown.classList.contains('off')) problems.push(`pause, ${tab}: its page is hidden`);
  const scroll = box.scrollHeight - box.clientHeight;
  if (scroll > ROUNDING_PX) problems.push(`pause, ${tab}: the menu scrolls (${scroll} px more than it shows)`);
  const rect = box.getBoundingClientRect();
  const outside = rect.top < 0 || rect.left < 0 || rect.bottom > innerHeight || rect.right > innerWidth;
  if (outside) problems.push(`pause, ${tab}: the menu reaches past the window`);
  for (const selector of INSIDE) {
    const part = box.querySelector<HTMLElement>(selector);
    if (!part?.checkVisibility()) continue;
    const at = part.getBoundingClientRect();
    const past = at.left < rect.left || at.right > rect.right || at.top < rect.top || at.bottom > rect.bottom;
    if (past) problems.push(`pause, ${tab}: ${selector} reaches past the menu's edge`);
  }
  const lines = [
    `  ${tab} tab: the menu ${share(rect.height, innerHeight)}% of the window's height, `
      + `${share(rect.width, innerWidth)}% of its width, ${scroll > ROUNDING_PX ? 'scrolling' : 'no scrolling'}`,
  ];
  return { lines, problems };
}
