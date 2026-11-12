// `lab ui`'s notice of a beta (src/ui/beta.ts): shown at the top as the game opens with the village on, with the way
// back to the lobby as it was. Pictured as the lobby shows it, it must lie inside the window, its text and its two
// buttons inside it, each button found by the mouse at its middle (a phone's narrow screen is where it would run past
// the edge or fold its buttons under something). In the lobby without the village there is none to show, which the
// state says. Its canary makes the notice twice the window's width, which must be found past the window. What its
// buttons do, and that it shows as the game opens, is `lab beta`'s (the page loads again there); the pause menu's
// Beta tab is `uiPause.ts`'s, as its other tabs are.
import { VILLAGE } from '../../../src/core/beta';
import { hideBetaNotice, showBetaNotice } from '../../../src/ui/beta';

/** What the state found besides its boxes: lines for its report, and its problems. */
export interface BetaFound {
  lines: string[];
  problems: string[];
}

/** the problem the canary must raise */
export const BETA_NOTICE_CANARY = { name: 'reaches past the window', what: 'the notice twice the window\'s width' };
/** what of the notice must lie inside it, by its selector and what it's called in a report */
const INSIDE: [string, string][] = [
  ['#btn-beta-back', 'Back to the old lobby'],
  ['#btn-beta-close', 'Close'],
];

const notice = (): HTMLElement => document.querySelector<HTMLElement>('#beta-notice')!;

/** Whether this page has a notice to show (the village on): the canary has nothing to catch without one. */
export const betaNoticeHere = (): boolean => VILLAGE;

/** The notice shown as the game's opening shows it. */
export function openBetaNotice(): void {
  showBetaNotice();
}

/** The notice put away, and the canary's width with it. */
export function closeBetaNotice(): void {
  notice().style.minWidth = '';
  hideBetaNotice();
}

const share = (part: number, whole: number): string => ((100 * part) / whole).toFixed(1);

/** The notice's box against the window, and its buttons inside it and found by the mouse. */
function noticeFound(): BetaFound {
  const box = notice().getBoundingClientRect();
  const problems: string[] = [];
  const past = box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight;
  if (past) problems.push(`betaNotice: the notice ${BETA_NOTICE_CANARY.name}`);
  for (const [selector, name] of INSIDE) {
    const button = document.querySelector<HTMLElement>(selector);
    if (!button?.checkVisibility()) {
      problems.push(`betaNotice: no ${name} shown`);
      continue;
    }
    const at = button.getBoundingClientRect();
    const outside = at.left < box.left || at.right > box.right || at.top < box.top || at.bottom > box.bottom;
    if (outside) problems.push(`betaNotice: ${name} lies outside the notice`);
    const hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
    if (hit && button.contains(hit)) continue;
    const there = hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}.${hit.className}` : 'nothing';
    problems.push(`betaNotice: ${name} isn't found by the mouse at its middle (${there} is there)`);
  }
  const lines = [
    `  the notice ${share(box.width, innerWidth)}% of the window's width, `
      + `${share(box.height, innerHeight)}% of its height, ${share(box.top, innerHeight)}% from its top`,
  ];
  return { lines, problems };
}

/** The notice as shown; with the canary, read again twice the window's width. */
export function betaNoticeShown(canary: boolean): BetaFound {
  if (!VILLAGE) {
    const hidden = notice().classList.contains('hidden');
    const problems = hidden ? [] : ['betaNotice: a notice shown in the lobby without the village'];
    return { lines: ['  the lobby without the village: no notice'], problems };
  }
  if (notice().classList.contains('hidden')) return { lines: [], problems: ['betaNotice: no notice shown'] };
  const found = noticeFound();
  if (!canary) return found;
  // (its least width: its width alone is held to the window's by the notice's own most)
  notice().style.minWidth = `${2 * innerWidth}px`;
  const planted = noticeFound();
  notice().style.minWidth = '';
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}
