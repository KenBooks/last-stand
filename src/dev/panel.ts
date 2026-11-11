// The developer mode's panel (F8, or the DEV tab at the screen's edge on touch): the time (freeze, a step, its speed),
// the free camera, a wave in any biome, foes spawned, the hero (god mode, a refill, his class), any gear, and what the
// frame costs (the scene's draws and programs, its parts taken out live with the performance overlay showing the
// difference, the pause menu's Profile this spot from where the camera is). Its own page pieces, made here, so a
// production build's page has none of them.
import * as THREE from 'three';
import { G } from '../state';
import { input } from '../core/input';
import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { RARITIES } from '../data/items';
import { CLASSES } from '../data/classes/index';
import { ARENA } from '../data/balance';
import { spawnEnemy } from '../entities/spawner';
import { basesFor } from '../loot/items';
import { observePerfHud, perfHudStats, setPerfHudSize, perfHudSize, type PerfHudSize } from '../ui/perfHud';
import { frameParts, type ScenePart } from '../perf/sceneParts';
import { freeCamOn, freeCamSpeed, freeCamLabels, freeCamToHero, holdFreeCam, setFreeCamLabels, speedFreeCam, turnFreeCam } from './freeCam';
import { classOf, emptyStash, slotsOf, stashEveryBase, stashNew, wearKit, wearNew, weaponStyles } from './gear';
import { cheats, flyFree, setFrozen, stepFrozen, time, type DevHooks } from './index';
import { initDevHelp } from './help';
import { changeDevBiome } from './biome';
import type { RarityId, Slot } from '../types';
import './dev.scss';

let hooks: DevHooks;
let panel: HTMLElement, fly: HTMLElement, tab: HTMLButtonElement;
/** what the panel last said, so it's written again only when it changes */
let shown = '';
let tabs: HTMLElement;

const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const COUNTS = [1, 5, 20];
const PERF_SIZES: PerfHudSize[] = ['off', 'mini', 'full'];
/** the scene's parts the panel can take out: the profiler's (`perf/sceneParts.ts`) but the plain colour's, which
 *  compiles programs of its own (its lit shading against a plain colour) */
const PLAIN = 'the lit shading, against a plain colour';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => panel.querySelector<T>(sel)!;
const options = (list: [string, string][]): string => list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

export const panelOpen = (): boolean => !panel.classList.contains('hidden');
export function togglePanel(open = !panelOpen()): void {
  dockPanel();
  panel.classList.toggle('hidden', !open);
  observePerfHud(open);
  document.body.classList.toggle('dev-open', open);
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const selected = (b.dataset.devTab === 'dev') === open;
    b.classList.toggle('on', selected);
    b.setAttribute('aria-selected', String(selected));
  });
  if (open) { renderGear(); refreshPanel(); }
}
export function toggleFly(): void { flyFree(!freeCamOn(), hooks); }

