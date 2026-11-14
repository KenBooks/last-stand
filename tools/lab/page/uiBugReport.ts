// `lab ui`'s states of the bug report's form (src/ui/bugReport.ts), filed as a player files one.
// `bugReport`, with the mouse from the lobby's pause menu: Report a bug clicked at the menu's foot; the form must lie
// inside the window without scrolling, each of its controls found at its middle, a picture of the game taken, and the
// game held under it. Then a report is made: nothing leaves on a press with the form empty; a kind clicked is the one
// marked; a key pressed in the field is the field's, never the game's; the report shown whole holds what was typed
// and where the player was; Send's first try fails (the server answers 503), said so with the form kept and Send
// become Try again; Try again sends it to the reports service the lab started for the command (node/tracesService.mjs:
// the node side reads it back with the service's token and holds it to what was sent); Done gives the game back; and
// what's typed is kept when the form is closed by Esc, then copied by Copy report.
// `bugReportTouch`, by a finger over a run's pause menu: the same fit, each button a finger's height, each field's
// text 16 css px at least (a phone zooms the page into a smaller one), and the report saying the run and its wave.
// Nothing leaves for anywhere else: the clipboard is stood in for, a new tab is caught, and every report's POST must go
// to the lab's own service, or it's turned away here (never production's).
// Its canaries: the form's box twice the window's height, which must be found here; and the report's picture taken out
// on its way to the service, which the node side's read-back must find.
import { middleOf, realWait } from './lab';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { BUG_REPORT, REPORT_KINDS } from '../../../src/data/bugReport';
import { input } from '../../../src/core/input';
import { bugReportOpen, bugReportServer, bugReportShot, closeBugReport } from '../../../src/ui/bugReport';
import { showPause } from '../../../src/ui/menus';
import { touchMode } from './uiTouch';

/** What a state found besides its boxes: lines for its report, and its problems. */
export interface BugReportFound {
  lines: string[];
  problems: string[];
}

type State = 'bugReport' | 'bugReportTouch';

/** the problem the box's canary must raise */
export const BUG_REPORT_CANARY = { name: 'reaches past the window', what: 'the form twice the window\'s height' };

/** what of the form a player must reach, by its selector and what it's called in a report (each kind besides) */
const CONTROLS: [string, string][] = [
  ['#br-text', 'What happened'],
  ['#br-expected', 'What did you expect'],
  ['#br-shot-on', 'Include this picture'],
  ['.br-sent summary', 'See everything in the report'],
  ['#br-cancel', 'Cancel'],
  ['#br-copy', 'Copy report'],
  ['#br-send', 'Send'],
];
/** the kinds picked, what's typed, and the key pressed in the field (one the game walks the hero by) */
const PICKED = { bugReport: 'looks', bugReportTouch: 'slow' } as const;
const TYPED = 'The warrior\'s arm went through his shield as he walked while blocking.';
const EXPECTED = 'The shield stays on his arm.';
const KEY = { code: 'KeyW', game: 'w' };
/** the least a finger's button is tall, and a field's text, on touch (css px as the screen has them) */
const FINGER = { kind: 36, button: 40, text: 16 };
/** how long the picture's JPEG may take to be made (the browser's frames) */
const SHOT_FRAMES = 240;
/** a picture under this many bytes is a blank canvas's (1280x720 of black is 6 KB as a JPEG) */
const BLANK_BYTES = 12_000;
/** frames run for the form to open and its picture to be asked of one */
const OPEN_FRAMES = 2;
/** how many rounds of a frame and 5 ms of the browser's time a send may take to answer */
const SEND_ROUNDS = 1000;
/** the path a report is posted to (src/ui/bugReportSend.ts) */
const REPORTS_PATH = '/traces/reports';

const root = (): HTMLElement => document.getElementById('bug-report')!;
const part = <T extends HTMLElement = HTMLElement>(selector: string): T => root().querySelector<T>(selector)!;
const kindButton = (id: string): HTMLElement => part(`.br-kind[data-kind="${id}"]`);

