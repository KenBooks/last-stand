// Item & skill tooltips. Item tooltips can show a side-by-side comparison
// with the item currently equipped in the same slot.
import { SLOT_INFO, STATS } from '../data/items';
import { rarityOf, formatStat, itemPower, statEntries, implicitsFor, isTwoHanded, fitsOffhand } from '../loot/items';
import { G } from '../state';
import { BLOCK } from '../data/balance';
import { SCHOOLS, schoolCss } from '../data/schools';
import { input } from '../core/input';
import { itemIconSVG } from './itemIcons';
import { skillDamageHTML, skillHealHTML, skillWardHTML } from './skillDamage';
import type { ClassDef, Item, SkillDef, StatKey } from '../types';

/** Tooltip content: HTML, accent color and optional footer hint. */
export interface TooltipContent { html: string; color: string; foot?: string }

const el = (): HTMLElement => document.getElementById('tooltip')!;

/** The tooltip's size as laid out for what it shows and the window (comparison cards side by side, or stacked when
 *  that is too wide), measured when it's shown or the window's size changes, so a move only places it: laid out on
 *  every move, stacked cards were taken apart and stacked again each time, two layouts of them (tools/stalls
 *  `--scenario sweep`: 10 to 16 ms of the browser's work after each move). null: to be measured. */
let laidOut: { width: number; height: number; w: number; h: number } | null = null;

function sizeOf(t: HTMLElement): { w: number; h: number } {
  const width = window.innerWidth, height = window.innerHeight;
  if (laidOut && laidOut.width === width && laidOut.height === height) return laidOut;
  const cards = t.querySelector<HTMLElement>('.tt-cards');
  if (cards) {
    cards.classList.remove('stack');
    if (t.offsetWidth > width - 16) cards.classList.add('stack');
  }
  laidOut = { width, height, w: t.offsetWidth, h: t.offsetHeight };
  return laidOut;
}

// Keep the tooltip fully on screen: flip left/up when needed, stack comparison
// cards vertically when side-by-side is too wide, and clamp as a last resort.
// Moved by its transform alone, on a layer of its own (_tooltip.scss): placed by
// left/top, each move laid it out and painted it again, with what lay under it.
function place(e: MouseEvent): void {
  const t = el();
  const maxW = window.innerWidth - 16, maxH = window.innerHeight - 16;
  const { w, h } = sizeOf(t);
  let x = e.clientX + 18, y = e.clientY + 14;
  if (x + w > maxW + 8) x = e.clientX - w - 18;
  if (y + h > maxH + 8) y = e.clientY - h - 14;
  x = Math.max(8, Math.min(x, maxW + 8 - w));
  y = Math.max(8, Math.min(y, maxH + 8 - h));
  // (on the screen's pixels, its text crisp: a css px is 1.25 of them at 125%)
  const px = (v: number): number => Math.round(v * devicePixelRatio) / devicePixelRatio;
  t.style.transform = `translate(${px(x)}px, ${px(y)}px)`;
}

const round = (k: StatKey, v: number): number => { const f = 10 ** (STATS[k].dec || 0); return Math.round(v * f) / f; };

function deltaHTML(k: StatKey, d: number): string {
  if (Math.abs(d) < 0.05) return '';
  const cls = d > 0 ? 'up' : 'down';
  return ` <span class="tt-delta ${cls}">(${d > 0 ? '+' : '−'}${round(k, Math.abs(d))})</span>`;
}

/** One item card. `other` (optional) = item to diff against (shows per-stat deltas). `cls`: the
 *  class it belongs to (the hero's by default; the save slots screen shows every class's gear). */
