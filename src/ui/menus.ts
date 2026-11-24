// The lobby's panels (the inventory: equipment, attributes, skills; with the village's chest, the stash), summary,
// pause and help modals. The village's objects open them (game/village.ts); I opens the inventory anywhere.
import { dialog } from './dialogs';
import { G } from '../state';
import { holdToConfirm, resetHold } from './holdButton';
import { trainingPending } from '../game/training';
import { restartTutorial, startStation, stationDone, stationSteps, tutorialStepDone } from '../game/tutorial';
import { TUTORIAL } from '../data/tutorial';
import { SLOTS, SLOT_INFO } from '../data/items';
import { RUN } from '../data/balance';
import { WAVES } from '../data/waves';
import { CLASSES } from '../data/classes/index';
import { rarityOf, rarityIndex, itemPower, byValue, isTwoHanded, OFFHAND_WEAPON } from '../loot/items';
import { SKILL_KEYS } from '../loot/loadout';
import { equipFromStash, unequip, discard, discardEquipped, resetProfile, slotsFor } from '../loot/profile';
import { throwItem, floorAt } from '../game/groundItems';
import { saveSlot } from '../loot/saveSlots';
import { openSaves } from './saves';
import { bindTooltip, hideTooltip, itemTooltip } from './tooltip';
import { rarityChips } from './hud';
import { photoAllowed } from './photo';
import { skillArt, skillIconHTML } from './skillArt';
import { renderLoadoutEditor, openBook } from './loadoutEditor';
import { itemIconSVG, slotPlaceholderSVG } from './itemIcons';
import { renderAttributes } from './attributes';
import { initStashFilter, renderStashFilter, openStashFilter, sortStash, matchesFilter } from './stashFilter';
import { setVolumes, sfx, volumeSettings, type Volumes } from '../core/audio';
import { isTouch } from './touch';
import { perfHudSize, setPerfHudSize, type PerfHudSize } from './perfHud';
import { netHudEnabled, setNetHud } from './netHud';
import { battleLogEnabled, setBattleLog } from './battleLog';
import { qualitySetting, qualityLevel, resolutionSetting, setQuality, setResolution } from '../core/quality';
import { colourPickerHtml, bindColourPicker, refreshColourPickers } from './colourPicker';
import { framesUncapped, setFramesUncapped } from '../core/frameLoop';
import { readCookie, writeCookie } from '../core/cookies';
import { gearGlow, setGearGlow } from '../core/materials';
import { eyesPortal, setEyesPortal } from '../core/eyesEffects';
import { hdrSettings, hdrStatus, onHdrChange, setHdrSettings, type HdrMode, type HdrStatus } from '../core/hdr';
import { QUALITY, type QualitySetting } from '../data/quality';
import { BIOMES } from '../data/biomes';
import { bestStart, type Bests } from '../game/biome';
import { whenWarm } from '../game/warm';
import { heldHour, holdHour, hourNow } from '../game/clock';
import { READYING } from './readying';
import { isCoop, isGuest, isHost, runsOthersFight } from '../net/role';
import { session, partnerInRun } from '../net/session';

import type { RunSummary } from '../game/run';
import { setTraceConsent, traceConsent, type TraceConsent } from '../perf/consent';
import { playStats, setPlayStats } from '../stats/heartbeat';
import { initProfileTab } from './profileTab';
import { initRecordingTab } from './recordingTab';
import { recorder } from '../perf/recorder';
import { fullScreenChosen, leaveFullScreen } from './autoFullScreen';
import { showBuildStatus } from './buildStatus';
import { overlaysPlaced } from './overlayPlace';
import type { GuideSection } from './guide/index';

import type { Item, Slot, SkillKey } from '../types';

/** Commit and build time, set by vite.config.ts. */
declare const __BUILD__: { ref: string; time: string };

/** querySelector that asserts the element exists (menu markup is static). */
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

export interface MenuHooks {
  start(): void;
  toMenu(): void;
  resume(): void;
  abandon(): void;
  profileChanged(): void;
  /** the hero selection screen opened from the lobby (ui/heroSelect.ts) */
  changeHero(): void;
  /** the summary's button: back to the lobby, or to watching the rest of a co-op run */
  summaryDone(): void;
  /** the battleground or starting wave changed (a co-op host shows its guests) */
  lobbyChanged(): void;
  /** the inventory or the stash opened or put away (`open`: which, or null): the chest's lid follows it */
  panels(open: Panels): void;
  /** the guide opened (ui/guide/), on a section if given, over the pause menu */
  guide(section?: GuideSection): void;
  /** the pause menu's Photo mode (ui/photo.ts) */
  photo(): void;
}

/** What the lobby's panels show: the inventory (equipment, attributes and skills), the stash's chest (the inventory
 *  and the stash beside it), or nothing (the hero walks the village). */
export type Panels = 'inventory' | 'chest' | null;

let hooks: MenuHooks;
const newIds = new Set<string>();
/** Gear given up in the lobby is thrown on the floor, where it can be picked up again. */
const toss = (it: Item | undefined, at?: { x: number; z: number } | null): void => { if (it) throwItem(it, at ?? undefined); };

/** Controls help reflects the current key bindings (or the touch controls, when a finger is the input). */
export function renderControlsHelp(): void {
  if (isTouch()) {
    const rows = [['Left half', 'Drag to move'], ['Big button', 'Attack (hold to keep attacking)'],
      ['Skill buttons', 'Tap: cast at the nearest foe'], ['', 'Drag, then let go: cast where you aim'], ['', 'Hold a channelled skill to keep it going'],
      ['Pinch', 'Zoom'], ['❚❚', 'Pause'], ['Guide', "Every foe, hero and tip: the pause menu's Guide tab"],
      ...(G.mode === 'menu'
        ? [['Use', 'What the hero is near (a tap on it walks him there)'], ['Bag', 'The inventory'], ['Map', "The village's map"]]
        : [['Bank / Continue', 'The buttons after each wave'], ['Revive', 'Hold it by a downed partner (co-op)']])];
    const html = rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
    document.querySelectorAll('.controls-help').forEach((el) => { el.classList.remove('diagrams'); el.innerHTML = html; });
    return;
  }
  // each copy (pause menu, How to play) gets its own SVG ids: a hidden copy's gradients don't paint
  document.querySelectorAll('.controls-help').forEach((el, i) => { el.classList.add('diagrams'); el.innerHTML = keyboardDiagram() + mouseDiagram(`ms${i}`); });
}

/** What a skill key does, for the diagrams: the skill's icon (an element, and its picture if it has one), name and whether it is held. */
function skillOn(k: SkillKey): { icon: string; art?: string; color: string; name: string; hold: boolean } | null {
  const s = G.player.skillAt(k);
  return s ? { icon: skillIconHTML(s.def), art: skillArt(s.def), color: s.def.icon.color, name: s.def.name, hold: !!s.def.channel } : null;
}

