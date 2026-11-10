// tools/lab ui `summary`: the run's summary as a bank shows it, a bag of every rarity revealed one by one (#403). Each
// item is revealed in its place, the most valuable first: the rarest tier (Ascendant) leads, then each rarity in turn
// down to Common, every chip in its rarity's colour and within the window. The best item's card is opened by its
// chip, as the mouse over it opens it, within the window; and pictured besides, the choice after a wave with the
// same bag, its counts by rarity (all a player sees of loot not yet banked).
// A canary: the revealed chips put in the order the bag was gained in, which must be found out of order.
import { RARITIES } from '../../../src/data/items';
import { G } from '../../../src/state';
import { makeItem, rarityIndex } from '../../../src/loot/items';
import { hideDecision, resetDecision, showDecision } from '../../../src/ui/hud';
import { hideSummary, showSummary } from '../../../src/ui/menus';
import { itemTooltip, showTooltipAt } from '../../../src/ui/tooltip';
import type { Item } from '../../../src/types';
import type { Lab, Pictured } from './lab';

/** What the check found: lines for its report, and its problems. */
export interface SummaryFound {
  lines: string[];
  problems: string[];
}

/** the item level the bag is rolled at */
const ILVL = 12;
/** the problem the canary must raise */
export const SUMMARY_CANARY = { name: 'out of order', what: 'the reveal in the order the bag was gained' };

/** A bag with an item of every rarity, gained worst first (the reveal must turn it round). */
function bagOfEveryRarity(): Item[] {
  return RARITIES.map((rarity) => makeItem({ rarity: rarity.id, ilvl: ILVL, cls: G.player.cls }));
}

/** Every animation `element` runs brought to its end. */
function finishAnimations(element: Element): void {
  for (const animation of element.getAnimations({ subtree: true })) animation.finish();
}

/** The summary of a banked run with a bag of every rarity, its reveal brought to its end, and the best item's card
 *  opened where the mouse over its chip opens it. */
export function openSummary(): void {
  const bag = bagOfEveryRarity();
  showSummary({ outcome: 'banked', wave: 12, score: 48_310, kills: 214, bag });
  finishAnimations(document.getElementById('summary')!);
  const best = revealed()[0];
  if (!best) return;
  const box = best.getBoundingClientRect();
  const item = bag.find((it) => it.name === best.textContent)!;
  showTooltipAt(itemTooltip(item)(), { clientX: box.left + box.width / 2, clientY: box.bottom });
}

export const closeSummary = hideSummary;

/** The summary's revealed chips, in the order they show. */
const revealed = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#summary .sm-items .chip.reveal')];

/** The chips checked in turn: each a rarity no better than the one before it, in its colour, within the window. */
function chipsChecked(chips: HTMLElement[]): SummaryFound {
  const lines: string[] = [];
  const problems: string[] = [];
  let before = Infinity;
  for (const chip of chips) {
    const id = chip.dataset.r as Item['rarity'] | undefined;
    const rank = id ? rarityIndex(id) : -1;
    const box = chip.getBoundingClientRect();
    lines.push(`  ${id ?? '?'}: "${chip.textContent}"`);
    if (rank < 0) problems.push(`summary: "${chip.textContent}" says no rarity`);
    if (rank > before) {
      problems.push(`summary: "${chip.textContent}" (${id}) revealed after a worse rarity: out of order`);
    }
    before = rank;
    const want = id ? RARITIES[rank].color : '';
    if (want && !sameColour(getComputedStyle(chip).color, want)) {
      problems.push(`summary: "${chip.textContent}" is not in ${id}'s colour (${want})`);
    }
    if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
      problems.push(`summary: "${chip.textContent}" reaches past the window`);
    }
  }
  return { lines, problems };
}

/** Whether a computed `rgb(...)` colour is the hex `want`. */
function sameColour(computed: string, want: string): boolean {
  const [r, g, b] = computed.match(/\d+/g)!.map(Number);
  const hex = parseInt(want.slice(1), 16);
  return r === (hex >> 16) && g === ((hex >> 8) & 255) && b === (hex & 255);
}

/** The best item's card: shown, in its rarity's colour, within the window. */
function bestCardChecked(): SummaryFound {
  const tip = document.getElementById('tooltip')!;
  const name = tip.querySelector<HTMLElement>('.tt-name');
  const box = tip.getBoundingClientRect();
  const rarest = RARITIES[RARITIES.length - 1];
  const shown = !tip.classList.contains('hidden') && !!name;
  const lines = [`  the best item's card: ${shown ? `"${name!.textContent}"` : 'not shown'}`];
  const problems: string[] = [];
  if (!shown) problems.push("summary: the best item's card never showed");
  else if (!sameColour(getComputedStyle(name!).color, rarest.color)) {
    problems.push(`summary: the best item's card is not in ${rarest.id}'s colour`);
  }
  if (shown && (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight)) {
    problems.push("summary: the best item's card reaches past the window");
  }
  return { lines, problems };
}

/** The choice after a wave with a bag of every rarity, its counts by rarity pictured, then put away. */
export async function summaryPictures(lab: Lab): Promise<Pictured[]> {
  if (!G.run) return [];
  // (the summary's backdrop blurs all under it)
  hideSummary();
  G.run.bag = bagOfEveryRarity();
  showDecision();
  finishAnimations(document.getElementById('decision')!);
  const counts = [...document.querySelectorAll<HTMLElement>('#decision .dc-bag .chip[data-r]')];
  const notes = counts.map((chip) => `${chip.dataset.r}: ${chip.textContent}`);
  const pictured = await lab.screen('summary-bag', notes, '#decision');
  hideDecision();
  resetDecision();
  G.run.bag = [];
  return [pictured];
}

/** The reveal checked; with the canary, again with its chips in the order the bag was gained, which must be found. */
export function summaryShown(canary: boolean): SummaryFound {
  const chips = revealed();
  const found = chipsChecked(chips);
  const lines = [`  revealed: ${chips.length} of ${RARITIES.length} items, best first`, ...found.lines];
  const card = bestCardChecked();
  lines.push(...card.lines);
  const problems = [...found.problems, ...card.problems];
  if (chips.length !== RARITIES.length) problems.push(`summary: ${chips.length} items revealed of ${RARITIES.length}`);
  if (chips[0]?.dataset.r !== RARITIES[RARITIES.length - 1].id) {
    problems.push(`summary: the reveal leads with ${chips[0]?.dataset.r ?? 'nothing'}, not the rarest tier`);
  }
  if (!canary) return { lines, problems };
  const planted = chipsChecked(chips.slice().reverse());
  return { lines, problems: [...problems, ...planted.problems] };
}
