// What a rendered sound is made of (page/soundMeasure.ts): its levels, its spectrum's tonal peak and its WAV bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centroidOf, decibels, fft, levelsOf, loudestOf, peakOf, shareAbove, spectrumOf, tonalPeak, wavBytes,
} from '../page/soundMeasure.ts';

const RATE = 44100;

/** A seeded generator of numbers in [0, 1), so a test's noise is the same every run. */
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** `seconds` of white noise at `level`. */
function noise(seconds, level, seed = 7) {
  const random = seeded(seed);
  return Float32Array.from({ length: Math.round(seconds * RATE) }, () => (random() * 2 - 1) * level);
}

/** `seconds` of a sine at `hz` and `level`. */
function sine(seconds, hz, level) {
  const at = (i) => Math.sin((2 * Math.PI * hz * i) / RATE) * level;
  return Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => at(i));
}

/** Two signals added sample by sample. */
const added = (a, b) => a.map((value, i) => value + b[i]);

test('a full-scale sine peaks at 0 dB, its level 3 dB under', () => {
  const tone = sine(1, 1000, 1);
  assert.ok(Math.abs(decibels(peakOf([tone]).peak)) < 0.01);
  assert.ok(Math.abs(loudestOf(tone, RATE, 0.5) + 3.01) < 0.05);
});

test('a sample not a number is found', () => {
  const broken = sine(0.1, 1000, 0.5);
  broken[100] = Number.NaN;
  assert.equal(peakOf([broken]).broken, true);
  assert.equal(peakOf([sine(0.1, 1000, 0.5)]).broken, false);
});

test('the level over time follows a sound that stops', () => {
  const sound = new Float32Array(RATE);
  sound.set(sine(0.5, 1000, 0.5));
  const levels = levelsOf(sound, RATE, 0.1);
  assert.equal(levels.length, 10);
  assert.ok(levels[2] > -10);
  assert.equal(levels[8], -120);
});

test('an FFT finds a sine in its bin', () => {
  const size = 64;
  const real = Float64Array.from({ length: size }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / size));
  const imag = new Float64Array(size);
  fft(real, imag);
  assert.ok(Math.abs(real[5] - size / 2) < 1e-9);
  assert.ok(Math.abs(real[6]) < 1e-9);
});

test('noise alone has no note standing over it', () => {
  const peak = tonalPeak(spectrumOf(noise(3, 0.3), RATE));
  assert.ok(peak.over < 8, `${peak.over} dB`);
});

test('a quiet note under loud noise stands over it, where it is', () => {
  // (a tenth of the noise's peak, a fifth of its level: 0.03 stood 13.5 dB over it, as its power in one bin says)
  const sound = added(noise(3, 0.3), sine(3, 440, 0.06));
  const peak = tonalPeak(spectrumOf(sound, RATE));
  assert.ok(peak.over > 15, `${peak.over} dB`);
  assert.ok(Math.abs(peak.hz - 440) < 12, `${peak.hz} Hz`);
});

test('a bass note is all under 150 Hz, noise mostly over it', () => {
  assert.ok(shareAbove(spectrumOf(sine(1, 55, 0.5), RATE), 150) < 0.01);
  assert.ok(shareAbove(spectrumOf(noise(1, 0.3), RATE), 150) > 0.95);
});

test('a sine\'s centroid is its frequency, white noise\'s half the band', () => {
  const sineCentre = centroidOf(spectrumOf(sine(1, 1000, 0.5), RATE));
  assert.ok(Math.abs(sineCentre - 1000) < 30, `sine centroid ${sineCentre}`);
  const noiseCentre = centroidOf(spectrumOf(noise(1, 0.3), RATE));
  assert.ok(Math.abs(noiseCentre - RATE / 4) < RATE / 40, `noise centroid ${noiseCentre}`);
});

test('a WAV holds its header and each channel 16-bit, interleaved', () => {
  const left = Float32Array.from([0.5, -1, 2]);
  const right = Float32Array.from([0, 0.25, Number.NaN]);
  const bytes = wavBytes([left, right], RATE);
  const view = new DataView(bytes.buffer);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), 'WAVE');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), RATE);
  assert.equal(view.getUint32(40, true), 12);
  assert.equal(view.getInt16(44, true), 16384);
  assert.equal(view.getInt16(48, true), -32767);
  assert.equal(view.getInt16(52, true), 32767);
  assert.equal(view.getInt16(54, true), 0);
});