/** A control's icon drawn, where no glyph says it (#519): one path in the key's colour, its holes cut by even-odd. */
const drawn = (d: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;
const CONTROL_ICONS = {
  /** View: a camera, its lens a ring round a dot */
  view: drawn('M9 4.5 7.6 7H5a2.5 2.5 0 0 0-2.5 2.5v8A2.5 2.5 0 0 0 5 20h14a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 19 7h-2.6L15 4.5Z'
    + 'M12 9a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0-8.4ZM12 11.2a2 2 0 1 0 0 4a2 2 0 1 0 0-4Z'),
  /** Bank: a chest shut on the spoils, its lock on the front */
  bank: drawn('M3 11V9.5A5.5 5.5 0 0 1 8.5 4h7A5.5 5.5 0 0 1 21 9.5V11ZM3 12.5h18V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19Z'
    + 'M10.5 12.5h3v3.2a1.5 1.5 0 0 1-3 0Z'),
  /** Ping: a map's pin */
  ping: drawn('M12 2.5a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7ZM12 6.8a2.7 2.7 0 1 0 0 5.4a2.7 2.7 0 1 0 0-5.4Z'),
  /** Guide: an open book */
  guide: drawn('M12 6.2C10 4.6 7.3 4 3.5 4.3V18.5c3.6-.3 6.3.3 8.5 1.9 2.2-1.6 4.9-2.2 8.5-1.9V4.3C16.7 4 14 4.6 12 6.2Z'
    + 'M11.2 7.6c-1.8-1.1-3.8-1.6-6.2-1.5v10.6c2.4 0 4.4.5 6.2 1.4ZM12.8 7.6v10.5c1.8-.9 3.8-1.4 6.2-1.4V6.1c-2.4-.1-4.4.4-6.2 1.5Z'),
  /** Use: an open hand (drawn as the others are: the emoji came in the system's own colours, a yellow hand among them) */
  use: drawn('M7 13.6V5.2a1.2 1.2 0 0 1 2.4 0V11h.7V3.7a1.2 1.2 0 0 1 2.4 0V11h.7V4.7a1.2 1.2 0 0 1 2.4 0V11h.7V7.1a1.1 1.1 0 0 1 2.2 0V15.5'
    + 'a6 6 0 0 1-6 6h-1.2c-2 0-3.4-1-4.6-2.8L3.3 13.7a1.35 1.35 0 0 1 2.2-1.55Z'),
};

/**
 * The left of a keyboard, rows staggered like the real thing: the keys the game uses are lit and
 * show what they do (a skill's icon in its colour, or a word), the rest are dim.
 */
function keyboardDiagram(): string {
  // (`icon` a glyph, `skill` a skill's icon element, `art` its picture: the whole key, the labels over it)
  type Cap = { k: string; w?: number; icon?: string; skill?: string; art?: string; color?: string; cap?: string; tip?: string; hold?: boolean };
  const used: Record<string, Omit<Cap, 'k'>> = {
    esc: { cap: 'Pause', tip: 'Pause' },
    w: { icon: '▲', cap: 'Move', tip: 'Move' }, a: { icon: '◀', cap: 'Move', tip: 'Move' },
    s: { icon: '▼', cap: 'Move', tip: 'Move' }, d: { icon: '▶', cap: 'Move', tip: 'Move' },
    v: { icon: CONTROL_ICONS.view, cap: 'View', tip: 'View: top-down, over the shoulder, first person' },
    b: { icon: CONTROL_ICONS.bank, cap: 'Bank', tip: 'Bank after a wave' }, c: { icon: '➜', cap: 'Continue', tip: 'Continue after a wave' },
    e: { icon: '✚', cap: 'Revive', tip: 'Revive a downed partner (co-op), or sit on a seat once the cursor has rested on it 2 s and outlined it, '
      + 'between waves (again to stand up)', hold: true },
    shift: { icon: CONTROL_ICONS.ping, cap: 'Ping', tip: 'Ping the party (co-op), the left one: held, the mark follows the cursor onto a foe or the ground; let go, it pings there', hold: true },
    tab: { icon: '☰', cap: 'Scores', tip: "The party's scores and pings", hold: true },
    alt: { icon: '⇱', cap: 'Cursor', tip: 'A cursor for the HUD over mouse look, the view held still', hold: true },
    g: { icon: CONTROL_ICONS.guide, cap: 'Guide', tip: 'The guide: every foe, boss and hero, and tips' },
    p: { icon: '◉', cap: 'Photo', tip: 'Photo mode: the UI hidden, a free camera and the look set, the shot saved' },
  };
  // (in the village E uses what the hero is near, I and M open the inventory and the map; a run's keys shown still,
  // as the game's: left out there, B and C were missed beside the rules' Bank and Continue)
  if (G.mode === 'menu') {
    Object.assign(used, {
      e: { icon: CONTROL_ICONS.use, cap: 'Use', tip: 'Use what the hero is near (a click on it walks him there)' },
      i: { icon: '⛉', cap: 'Inventory', tip: 'Inventory: equipment, attributes and skills' },
      m: { icon: '⌖', cap: 'Map', tip: "The village's map" },
    });
  }
  for (const k of SKILL_KEYS) {
    if (k.startsWith('mouse')) continue;
    const sk = skillOn(k);
    used[k] = sk ? { skill: sk.icon, art: sk.art, color: sk.color, cap: sk.name, tip: sk.name, hold: sk.hold } : { cap: '—', tip: 'No skill bound' };
  }
  // (as far as I and M, in their places, each row on to the diagram's faded edge: from play, I and M set beside Alt
  // were "not a real keyboard layout")
  const keys = (s: string): Cap[] => s.split('').map((k) => ({ k }));
  const rows: Cap[][] = [
    [{ k: 'esc' }],
    [{ k: '`' }, ...keys('1234567890')],
    [{ k: 'tab', w: 1.5 }, ...keys('qwertyuiop')],
    [{ k: 'caps', w: 1.75 }, ...keys('asdfghjkl')],
    [{ k: 'shift', w: 2.25 }, ...keys('zxcvbnm,.')],
    [{ k: 'ctrl', w: 1.25 }, { k: 'win', w: 1.25 }, { k: 'alt', w: 1.25 }, { k: 'space', w: 6 }],
  ];
  const cap = (c: Cap): string => {
    const u = used[c.k];
    const label = c.k.length > 1 ? c.k[0].toUpperCase() + c.k.slice(1) : c.k.toUpperCase();
    const style = `--w:${c.w ?? 1}${u?.color ? `;--c:${u.color}` : ''}`;
    if (!u) return `<span class="kb-key" style="${style}"><b>${label}</b></span>`;
    return `<span class="kb-key on${u.art ? ' art' : ''}" style="${style}" title="${label}: ${u.tip}${u.hold ? ' (hold)' : ''}"><b>${label}</b>` +
      (u.skill ?? (u.icon ? `<i>${u.icon}</i>` : '')) + `<small>${u.cap}</small>${u.hold ? '<em>hold</em>' : ''}</span>`;
  };
  return `<div class="kb" aria-label="Keyboard controls">${rows.map((r) => `<div class="kb-row">${r.map(cap).join('')}</div>`).join('')}</div>`;
}

/** A mouse with callouts: each button's skill, the wheel (zoom, drag to turn the camera) and aiming. */
function mouseDiagram(id: string): string {
  const btn = (k: SkillKey, side: string): string => {
    const sk = skillOn(k);
    return `<div class="ms-label ${side}" style="--c:${sk?.color ?? 'var(--ink-dim)'}"><span class="ms-what">${side === 'lb' ? 'Left' : 'Right'} click${sk?.hold ? ' <em>hold</em>' : ''}</span>` +
      `<span class="ms-do">${sk ? `${sk.icon}${sk.name}` : '—'}</span></div>`;
  };
  const l = skillOn('mouse0')?.color ?? '#555', r = skillOn('mouse2')?.color ?? '#555';
  return `<div class="ms" aria-label="Mouse controls">
    <svg viewBox="0 0 460 170" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3026"/><stop offset="1" stop-color="#110d0a"/></linearGradient>
        <radialGradient id="${id}-l" cx=".6" cy=".7" r=".9"><stop offset="0" stop-color="${l}" stop-opacity=".75"/><stop offset="1" stop-color="${l}" stop-opacity=".12"/></radialGradient>
        <radialGradient id="${id}-r" cx=".4" cy=".7" r=".9"><stop offset="0" stop-color="${r}" stop-opacity=".75"/><stop offset="1" stop-color="${r}" stop-opacity=".12"/></radialGradient>
      </defs>
      <path d="M230 12 C 196 12 184 36 184 64 L 184 118 C 184 146 204 162 230 162 C 256 162 276 146 276 118 L 276 64 C 276 36 264 12 230 12 Z" fill="url(#${id}-body)" stroke="#a07c46" stroke-width="2"/>
      <path d="M228 14 C 198 16 187 38 186 66 L 228 66 Z" fill="url(#${id}-l)"/>
      <path d="M232 14 C 262 16 273 38 274 66 L 232 66 Z" fill="url(#${id}-r)"/>
      <path d="M185 67 L 275 67 M 230 12 L 230 67" stroke="#a07c46" stroke-width="1.5"/>
      <rect x="224" y="26" width="12" height="26" rx="6" fill="#e2c07e" stroke="#15100a" stroke-width="2"/>
      <path d="M226 33 h8 M226 39 h8 M226 45 h8" stroke="#6a4f2a" stroke-width="1.5"/>
      <g fill="none" stroke="#a07c46" stroke-width="1" stroke-dasharray="3 3">
        <path d="M204 42 L 150 42"/><path d="M256 42 L 310 42"/><path d="M236 50 L 262 100 L 310 100"/><path d="M200 130 L 150 130"/>
      </g>
      <g fill="#e2c07e"><circle cx="204" cy="42" r="3"/><circle cx="256" cy="42" r="3"/><circle cx="236" cy="50" r="3"/><circle cx="200" cy="130" r="3"/></g>
    </svg>
    ${btn('mouse0', 'lb')}${btn('mouse2', 'rb')}
    <div class="ms-label wheel"><span class="ms-what">Wheel</span><span class="ms-do">Scroll to zoom · drag to turn the camera</span></div>
    <div class="ms-label move"><span class="ms-what">Move</span><span class="ms-do">Aim</span></div>
  </div>`;
}

/** The hero selection screen opened from the lobby: before the heroes' programs are warm, once they are, the bar saying
 *  what it readies (the screen shows every hero). */
export const changeHero = whenWarm(['heroes'], () => hooks.changeHero(), READYING.heroes);

export function initMenus(h: MenuHooks): void {
  hooks = h;
  $('#btn-start').onclick = () => { sfx.click(); hooks.start(); };
  $('#btn-summary').onclick = () => { sfx.click(); hooks.summaryDone(); };
  // (a click or a tap anywhere on the summary but its button opens every cache still to open, #734)
  $('#summary').addEventListener('pointerdown', (event) => {
    if (!(event.target as Element).closest('#btn-summary')) revealAllNow();
  });
  $('#btn-resume').onclick = () => { sfx.click(); hooks.resume(); };
  initProfileTab();
  initRecordingTab();
  $('#hero-colour-settings').innerHTML = colourPickerHtml();
  bindColourPicker($('#hero-colour-settings'));
  const built = new Date(__BUILD__.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  $('#pause .build-info').textContent = `Build ${__BUILD__.ref} · ${built}${import.meta.env.DEV ? ' (dev server)' : ''}`;
  // held 2 s, never a click: a stray click or tap lost the run's spoils
  holdToConfirm($('#btn-abandon'), { ms: ABANDON_HOLD_MS, hint: 'Hold to abandon', done: () => { sfx.click(); hooks.abandon(); } });
  document.querySelectorAll<HTMLElement>('[data-pause-tab]').forEach((b) => {
    b.onclick = () => { sfx.click(); choosePauseTab(b.dataset.pauseTab as PauseTab); };
  });
  document.querySelectorAll<HTMLElement>('#opt-traces button').forEach((b) => {
    b.onclick = () => { sfx.click(); setTraceConsent(b.dataset.t as TraceConsent); renderTraceOptions(); };
  });
  $<HTMLInputElement>('#opt-stats').onchange = (e) => setPlayStats((e.target as HTMLInputElement).checked ? 'on' : 'off');
  document.querySelectorAll<HTMLElement>('#opt-perf button').forEach((b) => {
    b.onclick = () => { sfx.click(); setPerfHudSize(b.dataset.perf as PerfHudSize); renderPerfOptions(); };
  });
  $<HTMLInputElement>('#opt-net').onchange = (e) => setNetHud((e.target as HTMLInputElement).checked);
  $<HTMLInputElement>('#opt-blog').onchange = (e) => setBattleLog((e.target as HTMLInputElement).checked);
  // (the slider's first step, under the hours, is Auto: the clock followed again)
  $<HTMLInputElement>('#opt-hour').oninput = (e) => {
    const h = Number((e.target as HTMLInputElement).value);
    holdHour(h < 0 ? null : h);
    renderHourOption();
  };
  document.querySelectorAll<HTMLElement>('#opt-quality button').forEach((b) => {
    b.onclick = () => { sfx.click(); setQuality(b.dataset.q as QualitySetting); renderQualityOptions(); renderGearGlowOptions(); };
  });
  document.querySelectorAll<HTMLElement>('#opt-resolution button').forEach((b) => {
    b.onclick = () => {
      sfx.click();
      setResolution(Number(b.dataset.r));
      recorder.mark(`resolution ${Math.round(resolutionSetting() * 100)}%`);
      renderResolutionOptions();
    };
  });
  renderResolutionOptions();
  document.querySelectorAll<HTMLElement>('#opt-vsync button').forEach((b) => {
    b.onclick = () => { sfx.click(); setFramesUncapped(b.dataset.v === 'off'); renderVsyncOptions(); };
  });
  renderVsyncOptions();
  document.querySelectorAll<HTMLElement>('#opt-gear-glow button').forEach((b) => {
    b.onclick = () => { sfx.click(); setGearGlow(b.dataset.g === 'on'); renderGearGlowOptions(); };
  });
  renderGearGlowOptions();
  document.querySelectorAll<HTMLElement>('#opt-eyes-portal button').forEach((b) => {
    b.onclick = () => { sfx.click(); setEyesPortal(b.dataset.g === 'on'); renderEyesPortalOptions(); };
  });
  renderEyesPortalOptions();
  document.querySelectorAll<HTMLElement>('#opt-hdr button').forEach((b) => {
    b.onclick = () => { sfx.click(); setHdrSettings({ mode: b.dataset.hdr as HdrMode }); renderHdrOptions(); };
  });
  $<HTMLInputElement>('#opt-hdr-paper').oninput = (e) => { setHdrSettings({ paper: Number((e.target as HTMLInputElement).value) }); renderHdrOptions(); };
  $<HTMLInputElement>('#opt-hdr-peak').oninput = (e) => { setHdrSettings({ peak: Number((e.target as HTMLInputElement).value) }); renderHdrOptions(); };
  // (it starts, stops or fails on its own: a window moved to another monitor, the WebGPU device lost)
  onHdrChange(renderHdrOptions);
  initVolumeOptions();
  const waves = $('#opt-wave');
  waves.querySelectorAll<HTMLElement>('button').forEach((b) => {
    b.onclick = () => { sfx.click(); stepWave(Number(b.dataset.d)); };
  });
  waves.addEventListener('wheel', (e) => { e.preventDefault(); stepWave(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  // short screens: the rail picks the one panel of the inventory shown
  const menu = $('#menu');
  const pickTab = (t: string) => {
    menu.dataset.tab = t;
    document.querySelectorAll<HTMLElement>('#lobby-rail [data-lt]').forEach((b) => b.classList.toggle('active', b.dataset.lt === t));
  };
  document.querySelectorAll<HTMLElement>('#lobby-rail [data-lt]').forEach((b) => {
    b.onclick = () => {
      sfx.click();
      pickTab(b.dataset.lt!);
    };
  });
  $('#rail-close').onclick = () => { sfx.click(); openPanels(null); };
  // fullscreen: the browser's bars take a lot of a phone's screen
  const fs = $('#btn-fullscreen');
  const syncFs = () => { fs.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; };
  fs.classList.toggle('hidden', !document.fullscreenEnabled);
  fs.onclick = () => {
    sfx.click();
    if (!document.fullscreenElement) fullScreenChosen();
    if (document.fullscreenElement) leaveFullScreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  };
  document.addEventListener('fullscreenchange', syncFs);
  syncFs();
  $('#btn-photo').onclick = () => { sfx.click(); hooks.photo(); };
  $('#btn-help-close').onclick = () => $('#help').classList.add('hidden');
  // (the guide's doors: How to play's and the pause menu's Guide tab; G anywhere, main.ts)
  $('#btn-help-guide').onclick = () => { sfx.click(); hideHelp(); hooks.guide(); };
  document.querySelectorAll<HTMLElement>('[data-guide-open]').forEach((b) => {
    b.onclick = () => { sfx.click(); hooks.guide(b.dataset.guideOpen as GuideSection); };
  });
  $('#btn-reset').onclick = () => {
    const name = CLASSES[G.profile.classId].name;
    if (!confirm(`Reset the ${name} of save slot ${saveSlot()}? Their stash, equipment and records will be erased (other classes and slots keep theirs).`)) return;
    G.profile = resetProfile(G.profile.classId);
    hooks.profileChanged();
    renderMenu();
  };
  document.querySelectorAll<HTMLElement>('.menu-right .tab').forEach((tab) => {
    tab.onclick = () => {
      sfx.click();
      document.querySelectorAll('.menu-right .tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll<HTMLElement>('.menu-right .tab-page').forEach((pg) => pg.classList.toggle('off', pg.dataset.page !== tab.dataset.tab));
    };
  });
  initStashFilter(renderMenu);
  const stash = $('#stash');
  stash.addEventListener('contextmenu', (e) => e.preventDefault());
  stash.addEventListener('dragover', (e) => { if (drag?.from === 'equip') e.preventDefault(); });
  stash.addEventListener('drop', (e) => {
    e.preventDefault();
    if (drag?.from === 'equip') { unequip(G.profile, drag.slot); sfx.click(); endDrag(); changed(); }
  });
  // an item dragged out of the panels onto the game field is thrown on the floor
  const field = (t: EventTarget | null): boolean => t === G.renderer.domElement;
  document.addEventListener('dragover', (e) => { if (drag && field(e.target)) { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; } });
  document.addEventListener('drop', (e) => {
    if (!drag || !field(e.target)) return;
    e.preventDefault();
    const { from, item } = drag;
    newIds.delete(item.id);
    // it lands where it was let go (within a throw)
    toss(from === 'stash' ? discard(G.profile, item.id) : discardEquipped(G.profile, drag.slot), floorAt(e.clientX, e.clientY));
    sfx.salvage();
    endDrag();
    changed();
  });
  // holding Shift in the sanctuary marks the stash items: Shift-click throws one on the floor
  const setShift = (on: boolean): void => { if (on !== shiftHeld) { shiftHeld = on; syncDiscard(); } };
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') setShift(true); });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') setShift(false); });
  window.addEventListener('blur', () => setShift(false));
}

/**
 * The lobby's panels laid out under the loading screen before their content (`showMenu`'s render, which needs the
 * hero), at the boot's start: their first raster builds Skia's programs on the GPU process's main thread one after
 * another (a first visit's 86, 1.2 s), and shown with the hero, the lobby's warm-up waited behind it. Rastered while
 * he is built, it's done by then. Laid out open (the village keeps them stowed till I or the chest opens them, and
 * stowed they'd raster first there, mid-walk); `showMenu` stows them.
 */
export function layOutMenuAhead(): void {
  const menu = $('#menu');
  menu.classList.remove('hidden', 'stowed');
  // (the chest's, the stash beside the rest: first rastered at the chest, a first visit's held Chrome 1.3 s there;
  // over the loading screen unseen, as the village's map is, as under it Chrome rasters them and draws nothing, and
  // their slide in was drawn first at the chest, 0.66 s)
  menu.dataset.open = 'chest';
  menu.classList.add('ahead');
}

/** The panels laid out ahead slid away (`away`) or back, so their slide is drawn under the loading screen too. */
export function slideMenuAhead(away: boolean): void { $('#menu').classList.toggle('stowed', away); }

/** how long the chest's rehearsal lets its panels fade in, frames drawn throughout (ms: their transition's .35 s) */
const CHEST_FADE_MS = 400;

/**
 * The panels opened as the chest's under the loading screen, as the lobby has them at its entry (the hero's gear in
 * them, a hidden menu shown, the minimap put away as the chest puts it), and faded in, then put back as they were,
 * while the boot sees the loading screen through (`seeThroughLoading` in `loading.ts`), so Chrome draws them onto
 * the screen as the chest's opening will: over it in a faded layer (`.ahead`), their fade was drawn into that
 * layer's pass, and the chest's first opening still built a compositor's program for the screen's own, 0.4 to 0.9 s
 * of a first visit's GPU process (`npm run stalls -- --scenario walks --stops yard,heroes,stash`). Each look is held
 * till Chrome has drawn it (`drawn`: put back after a frame of the page's, behind the boot's compiles on the GPU's
 * process, it was drawn in some boots and not others, and the chest held 0.12 to 0.5 s in most walks).
 */
export async function rehearseChest(drawn: () => Promise<void>): Promise<void> {
  const menu = $('#menu');
  const was = { classes: menu.className, open: menu.dataset.open };
  const minimap = $('#minimap-wrap');
  const minimapWas = minimap.classList.contains('hidden');
  minimap.classList.add('hidden');
  // (the HUD as the square has it: the boot's practice showed the bar, its shadow a pass of its own)
  const hud = $('#hud');
  const practiceWas = hud.classList.contains('practice');
  hud.classList.remove('practice');
  menu.classList.remove('hidden', 'ahead');
  menu.classList.add('stowed');
  menu.dataset.open = 'chest';
  await drawn();
  menu.classList.remove('stowed');
  await new Promise((done) => setTimeout(done, CHEST_FADE_MS));
  await drawn();
  menu.className = was.classes;
  if (was.open === undefined) delete menu.dataset.open;
  else menu.dataset.open = was.open;
  minimap.classList.toggle('hidden', minimapWas);
  hud.classList.toggle('practice', practiceWas);
}

export function showMenu(v: boolean): void {
  $('#menu').classList.remove('ahead');
  $('#menu').classList.toggle('hidden', !v);
  if (v) { toggleMenuStowed(true); openBook(false); renderMenu(); }
  else openSaves(false);   // a co-op host can start the run while the save slots are open
  syncDiscard();
}

/** How to play (the notice board's, whose `board` offers the training again, or the pause menu's link). */
export function showHelp(board = false): void {
  renderControlsHelp();
  renderTour(board);
  $('#help').classList.remove('hidden');
}

/** The tutorial on the notice board (`board`; game/tutorial.ts): its stations above the controls, each with how far it
 *  was walked, and one button at the foot beside Got it, where the first visit's Restart training stood: Start the
 *  tutorial, Go on with it from the first station not walked, or Walk it again from the start once every one is done.
 *  From review: "remove one of the Start/Restart buttons, showing 2 at the same time is lame" (a button at the top, a
 *  link for each station and Restart training at the foot had all started something). */
function renderTour(board: boolean): void {
  const tour = $('.help-tour'), go = $('#btn-tour');
  tour.classList.toggle('hidden', !board);
  go.classList.toggle('hidden', !board);
  if (!board) return;
  const next = TUTORIAL.find((s) => !stationDone(s.id));
  go.textContent = !next ? 'Walk it again' : next === TUTORIAL[0] && !TUTORIAL[0].steps.some((t) => tutorialStepDone(t.id))
    ? 'Start the tutorial' : 'Go on with the tutorial';
  go.onclick = () => {
    sfx.click();
    if (next) startStation(next.id);
    else restartTutorial();
    hideHelp();
  };
  $('.ht-stations', tour).replaceChildren(...TUTORIAL.map((s) => {
    const steps = stationSteps(s), walked = steps.filter((t) => tutorialStepDone(t.id)).length;
    const row = document.createElement('div');
    row.className = 'ht-station';
    row.classList.toggle('done', walked === steps.length);
    const name = document.createElement('b'), state = document.createElement('i');
    name.textContent = s.name;
    // (what it covers said on hover: the row has room for its name alone)
    row.title = s.covers;
    state.textContent = walked === steps.length ? 'Done' : walked ? `${walked} of ${steps.length}` : '';
    row.append(name, state);
    return row;
  }));
}

/** How to play laid out under the loading screen (`on`) and put away (not), so its first raster builds Chrome's Skia
 *  programs there: 13 of them as the notice board was first used, held a first visit's GPU process 0.24 s. */
export function layOutHelpAhead(on: boolean): void {
  if (on) showHelp(true);
  else hideHelp();
}

/** Whether how to play is up. */
export const helpOpen = (): boolean => !$('#help').classList.contains('hidden');
dialog({ open: () => helpOpen(), close: () => hideHelp() });

/** How to play put away. */
export function hideHelp(): void { $('#help').classList.add('hidden'); }

/** What the lobby's panels show now (`Panels`). */
export function panelsOpen(): Panels {
  const menu = $('#menu');
  if (menu.classList.contains('hidden') || menu.classList.contains('stowed')) return null;
  return menu.dataset.open === 'chest' ? 'chest' : 'inventory';
}

/** The inventory or the stash's chest shown, or nothing (`open` null: the hero walks the village). The inventory is
 *  the hero's equipment, attributes and skills; the chest's adds the stash beside them. */
export function openPanels(open: Panels): void {
  const menu = $('#menu');
  const was = panelsOpen();
  menu.classList.toggle('stowed', open === null);
  // (unseen, its panels take no click, key or focus: hidden by opacity alone, a button is still clicked where it
  // lies, and a focused one pressed by Space or Enter. The village's card shows while they're stowed.)
  const unseen = open === null;
  for (const panel of menu.querySelectorAll<HTMLElement>('.panel:not(#lobby-rail):not(#vcard)')) {
    panel.inert = unseen;
  }
  if (open) menu.dataset.open = open;
  focusSlot(null);
  hideTooltip();
  if (open !== 'chest') openStashFilter(false);
  if (!open) { endDrag(); openBook(false); }
  // (a short screen opens on the gear, the stash's or the equipment's)
  if (open && !was) $<HTMLElement>('#lobby-rail [data-lt="gear"]').click();
  syncDiscard();
  if (open !== was) hooks.panels(open);
}

/** Whether the lobby's panels are stowed: the hero walks the village. */
export const menuStowed = (): boolean => $('#menu').classList.contains('stowed');

/** Whether the lobby is practice, as a run is: its panels all out of the way (in the yard, its dummies to practise on:
 *  game/village.ts). */
export function lobbyPractice(): boolean {
  if ($('#menu').classList.contains('hidden')) return false;
  return menuStowed();
}

/** The panels put away (`stowed`), or shown (the inventory); with no argument, the one or the other. */
export function toggleMenuStowed(stowed?: boolean): void {
  openPanels((stowed ?? !menuStowed()) ? null : 'inventory');
}
// Short screens and upright tablets show one lobby panel at a time over the scene; the view moves
// so the character stands in the free space beside it (or below it, upright).
const onePanel = matchMedia('(max-height: 520px), (orientation: portrait) and (max-width: 1000px)');

export function lobbyViewShift(): { x: number; y: number } {
  const menu = $('#menu');
  if (!onePanel.matches || menu.classList.contains('hidden') || menu.classList.contains('stowed')) return { x: 0, y: 0 };
  const panel = [...menu.querySelectorAll<HTMLElement>('.menu-center, .menu-right')].find((p) => p.offsetParent);
  if (!panel) return { x: 0, y: 0 };
  const r = panel.getBoundingClientRect();
  return window.innerWidth > window.innerHeight ? { x: r.right / 2, y: 0 } : { x: 0, y: r.bottom / 2 };
}

/** Where the lobby's panels leave the window's top left corner free (css px; 0, 0 with the lobby out of the way or
 *  its panels at the right and the foot): right of the one panel shown on a short screen, or under it on an upright
 *  one. As drawn, so it follows a panel as it slides. */
function lobbyClearance(): { x: number; y: number } {
  const menu = $('#menu');
  if (menu.classList.contains('hidden') || menu.classList.contains('stowed') || !onePanel.matches) return { x: 0, y: 0 };
  const panel = [...menu.querySelectorAll<HTMLElement>('#lobby-rail, .menu-center, .menu-right')].filter((p) => p.offsetParent).pop();
  if (!panel) return { x: 0, y: 0 };
  const r = panel.getBoundingClientRect();
  return window.innerWidth > window.innerHeight ? { x: r.right, y: 0 } : { x: 0, y: r.bottom };
}

/** where the overlays down the left were last put clear of the lobby (`#diag`'s `--clear-x`, `--clear-y`) */
let overlaysClear = '';
/** The lobby's clearance as it rests, by the way it's laid out (`restKey`), and the last one read as it was drawn:
 *  its way, and the frames it has read the same (`STILL_FRAMES` of them, it's resting: a slide's first frames may
 *  read where it starts). Forgotten whenever a panel's size changes (its content, the UI's scale, the fonts loaded:
 *  a tall screen's panel puts the overlays under its bottom). */
const restingClearance = new Map<string, { x: number; y: number }>();
let lastRead: { key: string; x: number; y: number; still: number } | null = null;
const STILL_FRAMES = 12;
const panelsResized = new ResizeObserver(() => restingClearance.clear());
let panelsWatched = false;

/** What places the lobby's panels where they rest: the window, and a short screen's panel shown. */
function restKey(): string {
  const shown = onePanel.matches ? $('#menu').dataset.tab : 'side by side';
  return `${innerWidth}x${innerHeight} ${shown}`;
}

/** the room the run's party frames leave the overlays, read for the way they're laid out (`key`): read again only as
 *  that changes or the frames' box does, not every frame (the HUD's text changes every frame, and a box read then
 *  lays the page out) */
let partyRoom: { key: string; y: number } | null = null;
const partyResized = new ResizeObserver(() => { partyRoom = null; });
let partyWatched = false;
/** the gap left between the party frames and the overlays under them (css px) */
const PARTY_GAP = 6;

/**
 * How far down the overlays go to stand under the run's party frames (css px; 0 with none shown): they stand in the
 * same top left corner, and the performance overlay lay over a partner's frame (#492).
 */
function partyClearance(): number {
  const party = document.querySelector<HTMLElement>('#party');
  if (!party) return 0;
  if (!partyWatched) {
    partyWatched = true;
    partyResized.observe(party);
  }
  const key = `${innerWidth}x${innerHeight} ${$('#hud').className} ${document.body.className} ${party.childElementCount}`;
  if (partyRoom?.key === key) return partyRoom.y;
  const box = party.getBoundingClientRect();
  let y = 0;
  if (party.offsetParent && box.height > 0) {
    const top = parseFloat(getComputedStyle($('#diag')).top) || 0;
    y = Math.max(0, box.bottom + PARTY_GAP - top);
  }
  partyRoom = { key, y };
  return y;
}

/** The lobby's clearance (`lobbyClearance`) read from the page as drawn until it rests in a way it's laid out, and
 *  from then on remembered: read every frame, it forced a layout every frame the panels slid. With the lobby out of the way, the run's party frames' (`partyClearance`). */
function clearance(): { x: number; y: number } {
  const menu = $('#menu');
  if (menu.classList.contains('hidden') || menu.classList.contains('stowed')) return { x: 0, y: partyClearance() };
  if (!panelsWatched) {
    panelsWatched = true;
    menu.querySelectorAll('#lobby-rail, .menu-center, .menu-right').forEach((el) => panelsResized.observe(el));
  }
  const key = restKey();
  const rested = restingClearance.get(key);
  if (rested) return rested;
  const drawn = lobbyClearance();
  const same = lastRead?.key === key && lastRead.x === drawn.x && lastRead.y === drawn.y;
  lastRead = { key, ...drawn, still: same ? lastRead!.still + 1 : 0 };
  if (lastRead.still >= STILL_FRAMES) restingClearance.set(key, drawn);
  return drawn;
}

/** The overlays down the left (performance, network, the battle log) kept clear of the lobby's panels and the run's
 *  party frames, once a frame while any is shown: they lay over a panel, and over a partner's frame. */
export function clearOverlays(): void {
  const diag = $('#diag'), chat = document.querySelector<HTMLElement>('#chat');
  const chatShown = !!chat && !chat.classList.contains('hidden');
  if (!chatShown && ![...diag.children].some((overlay) => !overlay.classList.contains('hidden'))) return;
  const lobby = clearance();
  // (the co-op chat in the bottom left corner, right of a short screen's panel: ui/chat.ts)
  const chatX = `${Math.round(lobby.x)}px`;
  if (chat && chat.style.getPropertyValue('--clear-x') !== chatX) chat.style.setProperty('--clear-x', chatX);
  // (on touch, where the player put them with a finger, with the lobby's panels out of the way: `overlayPlace.ts`)
  const menu = $('#menu');
  const free = menu.classList.contains('hidden') || menu.classList.contains('stowed');
  const { x, y } = (free && isTouch() && overlaysPlaced()) || lobby;
  const clear = `${Math.round(x)},${Math.round(y)}`;
  if (clear === overlaysClear) return;
  overlaysClear = clear;
  diag.style.setProperty('--clear-x', `${Math.round(x)}px`);
  diag.style.setProperty('--clear-y', `${Math.round(y)}px`);
}

export function markNew(items: Item[]): void { for (const it of items) newIds.add(it.id); }

/** The portal's card: its battleground's starting wave and its way in (a co-op guest sees the host's, and its way in
 *  waits for it). */
export function renderLobbyOptions(): void { renderStart(); renderWaveOptions(); }

function renderStart(): void {
  // a co-op host waits for a partner still finishing a run; a guest, for the host
  const guest = isGuest(), grounds = trainingSelected();
  const start = $<HTMLButtonElement>('#btn-start');
  const busy = !guest && isHost() && partnerInRun();
  start.disabled = guest || busy;
  const host = guest && session.biome ? ` (the host chose ${BIOMES[session.biome].title})` : '';
  start.textContent = guest ? (partnerInRun() ? 'The host is in a run' : `The host starts the run${host}`)
    : busy ? 'Your partner is still in a run' : grounds ? 'Enter the Training Grounds' : `Enter ${BIOMES[G.arena.biome].title}`;
  start.title = grounds ? 'Replay any wave reached. No damage, loot, score or progress.' : '';
  // (the ghost's card picks the battleground; a portal's is its own)
  const biome = guest ? session.biome : G.arena.biome;
  document.querySelectorAll<HTMLButtonElement>('#opt-biome button').forEach((b) => {
    b.classList.toggle('active', b.dataset.b === biome);
    b.disabled = guest;
  });
  // (a first visit's training unfinished: a portal's card warns, offers to skip it, and lets no one in until then; the
  // training grounds stake nothing, so the ghost lets him in)
  const training = !guest && !grounds && trainingPending();
  start.classList.toggle('hidden', training);
  $('#vcard .vc-training').classList.toggle('hidden', !training);
}

// The training grounds (the ghost by the village's yard, game/village.ts): a wave reached replayed with nothing at
// stake. A co-op guest's is the host's.
let grounds = false;
export const trainingSelected = (): boolean => isGuest() ? session.training : grounds;
/** The training grounds chosen (the ghost's card) or not (a portal's). */
export function selectTraining(on: boolean): void {
  if (on === grounds || isGuest()) return;
  grounds = on;
  renderLobbyOptions();
  hooks.lobbyChanged();
}

// Starting wave: any wave up to the best one cleared and banked in the portal's biome (in the training grounds, the
// best reached), defaulting to that best and jumping back to it when the biome or best changes. « and » go to the
// first and the best (a step of ±1000, clamped).
let startWave = 1, maxWave = 1, seen = '';
export const selectedWave = (): number => startWave;
/** The hero's best wave in each battleground, as the mode chosen counts them: banked, or in the training grounds reached. */
const startBests = (): Bests => trainingSelected() ? G.profile.records.bestReached : G.profile.records.bestBanked;
/** the last start the developer mode offers whatever was banked (`offerStartsUpTo`; 0 in play: src/dev alone sets it) */
let devStarts = 0;
/** The developer mode's (PR previews and dev builds): any start up to `wave` offered, the hero's best still the default. */
export function offerStartsUpTo(wave: number): void {
  devStarts = wave;
  renderWaveOptions();
}

function stepWave(d: number): void {
  if (isGuest()) return;   // the host picks
  const w = Math.min(Math.max(startWave + d, 1), maxWave);
  if (w !== startWave) { startWave = w; renderWaveOptions(); hooks.lobbyChanged(); }
}

function renderWaveOptions(): void {
  // (a portal is its biome's)
  const s = G.arena.biome, grounds = trainingSelected();
  const bests = startBests();
  const best = bestStart(bests, s);
  const key = `${G.profile.classId}:${grounds}:${s}:${best}:${devStarts}`;
  if (key !== seen) { seen = key; startWave = best; maxWave = Math.max(best, devStarts); }
  // a co-op guest plays the host's choice
  const guest = isGuest(), wave = guest ? session.wave : startWave;
  const box = $('#opt-wave');
  $('.wv-val', box).innerHTML = `Wave ${wave}${wave % WAVES.bossEvery === 0 ? ' <small>Boss</small>' : ''}`;
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => { b.disabled = guest || (Number(b.dataset.d) < 0 ? startWave <= 1 : startWave >= maxWave); });
}

export function renderMenu(): void {
  const p = G.profile;
  renderStart();
  renderWaveOptions();
  const cls = CLASSES[p.classId];
  $('.lo-title').textContent = cls.book;
  document.querySelectorAll<HTMLElement>('#equip .doll').forEach((d) => d.classList.toggle('hidden', d.dataset.class !== cls.id));

  $('#btn-saves').textContent = `Save slot ${saveSlot()}`;
  const r = p.records;
  const rec = (icon: string, value: string | number, label: string) =>
    `<div class="rec"><span class="rec-icon">${icon}</span><span class="rec-val">${value}</span><span class="rec-label">${label}</span></div>`;
  $('.records').innerHTML = rec('⚔', r.bestWave, 'Best wave') + rec('✦', r.bestScore.toLocaleString(), 'Best score')
    + rec('⟳', r.runs, 'Runs') + rec(CONTROL_ICONS.bank, r.banked, 'Items banked');

  // equipment
  focusSlot(null); // hovered nodes are about to be replaced
  const eq = $('#equip');
  eq.querySelectorAll('.eslot').forEach((n) => n.remove()); // keep the silhouette svg
  for (const slot of SLOTS) {
    const it = p.equipped[slot];
    const d = document.createElement('div');
    d.className = 'eslot' + (it ? '' : ' empty');
    d.dataset.slot = slot;
    // a slot takes the items that fit it (a one-handed weapon also fits a dual-wielder's off-hand)
    const fits = (): boolean => drag?.from === 'stash' && slotsFor(p, drag.item).includes(slot);
    d.addEventListener('dragover', (e) => { if (fits()) { e.preventDefault(); d.classList.add('over'); } });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', (e) => {
      e.preventDefault();
      if (drag && fits()) { newIds.delete(drag.item.id); equipFromStash(p, drag.item.id, slot); sfx.click(); endDrag(); changed(); }
    });
    const color = it ? rarityOf(it.rarity).color : '#666';
    d.style.boxShadow = `inset 0 0 0 1px ${it ? color : 'rgba(160,124,70,.5)'}`;
    d.style.setProperty('--c', color);
    // an icon only: the slot's name and the item's are in the tooltips
    const label = SLOT_INFO[slot].label;
    d.innerHTML = (it ? itemIconSVG(it) : slotPlaceholderSVG(slot, cls)) + GLOW;
    d.setAttribute('aria-label', `${label}: ${it ? it.name : 'empty'}`);
    bindSlotFocus(d, slot);
    // the off-hand of a two-hander: locked, and the tooltip says why
    const main = p.equipped.weapon;
    const locked = slot === 'offhand' && !it && !!main && isTwoHanded(main, cls);
    if (locked) {
      d.classList.add('locked');
      d.innerHTML += LOCK;
      d.setAttribute('aria-label', `${label}: locked, both hands are on the ${main!.name}`);
      const swaps = !cls.excludeSlots?.includes('offhand');
      bindTooltip(d, () => lockedTooltip(main!, swaps));
    } else if (!it) bindTooltip(d, () => ({ html: `<div class="tt-card empty"><div class="tt-name">${label}</div><div class="tt-type">Empty</div></div>`, color: '#666' }));
    else {
      // a weapon in the off-hand: its damage (the implicit) counts for less
      // (taken off at the chest alone, where the stash is: by I a click sent it there from anywhere, from play,
      // "clicking an item on character in I mode teleports it to stash")
      const atStash = () => panelsOpen() !== 'inventory';
      const how = () => (atStash() ? 'Click or drag to the stash to unequip · ' : 'Unequip at the stash · ')
        + 'drag it onto the floor to throw it there';
      bindTooltip(d, () => ({ ...itemTooltip(it, false)(), foot: slot === 'offhand' && it.slot === 'weapon'
        ? `In the off-hand its damage bonus (the implicit) counts at ${OFFHAND_WEAPON * 100}%<br>${how()}` : how() }));
      const doUnequip = () => {
        if (!atStash()) return;
        unequip(p, slot);
        hideTooltip();
        sfx.click();
        changed();
      };
      d.onclick = () => {
        if (!isTouch()) { doUnequip(); return; }
        if (longPressClick()) return;
        openItemSheet(it, false, 'Unequip', atStash() && p.stash.length < RUN.bagLimit ? doUnequip : null, () => { toss(discardEquipped(p, slot)); newIds.delete(it.id); sfx.salvage(); changed(); });
      };
      // (a long press is a context menu on Android: on touch it lights the slot's items, and unequips nothing)
      d.oncontextmenu = (e) => { e.preventDefault(); if (!isTouch()) doUnequip(); };
      makeDraggable(d, { from: 'equip', item: it, slot });
    }
    eq.appendChild(d);
  }

  // stats
  G.player.recomputeStats(p.equipped);
  renderAttributes($('#stats'));

  // stash (sorted: rarity desc, then power; the stat filter moves its matches first)
  $('#stash-count').textContent = `(${p.stash.length}/${RUN.bagLimit})`;
  renderStashFilter();
  const st = $('#stash');
  st.innerHTML = '';
  const sorted = sortStash(p.stash);
  for (const it of sorted) {
    const d = document.createElement('div');
    const color = rarityOf(it.rarity).color;
    const eqd = p.equipped[it.slot];
    d.className = 'sitem' + (newIds.has(it.id) ? ' new' : '') + (!eqd || itemPower(it) > itemPower(eqd) ? ' up' : '')
      + (matchesFilter(it) ? '' : ' filtered');
    d.style.setProperty('--c', color);
    d.style.color = color;
    d.dataset.slot = it.slot;
    d.innerHTML = itemIconSVG(it) + GLOW;
    bindSlotFocus(d, it.slot);
    bindTooltip(d, () => ({ ...itemTooltip(it)(), foot: 'Right-click or drag to equip · Shift-click, or drag it onto the floor, to throw it there' }));
    const equip = () => { newIds.delete(it.id); equipFromStash(p, it.id); hideTooltip(); sfx.click(); changed(); };
    d.onclick = (e) => {
      if (longPressClick()) return;
      if (isTouch()) { openItemSheet(it, true, 'Equip', equip, () => { newIds.delete(it.id); toss(discard(p, it.id)); sfx.salvage(); changed(); }); return; }
      if (!e.shiftKey) { equip(); return; }
      newIds.delete(it.id);
      toss(discard(p, it.id));
      hideTooltip();
      sfx.salvage();
      changed();
    };
    d.oncontextmenu = (e) => { e.preventDefault(); if (!isTouch()) equip(); };
    makeDraggable(d, { from: 'stash', item: it, slot: it.slot });
    st.appendChild(d);
  }
  for (let i = sorted.length; i < RUN.bagLimit; i++) {
    const d = document.createElement('div');
    d.className = 'sitem';
    d.style.cursor = 'var(--cursor)';
    st.appendChild(d);
  }

  renderLoadoutEditor();
}

