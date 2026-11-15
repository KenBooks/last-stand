// The bug reports' view (#reports): what's kept in sum, how many of each kind (a chip pressed lists that kind alone),
// then the reports newest first, a page at a time. A report's line opens it whole: what happened, what was expected,
// the facts the game added and its picture, read from the service only then.
import { readReport, readReports, reportPictureUrl } from './api';
import { byId, el } from './dom';
import { bytes, percent } from './format';
import { card, when } from './summary';
import type { Report, ReportLine, ReportList } from './types';

const PAGE = 50;

/** the kinds as the game's form names them (src/data/bugReport.ts); one this page doesn't know shows as its id */
const KINDS: Record<string, string> = {
  gameplay: 'Gameplay',
  looks: 'Looks wrong',
  slow: 'Slow or freezing',
  sound: 'Sound',
  controls: 'Controls',
  coop: 'Playing together',
  menus: 'Menus and text',
  saves: 'Saves',
  stuck: 'Crash or stuck',
  idea: 'Idea',
  other: 'Something else',
};
const kindName = (id: string): string => KINDS[id] ?? id;

/** The view's state: how many reports show, of how many, of which kind; `asked` drops answers a newer ask replaced. */
const state = { shown: 0, total: 0, kind: '', asked: 0 };

/** A heading and what stands under it. */
function part(heading: string, body: HTMLElement): HTMLElement[] {
  return [el('h3', { textContent: heading }), body];
}

/** A report whole, as its line opens into: the words and the facts, its picture beside them if it has one. */
function wholeOf(report: Report): HTMLElement {
  const words = el(
    'div',
    {},
    ...part('What happened', el('p', { textContent: report.text })),
    ...part('What was expected', el('p', { textContent: report.expected || '-', className: report.expected ? '' : 'none' })),
    ...part('The game added', el('ul', {}, ...report.facts.map((fact) => el('li', { textContent: fact })))),
  );
  if (!report.picture) {
    words.append(...part('Picture', el('p', { textContent: 'Sent without one.', className: 'none' })));
    return el('div', { className: 'whole plain' }, words);
  }
  const url = reportPictureUrl(report.code);
  const picture = el('img', { src: url, alt: 'The game as it was when the form was opened', loading: 'lazy' });
  const link = el('a', { href: url, target: '_blank', rel: 'noreferrer' }, picture);
  return el('div', { className: 'whole' }, words, el('div', {}, ...part(`Picture, ${bytes(report.pictureBytes)}`, link)));
}

/** A report's line, which opens into the report whole (read when first opened). */
function line(report: ReportLine): HTMLDetailsElement {
  const summary = el(
    'summary',
    {},
    el('span', { className: 'code', textContent: report.code }),
    el('span', { className: 'kind', textContent: kindName(report.kind) }),
    el('span', { className: 'said', textContent: report.text }),
    el('span', { className: 'when' }, when(report.at), report.picture ? ', picture' : ''),
  );
  const details = el('details', { className: 'report' }, summary);
  details.addEventListener('toggle', () => {
    if (!details.open || details.childElementCount > 1) return;
    const waiting = el('p', { className: 'whole plain none', textContent: 'Reading...' });
    details.append(waiting);
    readReport(report.code).then(
      (whole) => waiting.replaceWith(wholeOf(whole)),
      (error: unknown) => { waiting.textContent = (error as Error).message; },
    );
  });
  return details;
}

/** The cards over the list, and the count beside the view's link. */
function sums(list: ReportList): void {
  const full = list.diskMax ? list.diskBytes / list.diskMax : 0;
  byId('report-cards').replaceChildren(
    card('Reports kept', String(list.kept), `kept ${list.keepDays} days`),
    card('Disk budget', percent(full), `${bytes(list.diskBytes)} of ${bytes(list.diskMax)}, pictures and all`, full),
  );
  byId('reports-count').textContent = String(list.kept);
}

/** A chip for each kind kept, the most first, and one for all of them: a press lists that kind alone. */
function chips(list: ReportList): void {
  const chip = (kind: string, name: string, count: number): HTMLElement => {
    const button = el('button', { className: kind === state.kind ? 'chip on' : 'chip', textContent: name },
      el('em', { textContent: String(count) }));
    button.addEventListener('click', () => {
      state.kind = kind;
      more(true).catch(showError);
    });
    return button;
  };
  const kinds = Object.entries(list.kinds).sort((a, b) => b[1] - a[1]);
  byId('report-kinds').replaceChildren(chip('', 'All', list.kept), ...kinds.map(([kind, count]) => chip(kind, kindName(kind), count)));
}

async function more(reset: boolean): Promise<void> {
  const ask = ++state.asked;
  const list = await readReports(reset ? 0 : state.shown, PAGE, state.kind);
  if (ask !== state.asked) return;
  const rows = byId('reports');
  if (reset) {
    rows.replaceChildren();
    state.shown = 0;
  }
  rows.append(...list.reports.map(line));
  state.shown += list.reports.length;
  state.total = list.total;
  sums(list);
  chips(list);
  byId('report-count').textContent = state.total ? `${state.shown} of ${state.total}` : '';
  byId('report-more').hidden = state.shown >= state.total;
  byId('report-empty').hidden = state.total > 0;
}

function showError(error: unknown): void {
  const empty = byId('report-empty');
  empty.hidden = false;
  empty.textContent = (error as Error).message;
}

export function showReports(): void {
  byId('report-more').addEventListener('click', () => more(false).catch(showError));
  more(true).catch(showError);
}
