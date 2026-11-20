import { Component, computed, input } from '@angular/core';
import { countsOf } from '../core/format';

/** Counts as chips under a heading, the most first. */
@Component({
  selector: 'app-chips',
  host: { class: 'card' },
  template: `
    <h2>{{ heading() }}</h2>
    <div class="chips">
      @for (c of rows(); track c.name) {
        <span class="chip">{{ c.name }}<em>{{ c.count }}</em></span>
      } @empty {
        <span class="chip">none</span>
      }
    </div>
  `,
  styles: `
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); margin: 0 0 6px;
      font-weight: 600; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { background: var(--chip); border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px;
      font-variant-numeric: tabular-nums; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    em { font-style: normal; color: var(--dim); margin-left: 6px; }
  `,
})
export class Chips {
  readonly heading = input.required<string>();
  readonly counts = input.required<Record<string, number>>();
  protected readonly rows = computed(() => countsOf(this.counts()));
}
