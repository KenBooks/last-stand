// `lab ui`'s states of the Play together dialog (src/ui/coop.ts) asking for the player's name tag before a room is
// opened or joined: as it opens, as a joiner refused for a tag the room already has is asked for another, and on
// touch, where the field is tapped for the phone's keyboard. The dialog must lie inside the window, and its name tag
// field, Open a room, the room's code and Join each be found at their middle (nothing over them, none past the
// window's edge); asked to rename, the taken tag must be marked, said, and focused, the room's code kept; on touch a
// finger's tap must focus the field. The hero's colour picker's swatches must each be found at their middle too, and
// a swatch clicked (a finger's tap on touch) picked: marked, kept, and the hero's cloth drawn in it at once.
// What's typed stays through the dialog's renders (#555: a name tag typed was gone once the code was): the coop state
// types a tag and pastes a code, picks a colour (which renders the dialog again) and renders it as the session's
// changes do with the code field focused; the rename state retypes the taken tag and renders it again. The coop
// state then presses Open a room and Join with the heroes cold, as a first visit's are: the button pressed must say
// it's waiting, everything wait with it, what was typed stay, and once warm the room's own view say it's opening or
// joining; left or cancelled, the dialog's choices come back as they were.
// Its canary moves Open a room off the window's foot, which must be found.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import * as warm from '../../../src/game/warm';
import { session, leaveRoom } from '../../../src/net/session';
import { openCoop, renderCoop } from '../../../src/ui/coop';
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

/** what the coop state types in the dialog: a name tag, then a room's code (pasted, as from a friend's message) */
const TYPED = { tag: 'Wren', code: 'MX4PL' };
/** what the rename state types over the taken tag */
const RETYPED = 'Guest Two';
/** where the game keeps the name tag (net/nameTag.ts): a room asked for keeps it, taken off for the states after */
const NAME_KEY = 'last-stand.name.v1';
/** what the coop state saw on its way, before its dialog is checked as it ends */
let seen: CoopFound = { lines: [], problems: [] };

const coopField = (id: string): HTMLInputElement | null => document.querySelector<HTMLInputElement>(`#coop #${id}`);

/** `text` typed in the dialog's field `id` as a player types it: the field clicked, what's in it picked, the text put
 *  in its place by the browser (`lab.type`, as a paste or a phone's keyboard puts it). */
async function typeInto(lab: Lab, id: string, text: string): Promise<void> {
  const field = coopField(id)!;
  await lab.clickOn(field);
  field.select();
  await lab.type(text);
}

/** The tag and code as `when` left them, against what was typed (`code`: none expected where the room was left). */
function fieldsKept(when: string, code = TYPED.code): void {
  const tag = coopField('coop-tag')?.value ?? 'none', room = coopField('coop-code')?.value ?? 'none';
  seen.lines.push(`  ${when}: the name tag "${tag}", the code "${room}"`);
  if (tag !== TYPED.tag) seen.problems.push(`coop: ${when}, the name tag typed ("${TYPED.tag}") reads "${tag}"`);
  if (room !== code) seen.problems.push(`coop: ${when}, the code typed ("${code}") reads "${room}"`);
}

/** The dialog rendered again (as a session's change renders it) with `id` typed in: still focused, nothing lost. */
async function renderedTyping(lab: Lab, id: string, state: string, problems: string[]): Promise<void> {
  const field = coopField(id)!;
  field.focus();
  renderCoop();
  await lab.step(1);
  const kept = document.activeElement === coopField(id);
  if (!kept) problems.push(`${state}: rendered again while typing, the ${id} field lost the focus`);
}

/** The press of `button` (Open a room, Join) waiting for the heroes: said on it and over the choices, the rest
 *  waiting too, what was typed kept, and the dialog still within the window with its controls in reach. */
function waitingFound(which: 'host' | 'join', says: string): void {
  const state = `coop (${which === 'host' ? 'Open a room' : 'Join'} pressed, the heroes cold)`;
  const pressed = document.querySelector<HTMLButtonElement>(which === 'host' ? '#btn-coop-host' : '#coop .coop-join button');
  const other = document.querySelector<HTMLButtonElement>(which === 'host' ? '#coop .coop-join button' : '#btn-coop-host');
  const status = document.querySelector('#coop .coop-checking')?.textContent ?? '';
  seen.lines.push(`  ${state}: "${pressed?.textContent}", "${status}"`);
  if (!pressed?.textContent?.includes(says)) seen.problems.push(`${state}: the button reads "${pressed?.textContent}"`);
  if (!pressed?.disabled || !other?.disabled) seen.problems.push(`${state}: Open a room and Join don't both wait`);
  if (!coopField('coop-tag')?.disabled || !coopField('coop-code')?.disabled) {
    seen.problems.push(`${state}: the name tag and the code can still be changed while it waits`);
  }
  if (!status) seen.problems.push(`${state}: nothing over the choices says it's waiting`);
  fieldsKept(state);
  // (its choices disabled as meant: the rest of the dialog's checks)
  const found = dialogFound(state);
  seen.problems.push(...found.problems.filter((problem) => !problem.includes('is disabled')));
}

/** The room's own view once the heroes are warm: `status` reached, and its words saying what it does. */
function roomFound(status: string, says: string): void {
  const view = document.querySelector('#coop .coop-body')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  seen.lines.push(`  warm: ${session.status}, "${view.slice(0, 60)}…"`);
  if (session.status !== status) seen.problems.push(`coop: once warm, the session is ${session.status}, not ${status}`);
  if (!view.includes(says)) seen.problems.push(`coop: once warm, the dialog doesn't say "${says}"`);
}

