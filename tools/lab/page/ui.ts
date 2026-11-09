// The game's UI as the player sees it on this screen (tools/lab `ui`): the lobby, an item's tooltip, the stash's items
// lit for a hovered item's slot (`uiGlow.ts`: pictured at set moments of its loops, which mustn't paint), How to play,
// the save slots, the hero selection screen over the hall of heroes (`uiHeroes.ts`), the fight's loading bar for it
// asked for with the heroes cold, a battleground's button clicked with the mouse and a key pressed after it (where the
// focus went), the lobby's
// camera switched through its views (the labels over the dummies against where they stand on the screen, frame by
// frame through each glide), the run's HUD with the world's labels over it (a hurt foe's bar, damage numbers), the
// scores, the performance overlay, the bank-or-continue choice, the pause menu, the run's summary, the hotbar's skill
// tooltips (each opened by the mouse over its slot, within the window; the tallest pictured; the lobby's by a finger's
// tap) and the battle log (hits dealt and taken listed in it: a row for each line, within the window), each pictured
// whole, with the boxes of the page's named elements and of the labels as shares of the window, the cursor over every
// element the mouse can be over the game's own, never the system's, and every digit shown on its line (`digits.ts`).
// On two screens (`--screens`), a
// UI laid out as a share of the screen shows the same lines and the same pictures on both, whatever the screens'
// pixel ratios: a 4K screen at 300% as at 100%.
import * as THREE from 'three';
import { middleOf, onTheClock } from './lab';
import type { Frame, Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import * as warm from '../../../src/game/warm';
import * as readying from '../../../src/ui/readying';
import type { Need } from '../../../src/game/warm';
import type { DamageType, Obstacle, SkillDef } from '../../../src/types';
import type { Enemy } from '../../../src/entities/enemy';
import { NUMBER_COLORS } from '../../../src/data/balance';
import { DAMAGE_TYPES, hitEnemy, hurtPlayer } from '../../../src/combat/damage';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { anchoredLabels, floatText } from '../../../src/ui/floaters';
import { metersBehindHero } from './uiBehindHero';
import { viewMode } from '../../../src/core/renderer';
import * as overlay from '../../../src/ui/overlay/layer';
import { showDecision } from '../../../src/ui/hud';
import { closeDecision, DECISION_CANARY, decisionShown } from './uiDecision';
import { hideSummary, showSummary } from '../../../src/ui/menus';
import { setPerfHud } from '../../../src/ui/perfHud';
import { openSaves } from '../../../src/ui/saves';
import { openBook } from '../../../src/ui/loadoutEditor';
import { hideTooltip, itemTooltip, showTooltipAt } from '../../../src/ui/tooltip';
import { hdrOutput } from './hdrOutput';
import { battleLog } from './battleLog';
import { digitsShown } from './digits';
import { closeGlow, GLOW_CANARIES, glowPictures, glowShown, openGlow } from './uiGlow';
import { closeHeroes, heroesCanaryCaught, heroesClosed, heroesShown, openHeroes } from './uiHeroes';
import {
  ABANDON_CANARY, PAUSE_CANARY, TAB_CANARY, VOLUME_CANARY, closePause, closePauseAbandon, closePauseVolume, openPause,
  openPauseAbandon, openPauseVolume, pauseAbandonChecked, pauseShown, pauseTabKept, pauseVolumeChecked,
} from './uiPause';
import { ASK_CANARY, closePerfAsk, openPerfAsk, openPerfAskBreak, openPerfAskTouch, perfAskShown } from './uiPerfAsk';
import { closeHeroesWarming, HEROES_WARMING_CANARY, heroesWarmingShown, openHeroesWarming } from './uiHeroesWarming';
import { closeDecisionTouch, decisionTouchShown, hudTouchShown, openDecisionTouch, openHudTouch, TOUCH_CANARIES }
  from './uiTouch';
import { BUTTONS_CANARY, lobbyButtonsShown, openButtonsTouch, runButtonsShown } from './uiButtons';
import { closeCoopDialog, COOP_CANARY, coopShown, openCoopPicked, openCoopRename, openCoopTouch } from './uiCoop';
import {
  closeLitTouch, closeSheetTouch, litTouchPictures, litTouchShown, openLitTouch, openSheetTouch, plantLitCanary,
  SHEET_CANARIES, sheetTouchShown,
} from './uiSheet';

/** The states pictured, in the order they run (tools/lab/node/options.mjs `UI_STATES`). */
export type UiState =
  | 'lobby' | 'tooltip' | 'glow' | 'help' | 'saves' | 'heroes' | 'readying' | 'readyingHeroes' | 'clicked' | 'views'
  | 'behindProps'
  | 'logLobby' | 'perfAsk' | 'coop' | 'coopRename'
  | 'heroesWarming' | 'skillTipsTouch' | 'sheetTouch' | 'litTouch' | 'buttonsTouch' | 'coopTouch'
  | 'run' | 'scores' | 'perf'
  | 'decision' | 'perfAskBreak' | 'pause' | 'pauseSettings' | 'pauseVolume' | 'pauseTabKept'
  | 'pauseAbandon' | 'summary' | 'skillTips' | 'log' | 'logTouch' | 'hudTouch' | 'decisionTouch'
  | 'perfAskTouch' | 'buttonsRunTouch';

export interface UiOptions {
  state: UiState;
  /** HDR forced on first, as on a display in HDR mode (the pause menu then shows its levels) */
  hdr?: boolean;
  /** the system's cursor planted on the page's body: the cursors' check must find it */
  canary?: boolean;
}

/** the states pictured in a run (the rest are the lobby's) */
const RUN_STATES: UiState[] = [
  'run', 'scores', 'perf', 'decision', 'perfAskBreak', 'pause', 'pauseSettings', 'pauseVolume',
  'pauseTabKept', 'pauseAbandon', 'summary',
  'skillTips', 'log', 'logTouch', 'hudTouch', 'decisionTouch', 'perfAskTouch', 'buttonsRunTouch',
];
/** where the tooltip is opened, as shares of the window (the mouse over the lobby's left panel) */
const TOOLTIP_AT = { x: 0.18, y: 0.3 };
/** the foe spawned for the run's labels, how far ahead of the hero (m), and the share of its life it has left */
const FOE_AHEAD = 6;
const FOE_LIFE = 0.6;
/** the damage numbers shown over it: their text, kind, height over the floor (m) and, for a hit's, its damage's type
 *  (coloured as the game colours it: the warrior's and the ranger's physical, the mage's arcane, a crit by its type) */
const NUMBERS = [
  { text: 128, kind: 'dmg', rise: 1.6, type: 'physical' },
  { text: 96, kind: 'dmg', rise: 2.4, type: 'arcane' },
  { text: 412, kind: 'crit', rise: 2.0, type: 'cold' },
  { text: 37, kind: 'heal', rise: 1.2 },
] as const;
/** frames run after the numbers are shown, so each has risen a little and none is in its first pop */
const NUMBER_FRAMES = 12;
/** the key pressed after the battleground's button is clicked: one the game takes in the lobby (a step forward) */
const KEY_AFTER_CLICK = 'KeyW';
/** the frames run after each press of V as the camera glides to the next view (its glide is 0.45 s) */
const SWITCH_FRAMES = 40;
/** a label further than this from where its anchor shows on the screen is off (css px) */
const LABEL_SLACK = 1;
/** frames Tab is held for the scores */
const SCORES_FRAMES = 2;
/** the battle log's hits: each skill on a key struck at the run's foe this many times, and its blows on the hero; then
 *  the frames run for the panel to draw them (it draws every 0.1 s at most) */
const LOG_STRIKES = 2;
const LOG_BLOWS = 2;
const LOG_FRAMES = 12;
/** the frames a lobby's training dummy has to rise in */
const DUMMY_FRAMES = 120;
/** how far apart the tops of the battle log's head's parts may be on one line (css px: a line is ~13) */
const HEAD_SLACK = 6;

/** `value` (css px) as a share of `whole`, in % to a tenth. */
function share(value: number, whole: number): string {
  return (value / whole * 100).toFixed(1);
}

/** A box (css px) as shares of the window: its left, top, width and height. */
function boxText(box: { x: number; y: number; w: number; h: number }): string {
  const position = `${share(box.x, innerWidth)},${share(box.y, innerHeight)}`;
  return `${position} ${share(box.w, innerWidth)}x${share(box.h, innerHeight)}`;
}

/** Each named element shown (an id, a box with an area, visible), its box as shares of the window. */
function namedBoxes(): string[] {
  const lines: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    lines.push(`#${element.id} ${boxText({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })}`);
  }
  return lines;
}

