// The world's ambience (#745, "Add Day and Night Ambient Sound Effects (Birds, Crickets, Rustling Leaves, Fire
// Crackling)"): the village's forest by day and by night, the fountain's water louder as the hero nears it, and every
// fire's burning (the battlegrounds' braziers and bonfires in their runs, the village's campfire, the houses' hearths,
// the hall of heroes' torches) by its distance, each panned to where it is from the camera. No wind (from review:
// "Wind will be messing with people and not let them enjoy the game").
//
// These are recordings, an exception to the game's sounds made in code as the music is (the root AGENTS.md's
// Product rules): made of noise, from review "the water does not sound like water, and the crackling does not sound
// like crackling", and the crickets were "super annoying". Each is fetched and decoded the first time it's wanted
// (never with the game: `scripts/pwa.ts` keeps them out of the install), and made into a seamless loop as it's
// decoded (`seamless`: its last seconds blended into its start, so its end runs on into its start with nothing heard
// at the seam: "you should not hear anything when the audio restarts"), then looped by a buffer source, sample-exact.
// Each layer's level is eased to what the frame asks (`updateAmbience`); played through the effects' level.
import { audioContext, voice } from './audio';
import dayUrl from '../audio/ambience/ambience-day.mp3?url';
import nightUrl from '../audio/ambience/ambience-night.mp3?url';
import waterUrl from '../audio/ambience/ambience-water.mp3?url';
import fireUrl from '../audio/ambience/ambience-fire.mp3?url';

/** A fire heard: its distance from the hero (m), and the way to it from where the camera looks (rad, 0 ahead). */
export interface FireHeard {
  at: number;
  way: number;
}

/** What the ambience is asked for this frame (`main.ts`'s `ambienceWanted`). */
export interface AmbienceWanted {
  /** heard at all (the game shown, the page visible) */
  on: boolean;
  /** the village's own ambience heard: its forest by day and night, its fountain (the village shown) */
  village: boolean;
  /** the village's hour (0 to 24) */
  hour: number;
  /** inside a house or the hall: the outside's layers muffled */
  indoors: boolean;
  /** the fountain's distance from the hero (m), and the way to it from where the camera looks (rad, 0 ahead) */
  waterAt: number;
  waterWay: number;
  /** the nearest fires shown, nearest first (`FIRE_VOICES` of them are heard) */
  fires: readonly FireHeard[];
}

/** the recordings, each looped */
const LOOPS = ['day', 'night', 'water', 'fire'] as const;
type LoopId = (typeof LOOPS)[number];
const URLS: Record<LoopId, string> = { day: dayUrl, night: nightUrl, water: waterUrl, fire: fireUrl };

/** each layer's level at full (a share of the effects' master), each loop evened to `LOUDNESS` first: well under
 *  the music at the default volumes (from Kenneth: "Sounds are way too loud, can barely hear the music": the music
 *  was 4 to 8 dB over them, now 12 to 16, `lab village --only ambienceUnderMusic`) */
const LEVEL: Record<LoopId, number> = { day: 0.18, night: 0.14, water: 0.18, fire: 0.1 };
/** each loop's loudness once evened (its RMS, of full scale: about -20 dB) */
const LOUDNESS = 0.1;
/** how far it's evened up at most (a quiet recording's noise floor isn't raised past this) */
const MOST_GAIN = 8;
/** the blend at a loop's seam (s), and what's cut off each end first (s: a decoder's padding, a fade at its ends) */
const SEAM = 1.5;
const TRIM = 0.05;
/** a faded end is read in windows of this (s), and cut off up to `FADE_MOST` s an end (`fadedEnds`) */
const FADE_WINDOW = 0.05;
const FADE_MOST = 3;
/** how fast a layer's level eases to the asked (s, a time constant), and a pan */
const EASE = 0.8;
const PAN_EASE = 0.1;
/** the hours of the day's forest and the night's, each easing in and out over `DUSK` hours either side */
const DAY = { from: 6.5, to: 19 };
const DUSK = 1.5;
/** a fire heard from this far (m), and at full within `FIRE_NEAR` */
const FIRE_FAR = 14;
const FIRE_NEAR = 2.5;
/** how many fires are heard at once, the nearest */
export const FIRE_VOICES = 3;
/** the fountain heard from this far (m, from its middle), and at full within `WATER_NEAR` (its basin 2.2 m across) */
const WATER_FAR = 16;
const WATER_NEAR = 3;
/** indoors, the outside's share */
const INDOORS = 0.2;

/** A layer of the graph: its level and pan, and its loop's source once its recording is decoded. */
interface Bed {
  id: LoopId;
  gain: GainNode;
  pan: StereoPannerNode | null;
  source: AudioBufferSourceNode | null;
  /** where in its loop it starts (s): the fires' voices apart, so two never play the same moment */
  offset: number;
}

/** The ambience's graph: the forest's two, the water and the fires' voices. */
interface Graph {
  day: Bed;
  night: Bed;
  water: Bed;
  fires: Bed[];
}