// --- touch: a tapped item opens a sheet with its card and what can be done with it ----
function openItemSheet(it: Item, compare: boolean, label: string, act: (() => void) | null, dropIt: () => void): void {
  hideTooltip();
  const box = $('#item-sheet');
  const close = () => box.classList.add('hidden');
  $('.is-card', box).innerHTML = itemTooltip(it, compare)().html;
  const a = $<HTMLButtonElement>('.is-a', box);
  a.textContent = act ? label : `${label} (stash full)`;
  a.className = 'btn primary is-a';
  a.disabled = !act;
  a.onclick = () => { close(); act?.(); };
  $('.is-salvage', box).onclick = () => { close(); dropIt(); };
  $('.is-close', box).onclick = () => { sfx.click(); close(); };
  box.onclick = (e) => { if (e.target === box) close(); };
  box.classList.remove('hidden');
}

// --- slot focus -------------------------------------------------------------------
// Hovering an equipment slot lights up every stash item that fits it (and dims the
// rest); hovering a stash item lights up the slot it goes into.
// (its pulse, arc and sheen each a layer the compositor moves: styles/_items.scss)
const GLOW = '<span class="slot-glow"><span class="glow-steady"></span><span class="glow-bright"></span>'
  + '<span class="glow-arc"><span></span></span><span class="glow-sheen"><span></span></span></span>';
