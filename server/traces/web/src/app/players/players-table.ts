import { Component, input } from '@angular/core';

/** A day's sums as the table shows them (players-logic.ts `tableRows`). */
export interface PlayersRow {
  day: string;
  players: string;
  playtime: string;
  sessions: string;
  newPlayers: string;
  peak: string;
}

/** The charts' numbers as a table, newest day first: every value without hovering. */
@Component({
  selector: 'app-players-table',
  template: `
    <details>
      <summary>Show as a table</summary>
      <table>
        <thead>
          <tr>
            <th>Day (UTC)</th><th class="num">Players</th><th class="num">Playtime</th><th class="num">Sessions</th>
            <th class="num">New</th><th class="num">Most online</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.day) {
            <tr>
              <td class="code">{{ r.day }}</td>
              <td class="num" data-k="players">{{ r.players }}</td>
              <td class="num" data-k="playtime">{{ r.playtime }}</td>
              <td class="num" data-k="sessions">{{ r.sessions }}</td>
              <td class="num" data-k="new">{{ r.newPlayers }}</td>
              <td class="num" data-k="most online">{{ r.peak }}</td>
            </tr>
          }
        </tbody>
      </table>
    </details>
  `,
  styles: `
    summary { cursor: pointer; color: var(--accent); margin-bottom: 8px; }
  `,
})
export class PlayersTable {
  readonly rows = input.required<PlayersRow[]>();
}
