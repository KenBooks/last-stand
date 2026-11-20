import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { errorText, summaryUrl } from '../core/api';
import { bytes, percent } from '../core/format';
import { Summary } from '../core/models';
import { Chips } from '../shared/chips';
import { StatCard } from '../shared/stat-card';
import { When } from '../shared/when';

/** What's kept in sum: how many, how big, how old and how full, then the counts by scene and by why. */
@Component({
  selector: 'app-trace-summary',
  imports: [StatCard, Chips, When],
  template: `
    @if (view(); as v) {
      <section class="cards">
        <app-stat-card label="Traces kept" [note]="v.kept">{{ v.s.count }}</app-stat-card>
        <app-stat-card label="Size" [note]="v.onDisk">{{ v.size }}</app-stat-card>
        <app-stat-card label="Oldest" [note]="v.oldestDate"><app-when [at]="v.s.oldest" /></app-stat-card>
        <app-stat-card label="Newest" [note]="v.newestDate"><app-when [at]="v.s.newest" /></app-stat-card>
        <app-stat-card label="Disk budget" [note]="v.budget" [meter]="v.s.diskFull">{{ v.full }}</app-stat-card>
      </section>
      <section class="split">
        <app-chips heading="By scene" [counts]="v.s.scenes" />
        <app-chips heading="By why" [counts]="v.s.whys" />
      </section>
    } @else if (summary.error()) {
      <section class="cards">
        <app-stat-card label="Summary" [note]="error()">unavailable</app-stat-card>
      </section>
    }
  `,
  styles: `
    .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-bottom: 20px; }
  `,
})
export class TraceSummary {
  protected readonly summary = httpResource<Summary>(() => summaryUrl);
  protected readonly error = computed(() => errorText(this.summary.error()));
  protected readonly view = computed(() => {
    if (!this.summary.hasValue()) return undefined;
    const s = this.summary.value();
    const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');
    return {
      s,
      kept: s.count ? `${s.prs} PRs, ${s.builds} builds` : '',
      size: bytes(s.bytes),
      onDisk: `${bytes(s.diskBytes)} on disk with their lines`,
      oldestDate: dateOf(s.oldest),
      newestDate: dateOf(s.newest),
      full: percent(s.diskFull),
      budget: `of ${bytes(s.diskMax)}, kept ${s.keepDays} days`,
    };
  });
}