/** a padlock over the off-hand while a two-handed weapon takes both hands */
export const LOCK = '<svg class="slot-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" '
  + 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  + '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/>'
  + '<circle cx="12" cy="15.2" r="1.6" fill="#141214"/><rect x="11.2" y="15.5" width="1.6" height="3" fill="#141214"/></svg>';

/** The off-hand's tooltip while the two-handed `weapon` takes both hands (`swaps`: the class has off-hands to equip). */
export function lockedTooltip(weapon: Item, swaps: boolean): { html: string; color: string; foot?: string } {
  const html = '<div class="tt-card empty"><div class="tt-name">Off-hand</div><div class="tt-type">Locked</div>'
    + `<div class="tt-desc">Both hands are on the two-handed ${weapon.name}.</div></div>`;
  return { html, color: '#666', foot: swaps ? 'Equipping an off-hand puts the two-hander back in the stash' : undefined };
}

/** how long the pointer rests on an item before the others that fit its slot light up (ms; the item itself is lit at
 *  once, and they all go out the moment it leaves): run across the stash, only the item under it lights. Each change
 *  of focus restyles the items whose look changes, and with every change at once moving between items fast halved
 *  the frames (tools/stalls `--scenario sweep --item-ms 100`). */
export const FOCUS_DELAY_MS = 200;
let focused: Slot | null = null;
let focal: HTMLElement | null = null;
let pending: ReturnType<typeof setTimeout> | undefined;

