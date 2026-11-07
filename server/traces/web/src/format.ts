// How the page writes sizes, ages and shares.

const KB = 1024;
const MB = 1024 * 1024;

/** 351 B, 46.5 KB, 1.2 MB. */
export function bytes(n: number): string {
  if (n < KB) return `${n} B`;
  if (n < MB) return `${(n / KB).toFixed(1)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}

/** Each unit and how many of it make the next. */
const UNITS: [string, number][] = [
  ['min', 60],
  ['h', 24],
  ['d', 30],
  ['mo', 12],
];

/** "just now", "5 min ago", "3 d ago". */
export function ago(iso: string, now = Date.now()): string {
  const seconds = (now - Date.parse(iso)) / 1000;
  if (seconds < 60) return 'just now';
  let value = seconds / 60;
  let unit = UNITS[0][0];
  for (let i = 0; i < UNITS.length - 1 && value >= UNITS[i][1]; i++) {
    value /= UNITS[i][1];
    unit = UNITS[i + 1][0];
  }
  return `${Math.floor(value)} ${unit} ago`;
}

/** A share as a percentage, one decimal below 10% so a little use doesn't read 0%. */
export function percent(fraction: number): string {
  if (fraction > 0 && fraction < 0.001) return '<0.1%';
  if (fraction > 0 && fraction < 0.1) return `${(fraction * 100).toFixed(1)}%`;
  return `${Math.round(fraction * 100)}%`;
}
