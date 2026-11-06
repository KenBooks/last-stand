// tools/lab ui `decision` (and `decisionTouch`'s): the choice after a wave's buttons, each label on one line. Narrowed
// on a short screen, the mouse's labels (their key beside them) wrapped onto two: "Bank spoils & / leave".
// A canary: the choice made narrow enough to wrap them, which must be found.
// The choice is put away at once as the state closes: folded back into the wave badge on the browser's own timers,
// it was still half shown in the next state's picture.
import { hideDecision, resetDecision } from '../../../src/ui/hud';

/** What the check found: lines for its report, and its problems. */
export interface DecisionFound {
  lines: string[];
  problems: string[];
}

/** the choice's width the canary sets (css px): too narrow for the buttons' labels on one line */
const CANARY_WIDTH = '300px';
/** the problem the canary must raise */
export const DECISION_CANARY = { name: 'runs onto', what: 'the choice too narrow for its labels' };

/** The lines `element`'s text is laid out on: its boxes, each starting below the line before it. */
export function linesOf(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0).sort((a, b) => a.top - b.top);
  let lines = 0;
  let bottom = -Infinity;
  for (const rect of rects) {
    if (rect.top < bottom - 1) continue;
    lines++;
    bottom = rect.bottom;
  }
  return lines;
}

/** Each of the choice's buttons whose label runs onto more than one line, as problems of `state`. */
export function labelsOnOneLine(state: string): DecisionFound {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const button of document.querySelectorAll<HTMLElement>('#decision .dc-buttons .btn')) {
    const label = button.textContent?.trim() ?? '';
    const count = linesOf(button);
    lines.push(`  ${label}: ${count} line${count === 1 ? '' : 's'}`);
    if (count > 1) problems.push(`${state}: the button "${label}" runs onto ${count} lines`);
  }
  return { lines, problems };
}

/** The choice's buttons checked; with the canary, again with the choice made narrow, which must be found. */
export function decisionShown(canary: boolean): DecisionFound {
  const found = labelsOnOneLine('decision');
  if (!canary) return found;
  const box = document.getElementById('decision')!;
  box.style.width = CANARY_WIDTH;
  const planted = labelsOnOneLine('decision');
  box.style.width = '';
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}

/** The choice put away at once, its fold back into the badge skipped. */
export function closeDecision(): void {
  hideDecision();
  resetDecision();
}