/** Lights `el`, the item under the pointer, and runs the glow's loops on it (`.focal`); null puts it out. */
function markFocal(el: HTMLElement | null): void {
  if (focal === el) return;
  focal?.classList.remove('focal');
  el?.classList.add('focal');
  focal = el;
}

/** Lights the items that fit `slot` and dims the rest, changing only the items that differ; null puts them all back as
 *  they were, the item under the pointer too. Now, whatever was waiting. */
function focusSlot(slot: Slot | null): void {
  clearTimeout(pending);
  if (slot === null) markFocal(null);
  if (slot === focused) return;
  focused = slot;
  const menu = $('#menu');
  menu.classList.toggle('slot-focus', slot !== null);
  menu.querySelectorAll<HTMLElement>('.sitem, .eslot').forEach((n) => n.classList.toggle('match', n.dataset.slot === slot));
}

/** The pointer on `el`: it lit at once, the others that fit `slot` once it has rested `FOCUS_DELAY_MS`. */
function pointAt(el: HTMLElement, slot: Slot): void {
  markFocal(el);
  clearTimeout(pending);
  pending = setTimeout(() => focusSlot(slot), FOCUS_DELAY_MS);
}

/** whether the finger's last press on an item rested `FOCUS_DELAY_MS` (a long press: it lights, and opens no sheet) */
let pressedLong = false;

