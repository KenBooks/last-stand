import { Component, computed, input } from '@angular/core';

/** A number with its label and a note under it; with `meter`, a bar for how full something is (warning past 90%). */
@Component({
  selector: 'app-stat-card',
  host: { class: 'card' },
  template: `
    <small>{{ label() }}</small>
    <b><ng-content /></b>
    @if (note()) {
      <small>{{ note() }}</small>
    }
    @if (meter() !== undefined) {
      <div class="meter"><i [class.full]="full()" [style.width.%]="width()" [style.min-width.px]="minWidth()"></i></div>
    }
  `,
  styles: `
    b { display: block; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
    small { color: var(--dim); display: block; overflow-wrap: anywhere; }
    .meter { height: 6px; background: var(--line); border-radius: 3px; margin-top: 8px; overflow: hidden; }
    .meter i { display: block; height: 100%; background: var(--good); }
    .meter i.full { background: var(--warn); }
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly note = input('');
  readonly meter = input<number | undefined>(undefined);
  protected readonly full = computed(() => (this.meter() ?? 0) > 0.9);
  protected readonly width = computed(() => Math.min(100, (this.meter() ?? 0) * 100));
  protected readonly minWidth = computed(() => ((this.meter() ?? 0) > 0 ? 2 : 0));
}
