// In-run HUD: bars, hotbar, score, target frame, minimap, spoils, decision panel.
import { duelObjective } from './duelHud';
import { G } from '../state';
import { VILLAGE } from '../core/beta';
import { input } from '../core/input';
import { cameraYaw } from '../core/renderer';
import { rarityCounts } from '../loot/items';
import { WAVES } from '../data/waves';
import { BIOMES } from '../data/biomes';
import { bindTooltip, skillTooltip } from './tooltip';
import { on } from '../events';
import { buildTouchSkills } from './touch';
import { partyDecision, waitingForParty } from './coop';
import { isCoop } from '../net/role';
import { skillArt } from './skillArt';
import { drawVillageOnMinimap, villageMinimapScale } from './villageMinimap';

import { SKILL_KEYS } from '../loot/loadout';
import type { Player } from '../entities/player';
import type { Item, SkillDef, SkillKey } from '../types';

/** querySelector that asserts the element exists (HUD markup is static). */
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;
export const KEY_LABEL: Record<SkillKey, string> = { mouse0: 'LMB', mouse2: 'RMB', '1': '1', '2': '2', '3': '3', '4': '4', q: 'Q' };

interface HotbarSlot { key: SkillKey; el: HTMLElement; cd: HTMLElement; cdt: HTMLElement; def: SkillDef | null }
let slots: HotbarSlot[] = [];
/** the hero the hotbar was built for */
let builtFor: Player | null = null;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
let mmCtx: CanvasRenderingContext2D;
/** how much larger the hero's arrow is on the village's minimap, which is drawn smaller than a fight's */
const VILLAGE_ARROW = 1.4;

export function initHud(): void {
  mmCtx = $<HTMLCanvasElement>('#minimap').getContext('2d')!;
  on('lootGained', renderSpoils);
  on('waveStarted', () => renderSpoils());
}

/** The HUD shown or not: a run's whole, or the lobby's, its minimap alone and with `practice` the run's bottom bar. */
export function showHud(v: boolean, lobby = false, practice = false): void {
  $('#hud').classList.toggle('hidden', !v);
  $('#hud').classList.toggle('lobby', lobby);
  $('#hud').classList.toggle('practice', practice);
  $('.mm-title').textContent = lobby && VILLAGE ? 'Wardenhollow' : 'The Last Stand';
  if (!lobby) minimapOut(true);
}

/** whether the minimap is out, as the village last asked */
let minimapShown = true;
function minimapOut(shown: boolean): void {
  if (shown === minimapShown) return;
  minimapShown = shown;
  $('#minimap-wrap').classList.toggle('hidden', !shown);
}

/** The village's frame of the minimap: out while the village takes the hero's input (no panel, map or screen over
 *  it), as in a run, so a player knows it before their first fight. */
export function updateVillageMinimap(dt: number, visible: boolean): void {
  if (G.mode === 'run') return;
  minimapOut(visible);
  if (visible) tickMinimap(dt);
}

/** The minimap drawn once under the loading screen: its village is drawn into a canvas of its own the first time,
 *  20 ms that held the village's frame up 60 ms as the minimap first showed after the reveal (`npm run stalls --
 *  --scenario boot --js`: `drawVillageOnMinimap`). */
export function readyMinimap(): void { drawMinimap(); }

/** The minimap drawn when its turn has come: a 200px canvas, so 30 Hz is plenty. */
function tickMinimap(dt: number): void {
  minimapT -= dt;
  if (minimapT > 0) return;
  minimapT = 1 / 30;
  drawMinimap();
}

/**
 * The run's HUD laid out under the loading screen, its banner with it (hidden again as the lobby is entered, the
 * banner by its own fade): their first raster builds Skia's programs on the GPU process's main thread, and on a
 * first visit the run's first frames after the fight's loading bar held up 285 ms for its 26 (`npm run stalls --
 * --scenario boot`, the frames held up from Start).
 */
export function layOutHudAhead(): void {
  showHud(true);
  banner('The Last Stand', 'Wave 1');
  slotsAhead(true);
}

/**
 * Each slot of the bar laid out ahead as a cooldown, a lack of energy and a cast show it (`busy`), or at rest (not):
 * the boot rasters both in turn under the loading screen (the cooldown's sweep first drawn as the hero walked into the
 * yard held a first visit's GPU process 1.1 s, and the bar at rest, rastered ahead in its busy look alone, 0.8 s:
 * `npm run stalls -- --scenario walks`). The next update puts each right.
 */
