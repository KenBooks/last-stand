// tools/lab ui `decision` (and `decisionTouch`'s): the choice after a wave's buttons, each label on one line. Narrowed
// on a short screen, the mouse's labels (their key beside them) wrapped onto two: "Bank spoils & / leave".
// Each button's stake (#347) is a line of its own under its label, so the label alone is counted, and the stake read
// too: on one line under it, never wrapping, as shown and at its longest (a boss near on wave 98, named by the longest
// boss's name; a co-op bank), each put in its place for the reading and taken out after.
// A canary: the choice made narrow enough to wrap them, which must be found.
// The choice is put away at once as the state closes: folded back into the wave badge on the browser's own timers,
// it was still half shown in the next state's picture.
import { hideDecision, resetDecision } from '../../../src/ui/hud';
import { BIOMES } from '../../../src/data/biomes';

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

/** The button's label (or its stake) and the lines it takes, as a report's line; a problem where over one. */
function readLine(state: string, part: HTMLElement, lines: string[], problems: string[]): void {
  const text = part.textContent?.trim() ?? '';
  const count = linesOf(part);
  lines.push(`  ${text}: ${count} line${count === 1 ? '' : 's'}`);
  if (count > 1) problems.push(`${state}: the button "${text}" runs onto ${count} lines`);
}

/** Each of the choice's buttons whose label, or its stake under it, runs onto more than one line, as problems of
 *  `state`. */
export function labelsOnOneLine(state: string): DecisionFound {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const button of document.querySelectorAll<HTMLElement>('#decision .dc-buttons .btn')) {
    const label = button.querySelector<HTMLElement>('.bank-label, .cont-label') ?? button;
    readLine(state, label, lines, problems);
    const stake = button.querySelector<HTMLElement>('.stake');
    if (stake?.textContent) readLine(state, stake, lines, problems);
  }
  longestStakes(state, lines, problems);
  return { lines, problems };
}

/** The longest words each button's stake can say (`showDecision` in `ui/hud.ts`). */
function longestStakeTexts(): { bank: string; cont: string } {
  const names = Object.values(BIOMES).map((biome) => biome.bossShort);
  const longest = names.reduce((a, b) => (b.length > a.length ? b : a));
  const banks = ['Keep all you carry · the run ends', 'Keep yours · the rest fight on'];
  const bank = banks.reduce((a, b) => (b.length > a.length ? b : a));
  return { bank, cont: `${longest} at wave 100 · better loot` };
}

/** Each stake put at its longest while it shows, read, and put back; the buttons must keep to one row meanwhile (on
 *  touch they wrap onto two where they can't, which made the choice taller). */
function longestStakes(state: string, lines: string[], problems: string[]): void {
  const texts = longestStakeTexts();
  const planted: { stake: HTMLElement; shown: string }[] = [];
  for (const [selector, text] of [['.bank-stake', texts.bank], ['.cont-stake', texts.cont]] as const) {
    const stake = document.querySelector<HTMLElement>(`#decision ${selector}`);
    if (!stake?.textContent) continue;
    planted.push({ stake, shown: stake.textContent });
    stake.textContent = text;
    readLine(state, stake, lines, problems);
  }
  if (planted.length) {
    const tops = [...document.querySelectorAll<HTMLElement>('#decision .dc-buttons .btn')]
      .map((button) => Math.round(button.getBoundingClientRect().top));
    const rows = new Set(tops).size;
    lines.push(`  the buttons with the longest stakes: ${rows} row${rows === 1 ? '' : 's'}`);
    if (rows > 1) problems.push(`${state}: with the longest stakes the buttons take ${rows} rows`);
  }
  for (const { stake, shown } of planted) stake.textContent = shown;
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