/**
 * The labels drawn over the world last frame, in the order drawn; none in a tree that doesn't list them (an A/B's
 * older commit), read through the module's namespace, where a name it lacks is only undefined.
 */
function drawnLabels(): readonly overlay.Label[] {
  return overlay.drawnLabels?.() ?? [];
}

/** Each label drawn over the world last frame, its box as shares of the window, in the order drawn. */
function labelBoxes(): string[] {
  return drawnLabels().map((label) => `label ${label.order} ${boxText(label.box)}`);
}

/**
 * Every animation of the page brought to its end (an endless one to its start), so a picture shows the UI at rest:
 * CSS animations run on the browser's own clock, not the lab's. One driven by a scroll is at rest already.
 */
function settleAnimations(): void {
  for (const animation of document.getAnimations().filter(onTheClock)) {
    const iterations = animation.effect?.getComputedTiming().iterations ?? 1;
    if (iterations === Infinity) {
      animation.pause();
      animation.currentTime = 0;
    } else {
      animation.finish();
    }
  }
}

/** The page as it is now, pictured and its boxes listed under `state`, a frame on with `held` held down. */
async function pictureState(lab: Lab, state: UiState, held: Frame): Promise<{ lines: string[]; moment: Pictured }> {
  settleAnimations();
  await lab.step(1, () => held);
  settleAnimations();
  const lines = [state, ...namedBoxes().map((line) => `  ${line}`), ...labelBoxes().map((line) => `  ${line}`)];
  const moment = await lab.screen(state);
  return { lines, moment };
}

/** The tooltip of the hero's equipped weapon, opened where the mouse would be over the lobby's left panel. */
function openTooltip(): void {
  const weapon = G.profile.equipped.weapon;
  if (!weapon) throw new Error('lab: ui: the hero has no weapon equipped for the tooltip');
  showTooltipAt(itemTooltip(weapon)(), { clientX: innerWidth * TOOLTIP_AT.x, clientY: innerHeight * TOOLTIP_AT.y });
}

/** How to play, opened from the lobby's link. */
function openHelp(): void {
  document.getElementById('btn-help')!.click();
}

function closeHelp(): void {
  document.getElementById('help')!.classList.add('hidden');
}

/** how far along the fight's loading bar is pictured, a share of its length */
const READYING_SHARE = 0.4;
/** how far the bar's fill may be off that, a share of its length */
const READYING_SLACK = 0.02;

/** The fight's loading bar, or null in a tree from before it. */
const readyingBar = (): HTMLElement | null => document.getElementById('readying');

/**
 * The fight's loading bar over the lobby, as `ui/readying.ts` paints it while a press waits for the fight's programs
 * (the lab's boot warms them at once, so it never shows by itself), `READYING_SHARE` along.
 */
function openReadying(): void {
  const bar = readyingBar();
  if (!bar) return;
  bar.classList.add('on');
  bar.style.setProperty('--p', String(READYING_SHARE));
}

function closeReadying(): void {
  const bar = readyingBar();
  bar?.classList.remove('on');
  bar?.style.removeProperty('--p');
}

/** How many lines `element`'s text is laid out on. */
function linesOf(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
}

/** How the fight's loading bar lies: how many lines its `label` is on, and `state`'s problems if the bar reaches past
 *  the window or the label runs onto more than one line. */
function barPlaced(bar: HTMLElement, label: HTMLElement, state: UiState): { rows: number; problems: string[] } {
  const box = bar.querySelector('.rd-box')!.getBoundingClientRect();
  const rows = linesOf(label);
  const problems: string[] = [];
  const inside = box.left >= -0.5 && box.top >= -0.5 && box.right <= innerWidth + 0.5;
  if (!inside || box.bottom > innerHeight + 0.5) {
    const where = boxText({ x: box.x, y: box.y, w: box.width, h: box.height });
    problems.push(`${state}: the bar reaches past the window (${where})`);
  }
  if (rows !== 1) problems.push(`${state}: its label (${label.textContent?.trim()}) runs onto ${rows} lines`);
  return { rows, problems };
}

/**
 * The fight's loading bar within the window, its label on one line and its fill as far along as painted.
 * `canary`: the label given the width of a letter, so it wraps, which must be found.
 */
function readyingShown(canary: boolean): Found {
  const bar = readyingBar();
  if (!bar) return { lines: ['  no fight\'s loading bar in this tree'], problems: [] };
  const label = bar.querySelector<HTMLElement>('.rd-sub')!;
  if (canary) label.style.width = '1ch';
  const placed = barPlaced(bar, label, 'readying');
  const track = bar.querySelector('.rd-bar')!.getBoundingClientRect();
  const fill = bar.querySelector('.rd-fill')!.getBoundingClientRect();
  label.style.width = '';
  const along = track.width > 0 ? fill.width / track.width : 0;
  const rows = `${placed.rows} line${placed.rows === 1 ? '' : 's'}`;
  const lines = [`  the fight's loading bar: its label on ${rows}, ${share(along, 1)}% along`];
  const problems = [...placed.problems];
  if (Math.abs(along - READYING_SHARE) > READYING_SLACK) {
    problems.push(`readying: its fill is ${share(along, 1)}% along, painted ${share(READYING_SHARE, 1)}%`);
  }
  return { lines, problems };
}

