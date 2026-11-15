// tools/lab ui `villageMap`: the village's map laid flat, each name on it against the others and the sheet (from play,
// "need to fix the map, there is overlap": the Chronicle's name over the Stash's). None lies over another, each within
// the sheet, and each pointer's tip still at its place on the map, as a name moved aside must point where it did. Its
// canary lays one name on another.
//
// And walked with it open, it's seen through, and opaque again once he stops (from play: "make map semi-transparent if
// user opens a map and attempts to walk... if not attempt to walk, then keep opaque as current"): its opacity read
// standing, walking and stopped, and the hero checked to have walked. Its canary walks again with the map held opaque.
//
// And its style button pressed through every look (from the owner: "for maps, let the user choose the style"): each
// press the next look drawn, the button naming it, the pick kept in its cookie, the buttons within the sheet and over
// no name, the names apart, each look pictured. Its canary lays the buttons over a name.
import { setVillageMap } from '../../../src/ui/villageMap';
import { STYLE_NAMES, type MapStyle } from '../../../src/ui/villageMapLooks';
import { readCookie } from '../../../src/core/cookies';
import type { Lab, Pictured } from './lab';
import type { TouchFound } from './uiTouch';

/** the canary's problem, and what it plants */
export const VILLAGE_MAP_CANARY = { name: 'lies over', what: 'one name laid on another' };
/** the walk's canary's problem, and what it plants */
export const VILLAGE_MAP_WALK_CANARY = { name: 'not seen through walking', what: 'the map held opaque as he walks' };
/** the style button's canary's problem, and what it plants */
export const VILLAGE_MAP_STYLE_CANARY = { name: 'lies under the buttons', what: 'the map\'s buttons laid over a name' };
/** the looks in the order the button steps through them, from the first a fresh visit shows */
const STYLE_ORDER: readonly MapStyle[] = ['now', 'a', 'b', 'c'];
/** the cookie the pick is kept in (`ui/villageMapLooks.ts`) */
const STYLE_COOKIE = 'last-stand-map-style';
/** frames after a press for the sheet to be drawn again and its names laid */
const STYLE_FRAMES = 2;
/** frames for the map to unfold or fold (`FOLD_TIME` in `ui/villageMap.ts`, and some) */
const FOLD_FRAMES = 60;
/** how far a pointer's tip may stand from its place on the map (css px) */
const TIP_MOST_PX = 2;
/** frames walked with it open, and stood after; the most it may show of itself walking, the least standing; and the
 *  least he must have walked (m) */
const WALK_FRAMES = 40;
const SEEN_THROUGH_MOST = 0.5;
const OPAQUE_LEAST = 0.99;
const WALKED_LEAST = 1;

/** The map's opacity standing, walked with and stood again, and how far he walked. */
interface WalkedWith {
  standing: number;
  walking: number;
  stopped: number;
  walked: number;
}

/** What `openVillageMap` read as he walked with the map open. */
let walkedWith: WalkedWith | undefined;

/** The map's whole opacity as drawn. */
const mapOpacity = (): number => Number(getComputedStyle(document.querySelector('#vmap')!).opacity);

/** Walked with the map open and stood again, its opacity read each way. */
async function walkWithMap(lab: Lab): Promise<WalkedWith> {
  const standing = mapOpacity();
  const from = lab.player.pos.clone();
  await lab.step(WALK_FRAMES, () => ({ keys: ['w'] }));
  const walking = mapOpacity();
  const walked = lab.player.pos.distanceTo(from);
  await lab.step(WALK_FRAMES);
  return { standing, walking, stopped: mapOpacity(), walked };
}

/** Whether boxes `a` and `b` overlap. */
function overlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Each name on the map. */
const names = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#vmap .vm-name')];

/** The map laid flat. */
export async function openVillageMap(lab: Lab): Promise<void> {
  setVillageMap(true);
  await lab.step(FOLD_FRAMES);
  walkedWith = await walkWithMap(lab);
}

