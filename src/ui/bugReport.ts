// The bug report's form (`#bug-report`, styles/_bugReport.scss): opened from the pause menu's foot (any element of
// the class `report-link` opens it). The player picks what the trouble is about (data/bugReport.ts), says what happened and, if they
// like, what they expected; a picture of the game as it was when the form opened goes with it unless they untick it;
// and the game adds where they were and what they play on (bugReportText.ts), shown whole under "See everything in
// the report". Nothing leaves the device until a button is pressed: Copy report puts the text on the clipboard, Open
// on GitHub opens a new issue filled in with it, labelled by its kind. An address can't carry a picture, so after
// either the form offers the picture to copy or save, to add by hand.
// What's typed is kept while the page lives, till a report is made of it.
import { G } from '../state';
import { BUG_REPORT, REPORT_KINDS, type ReportKind } from '../data/bugReport';
import { sfx } from '../core/audio';
import { isCoop } from '../net/role';
import { aboveKeyboard } from './aboveKeyboard';
import { copyText } from './clipboard';
import { issueUrl, reportFacts, reportText, type ReportDraft } from './bugReportText';

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(`#bug-report ${s}`)!;
const root = (): HTMLElement => document.getElementById('bug-report')!;

let closed: () => void = () => {};
let kind: ReportKind | null = null;
/** the lines the game adds, read as the form opens (they say where the player was then, not where the form is) */
let facts: string[] = [];
/** the picture asked of the next frame drawn, and the one taken: shrunk on a canvas, as a JPEG and its address */
let shotWanted = false;
let shot: { canvas: HTMLCanvasElement; blob: Blob; url: string } | null = null;

const draft = (): ReportDraft => ({
  kind: kind ?? REPORT_KINDS[REPORT_KINDS.length - 1],
  text: $<HTMLTextAreaElement>('#br-text').value,
  expected: $<HTMLInputElement>('#br-expected').value,
  picture: !!shot && $<HTMLInputElement>('#br-shot-on').checked,
});

export const bugReportOpen = (): boolean => !root().classList.contains('hidden');

/** The form's buttons and fields bound, its kinds laid out; `onClosed` is told each time it closes. */
export function initBugReport(onClosed: () => void): void {
  closed = onClosed;
  const kinds = $('.br-kinds');
  for (const k of REPORT_KINDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'br-kind';
    b.dataset.kind = k.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.textContent = k.label;
    b.onclick = () => { sfx.click(); pick(k); };
    kinds.appendChild(b);
  }
  const text = $<HTMLTextAreaElement>('#br-text'), expected = $<HTMLInputElement>('#br-expected');
  text.maxLength = BUG_REPORT.mostText;
  expected.maxLength = BUG_REPORT.mostExpected;
  for (const field of [text, expected]) {
    field.addEventListener('input', () => { say(''); changed(); });
    aboveKeyboard(root(), field);
  }
  $('#br-shot-on').addEventListener('change', changed);
  // (Esc closes the form from a field too, where the game's keys aren't read; from anywhere else main.ts reads it)
  root().addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeBugReport();
  });
  $('form').addEventListener('submit', (e) => e.preventDefault());
  $('#br-cancel').onclick = () => { sfx.click(); closeBugReport(); };
  $('#br-copy').onclick = () => { sfx.click(); void copyReport(); };
  $('#br-github').onclick = () => { sfx.click(); void openIssue(); };
  $('#br-close').onclick = () => { sfx.click(); closeBugReport(); };
  $('#br-shot-copy').onclick = () => { sfx.click(); void copyPicture(); };
}

/** The form opened on what was typed before, with a picture of the game as its next frame is drawn. */
export function openBugReport(): void {
  if (bugReportOpen()) return;
  facts = reportFacts();
  // (its place is kept from the start, the picture coming into it a frame later: shown as it came, the box grew
  // under the pointer and a press meant for a button landed over it, as `lab ui --states bugReport` found)
  dropShot();
  shotWanted = true;
  shotState('Taking a picture of the game…', true);
  $<HTMLDetailsElement>('.br-sent').open = false;
  show('form');
  say('');
  changed();
  root().classList.remove('hidden');
}

export function closeBugReport(): void {
  if (!bugReportOpen()) return;
  root().classList.add('hidden');
  root().classList.remove('typing');
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && root().contains(focused)) focused.blur();
  shotWanted = false;
  closed();
}

/** Called once the frame is drawn (main.ts): the picture asked for is taken from the game's canvas in that same task,
 *  while its pixels are still there to read, shrunk to `shotSide`. */