export function slotsAhead(busy: boolean): void {
  for (const slot of slots) {
    setStyle(slot.cd, '--p', pct(busy ? 0.5 : 0));
    setText(slot.cdt, busy ? '3' : '');
    for (const look of ['nomana', 'active', 'busy']) slot.el.classList.toggle(look, busy);
  }
}

/** Build the in-run hotbar from the player's current loadout, unless it shows it already (the lobby's practice
 *  built it again on every press of Space, every slot laid out and its icon painted afresh). */
export function buildHotbar(player: Player): void {
  const shown = (slot: HotbarSlot) => slot.def === (player.skillAt(slot.key)?.def ?? null);
  if (builtFor === player && slots.every(shown)) return;
  builtFor = player;
  const bar = $('#hotbar');
  bar.innerHTML = '';
  slots = SKILL_KEYS.map((key) => {
    const def = player.skillAt(key)?.def ?? null;
    const el = makeSkillSlot(def, key);
    if (key === 'q') el.classList.add('sep');
    bar.appendChild(el);
    return { key, el, cd: $('.cd', el), cdt: $('.cdt', el), def };
  });
  // Circular (touch -> hud -> touch) but only used at runtime, which is safe.
  buildTouchSkills();
}

/** A skill icon slot. `def` null renders an empty slot; `key` adds a key label; `tooltip`: as the hero has the skill,
 *  its base figures alone (another save's), or none. */
export function makeSkillSlot(def: SkillDef | null, key?: SkillKey, tooltip: 'hero' | 'base' | 'none' = 'hero'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'slot' + (def ? '' : ' empty');
  const label = key ? `<span class="key">${KEY_LABEL[key]}</span>` : '';
  if (!def) {
    el.innerHTML = `<div class="cd"></div><div class="cdt"></div>${label}`;
    return el;
  }
  const c = def.icon.color, art = skillArt(def);
  // (a painted icon fills the slot, its frame drawn over it; a glyph glows in its colour)
  if (art) el.classList.add('art');
  else el.style.background = `radial-gradient(circle at 50% 40%, ${c}40, #0b0a0c 75%)`;
  const icon = art ? `<span class="icon art" style="background-image:url('${art}')"></span>` : `<span class="icon" style="color:${c}">${def.icon.glyph}</span>`;
  el.innerHTML = `${icon}<div class="cd"></div><div class="cdt"></div>${label}`;
  if (tooltip !== 'none') bindTooltip(el, skillTooltip(def, tooltip === 'hero'));
  return el;
}
export function banner(title: string, sub = ''): void {
  const b = $('#banner');
  // (shown, its fade begun again by its animations; hidden, shown it begins: a size read to begin it again laid the
  // page out in the middle of a run's start, 11.5 ms of its frame, `npm run stalls -- --scenario boot`)
  if (b.classList.contains('hidden')) b.classList.remove('hidden');
  else for (const animation of b.getAnimations()) { animation.cancel(); animation.play(); }
  $('.b-title', b).textContent = title;
  $('.b-sub', b).textContent = sub;
  // gone as its fade ends (its end follows the animation wherever it's taken: the lab ends it before a picture, and
  // left to a timer of its own it hid by the browser's clock, so a picture had it on the page or not, the HUD's
  // layers laid out another way); the timer only where no fade runs
  const hide = (): void => { clearTimeout(bannerTimer); b.classList.add('hidden'); };
  b.onanimationend = (event) => { if (event.target === b) hide(); };
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hide, 2800);
}

/** The unbanked spoils as counts per rarity ("2 Epic"): what the items are shows only once banked. */
export function rarityChips(bag: Item[], cls = 'chip'): string {
  return rarityCounts(bag).map(({ rarity, n }) => `<span class="${cls}" data-r="${rarity.id}" style="color:${rarity.color}">${n} ${rarity.name}</span>`).join('');
}

let refreshDecision: (() => void) | null = null;
let decisionTimer: ReturnType<typeof setTimeout> | undefined;
/** The choice folds down to its two buttons after this long. */
const DECISION_DETAILS_MS = 10000;
/** How long the choice takes to fold back into the wave badge (`dc-close` in _hud.scss). */
const DECISION_CLOSE_MS = 650;

