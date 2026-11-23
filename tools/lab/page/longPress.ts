// A finger held on each of the touch controls (tools/lab `longpress`, src/ui/longPress.ts): in the village's training
// yard (its skill buttons, Bag, Map, the view, full screen and pause buttons, the move stick) and in a run (the same
// but the village's). A long press the page leaves un-prevented opens the browser's own menu over the game (Back,
// Forward, Reload, Download, Print, Share), as holding a skill button did on the owner's phone: every `contextmenu`
// must be prevented. And nothing of a control may be draggable, nor show a callout, nor be text to select. On main
// only the canvas and a few buttons prevented their menu.
//
// The lab's browser (headless Chrome) makes no long press of its own: neither a touch held through the DevTools
// protocol (`Input.dispatchTouchEvent`) nor its synthesized tap held 1.5 s (`Input.synthesizeTapGesture`) fired a
// `contextmenu`, on a blank page too, and the touch emulator's mouse-made touches hung. So each finger is put down
// as a touch screen's (the game's own press handled, a skill held as a player holds it), and the menu event a phone's
// Chrome then fires is sent at the element under it as Chrome sends it: a touch `PointerEvent`, bubbling, cancelable.
// Whether the browser's menu opens is whether it comes back prevented.
import * as THREE from 'three';
import { realWait } from './lab';
import type { Fixture, Lab, PagePoint, Report } from './lab';
import { yardToWorld } from '../../../src/data/village';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { openPanels, panelsOpen } from '../../../src/ui/menus';
import { setVillageMap } from '../../../src/ui/villageMap';
import { showTouchControls } from './touchStick';

export interface LongPressOptions {
  fixture: Fixture;
  /** plant the faults the checks must catch: the first skill button's text made selectable (its long press then
   *  left to the browser) and the second made draggable */
  canary: boolean;
}

/** the touch controls held, each a selector of the page's (every one it matches that shows) */
const CONTROLS = [
  '#touch-skills .slot', '#touch-pad', '#btn-pause', '#btn-full', '#btn-view',
  '#touch-village .tv-use', '#touch-village .tv-bag', '#touch-village .tv-map',
];
/** how long a finger is held before its long press fires, ms of the browser's own clock (Chrome's on a phone: 500) */
const HOLD_MS = 500;
/** frames run after a finger is lifted, and for the HUD to follow the hero to a new spot */
const LIFT_FRAMES = 4;
const SHOW_FRAMES = 15;
/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.4, y: 0.45 };
/** what counts as shown */
const SHOWN = { visibilityProperty: true, opacityProperty: true };

/** What one control's long press gave. */
interface Held {
  name: string;
  /** the `contextmenu` events it fired, and how many of them were left to the browser */
  menus: number;
  open: number;
}

/** The controls shown now, each with a name for the report (its selector, and its number among those it matches). */
function controlsShown(): { name: string; element: HTMLElement }[] {
  const found: { name: string; element: HTMLElement }[] = [];
  for (const selector of CONTROLS) {
    const all = [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => shownAtAll(element));
    for (const [i, element] of all.entries()) {
      found.push({ name: all.length > 1 ? `${selector} ${i + 1}` : selector, element });
    }
  }
  return found;
}

/** Whether `element` shows on the window and takes a finger at its middle. */
function shownAtAll(element: HTMLElement): boolean {
  if (!element.checkVisibility(SHOWN)) return false;
  const box = element.getBoundingClientRect();
  return box.width >= 1 && box.height >= 1;
}

