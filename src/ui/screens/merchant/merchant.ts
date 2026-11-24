// Odo's trade (`#merchant`, opened at his counter in his shop: game/rooms.ts, world/houses/merchant.ts), in three steps (from
// play: "make it more intuitive to follow"): 1, choose one of his wares (its price shown on it); 2, offer gear from the
// stash for it (each piece's value in the same unit, the stash dimmed with a hint until a ware is chosen); 3, the deal:
// what you get beside what you give, its value against his price as a filled bar ("Value 18 of 20"), what's missing
// said in words, and Trade, which says why it's held off. What's given goes to him for good (said under Trade); gear
// thrown on the lobby's floor is another thing. Every piece has its tooltip, by the mouse and by a tap on touch, which
// also picks it.
import { closedFrom, villageObject } from '../../../game/village';
import { screen } from '../../screenKit';
import { G } from '../../../state';
import { fewestFor, offer, price, runsToRestock, stockOf, takes, trade, worth } from '../../../loot/merchant';
import { rarityIndex, rarityOf } from '../../../loot/items';
import { RUN } from '../../../data/balance';
import { sfx } from '../../../core/audio';
import { dialog } from '../../dialogs';
import { villageUse } from '../../../game/villageUses';
import { showVillageCard } from '../../villageCard';
import { openPanels } from '../../menus';
import { itemIconSVG } from '../../itemIcons';
import { odoNods, odoTrades } from '../../../entities/models/merchant';
import { bindTooltip, hideTooltip, itemTooltip, itemTooltipHTML } from '../../tooltip';
import { renderMenu } from '../../menus';
import type { Item } from '../../../types';
import { FolkFace } from '../../folkFace';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

/** the piece of his he's asked for, and what of the stash is given for it */
let wanted: string | null = null;
const given = new Set<string>();
/** told as the screen is put away by its own button (the village forgets what it opened) */
let closed: () => void = () => undefined;

/** A value as shown: to a tenth under a hundred (rounded to whole numbers, his 37.5 read as 38 beside "1.5 more value
 *  needed" under 36), whole past it. */
const shown = (v: number): string => (v >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString());

/** The screen's buttons bound; `onClose` told when Leave puts it away. */
function initMerchant(onClose: () => void): void {
  closed = onClose;
  $('#merchant .mc-close').onclick = () => { sfx.click(); showMerchant(false); closed(); };
  $('#merchant .mc-fill-best').onclick = () => {
    const piece = stockOf(G.profile).find((it) => it.id === wanted);
    if (!piece) return;
    sfx.click();
    given.clear();
    for (const id of fewestFor(G.profile, piece)) given.add(id);
    render();
    // (what it picked shown: the best pieces head the stash, which may be scrolled down past them)
    $('#merchant .mc-stash').scrollTop = 0;
  };
  $('#merchant .mc-trade').onclick = () => {
    if (!wanted) return;
    const piece = stockOf(G.profile).find((it) => it.id === wanted);
    if (!piece || !trade(G.profile, wanted, [...given])) return;
    sfx.loot(Math.max(0, rarityIndex(piece.rarity)));
    $('#merchant .mc-said').textContent = `${piece.name} is yours. Odo keeps what you gave.`;
    odoNods();
    wanted = null;
    given.clear();
    renderMenu();
    render();
  };
}

/** Whether the trade screen is up. */
export const merchantOpen = (): boolean => !$('#merchant').classList.contains('hidden');
dialog({ open: () => merchantOpen(), close: () => showMerchant(false) });
// (his counter used in his shop: game/villageUses.ts)
villageUse('merchant', {
  use() { showVillageCard(null); openPanels(null); showMerchant(true); },
  leave() { showMerchant(false); },
  shows: () => merchantOpen(),
});

/** The trade screen shown (his stock restocked first if it's due), or put away. */
/** his face in its oval (ui/folkFace.ts) */
let faceOf: FolkFace | null = null;
const face = (): FolkFace => (faceOf ??= new FolkFace($('#merchant .mc-face')));

export function showMerchant(on: boolean): void {
  $('#merchant').classList.toggle('hidden', !on);
  face().show(on ? 'odo' : null);
  // (Odo stays at his desk while it's open)
  odoTrades(on);
  hideTooltip();
  if (!on) return;
  wanted = null;
  given.clear();
  $('#merchant .mc-said').textContent = '';
  render();
}

/** A piece's tile: its icon in its rarity's colour, its name, and its value as a badge under it (`what`: "Price" on
 *  his wares, "Value" on the stash's: one unit, so the two read against each other). */