/** What walking with it open showed, and what of it is wrong. */
function walkFound(walk: WalkedWith | undefined): TouchFound {
  if (!walk) return { lines: [], problems: ['villageMap: never walked with the map open'] };
  const { standing, walking, stopped, walked } = walk;
  const lines = [`  walked ${walked.toFixed(1)} m with it open: opaque ${standing.toFixed(2)} standing, `
    + `${walking.toFixed(2)} walking, ${stopped.toFixed(2)} stopped`];
  const problems: string[] = [];
  if (walked < WALKED_LEAST) problems.push(`villageMap: he walked ${walked.toFixed(2)} m with the map open`);
  if (standing < OPAQUE_LEAST) problems.push(`villageMap: seen through standing (${standing.toFixed(2)})`);
  if (walking > SEEN_THROUGH_MOST) problems.push(`villageMap: not seen through walking (${walking.toFixed(2)})`);
  if (stopped < OPAQUE_LEAST) problems.push(`villageMap: seen through once he stopped (${stopped.toFixed(2)})`);
  return { lines, problems };
}

/** The map put away. */
export async function closeVillageMap(lab: Lab): Promise<void> {
  setVillageMap(false);
  await lab.step(FOLD_FRAMES);
}

/** Where `name`'s pointer's tip stands across the page (css px): its `left` as laid out, which it's centred on. */
function tipOf(name: HTMLElement): number {
  const box = name.getBoundingClientRect();
  return box.left + parseFloat(getComputedStyle(name, '::after').left);
}

/** The names' boxes against each other and the sheet, and their tips against their places. */
function namesFound(): TouchFound {
  const sheet = document.querySelector('#vmap .vm-sheet')!.getBoundingClientRect();
  const shown = names().map((name) => ({ name, box: name.getBoundingClientRect() }));
  const problems: string[] = [];
  if (shown.length < 2) problems.push('villageMap: no names on the map');
  let worstTip = 0;
  for (const [i, { name, box }] of shown.entries()) {
    const said = name.textContent;
    if (box.left < sheet.left || box.right > sheet.right || box.top < sheet.top || box.bottom > sheet.bottom) {
      problems.push(`villageMap: "${said}" reaches past the sheet`);
    }
    const place = sheet.left + (parseFloat(name.style.left) / 100) * sheet.width;
    const off = Math.abs(tipOf(name) - place);
    worstTip = Math.max(worstTip, off);
    if (off > TIP_MOST_PX) problems.push(`villageMap: "${said}" points ${off.toFixed(1)} px off its place`);
    for (const other of shown.slice(i + 1)) {
      if (overlap(box, other.box)) problems.push(`villageMap: "${said}" lies over "${other.name.textContent}"`);
    }
  }
  const lines = [`  ${shown.length} names on a sheet ${sheet.width.toFixed(0)} px across, `
    + `their pointers at most ${worstTip.toFixed(1)} px off their places`];
  return { lines, problems };
}

/** Each look as the style button left it, pictured, until `villageMapPictures` takes them. */
let stylePictures: Pictured[] = [];

/** The map's style as drawn, the button, and the buttons' box. */
const mapRoot = (): HTMLElement => document.querySelector<HTMLElement>('#vmap')!;
const styleButton = (): HTMLElement => document.querySelector<HTMLElement>('#vmap .vm-style')!;
const toolsBox = (): DOMRect => document.querySelector('#vmap .vm-tools')!.getBoundingClientRect();

/** The buttons against the sheet and the names: within it, and over none. */
function toolsFound(look: string): string[] {
  const sheet = document.querySelector('#vmap .vm-sheet')!.getBoundingClientRect();
  const tools = toolsBox();
  const problems: string[] = [];
  if (tools.left < sheet.left || tools.right > sheet.right || tools.top < sheet.top || tools.bottom > sheet.bottom) {
    problems.push(`villageMap: ${look}: the buttons reach past the sheet`);
  }
  for (const name of names()) {
    if (overlap(tools, name.getBoundingClientRect())) {
      problems.push(`villageMap: ${look}: "${name.textContent}" ${VILLAGE_MAP_STYLE_CANARY.name}`);
    }
  }
  return problems;
}

