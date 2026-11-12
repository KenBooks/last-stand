// The hour the village is lit for: the player's own clock, or in co-op the host's (its time zone, sent as a guest joins
// and with the lobby's choices: net/session.ts), so the party stands in the same light. `?hour=` sets it (the lab's
// pictures, a look at the night by day).

/** the host's offset from UTC as `Date.getTimezoneOffset` gives it (minutes), or null: the player's own */
let hostOffset: number | null = null;
let fixed = ((): number | null => {
  const asked = new URLSearchParams(location.search).get('hour');
  const h = asked === null ? NaN : Number(asked);
  return Number.isFinite(h) ? ((h % 24) + 24) % 24 : null;
})();

/** The hour held whatever the clock says (the lab's pictures at set hours), or null to follow the clock again. */
export function holdHour(h: number | null): void { fixed = h === null ? null : ((h % 24) + 24) % 24; }

/** The hour held (`holdHour`, `?hour=`), or null while the clock is followed. */
export const heldHour = (): number | null => fixed;

/** The co-op host's time zone (its `getTimezoneOffset`), or null to go by the player's own clock again. */
export function setHostOffset(minutes: number | null): void { hostOffset = minutes; }

/** This game's offset from UTC, as a host sends it (minutes). */
export const ownOffset = (): number => new Date().getTimezoneOffset();

/** The hour now (0 to 24, with its minutes) by the clock the village follows. */
export function hourNow(): number {
  if (fixed !== null) return fixed;
  const now = new Date();
  const offset = hostOffset ?? now.getTimezoneOffset();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60 - offset;
  return (((minutes / 60) % 24) + 24) % 24;
}