/** The dialog's choices back as `when` left them: open to press, their own words, the tag typed kept. */
function choicesBack(when: string): void {
  const host = document.querySelector<HTMLButtonElement>('#btn-coop-host');
  const join = document.querySelector<HTMLButtonElement>('#coop .coop-join button');
  if (!host || !join) {
    seen.problems.push(`coop: ${when}, the dialog's choices aren't back`);
    return;
  }
  if (host.disabled || join.disabled || host.textContent !== 'Open a room' || join.textContent !== 'Join') {
    seen.problems.push(`coop: ${when}, Open a room and Join read "${host.textContent}" and "${join.textContent}"`);
  }
  if (document.querySelector('#coop .coop-choice.busy')) seen.problems.push(`coop: ${when}, the choices still wait`);
  fieldsKept(when, '');
}

/** The heroes warmed, as their warm-up ends, and the press waiting goes ahead (it does as the wait resolves). */
async function warmed(lab: Lab): Promise<void> {
  warm.markWarm('heroes');
  await new Promise((resolve) => setTimeout(resolve));
  await lab.step(1);
}

/** Open a room, then Join, pressed with the heroes cold (`chill`), each waiting and then going ahead: the room opened
 *  and left, the room joined and the joining cancelled (a refusal renders the same choices again). */
async function pressesFound(lab: Lab): Promise<void> {
  const chill = (warm as { chill?: (need: 'heroes') => void }).chill;
  if (!chill) return;
  chill('heroes');
  await lab.clickOn(document.getElementById('btn-coop-host')!);
  await lab.step(1);
  waitingFound('host', 'Opening a room');
  await warmed(lab);
  roomFound('hosting', 'Room');
  leaveRoom();
  await lab.step(1);
  choicesBack('the room opened and left');
  chill('heroes');
  await typeInto(lab, 'coop-code', TYPED.code);
  await lab.clickOn(document.querySelector('#coop .coop-join button')!);
  await lab.step(1);
  waitingFound('join', 'Joining');
  await warmed(lab);
  roomFound('joining', `Joining room ${TYPED.code}`);
  await lab.clickOn(document.getElementById('btn-coop-leave')!);
  await lab.step(1);
  choicesBack('the joining cancelled');
}

/** the problem the canary must raise */
export const COOP_CANARY = { name: 'Open a room lies past', what: 'Open a room moved off the window\'s foot' };

/** The dialog opened from the lobby: the panels' link clicked, or as the village's campfire opens it. */
export function openFromLobby(): void {
  const link = document.getElementById('btn-coop');
  if (link) link.click();
  else openCoop(true);
}

/** The dialog opened as the lobby opens it, the co-op server found up (the lab's link: `?net=local`). */
export async function openCoopDialog(lab: Lab): Promise<void> {
  history.replaceState(null, '', `${location.pathname}?net=local`);
  openFromLobby();
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

/** The dialog opened, a name tag typed and a code pasted, a colour clicked in it as a player picks one, the dialog
 *  rendered again while the code is typed in, and Open a room and Join pressed with the heroes cold. */
export async function openCoopPicked(lab: Lab): Promise<void> {
  await openCoopDialog(lab);
  seen = { lines: [], problems: [] };
  await typeInto(lab, 'coop-tag', TYPED.tag);
  await typeInto(lab, 'coop-code', TYPED.code);
  fieldsKept('the code typed');
  wornBefore = wornNow();
  await pickSwatch(lab, PICKS.coop, 'click');
  fieldsKept('a colour picked (the dialog rendered again)');
  await renderedTyping(lab, 'coop-code', 'coop', seen.problems);
  fieldsKept('rendered again as the code is typed in');
  await pressesFound(lab);
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
  // (its taken tag picked as it opens: checked before the retyping replaces it)
  renameOpened = {
    picked: (() => {
      const field = coopField('coop-tag');
      return document.activeElement === field && field?.selectionStart === 0 && field.selectionEnd === TAKEN.tag.length;
    })(),
  };
  await lab.type(RETYPED);
  const problems: string[] = [];
  await renderedTyping(lab, 'coop-tag', 'coopRename', problems);
  renameOpened.problems = problems;
}

/** the rename state's tag as it opened: picked to retype, and what rendering it again as it was retyped found */
let renameOpened: { picked: boolean; problems?: string[] } = { picked: false };

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
  // (no name tag kept, for the states after: the coop state's presses kept the one it typed)
  localStorage.removeItem(NAME_KEY);
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
  if (!renameOpened.picked) problems.push(`${state}: the taken tag wasn't picked to retype as the dialog opened`);
  if (document.activeElement !== field) problems.push(`${state}: the name tag field isn't focused to retype`);
  if (field?.value !== RETYPED) problems.push(`${state}: retyped "${RETYPED}", rendered again it reads "${field?.value}"`);
  if (code?.value !== TAKEN.code) problems.push(`${state}: the room's code wasn't kept (${code?.value ?? 'none'})`);
  problems.push(...(renameOpened.problems ?? []));
  return { lines: [`  asked to rename: "${said}"`, `  retyped and rendered again: "${field?.value}"`], problems };
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
  const typing = state === 'coop' ? seen : null;
  const lines = [...found.lines, ...(own?.lines ?? []), ...(picked?.lines ?? []), ...(typing?.lines ?? [])];
  const problems = [...found.problems, ...(own?.problems ?? []), ...(picked?.problems ?? []), ...(typing?.problems ?? [])];
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