/** A finger down on `el`: the light of another slot put out, `el` lit at once and the others that fit `slot` once it
 *  has rested `FOCUS_DELAY_MS` (a long press). */
function pressAt(el: HTMLElement, slot: Slot): void {
  if (focused !== slot) focusSlot(null);
  markFocal(el);
  clearTimeout(pending);
  pressedLong = false;
  pending = setTimeout(() => {
    pressedLong = true;
    focusSlot(slot);
  }, FOCUS_DELAY_MS);
}

/** The finger lifted from an item of `slot`: a long press's light stays till the next tap; a tap's never comes. */
function liftFrom(slot: Slot): void {
  if (pressedLong) return;
  clearTimeout(pending);
  if (focused !== slot) markFocal(null);
}

/** Whether a click on an item ends a long press, which lights its slot's items alone: the browser clicks after one
 *  too (on a stash item, its sheet opened with the light). Its card, which the tap's tooltip pinned, is put away. */
function longPressClick(): boolean {
  if (!isTouch() || !pressedLong) return false;
  hideTooltip();
  return true;
}

// On touch the light stays once the finger lifts (it went out with it, a moment after it came): a tap on a lit item
// keeps it, its sheet's buttons too; a tap anywhere else puts it out, and so does equipping (the menu drawn again).
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || !(e.target instanceof Element)) return;
  if (!e.target.closest('.sitem[data-slot], .eslot, #item-sheet')) focusSlot(null);
}, true);

