// A performance trace as it is sent (src/perf/AGENTS.md): a header of JSON and the frames' values packed in columns,
// read back by the lab (`lab trace`) and checked by the traces server. Pure, with no imports, so Node runs it as it is.
//   "LSPT" | version u16 | header length u32 | header JSON (UTF-8) | each column's bytes, one after another
// Packed to be small once gzipped, as a minute of frames at a high refresh is tens of thousands of values a column,
// tuned on the real game's traces (`lab trace --file <trace> --sizes` compares the ways; 40 to 44 KB a minute at 120
// frames a second, about 5.8 bytes a frame, where a time in two bytes, each a change from the frame before, was 53 to 57):
// - text once: the marks' and long frames' text is a table in the header (`strings`), each row naming its index;
// - a time in a byte (`lg`): on a log scale from 0.05 ms, 8% a step (4% either way, about the noise of a frame's
//   times), none under it (CPU times come in 0.1 ms steps); longer than the scale's end, exact in `over`. The
//   frame's interval alone keeps fiftieths of a millisecond in two bytes (`ms`), as the frames' times are its sums;
// - each column's values as they are (stored as each frame's change, a noisy column gzipped 5% bigger), and a column
//   of two or four bytes a value split into its bytes' planes (the low bytes, then the high ones, mostly all alike).

export const TRACE_MAGIC = 'LSPT';
export const TRACE_VERSION = 1;
/** the most a trace's gzip may weigh (bytes): what the traces server takes */
export const TRACE_MAX_BYTES = 1 << 20;

/** how a column's values are stored: `ms` a frame's interval, `lg` any other time, `n16`/`n32` a count, `u8` bits */
export type ColumnKind = 'ms' | 'lg' | 'n16' | 'n32' | 'u8';
/** a column's value for "not known" (a frame whose GPU time never came back) */
export const NONE = -1;

/** a frame's state, as bits of its `state` column (`menu`: the pause menu open; `settling`: the first seconds after
 *  a wave, a mode, a biome or a hero began; `readying`: the loading bar up, waiting on a warm-up) */
export const STATE = { run: 1, fighting: 2, paused: 4, warming: 8, hidden: 16, menu: 32, settling: 64, readying: 128 } as const;

export interface ColumnInfo { name: string; kind: ColumnKind }

/** A long animation frame (50 ms or more): when it was seen (ms from the trace's first frame), how long it took, the
 *  time before its render, in its frame callbacks and in style and layout, its scripts in all and the longest's
 *  time and what ran it. */
export type LongFrameRow = [t: number, duration: number, beforeRender: number, callbacks: number, layout: number,
  scripts: number, longest: number, longestBy: string];
/** something that happened (ms from the trace's first frame) */
export type MarkRow = [t: number, text: string];

/** What a trace says beside its frames (its rows' text as text: packed, it's a table's index). */
export interface TraceHeader {
  v: number;
  /** when it was taken (ISO) and from which build (its bundle's hashed name, its commit) */
  at: string;
  build: { bundle: string; commit: string; pr: number | null };
  /** the page's path, and the query's switches that change how it renders (nothing else of the address) */
  page: string;
  /** what the detector saw (`detect.ts`), or what asked for it */
  reason: Record<string, number | string>;
  device: Record<string, number | string | boolean>;
  settings: Record<string, number | string | boolean>;
  game: Record<string, number | string | boolean>;
  frames: number;
  columns: ColumnInfo[];
  /** values a column's kind couldn't hold: column name -> [frame, value] */
  over: Record<string, [number, number][]>;
  longFrames: LongFrameRow[];
  marks: MarkRow[];
}

/** How the columns were packed: the log scale's ratio a step and its first step (ms), and the columns stored as each
 *  frame's change rather than as they are (`lab trace --sizes` compares the choices on a trace). */
export interface Packing { lg: number; floor: number; changes: string[] }
/** what a trace is packed with */
export const PACKING: Packing = { lg: 1.08, floor: 0.05, changes: [] };
/** what a trace whose header names no packing was packed with: the format's first, kept for the real traces the
 *  packing was tuned on (4% steps from 0.01 ms, every column as each frame's change) */
const FIRST_PACKING = { lg: 1.04, floor: 0.01 };

/** The header as packed: its rows' text an index into `strings`, and how its columns were packed. */
interface PackedHeader extends Omit<TraceHeader, 'longFrames' | 'marks'> {
  pack: Packing;
  strings: string[];
  longFrames: (number)[][];
  marks: [number, number][];
}

