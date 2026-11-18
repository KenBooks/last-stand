// The fight's loading bar as `lab ui`'s states find it (`uiStates/readying.ts`, `readyingHeroes.ts`): the bar, how
// many lines a label of it is laid out on, and whether it lies within the window.
import { boxText } from './uiKit';

/** The fight's loading bar, or null in a tree from before it. */
export const readyingBar = (): HTMLElement | null => document.getElementById('readying');

/** How many lines `element`'s text is laid out on. */
export function linesOf(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
}

/** How the fight's loading bar lies: how many lines its `label` is on, and `state`'s problems if the bar reaches past
 *  the window or the label runs onto more than one line. */
export function barPlaced(bar: HTMLElement, label: HTMLElement, state: string): { rows: number; problems: string[] } {
  const box = bar.querySelector('.rd-box')!.getBoundingClientRect();
  const rows = linesOf(label);
  const problems: string[] = [];
  const inside = box.left >= -0.5 && box.top >= -0.5 && box.right <= innerWidth + 0.5;
  if (!inside || box.bottom > innerHeight + 0.5) {
    const where = boxText({ x: box.x, y: box.y, w: box.width, h: box.height });
    problems.push(`${state}: the bar reaches past the window (${where})`);
  }
  if (rows !== 1) problems.push(`${state}: its label (${label.textContent?.trim()}) runs onto ${rows} lines`);
  return { rows, problems };
}