/** what the form put on the clipboard and the tabs it opened, in place of the browser's (nothing leaves the page) */
let copied: string[] = [];
let opened: string[] = [];
let realOpen: typeof window.open | null = null;
let realWrite: Clipboard['writeText'] | null = null;
let realFetch: typeof window.fetch | null = null;
/** the reports service the node side started for the command (`ui`'s `reports` option) */
let service: string | null = null;
/** the reports posted, by where they were posted, and whether the next is answered 503 as a failed send */
let posted: string[] = [];
let failNext = false;
/** with the canary, each report's picture taken out on its way (the read-back must find it gone) */
let dropPicture = false;
/** the pictures a state took along its way */
let pictures: Pictured[] = [];

/** The reports service the node side started for this command: Send sends there, and nowhere else. */
export function useReportService(url: string | undefined): void {
  service = url ?? null;
}

/** A request's address, whatever form `fetch` was given it in. */
function addressOf(request: RequestInfo | URL): string {
  if (typeof request === 'string') return request;
  return request instanceof URL ? request.href : request.url;
}

/** `fetch` as the form meets it: a report's POST to the lab's service (failed once if asked, its picture taken out
 *  for the canary), any other report's turned away. */
const reportFetch: typeof window.fetch = async (request, init) => {
  const address = addressOf(request);
  if (init?.method !== 'POST' || !address.endsWith(REPORTS_PATH)) return realFetch!.call(window, request, init);
  posted.push(address);
  if (!service || !address.startsWith(service)) return new Response('not the lab\'s service', { status: 599 });
  if (failNext) {
    failNext = false;
    return new Response('busy', { status: 503 });
  }
  if (!dropPicture) return realFetch!.call(window, request, init);
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  return realFetch!.call(window, request, { ...init, body: JSON.stringify({ ...body, picture: null }) });
};

function standIn(): void {
  copied = [];
  opened = [];
  posted = [];
  failNext = false;
  dropPicture = false;
  realOpen = window.open;
  window.open = (url) => { opened.push(String(url)); return null; };
  realWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = async (text) => { copied.push(text); };
  realFetch = window.fetch;
  window.fetch = reportFetch;
  bugReportServer(service ?? 'http://127.0.0.1:9');
}

function standOut(): void {
  if (realOpen) window.open = realOpen;
  if (realWrite) navigator.clipboard.writeText = realWrite;
  if (realFetch) window.fetch = realFetch;
  realOpen = realWrite = realFetch = null;
  bugReportServer(undefined);
}

/** `element` pressed as the state's player presses: the mouse's click, or a finger's tap. */
async function pressOn(lab: Lab, state: State, element: HTMLElement): Promise<void> {
  element.scrollIntoView({ block: 'nearest' });
  if (state === 'bugReport') await lab.click(middleOf(element));
  else await lab.tap(middleOf(element));
  await lab.step(1);
}

/** `text` typed into the focused field as a keyboard types it (the lab's keys carry no text of their own). */
function type(text: string): void {
  document.execCommand('insertText', false, text);
}

/** Frames and the browser's time until `done` (a send answers in the browser's time, not the lab's frames). */
async function until(lab: Lab, done: () => boolean): Promise<boolean> {
  for (let round = 0; round < SEND_ROUNDS && !done(); round++) {
    await lab.step(1);
    await realWait(5);
  }
  return done();
}

/** Report a bug pressed at the pause menu's foot, and the form's picture waited for. */
async function openForm(lab: Lab, state: State): Promise<void> {
  // (the lab's frames draw nothing unless asked: the form's picture is of the first frame drawn after it opens)
  const drawing = lab.drawing;
  lab.drawing = true;
  await pressOn(lab, state, document.getElementById('btn-report')!);
  await lab.step(OPEN_FRAMES);
  lab.drawing = drawing;
  for (let f = 0; f < SHOT_FRAMES && !bugReportShot(); f++) await window.__labClock.realFrame();
}

