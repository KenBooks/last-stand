// `lab ui`'s `guideKeys` state: the guide's controls legends on a hero's page (a loadout's keys, each with its skill,
// under every weapon style and every loadout that works), opened on the warrior's page, whose styles and loadouts
// have the most of them. Checked even: every slot of a legend as wide as the others, a row's slots on one line, each
// slot's key and name inside it, and the legend inside the page. Pictured whole and close up.
import { closeGuide, openGuide } from '../../../src/ui/guide/index';
import type { Lab, Pictured } from './lab';
import type { Found, Planted } from './uiKit';

/** the hero whose page is opened: the one with the most legends (three styles, two loadouts) */
const HERO = 'warrior';
/** css px two boxes may differ by and still count as one size or one line (Blink rounds layout to its units) */
const SLACK = 1.5;

/** The canary's plant: one slot made wider than the rest, as a chip's width followed its key's and name's. */
export const GUIDE_KEYS_CANARY: Planted = { name: 'guide keys: uneven slots', what: 'one slot made wider' };

/** The legends on the page, each its slots (the legend's markup: `keysRow` in src/ui/guide/heroes.ts). */
function legends(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#guide .gd-keys')];
}

function slotsOf(legend: HTMLElement): HTMLElement[] {
  return [...legend.querySelectorAll<HTMLElement>(':scope > .gd-kslot')];
}

/** The guide opened on the hero's page, scrolled to its first legend. */
export function openGuideKeys(): void {
  openGuide({ section: 'heroes', entry: HERO });
  scrollTo('.gd-style');
}

export function closeGuideKeys(): void {
  closeGuide();
}

/** The page scrolled so the first element `selector` names stands at its top. */
function scrollTo(selector: string): void {
  const page = document.querySelector<HTMLElement>('#guide .gd-page');
  const target = page?.querySelector<HTMLElement>(selector);
  if (!page || !target) return;
  // (by the browser: the box is zoomed by --ui, so a rect's px on the screen aren't its scroll's)
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
}

/** Whether `inner` lies inside `outer`, give or take the slack. */
function inside(inner: DOMRect, outer: DOMRect): boolean {
  const left = inner.left >= outer.left - SLACK;
  const right = inner.right <= outer.right + SLACK;
  return left && right && inner.top >= outer.top - SLACK && inner.bottom <= outer.bottom + SLACK;
}

/** One legend's problems: its slots' widths, its rows, each slot's parts and the legend's place in the page. */
function legendProblems(legend: HTMLElement, index: number, page: DOMRect): string[] {
  const problems: string[] = [];
  const name = `legend ${index + 1}`;
  const boxes = slotsOf(legend).map((slot) => slot.getBoundingClientRect());
  const widths = boxes.map((box) => box.width);
  if (Math.max(...widths) - Math.min(...widths) > SLACK) {
    const said = widths.map((width) => width.toFixed(0)).join(', ');
    problems.push(`guide keys: uneven slots in ${name}: ${said} px wide`);
  }
  for (const box of boxes) {
    const sameRow = boxes.filter((other) => Math.abs(other.top - box.top) <= SLACK);
    if (sameRow.some((other) => Math.abs(other.height - box.height) > SLACK)) {
      problems.push(`guide keys: a row of ${name} has slots of different heights`);
      break;
    }
  }
  slotsOf(legend).forEach((slot, at) => {
    const box = slot.getBoundingClientRect();
    for (const part of slot.querySelectorAll<HTMLElement>('*')) {
      if (inside(part.getBoundingClientRect(), box)) continue;
      problems.push(`guide keys: ${name}'s slot ${at + 1} has ${part.className || part.tagName} outside it`);
      break;
    }
  });
  const box = legend.getBoundingClientRect();
  if (box.left < page.left - SLACK || box.right > page.right + SLACK) {
    problems.push(`guide keys: ${name} is wider than the page`);
  }
  // (its slots too: the tray is held to the page's width, and its columns ran out past it, a slot unseen)
  const out = boxes.filter((slot) => !inside(slot, box) || slot.right > page.right + SLACK).length;
  if (out) problems.push(`guide keys: ${name} has ${out} slot(s) outside it or the page`);
  return problems;
}

