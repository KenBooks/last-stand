import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, computed, inject } from '@angular/core';
import { tracesUrl } from '../core/api';
import { PagedList } from '../core/paged';
import { Trace, TraceList } from '../core/models';
import { TraceRow } from './trace-row';
import { TraceSummary } from './trace-summary';

const PAGE = 100;
const TYPING_MS = 200;

/** The traces: what's kept in sum, then the list, newest first, a page at a time, filtered by the server as one types. */
@Component({
  selector: 'app-traces-page',
  imports: [TraceSummary, TraceRow],
  template: `
    <p class="sub">
      Performance traces slow games sent, with their player's consent. Read one with
      <code>npm run lab -- trace CODE</code>.
    </p>
    <app-trace-summary />
    <div class="bar">
      <input type="search" placeholder="Filter by build, PR, scene, why, GPU..." autocomplete="off"
        aria-label="Filter the traces" (input)="typed($event)" />
      <span>{{ count() }}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Code</th><th>When</th><th>Build</th><th>Scene</th><th>Why</th>
          <th>Frames</th><th>Quality</th><th>GPU</th><th>Size</th><th><span class="hidden">Download</span></th>
        </tr>
      </thead>
      <tbody>
        @for (t of list.items(); track t.code) {
          <tr [appTraceRow]="t"></tr>
        }
      </tbody>
    </table>
    @if (list.error()) {
      <p class="empty">{{ list.error() }}</p>
    } @else if (!list.loading() && !list.total()) {
      <p class="empty">No traces.</p>
    }
    @if (list.hasMore()) {
      <button type="button" (click)="list.more()">Show more</button>
    }
  `,
  styles: `
    .bar { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
    .bar input { flex: 1 1 260px; min-width: 0; background: var(--panel); color: var(--text);
      border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; font: inherit; }
    .bar input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
    .bar span { color: var(--dim); font-variant-numeric: tabular-nums; }
  `,
})
export class TracesPage {
  private query = '';
  private typing: ReturnType<typeof setTimeout> | undefined;
  protected readonly list = new PagedList<Trace, TraceList>(
    inject(HttpClient),
    (offset) => tracesUrl(offset, PAGE, this.query),
    (answer) => ({ items: answer.traces, total: answer.total, raw: answer }),
  );
  protected readonly count = computed(() =>
    this.list.total() ? `${this.list.items().length} of ${this.list.total()}` : '',
  );

  constructor() {
    void this.list.reset();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.typing));
  }

  protected typed(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    clearTimeout(this.typing);
    this.typing = setTimeout(() => {
      this.query = value;
      void this.list.reset();
    }, TYPING_MS);
  }
}
