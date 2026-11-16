// `lab coop --scenarios trade`'s page side (node/coopTrade.mjs plays and judges it): each game's stash stocked with
// items named for the check, the trade asked for from Play together's list, answered, filled and accepted through
// the window's own controls (the browser's clicks, or taps with `by: 'tap'`), and the trade as this game shows it
// read back: its window, both offers, both accepts, its stash and its locks. The game's trade modules are looked up
// as they are (an older tree has none: `tradeNow` says so), so a command loading this module on such a tree runs on.
import { G } from '../../../src/state';
import { makeItem } from '../../../src/loot/items';
import { saveProfile } from '../../../src/loot/profile';
import { leaveRoom } from '../../../src/net/session';
import { openCoop } from '../../../src/ui/coop';
import type { Lab, Screen } from './lab';

type NetTrade = typeof import('../../../src/net/trade');
type LootTrade = typeof import('../../../src/loot/trade');
const netTrade = Object.values(import.meta.glob<NetTrade>('../../../src/net/trade.ts', { eager: true }))[0];
const lootTrade = Object.values(import.meta.glob<LootTrade>('../../../src/loot/trade.ts', { eager: true }))[0];

/** How a control is pressed: the mouse's click, or a finger's tap (an item's tap pins its tooltip too). */
type Press = 'click' | 'tap';

/** The trade as this game shows it. */
export interface TradeNow {
  /** whether the tree has trading at all */
  present: boolean;
  /** where the trade stands here (none: no trade) */
  phase: string | null;
  /** the window shown, the ask at the top shown and its words */
  window: boolean;
  ask: string | null;
  /** both offers' items by name, as the window shows them */
  mine: string[];
  theirs: string[];
  accepted: boolean;
  theirAccept: boolean;
  /** why its Accept can't be pressed (null: it can), and whether the button is off */
  problem: string | null;
  acceptOff: boolean;
  /** this game's own stash by name, sorted */
  stash: string[];
  /** the stash's items held for a trade */
  locked: number;
  /** the last word of a trade, and whether it was a trade done */
  note: string | null;
  done: boolean;
}

/** the words the check's items are named by: `<tag> <n>`, so each one is found by name on every game */
const NAMED = /^Lab (Host|Guest) \d+$/;

/** This game's stash stocked with `count` items named `Lab <tag> 1`... and `filler` more of every rarity (any it
 *  held left out: a stash as a player's looks, for the pictures, which the check's names leave out), saved. */
export function coopTradeStock(_lab: Lab, { tag, count, filler = 0 }: { tag: string; count: number; filler?: number }): string[] {
  const cls = G.player.cls;
  const named = (i: number) => ({ ...makeItem({ cls, rarity: 'rare', ilvl: 5 }), name: `Lab ${tag} ${i + 1}` });
  const items = Array.from({ length: count }, (_, i) => named(i));
  const rarities = ['common', 'magic', 'rare', 'epic', 'legendary', 'ascendant'] as const;
  const more = Array.from({ length: filler }, (_, i) => makeItem({ cls, rarity: rarities[i % rarities.length], ilvl: 5 + i }));
  G.profile.stash = [...items, ...more];
  saveProfile(G.profile);
  return items.map((it) => it.name);
}

/** This game's Play together opened, its room's list with each partner's Trade button. */
export function coopTradeList(): void {
  openCoop(true);
}

/** This game asks its partner to trade: Play together opened, its list's Trade button pressed. */
export async function coopTradeAsk(lab: Lab, { by = 'click' }: { by?: Press } = {}): Promise<void> {
  openCoop(true);
  const button = document.querySelector<HTMLButtonElement>('#coop .coop-trade:not([disabled])');
  if (!button) throw new Error('lab: no partner\'s Trade button in Play together\'s list');
  await press(lab, button, by);
}

/** This game answers the ask at the top of its screen. */
export async function coopTradeAnswer(lab: Lab, { yes, by = 'click' }: { yes: boolean; by?: Press }): Promise<void> {
  await press(lab, required(yes ? '#trade-ask-yes' : '#trade-ask-no'), by);
}

/** This game puts the items named in its offer (or takes them out), each from the window's stash or offer. */
export async function coopTradeOffer(lab: Lab, { names, by = 'click' }: { names: string[]; by?: Press }): Promise<void> {
  for (const name of names) {
    const item = G.profile.stash.find((it) => it.name === name);
    if (!item) throw new Error(`lab: no ${name} in this game's stash`);
    await press(lab, required(`#trade [data-id="${item.id}"]`), by);
    // (a finger's tap pins the item's tooltip, whose button picks it: ui/trade.ts)
    if (by === 'tap') await press(lab, required('#tooltip.pinned #trade-tip-act'), by);
  }
}

/** This game presses Accept (or takes its accept back, the same button). */
export async function coopTradeAccept(lab: Lab, { by = 'click' }: { by?: Press } = {}): Promise<void> {
  await press(lab, required('#trade-accept'), by);
}

/** This game's link goes as a closed tab's does: its last word (`pagehide`'s bye) and nothing after it. */
export function coopTradeDrop(): void {
  window.dispatchEvent(new Event('pagehide'));
  leaveRoom();
}

/** The canary: the guest's changes to its offer lost on their way to this game (the first offer still arrives). */
const canary = { on: false };
export function coopTradeLoseChanges(_lab: Lab, { on }: { on: boolean }): void { canary.on = on; }

