// tools/lab ui `heroes`, the panel's pages: the hero card, his equipment and his attributes, each a tab of the panel
// (src/ui/heroSelect.ts). Checked: each tab clicked shows its page alone; the equipment the hero in focus's (each
// slot's item his in the hall, his stash's count), an item's card shown as the mouse comes over it (a tap on touch),
// and nothing of it to be moved (no slot or stash item draggable, a click on one leaving his gear as it was); his
// attributes his (the Health row his hall copy's); and the page chosen still shown as the screen opens again. The
// hall and the screen are read through their modules: `uiHeroes.ts` loads this one only where the tree has the screen
// (main's side of an A/B has neither). The canary makes one of his items draggable, which must be found.
import { G } from '../../../src/state';
import * as hall from '../../../src/game/hall';
import { closeHeroSelect, openHeroSelect } from '../../../src/ui/heroSelect';
import type { Lab } from './lab';

/** frames run after a tab is clicked or the screen opened again */
const PAGE_FRAMES = 2;

/** What the pages' checks found: lines for the report, and problems. */
interface Found {
  lines: string[];
  problems: string[];
}

const shown = (element: Element | null): boolean => !!element?.checkVisibility({ visibilityProperty: true });

/** The panel's tab for page `page`, and its page. */
function tabOf(screen: HTMLElement, page: string): { tab: HTMLElement | null; body: HTMLElement | null } {
  const tab = screen.querySelector<HTMLElement>(`.hs-pagetabs [data-page="${page}"]`);
  const body = screen.querySelector<HTMLElement>(`.hs-page[data-page="${page}"]`);
  return { tab, body };
}

/** The pages shown, by name. */
function pagesShown(screen: HTMLElement): string[] {
  const pages = [...screen.querySelectorAll<HTMLElement>('.hs-page')];
  return pages.filter(shown).map((page) => page.dataset.page ?? '?');
}

/** Tab `page` clicked as a player clicks it: a problem unless its page alone is shown. */
async function openPage(lab: Lab, screen: HTMLElement, page: string, problems: string[]): Promise<boolean> {
  const { tab } = tabOf(screen, page);
  if (!tab) {
    problems.push(`heroes: the panel has no ${page} tab`);
    return false;
  }
  await lab.clickOn(tab);
  await lab.step(PAGE_FRAMES);
  const pages = pagesShown(screen);
  if (pages.join() !== page) problems.push(`heroes: the ${page} tab clicked, ${pages.join(', ') || 'no page'} shown`);
  return true;
}

/** The middle of `element` (css px). */
function middleOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

/** An item's card shown over `slot` as the mouse comes over it (on touch, a tap), naming `name`. */
async function cardOver(lab: Lab, slot: HTMLElement, name: string): Promise<boolean> {
  const at = middleOf(slot);
  if (matchMedia('(hover: none)').matches) await lab.tap(at);
  else await lab.mouseTo(at);
  await lab.step(1);
  const tooltip = document.getElementById('tooltip');
  const over = !!tooltip && !tooltip.classList.contains('hidden') && !!tooltip.textContent?.includes(name);
  return over;
}

/** The hall's hero in focus as page `page` opened, or a problem where there is none (the screen closed under the
 *  check: a click on the name of the hero in focus chooses him). */
function heroInFocus(page: string, problems: string[]): hall.HallHero | undefined {
  const hero = hall.hallHeroes()[hall.hallFocus()];
  if (!hero) problems.push(`heroes: no hero in focus as the ${page} page opened (the hall open: ${hall.hallOpen()})`);
  return hero;
}

