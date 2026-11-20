import { Component, computed, input } from '@angular/core';
import { ago } from '../core/format';

/** A time as "3 d ago", the full time on hover; "-" when there is none. */
@Component({
  selector: 'app-when',
  template: `
    @if (at()) {
      <span [title]="full()">{{ text() }}</span>
    } @else {
      -
    }
  `,
})
export class When {
  readonly at = input.required<string | null>();
  protected readonly text = computed(() => ago(this.at() ?? ''));
  protected readonly full = computed(() => new Date(this.at() ?? '').toLocaleString());
}