/** One look as the button left it: drawn, named, kept, its buttons and names checked, pictured. */
async function lookFound(lab: Lab, wanted: MapStyle, pressed: boolean): Promise<TouchFound> {
  const drawn = mapRoot().dataset.style;
  const said = styleButton().textContent ?? '';
  const kept = readCookie(STYLE_COOKIE);
  const problems: string[] = [];
  if (drawn !== wanted) problems.push(`villageMap: drawn in "${drawn}", where "${wanted}" was due`);
  if (said !== `Style: ${STYLE_NAMES[wanted]}`) problems.push(`villageMap: the style button says "${said}"`);
  if (pressed && kept !== wanted) problems.push(`villageMap: "${wanted}" picked, the cookie keeps "${kept}"`);
  problems.push(...toolsFound(wanted), ...namesFound().problems.map((problem) => `${problem} (${wanted})`));
  const tools = toolsBox();
  stylePictures.push(await lab.screen(`villageMap-${wanted}`, [said]));
  const lines = [`  ${said}: the buttons ${tools.width.toFixed(0)} by ${tools.height.toFixed(0)} px, kept as ${kept}`];
  return { lines, problems };
}

/**
 * The style button pressed through every look and back to the first, each look checked and pictured; the slow-game
 * prompt set aside meanwhile (the lab's boot on a loaded PC asks it, and on a phone's screen it lay over the buttons
 * and took the presses: no player meets it but after a slow minute, and it goes at a tap).
 */
async function stylesFound(lab: Lab): Promise<TouchFound> {
  stylePictures = [];
  const ask = document.getElementById('perf-ask');
  const askHeld = ask?.style.display ?? '';
  if (ask) ask.style.display = 'none';
  try {
    return await stepThroughStyles(lab);
  } finally {
    if (ask) ask.style.display = askHeld;
  }
}

/** Each look in turn by the style button, from the one shown. */
async function stepThroughStyles(lab: Lab): Promise<TouchFound> {
  const found: TouchFound = { lines: [], problems: [] };
  for (const [i, wanted] of [...STYLE_ORDER.slice(1), STYLE_ORDER[0]].entries()) {
    if (i === 0) {
      const first = await lookFound(lab, STYLE_ORDER[0], false);
      found.lines.push(...first.lines);
      found.problems.push(...first.problems);
    }
    await lab.clickOn(styleButton());
    await lab.step(STYLE_FRAMES);
    const look = await lookFound(lab, wanted, true);
    found.lines.push(...look.lines);
    found.problems.push(...look.problems);
  }
  stylePictures.pop();
  return found;
}

/** The buttons laid over the first name: the style button's canary, which must be found. */
function toolsOverName(): string[] {
  const tools = document.querySelector<HTMLElement>('#vmap .vm-tools')!;
  const name = names()[0].getBoundingClientRect();
  const sheet = document.querySelector('#vmap .vm-sheet')!.getBoundingClientRect();
  const held = tools.style.cssText;
  tools.style.right = 'auto';
  tools.style.left = `${name.left - sheet.left}px`;
  tools.style.top = `${name.top - sheet.top}px`;
  const problems = toolsFound('canary');
  tools.style.cssText = held;
  return problems;
}

/** The looks the style button stepped through, pictured (`ui`'s `pictures`), taken once. */
export function villageMapPictures(): Pictured[] {
  const pictures = stylePictures;
  stylePictures = [];
  return pictures;
}

/** A walk with the map open, held opaque by a style over the game's own: the walk's canary. */
async function walkHeldOpaque(lab: Lab): Promise<WalkedWith> {
  const held = document.createElement('style');
  held.textContent = '#vmap { opacity: 1 !important; }';
  document.head.append(held);
  const walk = await walkWithMap(lab);
  held.remove();
  return walk;
}

/** The names and the walk checked; with the canary, again with one name laid on another and walked with the map held
 *  opaque, which must be found. */
export async function villageMapShown(canary: boolean, lab: Lab): Promise<TouchFound> {
  const named = namesFound();
  const walk = walkFound(walkedWith);
  const styles = await stylesFound(lab);
  const found = {
    lines: [...named.lines, ...walk.lines, ...styles.lines],
    problems: [...named.problems, ...walk.problems, ...styles.problems],
  };
  if (!canary) return found;
  const overName = toolsOverName();
  const heldWalk = walkFound(await walkHeldOpaque(lab));
  const [first, second] = names();
  const heldLeft = second.style.left;
  const heldTop = second.style.top;
  second.style.left = first.style.left;
  second.style.top = first.style.top;
  const planted = namesFound();
  second.style.left = heldLeft;
  second.style.top = heldTop;
  return {
    lines: found.lines,
    problems: [...found.problems, ...planted.problems, ...heldWalk.problems, ...overName],
  };
}