function card(item: Item, { header = '', other = null as Item | null, showDelta = false, cls = G.player.cls } = {}): string {
  const r = rarityOf(item.rarity);
  const implicit = new Set(implicitsFor(item.slot, cls).map(([k]) => k));
  let html = `<div class="tt-card" style="--c:${r.color}">`;
  if (header) html += `<div class="tt-header">${header}</div>`;
  html += `<div class="tt-head"><div class="tt-icon" style="--c:${r.color}">${itemIconSVG(item)}</div><div class="tt-name" style="color:${r.color}">${item.name}</div></div>`;
  const pw = itemPower(item), opw = other ? itemPower(other) : 0;
  const pdelta = showDelta && other && pw !== opw ? `<span class="tt-delta ${pw > opw ? 'up' : 'down'}">${pw > opw ? '▲' : '▼'} ${Math.abs(pw - opw)}</span>` : '';
  html += `<div class="tt-type">${r.name} ${isTwoHanded(item, cls) ? 'Two-handed ' : fitsOffhand(item, cls) ? 'One-handed ' : ''}${SLOT_INFO[item.slot].label} · Item level ${item.ilvl} · Power ${pw}${pdelta ? ' ' + pdelta : ''}</div>`;
  if (item.school) html += `<div class="tt-stat implicit" style="color:${schoolCss(item.school)}">School of ${SCHOOLS[item.school].name}</div>`;
  for (const [k, v] of statEntries(item.stats)) {
    const d = showDelta ? v - (other?.stats[k] || 0) : 0;
    html += `<div class="tt-stat ${implicit.has(k) ? 'implicit' : ''}">${formatStat(k, v)}${showDelta ? deltaHTML(k, d) : ''}</div>`;
  }
  // stats the other item has that this one lacks
  if (showDelta && other) {
    for (const [k, v] of statEntries(other.stats)) {
      if (k in item.stats) continue;
      html += `<div class="tt-stat lost"><s>${formatStat(k, v)}</s> <span class="tt-delta down">(−${round(k, v)})</span></div>`;
    }
  }
  return html + blockNote(item, cls) + '</div>';
}

/** A shield spells out how its block works (Player.tryBlock), with its own numbers. */
function blockNote(item: Item, cls: ClassDef): string {
  const chance = item.stats.block ?? 0, amount = Math.round(item.stats.blockAmount ?? 0);
  if (amount <= 0) return '';
  const raise = cls.skills.find((s) => s.block);
  let t = `Lowered, the shield has a ${Math.round(chance)}% chance to stop ${amount} damage of a hit, then needs ${BLOCK.recovery}s to recover.`;
  if (raise) {
    t += ` Held up with ${raise.name}, it stops ${Math.round(amount * raise.block!)} damage of every hit from the front.`
      + ` A bigger hit breaks the guard: ${BLOCK.guardBreak}s of stagger, when you can only move.`;
  }
  return `<div class="tt-foot tt-block">${t}</div>`;
}

/** equipped: undefined = no comparison, null = empty slot, Item = compare against it. */
export function itemTooltipHTML(item: Item, equipped?: Item | null, cls?: ClassDef): TooltipContent {
  const r = rarityOf(item.rarity);
  // equipped === undefined: no comparison; null: slot is empty; item: compare against it
  if (equipped === undefined) return { html: card(item, { cls }), color: r.color };
  let html = '<div class="tt-cards">';
  html += card(item, { other: equipped, showDelta: true });
  if (equipped) {
    html += card(equipped, { header: 'Currently equipped' });
  } else {
    html += `<div class="tt-card empty"><div class="tt-header">Currently equipped</div><div class="tt-type">Nothing in the ${SLOT_INFO[item.slot].label} slot — this is a pure upgrade.</div></div>`;
  }
  html += '</div>';
  return { html, color: r.color };
}

function show(c: TooltipContent, at: { clientX: number; clientY: number }): void {
  const t = el();
  t.innerHTML = c.html + (c.foot ? `<div class="tt-footbar">${c.foot}</div>` : '');
  t.classList.remove('hidden');
  laidOut = null;
  place(at as MouseEvent);
}

// With a mouse the tooltip follows hovering. With touch (where the browser's emulated mouse events
// are ignored) a tap opens it pinned beside the element, and the next tap anywhere closes it.
let pinned = false;
document.addEventListener('pointerdown', (e) => {
  if (pinned && !el().contains(e.target as Node)) hideTooltip();
}, true);

export function bindTooltip(node: HTMLElement, getContent: () => TooltipContent | null): void {
  node.addEventListener('mouseenter', (e) => {
    if (input.touchMode) return;
    const c = getContent();
    if (c) show(c, e);
  });
  node.addEventListener('mousemove', (e) => { if (!input.touchMode && !pinned) place(e); });
  node.addEventListener('mouseleave', () => { if (!input.touchMode) hideTooltip(); });
  node.addEventListener('click', () => {
    if (!input.touchMode) return;
    const c = getContent();
    if (!c) return;
    const r = node.getBoundingClientRect();
    show(c, { clientX: r.right - 6, clientY: r.top });
    pinned = true;
    el().classList.add('pinned');
  });
}