let graph: Graph | null = null;
/** each recording decoded and made a seamless loop, and those on their way */
const loops: Partial<Record<LoopId, AudioBuffer>> = {};
const loading = new Map<LoopId, Promise<void>>();

/** What the ambience asks of its layers. */
interface Levels {
  day: number;
  night: number;
  water: number;
  waterPan: number;
  /** each fire voice's level and pan, the nearest fire first */
  fires: number[];
  firePans: number[];
}

const silent = (): Levels => ({
  day: 0, night: 0, water: 0, waterPan: 0, fires: Array(FIRE_VOICES).fill(0), firePans: Array(FIRE_VOICES).fill(0),
});
/** each layer's level asked last (a harness reads it: `lab village --only ambienceHeard`) */
let asked: Levels = silent();

/** The levels the ambience asks its layers for now (0 to their full level), and the water's and fires' pans. */
export const ambienceNow = (): Readonly<Levels> => asked;

/** A share rising from 0 to 1 over `span` from `a`, and falling back over `span` to `b`. */
function within(x: number, a: number, b: number, span: number): number {
  const rise = Math.min(1, Math.max(0, (x - a + span / 2) / span));
  const fall = Math.min(1, Math.max(0, (b - x + span / 2) / span));
  return Math.min(rise, fall);
}

/** How much of the day it is at `hour`: 1 by day, 0 by night, easing between at dawn and dusk. */
export const dayShare = (hour: number): number => within(hour, DAY.from, DAY.to, DUSK);

/** How near a sound's place is: 1 within `near` m, 0 past `far`, easing as the square of the share between. */
function nearness(at: number, near: number, far: number): number {
  const share = Math.min(1, Math.max(0, (far - at) / (far - near)));
  return share * share;
}

/** The levels `wanted` asks of each layer (0 to its full level), and the water's and the fires' pans. */
export function levelsFor(wanted: AmbienceWanted): Levels {
  const levels = silent();
  if (!wanted.on) return levels;
  if (wanted.village) {
    const day = dayShare(wanted.hour);
    const out = wanted.indoors ? INDOORS : 1;
    levels.day = LEVEL.day * out * day;
    levels.night = LEVEL.night * out * (1 - day);
    levels.water = wanted.indoors ? 0 : LEVEL.water * nearness(wanted.waterAt, WATER_NEAR, WATER_FAR);
    levels.waterPan = Math.sin(wanted.waterWay);
  }
  for (let i = 0; i < FIRE_VOICES; i++) {
    const fire = wanted.fires[i];
    if (!fire) continue;
    levels.fires[i] = LEVEL.fire * nearness(fire.at, FIRE_NEAR, FIRE_FAR);
    levels.firePans[i] = Math.sin(fire.way);
  }
  return levels;
}

/**
 * `source` made a loop that runs on from its end into its start with nothing heard at the seam, evened to
 * `LOUDNESS`: `trim` s cut off each end (a decoder's padding, a fade at the recording's ends), then its last `fade` s
 * blended into its first at equal power and left off its end. So its last sample is followed by the one that
 * followed it in the recording, as the blend starts all from the end, and moves over to the start as it goes.
 */
export function seamless(c: BaseAudioContext, source: AudioBuffer, fade = SEAM, trim = TRIM): AudioBuffer {
  const rate = source.sampleRate;
  const [head, tail] = fadedEnds(source);
  const most = Math.floor(source.length / 8);
  const cutHead = Math.min(Math.max(Math.floor(trim * rate), head), most);
  const cutTail = Math.min(Math.max(Math.floor(trim * rate), tail), most);
  const kept = source.length - cutHead - cutTail;
  const blend = Math.min(Math.floor(fade * rate), Math.floor(kept / 3));
  const length = kept - blend;
  const out = c.createBuffer(source.numberOfChannels, length, rate);
  let squares = 0;
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const from = source.getChannelData(ch).subarray(cutHead, cutHead + kept);
    const to = out.getChannelData(ch);
    to.set(from.subarray(0, length));
    for (let i = 0; i < blend; i++) {
      const share = ((i + 0.5) / blend) * (Math.PI / 2);
      to[i] = from[i] * Math.sin(share) + from[length + i] * Math.cos(share);
    }
    for (let i = 0; i < length; i++) squares += to[i] * to[i];
  }
  const rms = Math.sqrt(squares / (length * source.numberOfChannels));
  const gain = rms > 0 ? Math.min(MOST_GAIN, LOUDNESS / rms) : 1;
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const to = out.getChannelData(ch);
    for (let i = 0; i < length; i++) to[i] *= gain;
  }
  return out;
}

/** How many samples at each end of `source` are faded (quieter than half its middle window's loudness, -6 dB: a
 *  recording faded in and out), `FADE_MOST` s at most an end: blended into each other, a faded end and a faded start
 *  dipped the day's forest 4 dB at its seam. */