/** The lab's way to keep a need cold (game/warm.ts `chill`), or undefined in a tree from before it. */
const chillOf = (): ((need: Need) => void) | undefined => (warm as { chill?: (need: Need) => void }).chill;

/** Every label the fight's loading bar can show (ui/readying.ts `readyingLabels`), none in a tree from before it. */
const labelsOf = (): string[] => (readying as { readyingLabels?: () => string[] }).readyingLabels?.() ?? [];

/** Each label the bar can show laid out in its `label` on this screen: those that run onto more than one line. */
function labelsWrapped(label: HTMLElement): { text: string; rows: number }[] {
  const said = label.textContent;
  const laidOut = labelsOf().map((text) => {
    label.textContent = text;
    return { text, rows: linesOf(label) };
  });
  label.textContent = said;
  return laidOut.filter(({ rows }) => rows !== 1);
}

/** whether `readyingHeroes` asked for the hero selection screen with the heroes kept cold, while it waits */
let askedCold = false;

/**
 * The lobby's Change hero clicked with the mouse while the heroes' programs are cold (`chill`: the lab's boot warms
 * every need at once), as a first visit's lobby waits for them: under the fight's loading bar, which says what it
 * readies. No frame runs, here or as it closes: the states after it are pictured at the moment they'd be without it
 * (three frames moved the lobby's opening zoom, and every label after it with it).
 */
async function openReadyingHeroes(lab: Lab): Promise<void> {
  const chill = chillOf();
  const button = document.getElementById('btn-hero');
  if (!chill || !button) return;
  chill('heroes');
  askedCold = true;
  await lab.clickOn(button);
}

/**
 * The heroes warm again, so the screen asked for opens, and it's closed at once as Back closes it: the lobby's hero
 * is never rebuilt (rebuilt twice, he stood in another phase of his idle in every picture after it).
 */
async function closeReadyingHeroes(): Promise<void> {
  if (!askedCold) return;
  askedCold = false;
  warm.markWarm('heroes');
  // (the press goes ahead as its wait resolves)
  await new Promise((resolve) => setTimeout(resolve));
  document.querySelector<HTMLElement>('#heroes .hs-back')?.click();
}

/**
 * The fight's loading bar shown for the hero selection screen asked for (`openReadyingHeroes`), within the window,
 * its label on one line, saying it readies the heroes (a class pick once said "Readying the fight", the page's own
 * text, whatever was waiting). `canary`: that text put back, which must be found.
 */
function readyingHeroesShown(canary: boolean): Found {
  const bar = readyingBar();
  if (!bar || !askedCold) {
    return { lines: ['  no way to keep the heroes cold for a hero selection screen in this tree'], problems: [] };
  }
  const label = bar.querySelector<HTMLElement>('.rd-sub')!;
  const said = label.textContent ?? '';
  if (canary) label.textContent = 'Readying the fight';
  const text = label.textContent?.trim() ?? '';
  const placed = barPlaced(bar, label, 'readyingHeroes');
  label.textContent = said;
  const shown = bar.classList.contains('on');
  const rows = `${placed.rows} line${placed.rows === 1 ? '' : 's'}`;
  const wrapped = labelsWrapped(label);
  const lines = [
    `  Change hero clicked, the heroes cold: the fight's loading bar ${shown ? 'shown' : 'not shown'}, `
      + `saying "${text}" on ${rows}`,
    `  every label it can show (${labelsOf().length}) on one line: ${wrapped.length ? 'no' : 'yes'}`,
  ];
  const problems = [...placed.problems];
  for (const { text: wraps, rows: on } of wrapped) problems.push(`readyingHeroes: "${wraps}" runs onto ${on} lines`);
  if (!shown) problems.push('readyingHeroes: Change hero clicked with the heroes cold showed no loading bar');
  if (!text.includes('heroes')) problems.push(`readyingHeroes: Change hero clicked, the loading bar says "${text}"`);
  return { lines, problems };
}

/** The run's summary: banked, nothing in the bag. */
function openSummary(): void {
  showSummary({ outcome: 'banked', wave: 3, score: 12_480, kills: 42, bag: [] });
}

/** A hurt foe ahead of the hero, risen and standing, and damage numbers over it, a few frames on. */
async function showLabels(lab: Lab): Promise<void> {
  const hero = lab.player.pos;
  const at = new THREE.Vector3(hero.x, 0, hero.z + FOE_AHEAD);
  const foe = lab.spawnFoe('husk', at);
  await lab.until(() => !foe.spawning, 300, 'the foe never rose');
  foe.life = foe.maxLife * FOE_LIFE;
  for (const number of NUMBERS) {
    const color = 'type' in number ? NUMBER_COLORS[number.type] : undefined;
    floatText(at.x, number.rise, at.z, number.text, number.kind, color);
  }
  await lab.step(NUMBER_FRAMES);
  const listed = typeof overlay.drawnLabels === 'function';
  if (listed && drawnLabels().length < NUMBERS.length + 1) {
    throw new Error('lab: ui: the foe\'s bar and numbers weren\'t drawn');
  }
}

/** What a state found besides its boxes: lines for its report, and its problems. */
interface Found {
  lines: string[];
  problems: string[];
}

/**
 * How a state is opened over the lobby or the run and closed again after its picture, what's held meanwhile, what it
 * checks once pictured (`canary`: with a problem planted, which it must find), and the pictures it takes besides.
 */
interface Steps {
  open(lab: Lab): unknown;
  close(lab: Lab): unknown;
  held?: Frame;
  check?(canary: boolean, lab: Lab): Found | Promise<Found>;
  pictures?(lab: Lab): Promise<Pictured[]>;
  /** what it checks once closed */
  closed?(): Found;
}

/** One switch of the view: from which to which, the labels measured, and how far the furthest was off and when. */
interface Switch {
  from: string;
  to: string;
  labels: number;
  worst: number;
  worstFrame: number;
}

/** the view switches the `views` state played, for its check */
let switches: Switch[] = [];

/**
 * How far each label anchored to the world is from where its anchor shows by the camera as the frame draws it
 * (css px): the furthest, and how many were measured (shown, not held on the screen).
 */
