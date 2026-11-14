// Lobby spell loadout editor: the key bar, and a spellbook row (every class spell) that opens
// over it only to remap: the chevron beside the bar, or a click on a key (which picks that key). Click a key then a
// skill (or tap, on touch) to bind; drag spellbook -> key to bind (duplicates allowed), key -> key to
// swap, key -> spellbook (or right-click) to clear. Saved via Player.bind (cookie), one loadout per
// weapon style for a class whose skills depend on the gear held.
import { G } from '../state';
import { SKILL_KEYS, usableFirst } from '../loot/loadout';
import { makeSkillSlot } from './hud';
import { hideTooltip } from './tooltip';
import { isTouch } from './touch';
import { sfx } from '../core/audio';
import type { SkillKey } from '../types';
import type { HeldStyle } from '../types';

const STYLE_NAME: Record<HeldStyle, string> = {
  shield: 'Weapon and shield', twoHanded: 'Two-handed weapon', dual: 'A weapon in each hand', oneHanded: 'One-handed weapon',
  arcane: 'Arcane staff', fire: 'Fire staff', lightning: 'Lightning staff', healing: 'Healing staff', bare: 'No staff',
};

type Payload = { kind: 'book'; id: string } | { kind: 'slot'; key: SkillKey };
let drag: Payload | null = null;
let onChange: () => void = () => {};
/** the key picked to receive the next skill clicked (or tapped) in the book */
let picked: SkillKey | null = null;
let open = false;

const book = () => document.getElementById('spellbook')!;
const bar = () => document.getElementById('loadout-bar')!;

export function initLoadoutEditor(changed: () => void): void {
  onChange = changed;
  document.getElementById('btn-lo-reset')!.onclick = () => { G.player.resetLoadout(); picked = null; hideTooltip(); sfx.click(); commit(); };
  document.getElementById('lo-toggle')!.onclick = () => { sfx.click(); openBook(!open); };
  // dropping a key onto the spellbook clears it
  const b = book();
  b.addEventListener('dragover', (e) => { if (drag?.kind === 'slot') { e.preventDefault(); b.classList.add('over'); } });
  b.addEventListener('dragleave', () => b.classList.remove('over'));
  b.addEventListener('drop', (e) => {
    e.preventDefault();
    if (drag?.kind === 'slot') { G.player.bind(drag.key, null); sfx.salvage(); }
    endDrag();
    commit();
  });
}

/** Open the skill book over the key bar, or close it (which drops a picked key). */
export function openBook(v: boolean): void {
  open = v;
  document.getElementById('loadout')!.classList.toggle('open', v);
  const t = document.getElementById('lo-toggle')!;
  t.setAttribute('aria-expanded', String(v));
  t.title = v ? 'Close the skill book' : 'Remap keys';
  t.setAttribute('aria-label', t.title);
  if (!v && picked) { picked = null; renderLoadoutEditor(); }
}

function startDrag(e: DragEvent, payload: Payload, el: HTMLElement): void {
  drag = payload;
  hideTooltip();
  e.dataTransfer!.effectAllowed = 'copyMove';
  e.dataTransfer!.setData('text/plain', payload.kind);
  el.classList.add('dragging');
  document.getElementById('loadout')!.classList.add('drag-' + payload.kind);
}

function endDrag(): void {
  drag = null;
  document.getElementById('loadout')!.classList.remove('drag-book', 'drag-slot');
  document.querySelectorAll('#loadout .over, #loadout .dragging').forEach((n) => n.classList.remove('over', 'dragging'));
}

function commit(): void {
  renderLoadoutEditor();
  onChange();
}

function dropOnKey(key: SkillKey): void {
  const p = G.player;
  if (!drag) return;
  if (drag.kind === 'book') p.bind(key, drag.id);
  else if (drag.key !== key) {
    // swap the two keys' spells
    const a = p.loadout[drag.key], b = p.loadout[key];
    p.bind(key, a);
    p.bind(drag.key, b);
  }
  sfx.click();
}

export function renderLoadoutEditor(): void {
  const p = G.player;
  // the bindings shown belong to the weapon style held (each style keeps its own)
  const style = p.weaponStyle;
  document.querySelector('#loadout .lo-style-name')!.textContent = style ? `${STYLE_NAME[style]} ·` : '';
  const b = book();
  b.innerHTML = '';
  for (const def of usableFirst([...p.known.values()].map((known) => known.def), p.gear)) {
    const el = makeSkillSlot(def);
    el.classList.toggle('unusable', !p.usable(def));   // not with the gear held (see its tooltip)
    el.draggable = true;
    el.addEventListener('dragstart', (e) => startDrag(e, { kind: 'book', id: def.impl }, el));
    el.addEventListener('dragend', endDrag);
    // a clicked (or tapped) skill goes onto the picked key (with no key picked, a tap shows its tooltip)
    el.addEventListener('click', () => {
      if (!picked) return;
      p.bind(picked, def.impl);
      picked = null;
      hideTooltip();
      sfx.click();
      commit();
    });
    b.appendChild(el);
  }

  const k = bar();
  k.innerHTML = '';
  for (const key of SKILL_KEYS) {
    const skill = p.skillAt(key);
    const el = makeSkillSlot(skill?.def ?? null, key);
    if (key === 'q') el.classList.add('sep');
    el.classList.toggle('picking', key === picked);
    // click a key to pick it (opening the book), again to let it go; touch has no right-click,
    // so a second tap clears it
    el.addEventListener('click', () => {
      hideTooltip();
      if (picked !== key) { picked = key; sfx.click(); openBook(true); }
      else if (isTouch()) { p.bind(key, null); picked = null; sfx.salvage(); }
      else { picked = null; sfx.click(); }
      commit();
    });
    if (skill) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => startDrag(e, { kind: 'slot', key }, el));
      el.addEventListener('dragend', endDrag);
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); p.bind(key, null); hideTooltip(); sfx.salvage(); commit(); });
    }
    el.addEventListener('dragover', (e) => { if (drag) { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); dropOnKey(key); endDrag(); commit(); });
    k.appendChild(el);
  }
}
