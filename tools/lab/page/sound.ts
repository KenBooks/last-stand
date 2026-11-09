// The game's sound effects rendered to WAV files (tools/lab `sound`): a scene of a skill as the player hears it (a
// bolt cast again and again as a held button casts it, each bursting on a foe; a channel's charge, its hold and its
// release), played into an OfflineAudioContext as the game plays it (`playInto` in src/core/audio.ts: the same
// master, compressor and hall), each call at its moment. Each is measured: its peak and any sample not a number, its
// loudest half second against the other heroes' sounds, its level every tenth of a second, the share of it above the
// bass a laptop can't play, its most tonal peak (a note standing over its noise, which the music hears as a second
// tune: #413's "the background music gets duplicated"), the nodes it made and its silence once it's over.
import type { Report } from './lab';
import { playInto, sfx } from '../../../src/core/audio';
import {
  centroidOf, decibels, levelsOf, loudestOf, mono, peakOf, shareAbove, spectrumOf, tonalPeak, wavBytes,
} from './soundMeasure';

export interface SoundOptions {
  /** the scenes rendered, by name (`SCENES`), or any sound of the game's played once */
  sounds: string[];
  /** plant faults the measures must catch: a note under the first scene, held and never stopped */
  canary: boolean;
}

/** A call at a moment of a scene: the first of `sound`'s names the game has (a sound renamed since), with `args`;
 *  what it returns (a held sound's stop) kept as `keep`. Or a kept stop called. */
interface Cue {
  at: number;
  sound?: string[];
  args?: unknown[];
  keep?: string;
  stop?: string;
}

/** A scene: its cues, and the stretch its spectrum is taken over (a channel's hold). It renders until the hall's
 *  ring after its last cue has died away (`RING`). */
interface Scene {
  what: string;
  cues: Cue[];
  held?: [number, number];
}

/** Splintering Bolt's cast pace (s, `castTime`), and its bolt's flight to a foe a few metres off and its splits' */
const BOLT_PACE = 0.34;
const BOLT_FLIGHT = 0.3;
const SPLIT_FLIGHT = 0.25;
/** Void Lance's portal (s, `opening`) and how long the scene holds the beam out */
const LANCE_OPENS = 0.75;
const LANCE_HELD = 4;

/** A bolt's cues: cast at `at`, bursting on a foe and splitting, each split bursting on another (`hits` false: it
 *  flies to its range and is gone). */
function boltCues(at: number, hits: boolean): Cue[] {
  const cast: Cue = { at, sound: ['bolt'] };
  if (!hits) return [cast];
  const burst = at + BOLT_FLIGHT;
  return [
    cast,
    { at: burst, sound: ['boltBurst', 'boltHit'], args: [true] },
    { at: burst + SPLIT_FLIGHT, sound: ['boltBurst', 'boltHit'], args: [false] },
    { at: burst + SPLIT_FLIGHT + 0.04, sound: ['boltBurst', 'boltHit'], args: [false] },
  ];
}

const SCENES: Record<string, Scene> = {
  bolt: {
    what: 'Splintering Bolt held: four casts, each bursting on a foe and its two splits on two others',
    cues: [0, 1, 2, 3].flatMap((cast) => boltCues(cast * BOLT_PACE, true)),
  },
  boltMiss: {
    what: 'Splintering Bolt cast once, striking nothing',
    cues: boltCues(0, false),
  },
  lance: {
    what: `Void Lance: its portal drawn (${LANCE_OPENS} s), the beam held ${LANCE_HELD} s, let go`,
    cues: [
      { at: 0, sound: ['lanceCharge'], args: [LANCE_OPENS], keep: 'charge' },
      { at: LANCE_OPENS, stop: 'charge' },
      { at: LANCE_OPENS, sound: ['lance'], keep: 'beam' },
      { at: LANCE_OPENS + LANCE_HELD, stop: 'beam' },
    ],
    held: [LANCE_OPENS + 1, LANCE_OPENS + LANCE_HELD],
  },
  lanceEarly: {
    what: 'Void Lance let go as its portal is drawn, before the beam',
    cues: [
      { at: 0, sound: ['lanceCharge'], args: [LANCE_OPENS], keep: 'charge' },
      { at: 0.4, stop: 'charge' },
    ],
  },
};

