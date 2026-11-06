// A performance trace as it is sent (src/perf/AGENTS.md): a header of JSON and the frames' values packed in columns,
// read back by the lab (`lab trace`) and checked by the traces server. Pure, with no imports, so Node runs it as it is.
//   "LSPT" | version u16 | header length u32 | header JSON (UTF-8) | each column's bytes, 4-byte aligned
// A column holds one value a frame: a time in fiftieths of a millisecond (u16, 1310 ms at most: longer ones are kept
// exactly in the header's `over`), a count (u16 or u32) or a frame's state's bits (u8, as they are).

export const TRACE_MAGIC = 'LSPT';
export const TRACE_VERSION = 1;
/** the most a trace's gzip may weigh (bytes): what the traces server takes */
export const TRACE_MAX_BYTES = 1 << 20;

/** how a column's values are stored */
export type ColumnKind = 'ms' | 'n16' | 'n32' | 'u8';
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

/** What a trace says beside its frames. */
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

/** A trace read back: its header, and each column as plain numbers (`NONE` where not known). */
export interface Trace { header: TraceHeader; columns: Record<string, Float64Array> }

const MS_SCALE = 50;
const U16_NONE = 0xffff;
const U32_NONE = 0xffffffff;

const bytesOf = (kind: ColumnKind): number => (kind === 'n32' ? 4 : kind === 'u8' ? 1 : 2);
const aligned = (n: number): number => (n + 3) & ~3;

/** A column's values packed as its kind stores them; what doesn't fit goes to `over`. */
function packColumn(kind: ColumnKind, values: ArrayLike<number>, over: [number, number][]): Uint8Array {
  const n = values.length;
  if (kind === 'u8') {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = values[i] & 0xff;
    return out;
  }
  if (kind === 'n32') {
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = values[i] < 0 ? U32_NONE : Math.min(U32_NONE - 1, Math.round(values[i]));
    return new Uint8Array(out.buffer);
  }
  const out = new Uint16Array(n);
  const scale = kind === 'ms' ? MS_SCALE : 1;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!(v >= 0)) { out[i] = U16_NONE; continue; }
    const packed = Math.round(v * scale);
    if (packed >= U16_NONE) { out[i] = U16_NONE - 1; over.push([i, Math.round(v * 100) / 100]); } else out[i] = packed;
  }
  return new Uint8Array(out.buffer);
}

/** A column's values read back as numbers. */
function unpackColumn(kind: ColumnKind, bytes: Uint8Array, n: number, over: [number, number][] | undefined): Float64Array {
  const out = new Float64Array(n);
  const copy = bytes.slice(0, n * bytesOf(kind));
  if (kind === 'u8') for (let i = 0; i < n; i++) out[i] = copy[i];
  else if (kind === 'n32') {
    const v = new Uint32Array(copy.buffer);
    for (let i = 0; i < n; i++) out[i] = v[i] === U32_NONE ? NONE : v[i];
  } else {
    const v = new Uint16Array(copy.buffer);
    const scale = kind === 'ms' ? MS_SCALE : 1;
    for (let i = 0; i < n; i++) out[i] = v[i] === U16_NONE ? NONE : v[i] / scale;
  }
  for (const [i, value] of over ?? []) if (i >= 0 && i < n) out[i] = value;
  return out;
}

/** The trace packed: `columns` holds each of the header's columns' values, `frames` of them. */
export function encodeTrace(header: Omit<TraceHeader, 'v' | 'over' | 'frames'>, frames: number,
  columns: Record<string, ArrayLike<number>>): Uint8Array {
  const over: Record<string, [number, number][]> = {};
  const parts = header.columns.map(({ name, kind }) => {
    const spilled: [number, number][] = [];
    const values = columns[name];
    if (!values || values.length < frames) throw new Error(`trace: column ${name} has fewer than ${frames} values`);
    const packed = packColumn(kind, Array.prototype.slice.call(values, 0, frames) as number[], spilled);
    if (spilled.length) over[name] = spilled;
    return packed;
  });
  const json = new TextEncoder().encode(JSON.stringify({ ...header, v: TRACE_VERSION, frames, over }));
  const start = aligned(4 + 2 + 4 + json.length);
  const size = parts.reduce((at, p) => aligned(at + p.length), start);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = TRACE_MAGIC.charCodeAt(i);
  view.setUint16(4, TRACE_VERSION, true);
  view.setUint32(6, json.length, true);
  out.set(json, 10);
  let at = start;
  for (const p of parts) { out.set(p, at); at = aligned(at + p.length); }
  return out;
}

/** Whether `bytes` start as a trace does (the server's check before it keeps one). */
export function looksLikeTrace(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false;
  for (let i = 0; i < 4; i++) if (bytes[i] !== TRACE_MAGIC.charCodeAt(i)) return false;
  return true;
}

/** Just the header (the server indexes a trace by it). */
export function traceHeader(bytes: Uint8Array): TraceHeader {
  if (!looksLikeTrace(bytes)) throw new Error('trace: not a trace (no LSPT at its start)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version !== TRACE_VERSION) throw new Error(`trace: version ${version}, this reads ${TRACE_VERSION}`);
  const length = view.getUint32(6, true);
  if (10 + length > bytes.length) throw new Error('trace: its header runs past its end');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(10, 10 + length))) as TraceHeader;
}

/** The trace read back. */
export function decodeTrace(bytes: Uint8Array): Trace {
  const header = traceHeader(bytes);
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(6, true);
  let at = aligned(10 + length);
  const columns: Record<string, Float64Array> = {};
  for (const { name, kind } of header.columns) {
    const size = header.frames * bytesOf(kind);
    if (at + size > bytes.length) throw new Error(`trace: column ${name} runs past its end`);
    columns[name] = unpackColumn(kind, bytes.subarray(at, at + size), header.frames, header.over[name]);
    at = aligned(at + size);
  }
  return { header, columns };
}
