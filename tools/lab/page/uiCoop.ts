// `lab ui`'s states of the Play together dialog (src/ui/coop.ts) asking for the player's name tag before a room is
// opened or joined: as it opens, as a joiner refused for a tag the room already has is asked for another, and on
// touch, where the field is tapped for the phone's keyboard. The dialog must lie inside the window, and its name tag
// field, Open a room, the room's code and Join each be found at their middle (nothing over them, none past the
// window's edge); asked to rename, the taken tag must be marked, said, and focused, the room's code kept; on touch a
// finger's tap must focus the field. The hero's colour picker's swatches must each be found at their middle too, and
// a swatch clicked (a finger's tap on touch) picked: marked, kept, and the hero's cloth drawn in it at once.
// Its canary moves Open a room off the window's foot, which must be found.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { session } from '../../../src/net/session';
import { renderCoop } from '../../../src/ui/coop';
import type { Player } from '../../../src/entities/player';

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
/** the colour each state picks: clicked in the dialog, tapped on touch */
const PICKS = { coop: 'gold', coopTouch: 'blue' } as const;
/** the hero's cloth as drawn before the pick (`Dye.shown`), to see the pick drawn */
let wornBefore = 0;
/** where the game keeps the colour picked (net/heroColour.ts: not imported, as an older tree has none) */
const COLOUR_KEY = 'last-stand.colour.v1';

/** The hero's colour, and his cloth as drawn (none in an older tree). */
type Dyed = { colour?: string | null; setColour?(colour: string | null): void; model: { dye?: { shown: number } } };
const dyed = (player: Player): Dyed => player as unknown as Dyed;
const wornNow = (): number => dyed(G.player).model.dye?.shown ?? 0;

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

/**
 * The colour `id`'s swatch picked as a player picks it, by a click or a finger's tap: scrolled to in the dialog's box
 * first (a short screen has the colours under Host and Join), the box scrolled back to its top after. An older tree
 * has no picker: nothing is picked.
 */
async function pickSwatch(lab: Lab, id: string, how: 'click' | 'tap'): Promise<void> {
  const swatch = document.querySelector(`#coop .cc-swatch[data-colour="${id}"]`);
  if (!swatch) return;
  swatch.scrollIntoView({ block: 'nearest' });
  const box = swatch.getBoundingClientRect();
  const middle = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  if (how === 'click') await lab.click(middle);
  else await lab.tap(middle);
  document.querySelector('#coop .modal-box')?.scrollTo(0, 0);
  await lab.step(1);
}

/** The dialog opened and a colour clicked in it, as a player picks one. */
export async function openCoopPicked(lab: Lab): Promise<void> {
  await openCoopDialog(lab);
  wornBefore = wornNow();
  await pickSwatch(lab, PICKS.coop, 'click');
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
  wornBefore = wornNow();
  await pickSwatch(lab, PICKS.coopTouch, 'tap');
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
  // (no colour picked, the hero in his own, for the states after)
  localStorage.removeItem(COLOUR_KEY);
  dyed(G.player).setColour?.(null);
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
  // (scrolled in its box, a phone's dialog showed half of itself: "panel cut off")
  const content = document.querySelector<HTMLElement>('#coop .modal-box')!;
  if (content.scrollHeight > content.clientHeight + 1) {
    const hidden = content.scrollHeight - content.clientHeight;
    lines.push(`  the dialog scrolls: ${hidden} px of it out of its box`);
    problems.push(`${state}: the dialog scrolls (${hidden} px out of its box)`);
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
  const swatches = [...document.querySelectorAll<HTMLElement>('#coop .cc-swatch')];
  if (!swatches.length) problems.push(`${state}: no colour picker`);
  // (each scrolled to in the dialog's box first, as a player scrolls to it: a short screen has them under Host and
  // Join)
  const missed = swatches.flatMap((swatch) => {
    swatch.scrollIntoView({ block: 'nearest' });
    return reachable(swatch, `the ${swatch.title} swatch`, state);
  });
  document.querySelector('#coop .modal-box')?.scrollTo(0, 0);
  problems.push(...missed);
  lines.push(`  the colours: ${swatches.length - missed.length} of ${swatches.length} swatches in reach`);
  return { lines, problems };
}

/** A pick's own: only `want`'s swatch marked, the pick kept, the hero wearing it and his cloth drawn in it. */
function pickedFound(state: string, want: string): CoopFound {
  const marked = [...document.querySelectorAll<HTMLElement>('#coop .cc-swatch[aria-checked="true"]')];
  const shown = wornNow();
  const kept = localStorage.getItem(COLOUR_KEY);
  const problems: string[] = [];
  const names = marked.map((swatch) => swatch.dataset.colour || 'Any').join(', ');
  if (names !== want) problems.push(`${state}: ${want} picked, and the marked swatches are ${names || 'none'}`);
  if (kept !== want) problems.push(`${state}: the pick ${want} wasn't kept (${kept})`);
  const wears = dyed(G.player).colour;
  if (wears !== want) problems.push(`${state}: the hero wears ${wears}, not ${want}`);
  if (shown === wornBefore) problems.push(`${state}: the hero's cloth isn't drawn otherwise once ${want} was picked`);
  const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
  return { lines: [`  ${want} picked: his cloth ${hex(wornBefore)} to ${hex(shown)}`], problems };
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
  const picked = state === 'coopRename' ? null : pickedFound(state, PICKS[state]);
  const lines = [...found.lines, ...(own?.lines ?? []), ...(picked?.lines ?? [])];
  const problems = [...found.problems, ...(own?.problems ?? []), ...(picked?.problems ?? [])];
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
