// tools/lab ui `sheetTouch` and `litTouch`: the stash and equipment panel as a finger uses it.
// - sheetTouch: a stash item tapped opens its sheet (src/ui/menus.ts `openItemSheet`): its card beside the one worn,
//   each a shield's long block description, and the sheet's buttons under them. On the owner's phone held sideways
//   (832x384) the buttons were below the screen's bottom, scrolled away with the cards, though there was room round
//   them. Every button must be within the window and within the sheet as it shows, a finger's height.
// - litTouch: a worn item pressed long lights the stash items that fit its slot. The light went out as the finger
//   lifted; it must stay until the next tap: on a lit item (its sheet opened and closed again, still lit), or
//   elsewhere (put out). A long press lights alone: on a stash item it opened the item's sheet too, on the owner's
//   phone, where a short tap opens it.
// A canary each: the cards kept from scrolling (the buttons pushed out of the sheet), and the light put out and the
// sheet opened as the finger lifts.
import { G } from '../../../src/state';
import { makeItem } from '../../../src/loot/items';
import * as menus from '../../../src/ui/menus';
import { panelsBack, showPanels } from './lobbyPanels';
import { hideTooltip } from '../../../src/ui/tooltip';
import type { Item, Slot } from '../../../src/types';
import { middleOf, realWait } from './lab';
import type { Lab, Pictured } from './lab';

/** What a check found: lines for its report, and its problems. */
export interface SheetFound {
  lines: string[];
  problems: string[];
}

/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of the panels) */
const TAP_AT = { x: 0.62, y: 0.15 };
/** frames run after a tap, for the page to follow it */
const TAP_FRAMES = 2;
/** the least height of the sheet's buttons (css px): a finger's */
const BUTTON_PX = 28;
/** how long the finger rests on the worn item (ms of the browser's time): a long press, past the focus's delay */
const PRESS_MS = 700;
/** how long the light is watched after the finger lifts (ms of the browser's time) */
const HELD_MS = 1200;
/** the stash given these items while the light is checked: some fit the pressed slot, the rest don't */
const STASH_SLOTS: Slot[] = ['weapon', 'chest', 'head', 'weapon', 'ring', 'hands', 'weapon', 'chest'];
/** the slot whose worn item is pressed */
const PRESSED: Slot = 'weapon';
/** what the canaries plant, and the problem each must raise */
export const SHEET_CANARIES = {
  sheetTouch: [{ name: 'lies out of', what: 'the cards kept from scrolling' }],
  litTouch: [
    { name: 'went out', what: 'the light put out as the finger lifts' },
    { name: 'opened its card', what: 'the sheet opened as the finger lifts' },
  ],
};

/** the hero's own stash and worn item, kept while the state's are shown */
let keptStash: Item[] | null = null;
let keptWorn: { slot: Slot; item: Item | undefined } | null = null;
/** whether the lobby's rail was turned to the gear (a short screen shows one panel at a time) */
let railTurned = false;

/** A finger's tap at `at`, and the frames after it. */
async function tap(lab: Lab, at: { x: number; y: number }): Promise<void> {
  await lab.tap(at);
  await lab.step(TAP_FRAMES);
}

/**
 * The page put in touch mode by a tap on the world, then the chest's panels shown and the rail turned to the gear on a
 * short screen. The world is tapped first: after the skills' tooltips, an upright tablet's chest panel lay under the
 * spot, and the tap opened a stash item's sheet, which the item's own tap then closed on its backdrop.
 */
async function touchGear(lab: Lab): Promise<void> {
  const world = { x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y };
  if (!document.body.classList.contains('touch')) await tap(lab, world);
  if (!document.body.classList.contains('touch')) throw new Error('lab: ui: the tap left the page out of touch mode');
  showPanels('chest');
  railTurned = !document.getElementById('stash')?.checkVisibility();
  const gearTab = document.querySelector<HTMLElement>('#lobby-rail [data-lt="gear"]');
  if (railTurned && gearTab) await tap(lab, middleOf(gearTab));
  if (!document.getElementById('stash')?.checkVisibility()) throw new Error("lab: ui: the stash isn't shown");
  if (!document.getElementById('item-sheet')!.classList.contains('hidden')) {
    throw new Error('lab: ui: a sheet was open before the item was tapped');
  }
}

