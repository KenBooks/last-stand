// The hero selection screen (#heroes): the hall of heroes behind it (game/hall.ts), the hero in focus's name, role,
// how he plays, his skills and his records in this save slot in a panel beside him (its other tabs his gear, to look
// at, and his attributes: the tab last chosen kept), and a choice that leads into the lobby. The save slot under the
// title opens the save slots, and a slot switched there opens the hall again on its heroes. A first visit opens on it (no hero chosen yet, nothing to go back to); the lobby's "Change hero" opens it again.
// The hero under the mouse is outlined, and a click or tap on the hero in focus chooses him. Picked by the arrows, the tabs, a click or tap on a hero, the scene dragged along the row, or the keys (left and right, A and D; Enter or
// Space chooses, Esc opens pause; 1, 2, 3 pick each hero); the name or number of the hero in focus, again, chooses him. The choice stands on the hero in focus, shown as the mouse comes over him (on touch,
// always). Every class's card is laid over the others in one cell, the one in focus shown, so
// the panel is the largest's size and nothing moves as the focus does.
import { G } from '../state';
import { VILLAGE } from '../core/beta';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { saveSlot } from '../loot/saveSlots';
import { wasPressed } from '../core/input';
import { sfx } from '../core/audio';
import { outline } from './overlay/outline';
import { openHall, closeHall, dragHall, dropHall, focusHall, frameHall, hallAlong, hallFocus, hallHeroes, hallOpen, hallShot } from '../game/hall';
import { makeSkillSlot } from './hud';
import { hideTooltip } from './tooltip';
import { renderAttributes } from './attributes';
import { renderHeroGear } from './heroGear';
import { openSaves } from './saves';
import { heroShare, onReadying } from '../game/warm';
import type { ClassDef, Profile } from '../types';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

export interface HeroSelectHooks {
  /** The hero of class `id` chosen, in the profile the hall shows him in (a class never played: its starter gear). */
  choose(id: string, profile: Profile): void;
  /** The screen closed, a hero chosen (after `choose`) or not (Back). */
  closed(): void;
}

let hooks: HeroSelectHooks;
/** opened on a first visit: no hero to go back to */
let first = false;
/** the view's shift that keeps the hero in focus in the screen's room beside the panel (css px), as last laid out */
let shift = { x: 0, y: 0 };
/** a press on the screen's backdrop: where it went down and the camera's place along the row then, whether it's
 *  dragging the scene, and how fast it last moved (css px a ms, eased) and when */
interface Press { x: number; y: number; along: number; dragging: boolean; v: number; lastX: number; lastT: number }
let press: Press | null = null;
/** where the choice stands on him, a share of his height from his feet (his thighs: his face and his skill clear) */
const CHOICE_UP = 0.3;
/** how far round a hero the mouse is over him, a share of his height: beside his middle (a staff held out, the
 *  ranger's quiver and bow), above his head and below his feet (from play: "it needs to highlight even if I did not
 *  exactly hover over the character... arrow quiver... or above his head"; "between mage staff and body" missed) */
const HOVER_SIDE = 0.4;
const HOVER_ABOVE = 0.15;
const HOVER_BELOW = 0.04;
/** the outline round the hero under the mouse: white, a little softer than Quarry Mark's red */
const LIT_COLOR = 0xffffff;
const LIT_STRENGTH = 0.85;
/** how far a press moves sideways to drag the scene (css px: short of it, a tap on a hero) */
const DRAG_START = 8;
/** how far a drag let go carries on, as the time its speed goes on for (ms): a flick lands a hero further; and how
 *  long it may have stood still before the lift for its speed to count */
const FLICK_MS = 220;
const FLICK_STILL_MS = 80;
/** the most a tap may land from a hero's middle on screen to pick him, as a share of the screen's width */
const TAP_REACH = 0.12;
/** the hero in focus's height on the screen as the hall frames him, a share of its height (game/hall.ts `SHOT`), and
 *  the most of the room above an upright screen's panel he may take */
