import { httpResource } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { errorText, statsUrl } from '../core/api';
import { Stats } from '../core/models';
import { StatCard } from '../shared/stat-card';
import { TimeChart } from '../shared/time-chart';
import { PlayersTable } from './players-table';
import {
  SPANS, Span, cardsOf, daysAsked, onlineSeries, playersSeries, playtimeSeries, tableRows, testNote,
} from './players-logic';

/** how often the sums are read again while the section shows */
const REFRESH_MS = 60_000;

/**
 * Who plays (the games' anonymous heartbeats, stats.mjs): who's online now, active players by day, week and month,
 * then over a span the players online, the daily active players and the hours played, with the same as a table.
 */
@Component({
  selector: 'app-players-page',
  imports: [StatCard, TimeChart, PlayersTable],
  template: `
    <p class="sub">
      Production's players, from the anonymous heartbeat games send once a minute while they're played. No account, name or address is kept.
    </p>
    <div class="spans" role="group" aria-label="Span">
      @for (s of spans; track s) {
        <button type="button" [class.on]="s === span()" [attr.aria-pressed]="s === span()" (click)="span.set(s)">
          {{ s === 1 ? '24 hours' : s + ' days' }}
        </button>
      }
    </div>
    @if (view(); as v) {
      <section class="cards">
        @for (c of v.cards; track c.label) {
          <app-stat-card [label]="c.label" [note]="c.note">{{ c.value }}</app-stat-card>
        }
      </section>
      <app-time-chart title="Players online" [points]="v.online" />
      <section class="split">
        <app-time-chart title="Daily active players" kind="bars" [points]="v.players" />
        <app-time-chart title="Hours played a day" kind="bars" [points]="v.playtime" />
      </section>
      <p class="sub">{{ v.test }}</p>
      <app-players-table [rows]="v.rows" />
    } @else if (stats.error()) {
      <p class="empty">{{ error() }}</p>
    }
  `,
  styles: `
    .spans { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
    .spans button { margin: 0; padding: 6px 12px; }
    .spans button.on { border-color: var(--accent); color: var(--accent); }
    app-time-chart { margin-bottom: 10px; }
    .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
    .split app-time-chart { margin-bottom: 0; }
    .sub { margin-top: 12px; }
  `,
})
export class PlayersPage {
  protected readonly spans = SPANS;
  protected readonly span = signal<Span>(7);
  protected readonly stats = httpResource<Stats>(() => statsUrl(daysAsked(this.span())));
  protected readonly error = computed(() => errorText(this.stats.error()));
  protected readonly view = computed(() => {
    if (!this.stats.hasValue()) return undefined;
    const stats = this.stats.value();
    const span = this.span();
    // (an answer for another span, still showing while the new one loads, is read as far as it reaches)
    return {
      cards: cardsOf(stats, span),
      online: onlineSeries(stats, span),
      players: playersSeries(stats, span),
      playtime: playtimeSeries(stats, span),
      test: testNote(stats, span),
      rows: tableRows(stats, span),
    };
  });

  constructor() {
    const timer = setInterval(() => this.stats.reload(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