export function initPanel(h: DevHooks): void {
  hooks = h;
  initDevHelp();
  panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.className = 'hidden';
  panel.innerHTML = `
    <div class="dv-head"><b>Dev mode</b><label class="dv-opacity">Opacity <input data-in="opacity" type="range" min="50" max="100" value="95"><output data-out="opacity">95%</output></label></div>
    <div class="dv-row"><button data-act="reset">Reset to loaded scene</button></div>
    <details open><summary>Time &amp; camera</summary>
      <div class="dv-row dv-speed-row" aria-label="Simulation speed">${SPEEDS.map((s) => `<button data-speed="${s}" class="dv-tog">${s}×</button>`).join('')}<button data-act="freeze" class="dv-tog dv-freeze">Freeze</button><button data-act="step" title="One frame forward while frozen (.)">Step</button></div>
      <div class="dv-row dv-camera-row"><button data-act="fly" class="dv-tog">Free camera</button><button data-act="hero">Back to hero</button><button data-act="labels" class="dv-tog">World labels</button><button data-act="clean" class="dv-tog">Hide UI</button></div>
      <div class="dv-note dv-fly-speed"></div>
    </details>
    <details open><summary>Run</summary>
      <div class="dv-row"><select data-in="biome">${options(BIOME_IDS.map((id) => [id, BIOMES[id].title]))}</select>
        <label>Wave <input data-in="wave" type="number" min="1" max="999" value="1"></label></div>
      <div class="dv-row"><label><input data-in="training" type="checkbox"> Training</label><button data-act="start">Start wave</button><button data-act="lobby">Lobby</button></div>
      <div class="dv-row"><button data-act="kill">Kill all foes</button><button data-act="clear">Clear wave</button></div>
      <div class="dv-row"><select data-in="foe">${options((Object.keys(ENEMIES) as EnemyId[]).filter((id) => !ENEMIES[id].dummy).map((id) => [id, ENEMIES[id].name]))}</select>
        ${COUNTS.map((n) => `<button data-spawn="${n}">+${n}</button>`).join('')}<label><input data-in="champion" type="checkbox"> Elite</label></div>
    </details>
    <details open><summary>Hero</summary>
      <div class="dv-row"><button data-act="god" class="dv-tog">God mode</button><button data-act="free" class="dv-tog">No costs</button><button data-act="refill">Refill</button></div>
      <div class="dv-row dv-label">Class ${Object.values(CLASSES).map((c) => `<button data-class="${c.id}" class="dv-tog">${c.name}</button>`).join('')}</div>
    </details>
    <details><summary>Gear</summary>
      <div class="dv-row"><label>Rarity <select data-in="rarity">${options(RARITIES.map((r) => [r.id, r.name]))}</select></label><span class="dv-styles"></span></div>
      <div class="dv-row"><button data-act="kit">Wear full kit</button><button data-act="every">Stash every base</button><button data-act="empty">Empty stash</button></div>
      <div class="dv-row dv-gear-pick"><select data-in="slot"></select><select data-in="base"></select><button data-act="wear">Wear</button><button data-act="stash">To stash</button></div>
      <div class="dv-note dv-gear-note"></div>
    </details>
    <details open><summary class="dv-perf-head"><span>Performance</span><span class="dv-stats"><strong data-v="fps">—</strong> FPS · <strong data-v="frame">—</strong> ms</span></summary>
      <div class="dv-row dv-label">Overlay ${PERF_SIZES.map((s) => `<button data-perf="${s}" class="dv-tog">${s}</button>`).join('')}<button class="dv-profile" data-act="profile" title="The pause menu's profiler, from where the camera is now">Profile this spot</button></div>
      <div class="dv-perf-info">
        <span>CPU <strong data-v="cpu">—</strong> ms</span><span>GPU <strong data-v="gpu">—</strong> ms</span><span>p95 <strong data-v="p95">—</strong> ms</span>
        <span>1% low <strong data-v="low">—</strong></span><span>Draws <strong data-v="draws">—</strong></span><span>Tris <strong data-v="tris">—</strong></span>
        <span>Shaders <strong data-v="shaders">—</strong></span><span>Geo/Tex <strong data-v="memory">—</strong></span>
      </div>
      <div class="dv-parts"></div>
      <div class="dv-row"><button data-act="parts">Check all</button></div>
    </details><div class="dv-scroll-cue" aria-hidden="true">Scroll for more ↓</div>`;
  document.body.append(panel);
  tabs = document.createElement('div');
  tabs.className = 'dv-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Lobby panel');
  tabs.innerHTML = '<button role="tab" data-dev-tab="hero" aria-selected="true" class="on">Hero</button><button role="tab" data-dev-tab="dev" aria-selected="false">Dev</button>';
  document.querySelector('.menu-left')!.prepend(tabs);
  const heroFold = document.getElementById('hero-fold')!;
  const folds = document.createElement('div');
  folds.className = 'fold-tabs fold-left';
  heroFold.before(folds);
  folds.append(heroFold);
  const devFold = document.createElement('button');
  devFold.id = 'dev-fold';
  devFold.className = 'fold-tab fold-extra';
  devFold.title = 'Show developer panel';
  devFold.setAttribute('aria-label', devFold.title);
  devFold.innerHTML = heroFold.innerHTML.replace('Hero', 'Dev');
  folds.append(devFold);
  heroFold.addEventListener('click', () => { if (heroFold.getAttribute('aria-expanded') === 'true') togglePanel(false); });
  devFold.onclick = () => {
    if (heroFold.getAttribute('aria-expanded') === 'false') heroFold.click();
    togglePanel(true);
  };
  tabs.addEventListener('click', (e) => {
    const name = (e.target as HTMLElement).closest<HTMLElement>('[data-dev-tab]')?.dataset.devTab;
    if (name) togglePanel(name === 'dev');
  });

  tab = document.createElement('button');
  tab.id = 'dev-tab';
  tab.textContent = 'DEV';
  tab.title = 'Developer panel (F8)';
  tab.onclick = () => togglePanel();
  document.body.append(tab);

  buildFly();
  panel.addEventListener('click', onClick);
  panel.addEventListener('change', onChange);
  panel.addEventListener('scroll', refreshScrollCue);
  panel.addEventListener('toggle', refreshScrollCue, true);
  new ResizeObserver(refreshScrollCue).observe(panel);
  // (the stats while the panel is open, twice a second: the frame's own numbers, as the overlay's)
  setInterval(() => { if (panelOpen() || freeCamOn()) refreshPanel(); }, 500);
  panel.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.dataset.in !== 'opacity') return;
    const value = Math.max(50, Math.min(100, Number(e.target.value)));
    document.body.style.setProperty('--dev-opacity', String(value / 100));
    $('[data-out=opacity]').textContent = `${value}%`;
  });
  dockPanel();
  $<HTMLSelectElement>('[data-in=biome]').value = G.arena.biome;
  setFreeCamLabels(true);
  renderParts();
}

