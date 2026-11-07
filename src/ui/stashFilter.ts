// Stash filter: the stats the player is hunting for (cog button on the stash title).
// Items with none of them are greyed out but stay usable, and sort last. Kept in localStorage, per
// class and save slot.
import { G } from '../state';
import { STATS, STAT_INCLUDES } from '../data/items';
import { CLASS_IDS } from '../data/classes/index';
import { byValue, itemPower } from '../loot/items';
import { saveKey } from '../loot/saveSlots';
import { ATTRIBUTE_GROUPS } from './attributes';
import { sfx } from '../core/audio';
import type { Item, StatKey } from '../types';

const KEY = (classId: string, slot?: number) => saveKey(`last-stand.stash-filter.${classId}.v1`, slot);
/** the filter from before classes had their own: the mage's (in slot 1) */
const LEGACY = 'last-stand.stash-filter.v1';
const LABEL = Object.fromEntries(ATTRIBUTE_GROUPS.flatMap(([, defs]) => defs.flatMap((d) => (d.stat ? [[d.stat, d.label]] : [])))) as Record<StatKey, string>;

/** the stats each general stat also counts toward (All damage: Arcane and Elemental damage) */
const FEEDS = new Map<StatKey, StatKey[]>();
for (const [k, gs] of Object.entries(STAT_INCLUDES) as [StatKey, StatKey[]][]) for (const g of gs) FEEDS.set(g, [...(FEEDS.get(g) ?? []), k]);

let active: StatKey[] = [];
/** the storage key of the filter loaded (the class's, in the save slot in use) */
let loadedFor = '';
let onChange: () => void = () => {};

function load(key: string): StatKey[] {
  try {
    let raw = localStorage.getItem(key);
    if (raw === null && key === KEY('mage', 1)) raw = localStorage.getItem(LEGACY);
    const v: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((k): k is StatKey => typeof k === 'string' && k in STATS) : [];
  } catch { return []; }
}

function save(): void {
  try {
    localStorage.setItem(loadedFor, JSON.stringify(active));
    if (loadedFor === KEY('mage', 1)) localStorage.removeItem(LEGACY);
  } catch { /* ignore */ }
}

/** Erase a save slot's filters (every class). */
export function eraseStashFilters(slot: number): void {
  try {
    for (const id of CLASS_IDS) localStorage.removeItem(KEY(id, slot));
    if (slot === 1) localStorage.removeItem(LEGACY);
  } catch { /* storage unavailable */ }
  loadedFor = '';   // read again at the next use
}

/** The item's value for a filtered stat, counting the general stats that feed it. */
const valueFor = (it: Item, k: StatKey): number =>
  (it.stats[k] ?? 0) + (STAT_INCLUDES[k] ?? []).reduce((s, g) => s + (it.stats[g] ?? 0), 0);

/** The current class's filter (switching class or save slot in the lobby swaps it). */
function sync(): void {
  const key = KEY(G.player.cls.id);
  if (key !== loadedFor) { loadedFor = key; active = load(key); }
}

/** True when there is no filter or the item has one of the chosen stats. */
export const matchesFilter = (it: Item): boolean => (sync(), !active.length) || active.some((k) => valueFor(it, k) > 0);

/** Stash order: matches first (by the stat with one filter, by power with several), then the
 *  rest; best first otherwise (the sort is stable, so ties keep that order). */
export function sortStash(items: Item[]): Item[] {
  sync();
  const sorted = items.slice().sort(byValue);
  if (!active.length) return sorted;
  const score = active.length === 1 ? (it: Item) => valueFor(it, active[0]) : itemPower;
  const hits = sorted.filter(matchesFilter).sort((a, b) => score(b) - score(a));
  return hits.concat(sorted.filter((it) => !matchesFilter(it)));
}

function set(next: StatKey[]): void {
  active = next;
  save();
  sfx.click();
  onChange();
}

const toggle = (k: StatKey) => set(active.includes(k) ? active.filter((a) => a !== k) : [...active, k]);

export function openStashFilter(open: boolean): void {
  document.getElementById('stash-filter')!.classList.toggle('hidden', !open);
  document.getElementById('stash-filter-btn')!.setAttribute('aria-expanded', String(open));
}

