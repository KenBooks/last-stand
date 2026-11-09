// The hero selection screen (#heroes): the hall of heroes behind it (game/hall.ts), the hero in focus's name, role,
// how he plays, his skills and his records in this save slot in a panel beside him (its other tabs his gear, to look
// at, and his attributes: the tab last chosen kept), and a choice that leads into the lobby. The save slot under the
// title opens the save slots, and a slot switched there opens the hall again on its heroes. A first visit opens on it (no hero chosen yet, nothing to go back to); the lobby's "Change hero" opens it again.
// The hero under the mouse is outlined, and a click or tap on the hero in focus chooses him. Picked by the arrows, the tabs, a click or tap on a hero, the scene dragged along the row, or the keys (left and right, A and D; Enter or
// Space chooses, Esc goes back); the name of the hero in focus, clicked or tapped again, chooses him. The choice stands on the hero in focus, shown as the mouse comes over him (on touch,
// always). Every class's card is laid over the others in one cell, the one in focus shown, so
// the panel is the largest's size and nothing moves as the focus does.
import { G } from '../state';
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
/** whether the last press dragged the scene (a drag begun on the choice lets go there, and isn't a click on it) */
let dragged = false;
/** where the hero in focus stands on the screen once the camera has come to him (css px: his middle across, his head
 *  and feet), as last laid out */