/**
 * The choice after a wave unfolds from the wave badge at the top (the badge fades as its frame grows
 * out of it), shows the details for a while, then folds down to its buttons. Called again while it
 * shows (a partner's vote, new loot), it only refreshes.
 */
export function showDecision(): void {
  const r = G.run;
  if (!r) return;
  const box = $('#decision');
  if (box.classList.contains('hidden') || box.classList.contains('closing')) {
    clearTimeout(decisionTimer);
    box.classList.remove('hidden', 'closing', 'compact', 'opening');
    void box.offsetWidth;   // restart the unfolding
    box.classList.add('opening');
    $('#wavebadge').classList.remove('back');
    $('#wavebadge').classList.add('morphed');
    decisionTimer = setTimeout(() => box.classList.add('compact'), DECISION_DETAILS_MS);
  }
  const refresh = () => {
    if (box.classList.contains('hidden') || box.classList.contains('closing')) return;
    $('.dc-title', box).textContent = `Wave ${r.wave} is broken`;
    const bag = $('.dc-bag', box);
    bag.innerHTML = '';
    if (!r.bag.length) bag.innerHTML = '<span class="chip" style="color:#9a8f7c">No spoils yet</span>';
    // what they are stays hidden until banked: the gamble is on the counts alone
    else bag.innerHTML = rarityChips(r.bag) + '<span class="chip sealed">revealed when you bank</span>';
    // with nothing in the bag there's nothing to lose
    $('.dc-risk', box).innerHTML = `If you fall, <b>${r.bag.length} unbanked item${r.bag.length === 1 ? '' : 's'}</b> will be lost forever.`;
    $('.dc-risk', box).classList.toggle('hidden', !r.bag.length);
    $('.bank-label', box).textContent = r.training ? 'Leave training' : 'Bank spoils & leave';
    if (r.training) bag.textContent = 'Training · No loot or score';
    const next = r.training ? r.wave : r.wave + 1;
    // co-op: the next wave waits for everyone staying
    const waiting = waitingForParty();
    $('.cont-label', box).textContent = waiting ? 'Waiting for the others…'
      : r.training ? `Repeat wave ${r.wave}` : next % WAVES.bossEvery === 0 ? `Face wave ${next} (${BIOMES[G.arena.biome].bossShort})` : `Continue to wave ${next}`;
    $<HTMLButtonElement>('.cont', box).disabled = waiting;
    const party = partyDecision();
    $('.dc-party', box).textContent = party;
    $('.dc-party', box).classList.toggle('hidden', !party);
  };
  refresh();
  refreshDecision = refresh;
}

/** Folds the choice back into the wave badge, which pops up again (with the next wave's number). */
export function hideDecision(): void {
  const box = $('#decision'), badge = $('#wavebadge');
  if (box.classList.contains('hidden') || box.classList.contains('closing')) return;
  clearTimeout(decisionTimer);
  box.classList.remove('opening');
  box.classList.add('closing');
  // the badge fades in under the shrinking circle, and flares once the box is gone
  decisionTimer = setTimeout(() => {
    badge.classList.remove('morphed');
    decisionTimer = setTimeout(() => {
      box.classList.add('hidden');
      box.classList.remove('closing', 'compact');
      badge.classList.add('back');
    }, DECISION_CLOSE_MS * 0.6);
  }, DECISION_CLOSE_MS * 0.4);
}

/** The choice gone at once, mid-animation or not: a run left without choosing (abandoned, or a new one starting) must not
 * show the last one's. */
export function resetDecision(): void {
  clearTimeout(decisionTimer);
  $('#decision').classList.remove('opening', 'closing', 'compact');
  $('#decision').classList.add('hidden');
  $('#wavebadge').classList.remove('morphed', 'back');
}

/** `gained`: the item just added, whose rarity's count pulses. */
export function renderSpoils(gained?: Item): void {
  const r = G.run;
  if (!r) return;
  $('#spoils').classList.toggle('hidden', r.training);
  $('.sp-count').textContent = String(r.bag.length);
  const list = $('.sp-list');
  list.innerHTML = rarityChips(r.bag, 'sp-r');
  if (gained) list.querySelector(`[data-r="${gained.rarity}"]`)?.classList.add('bump');
  refreshDecision?.();
}