/** Shows `c` at a point of the page (for what isn't an element: a label over the world), pinned there with `pin` (touch),
 *  else following the mouse as `moveTooltip` moves it. */
export function showTooltipAt(c: TooltipContent, at: { clientX: number; clientY: number }, pin = false): void {
  show(c, at);
  pinned = pin;
  el().classList.toggle('pinned', pin);
}

/** Moves a following tooltip to the mouse. */
export function moveTooltip(at: { clientX: number; clientY: number }): void {
  if (!pinned) place(at as MouseEvent);
}

export function hideTooltip(): void {
  el().classList.add('hidden');
  el().classList.remove('pinned');
  pinned = false;
}

export function itemTooltip(item: Item, withCompare = true): () => TooltipContent {
  return () => {
    const eq = G.profile.equipped[item.slot];
    // no comparison against itself
    const cmp = withCompare && eq?.id !== item.id ? (eq ?? null) : undefined;
    return itemTooltipHTML(item, cmp);
  };
}

/** A skill's tooltip: with `ofHero`, as the hero has it now (his weapons' way of it, the damage his modifiers make
 *  it: `skillDamage.ts`), else its base figures (another save's skill, whose gear isn't his). */
export function skillTooltip(raw: SkillDef, ofHero = true): () => TooltipContent {
  return () => {
    const hero = ofHero ? G.player : null;
    const def = hero?.known.get(raw.impl)?.def ?? raw;
    const stats = hero?.stats ?? null;
    let html = `<div class="tt-card" style="--c:${def.icon.color}"><div class="tt-name" style="color:${def.icon.color}">${def.name}</div>`;
    html += `<div class="tt-type">${def.tags.join(' · ')}</div>`;
    html += `<div class="tt-desc">${def.desc}</div>`;
    html += skillDamageHTML(def, stats) + skillHealHTML(def, stats) + skillWardHTML(def, stats);
    const bits = [];
    if (def.cost) bits.push(def.channel ? `${def.cost} Energy / sec` : `${def.cost} Energy`);
    if (def.gain) bits.push(`+${def.gain} Energy per hit`);
    // (a drawn shot's castTime is what follows its release: its charge is the draw)
    if (def.draw) bits.push(`${def.draw}s to full draw`);
    else if (def.castTime >= 1) bits.push(`${def.castTime}s to charge`);
    if (def.cooldown) bits.push(`${def.cooldown}s cooldown`);
    html += `<div class="tt-foot">${bits.join(' · ')}</div>`;
    if (def.both) html += `<div class="tt-foot">With no staff, put it on two keys: either casts it from one hand, both together from both hands, for ${def.both.cost} Energy / sec.</div>`;
    const alt = (id?: string) => (id ? G.player.known.get(id)?.def.name : undefined);
    if (def.needs === 'shield') {
      const two = alt(def.fallback?.twoHanded), dual = alt(def.fallback?.dual), one = alt(def.fallback?.oneHanded);
      const alts = [two && `${two} with a two-handed weapon`, dual && `${dual} with a weapon in each hand`, one && `${one} with a one-handed weapon`].filter(Boolean);
      html += `<div class="tt-foot">Needs a shield.${alts.length ? ` Without one this key uses ${alts.join(', or ')}.` : ''}</div>`;
    } else if (def.needs === 'dual') {
      html += `<div class="tt-foot">Needs a weapon in each hand.</div>`;
    } else if (def.needs === 'twoHanded') {
      const sh = alt(def.fallback?.shield), one = alt(def.fallback?.oneHanded);
      const alts = [sh && `${sh} with a shield`, one && `${one} with a one-handed weapon`].filter(Boolean);
      html += `<div class="tt-foot">Needs a two-handed weapon.${alts.length ? ` Without one this key uses ${alts.join(', or ')}.` : ''}</div>`;
    }
    html += '</div>';
    return { html, color: def.icon.color };
  };
}