function refreshScrollCue(): void {
  if (!panelOpen()) return;
  panel.classList.toggle('more-below', panel.scrollHeight - panel.scrollTop - panel.clientHeight > 2);
}

/** Share the hero panel in the lobby; keep F8 available on the left during play or flight. */
export function dockPanel(): void {
  const menu = document.getElementById('menu')!;
  const docked = G.mode === 'menu' && !freeCamOn() && !menu.classList.contains('hidden') && !menu.classList.contains('stowed');
  if (panel.classList.contains('docked') === docked && document.body.classList.contains('dev-docked') === docked) return;
  const parent = docked ? document.querySelector('.menu-left')! : document.body;
  if (panel.parentElement !== parent) parent.append(panel);
  panel.classList.toggle('docked', docked);
  document.body.classList.toggle('dev-docked', docked);
}

// --- the free camera's overlay: drags look, the wheel steps the speed; on touch, buttons fly it -------------------
function buildFly(): void {
  fly = document.createElement('div');
  fly.id = 'dev-fly';
  const hold = (way: string, label: string): string => `<button data-way="${way}">${label}</button>`;
  fly.innerHTML = `
    <div class="df-hint">Free camera · <b>WASD</b> fly · <b>Q/E</b> down/up · <b>drag</b> look · <b>wheel</b> speed <span class="df-speed"></span> · <b>Shift</b> fast · <b>Ctrl</b> slow · <b>F</b> freeze · <b>.</b> step · <b>R</b> hero · <b>F9</b> leave</div>
    <div class="df-pad">
      <div class="df-move">${hold('up', '▲ Up')}${hold('forward', '▲')}${hold('down', '▼ Down')}${hold('left', '◀')}${hold('back', '▼')}${hold('right', '▶')}</div>
      <div class="df-acts"><button data-fly="freeze">Freeze</button><button data-fly="exit">Leave</button></div>
    </div>`;
  document.body.append(fly);
  let dragging: number | null = null;
  fly.addEventListener('pointerdown', (e) => {
    const way = (e.target as HTMLElement).closest<HTMLElement>('[data-way]')?.dataset.way;
    if (way) { holdFreeCam(way, true); (e.target as HTMLElement).setPointerCapture(e.pointerId); return; }
    if ((e.target as HTMLElement).closest('button')) return;
    dragging = e.pointerId;
    fly.setPointerCapture(e.pointerId);
  });
  fly.addEventListener('pointermove', (e) => { if (e.pointerId === dragging) turnFreeCam(e.movementX, e.movementY); });
  const end = (e: PointerEvent): void => {
    const way = (e.target as HTMLElement).closest<HTMLElement>('[data-way]')?.dataset.way;
    if (way) holdFreeCam(way, false);
    if (e.pointerId === dragging) dragging = null;
  };
  fly.addEventListener('pointerup', end);
  fly.addEventListener('pointercancel', end);
  fly.addEventListener('lostpointercapture', end);
  fly.addEventListener('wheel', (e) => { e.preventDefault(); speedFreeCam(-Math.sign(e.deltaY)); refreshPanel(); }, { passive: false });
  fly.addEventListener('contextmenu', (e) => e.preventDefault());
  fly.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-fly]')?.dataset.fly;
    if (act === 'freeze') setFrozen(!time.frozen);
    if (act === 'exit') toggleFly();
  });
}