const HERO_SHARE = 0.585;
const ROOM_FILL = 0.8;
/** the panel's pages, and where the one last chosen is kept (a player who keeps to the gear finds it there again) */
const PAGES = ['hero', 'gear', 'attrs'] as const;
type Page = (typeof PAGES)[number];
const PAGE_KEY = 'last-stand.hero-page';

export const heroSelectOpen = (): boolean => !$('#heroes').classList.contains('hidden');

export function initHeroSelect(h: HeroSelectHooks): void {
  hooks = h;
  $('.hs-cards').replaceChildren(...CLASS_IDS.map((id) => card(CLASSES[id])));
  // (each name with its number key in the rhombus under it, as the keys pick the heroes too: bare on touch)
  $('.hs-tabs').innerHTML = CLASS_IDS.map((id, i) =>
    `<button data-c="${id}" style="--cc:${CLASSES[id].accent}"><kbd class="hs-key">${i + 1}</kbd>${CLASSES[id].name}</button>`).join('');
  document.querySelectorAll<HTMLElement>('.hs-tabs button').forEach((b) => {
    b.onclick = () => { sfx.click(); pick(CLASS_IDS.indexOf(b.dataset.c!)); };
  });
  $('.hs-prev').onclick = () => { sfx.click(); step(-1); };
  $('.hs-next').onclick = () => { sfx.click(); step(1); };
  $('.hs-back').onclick = () => { sfx.click(); if (!first) closeHeroSelect(); };
  $('.hs-slot').onclick = () => { sfx.click(); openSaves(true); };
  document.querySelectorAll<HTMLElement>('.hs-pagetabs .tab').forEach((b) => {
    b.onclick = () => { sfx.click(); showPage(b.dataset.page as Page, true); };
  });
  // (the scene is dragged from the backdrop; the choice on the hero is a label the pointer goes through, so a press on
  // it is the backdrop's: a click there chooses him, a swipe drags)
  for (const el of [$('.hs-shade')]) {
    el.addEventListener('pointerdown', (e) => {
      if (!hallOpen() || press) return;
      el.setPointerCapture(e.pointerId);
      const now = performance.now();
      press = { x: e.clientX, y: e.clientY, along: hallAlong(), dragging: false, v: 0, lastX: e.clientX, lastT: now };
    });
    el.addEventListener('pointermove', (e) => {
      if (press) dragTo(press, e.clientX);
      lightHero(!press?.dragging && e.pointerType === 'mouse' ? heroAt(e.clientX, e.clientY) : -1);
    });
    el.addEventListener('pointerleave', () => lightHero(-1));
    el.addEventListener('pointerup', (e) => {
      if (!press) return;
      const p = press;
      press = null;
      if (p.dragging) letGo(p, e.clientX);
      else tapAt(e.clientX, e.clientY);
      // (a hero chosen as the finger lifted: the screen is gone before the browser's click after the tap, which would
      // land on the lobby under the finger: on a 640x360 phone its Enter the Arena, and a first visit's pick started
      // a run once the fight was warm)
      if (!heroSelectOpen()) eatClickAfter();
    });
    el.addEventListener('pointercancel', (e) => {
      if (press?.dragging) letGo({ ...press, v: 0 }, e.clientX);
      press = null;
    });
  }
  new ResizeObserver(layOut).observe($('.hs-panel'));
  window.addEventListener('resize', layOut);
  // (the heroes warmed after the lobby shows, a hero at a time: each tab's bar, and the choice, as they get further)
  onReadying(readied);
}

/** how long after a press's lift its click may come (ms): a tap's comes in a task after the lift, and a finger's
 *  click may never come (a later click is the player's own) */
const CLICK_AFTER_MS = 600;
/** the lab's: false lets the click after a choosing tap through, as it went before (`lab heropick --canary`) */
let eatsClicks = true;
export function heroSelectEatsClicks(on: boolean): void { eatsClicks = on; }