let standing = { x: 0, top: 0, bottom: 0 };
/** where the choice stands on him, a share of his height from his feet (his thighs: his face and his skill clear) */
const CHOICE_UP = 0.3;
/** how far beside his middle the mouse is over him, a share of his height */
const HOVER_SIDE = 0.22;
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
  $('.hs-tabs').innerHTML = CLASS_IDS.map((id) => `<button data-c="${id}" style="--cc:${CLASSES[id].accent}">${CLASSES[id].name}</button>`).join('');
  document.querySelectorAll<HTMLElement>('.hs-tabs button').forEach((b) => {
    // (the name of the hero already in focus chooses him, as his choice does: from play, "pressing these titles (only
    // if selected title), would also play / start the game")
    b.onclick = () => {
      sfx.click();
      const i = CLASS_IDS.indexOf(b.dataset.c!);
      if (i === hallFocus()) choose(); else focusOn(i);
    };
  });
  $('.hs-prev').onclick = () => { sfx.click(); step(-1); };
  $('.hs-next').onclick = () => { sfx.click(); step(1); };
  $('.hs-choose').onclick = () => { if (dragged) return; sfx.click(); choose(); };
  $('.hs-back').onclick = () => { sfx.click(); if (!first) closeHeroSelect(); };
  $('.hs-slot').onclick = () => { sfx.click(); openSaves(true); };
  document.querySelectorAll<HTMLElement>('.hs-pagetabs .tab').forEach((b) => {
    b.onclick = () => { sfx.click(); showPage(b.dataset.page as Page, true); };
  });
  // (the scene is dragged from the backdrop or from the choice on the hero: a swipe across him starts on it)
  for (const el of [$('.hs-shade'), $('.hs-choose')]) {
    el.addEventListener('pointerdown', (e) => {
      if (!hallOpen() || press) return;
      el.setPointerCapture(e.pointerId);
      const now = performance.now();
      dragged = false;
      press = { x: e.clientX, y: e.clientY, along: hallAlong(), dragging: false, v: 0, lastX: e.clientX, lastT: now };
    });
    el.addEventListener('pointermove', (e) => {
      if (press) dragTo(press, e.clientX);
      hover(!press && e.pointerType === 'mouse' && overHero(e.clientX, e.clientY));
      lightHero(!press?.dragging && e.pointerType === 'mouse' ? heroAt(e.clientX, e.clientY) : -1);
    });
    el.addEventListener('pointerleave', () => lightHero(-1));
    el.addEventListener('pointerup', (e) => {
      if (!press) return;
      const p = press;
      press = null;
      dragged = p.dragging;
      if (p.dragging) letGo(p, e.clientX);
      else if (el.classList.contains('hs-shade')) tapAt(e.clientX, e.clientY);
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

/** The choice's words: what choosing the hero in focus does, or how far he is from ready (it waits till he is). */
function chooseLabel(): void {
  const { id } = hallHeroes()[hallFocus()];
  const cls = CLASSES[id];
  const share = readiness(id);
  const button = $('.hs-choose');
  button.classList.toggle('cold', share < 1);
  if (share < 1) {
    button.textContent = `Readying the ${cls.name} ${Math.round(share * 100)}%`;
    return;
  }
  button.textContent = !first && id === G.profile.classId ? `Stay the ${cls.name}` : `Play the ${cls.name}`;
}

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
 *  to (no Back, no Esc). */
export function openHeroSelect(focusId: string, firstVisit = false): void {
  if (heroSelectOpen()) return;
  first = firstVisit;
  hideTooltip();
  openHall(focusId, first);
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
  openHall(focusId, true);
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

/** The hero in focus where the camera comes to rest on him (`standing`), and the choice placed on him: placed as
 *  the focus or the layout changes, never every frame (the camera's drift round him moves him a few px). */
function placeChoice(): void {
  const hero = hallHeroes()[hallFocus()].player;
  const cam = G.camera.clone();
  const shot = hallShot();
  cam.position.copy(shot.pos);
  cam.lookAt(shot.look);
  cam.fov = shot.fov;
  cam.aspect = innerWidth / innerHeight;
  cam.setViewOffset(innerWidth, innerHeight, -shift.x, -shift.y, innerWidth, innerHeight);
  cam.updateMatrixWorld();
  const at = (up: number) => hero.obj.position.clone().setY(hero.obj.position.y + up).project(cam);
  const feet = at(0), head = at(hero.model.height);
  standing = { x: (feet.x + 1) / 2 * innerWidth, top: (1 - head.y) / 2 * innerHeight, bottom: (1 - feet.y) / 2 * innerHeight };
  const box = $('#heroes');
  box.style.setProperty('--hs-cx', `${standing.x}px`);
  box.style.setProperty('--hs-cy', `${standing.bottom - (standing.bottom - standing.top) * CHOICE_UP}px`);
}

/** Whether the pointer at (`x`, `y`) is over the hero in focus. */
function overHero(x: number, y: number): boolean {
  const tall = standing.bottom - standing.top;
  return Math.abs(x - standing.x) < tall * HOVER_SIDE && y > standing.top && y < standing.bottom;
}

/** The choice shown on the hero, as the mouse comes over him, or hidden as it leaves. */
function hover(on: boolean): void { $('#heroes').classList.toggle('over-hero', on); }

function focusOn(i: number): void {
  if (!hallOpen()) return;
  hideTooltip();
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
  hover(false);
  placeChoice();
}

function choose(): void {
  if (!hallOpen()) return;
  const { id, profile } = hallHeroes()[hallFocus()];
  // (not yet warm: his bar says how far; chosen now, the lobby would draw him before his programs are linked)
  if (readiness(id) < 1) return;
  closeHeroSelect({ id, profile });
}

/** The hero whose body is at (`x`, `y`) on screen, as the camera shows him now (-1: none, or not warm yet: hidden). */
function heroAt(x: number, y: number): number {
  const w = innerWidth, h = innerHeight;
  for (const [i, hero] of hallHeroes().entries()) {
    if (readiness(hero.id) < 1) continue;
    const p = hero.player, at = (up: number) => p.pos.clone().setY(p.pos.y + up).project(G.camera);
    const feet = at(0), head = at(p.model.height);
    if (feet.z >= 1) continue;
    const sx = (feet.x + 1) / 2 * w, top = (1 - head.y) / 2 * h, bottom = (1 - feet.y) / 2 * h;
    if (Math.abs(x - sx) < (bottom - top) * HOVER_SIDE && y > top && y < bottom) return i;
  }
  return -1;
}

/** the hero outlined under the mouse (-1: none) */
let lit = -1;

/** Hero `i` outlined in white as the mouse is over him (from play: "outline highlight like we have for ranger's mark
 *  skill... hover outline shows then click to choose"), or none (-1). */
function lightHero(i: number): void {
  if (i === lit) return;
  lit = i;
  outline(i >= 0 ? hallHeroes()[i].player.obj : null, LIT_COLOR, LIT_STRENGTH);
}

/** A tap or click on the backdrop: on the hero in focus, he's chosen (from play: "should be able to click whole hero");
 *  else the hero nearest it on screen in focus, if it landed near one. */
function tapAt(x: number, y: number): void {
  const on = heroAt(x, y);
  if (on >= 0 && on === hallFocus()) { sfx.click(); choose(); return; }
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

/** The screen's keys, while it's open (main.ts gives them to it alone). */
export function heroSelectKeys(): void {
  if (wasPressed('arrowleft') || wasPressed('a')) step(-1);
  if (wasPressed('arrowright') || wasPressed('d')) step(1);
  if (wasPressed('enter') || wasPressed('numpadenter') || wasPressed('space')) choose();
  else if (wasPressed('escape') && !first) closeHeroSelect();
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