/** how long a scene renders past its last cue (s): its sound's own end, and the hall's ring of 2.6 s after it */
const RING = 3.5;
/** the render's sample rate */
const RATE = 44100;
/** the stretch the loudness is the loudest of (s), and the level's step over time (s) */
const LOUDEST_SPAN = 0.5;
const LEVEL_STEP = 0.1;
/** where a sound turns bright, then piercing (Hz): its share over it said beside its centroid */
const BRIGHT_HZ = 2000;
/** a tonal peak standing this far over its neighbours (dB) is a note */
const TONAL_LIMIT = 15;
/** the last stretch of a render (s), which must be silent: under this level (dB) */
const TAIL = 0.25;
const SILENT = -60;
/** the canary's held note (Hz) and its level (a fraction of full scale, into the master) */
const CANARY_HZ = 440;
const CANARY_LEVEL = 0.04;

type Play = (...args: unknown[]) => unknown;

/** A scene by its name: one of `SCENES`, or a sound of the game's played once. */
function sceneFor(name: string): Scene {
  return SCENES[name] ?? { what: `${name} played once`, cues: [{ at: 0, sound: [name] }] };
}

/** How long a scene renders (s): to the hall's ring's end after its last cue. */
function lengthOf(scene: Scene): number {
  return Math.max(...scene.cues.map((cue) => cue.at)) + RING;
}

/** The nodes `c` makes from now on, counted by kind, as the game asks for them. */
function countNodes(c: BaseAudioContext): Map<string, number> {
  const made = new Map<string, number>();
  const methods = Object.getOwnPropertyNames(BaseAudioContext.prototype).filter((name) => name.startsWith('create'));
  for (const method of methods) {
    if (method === 'createBuffer' || method === 'createPeriodicWave') continue;
    const original = (c as unknown as Record<string, Play>)[method].bind(c);
    (c as unknown as Record<string, Play>)[method] = (...args: unknown[]) => {
      made.set(method, (made.get(method) ?? 0) + 1);
      return original(...args);
    };
  }
  return made;
}

/** The canary's fault, planted in `c` at its start: a note held, never stopped. */
function plantCanary(c: BaseAudioContext): void {
  const note = c.createOscillator();
  note.frequency.value = CANARY_HZ;
  const level = c.createGain();
  level.gain.value = CANARY_LEVEL;
  note.connect(level).connect(c.destination);
  note.start(0);
}

/** A cue played: the first of its sounds the game has, called; or a kept stop called. Returns what it couldn't do. */
function playCue(cue: Cue, kept: Map<string, Play>): string | null {
  if (cue.stop) {
    const stop = kept.get(cue.stop);
    if (!stop) return `no ${cue.stop} to stop at ${cue.at} s`;
    stop();
    return null;
  }
  const sounds = sfx as unknown as Record<string, Play | undefined>;
  const name = cue.sound?.find((sound) => sounds[sound]);
  if (!name) return `the game has no ${cue.sound?.join(' or ')}`;
  const result = sounds[name]!(...(cue.args ?? []));
  if (cue.keep) {
    if (typeof result !== 'function') return `${name} returned no stop`;
    kept.set(cue.keep, result as Play);
  }
  return null;
}

/** A scene rendered: its channels, the nodes it made and what it couldn't play. */
async function render(scene: Scene, canary: boolean) {
  const c = new OfflineAudioContext(2, Math.ceil(lengthOf(scene) * RATE), RATE);
  const made = countNodes(c);
  const restore = playInto(c);
  const missed: string[] = [];
  const kept = new Map<string, Play>();
  const playAll = (at: number): void => {
    for (const cue of scene.cues.filter((each) => each.at === at)) {
      const fault = playCue(cue, kept);
      if (fault) missed.push(fault);
    }
  };
  try {
    if (canary) plantCanary(c);
    const moments = [...new Set(scene.cues.map((cue) => cue.at))].sort((a, b) => a - b);
    for (const at of moments.filter((moment) => moment > 0)) {
      void c.suspend(at).then(() => {
        playAll(at);
        return c.resume();
      });
    }
    playAll(0);
    const buffer = await c.startRendering();
    const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
    return { channels, made, missed };
  } finally {
    restore();
  }
}

/** The WAV's bytes as base64, for the report (the node side writes the file). */
function base64Of(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(text);
}

