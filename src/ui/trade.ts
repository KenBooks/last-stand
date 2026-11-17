// The trade window between two players of a room (the trade itself is net/trade.ts): each side's offer and our stash
// to fill ours from, every item with its tooltip (a tap pins it on touch, a second tap acts), both accepts, Accept and
// Cancel. Over it, at the top of the screen, the ask (asked to trade: Trade or Decline; asking: Cancel) and the last
// word of a trade (done, or off and why). Asked for from the room's list in Play together (ui/coop.ts).
import { G } from '../state';
import { RUN, TRADE } from '../data/balance';
import { byValue, rarityOf } from '../loot/items';
import { offerProblem, tradeLocked, usableBy } from '../loot/trade';
import {
  answerTrade, cancelTrade, onTradeChange, setAccept, toggleOffer, tradeNote, tradeView, type TradeView,
} from '../net/trade';
import { bindTooltip, hideTooltip, itemTooltip, itemTooltipHTML, type TooltipContent } from './tooltip';
import { itemIconSVG } from './itemIcons';
import { isTouch } from './touch';
import { nameOf } from './coop';
import { sfx } from '../core/audio';
import type { Item } from '../types';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** how long the last word of a trade stays at the top of the screen (s) */
const NOTE_SHOWN = 5;

/** Whether the trade window is up. */
export const tradeOpen = (): boolean => !$('#trade').classList.contains('hidden');

export function initTrade(): void {
  onTradeChange(renderTrade);
  $('#trade-accept').onclick = () => {
    const v = tradeView();
    if (!v) return;
    sfx.click();
    setAccept(!v.accepted);
  };
  $('#trade-cancel').onclick = () => { sfx.click(); cancelTrade(); };
  $('#trade-ask-yes').onclick = () => { sfx.click(); answerTrade(true); };
  $('#trade-ask-no').onclick = () => {
    sfx.click();
    const v = tradeView();
    if (v?.phase === 'asked') answerTrade(false);
    else cancelTrade();
  };
}

/** Every frame: the last word of a trade goes after a while. */
export function updateTradeUi(): void {
  const n = tradeNote();
  const shown = !!n && performance.now() / 1000 - n.at < NOTE_SHOWN && !tradeView();
  const el = $('#trade-note');
  if (el.classList.contains('hidden') === shown) el.classList.toggle('hidden', !shown);
}

/** Draws the trade as it stands: the window, the ask, the last word. */
function renderTrade(): void {
  const v = tradeView();
  renderAsk(v);
  const open = v?.phase === 'open';
  const box = $('#trade');
  if (!open) {
    if (!box.classList.contains('hidden')) hideTooltip();
    box.classList.add('hidden');
  } else {
    box.classList.remove('hidden');
    renderWindow(v);
  }
  const n = tradeNote();
  const note = $('#trade-note');
  note.textContent = n?.text ?? '';
  note.classList.toggle('done', !!n?.done);
  updateTradeUi();
}

/** The prompt at the top: asked (Trade or Decline) or asking (Cancel). */
function renderAsk(v: TradeView | null): void {
  const ask = $('#trade-ask');
  const asking = v?.phase === 'asking', asked = v?.phase === 'asked';
  ask.classList.toggle('hidden', !asking && !asked);
  if (!asking && !asked) return;
  const name = v.partner ? esc(nameOf(v.partner)) : 'A partner';
  const cls = v.partner ? ` <span class="tr-cls">(${esc(v.partner.cls.name)})</span>` : '';
  $('#trade-ask-text').innerHTML = asked ? `<b>${name}</b>${cls} asks to trade gear with you` : `Asking <b>${name}</b> to trade…`;
  $('#trade-ask-yes').classList.toggle('hidden', !asked);
  $('#trade-ask-no').textContent = asked ? 'Decline' : 'Cancel';
}

