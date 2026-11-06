// `lab trace --sizes`'s comparison: a trace packed again each way the format can pack it (src/perf/traceFormat.ts
// `Packing`), and each way's gzipped size against the format's own, so the format is tuned on real traces (the stalls
// tool keeps them: `npm run stalls -- --scenario lobby --read "window.__traceNow()"`), not on made-up values. On the
// four kept on 2026-11-06 (a fight, the lobby, the hero screen, a stash sweep, 120 frames a second, packed in the
// format's first way: 4% steps from 0.01 ms, every column as each frame's change): 8% steps over 4% saved 11 to 17%,
// values as they are over each frame's change 6 to 8%, a floor of 0.05 ms over 0.01 4 to 5%; 40 to 44 KB a minute.
// 12% steps would save 10% more, each time then within 6% where 8% keeps it within 4%.
import { gzipSync } from 'node:zlib';
import { encodeTrace, PACKING } from '../../../src/perf/traceFormat.ts';

/** the log scale's ratios a step tried beside the format's */
const RATIOS = [1.04, 1.06, 1.12];
/** its first steps tried (ms): below it a time is none */
const FLOORS = [0.01, 0.1];

/** The trace packed with `pack`, gzipped: its size (bytes). */
function packedSize(trace, pack) {
  const { v: _version, over: _over, frames, ...header } = trace.header;
  return gzipSync(encodeTrace(header, frames, trace.columns, pack)).length;
}

/** The columns that gzip smaller alone as each frame's change than as they are. */
function smallerAsChanges(trace) {
  const changes = [];
  for (const column of trace.header.columns) {
    const alone = { header: { ...trace.header, columns: [column], marks: [], longFrames: [] }, columns: trace.columns };
    const asIs = packedSize(alone, PACKING);
    const asChanges = packedSize(alone, { ...PACKING, changes: [column.name] });
    if (asChanges < asIs) changes.push(column.name);
  }
  return changes;
}

/** The other ways to pack `trace`: what each is, and its packing. */
function waysOf(trace) {
  const names = trace.header.columns.map(({ name }) => name);
  const changes = smallerAsChanges(trace);
  return [
    ...RATIOS.map((lg) => [`${Math.round((lg - 1) * 100)}% steps`, { ...PACKING, lg }]),
    ...FLOORS.map((floor) => [`nothing under ${floor} ms`, { ...PACKING, floor }]),
    ['every column as each frame\'s change', { ...PACKING, changes: names }],
    [`as each frame's change where smaller alone (${changes.join(', ') || 'none'})`, { ...PACKING, changes }],
  ];
}

/** Lines: the format's packing of `trace` and each other way's gzipped size against it. */
export function packingsCompared(trace) {
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const base = packedSize(trace, PACKING);
  const step = `${Math.round((PACKING.lg - 1) * 100)}% steps from ${PACKING.floor} ms`;
  const lines = [`packed other ways, gzipped in all, against the format's (${step}, values as they are): ${kb(base)}`];
  for (const [what, pack] of waysOf(trace)) {
    const bytes = packedSize(trace, pack);
    const change = `${bytes >= base ? '+' : ''}${(((bytes - base) / base) * 100).toFixed(1)}%`;
    lines.push(`  ${kb(bytes).padStart(9)} ${change.padStart(7)}  ${what}`);
  }
  return lines;
}
