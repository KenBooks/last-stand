// `lab ui`'s states of the Play together dialog (src/ui/coop.ts) asking for the player's name tag before a room is
// opened or joined: as it opens, as a joiner refused for a tag the room already has is asked for another, and on
// touch, where the field is tapped for the phone's keyboard. The dialog must lie inside the window, and its name tag
// field, Open a room, the room's code and Join each be found at their middle (nothing over them, none past the
// window's edge); asked to rename, the taken tag must be marked, said, and focused, the room's code kept; on touch a
// finger's tap must focus the field. Its canary moves Open a room off the window's foot, which must be found.
import type { Lab } from './lab';
import { session } from '../../../src/net/session';
import { renderCoop } from '../../../src/ui/coop';

/** What a state found besides its boxes: lines for its report, and its problems. */
export interface CoopFound {
  lines: string[];
  problems: string[];
}

/** what of the dialog a player must reach, by its selector and what it's called in a report */
const CONTROLS: [string, string][] = [
  ['#coop-tag', 'the name tag field'],
  ['#btn-coop-host', 'Open a room'],
  ['#coop-code', 'the room code field'],
  ['.coop-join button', 'Join'],
];
/** the tag and room the rename state is refused for */
const TAKEN = { tag: 'Guest', code: 'KQ7RT' };
/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.5, y: 0.4 };
const TOUCH_FRAMES = 2;
/** the problem the canary must raise */
export const COOP_CANARY = { name: 'Open a room lies past', what: 'Open a room moved off the window\'s foot' };

/** The dialog opened as its button opens it, the co-op server found up (the lab's link: `?net=local`). */
export async function openCoopDialog(lab: Lab): Promise<void> {
  history.replaceState(null, '', `${location.pathname}?net=local`);
  document.getElementById('btn-coop')!.click();
  // (the server's check is a promise, answered at once for the local link)
  await new Promise((resolve) => setTimeout(resolve, 0));
  await lab.step(1);
}

/** The dialog as a joiner sees it once the host refused its tag: asked for another (`session.renameAsked`). */
export async function openCoopRename(lab: Lab): Promise<void> {
  await openCoopDialog(lab);
  session.status = 'failed';
  session.renameAsked = true;
  session.tag = TAKEN.tag;
  session.code = TAKEN.code;
  session.error = `Someone in that room is already called ${TAKEN.tag}: pick another name tag to join.`;
  renderCoop();
  await lab.step(1);
}

/** The dialog in touch mode (put there by a finger's tap on the world), its name tag field tapped. */
export async function openCoopTouch(lab: Lab): Promise<void> {
  if (!document.body.classList.contains('touch')) {
    await lab.tap({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
    await lab.step(TOUCH_FRAMES);
  }
  await openCoopDialog(lab);
  const field = document.getElementById('coop-tag')!;
  const box = field.getBoundingClientRect();
  await lab.tap({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  await lab.step(1);
}

export function closeCoopDialog(): void {
  session.status = 'off';
  session.renameAsked = false;
  session.error = '';
  session.code = '';
  (document.activeElement as HTMLElement | null)?.blur();
  document.getElementById('btn-coop-close')!.click();
  history.replaceState(null, '', location.pathname);
}

/** Whether `element` is what a click at its middle lands on, and its box inside the window. */
function reachable(element: HTMLElement, name: string, state: string): string[] {
  const box = element.getBoundingClientRect();
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    return [`${state}: ${name} lies past the window's edge`];
  }
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  if (!hit || !(hit === element || element.contains(hit))) return [`${state}: something lies over ${name}`];
  return [];
}

/** The dialog's box and controls: lines and problems, as `state`'s. */
function dialogFound(state: string): CoopFound {
  const box = document.querySelector<HTMLElement>('#coop .modal-box')?.getBoundingClientRect();
  if (!box || document.getElementById('coop')!.classList.contains('hidden')) {
    return { lines: [], problems: [`${state}: the dialog isn't shown`] };
  }
  const size = `${box.width.toFixed(0)}x${box.height.toFixed(0)} px`;
  const lines = [`  the dialog: ${size}, from ${box.top.toFixed(0)} px down`];
  const problems: string[] = [];
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    problems.push(`${state}: the dialog reaches past the window`);
  }
  for (const [selector, name] of CONTROLS) {
    const element = document.querySelector<HTMLElement>(`#coop ${selector}`);
    if (!element) {
      problems.push(`${state}: no ${name}`);
      continue;
    }
    const missed = reachable(element, name, state);
    problems.push(...missed);
    const disabled = (element as HTMLButtonElement).disabled ? ', disabled' : '';
    lines.push(`  ${name}: ${missed.length ? 'out of reach' : 'in reach'}${disabled}`);
    if (disabled) problems.push(`${state}: ${name} is disabled (the server not found up)`);
  }
  return { lines, problems };
}

/** The rename state's own: the taken tag marked, said and focused, the room's code kept. */
function renameFound(state: string): CoopFound {
  const field = document.getElementById('coop-tag') as HTMLInputElement | null;
  const code = document.getElementById('coop-code') as HTMLInputElement | null;
  const said = document.querySelector('#coop .coop-error')?.textContent ?? '';
  const problems: string[] = [];
  if (!document.querySelector('#coop .coop-tag.taken')) problems.push(`${state}: the taken tag isn't marked`);
  if (!said.includes(TAKEN.tag)) problems.push(`${state}: the refusal doesn't name the taken tag`);
  if (document.activeElement !== field) problems.push(`${state}: the name tag field isn't focused to retype`);
  if (code?.value !== TAKEN.code) problems.push(`${state}: the room's code wasn't kept (${code?.value ?? 'none'})`);
  return { lines: [`  asked to rename: "${said}"`], problems };
}

/** The touch state's own: the field the finger tapped has the focus (the phone's keyboard comes up for it). */
function touchFound(state: string): CoopFound {
  const focused = document.activeElement === document.getElementById('coop-tag');
  const touch = document.body.classList.contains('touch');
  const problems: string[] = [];
  if (!touch) problems.push(`${state}: the page isn't in touch mode`);
  if (!focused) problems.push(`${state}: a tap on the name tag field didn't focus it`);
  return { lines: [`  the name tag field ${focused ? 'focused' : 'not focused'} by a tap`], problems };
}

/** The dialog checked as `state` shows it; with the canary, again with Open a room moved off the window's foot. */
export function coopShown(state: 'coop' | 'coopRename' | 'coopTouch', canary: boolean): CoopFound {
  const found = dialogFound(state);
  const own = state === 'coopRename' ? renameFound(state) : state === 'coopTouch' ? touchFound(state) : null;
  const lines = [...found.lines, ...(own?.lines ?? [])];
  const problems = [...found.problems, ...(own?.problems ?? [])];
  if (!canary) return { lines, problems };
  const host = document.getElementById('btn-coop-host')!;
  // (its transitions off: a button's eases its transform, and the move wasn't there yet when measured)
  host.style.transition = 'none';
  host.style.transform = 'translateY(200vh)';
  const planted = dialogFound(state);
  host.style.transform = '';
  host.style.transition = '';
  return { lines, problems: [...problems, ...planted.problems] };
}