function labelsOff(): { labels: number; worst: number } {
  const camera = G.camera.clone();
  camera.updateMatrixWorld();
  const point = new THREE.Vector3();
  let labels = 0;
  let worst = 0;
  for (const { label, at, clamp } of anchoredLabels()) {
    if (!at || clamp || !label.shown) continue;
    point.set(at.x, at.y, at.z).project(camera);
    if (point.z > 1) continue;
    const x = (point.x * 0.5 + 0.5) * innerWidth;
    const y = (-point.y * 0.5 + 0.5) * innerHeight;
    labels++;
    worst = Math.max(worst, Math.hypot(label.x - x, label.y - y));
  }
  return { labels, worst };
}

/**
 * The lobby's camera switched with V through every view and back to the top-down one, each glide played and drawn:
 * every frame of it, the labels over the dummies measured against where their anchors show.
 */
async function switchViews(lab: Lab): Promise<void> {
  switches = [];
  // (every frame drawn, as the game draws them: the drawing refreshed the camera's matrices once a frame)
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let press = 0; press < 3; press++) switches.push(await switchView(lab));
  } finally {
    lab.drawing = drawing;
  }
  if (viewMode() !== 'top') throw new Error(`lab: ui: the views ended in ${viewMode()}, not the top-down view`);
}

/** V pressed once and the glide to the next view played, the labels measured every frame of it. */
async function switchView(lab: Lab): Promise<Switch> {
  const from = viewMode();
  await lab.step(1, () => ({ keys: ['v'] }));
  const switched: Switch = { from, to: viewMode(), labels: 0, worst: 0, worstFrame: 0 };
  for (let frame = 0; frame < SWITCH_FRAMES; frame++) {
    await lab.step(1);
    const off = labelsOff();
    switched.labels = Math.max(switched.labels, off.labels);
    if (off.worst > switched.worst) {
      switched.worst = off.worst;
      switched.worstFrame = frame;
    }
  }
  return switched;
}

/** The labels through each switch as lines, and a problem for each switch that left them off their anchors. */
function labelsThroughSwitches(): Found {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const switched of switches) {
    const where = `${switched.from} to ${switched.to}`;
    lines.push(`  ${where}: ${switched.labels} labels, off their anchors by up to ${switched.worst.toFixed(1)} px `
      + `(frame ${switched.worstFrame})`);
    if (!switched.labels) problems.push(`views, ${where}: no label over the dummies was measured`);
    if (switched.worst > LABEL_SLACK) {
      problems.push(`views, ${where}: the labels were up to ${switched.worst.toFixed(1)} px off their anchors`);
    }
  }
  return { lines, problems };
}

/**
 * The battleground's button the lobby has on clicked with the mouse (nothing changes) and a game key pressed after it,
 * as a player picks one and then plays, each as the browser gets it from a mouse and a keyboard (the class buttons that
 * stood in the lobby kept the focus so). Throws if the click never reached the button.
 */