let lastBuffs = '';

// The HUD updates every frame. Look static elements up once, and only write values that
// changed: every DOM write invalidates style, which the browser then recalculates.
const hudEls = new Map<string, HTMLElement>();
const h = (s: string): HTMLElement => { let e = hudEls.get(s); if (!e) hudEls.set(s, e = $(s)); return e; };
const written = new WeakMap<Element, string>();
function setText(el: Element, v: string): void { if (written.get(el) !== v) { el.textContent = v; written.set(el, v); } }
function setStyle(el: HTMLElement, prop: string, v: string): void {
  const key = `${prop}:${v}`;
  if (written.get(el) !== key) { el.style.setProperty(prop, v); written.set(el, key); }
}
const pct = (k: number): string => `${(k * 100).toFixed(1)}%`;
let minimapT = 0, partyT = 0;

export function updateHud(): void {
  // (in the lobby's practice, the bottom bar alone: there is no run)
  const p = G.player, r = G.mode === 'run' ? G.run : null;
  if (!p) return;
  const s = p.stats;
  const lifeK = Math.max(0, p.life / s.maxLife);
  setStyle(h('.bar.life .fill'), 'width', pct(lifeK));
  setStyle(h('.bar.life .lag'), 'width', pct(lifeK));
  h('.bar.life').classList.toggle('low', lifeK < 0.3);
  setText(h('.bar.life .txt'), `${Math.ceil(p.life)} / ${Math.round(s.maxLife)}`);
  setStyle(h('.bar.energy .fill'), 'width', pct(p.energy / s.maxEnergy));
  setText(h('.bar.energy .txt'), `${Math.floor(p.energy)} / ${Math.round(s.maxEnergy)}`);
  if (r && !r.duel) setText(h('.gem-num'), String(r.wave));

  for (const slot of slots) {
    const sk = p.skillAt(slot.key);
    if (!sk) continue;
    // cooldowns belong to the skill, so duplicates on several keys share one timer
    const left = p.cooldownLeft(sk.def.impl), total = p.cooldownOf(sk.def);
    const k = total > 0 ? left / total : 0;
    setStyle(slot.cd, '--p', pct(k));
    setText(slot.cdt, left > 0.05 ? (left < 1 ? left.toFixed(1) : String(Math.ceil(left))) : '');
    slot.el.classList.toggle('nomana', p.energy < (sk.def.channel ? sk.def.cost * 0.2 : sk.def.cost));
    slot.el.classList.toggle('active', p.channel?.key === slot.key || p.casting?.skill === sk || p.aiming?.key === slot.key);
    slot.el.classList.toggle('busy', p.heldUp(sk));
  }

  // buffs
  const buffs = h('#buffs');
  const wardHtml = p.ward ? `<div class="buff" style="color:#c9b8ff">◈<span class="bt">${Math.ceil(p.ward.t)}</span></div>` : '';
  if (lastBuffs !== wardHtml) { buffs.innerHTML = wardHtml; lastBuffs = wardHtml; }

  if (!r) return;
  // objectives
  const ol = h('.obj-line');
  const txt = r.duel ? duelObjective(r.duel)
    : r.phase === 'countdown' && r.held ? 'Waiting for players…'
    : r.phase === 'countdown' ? `Wave ${r.wave} begins in ${Math.ceil(r.timer)}…`
    : r.phase === 'fighting' ? `Eliminate all enemies (${r.remaining})`
    : r.phase === 'cleared' ? (G.player.active ? (r.training ? 'Leave training or repeat this wave' : 'Bank your spoils or continue') : 'The others decide')
    : G.player.out === 'banked' ? (r.training ? 'Training complete' : 'Spoils banked') : G.player.out === 'dead' ? 'Fallen' : 'The run is over';

  setText(h('.obj-line .obj-text'), txt);
  ol.classList.toggle('done', r.phase === 'cleared');

  // co-op: the partners' choices after a wave come in as the host reports them
  if (r.phase === 'cleared' && isCoop()) { partyT -= G.dt; if (partyT <= 0) { partyT = 0.25; refreshDecision?.(); } }

  updateTarget();
  tickMinimap(G.dt);
}