/** The click the browser makes of the press that just closed the screen kept from whatever now lies under it. */
function eatClickAfter(): void {
  if (!eatsClicks) return;
  const eat = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
    done();
  };
  const done = (): void => {
    window.removeEventListener('click', eat, true);
    clearTimeout(timer);
  };
  window.addEventListener('click', eat, true);
  const timer = setTimeout(done, CLICK_AFTER_MS);
}

/** How far the hero of class `id` is warmed (0 to 1). */
const readiness = (id: string): number => heroShare(CLASSES[id].model);

/** Each tab's bar and the choice told how far their heroes are warmed (none once they are). */
function readied(): void {
  if (!heroSelectOpen()) return;
  document.querySelectorAll<HTMLElement>('.hs-tabs button').forEach((b) => {
    const share = readiness(b.dataset.c!);
    b.classList.toggle('cold', share < 1);
    b.style.setProperty('--ready', String(share));
  });
  chooseLabel();
}

/** The choice's words: what a click on the hero it stands on does (the one in focus chosen, another brought into
 *  focus), or how far he is from ready (it waits till he is). */
function chooseLabel(): void {
  const i = labelled(), { id } = hallHeroes()[i];
  const cls = CLASSES[id];
  const share = readiness(id);
  const button = $('.hs-choose');
  button.classList.toggle('cold', share < 1);
  // (in the colour of the hero it stands on, as his name below is: from play, "match color of label on hero on hover
  // to the hero color we are using below")
  button.style.setProperty('--cc', cls.accent);
  if (share < 1) {
    button.textContent = `Readying the ${cls.name} ${Math.round(share * 100)}%`;
    return;
  }
  // (another hero under the mouse: a click brings him into focus, as his name does; from play, "missing label for
  // non current hero")
  if (i !== hallFocus()) button.textContent = `Select the ${cls.name}`;
  else button.textContent = !first && id === G.profile.classId ? `Stay the ${cls.name}` : `Play the ${cls.name}`;
}

/** The hero the label stands on: the one under the mouse, else the one in focus. */
const labelled = (): number => (lit >= 0 ? lit : hallFocus());