/** The window: both offers, our stash, the accepts and why Accept can't be pressed. */
function renderWindow(v: TradeView): void {
  const partner = v.partner ? nameOf(v.partner) : 'Partner';
  const partnerClass = v.partner?.cls.id ?? null;
  $('#trade-title').textContent = `Trade with ${partner}`;
  $('#trade-their-h').textContent = `${partner}'s offer`;
  $('#trade-mine-count').textContent = `${v.mine.length}/${TRADE.most}`;
  $('#trade-their-count').textContent = `${v.theirs.length}/${TRADE.most}`;
  fill($('#trade-mine'), v.mine.map((it) => cell(it, {
    tip: itemTooltip(it), verb: 'Take it out of your offer', pick: () => toggleOffer(it.id),
  })), TRADE.most);
  fill($('#trade-theirs'), v.theirs.map((it) => {
    const mine = usableBy(it, G.profile.classId);
    return cell(it, {
      tip: mine ? itemTooltip(it) : () => itemTooltipHTML(it),
      foot: mine ? `Offered by ${esc(partner)}` : `A ${esc(G.player.cls.name)} can't use it`, dim: !mine,
    });
  }), TRADE.most);
  // our stash, best first, less what's in the offer
  const inOffer = new Set(v.mine.map((it) => it.id));
  const full = v.mine.length >= TRADE.most;
  const stash = G.profile.stash.filter((it) => !inOffer.has(it.id)).sort(byValue).map((it) => {
    const why = tradeLocked.has(it.id) ? 'Held for the trade until the host has settled it'
      : offerProblem(it, partnerClass) ?? (full ? `An offer holds ${TRADE.most} items at most` : null);
    return cell(it, {
      tip: itemTooltip(it), foot: why ?? undefined, verb: `Offer it to ${esc(partner)}`, dim: !!why,
      pick: why ? undefined : () => toggleOffer(it.id),
    });
  });
  fill($('#trade-stash'), stash, 0);
  $('#trade-stash-count').textContent = `${G.profile.stash.length}/${RUN.bagLimit}`;
  $('#trade-mine-ok').classList.toggle('on', v.accepted);
  $('#trade-their-ok').classList.toggle('on', v.theirAccept);
  $('#trade-mine-ok').textContent = v.accepted ? '✓ You accept' : 'You have not accepted';
  $('#trade-their-ok').textContent = v.theirAccept ? `✓ ${partner} accepts` : `${partner} has not accepted`;
  const accept = $<HTMLButtonElement>('#trade-accept');
  accept.textContent = v.accepted ? 'Withdraw accept' : 'Accept';
  accept.disabled = !v.accepted && !!v.problem;
  accept.classList.toggle('primary', !v.accepted);
  $('#trade-line').textContent = v.problem && !v.accepted ? v.problem
    : v.accepted && v.theirAccept ? 'Both accept: trading…'
    : v.accepted ? `Waiting for ${partner} to accept. A change to either offer takes both accepts back.`
    : 'Put in what you give, then Accept. A change to either offer takes both accepts back.';
}

/** what the button in a pinned tooltip does (touch: the item tapped last's pick) */
let tipAct: (() => void) | null = null;

/** The pinned tooltip's button pressed (touch): the item it was pinned for picked. */
document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest?.('#trade-tip-act') || !tipAct) return;
  const pick = tipAct;
  tipAct = null;
  hideTooltip();
  sfx.click();
  pick();
});

/** What picking an item does, said in its tooltip's foot: with a mouse, a click on it; on touch, a button in the
 *  tooltip a tap pinned (a tap acting at once left its tooltip pinned over the window's buttons). */
const actFoot = (verb: string): string =>
  (isTouch() ? `<button class="btn primary tt-act" id="trade-tip-act">${verb}</button>` : `Click to ${verb.toLowerCase()}`);

/** An item's square: its icon in its rarity's colour, its tooltip (its foot: why it can't be picked, or how it is),
 *  and what picking it does (none: nothing). */
function cell(it: Item, o: { tip: () => TooltipContent; foot?: string; verb?: string; pick?: () => void; dim?: boolean }): HTMLElement {
  const d = document.createElement('div');
  const color = rarityOf(it.rarity).color;
  d.className = 'sitem tr-item' + (o.dim ? ' dim' : '');
  d.style.setProperty('--c', color);
  d.style.color = color;
  d.dataset.id = it.id;
  d.innerHTML = itemIconSVG(it);
  bindTooltip(d, () => ({ ...o.tip(), foot: o.foot ?? (o.pick && o.verb ? actFoot(o.verb) : undefined) }));
  d.onclick = () => {
    // (touch: the tap pinned its tooltip, bindTooltip's, with the button that picks it)
    if (isTouch()) { tipAct = o.pick ?? null; return; }
    if (!o.pick) return;
    hideTooltip();
    sfx.click();
    o.pick();
  };
  return d;
}

/** `el` filled with `cells`, and empty squares after them up to `slots`. */
function fill(el: HTMLElement, cells: HTMLElement[], slots: number): void {
  el.replaceChildren(...cells);
  for (let i = cells.length; i < slots; i++) {
    const d = document.createElement('div');
    d.className = 'sitem tr-empty';
    el.appendChild(d);
  }
}
