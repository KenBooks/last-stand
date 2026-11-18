// The game's UI as the player sees it on this screen (tools/lab `ui`), a state at a time: the lobby, an item's tooltip,
// the stash's items lit for a hovered item's slot, the hero selection screen, the run's HUD with the world's labels
// over it, the pause menu's tabs, the run's summary, the touch HUD... Each state is a module of `uiStates/` (its
// name the state's, its default export how it's opened, checked and closed: `uiKit.ts` `Steps`), loaded as it runs.
// Here is what every state gets: pictured whole, with the boxes of the page's named elements and of the labels as
// shares of the window, the cursor over every element the mouse can be over the game's own, never the system's, and
// every digit shown on its line (`digits.ts`). On two screens (`--screens`), a UI laid out as a share of the screen
// shows the same lines and the same pictures on both, whatever the screens' pixel ratios: a 4K screen at 300% as at
// 100%.
import * as THREE from 'three';
import type { Frame, Lab, Pictured, Report } from './lab';
import { NUMBER_COLORS } from '../../../src/data/balance';
import { floatText } from '../../../src/ui/floaters';
import * as overlay from '../../../src/ui/overlay/layer';
import { hdrOutput } from './hdrOutput';
import { digitsShown } from './digits';
import { asked, boxText, describe, runSetUp, settleAnimations } from './uiKit';
import type { Found, Steps } from './uiKit';

/** A state pictured: the name of its module in `uiStates/` (node/commands/ui.mjs lists them in their `order`). */
export type UiState = string;

export interface UiOptions {
  state: UiState;
  /** HDR forced on first, as on a display in HDR mode (the pause menu then shows its levels) */
  hdr?: boolean;
  /** the system's cursor planted on the page's body: the cursors' check must find it */
  canary?: boolean;
  /** the bug report states' reports service, the lab's own (node/tracesService.mjs): Send sends there alone */
  reports?: string;
}

/** Every state's module, loaded as it runs: one importing game code an A/B's older commit hasn't got stops no other. */
const STATES = import.meta.glob<{ default: Steps }>('./uiStates/*.ts');

/** The steps of `state`, from its module in `uiStates/`. */
async function stepsOf(state: UiState): Promise<Steps> {
  const load = STATES[`./uiStates/${state}.ts`];
  if (!load) throw new Error(`lab: ui: no state ${state} (tools/lab/page/uiStates/${state}.ts)`);
  return (await load()).default;
}

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
/** the system's cursors listed of a state at most */
const CURSORS_LISTED = 5;

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

/** The page as it is now, pictured and its boxes listed under `state`, a frame on with `held` held down. */
async function pictureState(lab: Lab, state: UiState, held: Frame): Promise<{ lines: string[]; moment: Pictured }> {
  settleAnimations();
  await lab.step(1, () => held);
  settleAnimations();
  const lines = [state, ...namedBoxes().map((line) => `  ${line}`), ...labelBoxes().map((line) => `  ${line}`)];
  const moment = await lab.screen(state);
  return { lines, moment };
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

/**
 * The canaries every state carries looked for: the system's cursor planted on the body (`cursorsShown`) and old-style
 * digits in the page's text and the world's labels (`digitsShown`).
 */
function sharedCanaries(state: UiState, cursors: Found, digits: Found): Found {
  const lines: string[] = [];
  const problems: string[] = [];
  const caught = cursors.problems.some((problem) => problem.includes('body'));
  lines.push(`  canary: ${caught ? 'the body\'s system cursor caught' : 'the body\'s system cursor went unseen'}`);
  if (!caught) problems.push(`${state}: the canary's system cursor on the body went unseen`);
  for (const where of ['the page\'s text', 'the world\'s labels']) {
    const jumped = digits.problems.some((problem) => problem.includes(where));
    lines.push(`  canary: old-style digits in ${where} ${jumped ? 'caught' : 'went unseen'}`);
    if (!jumped) problems.push(`${state}: the canary's old-style digits in ${where} went unseen`);
  }
  return { lines, problems };
}

/**
 * `lab ui`, a state at a time, the lobby's before the run's (the session asks for each: a 4K screen's ten pictures
 * sent back at once were too much for the browser, which closed): `state` opened, pictured whole with its named
 * elements' and labels' boxes as shares of the window, and closed again.
 */
export async function ui(lab: Lab, options: UiOptions): Promise<Report> {
  const { state } = options;
  const canary = !!options.canary;
  const steps = await stepsOf(state);
  if (options.hdr) await (await hdrOutput())?.forceHdr(true);
  if (steps.inRun && !runSetUp.ready) {
    await lab.setup({});
    await showLabels(lab);
    runSetUp.ready = true;
  }
  asked.canary = canary;
  asked.reports = options.reports;
  await steps.open(lab);
  const pictured = await pictureState(lab, state, steps.held ?? {});
  const found = (await steps.check?.(canary, lab)) ?? { lines: [], problems: [] };
  const extra = (await steps.pictures?.(lab)) ?? [];
  const cursors = cursorsShown(canary);
  const digits = await digitsShown(lab, canary);
  await steps.close(lab);
  const after = steps.closed?.() ?? { lines: [], problems: [] };
  const lines = [...pictured.lines, ...found.lines, ...after.lines, ...cursors.lines, ...digits.lines];
  const problems = [...found.problems, ...after.problems, ...cursors.problems, ...digits.problems];
  const moments = [pictured.moment, ...extra, ...digits.moments];
  if (!canary) return { text: lines.join('\n'), problems, moments };
  const shared = sharedCanaries(state, cursors, digits);
  const own = steps.canary?.(found, state) ?? { lines: [], problems: [] };
  lines.push(...shared.lines, ...own.lines);
  return { text: lines.join('\n'), problems: [...shared.problems, ...own.problems], moments };
}