/** One class's card: its name in the logo's forged steel, its role, tagline, how it plays, its skills, its records. */
function card(cls: ClassDef): HTMLElement {
  const el = document.createElement('section');
  el.className = 'hs-card';
  el.dataset.c = cls.id;
  el.style.setProperty('--cc', cls.accent);
  const name = cls.name.toUpperCase();
  const steel = (fill: string, filter: string, cls = '') =>
    `<svg${cls} viewBox="0 0 600 110" aria-hidden="true"><text x="300" y="86" text-anchor="middle" font-family="Cinzel, Georgia, serif" `
    + `font-weight="900" font-size="92" letter-spacing="10" fill="${fill}" filter="url(#${filter})">${name}</text></svg>`;
  const pips = (n: number) => Array.from({ length: 5 }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('');
  el.innerHTML = `<div class="hs-name" role="heading" aria-level="2" aria-label="${cls.name}">`
      + `${steel('#e0280c', 'logo-glow-blur', ' class="logo-glow"')}${steel('url(#logo-steel)', 'logo-metal')}</div>`
    + `<div class="hs-role">${cls.hall.role}</div>`
    + `<p class="hs-tag">${cls.tagline}</p>`
    + `<dl class="hs-traits">${cls.hall.traits.map((t) => `<dt>${t.label}</dt><dd aria-label="${t.value} of 5">${pips(t.value)}</dd>`).join('')}</dl>`
    + '<div class="hs-label">Skills</div><div class="hs-skills"></div>'
    + '<div class="hs-records"></div>';
  const skills = $('.hs-skills', el);
  // (another hero's gear isn't the lobby's: each skill's base figures)
  for (const def of cls.skills) skills.appendChild(makeSkillSlot(def, undefined, 'base'));
  return el;
}

/** Open the screen, the hall built behind it, the hero of `focusId` in focus. `firstVisit`: there's nothing to go back
 *  to (no Back; Escape still opens pause/settings). */
export function openHeroSelect(focusId: string, firstVisit = false): void {
  if (heroSelectOpen()) return;
  first = firstVisit;
  hideTooltip();
  openHall(focusId);
  const box = $('#heroes');
  box.classList.toggle('first', first);
  $('.hs-slot').textContent = `Save slot ${saveSlot()}`;
  for (const h of hallHeroes()) $(`.hs-card[data-c="${h.id}"] .hs-records`).innerHTML = records(h.profile);
  showPage(keptPage());
  box.classList.remove('hidden');
  document.body.classList.add('in-hall');
  shown();
  layOut();
}

/** The save slot in play switched under the screen (its save slots opened from it): the hall built again at once on
 *  its heroes, the hero of `focusId` in focus. */
export function heroSelectSlotSwitched(focusId: string): void {
  if (!heroSelectOpen()) return;
  hideTooltip();
  closeHall();
  openHall(focusId);
  $('.hs-slot').textContent = `Save slot ${saveSlot()}`;
  for (const h of hallHeroes()) $(`.hs-card[data-c="${h.id}"] .hs-records`).innerHTML = records(h.profile);
  shown();
  layOut();
}

/** The page last chosen (the hero's card if none was, or storage is out of reach). */
function keptPage(): Page {
  let page: string | null = null;
  try { page = localStorage.getItem(PAGE_KEY); } catch { /* storage blocked: the card */ }
  return PAGES.find((p) => p === page) ?? 'hero';
}

/** The panel's page `page` shown, its tab lit; `keep`: chosen by the player, so kept for the screen's next opening. */
function showPage(page: Page, keep = false): void {
  hideTooltip();
  document.querySelectorAll<HTMLElement>('.hs-pagetabs .tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === page);
    b.setAttribute('aria-selected', String(b.dataset.page === page));
  });
  document.querySelectorAll<HTMLElement>('.hs-page').forEach((p) => p.classList.toggle('off', p.dataset.page !== page));
  if (!keep) return;
  try { localStorage.setItem(PAGE_KEY, page); } catch { /* storage blocked: kept for this opening alone */ }
}

/** Close the screen and take the hall down (the lobby's hero shown again), the hero of `chosen` chosen (none: Back). */
export function closeHeroSelect(chosen?: { id: string; profile: Profile }): void {
  if (!heroSelectOpen()) return;
  hideTooltip();
  lightHero(-1);
  $('#heroes').classList.add('hidden');
  document.body.classList.remove('in-hall');
  closeHall();
  if (chosen) hooks.choose(chosen.id, chosen.profile);
  hooks.closed();
}

/** The hero in focus's records in this slot, or that he's yet to play here. */
function records(p: Profile): string {
  const r = p.records;
  if (!r.runs) return '<span class="hs-new">Not yet played in this slot</span>';
  const rec = (v: string | number, label: string) => `<div><b>${v}</b>${label}</div>`;
  return rec(r.bestWave, 'Best wave') + rec(r.bestScore.toLocaleString(), 'Best score') + rec(r.runs, r.runs === 1 ? 'Run' : 'Runs');
}

function step(d: number): void { focusOn(hallFocus() + d); }

/** The heroes' spacing on the screen (css px): the scene moves with the finger, a hero's spacing a hero along. */
function spacing(): number {
  const [a, b] = hallHeroes().map((h) => h.player.pos.clone().project(G.camera).x * innerWidth / 2);
  const apart = Math.abs(b - a);
  return apart > 1 ? apart : innerWidth / 3;
}

/** A press moved to `x`: past `DRAG_START`, the scene dragged with it (the row the other way: the camera follows
 *  the scene's motion as a pan), its speed kept for the flick. */