/** the chips' row's width as last laid out (px; 0 till it's been shown), kept by an observer: read off the row as
 *  the chips were rendered, it laid the page out in the middle of the lobby's render, 17.5 ms of the click that
 *  chose a first visit's hero (its width is the stash title's room, whatever chips it holds) */
let chipsWidth = 0;

export function initStashFilter(changed: () => void): void {
  onChange = changed;
  new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width;
    if (width <= 0 || width === chipsWidth) return;
    chipsWidth = width;
    // (as many chips as the new width fits, in the next frame: changed in the notification's own, a loop)
    if (active.length) requestAnimationFrame(renderStashFilter);
  }).observe(document.getElementById('stash-chips')!);
  const panel = document.getElementById('stash-filter')!;
  const btn = document.getElementById('stash-filter-btn')!;
  btn.onclick = () => { sfx.click(); openStashFilter(panel.classList.contains('hidden')); };
  // a click anywhere else closes the panel
  document.addEventListener('pointerdown', (e) => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target as Node) && !btn.contains(e.target as Node)) openStashFilter(false);
  });
  panel.innerHTML = `<div class="sf-top"><span>Show items with</span><button class="link sf-clear">Clear</button></div>`
    + ATTRIBUTE_GROUPS.map(([grp, defs]) => `<div class="sf-grp">${grp}</div><div class="sf-opts">`
      + defs.map((d) => (d.stat ? `<button class="sf-opt" data-stat="${d.stat}" aria-pressed="false">${d.label}</button>` : '')).join('') + '</div>').join('')
    + `<div class="sf-note">Other items are greyed out. One stat sorts the stash by it, several by item power.</div>`;
  panel.querySelector<HTMLElement>('.sf-clear')!.onclick = () => set([]);
  panel.querySelectorAll<HTMLElement>('.sf-opt').forEach((b) => { b.onclick = () => toggle(b.dataset.stat as StatKey); });
}

/** Chips for the chosen stats (click to remove) and the panel's pressed states. Past as many as
 *  fit the stash's title line (up to MAX_CHIPS) the rest fold into a "+N" chip that opens the panel:
 *  more rows of chips would push the stash down. */
const MAX_CHIPS = 3;

export function renderStashFilter(): void {
  sync();
  const chips = document.getElementById('stash-chips')!;
  chips.innerHTML = '';
  const fit = Math.min(MAX_CHIPS, Math.max(1, Math.floor(chipsWidth / 90)));
  const shown = active.length > fit ? active.slice(0, fit - 1) : active;
  for (const k of shown) {
    const c = document.createElement('button');
    c.className = 'sf-chip';
    c.title = `Stop filtering by ${LABEL[k]}`;
    c.innerHTML = `<span class="l">${LABEL[k]}</span><span class="x" aria-hidden="true">×</span>`;
    c.onclick = () => toggle(k);
    chips.appendChild(c);
  }
  if (shown.length < active.length) {
    const more = document.createElement('button');
    more.className = 'sf-chip more';
    more.title = active.slice(shown.length).map((k) => LABEL[k]).join(', ');
    more.textContent = `+${active.length - shown.length}`;
    more.onclick = () => { sfx.click(); openStashFilter(true); };
    chips.appendChild(more);
  }
  document.getElementById('stash-filter-btn')!.classList.toggle('on', active.length > 0);
  const panel = document.getElementById('stash-filter')!;
  const unused = G.player.cls.excludeStats ?? [];
  panel.querySelectorAll<HTMLElement>('.sf-opt').forEach((b) => {
    const k = b.dataset.stat as StatKey;
    b.setAttribute('aria-pressed', String(active.includes(k)));
    b.classList.toggle('hidden', unused.includes(k));
    // a general stat counts toward the ones it feeds (All damage: the class's damage types)
    const fed = FEEDS.get(k)?.filter((f) => !unused.includes(f)) ?? [];
    b.title = fed.length ? `Also counts toward ${fed.map((f) => LABEL[f]).join(' and ')}` : '';
  });
  panel.querySelector<HTMLElement>('.sf-clear')!.classList.toggle('hidden', !active.length);
}