/** The hero's own stash and worn item back, the rail turned back to the hero, the mouse moved (mouse mode again). */
async function restore(lab: Lab): Promise<void> {
  document.getElementById('item-sheet')?.classList.add('hidden');
  hideTooltip();
  if (keptStash) G.profile.stash = keptStash;
  if (keptWorn) G.profile.equipped[keptWorn.slot] = keptWorn.item;
  keptStash = null;
  keptWorn = null;
  menus.renderMenu();
  if (railTurned) document.querySelector<HTMLElement>('#lobby-rail [data-lt="hero"]')?.click();
  railTurned = false;
  panelsBack();
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  await lab.mouseTo({ x: innerWidth / 2 + 1, y: innerHeight / 2 });
  if (document.body.classList.contains('touch')) throw new Error('lab: ui: the mouse left the page in touch mode');
}

/** A shield of `rarity` as the owner's were: a block's chance and amount, so its card spells out its long note. */
function shield(slot: Slot, rarity: 'common' | 'magic', block: number, amount: number): Item {
  const item = makeItem({ slot, rarity, cls: G.player.cls });
  item.stats.block = block;
  item.stats.blockAmount = amount;
  return item;
}

/**
 * The sheet of a magic shield in the stash opened by a finger's tap, a common one worn in its slot (the off-hand, or
 * the weapon's for a class with none), so its card stands beside the worn one's, each with the block's long note.
 */
export async function openSheetTouch(lab: Lab): Promise<void> {
  const slot: Slot = G.player.cls.excludeSlots?.includes('offhand') ? 'weapon' : 'offhand';
  keptStash = G.profile.stash;
  keptWorn = { slot, item: G.profile.equipped[slot] };
  const tapped = shield(slot, 'magic', 11, 46);
  G.profile.equipped[slot] = shield(slot, 'common', 10, 36);
  G.profile.stash = [tapped];
  menus.renderMenu();
  await touchGear(lab);
  const item = document.querySelector<HTMLElement>(`#stash .sitem[data-slot="${slot}"]`);
  if (!item) throw new Error('lab: ui: no stash item to tap');
  const at = middleOf(item);
  await tap(lab, at);
  if (document.getElementById('item-sheet')!.classList.contains('hidden')) {
    const under = named(document.elementFromPoint(at.x, at.y));
    throw new Error(`lab: ui: the tap opened no sheet (under the finger: ${under})`);
  }
}

/** `element` named for an error: its tag, its id or its classes, and the id of what it's in. */
function named(element: Element | null): string {
  if (!element) return 'nothing';
  const own = element.id ? `#${element.id}` : `.${[...element.classList].join('.')}`;
  const within = element.parentElement?.closest('[id]');
  return `${element.tagName.toLowerCase()}${own}${within ? ` in #${within.id}` : ''}`;
}

/** The sheet put away, and the hero's own gear back. */
export const closeSheetTouch = restore;

/** Whether `box` lies within `outer` (to a pixel's rounding). */
function within(box: DOMRect, outer: { left: number; top: number; right: number; bottom: number }): boolean {
  const slack = 1;
  return box.left >= outer.left - slack && box.right <= outer.right + slack
    && box.top >= outer.top - slack && box.bottom <= outer.bottom + slack;
}

/** `part` as a whole percentage of `whole`. */
const percent = (part: number, whole: number) => (part / whole * 100).toFixed(0);

/** The window's box. */
const windowBox = () => ({ left: 0, top: 0, right: innerWidth, bottom: innerHeight });

/** The sheet's buttons against the window and the sheet as it shows, and how much of its cards scroll. */
function buttonsFound(state: string): SheetFound {
  const box = document.querySelector<HTMLElement>('#item-sheet .modal-box')!;
  const sheet = box.getBoundingClientRect();
  const card = document.querySelector<HTMLElement>('#item-sheet .is-card')!;
  const size = `${sheet.width.toFixed(0)}x${sheet.height.toFixed(0)} px`;
  const shares = `${percent(sheet.width, innerWidth)}% x ${percent(sheet.height, innerHeight)}% of the window`;
  const scroll = box.scrollHeight - box.clientHeight;
  const lines = [
    `  the sheet: ${size} (${shares})`,
    `  its cards: ${card.clientHeight} px shown of ${card.scrollHeight}, the sheet's own scroll ${scroll} px`,
  ];
  const problems: string[] = [];
  for (const button of document.querySelectorAll<HTMLElement>('#item-sheet .dc-buttons .btn')) {
    const label = button.textContent?.trim() ?? '';
    const rect = button.getBoundingClientRect();
    const place = `top ${rect.top.toFixed(0)}, bottom ${rect.bottom.toFixed(0)}`;
    lines.push(`  "${label}": ${rect.height.toFixed(1)} px tall, ${place}`);
    if (!within(rect, windowBox())) problems.push(`${state}: the button "${label}" lies out of the window`);
    else if (!within(rect, sheet)) problems.push(`${state}: the button "${label}" lies out of the sheet (scrolled)`);
    if (rect.height < BUTTON_PX) problems.push(`${state}: the button "${label}" ${rect.height.toFixed(1)} px tall`);
  }
  if (!within(sheet, windowBox())) problems.push(`${state}: the sheet reaches out of the window`);
  return { lines, problems };
}

