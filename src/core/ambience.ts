// The village's ambience (#745, "Add Day and Night Ambient Sound Effects (Birds, Crickets, Rustling Leaves, Fire
// Crackling)"): wind in the leaves always, birds by day, crickets by night, and the campfire crackling louder as the
// hero nears it, panned to where it is from the camera. Made of noise as the spells are (docs/agents/audio.md: no notes
// over the music): a bird's chirp is a narrow band of noise swept up or down, a cricket's trill a narrower one pulsed.
// One graph made at the first frame it's wanted and kept, each layer's level eased to what the frame asks
// (`updateAmbience`); played through the effects' level, so the effects slider sets it.
import { audioContext, voice } from './audio';

/** What the ambience is asked for this frame (`main.ts`'s `ambienceWanted`). */
export interface AmbienceWanted {
  /** heard at all (the village shown, the page visible) */
  on: boolean;
  /** the village's hour (0 to 24) */
  hour: number;
  /** inside a house: the outside's layers muffled */
  indoors: boolean;
  /** the campfire's distance from the hero (m), and the way to it from where the camera looks (rad, 0 ahead) */
  fireAt: number;
  fireWay: number;
}

/** the layers looped and eased (the birds' channel among them) */
const LAYERS = ['wind', 'leaves', 'birds', 'crickets', 'fire'] as const;

/** Each layer's level at full (a share of the effects' master): soft under the music and the spells (`lab sound`'s
 *  `ambienceDay`, `ambienceNight`, `ambienceFire`: their loudest half second -35 to -38 dB, a swing's -26, a
 *  shot's -32; a narrow band carries a small share of the noise, so the birds and crickets need the most to stand
 *  out). */
const LEVEL = { wind: 0.11, leaves: 0.02, birds: 0.9, crickets: 0.45, fire: 0.3 };
/** how fast a layer's level eases to the asked (s, a time constant) */
const EASE = 0.8;
/** the hours the birds sing and the crickets trill, each easing in and out over `DUSK` hours either side */
const DAY = { from: 6.5, to: 19 };
const DUSK = 1.5;
/** the campfire heard from this far (m), and at full within `FIRE_NEAR` */
const FIRE_FAR = 14;
const FIRE_NEAR = 2.5;
/** indoors, the outside's share */
const INDOORS = 0.2;
/** a bird's phrase every this many seconds or so (the least, and the spread over it), and its chirps (the most) */
const PHRASE_EVERY = 1.6;
const PHRASE_SPREAD = 4.5;
const PHRASE_MOST = 5;

/** The ambience's graph: each layer's own level, and the fire's pan. */
interface Graph {
  wind: GainNode;
  leaves: GainNode;
  birds: GainNode;
  crickets: GainNode;
  fire: GainNode;
  firePan: StereoPannerNode;
}

let graph: Graph | null = null;
/** the audio clock the next bird's phrase is due by */
let nextPhrase = 0;
/** each layer's level asked last (a harness reads it: `lab village --only ambienceHeard`) */
const asked = { wind: 0, leaves: 0, birds: 0, crickets: 0, fire: 0, firePan: 0 };

/** The levels the ambience asks its layers for now (0 to their full level), and the fire's pan. */
export const ambienceNow = (): Readonly<typeof asked> => asked;

/** A share rising from 0 to 1 over `span` from `a`, and falling back over `span` to `b`. */
function within(x: number, a: number, b: number, span: number): number {
  const rise = Math.min(1, Math.max(0, (x - a + span / 2) / span));
  const fall = Math.min(1, Math.max(0, (b - x + span / 2) / span));
  return Math.min(rise, fall);
}

/** How much of the day it is at `hour`: 1 by day, 0 by night, easing between at dawn and dusk. */
export const dayShare = (hour: number): number => within(hour, DAY.from, DAY.to, DUSK);

/** The graph made in the effects' context: wind, leaves, crickets and the fire looped, the birds' channel. */
function makeGraph(): Graph {
  const v = voice(0, 0.12);
  const c = v.c;
  const channel = (to: AudioNode = v.out): GainNode => {
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(to);
    return g;
  };
  // the wind: a wide band of noise round 700 Hz, its gusts two slow swells of its level
  const wind = channel();
  const gust = c.createGain();
  gust.gain.value = 0.55;
  v.lfo(0.07, 0.3, gust.gain);
  v.lfo(0.19, 0.15, gust.gain);
  const windBand = c.createBiquadFilter();
  windBand.type = 'bandpass';
  windBand.frequency.value = 700;
  windBand.Q.value = 0.45;
  v.loop(windBand);
  windBand.connect(gust).connect(wind);
  // the leaves: the crackle slowed and kept high, a rustle that swells with the gusts
  const leaves = channel();
  const rustle = c.createGain();
  rustle.gain.value = 0.5;
  v.lfo(0.07, 0.35, rustle.gain);
  const leafBand = c.createBiquadFilter();
  leafBand.type = 'highpass';
  leafBand.frequency.value = 2600;
  v.crackle(leafBand, 0.5);
  leafBand.connect(rustle).connect(leaves);
  // the crickets: three, each a narrow band of noise pulsed some 50 times a second in groups (two slow pulses of
  // its level), apart in pitch, rate and place
  const crickets = channel();
  for (const [hz, pulse, group, pan] of [[4300, 24, 1.3, -0.6], [4700, 27, 0.9, 0.5], [3900, 22, 1.7, 0.1]]) {
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = hz;
    band.Q.value = 16;
    const trill = c.createGain();
    trill.gain.value = 0;
    v.lfo(pulse, 1, trill.gain);
    const chirp = c.createGain();
    chirp.gain.value = 0;
    v.lfo(group, 1, chirp.gain);
    v.loop(band);
    band.connect(trill).connect(chirp).connect(v.lane(1, pan, crickets));
  }
  // the fire: its crackle sparse and mid-bright, a soft roar of noise under it, flickering
  const firePan = c.createStereoPanner();
  firePan.connect(v.out);
  const fire = channel(firePan);
  const crackBand = c.createBiquadFilter();
  crackBand.type = 'bandpass';
  crackBand.frequency.value = 1400;
  crackBand.Q.value = 0.7;
  const spit = c.createGain();
  spit.gain.value = 1.4;
  v.crackle(crackBand, 0.32);
  crackBand.connect(spit).connect(fire);
  const roarBand = c.createBiquadFilter();
  roarBand.type = 'bandpass';
  roarBand.frequency.value = 450;
  roarBand.Q.value = 0.8;
  const flicker = c.createGain();
  flicker.gain.value = 0.5;
  v.lfo(0.6, 0.15, flicker.gain);
  v.lfo(1.7, 0.08, flicker.gain);
  v.loop(roarBand);
  roarBand.connect(flicker).connect(fire);
  // the birds: a channel each phrase's chirps are played into
  const birds = channel();
  v.start();
  return { wind, leaves, birds, crickets, fire, firePan };
}