/** The lobby's pause menu up, its foot pictured with the way in, and the form opened from it by a click. */
export async function openBugReport(lab: Lab, canary: boolean): Promise<void> {
  pictures = [];
  standIn();
  showPause(true);
  await lab.step(1);
  pictures.push(await lab.screen('bugReport-entry', ['the pause menu: Report a bug at its foot'], '#pause .pause-box'));
  await openForm(lab, 'bugReport');
  if (canary) part('.br-box').style.minHeight = `${2 * innerHeight}px`;
}

/** The run's pause menu up on touch, and the form opened from it by a tap. */
export async function openBugReportTouch(lab: Lab, canary: boolean): Promise<void> {
  pictures = [];
  standIn();
  await touchMode(lab);
  showPause(true);
  await lab.step(1);
  await openForm(lab, 'bugReportTouch');
  if (canary) part('.br-box').style.minHeight = `${2 * innerHeight}px`;
}

export function closeBugReportState(): void {
  part('.br-box').style.minHeight = '';
  part<HTMLTextAreaElement>('#br-text').value = '';
  part<HTMLInputElement>('#br-expected').value = '';
  closeBugReport();
  showPause(false);
  standOut();
}

/** The pictures the state took along its way. */
export const bugReportPictures = (): Pictured[] => pictures;

/** Whether `element` is what a press at its middle lands on, and its box inside the window. */
function reachable(element: HTMLElement | null, name: string, state: State): string[] {
  if (!element?.checkVisibility()) return [`${state}: no ${name} shown`];
  const box = element.getBoundingClientRect();
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    return [`${state}: ${name} lies past the window's edge`];
  }
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  if (!hit || !(hit === element || element.contains(hit) || hit.contains(element))) return [`${state}: something lies over ${name}`];
  return [];
}

const share = (px: number, whole: number): string => ((100 * px) / whole).toFixed(1);

/** The form's box against the window, and its controls each found. */
function formFound(state: State): BugReportFound {
  if (!bugReportOpen()) return { lines: [], problems: [`${state}: the form didn't open`] };
  const box = part('.br-box');
  const at = box.getBoundingClientRect();
  const problems: string[] = [];
  const past = at.left < 0 || at.top < 0 || at.right > innerWidth || at.bottom > innerHeight;
  if (past) problems.push(`${state}: the form ${BUG_REPORT_CANARY.name}`);
  const scrolls = box.scrollHeight > box.clientHeight + 1;
  if (scrolls) problems.push(`${state}: the form scrolls (${box.scrollHeight} px of content in ${box.clientHeight})`);
  for (const kind of REPORT_KINDS) problems.push(...reachable(kindButton(kind.id), `the kind ${kind.label}`, state));
  for (const [selector, name] of CONTROLS) problems.push(...reachable(root().querySelector<HTMLElement>(selector), name, state));
  const shot = bugReportShot();
  if (!shot) problems.push(`${state}: no picture of the game was taken`);
  else if (Math.max(shot.width, shot.height) > BUG_REPORT.shotSide) problems.push(`${state}: the picture is ${shot.width}x${shot.height}, over ${BUG_REPORT.shotSide} px`);
  else if (shot.bytes > BUG_REPORT.mostShotBytes) problems.push(`${state}: the picture is ${shot.bytes} bytes, over the server's ${BUG_REPORT.mostShotBytes}`);
  // (a frame of the game is never a flat colour: a JPEG this small is a blank canvas's)
  else if (shot.bytes < BLANK_BYTES) problems.push(`${state}: the picture is blank (${shot.bytes} bytes)`);
  const lines = [
    `  the form ${share(at.width, innerWidth)}% of the window's width, ${share(at.height, innerHeight)}% of its height, `
      + `${scrolls ? 'scrolling' : 'not scrolling'}; ${REPORT_KINDS.length} kinds and ${CONTROLS.length} controls looked for`,
    `  the picture: ${shot ? `${shot.width}x${shot.height}, ${Math.round(shot.bytes / 1024)} KB` : 'none'}`,
  ];
  return { lines, problems };
}