function updateTarget() {
  const box = h('#target');
  let e = G.enemies.find((x) => x.boss && x.alive);
  if (!e) {
    let best = 2.2;
    for (const x of G.enemies) {
      if (!x.alive || x.spawning) continue;
      const d = Math.hypot(x.pos.x - input.ground.x, x.pos.z - input.ground.z) - x.radius;
      if (d < best) { best = d; e = x; }
    }
  }
  if (!e) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.classList.toggle('boss', e.boss);
  setText(h('#target .t-name'), e.name);
  setText(h('#target .t-sub'), e.boss ? 'Boss' : e.hero ? 'Hero' : '');
  const k = pct(e.life / e.maxLife);
  setStyle(h('#target .t-fill'), 'width', k);
  setStyle(h('#target .t-ghost'), 'width', k);
}

/** how many metres across the minimap shows (its canvas's width) */
export const MINIMAP_METRES = 64;
/** what draws on the minimap besides the arena, the foes and the heroes (the pings: ui/ping.ts), under the heroes */
const minimapHooks: ((c: CanvasRenderingContext2D, S: number) => void)[] = [];
/** Runs `draw` each time the minimap is drawn, in its turned frame (`S` px a metre, its middle the arena's). */
export function onMinimap(draw: (c: CanvasRenderingContext2D, S: number) => void): void { minimapHooks.push(draw); }

function drawMinimap() {
  const c = mmCtx, W = 200, inRun = G.mode === 'run';
  const S = inRun ? W / MINIMAP_METRES : villageMinimapScale(W); // world units -> px
  c.clearRect(0, 0, W, W);
  c.save();
  c.translate(W / 2, W / 2);
  c.rotate(cameraYaw()); // screen-up on the map is screen-up in the view
  if (inRun) drawArena(c, S);
  else drawVillageOnMinimap(c, W);
  // (the pings: under the heroes, in a run and in the village)
  for (const draw of minimapHooks) draw(c, S);
  // player arrows: ours in green, co-op partners in blue
  for (const p of [...G.players].reverse()) {
    if (p.away || p.out === 'banked') continue;
    c.save();
    c.translate(p.pos.x * S, p.pos.z * S);
    c.rotate(-p.facing + Math.PI);
    // (larger among the village's buildings, and inked round: on a pale roof it was the hardest thing on the map to find)
    if (!inRun) c.scale(VILLAGE_ARROW, VILLAGE_ARROW);
    c.fillStyle = p.local ? '#6dffb0' : p.alive ? '#6ab8ff' : '#56627a';
    c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineWidth = 1.5; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(0, 2.5); c.lineTo(-4.5, 5); c.closePath(); c.stroke(); c.fill();
    c.restore();
  }
  c.restore();
}

/** A fight's arena on the minimap, `S` px a metre: its boundary, dais and gates, and the foes. */
function drawArena(c: CanvasRenderingContext2D, S: number): void {
  // boundary: the crypt's octagon wall or the forest's ring of thicket
  const mm = BIOMES[G.arena.biome].minimap;
  c.strokeStyle = 'rgba(200,190,170,.55)'; c.lineWidth = 3;
  c.fillStyle = 'rgba(60,58,62,.35)';
  c.beginPath();
  if (mm.wall === 'circle') c.arc(0, 0, 29 * S, 0, Math.PI * 2);
  else for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, R = 30 * S;
    k ? c.lineTo(Math.cos(a) * R, Math.sin(a) * R) : c.moveTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  c.fill(); c.stroke();
  // dais
  c.strokeStyle = 'rgba(200,190,170,.4)'; c.lineWidth = 1.5;
  c.strokeRect(-5.9 * S, -5.9 * S, 11.8 * S, 11.8 * S);
  // portals
  for (const pt of G.arena.portals) {
    c.fillStyle = mm.portal;
    c.beginPath(); c.arc(pt.pos.x * S * 1.08, pt.pos.z * S * 1.08, 3.5, 0, Math.PI * 2); c.fill();
  }
  // enemies
  for (const e of G.enemies) {
    if (!e.alive) continue;
    c.fillStyle = e.boss ? '#c070ff' : e.hero ? '#ffb040' : '#ff3a30';
    c.beginPath(); c.arc(e.pos.x * S, e.pos.z * S, e.boss ? 5 : e.hero ? 3.5 : 2.2, 0, Math.PI * 2); c.fill();
  }
}
