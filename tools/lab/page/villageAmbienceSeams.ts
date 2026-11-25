// `lab village --only ambienceSeams` (from Kenneth: "make sure the sound loops seamlessly again and again, you should
// not hear anything when the audio restarts"): each of the ambience's recordings as it loops (`seamless` in
// `core/ambience.ts`: decoded, its faded ends cut, its last seconds blended into its first), read across its seam, its
// last sample followed by its first. Nothing may be heard there: the step between the two samples within the loop's
// own steps (`STEP_SHARE` of its largest thousandth's least), and the loudness of every short window round the seam
// within the loop's own range (no quieter than its quietest hundredth of windows by `LEVEL_DB`, no louder than its
// loudest hundredth by as much: a gap's silence, or a doubled blend). A recording's own rise and fall (a bird's song
// and the pause after it) lies within that range, as it lies in the loop's windows. `canary` puts `CANARY_GAP` s of
// silence at one loop's seam, as a decoder's padding left in would: it must be heard.
import type { Lab } from './lab';
import type { LightsChecked } from './villageLights';
import { ambienceLoaded, ambienceLoops } from '../../../src/core/ambience';

/** the rate the recordings are decoded at for the check */
const RATE = 48000;
/** a window's length for the loudness (s), how far round the seam they're read (s), and how far apart */
const WINDOW = 0.01;
const ROUND_SEAM = 0.05;
const WINDOW_STEP = 0.005;
/** the seam's step may be this share of the loop's own largest thousandth of steps, at most */
const STEP_SHARE = 1.5;
/** the windows round the seam within this of the loop's quietest and loudest hundredth's (dB) */
const LEVEL_DB = 6;
/** the canary's silence at a seam (s) */
const CANARY_GAP = 0.02;

/** What a loop's seam reads. */
interface Seam {
  name: string;
  seconds: number;
  /** the step across the seam against the loop's largest thousandth's (a share) */
  step: number;
  /** the quietest window round the seam under the loop's quietest hundredth's (dB: below 0 quieter), and the loudest
   *  over its loudest hundredth's (dB: above 0 louder) */
  quieterDb: number;
  louderDb: number;
}

/** The loudness (RMS) of `length` samples of `data` from `from`, read round the loop (wrapping). */
function rmsAt(data: Float32Array, from: number, length: number): number {
  let squares = 0;
  for (let i = 0; i < length; i++) {
    const sample = data[(((from + i) % data.length) + data.length) % data.length];
    squares += sample * sample;
  }
  return Math.sqrt(squares / length);
}

/** The `share`-th of the steps between samples along `data` (0 to 1: 0.999, the largest thousandth's least). */
function stepAt(data: Float32Array, share: number): number {
  const steps = new Float32Array(data.length - 1);
  for (let i = 0; i < steps.length; i++) steps[i] = Math.abs(data[i + 1] - data[i]);
  steps.sort();
  return steps[Math.floor(share * (steps.length - 1))];
}

/** The loudness of `data`'s windows along it, sorted. */
function windowLevels(data: Float32Array, window: number): Float32Array {
  const levels: number[] = [];
  for (let from = 0; from + window <= data.length; from += window) levels.push(rmsAt(data, from, window));
  return Float32Array.from(levels).sort();
}

/** The quietest and loudest window of `data` round its seam (windows `step` apart within `reach` either side). */
function roundSeam(data: Float32Array, window: number, reach: number, step: number): [number, number] {
  let quietest = Infinity;
  let loudest = 0;
  for (let from = -reach - window; from <= reach; from += step) {
    const level = rmsAt(data, from, window);
    quietest = Math.min(quietest, level);
    loudest = Math.max(loudest, level);
  }
  return [quietest, loudest];
}

const db = (ratio: number): number => 20 * Math.log10(Math.max(1e-9, ratio));

/** Loop `name`'s seam read, channel by channel, the worst kept. */
function seamOf(name: string, buffer: AudioBuffer): Seam {
  const rate = buffer.sampleRate;
  const window = Math.round(WINDOW * rate);
  const seam: Seam = { name, seconds: buffer.duration, step: 0, quieterDb: 0, louderDb: -Infinity };
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const across = Math.abs(data[0] - data[data.length - 1]);
    seam.step = Math.max(seam.step, across / Math.max(1e-9, stepAt(data, 0.999)));
    const levels = windowLevels(data, window);
    const quiet = levels[Math.floor(0.01 * (levels.length - 1))];
    const loud = levels[Math.floor(0.99 * (levels.length - 1))];
    const [quietest, loudest] = roundSeam(data, window, Math.round(ROUND_SEAM * rate), Math.round(WINDOW_STEP * rate));
    seam.quieterDb = Math.min(seam.quieterDb, db(quietest / Math.max(1e-9, quiet)));
    seam.louderDb = Math.max(seam.louderDb, db(loudest / Math.max(1e-9, loud)));
  }
  return seam;
}

/** `buffer` with `seconds` of silence put at its start, as its seam (the canary's). */
function withGap(buffer: AudioBuffer, seconds: number): AudioBuffer {
  const gap = Math.round(seconds * buffer.sampleRate);
  const { numberOfChannels, length, sampleRate } = buffer;
  const out = new AudioBuffer({ numberOfChannels, length, sampleRate });
  for (let ch = 0; ch < numberOfChannels; ch++) {
    out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(0, length - gap), gap);
  }
  return out;
}

/** Whether `seam` hears nothing. */
function silentAt(seam: Seam): boolean {
  return seam.step <= STEP_SHARE && seam.quieterDb >= -LEVEL_DB && seam.louderDb <= LEVEL_DB;
}

/** A seam said in a line. */
function said(seam: Seam): string {
  const step = `step ${seam.step.toFixed(2)} of its largest`;
  const levels = `${seam.quieterDb.toFixed(1)} dB under its quietest, ${seam.louderDb.toFixed(1)} over its loudest`;
  return `${seam.name} loop ${seam.seconds.toFixed(2)} s: across its seam ${step}, ${levels}`;
}

/** Each recording's loop read across its seam. */
export async function ambienceSeams(_lab: Lab, canary: boolean): Promise<LightsChecked> {
  await ambienceLoaded(new OfflineAudioContext(2, 1, RATE));
  const loops = Object.entries(ambienceLoops()) as [string, AudioBuffer][];
  const lines: string[] = [];
  const problems: string[] = [];
  if (loops.length < 4) problems.push(`ambience: ${loops.length} of the 4 recordings decoded`);
  for (const [name, buffer] of loops) {
    const seam = seamOf(name, buffer);
    lines.push(said(seam));
    if (!silentAt(seam)) problems.push(`ambience: the ${name} loop's seam is heard (${said(seam)})`);
  }
  if (!canary) return { lines, problems, caught: null, moments: [] };
  const [name, buffer] = loops[0];
  const planted = seamOf(`${name} with ${CANARY_GAP * 1000} ms of silence at its seam`, withGap(buffer, CANARY_GAP));
  lines.push(said(planted));
  return { lines, problems: [], caught: !silentAt(planted), moments: [] };
}