/** Where a finger goes down on `element`: its middle. */
function pressPoint(element: HTMLElement): PagePoint {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** What a control lets the browser do with a finger's hold, besides its menu: drag it, call out, select its text. */
function looseParts(name: string, element: HTMLElement): string[] {
  const problems: string[] = [];
  for (const part of [element, ...element.querySelectorAll<HTMLElement>('*')]) {
    const what = part === element ? name : `${name} (its ${part.tagName.toLowerCase()})`;
    if (part.draggable) problems.push(`${what} is draggable`);
    const style = getComputedStyle(part);
    const select = style.userSelect || style.webkitUserSelect;
    if (select !== 'none') problems.push(`${what} has text to select (user-select: ${select})`);
    // (an empty value: this browser has no callouts to read)
    const callout = style.getPropertyValue('-webkit-touch-callout');
    if (callout && callout !== 'none') problems.push(`${what} shows a callout (-webkit-touch-callout: ${callout})`);
  }
  return problems;
}

/** The `contextmenu` a phone's Chrome fires at what lies under a finger held at `at`; whether it came back prevented
 *  (null: nothing lies there). */
function menuAt(at: PagePoint): boolean | null {
  const under = document.elementFromPoint(at.x, at.y);
  if (!under) return null;
  const fields = { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, button: 0 };
  const menu = new PointerEvent('contextmenu', { ...fields, pointerType: 'touch', isPrimary: true });
  under.dispatchEvent(menu);
  return menu.defaultPrevented;
}

/** A finger held on `element` long enough for a long press, its menu event sent, and lifted. */
async function holdOn(lab: Lab, name: string, element: HTMLElement): Promise<Held> {
  const at = pressPoint(element);
  await lab.touchDown(at);
  let prevented: boolean | null = null;
  try {
    await realWait(HOLD_MS);
    prevented = menuAt(at);
  } finally {
    await lab.touchUp();
  }
  await lab.step(LIFT_FRAMES);
  return { name, menus: prevented === null ? 0 : 1, open: prevented === false ? 1 : 0 };
}

/** Whatever a held finger's lift opened put away (its tap's click opens the pause menu, the bag or the map, where a
 *  phone's Chrome clicks nothing after a long press), each as the game puts it away. */
async function putAway(lab: Lab): Promise<void> {
  if (panelsOpen()) openPanels(null);
  if (!document.getElementById('vmap')?.classList.contains('hidden')) setVillageMap(false);
  if (G.paused) await lab.step(LIFT_FRAMES, () => ({ keys: ['escape'] }));
  await lab.step(LIFT_FRAMES);
}

/** Every control shown held in turn; its lines and problems, with `where` naming the place. */
async function holdEach(lab: Lab, where: string, canary: boolean): Promise<{ lines: string[]; problems: string[] }> {
  const lines = [`${where}:`];
  const problems: string[] = [];
  const controls = controlsShown();
  if (canary) plant(controls.map((control) => control.element));
  let menus = 0;
  for (const { name, element } of controls) {
    const loose = looseParts(name, element);
    if (!shownAtAll(element)) continue;
    const held = await holdOn(lab, name, element);
    await putAway(lab);
    menus += held.menus;
    const left = held.open ? `, ${held.open} left to the browser` : '';
    lines.push(`  ${name}: ${held.menus} menu events${left}${loose.length ? `; ${loose.length} loose parts` : ''}`);
    if (held.open) problems.push(`${where}: a long press on ${name} opens the browser's menu`);
    problems.push(...loose.map((problem) => `${where}: ${problem}`));
  }
  if (canary) unplant(controls.map((control) => control.element));
  if (controls.length === 0) problems.push(`${where}: no touch control shows`);
  // (a press on what lies over no control would pass having measured nothing)
  if (menus < controls.length) problems.push(`${where}: ${controls.length - menus} long presses landed on nothing`);
  return { lines, problems };
}

/** The canary's faults: the first skill button's text selectable, the second draggable. */
function plant(elements: HTMLElement[]): void {
  const skills = elements.filter((element) => element.matches('#touch-skills .slot'));
  if (skills[0]) skills[0].style.userSelect = 'text';
  if (skills[1]) skills[1].draggable = true;
}

function unplant(elements: HTMLElement[]): void {
  const skills = elements.filter((element) => element.matches('#touch-skills .slot'));
  if (skills[0]) skills[0].style.userSelect = '';
  if (skills[1]) skills[1].draggable = false;
}

/** The hero stood in the village's training yard, the page in touch mode, the touch controls shown. */
async function inTheYard(lab: Lab): Promise<boolean> {
  if (G.arena.place !== 'village' || G.mode !== 'menu') return false;
  if (!document.body.classList.contains('touch')) await lab.tap({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
  const [x, z] = yardToWorld(0, 0);
  lab.player.walkTo = null;
  lab.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SHOW_FRAMES);
  return true;
}

/** The problems a canary's faults must have raised, of those found with them planted. */
function caughtOf(problems: string[]): string[] {
  const selectable = problems.some((problem) => problem.includes('slot 1') && problem.includes('browser\'s menu'));
  const draggable = problems.some((problem) => problem.includes('slot 2 is draggable'));
  const missed = [];
  if (!selectable) missed.push('canary: the first skill button made selectable, its menu left open, went unseen');
  if (!draggable) missed.push('canary: the second skill button made draggable went unseen');
  return missed;
}

export async function longPress(lab: Lab, options: LongPressOptions): Promise<Report> {
  const lines = [`the ${G.player.cls.id}, each control held ${HOLD_MS} ms and its long press's menu event sent`];
  const problems: string[] = [];
  const places: string[] = [];
  if (await inTheYard(lab)) places.push('the village\'s training yard');
  else lines.push('  (not in the village: the run alone)');
  const yard = places.length ? await holdEach(lab, places[0], options.canary) : { lines: [], problems: [] };
  await lab.setup(options.fixture);
  await showTouchControls(lab);
  const run = await holdEach(lab, 'a run', options.canary);
  lines.push(...yard.lines, ...run.lines);
  const found = [...yard.problems, ...run.problems];
  if (!options.canary) return { text: lines.join('\n'), problems: found };
  const missed = caughtOf(run.problems);
  lines.push(`canaries: ${2 - missed.length} of 2 caught`);
  return { text: lines.join('\n'), problems: missed };
}