function fadedEnds(source: AudioBuffer): [number, number] {
  const window = Math.round(FADE_WINDOW * source.sampleRate);
  const count = Math.floor(source.length / window);
  const levels = new Float32Array(count);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const data = source.getChannelData(ch);
    for (let w = 0; w < count; w++) {
      let squares = 0;
      for (let i = w * window; i < (w + 1) * window; i++) squares += data[i] * data[i];
      levels[w] = Math.max(levels[w], Math.sqrt(squares / window));
    }
  }
  const quiet = [...levels].sort((a, b) => a - b)[Math.floor(count / 2)] * 0.5;
  const most = Math.floor(FADE_MOST / FADE_WINDOW);
  let head = 0;
  while (head < most && head < count && levels[head] < quiet) head++;
  let tail = 0;
  while (tail < most && tail < count && levels[count - 1 - tail] < quiet) tail++;
  return [head * window, tail * window + (source.length - count * window)];
}

/** Recording `id` fetched, decoded in `c` and made a seamless loop, once (a failed one is silent, and tried again). */
function load(c: BaseAudioContext, id: LoopId): Promise<void> {
  let on = loading.get(id);
  if (!on) {
    on = (async () => {
      try {
        const data = await (await fetch(URLS[id])).arrayBuffer();
        loops[id] = seamless(c, await c.decodeAudioData(data));
      } catch {
        loading.delete(id);
      }
    })();
    loading.set(id, on);
  }
  return on;
}

/** Every recording decoded and made a loop (the lab's renders, which play them at once). */
export async function ambienceLoaded(c: BaseAudioContext): Promise<void> {
  await Promise.all(LOOPS.map((id) => load(c, id)));
}

/** Each recording as it loops (the lab's `ambienceSeams`), those decoded. */
export const ambienceLoops = (): Readonly<Partial<Record<LoopId, AudioBuffer>>> => loops;

/** The graph made in the effects' context: each layer's level (and pan) into the effects' output. */
function makeGraph(): Graph {
  const v = voice(0, 0.05);
  const c = v.c;
  const bed = (id: LoopId, panned: boolean, offset = 0): Bed => {
    const gain = c.createGain();
    gain.gain.value = 0;
    let pan: StereoPannerNode | null = null;
    if (panned) {
      pan = c.createStereoPanner();
      gain.connect(pan).connect(v.out);
    } else {
      gain.connect(v.out);
    }
    return { id, gain, pan, source: null, offset };
  };
  const fires = Array.from({ length: FIRE_VOICES }, (_, i) => bed('fire', true, i * 7.3));
  return { day: bed('day', false), night: bed('night', false), water: bed('water', true), fires };
}

/** `b`'s loop started (looped over its whole length, from its offset) once its recording is decoded. */
function startWhenLoaded(c: BaseAudioContext, b: Bed, at: number): void {
  const buffer = loops[b.id];
  if (b.source || !buffer) return;
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(b.gain);
  source.start(at, b.offset % buffer.duration);
  b.source = source;
}

/** Each bed of `g` with the level and pan `levels` asks of it, as a list. */
function bedsOf(g: Graph, levels: Levels): { bed: Bed; level: number; pan: number }[] {
  return [
    { bed: g.day, level: levels.day, pan: 0 },
    { bed: g.night, level: levels.night, pan: 0 },
    { bed: g.water, level: levels.water, pan: levels.waterPan },
    ...g.fires.map((bed, i) => ({ bed, level: levels.fires[i], pan: levels.firePans[i] })),
  ];
}

/** A frame of the ambience: each layer's recording fetched once it's first wanted, its level eased to the asked. */
export function updateAmbience(wanted: AmbienceWanted): void {
  const levels = levelsFor(wanted);
  asked = levels;
  const c = audioContext();
  if (!c) return;
  // (made the first frame anything is heard: a battleground with no fire near makes none)
  if (!graph) {
    if (!anyHeard(levels)) return;
    graph = makeGraph();
  }
  const now = c.currentTime;
  for (const { bed, level, pan } of bedsOf(graph, levels)) {
    if (level > 0) {
      void load(c, bed.id);
      startWhenLoaded(c, bed, now);
    }
    bed.gain.gain.setTargetAtTime(level, now, EASE);
    bed.pan?.pan.setTargetAtTime(pan, now, PAN_EASE);
  }
}

/** Whether any layer is asked to be heard. */
function anyHeard(levels: Levels): boolean {
  return levels.day + levels.night + levels.water + levels.fires.reduce((a, b) => a + b, 0) > 0;
}

/** The ambience played at `wanted` into the effects' current context until its stop() (the lab's `lab sound`
 *  renders it offline, a graph of its own there; `ambienceLoaded` first, or the layers not yet decoded are silent). */
export function playAmbience(wanted: AmbienceWanted): () => void {
  const g = makeGraph();
  const levels = levelsFor(wanted);
  const c = g.day.gain.context;
  const now = c.currentTime;
  for (const { bed, level, pan } of bedsOf(g, levels)) {
    bed.gain.gain.setValueAtTime(level, now);
    bed.pan?.pan.setValueAtTime(pan, now);
    if (level > 0) startWhenLoaded(c, bed, now);
  }
  return () => {
    const end = c.currentTime;
    for (const { bed } of bedsOf(g, levels)) bed.gain.gain.setTargetAtTime(0, end, 0.1);
  };
}