/** Whether a message arriving here is one the canary loses: a trade offer after the first. */
export function tradeLost(packet: unknown): boolean {
  if (!canary.on) return false;
  const m = (packet as { ch?: string; data?: { t?: string; rev?: number } }).data;
  return (packet as { ch?: string }).ch === 'ctl' && m?.t === 'tro' && (m.rev ?? 0) >= 2;
}

/** The trade as this game shows it now. */
export function tradeNow(): TradeNow {
  const view = netTrade?.tradeView() ?? null;
  const note = netTrade?.tradeNote() ?? null;
  const shown = (selector: string) => !document.querySelector(selector)?.classList.contains('hidden');
  const askEl = document.querySelector('#trade-ask');
  return {
    present: !!netTrade,
    phase: view?.phase ?? null,
    window: !!document.querySelector('#trade') && shown('#trade'),
    ask: askEl && shown('#trade-ask') ? askEl.querySelector('#trade-ask-text')?.textContent ?? '' : null,
    mine: view?.mine.map((it) => it.name) ?? [],
    theirs: view?.theirs.map((it) => it.name) ?? [],
    accepted: view?.accepted ?? false,
    theirAccept: view?.theirAccept ?? false,
    problem: view?.problem ?? null,
    acceptOff: document.querySelector<HTMLButtonElement>('#trade-accept')?.disabled ?? false,
    stash: G.profile.stash.map((it) => it.name).filter((name) => NAMED.test(name)).sort(),
    locked: lootTrade?.tradeLocked.size ?? 0,
    note: note?.text ?? null,
    done: note?.done ?? false,
  };
}

/** The element `selector` names, or the step fails saying it's missing. */
function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`lab: no ${selector} on the page`);
  return element;
}

function middleOf(element: HTMLElement): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** `element` pressed as `by` says, by the browser's own input. */
async function press(lab: Lab, element: HTMLElement, by: Press): Promise<void> {
  if (by === 'tap') await lab.tap(middleOf(element));
  else await lab.clickOn(element);
}

/** the screens the window is fitted on: src/ui/AGENTS.md's (two desktops, a phone held sideways, a tablet each way),
 *  and the smallest phone held sideways the watching bar is fitted on */
export const TRADE_SCREENS: Screen[] = [
  { width: 1024, height: 700, ratio: 1 },
  { width: 1920, height: 1080, ratio: 1 },
  { width: 844, height: 390, ratio: 3 },
  { width: 751, height: 298, ratio: 3.75 },
  { width: 1180, height: 820, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
];
/** a finger's button is this tall at the least (css px), as the touch HUD's are held to */
const FINGER_PX = 28;

/** How the window fits a screen: a line saying where it stands, and its problems. */
export interface TradeFit { line: string; problems: string[] }

/** the screen the page was on before the window was fitted on others, to put it back on */
let ownScreen: Screen | null = null;

/** The trade window fitted on `TRADE_SCREENS[index]`, the page put on it (`coopTradeBack` puts it back): the box in
 *  the window, both offers whole in it, the stash's grid in it (it scrolls inside), its line and buttons in it, on
 *  touch each button a finger's height. */
export async function coopTradeFit(lab: Lab, { index }: { index: number }): Promise<TradeFit> {
  ownScreen ??= { width: innerWidth, height: innerHeight, ratio: devicePixelRatio };
  const screen = TRADE_SCREENS[index];
  await lab.showOn(screen);
  await lab.step(2);
  const name = `${screen.width}x${screen.height}@${screen.ratio}`;
  const box = required('#trade .modal-box').getBoundingClientRect();
  const touch = document.body.classList.contains('touch');
  const problems: string[] = [];
  const edges = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  if (!within(box, edges)) problems.push(`${name}: the trade window runs past the screen`);
  const parts: [string, string][] = [
    ['the title', '#trade-title'], ['your offer', '#trade-mine'], ['their offer', '#trade-theirs'],
    ['the stash', '#trade-stash'], ['the line', '#trade-line'], ['Accept', '#trade-accept'], ['Cancel', '#trade-cancel'],
  ];
  for (const [part, selector] of parts) {
    const at = required(selector).getBoundingClientRect();
    if (!within(at, box)) problems.push(`${name}: ${part} runs out of the trade window`);
  }
  for (const selector of ['#trade-accept', '#trade-cancel']) {
    const height = required(selector).getBoundingClientRect().height;
    if (touch && height < FINGER_PX) problems.push(`${name}: ${selector} is ${Math.round(height)} px tall on touch`);
  }
  const share = (value: number, of: number) => `${Math.round((value / of) * 100)}%`;
  const line = `${name}: ${Math.round(box.width)}x${Math.round(box.height)} px, ${share(box.height, innerHeight)} of`
    + ` the screen's height${touch ? ', touch' : ''}`;
  return { line, problems };
}

/** The page put back on the screen it was on before the window was fitted on others. */
export async function coopTradeBack(lab: Lab): Promise<void> {
  if (ownScreen) await lab.showOn(ownScreen);
  ownScreen = null;
}

/** How many screens the window is fitted on. */
export function coopTradeScreens(): number {
  return TRADE_SCREENS.length;
}

/** Whether `inner` lies inside `outer` (a pixel's rounding allowed). */
function within(inner: DOMRect, outer: { left: number; top: number; right: number; bottom: number }): boolean {
  const slack = 1;
  return inner.left >= outer.left - slack && inner.top >= outer.top - slack
    && inner.right <= outer.right + slack && inner.bottom <= outer.bottom + slack;
}