// --- the panel's controls ------------------------------------------------------------------------------------------
function onClick(e: MouseEvent): void {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  const d = b.dataset;
  if (d.speed) { time.scale = Number(d.speed); if (time.frozen) setFrozen(false); }
  if (d.perf) setPerfHudSize(d.perf as PerfHudSize);
  if (d.spawn) hooks.whenFightWarm(() => spawn(Number(d.spawn)));
  if (d.class) hooks.switchClass(d.class);
  switch (d.act) {
    case 'freeze': setFrozen(!time.frozen); break;
    case 'step': stepFrozen(); break;
    case 'fly': toggleFly(); break;
    case 'hero': freeCamToHero(); break;
    case 'labels': setFreeCamLabels(!freeCamLabels()); break;
    case 'clean': document.body.classList.toggle('dev-clean'); break;
    case 'start': {
      const wave = Math.max(1, Math.min(999, Math.round(Number($<HTMLInputElement>('[data-in=wave]').value) || 1)));
      startWave(wave, $<HTMLSelectElement>('[data-in=biome]').value as BiomeId, $<HTMLInputElement>('[data-in=training]').checked);
      break;
    }
    case 'lobby': hooks.toLobby(); break;
    case 'kill': killAll(); break;
    case 'clear': clearWave(); break;
    case 'god': cheats.god = !cheats.god; break;
    case 'free': cheats.free = !cheats.free; break;
    case 'reset':
      if (freeCamOn()) flyFree(false, hooks);
      setFrozen(false); time.scale = 1; time.step = 0;
      putPartsBack(); hooks.reset(); break;
    case 'refill': refill(); break;
    case 'kit': wearKit(rarity()); gearChanged(); break;
    case 'every': say(`${stashEveryBase(rarity())} pieces put in the stash`); gearChanged(); break;
    case 'empty': emptyStash(); gearChanged(); break;
    case 'wear': wearNew(slot(), base(), rarity()); gearChanged(); break;
    case 'stash': say(stashNew(slot(), base(), rarity()) ? 'Put in the stash' : 'The stash is full'); gearChanged(); break;
    case 'profile': putPartsBack(); hooks.openPerformance(); break;
    case 'parts':
      if (taken.size) putPartsBack();
      else panel.querySelectorAll<HTMLInputElement>('[data-part]').forEach((part) => togglePart(part.dataset.part!));
      break;
  }
  const style = d.style ? weaponStyles(classOf())[Number(d.style)] : undefined;
  if (style) { style.wear(rarity()); gearChanged(); }
  refreshPanel();
}

function onChange(e: Event): void {
  if ((e.target as HTMLElement).matches('[data-in=slot]')) renderBases();
  const target = e.target as HTMLInputElement;
  if (target.matches('[data-in=biome]')) {
    const biome = target.value as BiomeId;
    putPartsBack();
    hooks.whenFightWarm(() => { changeDevBiome(biome); refreshPanel(); });
  }
  if (target.dataset.part) { togglePart(target.dataset.part); refreshPanel(); }
  if (target.matches('[data-in=training]') && G.mode === 'run' && G.run) {
    startWave(G.run.wave, G.arena.biome, target.checked);
  }
}

