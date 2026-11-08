// What a rendered sound is made of (tools/lab `sound`): its level over time, its peak, how much of it lies above the
// bass a laptop can't play, the most tonal peak in its spectrum (a note standing over the noise round it, which the
// music would hear as a second tune), and the sound written as a WAV file. Pure functions of the samples.

/** A level as decibels of full scale (a sample of 1); silence as -120. */
export function decibels(level: number): number {
  return level > 1e-6 ? 20 * Math.log10(level) : -120;
}

/** The channels mixed down to one, their mean at each sample. */
export function mono(channels: Float32Array[]): Float32Array {
  const out = new Float32Array(channels[0].length);
  for (const channel of channels) {
    for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
  }
  return out;
}

/** The largest sample's size over every channel, and whether any sample isn't a number. */
export function peakOf(channels: Float32Array[]): { peak: number; broken: boolean } {
  let peak = 0;
  let broken = false;
  for (const channel of channels) {
    for (const sample of channel) {
      if (!Number.isFinite(sample)) broken = true;
      else peak = Math.max(peak, Math.abs(sample));
    }
  }
  return { peak, broken };
}

/** The root mean square of `samples` from `from` to `to` (sample indices). */
export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

/** The level (dB) in each window of `step` s, start to end. */
export function levelsOf(samples: Float32Array, rate: number, step: number): number[] {
  const size = Math.round(rate * step);
  const levels: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    levels.push(decibels(rms(samples, start, start + size)));
  }
  return levels;
}

/** The loudest stretch of `span` s (its level as RMS, in dB), stepped a tenth of `span` at a time. */
export function loudestOf(samples: Float32Array, rate: number, span: number): number {
  const size = Math.round(rate * span);
  const hop = Math.max(1, Math.round(size / 10));
  let loudest = 0;
  for (let start = 0; start + size <= samples.length; start += hop) {
    loudest = Math.max(loudest, rms(samples, start, start + size));
  }
  return decibels(loudest);
}

/** An in-place radix-2 FFT of `real` and `imag` (their length a power of two). */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const turn = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const cos = Math.cos(turn * k);
        const sin = Math.sin(turn * k);
        const a = start + k;
        const b = a + size / 2;
        const re = real[b] * cos - imag[b] * sin;
        const im = real[b] * sin + imag[b] * cos;
        real[b] = real[a] - re;
        imag[b] = imag[a] - im;
        real[a] += re;
        imag[a] += im;
      }
    }
  }
}

/** A spectrum: the mean power in each bin of `size` samples' FFT, `binHz` apart. */
export interface Spectrum {
  power: Float64Array;
  binHz: number;
}

/** the FFT's size a spectrum is taken over: 10.8 Hz a bin at 44.1 kHz */
export const FFT_SIZE = 4096;

/** The mean power spectrum of `samples` from `from` to `to` (indices; Welch's: Hann windows half overlapping). */
export function spectrumOf(samples: Float32Array, rate: number, from = 0, to = samples.length): Spectrum {
  const power = new Float64Array(FFT_SIZE / 2);
  const real = new Float64Array(FFT_SIZE);
  const imag = new Float64Array(FFT_SIZE);
  let windows = 0;
  for (let start = from; start + FFT_SIZE <= to; start += FFT_SIZE / 2) {
    for (let i = 0; i < FFT_SIZE; i++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
      real[i] = samples[start + i] * hann;
      imag[i] = 0;
    }
    fft(real, imag);
    for (let bin = 0; bin < power.length; bin++) power[bin] += real[bin] * real[bin] + imag[bin] * imag[bin];
    windows++;
  }
  if (windows) power.forEach((value, bin) => (power[bin] = value / windows));
  return { power, binHz: rate / FFT_SIZE };
}

/** The share of a spectrum's power above `hz`. */
export function shareAbove(spectrum: Spectrum, hz: number): number {
  let above = 0;
  let total = 0;
  spectrum.power.forEach((value, bin) => {
    total += value;
    if (bin * spectrum.binHz > hz) above += value;
  });
  return total > 0 ? above / total : 0;
}

/** the band the tonal peak is looked for in (Hz): from the low mids, where a note is heard as one, to the highs */
const TONAL_FROM = 200;
const TONAL_TO = 8000;
/** the neighbours a bin is held against: a third of an octave each way, at least this many bins, its own few left
 *  out */
const NEIGHBOURS_OCTAVE = 1 / 3;
const NEIGHBOURS_LEAST = 8;
const NEIGHBOURS_SKIPPED = 2;

/** A spectrum's most tonal peak: the bin standing furthest (dB) over the median of its neighbours, where. */
export function tonalPeak(spectrum: Spectrum): { hz: number; over: number } {
  const { power, binHz } = spectrum;
  let best = { hz: 0, over: 0 };
  const first = Math.ceil(TONAL_FROM / binHz);
  const lastBin = Math.min(power.length - 1, Math.floor(TONAL_TO / binHz));
  for (let bin = first; bin <= lastBin; bin++) {
    const reach = Math.max(NEIGHBOURS_LEAST, Math.round(bin * (2 ** NEIGHBOURS_OCTAVE - 1)));
    const around: number[] = [];
    for (let other = bin - reach; other <= bin + reach; other++) {
      if (Math.abs(other - bin) > NEIGHBOURS_SKIPPED && other > 0 && other < power.length) around.push(power[other]);
    }
    around.sort((a, b) => a - b);
    const median = around[Math.floor(around.length / 2)];
    if (!(median > 0) || !(power[bin] > 0)) continue;
    const over = 10 * Math.log10(power[bin] / median);
    if (over > best.over) best = { hz: bin * binHz, over };
  }
  return best;
}

/** The channels as a WAV file's bytes: 16-bit PCM at `rate`, each sample clipped to full scale. */
export function wavBytes(channels: Float32Array[], rate: number): Uint8Array {
  const frames = channels[0].length;
  const blockAlign = channels.length * 2;
  const bytes = new Uint8Array(44 + frames * blockAlign);
  const view = new DataView(bytes.buffer);
  const text = (at: number, word: string): void => {
    for (let i = 0; i < word.length; i++) view.setUint8(at + i, word.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * blockAlign, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * blockAlign, true);
  for (let frame = 0; frame < frames; frame++) {
    channels.forEach((channel, index) => {
      const sample = Math.max(-1, Math.min(1, Number.isFinite(channel[frame]) ? channel[frame] : 0));
      view.setInt16(44 + frame * blockAlign + index * 2, Math.round(sample * 32767), true);
    });
  }
  return bytes;
}
