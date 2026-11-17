// The guide (#guide in index.html): every foe, boss and hero, and the tips, browsed by section and entry. Opened by
// G anywhere, the pause menu's Guide tab, and the notice board's How to play. Each page is made as it opens, from
// the game's data as it is then (ui/guide/foes.ts, heroes.ts, tips.ts): nothing in it is typed in by hand, so a
// tuning change shows at once. The foes' pictures are their own models drawn by `portraits.ts`.
import { CLASSES, CLASS_IDS } from '../../data/classes/index';
import { BIOMES, BIOME_IDS } from '../../data/biomes';
import { G } from '../../state';
import { sfx } from '../../core/audio';
import { foePage, foes, type Foe } from './foes';
import { heroPage, missingNotes } from './heroes';
import { TIPS_PAGES } from './tips';
import { hurryPortrait, portrait, portraitMade, queuePortraitsBehind, type Who } from './portraits';

export type GuideSection = 'foes' | 'bosses' | 'heroes' | 'tips';
const SECTIONS: { id: GuideSection; label: string }[] = [
  { id: 'foes', label: 'Foes' }, { id: 'bosses', label: 'Bosses' }, { id: 'heroes', label: 'Heroes' }, { id: 'tips', label: 'Tips' },
];

/** An entry of a section: its id, its name in the list (and the group it's listed under), a small picture, its page. */
interface Entry { id: string; label: string; group?: string; foe?: Who; glyph?: string; colour?: string; page: () => string }

/** where the guide was left, for the next opening (this visit or the next) */
const KEPT = 'last-stand.guide-page';

const $ = (sel: string): HTMLElement => document.querySelector<HTMLElement>(sel)!;
let section: GuideSection = 'foes';
let entry = '';
let bound = false;

function foeEntry(f: Foe): Entry {
  return { id: f.id, label: f.def.name, group: BIOMES[f.biome].title, foe: f.id, page: () => foePage(f) };
}

/** A section's entries, as the game's data has them now. */
function entries(of: GuideSection): Entry[] {
  if (of === 'foes' || of === 'bosses') {
    const { common, bosses } = foes();
    const list = of === 'foes' ? common : bosses;
    // (by biome, then by the wave each comes in)
    return list.sort((a, b) => BIOME_IDS.indexOf(a.biome) - BIOME_IDS.indexOf(b.biome) || a.from - b.from).map(foeEntry);
  }
  if (of === 'heroes') {
    // (the hero played first)
    const mine = G.player?.cls.id;
    const ids = [...CLASS_IDS].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : 0));
    return ids.map((id) => ({ id, label: CLASSES[id].name, foe: `hero:${id}` as Who, page: () => heroPage(CLASSES[id]) }));
  }
  return TIPS_PAGES.map((t) => ({ id: t.id, label: t.title, glyph: '✦', page: t.html }));
}

/** The list's picture of an entry: a foe's portrait, else its glyph. */
function badge(e: Entry): string {
  if (e.foe) {
    const url = portraitMade(e.foe);
    return `<img class="gd-mini" data-foe="${e.foe}" alt="" ${url ? `src="${url}"` : ''}>`;
  }
  return `<span class="gd-glyph" style="${e.colour ? `color:${e.colour}` : ''}">${e.glyph ?? ''}</span>`;
}

function renderNav(list: Entry[]): void {
  $('#guide .gd-sections').innerHTML = SECTIONS.map((s) =>
    `<button class="tab${s.id === section ? ' active' : ''}" data-gs="${s.id}" role="tab" aria-selected="${s.id === section}">${s.label}</button>`).join('');
  let html = '', group = '';
  for (const e of list) {
    if (e.group && e.group !== group) { group = e.group; html += `<div class="gd-group">${group}</div>`; }
    html += `<button class="gd-entry${e.id === entry ? ' active' : ''}" data-ge="${e.id}">${badge(e)}<span>${e.label}</span></button>`;
  }
  $('#guide .gd-entries').innerHTML = html;
}

/** Every foe picture laid in the guide filled in as it's made. */
function fillPortraits(): void {
  document.querySelectorAll<HTMLImageElement>('#guide img[data-foe]').forEach((img) => {
    if (img.getAttribute('src')) return;
    const id = img.dataset.foe as Who;
    void portrait(id).then((url) => {
      if (url) img.src = url;
      else img.classList.add('none');
    });
  });
}

function render(): void {
  const list = entries(section);
  if (!list.some((e) => e.id === entry)) entry = list[0]?.id ?? '';
  renderNav(list);
  const e = list.find((x) => x.id === entry);
  const page = $('#guide .gd-page');
  page.innerHTML = e ? e.page() : '';
  page.scrollTop = 0;
  if (e?.foe) hurryPortrait(e.foe);
  fillPortraits();
  try { localStorage.setItem(KEPT, JSON.stringify({ section, entry })); } catch { /* storage off: not kept */ }
}

function bind(): void {
  if (bound) return;
  bound = true;
  const box = $('#guide');
  box.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const s = t.closest<HTMLElement>('[data-gs]');
    if (s) { sfx.click(); section = s.dataset.gs as GuideSection; entry = ''; render(); return; }
    const e = t.closest<HTMLElement>('[data-ge]');
    if (e) {
      sfx.click(); entry = e.dataset.ge!; render();
      // (on a screen where the list stands over the page, the page is what the tap was for)
      $('#guide .gd-page').scrollIntoView({ block: 'nearest' });
      return;
    }
    if (t === box) closeGuide();
  });
  $('#btn-guide-close').onclick = () => { sfx.click(); closeGuide(); };
}

let onClose: (() => void) | null = null;

/** The guide opened, on `at` if given (a section, and an entry of it), else where it was left. `closed` runs as it's
 *  put away. */
export function openGuide(at?: { section: GuideSection; entry?: string }, closed?: () => void): void {
  bind();
  if (at) { section = at.section; entry = at.entry ?? ''; } else {
    try {
      const kept = JSON.parse(localStorage.getItem(KEPT) ?? 'null') as { section?: GuideSection; entry?: string } | null;
      if (kept?.section && SECTIONS.some((s) => s.id === kept.section)) { section = kept.section; entry = kept.entry ?? ''; }
    } catch { /* nothing kept */ }
  }
  onClose = closed ?? null;
  $('#guide').classList.remove('hidden');
  render();
  // (its pictures made behind the lobby if they aren't yet: ui/guide/portraits.ts; nothing is made here)
  queuePortraitsBehind();
  if (import.meta.env.DEV) warnMissing();
}

export const guideOpen = (): boolean => !$('#guide').classList.contains('hidden');

export function closeGuide(): void {
  if (!guideOpen()) return;
  $('#guide').classList.add('hidden');
  const fn = onClose;
  onClose = null;
  fn?.();
}

/** A dev build's warning of what the guide has no words for yet (a skill or a class with no note): its page shows it
 *  from its data alone till its note is written (data/guide.ts). */
let warned = false;
function warnMissing(): void {
  if (warned) return;
  warned = true;
  const missing = CLASS_IDS.flatMap((id) => missingNotes(CLASSES[id]));
  if (missing.length) console.warn(`guide: no notes in data/guide.ts for ${missing.join(', ')}`);
}