function startWave(wave: number, biome: BiomeId, training: boolean): void {
  // A new wave must run even if free-camera inspection froze the previous scene.
  if (freeCamOn()) flyFree(false, hooks);
  setFrozen(false); time.step = 0;
  putPartsBack();
  hooks.startWave(wave, biome, training);
}

const rarity = (): RarityId => $<HTMLSelectElement>('[data-in=rarity]').value as RarityId;
const slot = (): Slot => $<HTMLSelectElement>('[data-in=slot]').value as Slot;
const base = (): string => $<HTMLSelectElement>('[data-in=base]').value;
const say = (text: string): void => { $('.dv-gear-note').textContent = text; };

function gearChanged(): void {
  hooks.gearChanged();
  renderGear();
}

/** The gear section for the class in play: its weapon styles, its slots and their bases. */
function renderGear(): void {
  const cls = classOf();
  $('.dv-styles').innerHTML = weaponStyles(cls).map((s, i) => `<button data-style="${i}">${s.name}</button>`).join('');
  const sel = $<HTMLSelectElement>('[data-in=slot]'), was = sel.value;
  sel.innerHTML = options(slotsOf(cls).map((s) => [s, s]));
  if (slotsOf(cls).includes(was as Slot)) sel.value = was;
  renderBases();
}

function renderBases(): void {
  $<HTMLSelectElement>('[data-in=base]').innerHTML = options(basesFor(slot(), classOf()).map((b) => [b, b]));
}

/** `n` foes of the kind chosen, round the camera's spot (the free camera's, or the hero's), well off him. */
function spawn(n: number): void {
  const type = $<HTMLSelectElement>('[data-in=foe]').value as EnemyId;
  const hero = $<HTMLInputElement>('[data-in=champion]').checked;
  const training = $<HTMLInputElement>('[data-in=training]').checked;
  const at = freeCamOn() ? lookedAt() : G.player.pos;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 5;
    const pos = new THREE.Vector3(at.x + Math.sin(a) * r, 0, at.z + Math.cos(a) * r);
    const out = Math.hypot(pos.x, pos.z), most = ARENA.radius * 0.92;
    if (out > most) pos.multiplyScalar(most / out);
    spawnEnemy(type, pos, { wave: G.run?.wave ?? 1, hero, training });
  }
}

/** Where the free camera looks on the floor (or a little ahead of it, looking up). */
function lookedAt(): THREE.Vector3 {
  const cam = G.camera, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const t = dir.y < -0.05 ? -cam.position.y / dir.y : 12;
  return cam.position.clone().addScaledVector(dir, Math.min(t, 40)).setY(0);
}

function killAll(): void {
  for (const e of G.enemies) if (e.alive && !e.def.dummy) e.takeDamage(e.life + 1, { by: G.player });
}

/** The wave won at once: what's left of it never comes, and what stands dies. */
function clearWave(): void {
  const r = G.run;
  if (r && r.phase === 'fighting') { r.queue.length = 0; r.boss = null; }
  killAll();
}

function refill(): void {
  for (const p of G.players) {
    if (!p.local) continue;
    p.life = p.stats.maxLife;
    p.energy = p.stats.maxEnergy;
    p.cooldowns.clear();
  }
}

// --- the frame's parts, taken out live -----------------------------------------------------------------------------
/** the parts taken out now, each as it was taken (its objects then), to be put back the same */
const taken = new Map<string, ScenePart>();

/** A part's name without the count it's given (`the particles (3)`), which changes as the scene does. */
const partKey = (name: string): string => name.replace(/ \(\d+\)$/, '');

