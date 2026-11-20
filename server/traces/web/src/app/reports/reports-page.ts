import { HttpClient } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { reportsUrl } from '../core/api';
import { bytes } from '../core/format';
import { PagedList } from '../core/paged';
import { ReportLine, ReportList } from '../core/models';
import { ReportRow } from './report-row';

const PAGE = 50;

/** The bug reports players sent from the pause menu: newest first, a page at a time, each opened to read it whole. */
@Component({
  selector: 'app-reports-page',
  imports: [ReportRow],
  template: `
    <p class="sub">
      What players sent from the pause menu's Report a bug. Open one to read it whole, with the facts the game added
      and its picture. {{ count() }}
    </p>
    <table>
      <thead>
        <tr><th>Code</th><th>When</th><th>Kind</th><th>What happened</th><th class="num">Picture</th></tr>
      </thead>
      <tbody>
        @for (r of list.items(); track r.code) {
          <tr [appReportRow]="r"></tr>
        }
      </tbody>
    </table>
    @if (list.error()) {
      <p class="empty">{{ list.error() }}</p>
    } @else if (!list.loading() && !list.total()) {
      <p class="empty">No reports.</p>
    }
    @if (list.hasMore()) {
      <button type="button" (click)="list.more()">Show more</button>
    }
  `,
})
export class ReportsPage {
  protected readonly list = new PagedList<ReportLine, ReportList>(
    inject(HttpClient),
    (offset) => reportsUrl(offset, PAGE),
    (answer) => ({ items: answer.reports, total: answer.total, raw: answer }),
  );
  /** How many show of how many, and the disk they take. */
  protected readonly count = computed(() => {
    const last = this.list.last();
    if (!last) return '';
    const used = last.diskMax ? Math.round((100 * last.diskBytes) / last.diskMax) : 0;
    return `${this.list.items().length} of ${last.total}, ${bytes(last.diskBytes)} `
      + `(${used}% of ${bytes(last.diskMax)}), kept ${last.keepDays} days.`;
  });

  constructor() {
    void this.list.reset();
  }
}