/** A number as text to a tenth. */
const tenth = (value: number): string => value.toFixed(1);

/** One scene rendered and measured: its lines, its problems and its WAV. */
async function measureScene(name: string, canary: boolean) {
  const scene = sceneFor(name);
  const { channels, made, missed } = await render(scene, canary);
  const problems = missed.map((fault) => `${name}: ${fault}`);
  const mixed = mono(channels);
  const { peak, broken } = peakOf(channels);
  const [from, to] = (scene.held ?? [0, lengthOf(scene)]).map((at) => Math.round(at * RATE));
  const spectrum = spectrumOf(mixed, RATE, from, to);
  const tonal = tonalPeak(spectrum);
  const tail = levelsOf(mixed.subarray(mixed.length - Math.round(TAIL * RATE)), RATE, TAIL)[0];
  const nodes = [...made.values()].reduce((sum, count) => sum + count, 0);
  const kinds = [...made].map(([kind, count]) => `${kind.replace('create', '')} ${count}`).join(', ');
  const levels = levelsOf(mixed, RATE, LEVEL_STEP).map((level) => Math.round(Math.max(level, -99)));
  const loudest = loudestOf(mixed, RATE, LOUDEST_SPAN);
  const span = scene.held ? ` (${scene.held[0]} to ${scene.held[1]} s)` : '';
  const lines = [
    `${name}: ${scene.what}`,
    `  peak ${tenth(decibels(peak))} dB, loudest ${LOUDEST_SPAN} s ${tenth(loudest)} dB`,
    `  above 150 Hz${span}: ${Math.round(shareAbove(spectrum, 150) * 100)}%; most tonal peak: `
      + `${tenth(tonal.over)} dB over its neighbours at ${Math.round(tonal.hz)} Hz`,
    `  brightness: centroid ${Math.round(centroidOf(spectrum))} Hz, `
      + `above ${BRIGHT_HZ} Hz ${Math.round(shareAbove(spectrum, BRIGHT_HZ) * 100)}%`,
    `  nodes made: ${nodes} (${kinds})`,
    `  level every ${LEVEL_STEP} s (dB): ${levels.join(' ')}`,
    `  last ${TAIL} s: ${tenth(tail)} dB`,
  ];
  if (broken) problems.push(`${name}: a sample isn't a number`);
  if (peak >= 1) problems.push(`${name}: clipped (peak ${tenth(decibels(peak))} dB)`);
  // (a spell plays no notes over the music; a sound of the game's may ring, as metal on metal does)
  const spell = name in SCENES;
  if (tonal.over > TONAL_LIMIT && (spell || canary)) {
    problems.push(`${name}: a note at ${Math.round(tonal.hz)} Hz stands ${tenth(tonal.over)} dB over its noise`);
  }
  if (tail > SILENT) problems.push(`${name}: still sounding at its end (${tenth(tail)} dB)`);
  const wav = { name, base64: base64Of(wavBytes(channels, RATE)) };
  return { lines, problems, wav };
}

/** `lab sound`: each scene rendered, measured and written as a WAV; with a canary, the first again with its faults. */
export async function sound(options: SoundOptions): Promise<Report & { wavs: { name: string; base64: string }[] }> {
  const lines: string[] = [];
  const problems: string[] = [];
  const wavs: { name: string; base64: string }[] = [];
  for (const name of options.sounds) {
    const measured = await measureScene(name, false);
    lines.push(...measured.lines);
    problems.push(...measured.problems);
    wavs.push(measured.wav);
  }
  if (options.canary) {
    const name = options.sounds[0];
    const planted = await measureScene(name, true);
    const heardNote = planted.problems.some((problem) => problem.includes('a note at'));
    const heardOn = planted.problems.some((problem) => problem.includes('still sounding'));
    lines.push(`canary (${name} under a ${CANARY_HZ} Hz note never stopped): `
      + `the note ${heardNote ? 'caught' : 'missed'}, its sounding on ${heardOn ? 'caught' : 'missed'}`);
    if (!heardNote) problems.push(`canary: a held ${CANARY_HZ} Hz note under ${name} went unseen`);
    if (!heardOn) problems.push(`canary: a note never stopped under ${name} went unheard at its end`);
  }
  return { text: lines.join('\n'), problems, wavs };
}
