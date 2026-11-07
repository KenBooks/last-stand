// The summary: cards for how many, how big, how old and how full, then the counts by scene and by why.
import { readSummary } from './api';
import { byId, el } from './dom';
import { ago, bytes, percent } from './format';

/** A date as "3 d ago", the full time on hover. */
export function when(iso: string | null): Node | string {
  if (!iso) return '-';
  return el('span', { textContent: ago(iso), title: new Date(iso).toLocaleString() });
}

function card(label: string, value: Node | string, note = '', meter?: number): HTMLElement {
  const card = el('div', { className: 'card' }, el('small', { textContent: label }), el('b', {}, value));
  if (note) card.append(el('small', { textContent: note }));
  if (meter !== undefined) card.append(meterOf(meter));
  return card;
}

/** A bar for how full the disk budget is, warning past 90%. */
function meterOf(fraction: number): HTMLElement {
  const fill = el('i', { className: fraction > 0.9 ? 'full' : '' });
  fill.style.width = `${Math.min(100, fraction * 100).toFixed(1)}%`;
  fill.style.minWidth = fraction > 0 ? '2px' : '0';
  return el('div', { className: 'meter' }, fill);
}

/** Counts as chips, the most first. */
function chips(target: HTMLElement, counts: Record<string, number>): void {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) target.append(el('span', { className: 'chip', textContent: 'none' }));
  for (const [name, count] of entries) {
    target.append(el('span', { className: 'chip', textContent: name || '(none)' }, el('em', { textContent: String(count) })));
  }
}

const dateOf = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '');

export async function showSummary(): Promise<void> {
  const cards = byId('cards');
  try {
    const s = await readSummary();
    cards.append(
      card('Traces kept', String(s.count), s.count ? `${s.prs} PRs, ${s.builds} builds` : ''),
      card('Size', bytes(s.bytes), `${bytes(s.diskBytes)} on disk with their lines`),
      card('Oldest', when(s.oldest), dateOf(s.oldest)),
      card('Newest', when(s.newest), dateOf(s.newest)),
      card('Disk budget', percent(s.diskFull), `of ${bytes(s.diskMax)}, kept ${s.keepDays} days`, s.diskFull),
    );
    chips(byId('scenes'), s.scenes);
    chips(byId('whys'), s.whys);
  } catch (error) {
    cards.append(card('Summary', 'unavailable', (error as Error).message));
  }
}