/** How many real css px a px of the form's zoomed box is. */
function boxScale(): number {
  const box = part('.br-box');
  return box.offsetHeight ? box.getBoundingClientRect().height / box.offsetHeight : 1;
}

/** On touch: every kind and button a finger's height, every field's text large enough not to be zoomed into. */
function fingerSizes(state: State): BugReportFound {
  const problems: string[] = [];
  const kinds = REPORT_KINDS.map((kind) => kindButton(kind.id).getBoundingClientRect().height);
  const buttons = ['#br-cancel', '#br-copy', '#br-send'].map((s) => part(s).getBoundingClientRect().height);
  const texts = ['#br-text', '#br-expected'].map((s) => parseFloat(getComputedStyle(part(s)).fontSize) * boxScale());
  if (Math.min(...kinds) < FINGER.kind - 0.5) problems.push(`${state}: a kind is ${Math.min(...kinds).toFixed(1)} css px tall, under ${FINGER.kind}`);
  if (Math.min(...buttons) < FINGER.button - 0.5) problems.push(`${state}: a button is ${Math.min(...buttons).toFixed(1)} css px tall, under ${FINGER.button}`);
  if (Math.min(...texts) < FINGER.text - 0.05) problems.push(`${state}: a field's text is ${Math.min(...texts).toFixed(1)} css px, under ${FINGER.text}`);
  const lines = [`  on touch: kinds ${Math.min(...kinds).toFixed(0)} css px tall at least, buttons ${Math.min(...buttons).toFixed(0)}, `
    + `fields' text ${Math.min(...texts).toFixed(1)}`];
  return { lines, problems };
}

/** A kind pressed, the field pressed and typed into, a key of the game's pressed in it: lines and problems. */
async function fillIn(lab: Lab, state: State): Promise<BugReportFound> {
  const problems: string[] = [];
  const kind = REPORT_KINDS.find((k) => k.id === PICKED[state])!;
  await pressOn(lab, state, kindButton(kind.id));
  const marked = [...root().querySelectorAll('.br-kind[aria-checked="true"]')].map((b) => (b as HTMLElement).dataset.kind);
  if (marked.length !== 1 || marked[0] !== kind.id) problems.push(`${state}: ${kind.label} pressed, marked: ${marked.join(', ') || 'none'}`);
  if (part('.br-hint').textContent !== kind.hint) problems.push(`${state}: the kind's hint isn't shown`);
  const field = part<HTMLTextAreaElement>('#br-text');
  await pressOn(lab, state, field);
  const focused = document.activeElement === field;
  if (!focused) problems.push(`${state}: a press on What happened didn't focus it`);
  await lab.keyDown(KEY.code);
  const taken = input.down.has(KEY.game) || input.pressed.has(KEY.game);
  await lab.keyUp(KEY.code);
  if (taken) problems.push(`${state}: ${KEY.code} pressed in the field reached the game`);
  type(TYPED);
  if (field.value !== TYPED) problems.push(`${state}: typing into What happened left "${field.value}"`);
  await lab.step(1);
  const lines = [`  ${kind.label} ${state === 'bugReport' ? 'clicked' : 'tapped'}: marked ${marked.join(', ') || 'none'}; `
    + `the field ${focused ? 'focused' : 'not focused'}, ${KEY.code} in it ${taken ? 'reached the game' : 'kept from the game'}`];
  return { lines, problems };
}

/** The report shown whole (See everything in the report pressed): its text, the details shut again after. */
async function wholeReport(lab: Lab, state: State, label: string | null): Promise<string> {
  await pressOn(lab, state, part('.br-sent summary'));
  const text = part('.br-sent pre').textContent ?? '';
  if (label) pictures.push(await lab.screen(label, ['the report shown whole before it leaves'], '#bug-report .br-box'));
  part<HTMLDetailsElement>('.br-sent').open = false;
  await lab.step(1);
  return text;
}

