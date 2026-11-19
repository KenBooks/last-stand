// `lab auto`'s played traces: a performance trace's frames (`src/perf/traceFormat.ts`) cut to what Auto quality
// reads of each (its interval, the GPU's time, its states, the programs compiled), with when the game was shown and
// the level each stretch was drawn at, kept in `autoTraces/` as JSON so the measure plays the same frames every time.
// The kept ones are real boots: a strong GPU's boot and lobby walk, which Auto must judge as the device it was.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeTrace } from '../../../src/perf/traceFormat.ts';
import { labError } from './errors.mjs';
import { OUT } from './paths.mjs';

/** where the kept traces' frames are */
const KEPT = join(import.meta.dirname, 'autoTraces');
/** the quality levels, from the top (`QUALITY_ORDER` in src/data/quality.ts) */
const LEVELS = ['high', 'medium', 'low', 'verylow'];
/** what a mark of Auto's starts with (`quality auto: ...`, main.ts) */
const AUTO_MARK = 'quality auto: ';

/** A level one up (`-1`) or down (`1`) from `level`. */
const levelBy = (level, by) => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(level) + by))];

/** The level an Auto mark went to (`trying high`, `high kept`, `medium`), and the level it came from. */
function markLevels(text) {
  const said = text.slice(AUTO_MARK.length);
  const tried = said.match(/^trying (\w+)$/);
  if (tried) return { to: tried[1], from: levelBy(tried[1], 1) };
  const kept = said.match(/^(\w+) kept$/);
  if (kept) return { to: kept[1], from: kept[1] };
  return { to: said, from: null };
}

/** The level each stretch of the trace was drawn at: `[ms, level]` from its first frame, as its Auto marks say. */
function levelsOf(header) {
  const marks = header.marks.filter(([, text]) => text.startsWith(AUTO_MARK));
  const end = header.settings.quality;
  if (!marks.length) return [[0, end]];
  const first = markLevels(marks[0][1]);
  const start = first.from ?? levelBy(first.to, -1);
  return [[0, start], ...marks.map(([at, text]) => [at, markLevels(text).to])];
}

/** Rounded to a tenth (ms), so the kept JSON stays small. */
const tenth = (values) => Array.from(values, (value) => Math.round(value * 10) / 10);

/** A trace's bytes (gzipped or not) as the frames `lab auto` plays. */
export function framesOfTrace(bytes, code) {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const trace = decodeTrace(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
  const shown = trace.header.marks.find(([, text]) => text === 'shown');
  const { interval, gpu, state, programs } = trace.columns;
  return {
    code,
    gpuName: trace.header.device.gpu,
    shownAt: shown ? shown[0] : 0,
    levels: levelsOf(trace.header),
    interval: tenth(interval),
    gpu: tenth(gpu),
    state: Array.from(state),
    programs: Array.from(programs),
  };
}

/** The kept traces' frames, and `code`'s too (fetched before by `lab trace <code>`), kept with them if `keep`. */
export function autoTraces(code, keep) {
  const kept = readdirSync(KEPT).filter((name) => name.endsWith('.json'));
  const traces = kept.map((name) => JSON.parse(readFileSync(join(KEPT, name), 'utf8')));
  if (!code || traces.some((trace) => trace.code === code)) return traces;
  const path = join(OUT, 'traces', `${code}.lspt.gz`);
  if (!existsSync(path)) {
    throw labError(`auto: no trace ${code} in ${path}: fetch it first, npm run lab -- trace ${code}`);
  }
  const frames = framesOfTrace(readFileSync(path), code);
  if (keep) {
    mkdirSync(KEPT, { recursive: true });
    writeFileSync(join(KEPT, `${code}.json`), JSON.stringify(frames));
  }
  return [...traces, frames];
}