function dragTo(p: Press, x: number): void {
  const dx = x - p.x;
  if (!p.dragging && Math.abs(dx) < DRAG_START) return;
  p.dragging = true;
  const now = performance.now(), dt = now - p.lastT;
  if (dt > 0) p.v = 0.3 * p.v + 0.7 * (x - p.lastX) / dt;
  p.lastX = x;
  p.lastT = now;
  dragHall(p.along - dx / spacing());
}

/** A drag let go at `x`: carried on by its speed (unless it stood still before the lift), and the hero nearest
 *  where it lands in focus. */
function letGo(p: Press, x: number): void {
  const v = performance.now() - p.lastT > FLICK_STILL_MS ? 0 : p.v;
  const before = hallFocus();
  const i = dropHall(p.along - (x - p.x + v * FLICK_MS) / spacing());
  if (i !== before) sfx.click();
  hideTooltip();
  shown();
}

/** Where hero `i` stands on the screen as the camera shows him now (css px: his middle across, his head and feet),
 *  or null behind the camera. */
function onScreen(i: number): { x: number; top: number; bottom: number } | null {
  // (his model where it's drawn, up on his plinth: his `pos` is the floor's, and the choice stood at his feet)
  const p = hallHeroes()[i].player, base = p.obj.position;
  const at = (up: number) => base.clone().setY(base.y + up).project(G.camera);
  const feet = at(0), head = at(p.model.height);
  if (feet.z >= 1) return null;
  return { x: (feet.x + 1) / 2 * innerWidth, top: (1 - head.y) / 2 * innerHeight, bottom: (1 - feet.y) / 2 * innerHeight };
}

/**
 * The choice placed on the hero in focus as the camera shows him, every frame while the screen is open, so it stays
 * on him as the camera glides, drifts or is dragged along the row (from play: "make the label stick with hero, it
 * currently moves when I scroll"; placed once at rest, it hung where he would stand as the camera moved). Moved by its
 * transform alone, on a layer of its own: nothing laid out or painted again (`styles/AGENTS.md`).
 */