function bindSlotFocus(el: HTMLElement, slot: Slot): void {
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && !drag) pointAt(el, slot); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') focusSlot(null); });
  el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') pressAt(el, slot); });
  const lift = (e: PointerEvent) => { if (e.pointerType === 'touch') liftFrom(slot); };
  el.addEventListener('pointerup', lift);
  el.addEventListener('pointercancel', lift);
}

// --- item drag & drop -------------------------------------------------------------
/** `slot`: where an equipped item came from (a weapon can sit in the off-hand) */
interface ItemDrag { from: 'stash' | 'equip'; item: Item; slot: Slot }
let drag: ItemDrag | null = null;

function makeDraggable(el: HTMLElement, payload: ItemDrag): void {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    // (a long press on Android starts a drag: on touch it lights the slot's items instead)
    if (isTouch()) { e.preventDefault(); return; }
    drag = payload;
    hideTooltip();
    focusSlot(null);
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', payload.item.id);
    if (payload.from === 'stash') document.querySelector(`.eslot[data-slot="${payload.item.slot}"]`)?.classList.add('droppable');
    else $('#stash').classList.add('droppable');
  });
  el.addEventListener('dragend', endDrag);
}

// Also called from drop handlers: a re-render may remove the dragged node before 'dragend' fires.
function endDrag(): void {
  drag = null;
  syncDiscard();
  document.querySelectorAll('.droppable, .over').forEach((n) => n.classList.remove('droppable', 'over'));
}

// --- Shift: a click throws a stash item on the floor ---------------------------------
let shiftHeld = false;

function syncDiscard(): void {
  const menu = $('#menu');
  menu.classList.toggle('discard', shiftHeld && !drag && !menu.classList.contains('hidden') && !menu.classList.contains('stowed'));
}

function changed(): void {
  hooks.profileChanged();
  renderMenu();
}

export function showSummary({ training, outcome, wave, score, kills, bag, lost = [], replaced = [], note, watch }: RunSummary): void {
  const box = $('#summary');
  const dead = outcome === 'dead';
  const gone = new Set(lost.map((it) => it.id));
  const kept = bag.filter((it) => !gone.has(it.id));
  const t = $('.sm-title', box);
  t.textContent = training ? 'Training Complete' : dead ? 'You Have Fallen' : 'Spoils Secured';
  t.classList.toggle('dead', dead);
  $('.sm-sub', box).innerHTML = training ? 'Holographic foes. No loot, score or records earned.' : dead
    ? (bag.length ? `The arena claims your <b class="red">${bag.length}</b> unbanked item${bag.length === 1 ? '' : 's'}, never seen.` : 'You carried nothing out — and lost nothing.')
    : `${kept.length} item${kept.length === 1 ? '' : 's'} moved to your stash.${
      replaced.length ? ` Stash full: ${replaced.length} weaker stash item${replaced.length === 1 ? '' : 's'} salvaged to make room.` : ''}${
      lost.length ? ` <b class="red">${lost.length} discarded — nothing weaker left in the stash.</b>` : ''}`;
  $('.sm-stats', box).innerHTML = `<div><b>${wave}</b>Wave</div><div><b>${score.toLocaleString()}</b>Score</div><div><b>${kills}</b>Slain</div>`;
  const items = $('.sm-items', box);
  items.className = 'sm-items';
  items.innerHTML = '';
  clearReveal();
  // a fall loses them unseen (only their rarities show); banking reveals them one by one, the best first, each in its
  // place in the list (revealed from its end, the weakest came first and the best last)
  if (dead) items.innerHTML = rarityChips(bag, 'chip lost');
  else {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // (a long bag's caches open faster, the whole reveal in `REVEAL_MOST` s at most whatever it holds, and a click or a
    // tap anywhere on the summary opens the rest at once: #734, from play, "after several waves (e.g. 10), the waiting
    // time to see all earned rewards can become quite long"; from the owner, "I would just speed up showing if too
    // many items")
    const step = Math.min(REVEAL_STEP, REVEAL_MOST / Math.max(1, bag.length));
    let heard = -Infinity;
    bag.slice().sort(byValue).forEach((it, i) => {
      const c = document.createElement('span');
      c.className = 'chip reveal' + (gone.has(it.id) ? ' lost' : '');
      c.style.color = rarityOf(it.rarity).color;
      c.dataset.r = it.rarity;
      const at = 0.3 + i * step;
      c.style.animationDelay = `${at}s`;
      c.textContent = it.name;
      bindTooltip(c, itemTooltip(it));
      items.append(c);
      // (a cache's sound no sooner than `SOUND_APART` after the last: forty in a second were one noise)
      if (!still && at - heard >= SOUND_APART) {
        heard = at;
        revealTimers.push(setTimeout(() => sfx.loot(rarityIndex(it.rarity)), at * 1000));
      }
    });
    revealing = !still && bag.length > 0;
  }
  if (!dead) markNew(kept);
  $('.sm-note', box).textContent = note ?? '';
  // in co-op the others may fight on: the button then watches them, and the lobby follows the run's end
  $('#btn-summary').textContent = watch ? 'Watch the rest of the run' : 'Return to the Sanctuary';
  box.classList.remove('hidden');
}

export function hideSummary(): void { $('#summary').classList.add('hidden'); hideTooltip(); clearReveal(); }

/** seconds between one cache opening and the next on the summary, the most the whole reveal takes (a long bag's
 *  step is shorter), and the least between two of their sounds */
