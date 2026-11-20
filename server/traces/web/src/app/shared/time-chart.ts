import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { ChartKind, Geometry, TimePoint, layOut, nearest } from './chart-logic';

/**
 * One measure over time, as a line or a bar a day: a crosshair (or the bar) and a tooltip at the point nearest the
 * pointer, the arrow keys stepping through the points when it has focus. The chart's title names its one series.
 */
@Component({
  selector: 'app-time-chart',
  host: { class: 'card' },
  template: `
    <h2>{{ title() }}</h2>
    @let g = geometry();
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height" [attr.height]="height" role="img" [attr.aria-label]="title()"
      tabindex="0" (pointermove)="hover($event)" (pointerleave)="at.set(-1)" (blur)="at.set(-1)" (keydown)="key($event)">
      @for (t of g.ticksY; track t.text) {
        <line class="grid" [attr.x1]="pad" [attr.x2]="width()" [attr.y1]="t.y" [attr.y2]="t.y" />
        <text class="tick" x="0" [attr.y]="t.y + 3">{{ t.text }}</text>
      }
      @if (kind() === 'bars') {
        @for (p of g.placed; track $index) {
          <rect class="bar" [class.on]="$index === at()" [attr.x]="p.left" [attr.y]="p.y" [attr.width]="p.width"
            [attr.height]="g.base - p.y" rx="2" />
        }
      } @else if (g.line) {
        <path class="line" [attr.d]="g.line" />
      }
      @if (point(); as p) {
        @if (kind() === 'line') {
          <line class="cross" [attr.x1]="p.x" [attr.x2]="p.x" y1="0" [attr.y2]="g.base" />
          <circle class="dot" [attr.cx]="p.x" [attr.cy]="p.y" r="4" />
        }
      }
      @for (t of g.ticksX; track $index) {
        <text class="tick" [attr.x]="t.x" [attr.y]="height - 4" [attr.text-anchor]="t.anchor">{{ t.text }}</text>
      }
    </svg>
    @if (tip(); as t) {
      <div class="tip" [style.left.px]="t.left"><b>{{ t.text }}</b>{{ t.when }}</div>
    }
    @if (!points().length) {
      <p class="none">Nothing yet.</p>
    }
  `,
  styles: `
    :host { position: relative; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); margin: 0 0 8px;
      font-weight: 600; }
    svg { display: block; width: 100%; overflow: visible; }
    svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .grid { stroke: var(--line); stroke-width: 1; }
    .tick { fill: var(--dim); font-size: 10px; font-variant-numeric: tabular-nums; }
    .line { fill: none; stroke: var(--viz); stroke-width: 2; stroke-linejoin: round; }
    .bar { fill: var(--viz); }
    .bar.on { fill: var(--viz-on); }
    .cross { stroke: var(--dim); stroke-width: 1; opacity: 0.6; }
    .dot { fill: var(--viz); stroke: var(--panel); stroke-width: 2; }
    .tip { position: absolute; top: 30px; transform: translateX(-50%); pointer-events: none; white-space: nowrap;
      background: var(--head); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; font-size: 12px;
      color: var(--dim); }
    .tip b { display: block; color: var(--text); font-size: 13px; }
    .none { position: absolute; inset: 40% 0 auto; margin: 0; text-align: center; color: var(--dim); }
  `,
})
export class TimeChart {
  readonly title = input.required<string>();
  readonly points = input.required<TimePoint[]>();
  readonly kind = input<ChartKind>('line');
  protected readonly height = 180;
  protected readonly pad = 34;
  protected readonly width = signal(600);
  /** the point the pointer or the keys are on, -1 for none */
  protected readonly at = signal(-1);
  protected readonly geometry = computed<Geometry>(() => layOut(this.points(), this.kind(), this.width(), this.height));
  protected readonly point = computed(() => this.geometry().placed[this.at()]);
  protected readonly tip = computed(() => {
    const placed = this.point();
    const point = this.points()[this.at()];
    if (!placed || !point) return undefined;
    // (held inside the card: a tooltip at either end would hang off it)
    const left = Math.min(Math.max(placed.x + 14, 70), this.width() - 50);
    return { left, text: point.text, when: point.when };
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const svg = this.host.nativeElement.querySelector('svg');
      if (!svg) return;
      const observer = new ResizeObserver(([entry]) => this.width.set(Math.max(120, Math.round(entry.contentRect.width))));
      observer.observe(svg);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected hover(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    this.at.set(nearest(this.geometry(), ((event.clientX - box.left) / box.width) * this.width()));
  }

  protected key(event: KeyboardEvent): void {
    const last = this.points().length - 1;
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    if (!(event.key in steps) || last < 0) return;
    event.preventDefault();
    const from = this.at() < 0 ? (steps[event.key] > 0 ? -1 : last + 1) : this.at();
    this.at.set(Math.min(last, Math.max(0, from + steps[event.key])));
  }
}
