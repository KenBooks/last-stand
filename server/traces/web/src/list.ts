// The list: newest first, a page at a time ("Show more"), filtered by the server as the owner types.
import { readTraces, traceUrl } from './api';
import { byId, el } from './dom';
import { bytes } from './format';
import { when } from './summary';
import type { Trace } from './types';

const PAGE = 100;
const TYPING_MS = 200;
const PULL_URL = 'https://github.com/VictorZakharov/last-stand/pull/';

/** A cell; `label` names it where a phone shows the row as a card. */
function cell(text: string, className = '', label = ''): HTMLTableCellElement {
  const td = el('td', { className, textContent: text });
  if (label) td.dataset.k = label;
  return td;
}

/** The build: short commit, the PR (to GitHub: a preview may be gone), the bundle. */
function buildCell(trace: Trace): HTMLTableCellElement {
  const td = el('td', { className: 'build' }, el('span', { textContent: trace.commit ? trace.commit.slice(0, 7) : '-' }));
  if (trace.pr) {
    td.append(' ', el('a', { textContent: `#${trace.pr}`, href: PULL_URL + trace.pr, rel: 'noreferrer', target: '_blank' }));
  }
  if (trace.bundle) td.append(' ', el('span', { className: 'dim', textContent: trace.bundle }));
  return td;
}

function row(trace: Trace): HTMLTableRowElement {
  const download = el('a', { href: traceUrl(trace.code), textContent: 'download', download: `${trace.code}.lspt.gz` });
  return el(
    'tr',
    {},
    cell(trace.code, 'code'),
    el('td', { className: 'when' }, when(trace.at)),
    buildCell(trace),
    cell(trace.scene || '-', '', 'scene'),
    cell(trace.why || '-', '', 'why'),
    cell(String(trace.frames), 'num', 'frames'),
    cell(trace.quality || '-', '', 'quality'),
    cell(trace.gpu || '-', 'gpu'),
    cell(bytes(trace.bytes), 'num', 'size'),
    el('td', { className: 'dl' }, download),
  );
}

/** The list's state: how many rows show, of how many, for which filter; `asked` drops answers a newer ask replaced. */
const state = { shown: 0, total: 0, query: '', asked: 0 };

async function more(reset: boolean): Promise<void> {
  const ask = ++state.asked;
  const page = await readTraces(reset ? 0 : state.shown, PAGE, state.query);
  if (ask !== state.asked) return;
  const rows = byId('rows');
  if (reset) {
    rows.replaceChildren();
    state.shown = 0;
  }
  rows.append(...page.traces.map(row));
  state.shown += page.traces.length;
  state.total = page.total;
  byId('count').textContent = state.total ? `${state.shown} of ${state.total}` : '';
  byId('more').hidden = state.shown >= state.total;
  byId('empty').hidden = state.total > 0;
}

function showError(error: unknown): void {
  const empty = byId('empty');
  empty.hidden = false;
  empty.textContent = (error as Error).message;
}

export function showList(): void {
  let typing: ReturnType<typeof setTimeout> | undefined;
  byId<HTMLInputElement>('filter').addEventListener('input', (event) => {
    clearTimeout(typing);
    const value = (event.target as HTMLInputElement).value.trim();
    typing = setTimeout(() => {
      state.query = value;
      more(true).catch(showError);
    }, TYPING_MS);
  });
  byId('more').addEventListener('click', () => more(false).catch(showError));
  more(true).catch(showError);
}