const REVEAL_STEP = 0.22;
const REVEAL_MOST = 3.5;
const SOUND_APART = 0.12;
let revealTimers: ReturnType<typeof setTimeout>[] = [];
/** whether the summary's caches are still opening one by one */
let revealing = false;
function clearReveal(): void { revealTimers.forEach(clearTimeout); revealTimers = []; revealing = false; }

/** Every cache still to open on the summary opened at once (a click or a tap on it as they open, #734). */
export function revealAllNow(): void {
  if (!revealing) return;
  clearReveal();
  for (const chip of document.querySelectorAll<HTMLElement>('#summary .sm-items .chip.reveal')) {
    chip.classList.remove('reveal');
    chip.style.animationDelay = '';
  }
}

/** Whether the summary's caches are still opening one by one (the lab's `ui --states summarySkip`). */
export const summaryRevealing = (): boolean => revealing;
function renderTraceOptions(): void {
  const t = traceConsent();
  document.querySelectorAll<HTMLElement>('#opt-traces button').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
  $<HTMLInputElement>('#opt-stats').checked = playStats() === 'on';
}
/** The Vsync setting's buttons, the one in effect lit (`?vsync=` may have set it for this visit). */
function renderVsyncOptions(): void {
  const on = framesUncapped() ? 'off' : 'on';
  document.querySelectorAll<HTMLElement>('#opt-vsync button').forEach((b) => {
    b.classList.toggle('active', b.dataset.v === on);
  });
}

/** The Spell circle setting's buttons, the one in effect lit. */
function renderEyesPortalOptions(): void {
  const on = eyesPortal() ? 'on' : 'off';
  document.querySelectorAll<HTMLElement>('#opt-eyes-portal button').forEach((b) => b.classList.toggle('active', b.dataset.g === on));
}

/** The Gear glow setting's buttons, the one in effect lit: the player's choice, else the quality level's (off at
 *  Very low). */
function renderGearGlowOptions(): void {
  const on = gearGlow() ? 'on' : 'off';
  document.querySelectorAll<HTMLElement>('#opt-gear-glow button').forEach((b) => b.classList.toggle('active', b.dataset.g === on));
}

/** The performance overlay's sizes, the one shown lit. */
function renderPerfOptions(): void {
  const s = perfHudSize();
  document.querySelectorAll<HTMLElement>('#opt-perf button').forEach((b) => b.classList.toggle('active', b.dataset.perf === s));
}

/** The Resolution row: the share the scene renders at lit. */
function renderResolutionOptions(): void {
  const share = resolutionSetting();
  document.querySelectorAll<HTMLElement>('#opt-resolution button')
    .forEach((b) => b.classList.toggle('active', Number(b.dataset.r) === share));
}

function renderQualityOptions(): void {
  const s = qualitySetting();
  document.querySelectorAll<HTMLElement>('#opt-quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === s));
  // Auto shows the level it is currently running at
  $('#opt-quality [data-q="auto"] small').textContent = s === 'auto' ? `(${QUALITY[qualityLevel()].label})` : '';
}

/** what Auto says HDR is doing */
const HDR_NOTES: Record<HdrStatus, string> = {
  on: '(on)', off: '', 'sdr-display': '(no HDR display)', unsupported: '(not in this browser)', starting: '(starting)',
  reload: '(reload to switch)', quality: '(off below High)',
};
function renderHdrOptions(): void {
  const s = hdrSettings(), status = hdrStatus();
  document.querySelectorAll<HTMLElement>('#opt-hdr button').forEach((b) => b.classList.toggle('active', b.dataset.hdr === s.mode));
  $('#opt-hdr [data-hdr="auto"] small').textContent = s.mode === 'auto' ? HDR_NOTES[status] : '';
  // the levels only matter while the frame is shown in HDR
  $('.hdr-levels').classList.toggle('hidden', status !== 'on');
  $<HTMLInputElement>('#opt-hdr-paper').value = String(s.paper);
  $<HTMLInputElement>('#opt-hdr-peak').value = String(s.peak);
  $('#opt-hdr-paper-value').textContent = `${Math.round(s.paper * 100)}%`;
  $('#opt-hdr-peak-value').textContent = `${Math.max(s.peak, s.paper).toFixed(1)}×`;
}

/** The volume sliders: each sets its volume as it moves, and the effects' plays a click as it's let go, to hear its
 *  level by. */
function initVolumeOptions(): void {
  document.querySelectorAll<HTMLInputElement>('#opt-volume input').forEach((input) => {
    const which = input.dataset.volume as keyof Volumes;
    input.oninput = () => {
      setVolumes({ [which]: Number(input.value) });
      renderVolumeOptions();
    };
    if (which === 'effects') input.onchange = () => sfx.click();
  });
  renderVolumeOptions();
}

/** The volume sliders at their settings, each one's share after it. */
function renderVolumeOptions(): void {
  const volumes = volumeSettings();
  document.querySelectorAll<HTMLInputElement>('#opt-volume input').forEach((input) => {
    const share = volumes[input.dataset.volume as keyof Volumes];
    input.value = String(share);
    input.nextElementSibling!.textContent = `${Math.round(share * 100)}%`;
  });
}

/** the pause menu's pages: the controls, the settings, performance (the quality, the reports, the profiler) and
 *  the guide's doors (ui/guide/) */
export type PauseTab = 'controls' | 'settings' | 'performance' | 'guide';
/** every pause tab, in the menu's order */
const PAUSE_TABS: PauseTab[] = ['controls', 'settings', 'performance', 'guide'];
/** the tab the pause menu opens on: the one chosen last (from play: "default to tab in pause screen that was open
 *  before... not always controls... persists between reloads"), Controls until one is */
export const PAUSE_TAB_COOKIE = 'last-stand-pause-tab';

/** The tab the pause menu opens on (the cookie's, Controls if none or another). */
function keptPauseTab(): PauseTab {
  const kept = readCookie(PAUSE_TAB_COOKIE) as PauseTab;
  return PAUSE_TABS.includes(kept) ? kept : 'controls';
}

/** A tab chosen by the player: shown, and kept for the next time the menu opens, this visit or the next. */
function choosePauseTab(tab: PauseTab): void {
  pauseTab(tab);
  writeCookie(PAUSE_TAB_COOKIE, tab);
}

/** The pause menu's page `tab` shown, the other hidden in the same cell (the box keeps its size). */
export function pauseTab(tab: PauseTab): void {
  document.querySelectorAll<HTMLElement>('[data-pause-tab]').forEach((b) => {
    const on = b.dataset.pauseTab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll<HTMLElement>('[data-pause-page]').forEach((page) => {
    page.classList.toggle('off', page.dataset.pausePage !== tab);
  });
}

/** how long Abandon run is held before it abandons (ms) */
export const ABANDON_HOLD_MS = 2000;

/** The time of day's slider and its value: the hour held, or Auto with the clock's hour. */
function renderHourOption(): void {
  const held = heldHour();
  const h = held ?? hourNow();
  const clock = `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  $<HTMLInputElement>('#opt-hour').value = String(held ?? -0.5);
  $('#opt-hour-value').textContent = held === null ? `Auto ${clock}` : clock;
}

export function showPause(v: boolean): void {
  resetHold($('#btn-abandon'));
  if (v) {
    // (photo mode is the village's and the time between waves': its button says so during a fight)
    const photo = $<HTMLButtonElement>('#btn-photo'), allowed = photoAllowed();
    photo.disabled = !allowed;
    photo.title = allowed ? 'Hide the UI, set up a shot and save it (P)' : 'Not during a fight: in the village or between waves';
    showBuildStatus($('#pause .build-status'));
    refreshColourPickers();
    pauseTab(keptPauseTab());
    renderControlsHelp();
    renderPerfOptions();
    $<HTMLInputElement>('#opt-net').checked = netHudEnabled();
    $<HTMLInputElement>('#opt-blog').checked = battleLogEnabled();
    renderQualityOptions();
    renderGearGlowOptions();
    renderTraceOptions();
    renderHdrOptions();
    // the hour is the village's alone (a biome keeps its own light)
    $('.hour-row').classList.toggle('hidden', G.arena.place !== 'village' || G.mode === 'run');
    renderHourOption();
    // in the lobby there is no run to abandon; in co-op it leaves the others to it
    // (nor for a host out of it already whose partners play on: his game runs their fight until it ends)
    $('#btn-abandon').classList.toggle('hidden', G.mode !== 'run' || runsOthersFight());
    // (Install is the lobby's: on a phone held sideways its row took 38 px of the pages' cell in a run)
    document.querySelector('#pause .pb-links')?.classList.toggle('hidden', G.mode === 'run');
    // (short beside the title: what it costs is its tooltip)
    $('#btn-abandon').textContent = isCoop() ? 'Leave the run' : 'Abandon run';
    $('.pause-note').classList.toggle('hidden', !isCoop() || G.mode !== 'run');
    $('.pause-note').textContent = runsOthersFight()
      ? 'Your partners fight on: you go back to the sanctuary with them when the run ends.'
      : 'Playing together, the game goes on: your hero stands still until you resume.';
  }
  $('#pause').classList.toggle('hidden', !v);
}