/** A trace read back: its header, and each column as plain numbers (`NONE` where not known). */
export interface Trace { header: TraceHeader; columns: Record<string, Float64Array> }

/** fiftieths of a millisecond: an interval's step */
const MS_SCALE = 50;
/** the log scale's last code: at 8% a step from 0.05 ms, some 16 minutes */
const LG_MOST = 254;
const LG_NONE = 0xff;
const U16_NONE = 0xffff;
const U32_NONE = 0xffffffff;

const widthOf = (kind: ColumnKind): number => (kind === 'n32' ? 4 : kind === 'ms' || kind === 'n16' ? 2 : 1);

/** A time (ms) as its log code: 0 for none of it, 1.. on the scale; past the scale: null. */
function lgCode(ms: number, ratio: number, first: number): number | null {
  if (ms < first / 2) return 0;
  const code = Math.max(1, Math.round(Math.log(ms / first) / Math.log(ratio)) + 1);
  return code > LG_MOST ? null : code;
}
const lgValue = (code: number, ratio: number, first: number): number => (code === 0 ? 0 : first * ratio ** (code - 1));

/** A column's values as unsigned integers of its width; what doesn't fit goes to `over`. */
function codesOf(kind: ColumnKind, values: ArrayLike<number>, n: number, over: [number, number][], pack: Packing): Uint32Array {
  const codes = new Uint32Array(n);
  const exact = (i: number, v: number): void => { over.push([i, Math.round(v * 100) / 100]); };
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (kind === 'u8') { codes[i] = v & 0xff; continue; }
    const none = kind === 'lg' ? LG_NONE : kind === 'n32' ? U32_NONE : U16_NONE;
    if (!(v >= 0)) { codes[i] = none; continue; }
    if (kind === 'lg') {
      const code = lgCode(v, pack.lg, pack.floor);
      if (code === null) { codes[i] = LG_MOST; exact(i, v); } else codes[i] = code;
    } else if (kind === 'ms') {
      const packed = Math.round(v * MS_SCALE);
      if (packed >= U16_NONE) { codes[i] = U16_NONE - 1; exact(i, v); } else codes[i] = packed;
    } else codes[i] = Math.min(none - 1, Math.round(v));
  }
  return codes;
}

/** Each code as it is, or as its change from the one before (`changes`), modulo its width, split into the width's
 *  byte planes. */
function packCodes(codes: Uint32Array, width: number, changes: boolean): Uint8Array {
  const n = codes.length, out = new Uint8Array(n * width);
  const mask = width === 4 ? 0xffffffff : (1 << (width * 8)) - 1;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const delta = ((codes[i] - prev) & mask) >>> 0;
    if (changes) prev = codes[i];
    for (let b = 0; b < width; b++) out[b * n + i] = (delta >>> (b * 8)) & 0xff;
  }
  return out;
}

function unpackCodes(bytes: Uint8Array, n: number, width: number, changes: boolean): Uint32Array {
  const codes = new Uint32Array(n);
  const mask = width === 4 ? 0xffffffff : (1 << (width * 8)) - 1;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let delta = 0;
    for (let b = 0; b < width; b++) delta |= bytes[b * n + i] << (b * 8);
    const code = ((prev + (delta >>> 0)) & mask) >>> 0;
    if (changes) prev = code;
    codes[i] = code;
  }
  return codes;
}

/** A column's codes read back as numbers. */
function valuesOf(kind: ColumnKind, codes: Uint32Array, over: [number, number][] | undefined, pack: Packing): Float64Array {
  const out = new Float64Array(codes.length);
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (kind === 'u8') out[i] = c;
    else if (kind === 'lg') out[i] = c === LG_NONE ? NONE : lgValue(c, pack.lg, pack.floor);
    else if (kind === 'ms') out[i] = c === U16_NONE ? NONE : c / MS_SCALE;
    else out[i] = c === (kind === 'n32' ? U32_NONE : U16_NONE) ? NONE : c;
  }
  for (const [i, value] of over ?? []) if (i >= 0 && i < out.length) out[i] = value;
  return out;
}

/** The rows' text as a table, each row naming its index. */
function tabled(marks: MarkRow[], longFrames: LongFrameRow[]): Pick<PackedHeader, 'strings' | 'marks' | 'longFrames'> {
  const strings: string[] = [];
  const index = new Map<string, number>();
  const at = (text: string): number => {
    let i = index.get(text);
    if (i === undefined) { i = strings.push(text) - 1; index.set(text, i); }
    return i;
  };
  return {
    strings,
    marks: marks.map(([t, text]) => [t, at(text)]),
    longFrames: longFrames.map((row) => [...row.slice(0, 7) as number[], at(row[7])]),
  };
}