function renderParts(): void {
  const keys = frameParts().filter((p) => partKey(p.name) !== PLAIN && !p.untimed).map((p) => partKey(p.name));
  const labels: Record<string, string> = {
    "half the scene's pixels": 'Full resolution', 'the point lights where they reach': 'Point lights',
    'drawing the shadow maps': 'Shadow maps', 'the particles': 'Particles', 'the hero': 'Hero',
    "what's cut out: leaves, grass": 'Leaves & grass', "what's blended: smoke, glows, effects": 'Smoke & effects',
    "the fires' flames": 'Fire',
  };
  $('.dv-parts').innerHTML = keys.map((k) => `<label class="dv-part" title="${k}"><input type="checkbox" data-part="${k}" checked>${labels[k] ?? k}</label>`).join('');
}

function togglePart(key: string): void {
  const was = taken.get(key);
  if (was) { was.change(true); taken.delete(key); return; }
  const part = frameParts().find((p) => partKey(p.name) === key);
  if (!part) return;
  part.change(false);
  taken.set(key, part);
}

function putPartsBack(): void {
  for (const part of taken.values()) part.change(true);
  taken.clear();
}

// --- what it shows -------------------------------------------------------------------------------------------------
/** The panel's buttons lit as things stand, and its numbers. */
export function refreshPanel(): void {
  if (!panel) return;
  dockPanel();
  const info = G.renderer.info;
  const programs = info.programs?.length ?? 0;
  const state = [
    time.frozen, time.scale, freeCamOn(), freeCamLabels(), cheats.god, cheats.free, G.player.cls.id, perfHudSize(),
    document.body.classList.contains('dev-clean'), [...taken.keys()].join(), input.touchMode, G.mode,
  ].join('|');
  const stats = perfHudStats();
  const number = (n: number | undefined, digits = 1): string => n !== undefined && Number.isFinite(n) ? n.toFixed(digits) : '—';
  const values: Record<string, string> = {
    fps: number(stats?.fps, 0), frame: number(stats?.p50), cpu: number(stats?.cpu, 2), gpu: number(stats?.gpu, 2),
    p95: number(stats?.p95), low: number(stats?.lowFps, 0), draws: String(info.render.calls),
    tris: `${(info.render.triangles / 1000).toFixed(0)}k`, shaders: String(programs), memory: `${info.memory.geometries}/${info.memory.textures}`,
  };
  for (const [key, value] of Object.entries(values)) {
    const el = $(`[data-v=${key}]`);
    if (el.textContent !== value) el.textContent = value;
  }
  $('.dv-fly-speed').textContent = freeCamOn() ? `Flying at ${freeCamSpeed().toFixed(1)} m/s` : '';
  fly.querySelector('.df-speed')!.textContent = `${freeCamSpeed().toFixed(1)} m/s`;
  fly.classList.toggle('touch', input.touchMode);
  refreshScrollCue();
  if (state === shown) return;
  shown = state;
  const lit = (sel: string, on: boolean): void => { panel.querySelector(sel)?.classList.toggle('on', on); };
  lit('[data-act=freeze]', time.frozen);
  lit('[data-act=fly]', freeCamOn());
  lit('[data-act=labels]', freeCamLabels());
  lit('[data-act=clean]', document.body.classList.contains('dev-clean'));
  lit('[data-act=god]', cheats.god);
  lit('[data-act=free]', cheats.free);
  panel.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.classList.toggle('on', !time.frozen && Number(b.dataset.speed) === time.scale));
  panel.querySelectorAll<HTMLElement>('[data-perf]').forEach((b) => b.classList.toggle('on', b.dataset.perf === perfHudSize()));
  panel.querySelectorAll<HTMLElement>('[data-class]').forEach((b) => {
    b.classList.toggle('on', b.dataset.class === G.player.cls.id);
    (b as HTMLButtonElement).disabled = G.mode !== 'menu';
  });
  panel.querySelectorAll<HTMLInputElement>('[data-part]').forEach((b) => { b.checked = !taken.has(b.dataset.part!); });
  $('[data-act=parts]').textContent = taken.size ? 'Check all' : 'Uncheck all';
  fly.querySelector('[data-fly=freeze]')!.classList.toggle('on', time.frozen);
  if (G.player.cls.id !== shownClass) { shownClass = G.player.cls.id; renderGear(); }
}
let shownClass = '';