export function bugReportAfterRender(): void {
  if (!shotWanted) return;
  shotWanted = false;
  const view = G.renderer.domElement;
  if (!view.width || !view.height) { shotState(NO_SHOT, false); return; }
  const k = Math.min(1, BUG_REPORT.shotSide / Math.max(view.width, view.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(view.width * k);
  canvas.height = Math.round(view.height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) { shotState(NO_SHOT, false); return; }
  try { ctx.drawImage(view, 0, 0, canvas.width, canvas.height); } catch { shotState(NO_SHOT, false); return; }
  canvas.toBlob((blob) => {
    if (!bugReportOpen()) return;
    if (!blob) { shotState(NO_SHOT, false); return; }
    dropShot();
    shot = { canvas, blob, url: URL.createObjectURL(blob) };
    $<HTMLImageElement>('.br-shot img').src = shot.url;
    // (the picture is the game's view with what's drawn over it: in a room, the players' names)
    shotState(isCoop() ? 'It shows the game\'s view, players\' name tags too.' : 'It shows the game\'s view, without the menus.', true);
    $<HTMLInputElement>('#br-shot-on').disabled = false;
    changed();
  }, 'image/jpeg', BUG_REPORT.shotQuality);
}

function dropShot(): void {
  if (shot) URL.revokeObjectURL(shot.url);
  shot = null;
  $<HTMLImageElement>('.br-shot img').removeAttribute('src');
}

const NO_SHOT = 'No picture could be taken here.';

/** The picture's row with no picture in it yet (being taken: `ticked`) or at all: its tick fixed, its note saying which. */
function shotState(note: string, ticked: boolean): void {
  const tick = $<HTMLInputElement>('#br-shot-on');
  tick.checked = ticked;
  tick.disabled = true;
  $('.br-shot-note').textContent = note;
}

function pick(k: ReportKind): void {
  kind = k;
  say('');
  changed();
}

/** The form's look after any change: the kind lit and explained, the count, the report's text if it's shown. */
function changed(): void {
  for (const b of root().querySelectorAll<HTMLElement>('.br-kind')) {
    const on = b.dataset.kind === kind?.id;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  }
  $('.br-hint').textContent = kind?.hint ?? 'Pick the one that fits best.';
  const text = $<HTMLTextAreaElement>('#br-text').value;
  $('.br-count').textContent = `${text.length} / ${BUG_REPORT.mostText}`;
  $('.br-shot').classList.toggle('off', !!shot && !$<HTMLInputElement>('#br-shot-on').checked);
  // (kept current whether it's shown or not: a details' own toggle event comes a task after it opens)
  $('.br-sent pre').textContent = reportText(draft(), facts);
}

function say(note: string, bad = false): void {
  const el = $('.br-note');
  el.textContent = note;
  el.classList.toggle('bad', bad);
}

/** Whether the form says enough to be a report; if not, says what's missing and goes there. */
function ready(): boolean {
  if (!kind) { say('Pick what it is about first.', true); return false; }
  if ($<HTMLTextAreaElement>('#br-text').value.trim().length < BUG_REPORT.leastText) {
    say('Say what happened, in a sentence or two.', true);
    $('#br-text').focus();
    return false;
  }
  return true;
}

async function copyReport(): Promise<void> {
  if (!ready()) return;
  const d = draft();
  if (!(await copyText(reportText(d, facts)))) { say('The browser wouldn\'t copy it. Open "See everything in the report" and copy it by hand.', true); return; }
  done('Report copied', 'Paste it into a message to the game\'s makers, or into a new issue on the game\'s GitHub page.', d.picture);
}

async function openIssue(): Promise<void> {
  if (!ready()) return;
  const d = draft();
  const { url, cut } = issueUrl(d, facts);
  // (the whole report copied too: a long one is cut in the address, and a page that didn't open loses nothing)
  const copied = await copyText(reportText(d, facts));
  // (offline, the installed game still runs and GitHub can't open: the copy is what's left, and the form stays)
  if (!navigator.onLine) {
    say(copied ? 'You\'re offline, so GitHub can\'t open: the report was copied instead. Send it once you\'re back.'
      : 'You\'re offline, so GitHub can\'t open. Your report stays here: try again once you\'re back.', !copied);
    return;
  }
  window.open(url, '_blank', 'noopener');
  const more = cut && copied ? ' Your text was too long for the link: paste the copied report over it there.' : '';
  done('GitHub opened in a new tab', `Your report is filled in there: sign in if it asks, then press its Create button.${more}`, d.picture);
}

/** The form's last page: what was done and what's left to the player, the picture to add by hand if one goes along. */
function done(title: string, text: string, picture: boolean): void {
  $('.br-done-title').textContent = title;
  $('.br-done-text').textContent = text;
  $('.br-done-shot').classList.toggle('hidden', !picture || !shot);
  if (picture && shot) {
    $<HTMLImageElement>('.br-done-shot img').src = shot.url;
    const save = $<HTMLAnchorElement>('#br-shot-save');
    save.href = shot.url;
    save.download = `last-stand-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
    $('.br-done-shot-note').textContent = 'A link can\'t carry the picture. Copy it and paste it into your report, or save it and attach it.';
  }
  // (a report made: the form starts empty next time)
  $<HTMLTextAreaElement>('#br-text').value = '';
  $<HTMLInputElement>('#br-expected').value = '';
  kind = null;
  show('done');
}

async function copyPicture(): Promise<void> {
  if (!shot) return;
  const note = $('.br-done-shot-note');
  try {
    // (the clipboard takes a PNG alone)
    const png = await new Promise<Blob>((ok, no) => shot!.canvas.toBlob((b) => (b ? ok(b) : no(new Error('no picture'))), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    note.textContent = 'Picture copied: paste it into your report (Ctrl+V, or hold and Paste).';
  } catch {
    note.textContent = 'This browser can\'t copy a picture: use Save picture and attach the file.';
  }
}

function show(page: 'form' | 'done'): void {
  $('form').classList.toggle('hidden', page !== 'form');
  $('.br-done').classList.toggle('hidden', page !== 'done');
}

/** For a harness (tools/lab `ui --states bugReport`): the picture taken, if any, as its size. */
export const bugReportShot = (): { width: number; height: number; bytes: number } | null =>
  (shot ? { width: shot.canvas.width, height: shot.canvas.height, bytes: shot.blob.size } : null);