/** Send pressed with the server failing it once, then again: whether it said so and kept the form, and the code. */
async function sendTwice(lab: Lab, state: State): Promise<BugReportFound> {
  const problems: string[] = [];
  failNext = true;
  await pressOn(lab, state, part('#br-send'));
  const said = await until(lab, () => (part('.br-note').textContent ?? '').startsWith('Not sent'));
  const kept = part<HTMLTextAreaElement>('#br-text').value === TYPED && part('.br-done').classList.contains('hidden');
  const again = part('#br-send').textContent === 'Try again';
  if (!said) problems.push(`${state}: a send the server failed wasn't said to have failed`);
  if (!kept) problems.push(`${state}: a failed send didn't keep the form as it was`);
  if (!again) problems.push(`${state}: after a failed send, Send doesn't offer to try again`);
  pictures.push(await lab.screen(`${state}-failed`, ['Send failed by the server: said, the form kept'], '#bug-report .br-box'));
  await pressOn(lab, state, part('#br-send'));
  const sent = await until(lab, () => !part('.br-done').classList.contains('hidden'));
  const code = /report ([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(part('.br-done-text').textContent ?? '')?.[1];
  if (!sent || !code) problems.push(`${state}: Try again didn't send the report (${part('.br-note').textContent})`);
  const offHost = posted.filter((address) => !service || !address.startsWith(service));
  if (offHost.length) problems.push(`${state}: a report was posted to ${offHost.join(', ')}, not the lab's service`);
  const shot = bugReportShot();
  const lines = [
    `  Send failed by the server: ${said ? 'said' : 'not said'}, the form ${kept ? 'kept' : 'lost'}, `
      + `${again ? 'Try again offered' : 'no Try again'}; ${posted.length} posts, all to the lab's service: ${!offHost.length}`,
    // (the node side reads this line's code back from the service and holds what came to it: tracesService.mjs)
    code ? `  sent to the reports service: ${code}, kind ${PICKED[state]}, what happened ${TYPED.length} characters, `
      + `picture ${shot?.bytes ?? 0} bytes` : '  sent to the reports service: nothing',
  ];
  return { lines, problems };
}

/** The mouse's state: the form found, then a report made of it as a player makes one. */
async function reportMade(lab: Lab, canary: boolean): Promise<BugReportFound> {
  const state = 'bugReport';
  const found = formFound(state);
  if (!bugReportOpen()) return found;
  if (!service) throw new Error('lab: ui bugReport: no reports service of the lab\'s own to send to');
  // (with the canary, the box's plant has been found: the form put back, and the report's picture dropped on its way)
  if (canary) {
    part('.br-box').style.minHeight = '';
    dropPicture = true;
    await lab.step(1);
  }
  const { lines, problems } = found;
  const held = G.menuOpen && G.paused;
  if (!held) problems.push(`${state}: the game goes on under the form (solo)`);
  // (empty, a press makes no report)
  await pressOn(lab, state, part('#br-send'));
  const refused = part('.br-note').classList.contains('bad') && !posted.length;
  if (!refused) problems.push(`${state}: Send pressed on an empty form wasn't refused`);
  const filled = await fillIn(lab, state);
  await pressOn(lab, state, part('#br-expected'));
  type(EXPECTED);
  await lab.step(1);
  pictures.push(await lab.screen('bugReport-filled', ['a kind picked, what happened and what was expected typed'], '#bug-report .br-box'));
  const text = await wholeReport(lab, state, 'bugReport-whole');
  for (const needed of ['About: Looks wrong', TYPED, EXPECTED, 'Where: the ', 'Build: ', 'Graphics: ', 'Browser: ']) {
    if (!text.includes(needed)) problems.push(`${state}: the report shown lacks "${needed}"`);
  }
  const sending = await sendTwice(lab, state);
  problems.push(...sending.problems);
  if (opened.length) problems.push(`${state}: the form opened ${opened.join(', ')}`);
  problems.push(...reachable(part('#br-close'), 'Done', state));
  // (the code is the service's random one: shown as a placeholder for the picture, so a run's pictures repeat)
  const doneText = part('.br-done-text');
  const said = doneText.textContent ?? '';
  doneText.textContent = said.replace(/[0-9A-Z]{4}-[0-9A-Z]{4}/, 'ABCD-1234');
  pictures.push(await lab.screen('bugReport-done', ['after Send: the report\'s code (a placeholder)'], '#bug-report .br-box'));
  doneText.textContent = said;
  await pressOn(lab, state, part('#br-close'));
  const back = !bugReportOpen() && !G.menuOpen && !G.paused;
  if (!back) problems.push(`${state}: Done didn't give the game back`);
  // (opened again: empty after a report sent; typed into and closed by Esc in the field, it keeps what was typed)
  await openForm(lab, state);
  const emptied = part<HTMLTextAreaElement>('#br-text').value === '';
  if (!emptied) problems.push(`${state}: the form kept the report it had sent`);
  await fillIn(lab, state);
  await lab.press('Escape');
  await lab.step(1);
  const shut = !bugReportOpen();
  if (!shut) problems.push(`${state}: Esc in the field didn't close the form`);
  await openForm(lab, state);
  const kept = part<HTMLTextAreaElement>('#br-text').value === TYPED;
  if (!kept) problems.push(`${state}: what was typed was lost as the form closed`);
  copied = [];
  await pressOn(lab, state, part('#br-copy'));
  const copiedText = copied[0] ?? '';
  if (!copiedText.includes(TYPED) || !copiedText.includes('Where: ')) problems.push(`${state}: Copy report copied "${copiedText.slice(0, 60)}"`);
  problems.push(...reachable(part('#br-shot-copy'), 'Copy picture', state));
  lines.push(
    `  the game ${held ? 'held' : 'going on'} under the form; an empty form's Send ${refused ? 'refused' : 'taken'}`,
    ...filled.lines,
    ...sending.lines,
    `  Done: the game ${back ? 'given back' : 'still held'}; opened again ${emptied ? 'empty' : 'not empty'}; `
      + `Esc in the field ${shut ? 'closed it' : 'did nothing'}, what was typed ${kept ? 'kept' : 'lost'}; `
      + `Copy report copied ${copiedText.length} characters`,
  );
  return { lines, problems };
}

/** The touch state: the form found over a run, a finger's sizes, a report filled in by taps and shown whole. */
async function reportByTouch(lab: Lab, canary: boolean): Promise<BugReportFound> {
  const state = 'bugReportTouch';
  const found = formFound(state);
  if (canary || !bugReportOpen()) return found;
  const sizes = fingerSizes(state);
  const filled = await fillIn(lab, state);
  // (the field let go: a phone's keyboard put away, the form whole again for its picture)
  part('#br-text').blur();
  root().classList.remove('typing');
  await lab.step(1);
  pictures.push(await lab.screen('bugReportTouch-filled', ['over a run on touch: a kind tapped, what happened typed'], '#bug-report .br-box'));
  const text = await wholeReport(lab, state, null);
  const problems = [...found.problems, ...sizes.problems, ...filled.problems];
  const where = /^Where: (.*)$/m.exec(text)?.[1] ?? '';
  if (!/^a (training )?run, wave \d+/.test(where)) problems.push(`${state}: the report says the player was in "${where}", not a run`);
  if (!text.includes('touch')) problems.push(`${state}: the report doesn't say the game is played by touch`);
  return { lines: [...found.lines, ...sizes.lines, ...filled.lines, `  the report: Where: ${where}`], problems };
}

/** The state checked as it stands open. */
export function bugReportChecked(state: State, lab: Lab, canary: boolean): Promise<BugReportFound> {
  return state === 'bugReport' ? reportMade(lab, canary) : reportByTouch(lab, canary);
}
