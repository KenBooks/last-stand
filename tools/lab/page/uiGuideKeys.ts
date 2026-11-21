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

/** Every legend on the hero's page checked; with the canary, its plant first. */
export function guideKeysShown(canary: boolean): Found {
  const all = legends();
  if (canary && all[0]) slotsOf(all[0])[0]?.style.setProperty('width', '260px');
  const page = document.querySelector<HTMLElement>('#guide .gd-page')!.getBoundingClientRect();
  const problems = all.flatMap((legend, index) => legendProblems(legend, index, page));
  if (!all.length) problems.push(`guide keys: no legend on the ${HERO}'s page`);
  return { lines: all.map(legendLine), problems };
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
