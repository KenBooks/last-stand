import { Component, computed, input } from '@angular/core';
import { traceUrl } from '../core/api';
import { bytes } from '../core/format';
import { Trace } from '../core/models';
import { When } from '../shared/when';

const PULL_URL = 'https://github.com/VictorZakharov/last-stand/pull/';

/** What a trace's row shows: every string the game sent is written as text by the template, never as HTML. */
export function toTraceRow(t: Trace) {
  return {
    code: t.code,
    at: t.at,
    commit: t.commit ? t.commit.slice(0, 7) : '-',
    pr: t.pr ? { text: `#${t.pr}`, href: PULL_URL + t.pr } : null,
    bundle: t.bundle,
    scene: t.scene || '-',
    why: t.why || '-',
    frames: String(t.frames),
    quality: t.quality || '-',
    gpu: t.gpu || '-',
    size: bytes(t.bytes),
    download: traceUrl(t.code),
    file: `${t.code}.lspt.gz`,
  };
}

/** A trace's row: the build (short commit, the PR on GitHub, as a preview may be gone, the bundle) and a download. */
@Component({
  selector: 'tr[appTraceRow]',
  imports: [When],
  template: `
    @let r = row();
    <td class="code">{{ r.code }}</td>
    <td class="when"><app-when [at]="r.at" /></td>
    <td class="build">
      <span>{{ r.commit }}</span>
      @if (r.pr; as pr) {
        <a [href]="pr.href" rel="noreferrer" target="_blank">{{ pr.text }}</a>
      }
      @if (r.bundle) {
        <span class="dim">{{ r.bundle }}</span>
      }
    </td>
    <td data-k="scene">{{ r.scene }}</td>
    <td data-k="why">{{ r.why }}</td>
    <td class="num" data-k="frames">{{ r.frames }}</td>
    <td data-k="quality">{{ r.quality }}</td>
    <td class="gpu">{{ r.gpu }}</td>
    <td class="num" data-k="size">{{ r.size }}</td>
    <td class="dl"><a [href]="r.download" [download]="r.file">download</a></td>
  `,
})
export class TraceRow {
  readonly trace = input.required<Trace>({ alias: 'appTraceRow' });
  protected readonly row = computed(() => toTraceRow(this.trace()));
}
