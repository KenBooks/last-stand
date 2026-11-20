// What the Players section shows, made from the service's sums (stats.mjs `read`): pure, spec'd.
import { DaySums, Stats } from '../core/models';
import { TimePoint } from '../shared/chart-logic';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;


/** The spans the section offers, in days. */
export const SPANS = [1, 7, 30, 90] as const;
export type Span = (typeof SPANS)[number];

/** The days the service is asked for: a day's chart reaches back into yesterday. */
export const daysAsked = (span: Span): number => (span === 1 ? 2 : span);

const dayStart = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const timeText = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const dayText = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "45 min", "3.2 h", "1,250 h". */
export function hoursText(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 100 ? `${hours.toFixed(1)} h` : `${Math.round(hours).toLocaleString()} h`;
}

const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

/**
 * Players online over the span: every 5-minute slot over the last day; over longer spans, each hour's peak (the most
 * online in any of its slots), so a week's chart is 168 points, not 2016. Slots still to come are left out.
 */
export function onlineSeries(stats: Stats, span: Span): TimePoint[] {
  const now = Date.parse(stats.now);
  const from = now - span * DAY;
  const slot = stats.slotMinutes * MINUTE;
  const points: TimePoint[] = [];
  for (const day of stats.days) {
    const start = dayStart(day.day);
    day.live.online.forEach((value, i) => {
      const at = start + i * slot;
      if (at >= from && at <= now) points.push({ at, value, when: '', text: '' });
    });
  }
  const binned = span === 1 ? points : peaks(points, HOUR);
  for (const point of binned) {
    point.when = span === 1 ? timeText(point.at) : `${timeText(point.at)} (peak of the hour)`;
    point.text = plural(point.value, 'player');
  }
  return binned;
}

/** Each `bin`'s highest point, at the bin's start. */
function peaks(points: TimePoint[], bin: number): TimePoint[] {
  const byBin = new Map<number, TimePoint>();
  for (const point of points) {
    const at = Math.floor(point.at / bin) * bin;
    const kept = byBin.get(at);
    if (!kept || point.value > kept.value) byBin.set(at, { ...point, at });
  }
  return [...byBin.values()];
}

/** The span's days, oldest first (a day's span: today alone). */
const spanDays = (stats: Stats, span: Span): DaySums[] => stats.days.slice(-span);

/** Daily active players over the span, a bar a day. */
export const playersSeries = (stats: Stats, span: Span): TimePoint[] =>
  spanDays(stats, span).map(({ day, live }) => ({
    at: dayStart(day), value: live.players, when: dayText(dayStart(day)), text: plural(live.players, 'player'),
  }));

/** Hours played each day over the span, a bar a day. */
export const playtimeSeries = (stats: Stats, span: Span): TimePoint[] =>
  spanDays(stats, span).map(({ day, live }) => ({
    at: dayStart(day), value: live.minutes / 60, when: dayText(dayStart(day)), text: hoursText(live.minutes),
  }));

/** A card's numbers: its label, its value, a note under it. */
export interface Card {
  label: string;
  value: string;
  note: string;
}

/** The span's sums, live and test apart. */
function sums(days: DaySums[], kind: 'live' | 'test') {
  const total = { minutes: 0, fight: 0, coop: 0, sessions: 0, newPlayers: 0, playerDays: 0 };
  for (const day of days) {
    const sums = day[kind];
    total.minutes += sums.minutes;
    total.fight += sums.fight;
    total.coop += sums.coop;
    total.sessions += sums.sessions;
    total.newPlayers += sums.newPlayers;
    total.playerDays += sums.players;
  }
  return total;
}

const share = (part: number, whole: number): string => (whole ? `${Math.round((100 * part) / whole)}%` : '-');
const spanText = (span: Span): string => (span === 1 ? 'today' : `the last ${span} days`);

/** The cards over the charts: who's on now, active players, then the span's playtime, sessions and new players. */
export function cardsOf(stats: Stats, span: Span): Card[] {
  const live = sums(spanDays(stats, span), 'live');
  const { active } = stats;
  const perPlayerDay = live.playerDays ? live.minutes / live.playerDays : 0;
  const perSession = live.sessions ? live.minutes / live.sessions : 0;
  return [
    { label: 'Online now', value: stats.online.live.toLocaleString(), note: 'beat in the last 2 min' },
    { label: 'Active today', value: active.live.day.toLocaleString(), note: 'players since 00:00 UTC' },
    { label: 'Active this week', value: active.live.week.toLocaleString(), note: 'players in the last 7 days' },
    { label: 'Active this month', value: active.live.month.toLocaleString(), note: 'players in the last 30 days' },
    { label: 'Playtime', value: hoursText(live.minutes), note: `${spanText(span)}, ${hoursText(perPlayerDay)} a player a day` },
    { label: 'Sessions', value: live.sessions.toLocaleString(), note: `${hoursText(perSession)} on average` },
    { label: 'New players', value: live.newPlayers.toLocaleString(), note: spanText(span) },
    { label: 'In fights', value: share(live.fight, live.minutes), note: `of the playtime; co-op ${share(live.coop, live.minutes)}` },
  ];
}

/** What test builds (PR previews, commit builds) added over the span, counted apart from players. */
export function testNote(stats: Stats, span: Span): string {
  const test = sums(spanDays(stats, span), 'test');
  return `Test builds (PR previews, commit builds) are counted apart: ${hoursText(test.minutes)} played `
    + `${spanText(span)}, ${stats.active.test.week.toLocaleString()} players this week, ${stats.online.test} online now.`;
}

/** A row of the table view: a day's sums as text. */
export const tableRows = (stats: Stats, span: Span) =>
  spanDays(stats, span)
    .map(({ day, live }) => ({
      day,
      players: live.players.toLocaleString(),
      playtime: hoursText(live.minutes),
      sessions: live.sessions.toLocaleString(),
      newPlayers: live.newPlayers.toLocaleString(),
      peak: Math.max(0, ...live.online).toLocaleString(),
    }))
    .reverse();
