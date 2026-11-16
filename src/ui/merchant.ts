// Odo's trade (`#merchant`, opened at his counter in his shop: game/rooms.ts, world/shop.ts): his wares in full, as any
// shop shows them, and the hero's stash; one of his pieces picked, then what's given for it, the worth of what's given
// against what he asks as a filled bar ("18 of 20"), and Trade once it's enough. What's given goes to him for good
// (said on the screen); gear thrown on the lobby's floor is another thing. Every piece has its tooltip, by the mouse and
// by a tap on touch, which also picks it.
import { G } from '../state';
import { fewestFor, offer, price, runsToRestock, stockOf, takes, trade, worth } from '../loot/merchant';
import { rarityOf } from '../loot/items';
import { RUN } from '../data/balance';
import { sfx } from '../core/audio';
import { itemIconSVG } from './itemIcons';
import { bindTooltip, hideTooltip, itemTooltip } from './tooltip';
import { renderMenu } from './menus';
import type { Item } from '../types';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

/** the piece of his he's asked for, and what of the stash is given for it */
let wanted: string | null = null;
const given = new Set<string>();
/** told as the screen is put away by its own button (the village forgets what it opened) */
let closed: () => void = () => undefined;

/** A worth as shown: a whole number, or one decimal under ten. */
const shown = (v: number): string => (v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString());

/** The screen's buttons bound; `onClose` told when Leave puts it away. */
export function initMerchant(onClose: () => void): void {
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
    sfx.loot(Math.max(0, ['common', 'magic', 'rare', 'epic', 'legendary', 'ascendant'].indexOf(piece.rarity)));
    $('#merchant .mc-said').textContent = `${piece.name} is yours. Odo keeps what you gave.`;
    wanted = null;
    given.clear();
    renderMenu();
    render();
  };
}

/** Whether the trade screen is up. */
export const merchantOpen = (): boolean => !$('#merchant').classList.contains('hidden');

/** The trade screen shown (his stock restocked first if it's due), or put away. */
export function showMerchant(on: boolean): void {
  $('#merchant').classList.toggle('hidden', !on);
  hideTooltip();
  if (!on) return;
  wanted = null;
  given.clear();
  $('#merchant .mc-said').textContent = '';
  render();
}

/** A piece's tile: its icon in its rarity's colour, its name, and a line under it (its worth, or what he asks). */
function tile(item: Item, line: string, picked: boolean, onPick: () => void): HTMLElement {
  const b = document.createElement('button');
  b.className = 'mc-item' + (picked ? ' picked' : '');
  b.style.setProperty('--rc', rarityOf(item.rarity).color);
  b.dataset.id = item.id;
  b.innerHTML = `<span class="mc-icon">${itemIconSVG(item)}</span><span class="mc-name"></span><span class="mc-line"></span>`;
  $('.mc-name', b).textContent = item.name;
  $('.mc-line', b).textContent = line;
  b.addEventListener('click', () => { sfx.click(); onPick(); });
  bindTooltip(b, itemTooltip(item));
  return b;
}

/** The screen drawn for the trade as it stands. */
function render(): void {
  const p = G.profile, stock = stockOf(p);
  const left = runsToRestock(p);
  $('#merchant .mc-restock').textContent = `New wares in ${left} ${left === 1 ? 'run' : 'runs'}`;
  const wares = $('#merchant .mc-wares');
  wares.replaceChildren(...stock.map((it) => tile(it, `asks ${shown(price(it))}`, it.id === wanted, () => {
    wanted = wanted === it.id ? null : it.id;
    render();
  })));
  if (!stock.length) wares.textContent = 'Sold out: he restocks after your next runs.';
  if (wanted && !stock.some((it) => it.id === wanted)) wanted = null;
  // (his trade's pieces, the best first, so a few rares are at hand before many commons; none above epic)
  const stash = $('#merchant .mc-stash');
  const tradeable = p.stash.filter(takes).sort((a, b) => worth(b) - worth(a));
  stash.replaceChildren(...tradeable.map((it) => tile(it, `worth ${shown(worth(it))}`, given.has(it.id), () => {
    if (given.has(it.id)) given.delete(it.id); else given.add(it.id);
    render();
  })));
  if (!tradeable.length) stash.textContent = 'Nothing in your stash he takes: bank some gear first.';
  const kept = p.stash.length - tradeable.length;
  $('#merchant .mc-count').textContent = `${p.stash.length} / ${RUN.bagLimit}`
    + (kept ? ` · ${kept} legendary or better he won't take` : '');
  const piece = stock.find((it) => it.id === wanted);
  const bar = $('#merchant .mc-bar');
  const fill = $('#merchant .mc-fill');
  const says = $('#merchant .mc-sum');
  const go = $<HTMLButtonElement>('#merchant .mc-trade');
  $<HTMLButtonElement>('#merchant .mc-fill-best').disabled = !piece || !tradeable.length;
  if (!piece) {
    fill.style.width = '0%';
    bar.classList.remove('enough');
    says.textContent = 'Pick one of his wares, then what you give for it.';
    go.disabled = true;
    return;
  }
  const o = offer(p, piece, [...given]);
  fill.style.width = `${Math.min(100, (o.worth / o.price) * 100)}%`;
  bar.classList.toggle('enough', o.enough);
  const extra = o.worth - o.price;
  says.textContent = `You give ${shown(o.worth)} of ${shown(o.price)}`
    + (o.enough && extra >= 0.5 ? ` · he keeps the ${shown(extra)} over` : '');
  go.disabled = !o.enough;
}