/** The trace packed: `columns` holds each of the header's columns' values, `frames` of them. */
export function encodeTrace(header: Omit<TraceHeader, 'v' | 'over' | 'frames'>, frames: number,
  columns: Record<string, ArrayLike<number>>, pack: Packing = PACKING): Uint8Array {
  const over: Record<string, [number, number][]> = {};
  const parts = header.columns.map(({ name, kind }) => {
    const values = columns[name];
    if (!values || values.length < frames) throw new Error(`trace: column ${name} has fewer than ${frames} values`);
    const spilled: [number, number][] = [];
    const codes = codesOf(kind, values, frames, spilled, pack);
    const packed = packCodes(codes, widthOf(kind), pack.changes.includes(name));
    if (spilled.length) over[name] = spilled;
    return packed;
  });
  const packedHeader: PackedHeader = { ...header, v: TRACE_VERSION, frames, over, pack, ...tabled(header.marks, header.longFrames) };
  const json = new TextEncoder().encode(JSON.stringify(packedHeader));
  const size = parts.reduce((sum, p) => sum + p.length, 10 + json.length);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = TRACE_MAGIC.charCodeAt(i);
  view.setUint16(4, TRACE_VERSION, true);
  view.setUint32(6, json.length, true);
  out.set(json, 10);
  let at = 10 + json.length;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Whether `bytes` start as a trace does (the server's check before it keeps one). */
export function looksLikeTrace(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false;
  for (let i = 0; i < 4; i++) if (bytes[i] !== TRACE_MAGIC.charCodeAt(i)) return false;
  return true;
}

/** The header as packed, and where the columns start. */
function packedHeaderOf(bytes: Uint8Array): { packed: PackedHeader; start: number } {
  if (!looksLikeTrace(bytes)) throw new Error('trace: not a trace (no LSPT at its start)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version !== TRACE_VERSION) throw new Error(`trace: version ${version}, this reads ${TRACE_VERSION}`);
  const length = view.getUint32(6, true);
  if (10 + length > bytes.length) throw new Error('trace: its header runs past its end');
  return { packed: JSON.parse(new TextDecoder().decode(bytes.subarray(10, 10 + length))) as PackedHeader, start: 10 + length };
}

/** Just the header, its rows' text looked up (the server indexes a trace by it). */
export function traceHeader(bytes: Uint8Array): TraceHeader {
  const { packed } = packedHeaderOf(bytes);
  const { strings, pack: _pack, ...rest } = packed;
  const text = (i: number): string => strings[i] ?? '';
  return {
    ...rest,
    marks: packed.marks.map(([t, i]) => [t, text(i)]),
    longFrames: packed.longFrames.map((row) => [...row.slice(0, 7), text(row[7])] as LongFrameRow),
  };
}

/** The trace's parts as packed: its header's bytes and each column's (what `lab trace --sizes` weighs). */
export function traceParts(bytes: Uint8Array): { header: Uint8Array; columns: (ColumnInfo & { bytes: Uint8Array })[] } {
  const { packed, start } = packedHeaderOf(bytes);
  let at = start;
  const columns = packed.columns.map((column) => {
    const size = packed.frames * widthOf(column.kind);
    const part = { ...column, bytes: bytes.subarray(at, at + size) };
    at += size;
    return part;
  });
  return { header: bytes.subarray(10, start), columns };
}

/** The trace read back. */
export function decodeTrace(bytes: Uint8Array): Trace {
  const { packed, start } = packedHeaderOf(bytes);
  const pack = packed.pack ?? { ...FIRST_PACKING, changes: packed.columns.map(({ name }) => name) };
  const header = traceHeader(bytes);
  const columns: Record<string, Float64Array> = {};
  let at = start;
  for (const { name, kind } of header.columns) {
    const size = header.frames * widthOf(kind);
    if (at + size > bytes.length) throw new Error(`trace: column ${name} runs past its end`);
    const codes = unpackCodes(bytes.subarray(at, at + size), header.frames, widthOf(kind), pack.changes.includes(name));
    columns[name] = valuesOf(kind, codes, header.over[name], pack);
    at += size;
  }
  return { header, columns };
}