/** One bird's phrase of 2 to `PHRASE_MOST` chirps from `at` (s, the audio clock), at a place of its own: each a
 *  narrow band of noise swept up or down within 2.4 to 5.5 kHz in a twentieth to a tenth of a second. */
function phrase(g: Graph, at: number): void {
  const v = voice(0, 0.25);
  v.out.disconnect();
  v.out.connect(g.birds);
  const pan = v.c.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  const level = v.c.createGain();
  level.gain.value = 0.4 + Math.random() * 0.6;
  pan.connect(level).connect(v.out);
  const low = 2400 + Math.random() * 1800;
  const chirps = 2 + Math.floor(Math.random() * (PHRASE_MOST - 1));
  let t = at;
  for (let i = 0; i < chirps; i++) {
    const dur = 0.05 + Math.random() * 0.06;
    const up = Math.random() < 0.6;
    const from = up ? low : low * 1.3, to = up ? low * 1.3 : low;
    const band = v.c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 16;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = v.c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const src = v.c.createBufferSource();
    src.buffer = noiseSource(v.c);
    src.connect(band).connect(env).connect(pan);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
    t += dur + 0.03 + Math.random() * 0.08;
  }
}

/** A short buffer of noise for the chirps (made once a context). */
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseSource(c: BaseAudioContext): AudioBuffer {
  let buffer = noises.get(c);
  if (!buffer) {
    buffer = c.createBuffer(1, Math.floor(c.sampleRate * 1.2), c.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(c, buffer);
  }
  return buffer;
}

/** The levels `wanted` asks of each layer (0 to its full level), and the fire's pan. */
export function levelsFor(wanted: AmbienceWanted): typeof asked {
  if (!wanted.on) return { wind: 0, leaves: 0, birds: 0, crickets: 0, fire: 0, firePan: 0 };
  const day = dayShare(wanted.hour);
  const out = wanted.indoors ? INDOORS : 1;
  const near = Math.min(1, Math.max(0, (FIRE_FAR - wanted.fireAt) / (FIRE_FAR - FIRE_NEAR)));
  return {
    wind: LEVEL.wind * out * (0.7 + 0.3 * day),
    leaves: LEVEL.leaves * out * (0.6 + 0.4 * day),
    birds: LEVEL.birds * out * day,
    crickets: LEVEL.crickets * out * (1 - day),
    fire: wanted.indoors ? 0 : LEVEL.fire * near * near,
    firePan: Math.sin(wanted.fireWay),
  };
}

/** A frame of the ambience: each layer eased to what `wanted` asks, a bird's phrase now and then by day. */
export function updateAmbience(wanted: AmbienceWanted): void {
  const levels = levelsFor(wanted);
  Object.assign(asked, levels);
  const c = audioContext();
  if (!c || (!graph && !wanted.on)) return;
  graph ??= makeGraph();
  const now = c.currentTime;
  for (const layer of LAYERS) {
    graph[layer].gain.setTargetAtTime(levels[layer], now, EASE);
  }
  graph.firePan.pan.setTargetAtTime(levels.firePan, now, 0.1);
  if (levels.birds > 0.001 && now >= nextPhrase) {
    if (nextPhrase > 0) phrase(graph, now + 0.05);
    nextPhrase = now + PHRASE_EVERY + Math.random() * PHRASE_SPREAD;
  }
}

/** The ambience played at `wanted` into the effects' current context until its stop() (the lab's `lab sound`
 *  renders it offline: a graph of its own there, birds scheduled ahead over `seconds`). */
export function playAmbience(wanted: AmbienceWanted, seconds: number): () => void {
  const g = makeGraph();
  const levels = levelsFor(wanted);
  const now = g.wind.context.currentTime;
  for (const layer of LAYERS) g[layer].gain.setValueAtTime(levels[layer], now);
  g.firePan.pan.setValueAtTime(levels.firePan, now);
  if (levels.birds > 0.001) {
    for (let at = now + 0.3; at < now + seconds; at += PHRASE_EVERY + Math.random() * PHRASE_SPREAD) phrase(g, at);
  }
  return () => {
    const end = g.wind.context.currentTime;
    for (const layer of LAYERS) g[layer].gain.setTargetAtTime(0, end, 0.1);
  };
}