/** The equipment page: the hero in focus's gear and stash, a card on hover, nothing to be moved. */
async function gearPage(lab: Lab, screen: HTMLElement, canary: boolean): Promise<Found> {
  const problems: string[] = [];
  if (!(await openPage(lab, screen, 'gear', problems))) return { lines: [], problems };
  const hero = heroInFocus('equipment', problems);
  if (!hero) return { lines: [], problems };
  const page = tabOf(screen, 'gear').body!;
  const slots = [...page.querySelectorAll<HTMLElement>('.eslot')];
  const items = [...page.querySelectorAll<HTMLElement>('.sitem[data-item]')];
  let wrong = 0;
  for (const slot of slots) {
    const item = hero.profile.equipped[slot.dataset.slot as keyof typeof hero.profile.equipped];
    const label = slot.getAttribute('aria-label') ?? '';
    if (item ? !label.includes(item.name) : !label.includes('empty') && !label.includes('locked')) wrong++;
  }
  if (wrong) problems.push(`heroes: ${wrong} of the equipment's slots aren't the ${hero.id}'s`);
  if (items.length !== hero.profile.stash.length) {
    problems.push(`heroes: the stash shows ${items.length} items, the ${hero.id} has ${hero.profile.stash.length}`);
  }
  const worn = slots.find((slot) => !slot.classList.contains('empty'));
  if (canary && worn) worn.draggable = true;
  const draggable = [...slots, ...items].filter((element) => element.draggable).length;
  if (draggable) problems.push(`heroes: ${draggable} of the ${hero.id}'s items can be dragged`);
  const wornItem = worn ? hero.profile.equipped[worn.dataset.slot as keyof typeof hero.profile.equipped] : undefined;
  const carded = worn && wornItem ? await cardOver(lab, worn, wornItem.name) : false;
  if (worn && !carded) problems.push(`heroes: no card over the ${hero.id}'s ${worn.dataset.slot}`);
  const gear = JSON.stringify(hero.profile.equipped);
  const lobby = JSON.stringify(G.profile.equipped);
  if (worn) await lab.clickOn(worn);
  if (items[0]) await lab.clickOn(items[0]);
  await lab.step(PAGE_FRAMES);
  const kept = JSON.stringify(hero.profile.equipped) === gear && JSON.stringify(G.profile.equipped) === lobby;
  if (!kept) problems.push(`heroes: a click on the ${hero.id}'s items changed his gear`);
  const filled = slots.length - slots.filter((slot) => slot.classList.contains('empty')).length;
  const lines = [`  his equipment: the ${hero.id}'s, ${filled} of ${slots.length} slots worn, ${items.length} in his `
    + `stash; a card over his ${worn?.dataset.slot ?? 'nothing'}: ${carded}; ${draggable} draggable, clicked: `
    + `${kept ? 'kept' : 'changed'}`];
  return { lines, problems };
}

/** The attributes page: the hero in focus's (his Health as his hall copy has it). */
async function attributesPage(lab: Lab, screen: HTMLElement): Promise<Found> {
  const problems: string[] = [];
  if (!(await openPage(lab, screen, 'attrs', problems))) return { lines: [], problems };
  const hero = heroInFocus('attributes', problems);
  if (!hero) return { lines: [], problems };
  const rows = [...tabOf(screen, 'attrs').body!.querySelectorAll<HTMLElement>('.row')];
  const health = rows.find((row) => row.firstElementChild?.textContent === 'Health')?.lastElementChild?.textContent;
  const his = String(Math.round(hero.player.stats.maxLife));
  if (health !== his) problems.push(`heroes: the attributes say Health ${health}, the ${hero.id} has ${his}`);
  return { lines: [`  his attributes: ${rows.length} rows, Health ${health} (the ${hero.id}'s ${his})`], problems };
}

/** The screen closed and opened again on the hero in focus: the page last chosen still shown. */
async function pageKept(lab: Lab, screen: HTMLElement, page: string): Promise<Found> {
  const id = hall.hallHeroes()[hall.hallFocus()].id;
  closeHeroSelect();
  openHeroSelect(id);
  await lab.step(PAGE_FRAMES);
  const pages = pagesShown(screen);
  const problems = pages.join() === page ? [] : [`heroes: opened again, ${pages.join(', ') || 'no page'} shown`];
  return { lines: [`  opened again: the ${pages.join(', ') || 'no'} page shown`], problems };
}

/** The panel's pages, each clicked in turn and checked, the hero card shown again as they end. `canary`: one of his
 *  items made draggable. */
export async function heroPages(lab: Lab, screen: HTMLElement, canary: boolean): Promise<Found> {
  const lines: string[] = [];
  const problems: string[] = [];
  const gear = await gearPage(lab, screen, canary);
  const attributes = await attributesPage(lab, screen);
  const kept = await pageKept(lab, screen, 'attrs');
  for (const found of [gear, attributes, kept]) {
    lines.push(...found.lines);
    problems.push(...found.problems);
  }
  if (tabOf(screen, 'hero').tab) await openPage(lab, screen, 'hero', problems);
  return { lines, problems };
}
