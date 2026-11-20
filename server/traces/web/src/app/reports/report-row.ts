import { httpResource } from '@angular/common/http';
import { Component, computed, input, signal } from '@angular/core';
import { errorText, reportPictureUrl, reportUrl } from '../core/api';
import { bytes } from '../core/format';
import { Report, ReportLine } from '../core/models';
import { When } from '../shared/when';

/**
 * A bug report's row: what happened, cut short, opening onto the report whole (read from the service as it first
 * opens): the rest of what happened, what was expected, the facts the game added and its picture. Every string a
 * player sent is written as text by the template, never as HTML.
 */
@Component({
  selector: 'tr[appReportRow]',
  imports: [When],
  template: `
    @let l = line();
    <td class="code">{{ l.code }}</td>
    <td class="when"><app-when [at]="l.at" /></td>
    <td class="kind" data-k="kind">{{ l.kind }}</td>
    <td class="happened">
      <details (toggle)="toggled($event)">
        <summary>{{ l.text }}</summary>
        <div class="whole">
          @if (report.hasValue()) {
            @let r = report.value();
            @if (r.text !== l.text) {
              <p class="said">{{ r.text }}</p>
            }
            @if (r.expected) {
              <p class="said"><span class="dim">Expected: </span>{{ r.expected }}</p>
            }
            <pre class="facts">{{ facts() }}</pre>
            @if (r.picture) {
              <a [href]="picture()" target="_blank" rel="noreferrer">
                <img [src]="picture()" [alt]="'report ' + l.code + '’s picture'" loading="lazy" />
              </a>
            }
          } @else if (report.error()) {
            {{ error() }}
          } @else {
            Reading…
          }
        </div>
      </details>
    </td>
    <td class="num" data-k="picture">{{ pictureNote() }}</td>
  `,
  styles: `
    .kind, .when { white-space: nowrap; }
    .happened { width: 100%; overflow-wrap: anywhere; }
    summary { cursor: pointer; }
    .whole { margin-top: 8px; }
    .said { margin: 0 0 6px; white-space: pre-wrap; }
    .facts { margin: 0 0 8px; padding: 8px 10px; background: var(--bg); border: 1px solid var(--line);
      border-radius: 6px; font: 12px/1.4 ui-monospace, Consolas, monospace; white-space: pre-wrap;
      overflow-wrap: anywhere; color: var(--dim); }
    img { display: block; max-width: 100%; max-height: 420px; border: 1px solid var(--line); border-radius: 6px; }
    @media (max-width: 760px) { .happened { grid-column: 1 / -1; } }
  `,
})
export class ReportRow {
  readonly line = input.required<ReportLine>({ alias: 'appReportRow' });
  private readonly opened = signal(false);
  protected readonly report = httpResource<Report>(() => (this.opened() ? reportUrl(this.line().code) : undefined));
  protected readonly facts = computed(() => (this.report.hasValue() ? this.report.value().facts.join('\n') : ''));
  protected readonly error = computed(() => errorText(this.report.error()));
  protected readonly picture = computed(() => reportPictureUrl(this.line().code));
  protected readonly pictureNote = computed(() => `${this.line().picture ? 'yes' : 'no'}, ${bytes(this.line().bytes)}`);

  protected toggled(event: Event): void {
    if ((event.target as HTMLDetailsElement).open) this.opened.set(true);
  }
}