export function placeChoice(): void {
  if (!heroSelectOpen() || !hallOpen()) return;
  const at = onScreen(labelled());
  if (!at) return;
  const y = at.bottom - (at.bottom - at.top) * CHOICE_UP;
  $('.hs-choose').style.transform = `translate(${at.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
}

/** The label shown while the mouse is over a hero (outlined), on him, hidden as it leaves. */
function hover(on: boolean): void { $('#heroes').classList.toggle('over-hero', on); }

function focusOn(i: number): void {
  if (!hallOpen()) return;
  hideTooltip();
  // (the camera glides along the row to him: cut there at once, from play "we lost camera animation when selecting
  // characters"; the hall's opening and its leaving stay at once)
  focusHall(i);
  shown();
}

/** The card, tab, gear, attributes and choice of the hero in focus shown. */
function shown(): void {
  const hero = hallHeroes()[hallFocus()], id = hero.id, cls = CLASSES[id];
  document.querySelectorAll<HTMLElement>('.hs-card').forEach((c) => c.classList.toggle('active', c.dataset.c === id));
  document.querySelectorAll<HTMLElement>('.hs-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.c === id));
  $('#heroes').style.setProperty('--cc', cls.accent);
  renderHeroGear(hero.profile, $('.hs-equip'), $('.hs-stash'), $('.hs-stash-count'));
  renderAttributes($('.hs-stats'), hero.player, hero.profile);
  readied();
  hover(lit >= 0);
  placeChoice();
}

function choose(): void {
  if (!hallOpen()) return;
  const { id, profile } = hallHeroes()[hallFocus()];
  // (not yet warm: his bar says how far; chosen now, the lobby would draw him before his programs are linked)
  if (readiness(id) < 1) return;
  closeHeroSelect({ id, profile });
}

/**
 * Hero `i` picked by his name or his number key: brought into focus, or chosen if he's in focus already, as his choice
 * does (from play: "pressing these titles (only if selected title), would also play / start the game", and "123 to
 * select each, ... same number again to play").
 */
function pick(i: number): void {
  if (i === hallFocus()) choose(); else focusOn(i);
}

/** The hero the mouse at (`x`, `y`) is over, as the camera shows him now: within a box round him and what he holds,
 *  the nearest by his middle where two boxes meet (-1: none, or not warm yet: hidden). */
function heroAt(x: number, y: number): number {
  let best = -1, bd = Infinity;
  for (const [i, hero] of hallHeroes().entries()) {
    if (readiness(hero.id) < 1) continue;
    const at = onScreen(i);
    if (!at) continue;
    const tall = at.bottom - at.top, d = Math.abs(x - at.x);
    if (d < tall * HOVER_SIDE && y > at.top - tall * HOVER_ABOVE && y < at.bottom + tall * HOVER_BELOW && d < bd) { bd = d; best = i; }
  }
  return best;
}

/** the hero outlined under the mouse (-1: none) */
let lit = -1;

/** Hero `i` outlined in white as the mouse is over him (from play: "outline highlight like we have for ranger's mark
 *  skill... hover outline shows then click to choose"), or none (-1). */
function lightHero(i: number): void {
  hover(i >= 0);
  if (i === lit) return;
  lit = i;
  outline(i >= 0 ? hallHeroes()[i].player.obj : null, LIT_COLOR, LIT_STRENGTH);
  // (the label goes with him: his words, and placed on him from the next frame)
  chooseLabel();
}

/** A tap or click on the backdrop: on the hero in focus, he's chosen (from play: "should be able to click whole hero");
 *  else the hero nearest it on screen in focus, if it landed near one. */
function tapAt(x: number, y: number): void {
  const on = heroAt(x, y);
  if (on >= 0) { sfx.click(); pick(on); return; }
  const w = innerWidth, h = innerHeight;
  let best = -1, bd = TAP_REACH * w;
  for (const [i, hero] of hallHeroes().entries()) {
    const p = hero.player.pos.clone().setY(hero.player.model.height * 0.55).project(G.camera);
    const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
    const d = Math.hypot(sx - x, (sy - y) * 0.4);
    if (p.z < 1 && d < bd) { bd = d; best = i; }
  }
  if (best >= 0 && best !== hallFocus()) { sfx.click(); focusOn(best); }
}

/** The screen's selection keys while open and unpaused; main.ts handles Escape above it. */
export function heroSelectKeys(): void {
  // (E leaves the village's hall as Back does, from play, "in hall of heroes pressing E should cancel back, same
  // like other E interactions"; a first visit has nothing to go back to)
  if (VILLAGE && !first && wasPressed('e')) {
    sfx.click();
    closeHeroSelect();
    return;
  }
  if (wasPressed('arrowleft') || wasPressed('a')) step(-1);
  if (wasPressed('arrowright') || wasPressed('d')) step(1);
  // 1, 2, 3...: each hero in the row's order (the number row's or the numpad's)
  const n = CLASS_IDS.findIndex((_, i) => wasPressed(String(i + 1)) || wasPressed(`numpad${i + 1}`));
  if (n >= 0) pick(n);
  else if (wasPressed('enter') || wasPressed('numpadenter') || wasPressed('space')) choose();
}

/** Where the view shifts so the hero in focus stands in the room the panel leaves: beside it on a wide screen, above
 *  it on an upright one (`setViewShift`'s px). */
export const heroSelectShift = (): { x: number; y: number } => shift;

function layOut(): void {
  if (!heroSelectOpen()) return;
  const r = $('.hs-panel').getBoundingClientRect();
  const beside = r.top < innerHeight * 0.4;
  shift = beside ? { x: -(innerWidth - r.left) / 2, y: 0 } : { x: 0, y: -(innerHeight - r.top) / 2 };
  // (above an upright screen's panel he'd stand taller than the room: the camera further back)
  const room = beside ? 1 : r.top / innerHeight;
  frameHall(Math.max(1, HERO_SHARE / (room * ROOM_FILL)), !beside);
  placeChoice();
}