async function clickClass(lab: Lab): Promise<void> {
  const button = document.querySelector<HTMLElement>('#opt-biome button.active');
  if (!button) throw new Error('lab: ui: the lobby has no battleground\'s button on');
  let clicked = false;
  const heard = (event: MouseEvent) => {
    clicked = event.detail > 0;
  };
  button.addEventListener('click', heard, { once: true });
  const box = button.getBoundingClientRect();
  await lab.click({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  button.removeEventListener('click', heard);
  if (!clicked) throw new Error('lab: ui: the mouse\'s click never reached the battleground\'s button');
  await lab.press(KEY_AFTER_CLICK);
}

/** `element` named for a report: its tag, its id or its data attributes, and the id of what it's in. */
function describe(element: Element): string {
  const data = Object.entries((element as HTMLElement).dataset ?? {}).map(([key, value]) => `[data-${key}=${value}]`);
  const own = element.id ? `#${element.id}` : data.join('');
  const within = element.parentElement?.closest('[id]');
  return `${element.tagName.toLowerCase()}${own}${within ? ` in #${within.id}` : ''}`;
}

/**
 * Where the focus is after the click and the key, and whether the browser shows its focus ring. A button keeping it
 * is a problem: the game's next key shows the ring round it (clipped by its group's frame, a second border down its
 * side), and Space or Enter presses it again.
 */
function focusAfterClick(): Found {
  const focused = document.activeElement;
  const holder = focused && focused !== document.body ? describe(focused) : 'nothing';
  const ring = document.querySelector(':focus-visible');
  const lines = [`  focus: ${holder}`, `  focus ring: ${ring ? describe(ring) : 'none'}`];
  const kept = focused?.closest('button');
  const problems = kept ? [`the button clicked kept the focus (${describe(kept)})`] : [];
  return { lines, problems };
}

/** the lines the battle log listed for its state (-1: no log in this tree) */
let logListed = -1;

/** A skill's damage type as its tags say (its behaviour picks it; the physical when they don't say). */
function typeOf(def: SkillDef): DamageType {
  return DAMAGE_TYPES.find((type) => def.tags.includes(type)) ?? 'physical';
}

type BattleLog = NonNullable<Awaited<ReturnType<typeof battleLog>>>;

/** The battle log shown and cleared, and each skill on a key struck at `foe` `LOG_STRIKES` times (the foe kept alive
 *  through them and given back the life it had). Null in a tree without a log. */
async function logStrikes(foe: Enemy | undefined): Promise<BattleLog | null> {
  const game = await battleLog();
  logListed = -1;
  if (!game) return null;
  if (!foe) throw new Error('lab: ui: no foe for the battle log to list hits on');
  game.setBattleLog(true, false);
  game.clearBattleLog();
  const hero = G.player;
  const life = foe.life;
  foe.life = foe.maxLife * 100;
  for (const key of SKILL_KEYS) {
    const def = hero.skillAt(key)?.def;
    if (!def?.damage) continue;
    for (let strike = 0; strike < LOG_STRIKES; strike++) {
      hitEnemy(foe, def.damage, { by: hero, skill: def, type: typeOf(def), silent: true });
    }
  }
  foe.life = life;
  return game;
}

/** The battle log shown over the run, each skill struck at the run's foe and the foe's blows on the hero listed in
 *  it, the panel drawn after. */
async function openLog(lab: Lab): Promise<void> {
  const foe = G.enemies.find((enemy) => enemy.alive);
  const game = await logStrikes(foe);
  if (!game || !foe) return;
  for (let blow = 0; blow < LOG_BLOWS; blow++) {
    hurtPlayer(G.player, foe.damage, foe.def.damageType, foe.pos, { foe, attack: 'strike' });
  }
  logListed = game.battleLogLines().length;
  // (paused from its panel, its head at its widest)
  document.querySelector<HTMLElement>('#blog [data-bl="pause"]')?.click();
  await lab.step(LOG_FRAMES);
}

/** The battle log shown over the lobby (its panels open, where it must keep clear of them), each skill struck at a
 *  training dummy once it has risen, the panel drawn after. */
async function openLogLobby(lab: Lab): Promise<void> {
  const dummy = G.enemies.find((enemy) => enemy.def.dummy && enemy.alive);
  if (dummy) await lab.until(() => !dummy.invulnerable, DUMMY_FRAMES, 'the training dummy never rose');
  const game = await logStrikes(dummy);
  if (!game) return;
  logListed = game.battleLogLines().length;
  await lab.step(LOG_FRAMES);
}

async function closeLog(): Promise<void> {
  const game = await battleLog();
  game?.pauseBattleLog?.(false);
  game?.setBattleLog(false, false);
}

/** The page's named elements shown that `panel` lies over, other than the layers as wide as the screen it lies on
 *  (the HUD, the touch controls' pad: a third of the window or more). */
function namedUnder(panel: HTMLElement): string[] {
  const box = panel.getBoundingClientRect();
  const covered: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    if (element.contains(panel) || panel.contains(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width * rect.height >= innerWidth * innerHeight / 3) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const across = rect.left < box.right && box.left < rect.right;
    if (across && rect.top < box.bottom && box.top < rect.bottom) covered.push(`#${element.id}`);
  }
  return covered;
}

/** The battle log's panel: a row for every line it listed, within the window, over nothing of the HUD, and no row
 *  wider than the panel. */
function logShown(): Found {
  if (logListed < 0) return { lines: ['  no battle log in this tree'], problems: [] };
  const panel = document.getElementById('blog')!;
  const rows = panel.querySelectorAll('.bl-line').length;
  const box = panel.getBoundingClientRect();
  const list = panel.querySelector<HTMLElement>('.bl-lines')!;
  const lines = [`  battle log: ${logListed} lines listed, ${rows} shown`];
  const problems: string[] = [];
  if (rows !== logListed) problems.push(`log: the panel shows ${rows} lines of the ${logListed} listed`);
  const covered = namedUnder(panel);
  if (covered.length) problems.push(`log: the panel lies over ${covered.join(', ')}`);
  if (box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5) {
    const where = boxText({ x: box.x, y: box.y, w: box.width, h: box.height });
    problems.push(`log: the panel reaches past the window (${where})`);
  }
  if (list.scrollWidth > list.clientWidth + 0.5) {
    problems.push(`log: its lines are ${list.scrollWidth} px wide, in a panel ${list.clientWidth} px wide`);
  }
  const head = panel.querySelector<HTMLElement>('.bl-head')!;
  const tops = [...head.children].map((part) => part.getBoundingClientRect().top);
  const wrapped = Math.max(...tops) - Math.min(...tops) > HEAD_SLACK;
  if (head.scrollWidth > head.clientWidth + 0.5 || wrapped) {
    problems.push(`log: its head (${head.textContent?.trim()}) doesn't fit on a line of the panel`);
  }
  return { lines, problems };
}

/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.5, y: 0.4 };
/** frames run after the tap, for the touch controls to show */
const TOUCH_FRAMES = 2;

/** The battle log as above, the page put in touch mode first by a finger's tap, as a player's first touch puts it. */
async function openLogTouch(lab: Lab): Promise<void> {
  await lab.touchDown({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
  await lab.touchUp();
  await lab.step(TOUCH_FRAMES);
  await openLog(lab);
}

/**
 * The battle log on a touch screen, besides what `logShown` checks (over none of the touch HUD's corner: the pause
 * and scores buttons, the bars, the buffs): its lines letting a touch through to what lies under them (the move
 * stick's pad reaches up under it).
 */
function logTouchShown(): Found {
  const found = logShown();
  if (logListed < 0) return found;
  if (!document.body.classList.contains('touch')) {
    found.problems.push('log on touch: the tap left the page out of touch mode');
  }
  const row = document.querySelector('#blog .bl-line')?.getBoundingClientRect();
  const under = row ? document.elementFromPoint(row.left + row.width / 2, row.top + row.height / 2) : null;
  found.lines.push(`  a touch on a line of it lands on ${under ? describe(under) : 'nothing'}`);
  if (under?.closest('#blog')) found.problems.push('log on touch: a touch on its lines lands on the panel');
  return found;
}

/** the system's cursors listed of a state at most */
const CURSORS_LISTED = 5;

/** Whether `element` is a field typed into, where the caret is the cursor. */
function typedInto(element: Element): boolean {
  return element.matches('textarea, input:not([type=checkbox], [type=radio], [type=range])');
}

/**
 * The cursor shown over each element the mouse can be over (shown, with an area, taking the pointer): the game's own
 * (its art, `url(...)`) or a field's caret; the system's (a keyword: `auto`, `pointer`, `default`) is a problem. With
 * the canary, the page's body shows the system's, which must be found.
 */
function cursorsShown(canary: boolean): Found {
  if (canary) document.body.style.cursor = 'auto';
  const system: string[] = [];
  let seen = 0;
  for (const element of document.querySelectorAll('body, body *')) {
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const style = getComputedStyle(element);
    if (style.pointerEvents === 'none') continue;
    seen++;
    const ours = style.cursor.startsWith('url(') || (style.cursor === 'text' && typedInto(element));
    if (!ours) system.push(`${describe(element)} (${style.cursor})`);
  }
  if (canary) document.body.style.cursor = '';
  const lines = [`  cursors: ${seen} elements under the mouse, ${system.length} showing the system's`];
  if (!system.length) return { lines, problems: [] };
  const listed = system.slice(0, CURSORS_LISTED).join(', ');
  const more = system.length > CURSORS_LISTED ? ` and ${system.length - CURSORS_LISTED} more` : '';
  return { lines, problems: [`the system's cursor over ${listed}${more}`] };
}

/** A skill's tooltip as it was opened over its slot: the skill's name and the tooltip's box (css px). */
interface SkillTip {
  name: string;
  box: DOMRect;
  /** pinned where it opened, as a tap pins it */
  pinned: boolean;
}

/** the skill tooltips the `skillTips` states opened, and the slot whose tooltip is the tallest */
let skillTips: SkillTip[] = [];
let tallestSlot: HTMLElement | null = null;
/** the slots holding a skill a player could reach when they were opened, and what opened them */
let skillSlots = 0;
let openedBy = 'the mouse';
/** with the canary, each skill's tooltip made as tall as the window: the check must find it past the window */
let tallTips = false;
/** whether this command plants its canaries (`--canary`) */
let canaryAsked = false;

/** A block as tall as the window, the canary's. */
function windowTall(): HTMLElement {
  const block = document.createElement('div');
  block.style.height = `${innerHeight}px`;
  return block;
}

/** The tooltip's box if it shows, null if not. */
function tooltipBox(): DOMRect | null {
  const tip = document.getElementById('tooltip')!;
  if (!tip.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
  return tip.getBoundingClientRect();
}

/** Whether a player can reach `slot`: what lies at its middle is in it (not scrolled out of view, none over it). */
function reachable(slot: HTMLElement): boolean {
  const middle = middleOf(slot);
  const under = document.elementFromPoint(middle.x, middle.y);
  return !!under && slot.contains(under);
}

/**
 * Each skill's tooltip of `slots` a player can reach opened by `open` as a player opens it, its box kept (`closeEach`
 * closing it after); then the tallest opened again for the picture.
 */
async function openEach(
  slots: HTMLElement[], open: (slot: HTMLElement) => Promise<void>, closeEach: () => unknown,
): Promise<void> {
  skillTips = [];
  tallestSlot = null;
  const reached = slots.filter(reachable);
  skillSlots = reached.length;
  for (const slot of reached) {
    await open(slot);
    if (tallTips) document.querySelector('#tooltip .tt-card')?.append(windowTall());
    const box = tooltipBox();
    const name = document.querySelector('#tooltip .tt-name')?.textContent ?? '?';
    const pinned = !!document.querySelector('#tooltip.pinned');
    await closeEach();
    if (!box) continue;
    skillTips.push({ name, box, pinned });
    if (box.height >= Math.max(...skillTips.map((tip) => tip.box.height))) tallestSlot = slot;
  }
  if (tallestSlot) await open(tallestSlot);
}

/** Each skill's tooltip on the hotbar opened by the mouse moved over its slot. */
async function openSkillTips(lab: Lab): Promise<void> {
  openedBy = 'the mouse';
  const slots = [...document.querySelectorAll<HTMLElement>('#hotbar .slot:not(.empty)')];
  await openEach(slots, (slot) => lab.mouseTo(middleOf(slot)), () => undefined);
}

/** The mouse moved off the hotbar to the middle of the window, which closes the tooltip. */
async function closeSkillTips(lab: Lab): Promise<void> {
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  hideTooltip();
}

/**
 * A finger's tap at `at`, its click and all, and the frames after it for the touch controls to show; what it set
 * sliding (a panel the rail turned to) brought to rest.
 */
async function tap(lab: Lab, at: { x: number; y: number }): Promise<void> {
  await lab.tap(at);
  await lab.step(TOUCH_FRAMES);
  settleAnimations();
}

/** `element` tapped by a finger if a player can reach it; whether it was. */
async function tapIfReached(lab: Lab, element: HTMLElement | null): Promise<boolean> {
  if (!element || !reachable(element)) return false;
  await tap(lab, middleOf(element));
  return true;
}

/**
 * Each skill's tooltip in the lobby (the class card's, the skill book's) opened by a finger's tap on its slot, as a
 * touch screen opens it (pinned beside the slot; closed after each, as the next tap elsewhere closes it). The book is
 * opened first by taps, as a player opens it: a short screen's rail turned to the skills, and the book's toggle.
 */
async function openSkillTipsTouch(lab: Lab): Promise<void> {
  openedBy = 'a tap';
  // (the first tap puts the page in touch mode, as a phone starts in it: what a finger reaches is judged in it)
  await tapIfReached(lab, document.querySelector<HTMLElement>('#lobby-rail [data-lt="skills"]'));
  // (a short screen shows it whole, with no toggle)
  const book = document.getElementById('lo-book')!;
  if (!book.checkVisibility()) await tapIfReached(lab, document.getElementById('lo-toggle'));
  if (!book.checkVisibility()) {
    const tab = document.getElementById('menu')!.dataset.tab;
    throw new Error(`lab: ui: the taps never opened the skill book (the lobby's tab: ${tab})`);
  }
  const slots = [...document.querySelectorAll<HTMLElement>('.cc-skills .slot:not(.empty), #lo-book .slot')];
  await openEach(slots, (slot) => tap(lab, middleOf(slot)), hideTooltip);
}

/**
 * The tooltip and the book closed, the rail turned back to the hero, and the mouse moved, which puts the page back in
 * mouse mode for the states after.
 */
async function closeSkillTipsTouch(lab: Lab): Promise<void> {
  hideTooltip();
  openBook(false);
  document.querySelector<HTMLElement>('#lobby-rail [data-lt="hero"]')?.click();
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  await lab.mouseTo({ x: innerWidth / 2 + 1, y: innerHeight / 2 });
  if (document.body.classList.contains('touch')) throw new Error('lab: ui: the mouse left the page in touch mode');
}

/** Every skill a player can reach showing its tooltip, each within the window. */
function skillTipsShown(): Found {
  const tallest = skillTips.reduce((most, tip) => Math.max(most, tip.box.height), 0);
  const height = `the tallest ${share(tallest, innerHeight)}% of the window`;
  const lines = [`  skill tooltips by ${openedBy}: ${skillTips.length} of ${skillSlots} skills, ${height}`];
  const problems: string[] = [];
  if (!skillSlots) problems.push('skills: no skill a player can reach');
  if (skillTips.length < skillSlots) {
    problems.push(`skills: ${skillSlots - skillTips.length} skills showed no tooltip by ${openedBy}`);
  }
  const loose = skillTips.filter((tip) => !tip.pinned).length;
  if (openedBy === 'a tap' && loose) problems.push(`skills: ${loose} skills' tooltips by a tap weren't pinned`);
  for (const { name, box } of skillTips) {
    const inside = box.left >= -0.5 && box.top >= -0.5 && box.right <= innerWidth + 0.5;
    if (inside && box.bottom <= innerHeight + 0.5) continue;
    const where = boxText({ x: box.x, y: box.y, w: box.width, h: box.height });
    problems.push(`skills: ${name}'s tooltip by ${openedBy} reaches past the window (${where})`);
  }
  return { lines, problems };
}

/** the scores' input: Tab held */
const TAB: Frame = { keys: ['tab'] };

/** how far to the side of the line to a dummy's label the canary plants its column (m): clear of the line */
const ASIDE = 3;
/** a planted column's radius and height (m): taller than any line from the camera to a label over the dais */
const COLUMN = { r: 0.5, h: 40 };

/** The dummies' labels shown now (each label anchored within a metre of a standing dummy), and how many there are. */
function dummyLabels(): { shown: number; all: number } {
  const dummies = G.enemies.filter((enemy) => enemy.def.dummy && enemy.alive);
  const near = (at: { x: number; z: number }) => dummies.some((d) => Math.hypot(d.pos.x - at.x, d.pos.z - at.z) < 1);
  const labels = anchoredLabels().filter(({ at }) => at && near(at));
  return { shown: labels.filter(({ label }) => label.shown).length, all: labels.length };
}

/** A column for each dummy's label, half way along the line from the camera to it (`aside`: that far off the line). */
function columnsBefore(aside: number): Obstacle[] {
  const from = G.camera.position;
  return anchoredLabels().flatMap(({ at }) => {
    if (!at) return [];
    const dx = at.x - from.x, dz = at.z - from.z, length = Math.hypot(dx, dz) || 1;
    const x = (from.x + at.x) / 2 - (dz / length) * aside, z = (from.z + at.z) / 2 + (dx / length) * aside;
    return [{ x, z, ...COLUMN }];
  });
}

/**
 * The dummies' labels behind a prop: a column planted between the camera and each (beside the line in the canary)
 * must hide every one, and with the columns gone every one shows again (#288: the labels showed through an obelisk).
 */
async function labelsBehindProps(canary: boolean, lab: Lab): Promise<Found> {
  const open = dummyLabels();
  const columns = columnsBefore(canary ? ASIDE : 0);
  G.arena.obstacles.push(...columns);
  await lab.step(1);
  const behind = dummyLabels();
  G.arena.obstacles.splice(G.arena.obstacles.length - columns.length, columns.length);
  await lab.step(1);
  const after = dummyLabels();
  const heroes = await metersBehindHero(lab, canary);
  const lines = [`  the dummies' labels: ${open.shown} of ${open.all} shown in the open, ${behind.shown} behind `
    + `${columns.length} columns, ${after.shown} with them gone`, ...heroes.lines];
  const problems: string[] = [...heroes.problems];
  if (!open.all) problems.push('behindProps: no label over a dummy was found');
  if (open.shown < open.all) problems.push(`behindProps: ${open.all - open.shown} labels hidden in the open`);
  if (behind.shown > 0) problems.push(`behindProps: ${behind.shown} labels shown through a prop`);
  if (after.shown < open.shown) problems.push(`behindProps: ${open.shown - after.shown} labels stayed hidden`);
  return { lines, problems };
}

/** How each state is opened and closed. */
const STEPS: Record<UiState, Steps> = {
  lobby: { open: () => undefined, close: () => undefined },
  tooltip: { open: openTooltip, close: hideTooltip },
  glow: { open: openGlow, close: closeGlow, check: glowShown, pictures: glowPictures },
  help: { open: openHelp, close: closeHelp },
  saves: { open: () => openSaves(true), close: () => openSaves(false) },
  heroes: { open: openHeroes, close: closeHeroes, check: heroesShown, closed: heroesClosed },
  readying: { open: openReadying, close: closeReadying, check: readyingShown },
  readyingHeroes: { open: openReadyingHeroes, close: closeReadyingHeroes, check: readyingHeroesShown },
  clicked: { open: clickClass, close: () => undefined, check: focusAfterClick },
  views: { open: switchViews, close: () => undefined, check: labelsThroughSwitches },
  behindProps: { open: () => undefined, close: () => undefined, check: labelsBehindProps },
  logLobby: { open: openLogLobby, close: closeLog, check: logShown },
  perfAsk: { open: openPerfAsk, close: closePerfAsk, check: (canary) => perfAskShown('perfAsk', canary) },
  coop: { open: openCoopPicked, close: closeCoopDialog, check: (canary) => coopShown('coop', canary) },
  coopRename: { open: openCoopRename, close: closeCoopDialog, check: (canary) => coopShown('coopRename', canary) },
  skillTipsTouch: { open: openSkillTipsTouch, close: closeSkillTipsTouch, check: skillTipsShown },
  heroesWarming: { open: openHeroesWarming, close: closeHeroesWarming, check: heroesWarmingShown },
  sheetTouch: { open: openSheetTouch, close: closeSheetTouch, check: sheetTouchShown },
  litTouch: {
    open: openLitTouch, close: closeLitTouch, check: litTouchShown, pictures: async () => litTouchPictures(),
  },
  buttonsTouch: { open: openButtonsTouch, close: () => undefined, check: lobbyButtonsShown },
  coopTouch: { open: openCoopTouch, close: closeCoopDialog, check: (canary) => coopShown('coopTouch', canary) },
  run: { open: () => undefined, close: () => undefined },
  // (shown while Tab is held: pictured with it down, let go after)
  scores: { open: (lab) => lab.step(SCORES_FRAMES, () => TAB), close: (lab) => lab.step(1), held: TAB },
  perf: { open: () => setPerfHud(true, false), close: () => setPerfHud(false, false) },
  decision: { open: showDecision, close: closeDecision, check: decisionShown },
  perfAskBreak: { open: openPerfAskBreak, close: closePerfAsk, check: (canary) => perfAskShown('perfAskBreak', canary) },
  pause: { open: () => openPause('controls', canaryAsked), close: closePause, check: () => pauseShown('controls') },
  pauseSettings: {
    open: () => openPause('settings', canaryAsked), close: closePause, check: () => pauseShown('settings'),
  },
  pauseVolume: {
    open: () => openPauseVolume(canaryAsked), close: closePauseVolume, check: (_canary, lab) => pauseVolumeChecked(lab),
  },
  pauseTabKept: { open: () => undefined, close: () => undefined, check: (canary, lab) => pauseTabKept(lab, canary) },
  // (held through, it abandons the run: the next run state sets one up again)
  pauseAbandon: {
    open: (lab) => openPauseAbandon(lab, canaryAsked),
    close: () => { closePauseAbandon(); runReady = false; },
    check: (_canary, lab) => pauseAbandonChecked(lab),
  },
  summary: { open: openSummary, close: hideSummary },
  skillTips: { open: openSkillTips, close: closeSkillTips, check: skillTipsShown },
  log: { open: openLog, close: closeLog, check: logShown },
  // (the page is left in touch mode from here on)
  logTouch: { open: openLogTouch, close: closeLog, check: logTouchShown },
  hudTouch: { open: openHudTouch, close: () => undefined, check: hudTouchShown },
  decisionTouch: { open: openDecisionTouch, close: closeDecisionTouch, check: decisionTouchShown },
  perfAskTouch: { open: openPerfAskTouch, close: closePerfAsk, check: (canary) => perfAskShown('perfAskTouch', canary) },
  buttonsRunTouch: { open: openButtonsTouch, close: () => undefined, check: runButtonsShown },
};

/** whether this page's run is set up for the run's states (each command's page is booted for it: false at first) */
let runReady = false;

/**
 * `lab ui`, a state at a time, the lobby's before the run's (the session asks for each: a 4K screen's ten pictures
 * sent back at once were too much for the browser, which closed): `state` opened, pictured whole with its named
 * elements' and labels' boxes as shares of the window, and closed again.
 */
export async function ui(lab: Lab, options: UiOptions): Promise<Report> {
  const { state } = options;
  if (options.hdr) await (await hdrOutput())?.forceHdr(true);
  if (RUN_STATES.includes(state) && !runReady) {
    await lab.setup({});
    await showLabels(lab);
    runReady = true;
  }
  const steps = STEPS[state];
  tallTips = !!options.canary;
  canaryAsked = !!options.canary;
  plantLitCanary(!!options.canary);
  await steps.open(lab);
  const pictured = await pictureState(lab, state, steps.held ?? {});
  const found = (await steps.check?.(!!options.canary, lab)) ?? { lines: [], problems: [] };
  const extra = (await steps.pictures?.(lab)) ?? [];
  const cursors = cursorsShown(!!options.canary);
  const digits = await digitsShown(lab, !!options.canary);
  await steps.close(lab);
  const after = steps.closed?.() ?? { lines: [], problems: [] };
  const lines = [...pictured.lines, ...found.lines, ...after.lines, ...cursors.lines, ...digits.lines];
  const problems = [...found.problems, ...after.problems, ...cursors.problems, ...digits.problems];
  const moments = [pictured.moment, ...extra, ...digits.moments];
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  const caught = cursors.problems.some((problem) => problem.includes('body'));
  lines.push(`  canary: ${caught ? 'the body\'s system cursor caught' : 'the body\'s system cursor went unseen'}`);
  const missed = caught ? [] : [`${state}: the canary's system cursor on the body went unseen`];
  for (const where of ['the page\'s text', 'the world\'s labels']) {
    const jumped = digits.problems.some((problem) => problem.includes(where));
    lines.push(`  canary: old-style digits in ${where} ${jumped ? 'caught' : 'went unseen'}`);
    if (!jumped) missed.push(`${state}: the canary's old-style digits in ${where} went unseen`);
  }
  if (state === 'pauseAbandon') {
    const caught = found.problems.some((problem) => problem.includes(ABANDON_CANARY.name));
    lines.push(`  canary: ${ABANDON_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${ABANDON_CANARY.what} went unseen`);
  }
  if (state === 'pauseTabKept') {
    const caught = found.problems.some((problem) => problem.includes(TAB_CANARY.name));
    lines.push(`  canary: ${TAB_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${TAB_CANARY.what} went unseen`);
  }
  if (state === 'pauseVolume') {
    const caught = found.problems.some((problem) => problem.includes(VOLUME_CANARY.name));
    lines.push(`  canary: ${VOLUME_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${VOLUME_CANARY.what} went unseen`);
  }
  if (state === 'pause' || state === 'pauseSettings') {
    const caught = found.problems.some((problem) => problem.includes(PAUSE_CANARY.name));
    lines.push(`  canary: ${PAUSE_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${PAUSE_CANARY.what} went unseen`);
  }
  for (const { name, what } of state === 'glow' ? Object.values(GLOW_CANARIES) : []) {
    const caught = found.problems.some((problem) => problem.includes(name));
    lines.push(`  canary: ${what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${what} went unseen`);
  }
  if (state === 'readying' && readyingBar()) {
    const wrapped = found.problems.some((problem) => problem.includes('runs onto'));
    lines.push(`  canary: ${wrapped ? 'the label a letter wide caught' : 'the label a letter wide went unseen'}`);
    if (!wrapped) missed.push(`${state}: the canary's label a letter wide went unseen`);
  }
  if (state === 'readyingHeroes' && readyingBar() && chillOf()) {
    const said = found.problems.some((problem) => problem.includes('the loading bar says'));
    lines.push(`  canary: "Readying the fight" for Change hero ${said ? 'caught' : 'went unseen'}`);
    if (!said) missed.push(`${state}: the canary's "Readying the fight" for Change hero went unseen`);
  }
  if (state === 'heroes' && document.getElementById('btn-hero')) {
    const caught = heroesCanaryCaught(found.problems);
    const planted = 'Back over the heroes\' names, a card\'s traits moved, the choice off the hero, a glow by the '
      + 'hidden hero\'s hand, an item of his draggable and the save slot letting a click through';
    lines.push(`  canary: ${planted} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${planted}: not all seen`);
  }
  if (state === 'behindProps') {
    const through = found.problems.some((problem) => problem.includes('shown through a prop'));
    lines.push(`  canary: ${through ? 'the labels beside the columns caught' : 'the labels beside the columns went unseen'}`);
    if (!through) missed.push(`${state}: the canary's labels beside the columns went unseen`);
    const overHero = found.problems.some((problem) => problem.includes('shown over the hero'));
    lines.push(`  canary: the meters placed seeing no hero ${overHero ? 'caught' : 'went unseen'}`);
    if (!overHero) missed.push(`${state}: the canary's meters placed seeing no hero went unseen`);
  }
  if (state === 'decision') {
    const caught = found.problems.some((problem) => problem.includes(DECISION_CANARY.name));
    lines.push(`  canary: ${DECISION_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${DECISION_CANARY.what} went unseen`);
  }
  if (state === 'coop' || state === 'coopRename' || state === 'coopTouch') {
    const caught = found.problems.some((problem) => problem.includes(COOP_CANARY.name));
    lines.push(`  canary: ${COOP_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${COOP_CANARY.what} went unseen`);
  }
  if (state === 'perfAskBreak' || state === 'perfAskTouch') {
    const caught = found.problems.some((problem) => problem.includes(ASK_CANARY.name));
    lines.push(`  canary: ${ASK_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${ASK_CANARY.what} went unseen`);
  }
  if (state === 'hudTouch' || state === 'decisionTouch') {
    const { name, what } = TOUCH_CANARIES[state];
    const caught = found.problems.some((problem) => problem.includes(name));
    lines.push(`  canary: ${what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${what} went unseen`);
  }
  if (state === 'buttonsTouch' || state === 'buttonsRunTouch') {
    const caught = found.problems.some((problem) => problem.includes(BUTTONS_CANARY.name));
    lines.push(`  canary: ${BUTTONS_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${BUTTONS_CANARY.what} went unseen`);
  }
  if (state === 'heroesWarming') {
    const caught = found.problems.some((problem) => problem.includes(HEROES_WARMING_CANARY.name));
    lines.push(`  canary: ${HEROES_WARMING_CANARY.what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) missed.push(`${state}: the canary's ${HEROES_WARMING_CANARY.what} went unseen`);
  }
  if (state === 'sheetTouch' || state === 'litTouch') {
    for (const { name, what } of SHEET_CANARIES[state]) {
      const caught = found.problems.some((problem) => problem.includes(name));
      lines.push(`  canary: ${what} ${caught ? 'caught' : 'went unseen'}`);
      if (!caught) missed.push(`${state}: the canary's ${what} went unseen`);
    }
  }
  if (state.startsWith('skillTips')) {
    const past = found.problems.some((problem) => problem.includes('reaches past the window'));
    lines.push(`  canary: ${past ? 'the tooltips as tall as the window caught' : 'the tall tooltips went unseen'}`);
    if (!past) missed.push(`${state}: the canary's tooltips as tall as the window went unseen`);
  }
  return { text: lines.join('\n'), problems: missed, moments };
}