/** how many windows tall the block planted in the cards is (its px are the zoomed sheet's, `--ui` of the page's) */
const TALL_WINDOWS = 3;

/** A block taller than the window put at the end of the sheet's cards (a card longer than any screen); its removal. */
function plantTallCard(): () => void {
  const block = document.createElement('div');
  block.style.height = `${innerHeight * TALL_WINDOWS}px`;
  document.querySelector('#item-sheet .is-card')!.append(block);
  return () => block.remove();
}

/** The sheet's cards kept from scrolling, as main's were (the sheet scrolled them and its buttons); its undoing. */
function plantNoScroll(): () => void {
  const card = document.querySelector<HTMLElement>('#item-sheet .is-card')!;
  card.style.flex = 'none';
  card.style.overflow = 'visible';
  return () => {
    card.style.flex = '';
    card.style.overflow = '';
  };
}

/**
 * The sheet checked as it opened, and again with its cards made longer than the window (their text must scroll, the
 * buttons stay); with the canary, the long cards kept from scrolling too, which must be found.
 */
export function sheetTouchShown(canary: boolean): SheetFound {
  const found = buttonsFound('sheetTouch');
  const removeTall = plantTallCard();
  const tall = buttonsFound('sheetTouch, its cards longer than the window');
  const planted = canary ? undoAfter(plantNoScroll(), () => buttonsFound('sheetTouch')) : null;
  removeTall();
  const lines = [...found.lines, '  its cards longer than the window:', ...tall.lines];
  return { lines, problems: [...found.problems, ...tall.problems, ...(planted?.problems ?? [])] };
}

/** `check`'s result, with `undo` run after it. */
function undoAfter(undo: () => void, check: () => SheetFound): SheetFound {
  try {
    return check();
  } finally {
    undo();
  }
}

/** The stash items that fit `slot`, and how many of them are lit. */
function litCount(slot: Slot): { fit: number; lit: number } {
  const fitting = [...document.querySelectorAll<HTMLElement>(`#stash .sitem[data-slot="${slot}"]`)];
  const focused = document.getElementById('menu')!.classList.contains('slot-focus');
  const lit = focused ? fitting.filter((item) => item.classList.contains('match')).length : 0;
  return { fit: fitting.length, lit };
}

/** The light as it shows: a line, and whether every item that fits is lit. */
function lightLine(when: string): { line: string; lit: boolean } {
  const { fit, lit } = litCount(PRESSED);
  return { line: `  ${when}: ${lit} of ${fit} stash items lit`, lit: fit > 0 && lit === fit };
}

/** whether the canary is planted as the finger lifts (set by `ui` before the state opens) */
let canary = false;

/** The canary planted in the next `litTouch`, or not. */
export function plantLitCanary(planted: boolean): void {
  canary = planted;
}

/** the light as it showed after the press, before the picture (what `litTouch`'s check reports) */
let afterPress: { line: string; lit: boolean } | null = null;

/** The worn item's light put out as main's did when the finger lifted: the canary's. */
function putOut(): void {
  document.getElementById('menu')!.classList.remove('slot-focus');
  for (const item of document.querySelectorAll('.sitem.match, .eslot.match')) item.classList.remove('match');
}

/**
 * The worn weapon pressed long by a finger (`PRESS_MS`) and let go, the stash holding items that fit its slot and
 * others, and the light watched for `HELD_MS` after (the canary puts it out as the finger lifts).
 */
export async function openLitTouch(lab: Lab): Promise<void> {
  keptStash = G.profile.stash;
  G.profile.stash = STASH_SLOTS.map((slot) => makeItem({ slot, rarity: 'magic', cls: G.player.cls }));
  if (!G.profile.equipped[PRESSED]) {
    keptWorn = { slot: PRESSED, item: undefined };
    G.profile.equipped[PRESSED] = makeItem({ slot: PRESSED, cls: G.player.cls });
  }
  menus.renderMenu();
  await touchGear(lab);
  const worn = document.querySelector<HTMLElement>(`#equip .eslot[data-slot="${PRESSED}"]`);
  if (!worn) throw new Error('lab: ui: no worn weapon to press');
  wornOpened = await pressLong(lab, worn, canary);
  afterPress = lightLine(`${HELD_MS} ms after the finger lifted`);
}

