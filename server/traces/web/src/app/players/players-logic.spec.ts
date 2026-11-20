import { DaySums, KindSums, Stats } from '../core/models';
import { cardsOf, daysAsked, hoursText, onlineSeries, playersSeries, playtimeSeries, tableRows } from './players-logic';

const SLOTS = 288;
const NOW = '2026-11-20T12:02:00.000Z';

function kind(changes: Partial<KindSums> = {}): KindSums {
  return { players: 0, minutes: 0, fight: 0, coop: 0, sessions: 0, newPlayers: 0, online: new Array(SLOTS).fill(0), ...changes };
}

/** `count` days to 2026-11-20, the i-th's sums from `of(i)` (0 the oldest). */
function statsOf(count: number, of: (i: number) => Partial<KindSums>): Stats {
  const days: DaySums[] = Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.parse('2026-11-20T00:00:00Z') - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, live: kind(of(i)), test: kind({ minutes: 30 }) };
  });
  const active = { day: 2, week: 5, month: 9 };
  return { now: NOW, slotMinutes: 5, online: { live: 3, test: 1 }, active: { live: active, test: active }, days };
}

describe('players logic', () => {
  it('writes minutes as minutes, then hours', () => {
    expect([hoursText(45), hoursText(192), hoursText(75_000)]).toEqual(['45 min', '3.2 h', '1,250 h']);
  });

  it('asks for yesterday too for a day\'s chart', () => {
    expect([daysAsked(1), daysAsked(7)]).toEqual([2, 7]);
  });

  it('shows the last 24 hours slot by slot, none still to come', () => {
    const online = Array.from({ length: SLOTS }, (_, i) => i % 7);
    const stats = statsOf(2, () => ({ online }));
    const points = onlineSeries(stats, 1);
    // (from 12:02 yesterday to 12:02 today: yesterday's slots from 12:05 on, today's to 12:00)
    expect(points.length).toBe(SLOTS);
    expect(points[0].at).toBe(Date.parse('2026-11-19T12:05:00Z'));
    expect(points[points.length - 1].at).toBe(Date.parse('2026-11-20T12:00:00Z'));
    expect(points[points.length - 1].text).toBe(`${144 % 7} players`);
  });

  it('shows a longer span by each hour\'s peak', () => {
    const online = Array.from({ length: SLOTS }, (_, i) => (i % 12 === 5 ? 9 : 1));
    const points = onlineSeries(statsOf(7, () => ({ online })), 7);
    expect(points.every((p) => p.value === 9 || p.at === Date.parse('2026-11-20T12:00:00Z'))).toBe(true);
    expect(points[0].when).toContain('peak of the hour');
    expect(points.length).toBe(6 * 24 + 13);
  });

  it('charts a bar a day, oldest first', () => {
    const stats = statsOf(7, (i) => ({ players: i + 1, minutes: 60 * (i + 1) }));
    expect(playersSeries(stats, 7).map((p) => p.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(playtimeSeries(stats, 7).map((p) => p.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(playersSeries(stats, 7)[6].text).toBe('7 players');
  });

  it('sums the span into cards, the averages by player-day and session', () => {
    const stats = statsOf(7, () => ({ players: 2, minutes: 120, fight: 60, coop: 30, sessions: 4, newPlayers: 1 }));
    const cards = Object.fromEntries(cardsOf(stats, 7).map((c) => [c.label, c]));
    expect(cards['Online now'].value).toBe('3');
    expect(cards['Active this month'].value).toBe('9');
    expect(cards['Playtime'].value).toBe('14.0 h');
    expect(cards['Playtime'].note).toBe('the last 7 days, 1.0 h a player a day');
    expect(cards['Sessions'].note).toBe('30 min on average');
    expect(cards['New players'].value).toBe('7');
    expect(cards['In fights'].value).toBe('50%');
    expect(cards['In fights'].note).toContain('co-op 25%');
  });

  it('lists the table newest first, with each day\'s most online', () => {
    const rows = tableRows(statsOf(3, (i) => ({ online: [i, 4 + i, 1] })), 7);
    expect(rows.map((r) => r.day)).toEqual(['2026-11-20', '2026-11-19', '2026-11-18']);
    expect(rows[0].peak).toBe('6');
  });
});
