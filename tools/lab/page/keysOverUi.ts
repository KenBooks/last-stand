// The keyboard's skill keys with the pointer resting on the page's UI (tools/lab `overui`): in a fight, each key of
// the hero's that a skill is on is pressed with the pointer over the world and again with it over the UI. A keyboard
// key must do over the UI what it does over the world; a mouse button that casts over the world must not over the UI
// (a press there is the UI's). From play: the number keys cast nothing in a fight while "mouse was hovering over
// skill", "same thing when hovering over a perf panel", "or any other panel" (#816): the pointer over the UI held
// every key off, the keyboard's too.
import { middleOf } from './lab';
import type { Fixture, Lab, Report } from './lab';
import { input } from '../../../src/core/input';
import { G } from '../../../src/state';
import { on } from '../../../src/events';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import type { SkillKey } from '../../../src/types';

export interface KeysOverUiOptions {
  fixture: Fixture;
  canary?: boolean;
}

/** the frames a key is held, and the most given to its skill to be used once it's let go (an aimed one casts then) */
const HELD = 4;
const WITHIN = 60;
/** the frames between two presses: the last one's action over */
const BETWEEN = 90;

const byMouse = (key: SkillKey): boolean => key === 'mouse0' || key === 'mouse2';

/** `key` pressed with the pointer over the world or over the UI, the hero's Energy and cooldowns full: whether a
 *  skill was used. With `planted`, the canary's fault: over the UI he's held to a truce, and casts nothing. */
async function pressed(lab: Lab, key: SkillKey, overUI: boolean, planted: boolean): Promise<boolean> {
  const hero = G.player;
  await lab.step(BETWEEN);
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  let used = false;
  const off = on('skillUsed', () => {
    used = true;
  });
  hero.truce = planted && overUI;
  try {
    const held = byMouse(key) ? { m0: key === 'mouse0', m2: key === 'mouse2' } : { keys: [key] };
    await lab.step(HELD, () => ({ ...held, overUI }));
    for (let frame = 0; frame < WITHIN && !used; frame++) await lab.step(1, () => ({ overUI }));
  } finally {
    off();
    hero.truce = false;
  }
  return used;
}

/** what a real press of each of the mouse's buttons on a part of the page came to: whether the game took it as a
 *  press on the world (the button down, the pointer not held to be over the UI for it) */
interface RealPress {
  left: boolean;
  right: boolean;
}

/** Real presses of the mouse's two buttons on the page's part `selector`; null where it isn't shown. */
async function realPress(lab: Lab, selector: string): Promise<RealPress | null> {
  const part = document.querySelector<HTMLElement>(selector);
  if (!part) return null;
  // (a part the player switches on, the performance panel, is shown for the presses alone)
  const hidden = part.classList.contains('hidden');
  part.classList.remove('hidden');
  await lab.step(1);
  if (!part.getClientRects().length) return null;
  const at = middleOf(part);
  await lab.mouseDown(at);
  const left = input.mouse.left && !input.mouse.overUI;
  await lab.mouseUp(at);
  await lab.mouseDown(at, 'right');
  const right = input.mouse.right && !input.mouse.overUIRight;
  await lab.mouseUp(at, 'right');
  part.classList.toggle('hidden', hidden);
  return { left, right };
}

/** the page's parts pressed for real, and which of the mouse's buttons must reach the world through each: a
 *  slot of the skill bar only shows a tip (both); the performance panel copies on a left click (the right) */
const PARTS: { name: string; selector: string; left: boolean; right: boolean }[] = [
  { name: 'a slot of the skill bar', selector: '#hotbar .slot', left: true, right: true },
  { name: 'the performance panel', selector: '#perf', left: false, right: true },
];

/** `lab overui`: every skill key over the world and over the UI; with `canary` nothing casts over the UI, which the
 *  keyboard's keys must be found to differ by. */
export async function keysOverUi(lab: Lab, options: KeysOverUiOptions): Promise<Report> {
  await lab.setup(options.fixture);
  const hero = G.player;
  const bound = SKILL_KEYS.filter((key) => hero.skillAt(key));
  const lines: string[] = [];
  const problems: string[] = [];
  let keyboardCast = 0;
  for (const key of bound) {
    const skill = hero.skillAt(key)!.def.name;
    const overWorld = await pressed(lab, key, false, false);
    const overUI = await pressed(lab, key, true, Boolean(options.canary));
    const said = (used: boolean): string => (used ? 'cast' : 'nothing cast');
    lines.push(`${key} (${skill}): over the world ${said(overWorld)}, the pointer over the UI ${said(overUI)}`);
    if (byMouse(key)) {
      if (overUI) problems.push(`${key} cast ${skill} with the pointer over the UI: its press is the UI's`);
      continue;
    }
    if (overWorld) keyboardCast++;
    if (overWorld !== overUI) {
      problems.push(`${key} (${skill}) ${said(overUI)} with the pointer over the UI, ${said(overWorld)} over the world`);
    }
  }
  // (and a real press on a slot of the skill bar, which has no action of its own: the world's)
  const whose = (worlds: boolean): string => (worlds ? 'the world\'s' : 'the UI\'s');
  for (const part of PARTS) {
    const press = await realPress(lab, part.selector);
    if (!press) throw new Error(`lab: overui: ${part.name} isn't shown to press`);
    lines.push(`a press on ${part.name}: the left button ${whose(press.left)}, the right ${whose(press.right)}`);
    if (press.left !== part.left) problems.push(`a left press on ${part.name} was ${whose(press.left)}`);
    if (press.right !== part.right) problems.push(`a right press on ${part.name} was ${whose(press.right)}`);
  }
  // (the state checked to have happened: a keyboard key that casts at all, or nothing was compared)
  if (!keyboardCast) throw new Error('lab: overui: no keyboard key of the hero\'s cast over the world');
  if (!options.canary) return { text: lines.join('\n'), problems };
  const caught = problems.some((problem) => problem.includes('nothing cast with the pointer over the UI'));
  lines.push(`canary, nothing cast over the UI: ${caught ? 'caught' : 'went unseen'}`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: nothing cast over the UI went unseen'] };
}