/** the moments after a long press pictured, as the finger left them (a card opened over the stash, or none) */
let pressPictures: Pictured[] = [];

/** The moments after a long press `litTouch` pictured, given once. */
export function litTouchPictures(): Pictured[] {
  const pictures = pressPictures;
  pressPictures = [];
  return pictures;
}

/** whether the long press on the worn weapon opened its card (its sheet or its tooltip) */
let wornOpened = false;

/**
 * `element` pressed long by a finger (`PRESS_MS`) and let go, and `HELD_MS` waited (with `canary`, the light put out
 * and the sheet opened as the finger lifts); whether its card opened (its sheet or its tooltip), put away again.
 */
async function pressLong(lab: Lab, element: HTMLElement, canary: boolean, pictured?: string): Promise<boolean> {
  const sheet = document.getElementById('item-sheet')!;
  sheet.classList.add('hidden');
  await lab.touchDown(middleOf(element));
  await realWait(PRESS_MS);
  await lab.touchUp();
  if (canary) {
    putOut();
    sheet.classList.remove('hidden');
  }
  await lab.step(TAP_FRAMES);
  await realWait(HELD_MS);
  // (its sheet, or the tap's tooltip pinned in its place: shown when the sheet, which hides it, isn't)
  const tooltip = document.getElementById('tooltip')!;
  const opened = !sheet.classList.contains('hidden') || !tooltip.classList.contains('hidden');
  if (pictured) pressPictures.push(await lab.screen(pictured));
  sheet.classList.add('hidden');
  hideTooltip();
  return opened;
}

/**
 * The light after the press, then a lit item tapped (its sheet opened) and the sheet closed (still lit), then a tap
 * elsewhere (an empty stash cell: put out). Each is a problem where it isn't so.
 */
export async function litTouchShown(_canary: boolean, lab: Lab): Promise<SheetFound> {
  const lines: string[] = [];
  const problems: string[] = [];
  const pressed = afterPress ?? lightLine('after the press');
  lines.push(pressed.line, `  its card: ${wornOpened ? 'opened' : 'not opened'}`);
  if (!pressed.lit) problems.push('litTouch: the light went out as the finger lifted');
  if (wornOpened) problems.push('litTouch: a long press on the worn weapon opened its card');
  if (!pressed.lit) return { lines, problems };
  const lit = document.querySelector<HTMLElement>(`#stash .sitem.match[data-slot="${PRESSED}"]`)!;
  await tap(lab, middleOf(lit));
  const sheet = document.getElementById('item-sheet')!;
  const opened = !sheet.classList.contains('hidden');
  lines.push(`  a lit item tapped: ${opened ? 'its sheet opened' : 'no sheet'}`);
  if (!opened) problems.push('litTouch: a lit item tapped opened no sheet');
  const close = sheet.querySelector<HTMLElement>('.is-close');
  if (opened && close) await tap(lab, middleOf(close));
  const closed = lightLine('its sheet closed');
  lines.push(closed.line);
  if (!closed.lit) problems.push('litTouch: the light went out as a lit item\'s sheet was used');
  const empty = document.querySelector<HTMLElement>('#stash .sitem:not([data-slot])');
  if (!empty) throw new Error('lab: ui: no empty stash cell to tap');
  await tap(lab, middleOf(empty));
  await realWait(HELD_MS);
  const after = lightLine('a tap elsewhere');
  lines.push(after.line);
  if (litCount(PRESSED).lit > 0) problems.push('litTouch: the light stayed after a tap elsewhere');
  const stashed = document.querySelector<HTMLElement>(`#stash .sitem[data-slot="${PRESSED}"]`)!;
  const stashOpened = await pressLong(lab, stashed, false, 'a stash weapon pressed long');
  const stashLit = lightLine('a stash weapon pressed long');
  lines.push(stashLit.line, `  its card: ${stashOpened ? 'opened' : 'not opened'}`);
  if (!stashLit.lit) problems.push('litTouch: a long press on a stash weapon lit nothing');
  if (stashOpened) problems.push('litTouch: a long press on a stash weapon opened its card');
  return { lines, problems };
}

/** The hero's own gear back, the rail turned back, mouse mode again. */
export async function closeLitTouch(lab: Lab): Promise<void> {
  afterPress = null;
  await restore(lab);
}