function tile(item: Item, what: string, value: number, picked: boolean, onPick: () => void): HTMLElement {
  const b = document.createElement('button');
  b.className = 'mc-item' + (picked ? ' picked' : '');
  b.style.setProperty('--rc', rarityOf(item.rarity).color);
  b.dataset.id = item.id;
  b.innerHTML = `<span class="mc-icon">${itemIconSVG(item)}</span><span class="mc-name"></span>`
    + '<span class="mc-line"><span class="mc-what"></span><b class="mc-value"></b></span>';
  $('.mc-name', b).textContent = item.name;
  $('.mc-what', b).textContent = what;
  $('.mc-value', b).textContent = shown(value);
  b.addEventListener('click', () => { sfx.click(); onPick(); });
  bindTooltip(b, itemTooltip(item));
  return b;
}

/** The screen drawn for the trade as it stands: the step to do next lit, the ones before it done. */
function render(): void {
  const p = G.profile, stock = stockOf(p);
  const left = runsToRestock(p);
  $('#merchant .mc-restock').textContent = `New wares in ${left} ${left === 1 ? 'run' : 'runs'}`;
  const wares = $('#merchant .mc-wares');
  wares.replaceChildren(...stock.map((it) => tile(it, 'Price', price(it), it.id === wanted, () => {
    wanted = wanted === it.id ? null : it.id;
    render();
  })));
  if (!stock.length) wares.textContent = 'Sold out: he restocks after your next runs.';
  if (wanted && !stock.some((it) => it.id === wanted)) wanted = null;
  const piece = stock.find((it) => it.id === wanted);
  // (his trade's pieces, the best first, so a few rares are at hand before many commons; none above epic)
  const stash = $('#merchant .mc-stash');
  const tradeable = p.stash.filter(takes).sort((a, b) => worth(b) - worth(a));
  stash.replaceChildren(...tradeable.map((it) => tile(it, 'Value', worth(it), given.has(it.id), () => {
    if (given.has(it.id)) given.delete(it.id); else given.add(it.id);
    render();
  })));
  if (!tradeable.length) stash.textContent = 'Nothing in your stash he takes: bank some gear first.';
  const kept = p.stash.length - tradeable.length;
  $('#merchant .mc-count').textContent = `${p.stash.length} / ${RUN.bagLimit}`
    + (kept ? ` · ${kept} legendary or better he won't take` : '');
  // (the stash waits for a ware to be chosen: dimmed, and says so)
  $('#merchant .mc-give').classList.toggle('waiting', !piece);
  $('#merchant .mc-hint').textContent = piece
    ? `Click gear to offer it for ${piece.name}: its value adds up toward his price.`
    : 'First choose one of his wares above.';
  $('#merchant .mc-got').innerHTML = piece ? itemTooltipHTML(piece).html : '<span class="mc-none">Nothing chosen yet</span>';
  const bar = $('#merchant .mc-bar');
  const fill = $('#merchant .mc-fill');
  const says = $('#merchant .mc-sum');
  const need = $('#merchant .mc-need');
  const go = $<HTMLButtonElement>('#merchant .mc-trade');
  $<HTMLButtonElement>('#merchant .mc-fill-best').disabled = !piece || !tradeable.length;
  $('#merchant .mc-given').textContent = given.size ? `(${given.size} ${given.size === 1 ? 'piece' : 'pieces'})` : '';
  const o = piece ? offer(p, piece, [...given]) : null;
  // (the step to do next, lit; the ones before it done)
  const step = !o ? 1 : !o.enough ? 2 : 3;
  for (const el of document.querySelectorAll<HTMLElement>('#merchant .mc-step')) {
    el.classList.toggle('now', Number(el.dataset.step) === step);
    el.classList.toggle('done', Number(el.dataset.step) < step);
  }
  if (!o) {
    fill.style.width = '0%';
    bar.classList.remove('enough');
    need.classList.remove('ok');
    says.textContent = 'Value 0 of his price';
    need.textContent = 'Choose one of his wares first.';
    go.disabled = true;
    go.title = 'Choose one of his wares first';
    return;
  }
  fill.style.width = `${Math.min(100, (o.worth / o.price) * 100)}%`;
  bar.classList.toggle('enough', o.enough);
  says.textContent = `Value ${shown(o.worth)} of ${shown(o.price)}`;
  const extra = o.worth - o.price;
  need.classList.toggle('ok', o.enough);
  need.textContent = !given.size ? 'Offer gear from your stash, or press Auto-fill cheapest.'
    : !o.enough ? `${shown(o.price - o.worth)} more value needed.`
      : extra >= 0.5 ? `Enough. He keeps the ${shown(extra)} over.` : 'Enough: ready to trade.';
  go.disabled = !o.enough;
  go.title = o.enough ? '' : 'Offer more gear: its value must reach his price';
}

// (a screen of its own, started by ui/screens.ts: Leave puts his counter's use away)
screen({ init: () => initMerchant(() => closedFrom(villageObject('shopCounter'))) });