/** A line for a legend: its slots and the rows they're laid in. */
function legendLine(legend: HTMLElement, index: number): string {
  const boxes = slotsOf(legend).map((slot) => slot.getBoundingClientRect());
  const rows = new Set(boxes.map((box) => Math.round(box.top))).size;
  const width = boxes[0]?.width ?? 0;
  return `  legend ${index + 1}: ${boxes.length} slots in ${rows} row(s), ${width.toFixed(0)} px each`;
}

/** The styles' table (a loadout's keys side by side, `compare` in heroes.ts): every skill's picture the same size,
 *  its name inside its place, and none past its cell (a key with no skill left out). */
function tableProblems(): { lines: string[]; problems: string[] } {
  const chips = [...document.querySelectorAll<HTMLElement>('#guide .gd-compare.keys td .gd-chip:not(.none)')];
  const boxes = chips.map((chip) => chip.getBoundingClientRect());
  const problems: string[] = [];
  // (the pictures' sizes: on a narrow page a name stands under its icon, and one of two lines makes a taller chip)
  const pictures = chips.map((chip) => chip.querySelector('.gd-ic')!.getBoundingClientRect());
  const widths = pictures.map((box) => box.width);
  const heights = pictures.map((box) => box.height);
  const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
  if (chips.length && (spread(widths) > SLACK || spread(heights) > SLACK)) {
    problems.push('guide keys: uneven slots in the styles\' table');
  }
  chips.forEach((chip, at) => {
    const cell = chip.closest('td')!.getBoundingClientRect();
    const name = chip.querySelector('.gd-cn');
    const outside = !inside(boxes[at], cell) || (name && !inside(name.getBoundingClientRect(), boxes[at]));
    if (outside) problems.push(`guide keys: the styles' table's skill ${at + 1} spills out of its place`);
  });
  if (!chips.length) problems.push(`guide keys: no styles' table on the ${HERO}'s page`);
  const size = `${(widths[0] ?? 0).toFixed(0)}x${(heights[0] ?? 0).toFixed(0)} px`;
  return { lines: [`  the styles' table: ${chips.length} skills, ${size} each`], problems };
}

/** Every legend on the hero's page checked, and the styles' table; with the canary, its plant first. */
export function guideKeysShown(canary: boolean): Found {
  const all = legends();
  // (its basis, not its width: the slots are a flex row's, each its share of the tray's)
  if (canary && all[0]) slotsOf(all[0])[0]?.style.setProperty('flex', '0 0 260px');
  const page = document.querySelector<HTMLElement>('#guide .gd-page')!.getBoundingClientRect();
  const problems = all.flatMap((legend, index) => legendProblems(legend, index, page));
  if (!all.length) problems.push(`guide keys: no legend on the ${HERO}'s page`);
  const table = tableProblems();
  return { lines: [...all.map(legendLine), ...table.lines], problems: [...problems, ...table.problems] };
}

/** The guide as the player sees it at the styles' table, the weapon styles and the loadouts (with the combos under
 *  them), and a legend close up. */
export async function guideKeysPictures(lab: Lab): Promise<Pictured[]> {
  const pictures: Pictured[] = [];
  scrollTo('.gd-compare');
  pictures.push(await lab.screen('guide-table', [], '#guide .gd-box'));
  scrollTo('.gd-style');
  pictures.push(await lab.screen('guide-styles', [], '#guide .gd-box'));
  pictures.push(await lab.screen('guide-legend', [], '#guide .gd-style'));
  scrollTo('.gd-load');
  pictures.push(await lab.screen('guide-loadouts', [], '#guide .gd-box'));
  scrollTo('.gd-style');
  return pictures;
}
