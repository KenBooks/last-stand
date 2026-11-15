// tools/lab ui `heroes`, the panel's pages: the hero card, his look, his equipment and his attributes, each a tab of the panel
// (src/ui/heroSelect.ts). Checked: each tab clicked shows its page alone; the equipment the hero in focus's (each
// slot's item his in the hall, his stash's count), an item's card shown as the mouse comes over it (a tap on touch),
// and nothing of it to be moved (no slot or stash item draggable, a click on one leaving his gear as it was); his
// attributes his (the Health row his hall copy's); and the page chosen still shown as the screen opens again. The
// hall and the screen are read through their modules: `uiHeroes.ts` loads this one only where the tree has the screen
// (main's side of an A/B has neither). The canary makes one of his items draggable, which must be found. The look page:
// a button for each of his looks and a swatch for each hair colour, all within the panel (a finger's 40 px each on
// touch), another look and a hair colour clicked (tapped on touch) shown on his hall hero once he's built again, and
// pictured; then his own look and hair picked back.
import { G } from '../../../src/state';
import * as hall from '../../../src/game/hall';
import { CLASSES } from '../../../src/data/classes/index';
import { HAIR_COLOURS, looksOf } from '../../../src/data/heroLooks';
import { addHeroPicture } from './uiHeroes';
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

/** how long a look picked may take to be made and built (real ms: the workers paint and sculpt it) */
const RESTYLE_MS = 180000;
/** the least a touch target is across (css px, as drawn) */
const FINGER = 40;
/** the hair colour the check picks */
const PICKED_HAIR = 'auburn';

/** Button `element` clicked as the player would: tapped on touch, clicked with the mouse. */
async function press(lab: Lab, element: HTMLElement): Promise<void> {
  if (document.body.classList.contains('touch')) await lab.tap(middleOf(element));
  else await lab.clickOn(element);
}

/** Frames run until class `id`'s hall hero stands in his look, or `RESTYLE_MS` have passed (real time). */
async function restyled(lab: Lab, id: string): Promise<boolean> {
  const until = window.__labClock.realNow() + RESTYLE_MS;
  while (hall.hallHeroRestyling(id)) {
    if (window.__labClock.realNow() > until) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await lab.step(1);
  }
  return true;
}

/** The look page: every look and hair colour a button within the panel, another look and a colour picked shown on
 *  him, pictured, and his own picked back. */
async function lookPage(lab: Lab, screen: HTMLElement): Promise<Found> {
  const problems: string[] = [];
  if (!(await openPage(lab, screen, 'look', problems))) return { lines: [], problems };
  const hero = heroInFocus('look', problems);
  if (!hero) return { lines: [], problems };
  const page = tabOf(screen, 'look').body!;
  const looks = looksOf(CLASSES[hero.id].model);
  const presets = [...page.querySelectorAll<HTMLElement>('.hl-preset')];
  const swatches = [...page.querySelectorAll<HTMLElement>('.hl-swatch')];
  if (presets.length !== looks.length) problems.push(`heroes: the look page shows ${presets.length} looks, the ${hero.id} has ${looks.length}`);
  if (swatches.length !== HAIR_COLOURS.length + 1) problems.push(`heroes: the look page shows ${swatches.length} hair colours`);
  const panel = screen.querySelector('.hs-panel')!.getBoundingClientRect();
  const outside = [...presets, ...swatches].filter((button) => {
    const box = button.getBoundingClientRect();
    return box.left < panel.left - 1 || box.right > panel.right + 1;
  });
  if (outside.length) problems.push(`heroes: ${outside.length} of the look page's buttons reach past the panel`);
  const touch = document.body.classList.contains('touch');
  const small = touch ? swatches.filter((swatch) => swatch.getBoundingClientRect().width < FINGER - 0.5).length : 0;
  if (small) problems.push(`heroes: ${small} hair swatches under a finger's ${FINGER} px on touch`);
  const was = { ...hero.player.heroLook };
  const other = presets.find((button) => button.dataset.look !== was.preset);
  if (other) await press(lab, other);
  const hair = page.querySelector<HTMLElement>(`.hl-swatch[data-hair="${PICKED_HAIR}"]`);
  if (hair) await press(lab, hair);
  const built = await restyled(lab, hero.id);
  await lab.step(PAGE_FRAMES);
  const now = hall.hallHeroes()[hall.hallFocus()].player.heroLook;
  const shownLook = `${now.preset}, ${now.hair ?? 'own hair'}`;
  if (!built) problems.push(`heroes: the ${hero.id}'s look picked never built`);
  else if (now.preset !== other?.dataset.look || now.hair !== PICKED_HAIR) {
    problems.push(`heroes: picked ${other?.dataset.look}, ${PICKED_HAIR}; the hall's ${hero.id} stands in ${shownLook}`);
  }
  const marked = page.querySelector('.hl-preset[aria-checked="true"]')?.getAttribute('data-look');
  if (marked !== now.preset) problems.push(`heroes: the look page marks ${marked}, the hero wears ${now.preset}`);
  addHeroPicture(await lab.screen(`heroes: the look page, ${shownLook} picked`, [shownLook]));
  const own = page.querySelector<HTMLElement>(`.hl-preset[data-look="${was.preset}"]`);
  if (own) await press(lab, own);
  const ownHair = page.querySelector<HTMLElement>(`.hl-swatch[data-hair="${was.hair ?? ''}"]`);
  if (ownHair) await press(lab, ownHair);
  await restyled(lab, hero.id);
  const lines = [`  his look: ${presets.length} looks, ${swatches.length} hair colours, ${outside.length} past the panel; `
    + `picked ${shownLook} (${built ? 'built' : 'never built'}); then ${was.preset}, ${was.hair ?? 'own hair'} again`];
  return { lines, problems };
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
  const look = await lookPage(lab, screen);
  const gear = await gearPage(lab, screen, canary);
  const attributes = await attributesPage(lab, screen);
  const kept = await pageKept(lab, screen, 'attrs');
  for (const found of [look, gear, attributes, kept]) {
    lines.push(...found.lines);
    problems.push(...found.problems);
  }
  if (tabOf(screen, 'hero').tab) await openPage(lab, screen, 'hero', problems);
  return { lines, problems };
}
