// Procedural sound effects with WebAudio (no audio files; the music is `music.ts`), and the volumes the settings set.
import { readCookie, writeCookie } from './cookies';

/** the game's own context, which the music shares */
let live: AudioContext | null = null;
/** where the effects are played: the game's context, or one the lab renders them into (`playInto`) */
let ctx: BaseAudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let crackleBuf: AudioBuffer | null = null;
let last: Record<string, number> = {};
/** the effects' level at full volume */
const LEVEL = 0.45;

/** The volume settings (the pause menu's Settings): each a share of its slider, 0 to 1. */
export interface Volumes {
  /** everything */
  master: number;
  music: number;
  effects: number;
}
const VOLUME_COOKIE = 'last-stand-volume';
const FULL: Volumes = { master: 1, music: 1, effects: 1 };
let volumes: Volumes = { ...FULL };
/** The game's own mix: everything through `out` (the master volume), the effects' level, the music's own volume. */
let mix: { out: GainNode; effects: GainNode; music: GainNode } | null = null;
/** how quickly a moved slider is eased to (s, a time constant: no zipper noise as it's dragged) */
const VOLUME_EASE = 0.03;

/** Called at boot (the context starts suspended: opening the audio device is slow, so it happens
 *  behind the loading screen) and on every user gesture (which lets it resume). */
export function initAudio(): void {
  if (live) { if (live.state === 'suspended') void live.resume(); return; }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    live = new Ctor();
  } catch { return; }
  const out = live.createGain(); out.connect(live.destination);
  const music = live.createGain(); music.connect(out);
  wire(live, out);
  mix = { out, effects: master!, music };
  volumes = readVolumes();
  applyVolumes(false);
}

/** The effects' graph made in `c`: the master and its compressor (into `to`), the noise they're made of and the
 *  hall. */
function wire(c: BaseAudioContext, to: AudioNode = c.destination): void {
  ctx = c;
  master = c.createGain();
  master.gain.value = LEVEL;
  const comp = c.createDynamicsCompressor();
  master.connect(comp).connect(to);
  noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  crackleBuf = crackles(c);
  // (the spells' hall made here, behind the loading screen, not at a first cast)
  hall = null;
  space();
}

/** Crackle: sparse clicks of random size and sign, each dying in a fraction of a millisecond, about 260 a second, as
 *  an electric discharge or a sparkler spits. Looped through a filter it is arcane energy fizzing, and it has no pitch. */
function crackles(c: BaseAudioContext): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
  const d = buf.getChannelData(0);
  const chance = 260 / c.sampleRate, fall = Math.exp(-1 / (c.sampleRate * 0.0004));
  let level = 0;
  for (let i = 0; i < d.length; i++) {
    if (Math.random() < chance) level = (Math.random() < 0.5 ? -1 : 1) * (0.2 + 0.8 * Math.random() ** 2);
    d[i] = level * (Math.random() * 0.6 + 0.4);
    level *= fall;
  }
  return buf;
}

/** A slider's share as a gain: its square, so its middle is a quarter (-12 dB), half as loud as heard, and the
 *  slider's travel spread evenly over what's heard (a linear gain did nearly nothing over its top half). */
const loudness = (share: number): number => share * share;

/** A volume from its cookie's text: a share from 0 to 1, full where it's missing or broken. */
function shareFrom(text: string | undefined): number {
  const share = Number(text);
  return text && Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 1;
}

/** The volumes as last saved (`last-stand-volume`: master, music, effects). */
function readVolumes(): Volumes {
  const [master, music, effects] = (readCookie(VOLUME_COOKIE) ?? '').split(',');
  return { master: shareFrom(master), music: shareFrom(music), effects: shareFrom(effects) };
}

/** The volumes set on the game's mix: eased to as a slider moves, at once as the game starts. */
function applyVolumes(ease: boolean): void {
  if (!live || !mix) return;
  const at = live.currentTime;
  const set = (gain: AudioParam, to: number): void => {
    gain.cancelScheduledValues(at);
    if (ease) gain.setTargetAtTime(to, at, VOLUME_EASE);
    else gain.value = to;
  };
  set(mix.out.gain, loudness(volumes.master));
  set(mix.music.gain, loudness(volumes.music));
  set(mix.effects.gain, LEVEL * loudness(volumes.effects));
}

/** The volume settings now. */
export const volumeSettings = (): Volumes => ({ ...volumes });

/** Some of the volumes changed, saved and heard at once. */
export function setVolumes(change: Partial<Volumes>): void {
  volumes = {
    master: shareFrom(String(change.master ?? volumes.master)),
    music: shareFrom(String(change.music ?? volumes.music)),
    effects: shareFrom(String(change.effects ?? volumes.effects)),
  };
  writeCookie(VOLUME_COOKIE, `${volumes.master},${volumes.music},${volumes.effects}`);
  applyVolumes(true);
}

/** The shared context (null before boot or where WebAudio is missing), for the music (`core/music.ts`). */
export const audioContext = (): AudioContext | null => live;

/** Where the music plays into: its own volume, then the master's (null before boot or where WebAudio is missing). */
export const musicOutput = (): AudioNode | null => mix?.music ?? null;

/** The effects played into `c` until the returned function puts the game's own back: made there as the game makes
 *  them, through a master, a compressor and a hall of their own at the default level. The lab's `sound` renders them
 *  so into an `OfflineAudioContext`. */
export function playInto(c: BaseAudioContext): () => void {
  const kept = { ctx, master, noiseBuf, crackleBuf, hall, last };
  last = {};
  wire(c);
  return () => ({ ctx, master, noiseBuf, crackleBuf, hall, last } = kept);
}

/** whether a sound of this name played within `ms` (by the context's own clock, which an offline render keeps too) */
function throttle(name: string, ms: number): boolean {
  const now = ctx!.currentTime * 1000;
  if (last[name] !== undefined && now - last[name] < ms) return true;
  last[name] = now;
  return false;
}

function env(g: GainNode, t: number, a: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
}

interface NoiseOpts { dur?: number; freq?: number; q?: number; type?: BiquadFilterType; gain?: number; sweep?: number | null; attack?: number }
function noise({ dur = 0.3, freq = 1200, q = 1, type = 'bandpass', gain = 0.5, sweep = null, attack = 0.005 }: NoiseOpts): void {
  const c = ctx!;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = c.createGain(); env(g, t, attack, gain, dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random()); src.stop(t + dur + attack + 0.05);
}

interface ToneOpts { freq?: number; to?: number | null; dur?: number; type?: OscillatorType; gain?: number; attack?: number; delay?: number }
function tone({ freq = 440, to = null, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.005, delay = 0 }: ToneOpts): void {
  const c = ctx!;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain(); env(g, t, attack, gain, dur);
  o.connect(g).connect(master!);
  o.start(t); o.stop(t + dur + attack + 0.05);
}

/** A shared hall the spells ring in: a convolver over a stereo impulse of noise decaying over 2.6 s, darkening as
 *  it dies (the high end of a real room goes first), made at boot. Sounds send to it beside their dry path, so
 *  their tail rings on after they stop. */
let hall: GainNode | null = null;
function space(): GainNode {
  if (hall) return hall;
  const c = ctx!;
  const len = Math.floor(c.sampleRate * 2.6);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      // a one-pole lowpass that closes as the tail goes on
      lp += (Math.random() * 2 - 1 - lp) * (0.9 - 0.75 * k);
      d[i] = lp * (1 - k) ** 2.4;
    }
  }
  const conv = c.createConvolver(); conv.buffer = ir;
  hall = c.createGain(); hall.gain.value = 0.5;
  hall.connect(conv).connect(master!);
  return hall;
}

/** A soft clipper (tanh), one curve per drive: its harmonics are what make a sound read as loud on any speaker,
 *  as a laptop's plays almost nothing under 100 Hz (the lance's first drone was a 41 Hz sub, silence there). */
const curves = new Map<number, Float32Array<ArrayBuffer>>();
function drive(k: number): WaveShaperNode {
  let curve = curves.get(k);
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(k * ((i / (curve.length - 1)) * 2 - 1)) / Math.tanh(k);
    curves.set(k, curve);
  }
  const s = ctx!.createWaveShaper(); s.curve = curve; s.oversample = '2x';
  return s;
}

/** A small graph for a layered sound: an output (faded in over `fadeIn` s, at once for 0), sent dry and to the
 *  hall, and its oscillators and loops, all started and stopped together. */
function voice(fadeIn: number, wet: number) {
  const c = ctx!;
  const t = c.currentTime;
  const out = c.createGain();
  if (fadeIn > 0) { out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(1, t + fadeIn); }
  out.connect(master!);
  const send = c.createGain(); send.gain.value = wet;
  out.connect(send).connect(space());
  const oscs: OscillatorNode[] = [], srcs: AudioBufferSourceNode[] = [];
  const osc = (type: OscillatorType, freq: number, to: AudioNode): OscillatorNode => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(to); oscs.push(o); return o;
  };
  const lfo = (rate: number, depth: number, param: AudioParam): void => {
    const g = c.createGain(); g.gain.value = depth; g.connect(param); osc('sine', rate, g);
  };
  const loop = (to: AudioNode): AudioBufferSourceNode => {
    const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(to); srcs.push(s); return s;
  };
  /** the crackle looped into `to`, its clicks `rate` times as dense (and as bright) */
  const crackle = (to: AudioNode, rate = 1): AudioBufferSourceNode => {
    const s = c.createBufferSource(); s.buffer = crackleBuf; s.loop = true; s.playbackRate.value = rate;
    s.connect(to); srcs.push(s); return s;
  };
  /** a gain panned across the stereo field, into `to` (out by default) */
  const lane = (gain: number, pan: number, to: AudioNode = out): GainNode => {
    const g = c.createGain(); g.gain.value = gain;
    const p = c.createStereoPanner(); p.pan.value = pan;
    g.connect(p).connect(to);
    return g;
  };
  /** a gain shaped as a blow: up in `attack` s to `peak`, down over `decay` s, into `to` */
  const hit = (peak: number, decay: number, to: AudioNode = out, attack = 0.004): GainNode => {
    const g = c.createGain(); env(g, t, attack, peak, decay); g.connect(to); return g;
  };
  /** a filter whose frequency glides from `from` to `to` over `dur` s */
  const sweep = (type: BiquadFilterType, from: number, to: number, dur: number, q = 1): BiquadFilterNode => {
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    return f;
  };
  /** a flanger into `to`: the sound beside itself delayed a few ms, fed back, the delay swept by a slow LFO, so a
   *  comb of notches runs up and down it. On noise it is the jet's roar of an energy beam, and has no pitch. */
  const flange = (to: AudioNode, ms: number, depthMs: number, rate: number, feedback: number): GainNode => {
    const input = c.createGain();
    const d = c.createDelay(0.05); d.delayTime.value = ms / 1000;
    const fb = c.createGain(); fb.gain.value = feedback;
    input.connect(to); input.connect(d); d.connect(fb).connect(d); d.connect(to);
    lfo(rate, depthMs / 1000, d.delayTime);
    return input;
  };
  const start = (): void => { srcs.forEach((s) => s.start(t, Math.random() * 1.2)); oscs.forEach((o) => o.start(t)); };
  const stopAt = (at: number): void => { srcs.forEach((s) => s.stop(at)); oscs.forEach((o) => o.stop(at)); };
  /** fade out over `fade` s, everything stopped just after (the hall rings on); returns when it began */
  const end = (fade: number): number => {
    const n = c.currentTime;
    out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), n);
    out.gain.exponentialRampToValueAtTime(0.0001, n + fade);
    stopAt(n + fade + 0.05);
    return n;
  };
  return { c, t, out, osc, lfo, loop, crackle, lane, hit, sweep, flange, start, stopAt, end };
}

// Void Lance is a beam of raw arcana, so it plays no notes: chimes, a chord, a choir and glittering bells over it
// played as a second tune in another key over the music (from play, "the background music gets duplicated", "like
// coins falling"), and so did #413's rumble of saws on A, climbing an octave as the portal opened. Its power is noise
// alone: a flanged roar, a driven pressure under it, and the arcana crackling (`crackles`), as its sparks show.

/** Void Lance's cast, the portal drawn over `dur` s: a spark traces its rim (in the first 0.7 of it) and power
 *  gathers into it. The spark's crackle circling the ears once a trace and brightening, a roar of noise swelling up
 *  from a murmur, flanged, and a pressure of dark noise swelling under it. Returns a stop() (let go early, it dies
 *  away). */
function lanceInhale(dur: number): () => void {
  const v = voice(0.04, 0.3);
  const { c, t } = v;
  const swell = (from: number, peak: number, to: AudioNode): GainNode => {
    const g = c.createGain(); g.gain.setValueAtTime(from, t); g.gain.exponentialRampToValueAtTime(peak, t + dur); g.connect(to); return g;
  };
  // the gathering roar: noise opening from dark to bright, flanged, each ear its own
  const closing: BiquadFilterNode[] = [];
  for (const [pan, rate] of [[-0.6, 1.3], [0.6, 1.7]]) {
    const f = v.sweep('lowpass', 400, 5000, dur, 0.8);
    v.loop(f); f.connect(v.flange(swell(0.003, 0.16, v.lane(1, pan)), 4, 3, rate, 0.6));
    closing.push(f);
  }
  // the spark tracing the rim: crackle going round the ears once a trace, brightening as the portal fills
  const round = c.createStereoPanner(); round.connect(v.out);
  v.lfo(1 / (dur * 0.7), 0.6, round.pan);
  const spark = v.sweep('bandpass', 2400, 5500, dur, 0.7);
  v.crackle(spark, 0.9); spark.connect(swell(0.3, 0.8, round));
  // the pressure under it: dark noise, driven, swelling (no pitch to climb)
  const low = v.sweep('lowpass', 160, 700, dur, 1.1), sh = drive(2.5);
  v.loop(low); low.connect(sh).connect(swell(0.004, 0.2, v.out));
  closing.push(low);
  v.start();
  // let go early, it winds down rather than cuts: everything closing to dark
  return () => {
    const n = v.end(0.3);
    for (const f of closing) { const now = f.frequency.value; f.frequency.cancelScheduledValues(n); f.frequency.setValueAtTime(now, n); f.frequency.setTargetAtTime(200, n, 0.08); }
  };
}

/** The lance bursting out of the portal: a driven blow of dark noise, a blast closing from white to dark (an
 *  explosion's shape), a crack, the arcana's discharge crackling out, and a flanged whoosh of the beam leaving. */
function lanceBurst(): void {
  const v = voice(0, 0.6);
  const { c, t } = v;
  // the blow: dark noise falling to the floor of hearing, driven, so a laptop hears it as a thump
  const boom = v.sweep('lowpass', 900, 90, 0.5, 1), boomSh = drive(3.5);
  v.loop(boom); boom.connect(boomSh).connect(v.hit(0.4, 0.7));
  // the blast
  const blastF = v.sweep('lowpass', 7000, 260, 0.6, 0.9), blastSh = drive(3);
  v.loop(blastF); blastF.connect(blastSh).connect(v.hit(0.16, 0.6, v.out, 0.003));
  // the crack
  const crackF = c.createBiquadFilter(); crackF.type = 'highpass'; crackF.frequency.value = 2500;
  v.loop(crackF); crackF.connect(v.hit(0.16, 0.06, v.out, 0.001));
  // the discharge
  const spit = c.createBiquadFilter(); spit.type = 'bandpass'; spit.frequency.value = 3200; spit.Q.value = 0.6;
  v.crackle(spit, 1.4); spit.connect(v.hit(1.1, 0.45, v.out, 0.002));
  // the whoosh, flanged, sweeping up as the beam leaves
  const whooshF = v.sweep('bandpass', 500, 6000, 0.4, 0.9);
  v.loop(whooshF); whooshF.connect(v.flange(v.hit(0.12, 0.45, v.out, 0.015), 3, 2.5, 3, 0.7));
  v.start(); v.stopAt(t + 1.1);
}

/** Void Lance held, a beam of raw arcana. The roar: noise through a slowly breathing lowpass and a flanger in each
 *  ear, out of step, the jet of the beam, trembling a little as its width does (about 4.8 times a second). The
 *  pressure: dark noise, driven, through a filter wandering slowly. The arcana: crackle in each ear, surging and
 *  ebbing out of step, as its sparks stream along it. The heat: a sizzle high over it. No pitch anywhere, so nothing
 *  plays against the music, and nothing repeats: each layer drifts at its own slow rate. Returns a stop(). */
function lanceDrone(): () => void {
  const v = voice(0.08, 0.2);
  const { c } = v;
  const closing: [BiquadFilterNode, number][] = [];

  // the roar
  const roar = c.createGain(); roar.connect(v.out);
  v.lfo(4.77, 0.1, roar.gain);
  for (const [pan, rate, ms] of [[-0.55, 0.23, 3.5], [0.55, 0.31, 5]]) {
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200; f.Q.value = 0.7;
    v.loop(f); f.connect(v.flange(v.lane(0.13, pan, roar), ms, ms * 0.7, rate, 0.65));
    v.lfo(rate * 1.7, 1100, f.frequency);
    closing.push([f, 260]);
  }

  // the pressure
  const bodyF = c.createBiquadFilter(); bodyF.type = 'lowpass'; bodyF.frequency.value = 420; bodyF.Q.value = 0.9;
  const bodySh = drive(3);
  const body = c.createGain(); body.gain.value = 0.15;
  v.loop(bodyF); bodyF.connect(bodySh).connect(body).connect(v.out);
  v.lfo(0.29, 140, bodyF.frequency);
  closing.push([bodyF, 110]);

  // the arcana
  const arcana = c.createGain(); arcana.connect(v.out);
  for (const [pan, rate, surge] of [[-0.5, 1, 0.37], [0.5, 1.17, 0.53]]) {
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.6;
    const g = v.lane(0.45, pan, arcana);
    v.lfo(surge, 0.25, g.gain);
    v.crackle(f, rate); f.connect(g);
  }

  // the heat
  const heatF = c.createBiquadFilter(); heatF.type = 'highpass'; heatF.frequency.value = 6000;
  const heat = c.createGain(); heat.gain.value = 0.02;
  v.loop(heatF); heatF.connect(heat).connect(v.out);

  v.start();
  return () => {
    // the beam is gone at once, so its sound goes with it in a fraction of a second, closing to dark as it goes (a
    // tune down in its colour, not a pitch gliding down for a second and a half after it, as #413's did)
    const n = v.end(1);
    v.out.gain.cancelScheduledValues(n); v.out.gain.setValueAtTime(Math.max(v.out.gain.value, 0.0001), n);
    v.out.gain.setTargetAtTime(0.0001, n, 0.12);
    arcana.gain.setTargetAtTime(0.0001, n, 0.04);
    for (const [f, to] of closing) f.frequency.setTargetAtTime(to, n, 0.1);
    lanceOut();
  };
}

/** The beam going out: a flanged whoosh falling from bright to dark, the last of its arcana sputtering out, and a soft
 *  whump of dark noise as the portal closes. */
function lanceOut(): void {
  const v = voice(0, 0.4);
  const { c, t } = v;
  const f = v.sweep('bandpass', 2400, 220, 0.45, 1.1);
  v.loop(f); f.connect(v.flange(v.hit(0.26, 0.5, v.out, 0.01), 4, 3, 1.4, 0.6));
  const spit = c.createBiquadFilter(); spit.type = 'bandpass'; spit.frequency.value = 2600; spit.Q.value = 0.7;
  v.crackle(spit, 0.8); spit.connect(v.hit(0.5, 0.4, v.out, 0.004));
  const low = v.sweep('lowpass', 600, 90, 0.35, 0.9), sh = drive(2.5);
  v.loop(low); low.connect(sh).connect(v.hit(0.18, 0.4, v.out, 0.006));
  v.start(); v.stopAt(t + 0.8);
}

// The rest of the wizard's spells, built as Void Lance is: noise, driven blows and the hall, no notes (Glacial Nova's
// three bell tones read as "a coin"). Each is what it shows: an orb thrown, crystals falling, ice forming, a fire
// tornado, a body unmade and made again.

/** A gain shaped as a blow starting `delay` s in, into `to`. Silent till then: a gain node is 1 until its first
 *  scheduled value, so a blow scheduled late played its layer at full from the start (Glacial Nova's 22 grains of
 *  ice all at once, Veilstep's forming before he'd gone). */
function blowAt(v: ReturnType<typeof voice>, delay: number, peak: number, decay: number, to: AudioNode = v.out, attack = 0.004): GainNode {
  const g = v.c.createGain(); g.gain.setValueAtTime(0.0001, v.t); env(g, v.t + delay, attack, peak, decay); g.connect(to); return g;
}

/** Splintering Bolt cast: a small seeking orb of arcana thrown fast (24 m/s), a held button casting one every 0.34 s.
 *  A snap as it's let go, a short push of dark noise (no pitch: #413's thump was a sine falling from 260 Hz, a kick
 *  drum three times a second over the music), the zip of it leaving, falling as it goes away, and its fizz of
 *  crackle trailing off into the distance as its trail does. Every cast a little apart (its colour, its pan), so a
 *  held button's stream doesn't sound like one sample on repeat. */
function boltCast(): void {
  const v = voice(0, 0.15);
  const { c, t } = v;
  const k = 0.9 + Math.random() * 0.2, pan = Math.random() * 0.3 - 0.15;
  const lane = v.lane(1, pan);
  // the snap
  const snap = c.createBiquadFilter(); snap.type = 'highpass'; snap.frequency.value = 3000;
  v.loop(snap); snap.connect(v.hit(0.2, 0.05, lane, 0.001));
  // the push
  const push = v.sweep('lowpass', 1400 * k, 280, 0.12, 0.7), sh = drive(2.5);
  v.loop(push); push.connect(sh).connect(v.hit(0.24, 0.22, lane, 0.002));
  // the zip, flanged
  const zip = v.sweep('bandpass', 5200 * k, 1300 * k, 0.2, 2);
  v.loop(zip); zip.connect(v.flange(v.hit(0.4, 0.28, lane, 0.004), 1.5, 1, 7, 0.5));
  // the fizz in flight, its highs closing as it goes
  const fizz = v.sweep('bandpass', 6500 * k, 2600, 0.5, 0.8);
  v.crackle(fizz, k); fizz.connect(blowAt(v, 0.02, 0.8, 0.5, lane, 0.01));
  v.start(); v.stopAt(t + 0.75);
}

/** A Splintering Bolt bursting on a foe (`split`: the bolt itself, shattering into two that seek others; else one of
 *  those two, smaller): a pop of noise closing from bright to dark and its arcana discharging in a spit of crackle;
 *  the bolt's own sparks scattering, and its two splits zipping away to either side. */
function boltBurst(split: boolean): void {
  const v = voice(0, split ? 0.3 : 0.2);
  const { c, t } = v;
  const size = split ? 1 : 0.55, pan = Math.random() * 0.5 - 0.25;
  const lane = v.lane(1, pan);
  // the pop
  const pop = v.sweep('lowpass', 4000, 350, 0.15, 0.8), sh = drive(3);
  v.loop(pop); pop.connect(sh).connect(v.hit(0.12 * size, 0.26, lane, 0.001));
  // the discharge
  const spit = c.createBiquadFilter(); spit.type = 'bandpass'; spit.frequency.value = 3200; spit.Q.value = 0.7;
  v.crackle(spit, 1.3); spit.connect(v.hit(0.5 * size, 0.22, lane, 0.001));
  if (split) {
    // the sparks
    const sparks = c.createBiquadFilter(); sparks.type = 'highpass'; sparks.frequency.value = 5500;
    v.loop(sparks); sparks.connect(v.flange(v.hit(0.045, 0.35, lane, 0.008), 1.2, 0.8, 11, 0.5));
    // the splits leaving
    for (const [side, at] of [[-0.7, 0.03], [0.7, 0.055]]) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(4600, t + at); f.frequency.exponentialRampToValueAtTime(1500, t + at + 0.16);
      v.loop(f); f.connect(blowAt(v, at, 0.08, 0.2, v.lane(1, side), 0.003));
    }
  }
  v.start(); v.stopAt(t + 0.7);
}

/** Starfall called: the crystals falling out of the sky, a whistling flanged rush coming down, a low swell under it. */
function starfallFalling(): void {
  const v = voice(0, 0.35);
  const { t } = v;
  const f = v.sweep('bandpass', 5000, 700, 0.6, 2.5);
  v.loop(f); f.connect(v.flange(v.hit(0.5, 0.55, v.out, 0.25), 3, 2.5, 2.2, 0.6));
  const low = v.sweep('lowpass', 180, 500, 0.6, 1);
  v.loop(low); low.connect(v.hit(0.3, 0.4, v.out, 0.3));
  v.start(); v.stopAt(t + 1.1);
}

/** A crystal striking: a driven blow, a blast closing to dark, and the crystal's spikes bursting from the ground, a
 *  crunch of glassy noise through a flanger (no ringing tone). */
function starfallStrike(): void {
  const v = voice(0, 0.5);
  const { t } = v;
  const sh = drive(3.2); sh.connect(v.hit(0.4, 0.55));
  const o = v.osc('sine', 130, sh); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.45);
  const blast = v.sweep('lowpass', 5500, 300, 0.5, 0.8), bsh = drive(2.5);
  v.loop(blast); blast.connect(bsh).connect(v.hit(0.18, 0.5, v.out, 0.002));
  const spikes = v.sweep('bandpass', 3200, 1800, 0.35, 2.2);
  v.loop(spikes); spikes.connect(v.flange(blowAt(v, 0.02, 0.16, 0.3, v.out, 0.003), 1.2, 0.8, 9, 0.75));
  v.start(); v.stopAt(t + 1);
}

/** Glacial Nova: a burst of cold. A crack as the air freezes, a thump, an icy wind rushing outwards, the ice forming
 *  as a crunch of short grains (filtered noise, never a tone), and a frost hiss left ringing in the hall. */
function novaBurst(): void {
  const v = voice(0, 0.55);
  const { c, t } = v;
  const crack = c.createBiquadFilter(); crack.type = 'highpass'; crack.frequency.value = 3000;
  v.loop(crack); crack.connect(v.hit(0.3, 0.08, v.out, 0.001));
  const sh = drive(3); sh.connect(v.hit(0.45, 0.55));
  const o = v.osc('sine', 110, sh); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
  // the wind, in both ears, opening wide then thinning
  for (const pan of [-0.6, 0.6]) {
    const f = v.sweep('bandpass', 1200, 6500, 0.7, 0.7);
    v.loop(f); f.connect(v.flange(v.hit(0.4, 0.9, v.lane(1, pan), 0.03), 3, 2, pan < 0 ? 1.1 : 1.5, 0.5));
  }
  // the ice forming: grains of crunch spreading out over half a second, thinning
  for (let i = 0; i < 22; i++) {
    const at = 0.04 + Math.pow(Math.random(), 1.6) * 0.55;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 2600; f.Q.value = 1.2;
    v.loop(f); f.connect(blowAt(v, at, 0.45 * (1 - at), 0.04 + Math.random() * 0.05, v.lane(1, Math.random() * 1.6 - 0.8), 0.001));
  }
  // the frost hiss, high and airy
  const hiss = c.createBiquadFilter(); hiss.type = 'highpass'; hiss.frequency.value = 6500;
  v.loop(hiss); hiss.connect(v.flange(v.hit(0.12, 1.4, v.out, 0.1), 2, 1.5, 0.7, 0.6));
  v.start(); v.stopAt(t + 1.6);
}

/** Maelstrom thrown: a fire tornado bursting into being, a driven whump and a flame's blast swirling up. */
function maelstromBurst(): void {
  const v = voice(0, 0.45);
  const { t } = v;
  const sh = drive(3); sh.connect(v.hit(0.34, 0.6));
  const o = v.osc('sine', 95, sh); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  const flame = v.sweep('lowpass', 900, 3800, 0.35, 0.9), fsh = drive(2.5);
  v.loop(flame); flame.connect(fsh).connect(v.hit(0.2, 0.7, v.out, 0.04));
  const swirl = v.sweep('bandpass', 300, 2400, 0.6, 1.4);
  v.loop(swirl); swirl.connect(v.flange(v.hit(0.16, 0.7, v.out, 0.08), 4, 3, 2.5, 0.65));
  v.start(); v.stopAt(t + 1.2);
}

/** Maelstrom spinning for `dur` s: wind howling round, its band swirling and turning across both ears, over a driven
 *  roar of fire and its flicker. Fades out by `dur`; returns a stop() for one cut short. */
function maelstromSpin(dur: number): () => void {
  const v = voice(0.3, 0.25);
  const { c, t } = v;
  const turn = c.createStereoPanner(); turn.connect(v.out);
  v.lfo(0.9, 0.7, turn.pan);
  const howl = c.createBiquadFilter(); howl.type = 'bandpass'; howl.frequency.value = 650; howl.Q.value = 2.2;
  v.loop(howl); howl.connect(v.flange(v.lane(0.3, 0, turn), 4, 3, 0.45, 0.6));
  v.lfo(0.9, 300, howl.frequency);
  const fire = c.createBiquadFilter(); fire.type = 'lowpass'; fire.frequency.value = 500; fire.Q.value = 0.9;
  const fsh = drive(2.5);
  v.loop(fire); fire.connect(fsh).connect(v.lane(0.16, 0));
  const flicker = c.createBiquadFilter(); flicker.type = 'bandpass'; flicker.frequency.value = 2800; flicker.Q.value = 0.8;
  const fl = v.lane(0.03, 0.2); v.lfo(7, 0.022, fl.gain);
  v.loop(flicker); flicker.connect(fl);
  // fading out with the storm, its last second
  const endAt = t + Math.max(0.6, dur);
  v.out.gain.setValueAtTime(1, Math.max(t + 0.3, endAt - 1)); v.out.gain.exponentialRampToValueAtTime(0.0001, endAt);
  v.start(); v.stopAt(endAt + 0.05);
  let done = false;
  return () => { if (!done && c.currentTime < endAt) v.end(0.4); done = true; };
}

/** Veilstep: the wizard unmade and made again `dur` s later, all air and shimmer (no tone: its first pop was a sine
 *  falling from 320 Hz, heard as "a beep"). Gone: a swirl of noise drawn up and in through a fast flanger, closing
 *  with a soft whump of air. Crossing: a fizz of sparkle travelling from one ear to the other. Formed: the swirl let
 *  out again, falling from bright to warm, and a breath of air where he lands. */
function veilstepPass(dur: number): void {
  const v = voice(0, 0.55);
  const { c, t } = v;
  const land = Math.max(0.15, dur);
  // the vanishing: a swirl rising and swelling, cut off as he's gone
  for (const [pan, rate] of [[-0.5, 7], [0.5, 9]]) {
    const f = v.sweep('bandpass', 500, 5500, 0.14, 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(0.02, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    g.connect(v.lane(1, pan)); v.loop(f); f.connect(v.flange(g, 2.5, 2, rate, 0.55));
  }
  // the whump of air closing behind him: dark noise, no pitch
  const whump = v.sweep('lowpass', 900, 160, 0.25, 0.9);
  v.loop(whump); whump.connect(blowAt(v, 0.1, 0.5, 0.4, v.out, 0.01));
  // the crossing: sparkle fizzing over from left to right, flickering
  const fizz = c.createBiquadFilter(); fizz.type = 'highpass'; fizz.frequency.value = 4500;
  const travel = c.createStereoPanner(); travel.connect(v.out);
  travel.pan.setValueAtTime(-0.7, t + 0.1); travel.pan.linearRampToValueAtTime(0.7, t + land + 0.2);
  const fg = c.createGain(); fg.gain.setValueAtTime(0.0001, t); fg.connect(travel);
  fg.gain.setValueAtTime(0.0001, t + 0.08); fg.gain.exponentialRampToValueAtTime(0.12, t + 0.16);
  fg.gain.setValueAtTime(0.12, t + land); fg.gain.exponentialRampToValueAtTime(0.0001, t + land + 0.5);
  const flick = c.createGain(); flick.gain.value = 1; flick.connect(fg);
  v.lfo(17, 0.6, flick.gain);
  v.loop(fizz); fizz.connect(v.flange(flick, 1.5, 1, 3, 0.4));
  // the forming: the swirl let out, bright falling to warm
  for (const [pan, rate] of [[-0.45, 2.2], [0.45, 2.9]]) {
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(6000, t + land); f.frequency.exponentialRampToValueAtTime(700, t + land + 0.5);
    v.loop(f); f.connect(v.flange(blowAt(v, land, 0.4, 0.7, v.lane(1, pan), 0.03), 3, 2.5, rate, 0.6));
  }
  // the breath of air where he lands
  const breath = v.sweep('lowpass', 1200, 250, 0.4, 0.8);
  breath.frequency.cancelScheduledValues(t); breath.frequency.setValueAtTime(1200, t + land); breath.frequency.exponentialRampToValueAtTime(250, t + land + 0.35);
  v.loop(breath); breath.connect(blowAt(v, land, 0.45, 0.45, v.out, 0.01));
  v.start(); v.stopAt(t + land + 1.1);
}

// The warrior's sounds: steel, wood, earth and a man's weight, each skill the thing it shows and told from the others
// by ear (before, every swing was one whoosh, `swing`, and every hit one clang, a triangle note at 1180 Hz; Power
// Strike's charge a saw gliding up two octaves). Noise alone, as the wizard's: air cut by a blade, driven blows whose
// weight is in the mids, grit, and iron as short bands of noise at frequencies drawn anew at every blow (`iron`), so
// metal rings without ever playing the same note twice, or a note at all.

/** how heavy the weapon swung is: a blade in each hand, a one-hander, a great weapon in both */
export type Heft = 0 | 1 | 2;

/** A gain silent until `from` s in, swelling to `peak` at `peakAt` s and dying over `fall` s, into `to`: a swing's
 *  air, loudest as the blade passes. */
function swellAt(v: ReturnType<typeof voice>, from: number, peakAt: number, peak: number, fall: number, to: AudioNode = v.out): GainNode {
  const g = v.c.createGain(); g.gain.setValueAtTime(0.0001, v.t); g.gain.setValueAtTime(0.0001, v.t + from);
  g.gain.exponentialRampToValueAtTime(peak, v.t + Math.max(peakAt, from + 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, v.t + Math.max(peakAt, from + 0.01) + fall);
  g.connect(to); return g;
}

/** A filter whose frequency passes through `points` ([s in, Hz], the first its start). */
function glide(v: ReturnType<typeof voice>, type: BiquadFilterType, q: number, points: [number, number][]): BiquadFilterNode {
  const f = v.c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(points[0][1], v.t);
  for (const [at, hz] of points) {
    if (at <= 0) f.frequency.setValueAtTime(hz, v.t); else f.frequency.exponentialRampToValueAtTime(hz, v.t + at);
  }
  return f;
}

/** Iron struck, `at` s in: `n` narrow bands of noise between `lo` and `hi` Hz, drawn anew each time, so it rings as
 *  metal does and never as the same note (the old `clang` was a triangle falling from 1180 Hz, the same at every hit).
 *  Narrow and long, as steel rings: wide bands dying in a tenth of a second were a knock of wood (from play, "sounds
 *  like wooden swords"). */
function iron(v: ReturnType<typeof voice>, at: number, n: number, lo: number, hi: number, peak: number, decay: number, to: AudioNode = v.out): void {
  for (let i = 0; i < n; i++) {
    const f = v.c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 12;
    f.frequency.value = lo * (hi / lo) ** ((i + Math.random()) / n);
    v.loop(f); f.connect(blowAt(v, at, peak * 1.8 * (0.7 + 0.6 * Math.random()), decay * (0.6 + 0.8 * Math.random()), to, 0.001));
  }
}

/** Grit: `n` grains of noise between `lo` and `hi` Hz scattered over `span` s from `from`, thinning, each in its own
 *  place: stone splitting, earth thrown, splinters. */
function grit(v: ReturnType<typeof voice>, n: number, from: number, span: number, lo: number, hi: number, peak: number): void {
  for (let i = 0; i < n; i++) {
    const k = Math.pow(Math.random(), 1.6);
    const f = v.c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.value = lo * (hi / lo) ** Math.random();
    v.loop(f); f.connect(blowAt(v, from + k * span, peak * (1 - 0.7 * k), 0.04 + Math.random() * 0.07, v.lane(1, Math.random() * 1.4 - 0.7), 0.001));
  }
}

/** A blow's weight, `at` s in: dark noise closing from `from` Hz to `to`, driven, so a laptop hears its mids; and
 *  under it the floor of the noise driven hard, so its harmonics carry the weight at 200 to 700 Hz and it lasts
 *  (a knock alone, starting at 2 kHz and gone in a quarter second, was a wooden sword's). */
function thump(v: ReturnType<typeof voice>, at: number, from: number, to: number, peak: number, decay: number, out: AudioNode = v.out, k = 3.2): void {
  // (closing no lower than 110 Hz, and nothing under 70 kept: the dark of it is heard, the sub under it isn't)
  const f = glide(v, 'lowpass', 0.9, [[0, from], [at, from], [at + decay * 0.5, Math.max(110, to)]]);
  const floor = v.c.createBiquadFilter(); floor.type = 'highpass'; floor.frequency.value = 70; floor.Q.value = 0.6;
  v.loop(f); f.connect(drive(k)).connect(floor).connect(blowAt(v, at, peak, decay, out, 0.003));
  const low = v.c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 150; low.Q.value = 0.7;
  const tame = v.c.createBiquadFilter(); tame.type = 'lowpass'; tame.frequency.value = 1400;
  // (what's under 120 Hz cut after the drive: a laptop can't play it, and it only filled the compressor)
  const cut = v.c.createBiquadFilter(); cut.type = 'highpass'; cut.frequency.value = 120; cut.Q.value = 0.6;
  const push = v.c.createGain(); push.gain.value = 4;
  v.loop(low); low.connect(push).connect(drive(6)).connect(cut).connect(tame).connect(blowAt(v, at, peak * 0.7, decay * 1.4, out, 0.004));
}

/** Armour and what's under it giving, `at` s in: a crunch of mid noise driven hard, and a meaty blow under it. */
function crunch(v: ReturnType<typeof voice>, at: number, peak: number, decay: number, out: AudioNode = v.out): void {
  const f = v.c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 300; f.Q.value = 0.9;
  v.loop(f); f.connect(drive(5)).connect(blowAt(v, at, peak, decay, out, 0.002));
  const meat = v.c.createBiquadFilter(); meat.type = 'bandpass'; meat.frequency.value = 260; meat.Q.value = 1.1;
  v.loop(meat); meat.connect(drive(4)).connect(blowAt(v, at, peak * 1.2, decay * 1.5, out, 0.003));
}

/** A blow of earth or of a body, `at` s in: the noise under 450 Hz, broad (no band in it to ring, as the narrow
 *  320 to 360 Hz punch did: from play, "still sounds like its hitting a tincan"), driven hard so its weight is heard
 *  in the low mids, what's under 90 Hz cut. A whump, not a clang. */
function whump(v: ReturnType<typeof voice>, at: number, peak: number, decay: number, out: AudioNode = v.out): void {
  const low = v.c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 450; low.Q.value = 0.5;
  const push = v.c.createGain(); push.gain.value = 3;
  const cut = v.c.createBiquadFilter(); cut.type = 'highpass'; cut.frequency.value = 90; cut.Q.value = 0.5;
  const top = v.c.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 1600; top.Q.value = 0.5;
  v.loop(low); low.connect(push).connect(drive(5)).connect(cut).connect(top).connect(blowAt(v, at, peak, decay, out, 0.003));
}

/** A smash, `at` s in: its instant, all the noise over 500 Hz driven hard and gone in a tenth of a second, a driven
 *  body of it round 1.4 kHz, and what breaks under it, a burst of stone and grit thinning over `spread` s. The front a
 *  great blow needs: without it, earth and weight alone were a muffled thud (from play, "should be a smash!"). */
function smash(v: ReturnType<typeof voice>, at: number, peak: number, spread: number, out: AudioNode = v.out): void {
  const edge = v.c.createBiquadFilter(); edge.type = 'highpass'; edge.frequency.value = 500; edge.Q.value = 0.5;
  v.loop(edge); edge.connect(drive(6)).connect(blowAt(v, at, peak, 0.14, out, 0.0008));
  const body = v.c.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 1400; body.Q.value = 0.5;
  v.loop(body); body.connect(drive(4)).connect(blowAt(v, at, peak * 0.8, 0.22, out, 0.001));
  grit(v, Math.round(10 + spread * 40), at, spread, 700, 5000, peak * 1.1);
}

/** The ground answering a great blow, `at` s in: dark noise driven, long, its top closing. */
function rumble(v: ReturnType<typeof voice>, at: number, peak: number, decay: number): void {
  const f = glide(v, 'lowpass', 1, [[0, 600], [at, 600], [at + decay, 180]]);
  const floor = v.c.createBiquadFilter(); floor.type = 'highpass'; floor.frequency.value = 90; floor.Q.value = 0.6;
  v.loop(f); f.connect(drive(4)).connect(floor).connect(blowAt(v, at, peak, decay, v.out, 0.01));
}

/** A crack, `at` s in: a few milliseconds of bright noise. */
function crack(v: ReturnType<typeof voice>, at: number, peak: number, out: AudioNode = v.out, hz = 2400): void {
  const f = v.c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hz;
  v.loop(f); f.connect(blowAt(v, at, peak, 0.06, out, 0.001));
}

/** A blade's air through `to`, loudest `lead` s in as it passes: a band of noise rising to `top` Hz and falling
 *  away, lightly flanged (the edge), and the hiss of the edge itself over `edge` Hz. */
function bladeAir(v: ReturnType<typeof voice>, from: number, lead: number, tail: number, low: number, top: number, edge: number, peak: number, to: AudioNode): void {
  const air = glide(v, 'bandpass', 1.3, [[0, low], [from, low], [lead, top], [lead + tail, low * 1.2]]);
  v.loop(air); air.connect(v.flange(swellAt(v, from, lead, peak, tail * 1.6, to), 1.6, 1, 5, 0.4));
  const hiss = v.c.createBiquadFilter(); hiss.type = 'highpass'; hiss.frequency.value = edge;
  v.loop(hiss); hiss.connect(swellAt(v, Math.max(from, lead - 0.06), lead, peak * 0.16, tail, to));
}

/** A pan crossing from `from` to `to` between `start` and `end` s in, into the voice's output. */
function crossing(v: ReturnType<typeof voice>, from: number, to: number, start: number, end: number): StereoPannerNode {
  const p = v.c.createStereoPanner(); p.connect(v.out);
  p.pan.setValueAtTime(from, v.t); p.pan.setValueAtTime(from, v.t + start); p.pan.linearRampToValueAtTime(to, v.t + end);
  return p;
}

/** Rending Cleave's swing, its blade passing `lead` s in (as the blow lands), sweeping `way` (+1 from the right ear
 *  to the left): a one-hander's cut of air; a great weapon's lower and longer, with the weight of it moving under;
 *  a blade of two quick and thin. Each a little apart, as a held button swings again and again. */
function cleaveSwing(lead: number, heft: Heft, way: number): void {
  const v = voice(0, 0.12);
  const k = 0.92 + Math.random() * 0.16;
  const at = Math.max(0.06, lead), from = Math.max(0, at - [0.14, 0.2, 0.3][heft]), tail = [0.13, 0.18, 0.28][heft];
  const across = crossing(v, way * 0.5, -way * 0.5, from, at + tail);
  bladeAir(v, from, at, tail, [900, 600, 300][heft] * k, [3200, 2200, 1200][heft] * k, [6000, 4500, 3000][heft], [0.5, 0.6, 0.65][heft], across);
  // the weapon's weight moving the air: a great weapon's most
  const body = glide(v, 'lowpass', 0.8, [[0, 220], [from, 220], [at, [700, 600, 520][heft]], [at + tail, 200]]);
  v.loop(body); body.connect(drive(3.5)).connect(swellAt(v, from, at, [0.14, 0.24, 0.42][heft], tail * 1.8, across));
  v.start(); v.stopAt(v.t + at + tail * 2 + 0.3);
}

/** Rending Cleave biting: the blow's weight, the blade's steel on armour and bone, a tear. A great weapon's is a
 *  heavier, duller blow; a light blade's a sharp one. */
function cleaveBite(heft: Heft): void {
  const v = voice(0, 0.3);
  const lane = v.lane(1, Math.random() * 0.4 - 0.2);
  crack(v, 0, [0.2, 0.24, 0.28][heft], lane, 2000);
  thump(v, 0, [1300, 1000, 750][heft], 60, [0.36, 0.46, 0.6][heft], [0.32, 0.42, 0.6][heft], lane, 4);
  crunch(v, 0, [0.16, 0.2, 0.26][heft], [0.12, 0.15, 0.2][heft], lane);
  iron(v, 0, 5, [1700, 1200, 650][heft], [6500, 5000, 3000][heft], 0.09, [0.35, 0.45, 0.6][heft], lane);
  v.start(); v.stopAt(v.t + 1.1);
}

/** Twin Fangs: a lunge and two cuts, the right blade `first` s in and the left `apart` s after it. A scuff of the
 *  boot and a push of air as he springs, then two thin, quick slices, each in its own ear and the second higher. */
function fangs(first: number, apart: number): void {
  const v = voice(0, 0.12);
  const scuff = v.c.createBiquadFilter(); scuff.type = 'bandpass'; scuff.frequency.value = 1700; scuff.Q.value = 0.7;
  v.loop(scuff); scuff.connect(v.hit(0.1, 0.09, v.out, 0.004));
  const push = glide(v, 'lowpass', 0.8, [[0, 350], [first * 0.6, 1300], [first + apart, 300]]);
  v.loop(push); push.connect(swellAt(v, 0, first * 0.6, 0.16, 0.35));
  [first, first + apart].forEach((at, i) => {
    const side = i ? -1 : 1, k = i ? 1.15 : 1;
    const across = crossing(v, side * 0.6, -side * 0.15, at - 0.08, at + 0.08);
    bladeAir(v, Math.max(0, at - 0.09), at, 0.1, 1200 * k, 4200 * k, 6500, 0.4, across);
  });
  v.start(); v.stopAt(v.t + first + apart + 0.5);
}

/** A fang biting: a light, sharp blow on its own side. */
function fangBite(i: number): void {
  const v = voice(0, 0.25);
  const lane = v.lane(1, i ? -0.4 : 0.4);
  crack(v, 0, 0.18, lane, 2600);
  thump(v, 0, 1500 * (i ? 1.1 : 1), 70, 0.34, 0.3, lane, 3.5);
  crunch(v, 0, 0.14, 0.11, lane);
  iron(v, 0, 4, 2000, 7000, 0.08, 0.35, lane);
  v.start(); v.stopAt(v.t + 0.9);
}

/** Thunder Crescent's swing: the great weapon brought down into the ground `lead` s in, its air falling as it comes,
 *  and the lightning gathering along the blade, a crackle rising. */
function crescentSwing(lead: number): void {
  const v = voice(0, 0.15);
  const at = Math.max(0.08, lead), from = Math.max(0, at - 0.3);
  const air = glide(v, 'bandpass', 1.2, [[0, 2600], [from, 2600], [at, 480]]);
  v.loop(air); air.connect(v.flange(swellAt(v, from, at, 0.4, 0.1), 2, 1.4, 4, 0.5));
  const body = glide(v, 'lowpass', 0.8, [[0, 250], [at, 650]]);
  v.loop(body); body.connect(drive(2.5)).connect(swellAt(v, from, at, 0.26, 0.12));
  const gather = glide(v, 'bandpass', 0.7, [[0, 2200], [at, 4600]]);
  v.crackle(gather, 1.1); gather.connect(swellAt(v, 0, at, 0.7, 0.08));
  v.start(); v.stopAt(v.t + at + 0.4);
}

/** Thunder Crescent struck: the blade bites the ground (a blow, a crack of stone, grit thrown), a clap of thunder
 *  closing from white to dark, and the crescent tearing away along the ground, its crackle and its rush darkening as
 *  it goes. */
function crescentStrike(): void {
  const v = voice(0, 0.5);
  const { c } = v;
  thump(v, 0, 1100, 50, 0.55, 0.75, v.out, 4.5);
  rumble(v, 0.02, 0.24, 1.1);
  crack(v, 0, 0.26);
  grit(v, 7, 0.01, 0.18, 500, 2200, 0.3);
  // the clap
  const clap = v.sweep('lowpass', 6500, 280, 0.55, 0.9);
  v.loop(clap); clap.connect(drive(3)).connect(v.hit(0.2, 0.6, v.out, 0.002));
  // the crescent leaving: lightning's spit, and its rush along the ground, both closing as it goes away
  const away = v.sweep('lowpass', 9000, 1100, 0.85, 0.7); away.connect(v.out);
  const spit = c.createBiquadFilter(); spit.type = 'bandpass'; spit.frequency.value = 3300; spit.Q.value = 0.6;
  v.crackle(spit, 1.5); spit.connect(v.hit(1, 0.95, away, 0.002));
  const rush = v.sweep('bandpass', 2600, 500, 0.8, 1);
  v.loop(rush); rush.connect(v.flange(v.hit(0.2, 0.9, away, 0.02), 3, 2.5, 2.4, 0.65));
  v.start(); v.stopAt(v.t + 1.6);
}

/** The crescent's lightning leaping onto a foe: a snap, a spit of crackle and a small pop. */
function crescentArc(): void {
  const v = voice(0, 0.25);
  const lane = v.lane(1, Math.random() * 0.8 - 0.4);
  crack(v, 0, 0.16, lane, 3000);
  const spit = v.c.createBiquadFilter(); spit.type = 'bandpass'; spit.frequency.value = 3600; spit.Q.value = 0.7;
  v.crackle(spit, 1.6); spit.connect(v.hit(0.6, 0.24, lane, 0.001));
  thump(v, 0, 2600, 380, 0.11, 0.22, lane, 2.5);
  v.start(); v.stopAt(v.t + 0.6);
}

/** A blow caught on the shield: the thock of its wood, the iron of its boss and rim, and its rattle on the arm. */
function shieldBlock(): void {
  const v = voice(0, 0.3);
  const lane = v.lane(1, Math.random() * 0.4 - 0.2);
  crack(v, 0, 0.2, lane, 2200);
  const wood = v.c.createBiquadFilter(); wood.type = 'bandpass'; wood.frequency.value = 240 + Math.random() * 50; wood.Q.value = 1.1;
  v.loop(wood); wood.connect(drive(4)).connect(v.hit(0.4, 0.3, lane, 0.002));
  thump(v, 0, 1100, 60, 0.4, 0.4, lane, 4);
  iron(v, 0, 6, 600, 3200, 0.14, 0.55, lane);
  iron(v, 0.03, 2, 2400, 5600, 0.05, 0.2, lane);
  v.start(); v.stopAt(v.t + 1.1);
}

/** The guard broken: a blow too big for the shield. A crack, the wood's thock driven hard, splinters, the iron
 *  ringing longer and lower, and the shield scraped aside as he staggers. */
function guardBreak(): void {
  const v = voice(0, 0.4);
  crack(v, 0, 0.3, v.out, 2000);
  const wood = v.c.createBiquadFilter(); wood.type = 'bandpass'; wood.frequency.value = 280; wood.Q.value = 1.1;
  v.loop(wood); wood.connect(drive(4)).connect(v.hit(0.6, 0.45, v.out, 0.002));
  thump(v, 0, 1200, 55, 0.55, 0.65, v.out, 4.5);
  grit(v, 9, 0.01, 0.28, 600, 2800, 0.34);
  iron(v, 0, 5, 450, 2200, 0.22, 0.7);
  const scrape = glide(v, 'bandpass', 1.4, [[0, 1700], [0.15, 1700], [0.6, 520]]);
  v.loop(scrape); scrape.connect(v.flange(swellAt(v, 0.12, 0.24, 0.13, 0.5), 2.5, 2, 3, 0.6));
  v.start(); v.stopAt(v.t + 1.4);
}

/** Steel Tempest held: the blades going round `turns` times a second. Their air, a flanged band of noise circling
 *  the ears and brightening as it passes, the weight of the weapon under it, and the hiss of the edge on the other
 *  side; a great weapon's lower and heavier. Let go, it winds down: the turn slowing, its air closing to dark, and
 *  the blade's last sweep falling away. Returns that stop(). */
function tempestSpin(turns: number, heft: Heft): () => void {
  const v = voice(0.14, 0.15);
  const { c, t } = v;
  const centre = [1200, 900, 560][heft];
  // the turn: one oscillator, which what goes round follows
  const turn = c.createGain(); turn.gain.value = 1;
  const round = v.osc('sine', turns, turn);
  const follow = (depth: number, param: AudioParam): void => { const g = c.createGain(); g.gain.value = depth; turn.connect(g).connect(param); };
  // the blades' air
  const pan = c.createStereoPanner(); pan.connect(v.out); follow(0.65, pan.pan);
  const air = c.createBiquadFilter(); air.type = 'bandpass'; air.Q.value = 1.2;
  air.frequency.setValueAtTime(centre * 0.4, t); air.frequency.setTargetAtTime(centre, t, 0.08);
  follow(centre * 0.35, air.frequency);
  const airG = c.createGain(); airG.gain.value = 0.24; airG.connect(pan);
  v.loop(air); air.connect(v.flange(airG, 4, 2.6, turns * 0.37, 0.55));
  // the weapon's weight
  const body = c.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = [460, 420, 380][heft]; body.Q.value = 0.9;
  const bodyG = c.createGain(); bodyG.gain.value = [0.15, 0.19, 0.27][heft];
  v.loop(body); body.connect(drive(3)).connect(bodyG).connect(v.out);
  v.lfo(0.31, 90, body.frequency);
  // the edge, on the other side of the turn
  const edgePan = c.createStereoPanner(); edgePan.connect(v.out); follow(-0.7, edgePan.pan);
  const edge = c.createBiquadFilter(); edge.type = 'highpass'; edge.frequency.value = [6000, 5000, 3600][heft];
  const edgeG = c.createGain(); edgeG.gain.value = 0.022; edgeG.connect(edgePan);
  v.loop(edge); edge.connect(edgeG);
  v.start();
  return () => {
    const n = v.end(1.1);
    v.out.gain.cancelScheduledValues(n); v.out.gain.setValueAtTime(Math.max(v.out.gain.value, 0.0001), n);
    v.out.gain.setTargetAtTime(0.0001, n, 0.16);
    round.frequency.setTargetAtTime(0.4, n, 0.2);
    air.frequency.cancelScheduledValues(n); air.frequency.setTargetAtTime(260, n, 0.18);
    body.frequency.setTargetAtTime(140, n, 0.18);
    tempestOut(heft);
  };
}

/** The spin's last sweep as it's let go: the blade's air falling from bright to dark, and the feet catching his weight. */
function tempestOut(heft: Heft): void {
  const v = voice(0, 0.25);
  const f = v.sweep('bandpass', [2400, 1900, 1300][heft], 240, 0.45, 1.1);
  v.loop(f); f.connect(v.flange(v.hit(0.2, 0.55, v.out, 0.02), 4, 3, 1.3, 0.55));
  thump(v, 0.16, 700, 150, 0.12, 0.3, v.out, 2.5);
  v.start(); v.stopAt(v.t + 0.9);
}

/** The tempest's blades biting as they go round: a light blow and a chink of steel, each in its own place. */
function tempestBite(heft: Heft): void {
  const v = voice(0, 0.2);
  const lane = v.lane(1, Math.random() * 1.2 - 0.6);
  thump(v, 0, [1600, 1300, 900][heft] * (0.85 + Math.random() * 0.3), 70, [0.22, 0.26, 0.36][heft], 0.26, lane, 3.5);
  crunch(v, 0, [0.08, 0.1, 0.14][heft], 0.1, lane);
  iron(v, 0, 3, [1800, 1300, 700][heft], [6500, 5000, 3000][heft], 0.06, 0.3, lane);
  v.start(); v.stopAt(v.t + 0.8);
}

/** Bull Rush set off: the brace (`brace` s, his boots grinding into the ground), then the run (`run` s), the air
 *  torn past him and his plate clattering, both dying as he stops. Its push-off, footfalls, blows and stop are their
 *  own sounds, played as each happens. */
function bullCharge(brace: number, run: number): void {
  const v = voice(0, 0.2);
  const end = brace + run;
  const grind = v.c.createBiquadFilter(); grind.type = 'bandpass'; grind.frequency.value = 1300; grind.Q.value = 0.8;
  v.loop(grind); grind.connect(swellAt(v, 0, brace * 0.7, 0.14, 0.18));
  for (const [pan, rate] of [[-0.6, 2.1], [0.6, 2.7]]) {
    const wind = glide(v, 'bandpass', 0.9, [[0, 450], [brace, 450], [brace + run * 0.5, 1700], [end + 0.2, 500]]);
    const g = swellAt(v, brace, brace + run * 0.55, 0.24, 0.45, v.lane(1, pan));
    v.loop(wind); wind.connect(v.flange(g, 3, 2.2, rate, 0.55));
  }
  // his gear jostling as he runs: low and dull (a plate rattle at 2.3 kHz was a tin can)
  const gear = v.c.createBiquadFilter(); gear.type = 'bandpass'; gear.frequency.value = 900; gear.Q.value = 0.6;
  v.crackle(gear, 0.4); gear.connect(swellAt(v, brace, brace + run * 0.5, 0.22, 0.35));
  v.start(); v.stopAt(v.t + end + 0.7);
}

/** The charge's push-off: the ground cracking under the rear foot, stone thrown back. */
function bullLaunch(): void {
  const v = voice(0, 0.35);
  smash(v, 0, 0.24, 0.15);
  whump(v, 0, 0.45, 0.45);
  thump(v, 0, 900, 110, 0.4, 0.5, v.out, 4.5);
  v.start(); v.stopAt(v.t + 0.8);
}

/** A footfall at full tilt, on its `side` (+1 the right): the boot's thump, grit under it and a clink of plate. */
function bullStep(side: number): void {
  const v = voice(0, 0.25);
  const lane = v.lane(1, side * 0.35);
  whump(v, 0, 0.36, 0.26, lane);
  thump(v, 0, 700 * (0.9 + Math.random() * 0.2), 110, 0.3, 0.28, lane, 4);
  const dirt = v.c.createBiquadFilter(); dirt.type = 'bandpass'; dirt.frequency.value = 1100; dirt.Q.value = 0.7;
  v.loop(dirt); dirt.connect(v.hit(0.07, 0.1, lane, 0.002));
  v.start(); v.stopAt(v.t + 0.6);
}

/** The charge meeting a body: a shoulder's weight driven into it, the breath knocked out, plate crunching. */
function bullHit(): void {
  const v = voice(0, 0.35);
  const lane = v.lane(1, Math.random() * 0.4 - 0.2);
  smash(v, 0, 0.3, 0.12, lane);
  whump(v, 0, 0.55, 0.4, lane);
  thump(v, 0, 800, 110, 0.45, 0.45, lane, 4.5);
  // the breath knocked out of it, and its body giving
  const breath = v.sweep('bandpass', 900, 380, 0.2, 0.8);
  v.loop(breath); breath.connect(drive(3)).connect(v.hit(0.2, 0.22, lane, 0.004));
  v.start(); v.stopAt(v.t + 1);
}

/** The charge's stop, a ground-shaking halt: a boom with its weight in the mids, a blast of dust, his boots
 *  skidding and the stones it threw coming down. */
function bullLand(): void {
  const v = voice(0, 0.55);
  smash(v, 0, 0.38, 0.28);
  whump(v, 0, 0.55, 0.75);
  thump(v, 0, 1000, 110, 0.5, 1, v.out, 5);
  rumble(v, 0.02, 0.3, 1.3);
  const dust = v.sweep('lowpass', 6000, 260, 0.5, 0.7);
  v.loop(dust); dust.connect(drive(3)).connect(v.hit(0.17, 0.6, v.out, 0.003));
  const skid = v.sweep('bandpass', 1600, 380, 0.36, 0.9);
  v.loop(skid); skid.connect(v.flange(v.hit(0.12, 0.4, v.out, 0.01), 2.5, 2, 3.2, 0.4));
  grit(v, 10, 0.15, 0.5, 250, 1400, 0.24);
  v.start(); v.stopAt(v.t + 1.7);
}

/** Power Strike gathered over `dur` s: strength drawn into the weapon. Air drawn in from both sides towards the
 *  middle, opening and swelling, a strain of dark noise under it, the grip creaking; in its last instants the weapon
 *  comes down, its air falling. No pitch climbs (the old `charge` was a saw gliding from 70 to 260 Hz). Returns a
 *  stop() for a cast cut short, which lets it sink away. */
function strikeGather(dur: number): () => void {
  const v = voice(0.05, 0.25);
  const { c, t } = v;
  const closing: BiquadFilterNode[] = [];
  const swell = (from: number, peak: number, to: AudioNode): GainNode => {
    const g = c.createGain(); g.gain.setValueAtTime(from, t); g.gain.exponentialRampToValueAtTime(peak, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1); g.connect(to); return g;
  };
  // drawn in: from each side to the middle
  for (const [side, rate] of [[-0.8, 0.9], [0.8, 1.3]]) {
    const f = v.sweep('bandpass', 500, 2400, dur, 1.5);
    v.loop(f); f.connect(v.flange(swell(0.004, 0.17, crossing(v, side, 0, 0, dur)), 4, 3, rate, 0.6));
    closing.push(f);
  }
  // the strain
  const strain = v.sweep('lowpass', 180, 800, dur, 1);
  v.loop(strain); strain.connect(drive(3)).connect(swell(0.006, 0.2, v.out));
  closing.push(strain);
  // the grip
  const creak = c.createBiquadFilter(); creak.type = 'bandpass'; creak.frequency.value = 700; creak.Q.value = 2.4;
  v.crackle(creak, 0.3); creak.connect(swell(0.2, 0.55, v.out));
  // the weapon coming down
  const fall = glide(v, 'bandpass', 1.2, [[0, 3000], [dur - 0.16, 3000], [dur, 520]]);
  v.loop(fall); fall.connect(v.flange(swellAt(v, Math.max(0, dur - 0.18), dur, 0.42, 0.1), 2, 1.4, 4, 0.5));
  v.start(); v.stopAt(t + dur + 0.3);
  return () => {
    if (c.currentTime >= t + dur) return;
    const n = v.end(0.35);
    for (const f of closing) { const now = f.frequency.value; f.frequency.cancelScheduledValues(n); f.frequency.setValueAtTime(now, n); f.frequency.setTargetAtTime(200, n, 0.09); }
  };
}

/** Power Strike landed, his heaviest blow (`size`: 1, or less stopped short on a wall): a smash, the floor
 *  breaking under it, a broad whump driven hard over a boom, a blast of dust closing to dark, the floor splitting and
 *  its rubble settling, the ground rumbling after. Earth and stone alone: its steel ringing on the stone and a narrow
 *  punch at 360 Hz were "a tincan". */
function strikeLand(size: number): void {
  const v = voice(0, 0.65);
  const s = 0.55 + 0.45 * size;
  smash(v, 0, 0.45 * s, 0.3 * s);
  whump(v, 0, 0.5 * s, 0.85);
  thump(v, 0, 1000, 110, 0.5 * s, 1.1, v.out, 5);
  rumble(v, 0.02, 0.34 * s, 1.5);
  const blast = v.sweep('lowpass', 7000, 260, 0.6, 0.7);
  v.loop(blast); blast.connect(drive(3)).connect(v.hit(0.2 * s, 0.6, v.out, 0.002));
  // the stone thrown up coming down, and the floor settling
  grit(v, Math.round(6 + 8 * size), 0.2, 0.6, 400, 2500, 0.26 * s);
  const rubble = v.c.createBiquadFilter(); rubble.type = 'lowpass'; rubble.frequency.value = 1200;
  v.crackle(rubble, 0.4); rubble.connect(blowAt(v, 0.15, 0.55 * s, 1, v.out, 0.05));
  v.start(); v.stopAt(v.t + 1.9);
}

/** Iron Bellow: a war cry and the blast it throws out. The cry is noise, not a note: roughened as a throat does
 *  (its level shaken some 70 times a second, unsteadily), through a mouth opening and closing (three bands, the
 *  lowest rising and falling), driven; under it his chest, round it the air thrown outwards in both ears, and the
 *  shields rising: iron stirring, and a hiss of light. */
function bellow(): void {
  const v = voice(0, 0.55);
  const { c, t } = v;
  // the throat
  const rough = c.createGain(); rough.gain.value = 0.55;
  const shake = c.createGain(); shake.gain.value = 0.45; shake.connect(rough.gain);
  const cords = v.osc('sawtooth', 76, shake);
  cords.frequency.setValueAtTime(76, t); cords.frequency.linearRampToValueAtTime(92, t + 0.15); cords.frequency.linearRampToValueAtTime(58, t + 0.85);
  v.lfo(13, 7, cords.frequency);
  v.loop(rough);
  // the mouth
  const cry = drive(3); cry.connect(v.hit(0.5, 1.05, v.out, 0.05));
  for (const [q, level, points] of [
    [3, 1, [[0, 380], [0.14, 780], [0.85, 480]]],
    [4, 0.6, [[0, 1050], [0.14, 1350], [0.85, 1100]]],
    [5, 0.3, [[0, 2500], [0.14, 2900], [0.85, 2500]]],
  ] as [number, number, [number, number][]][]) {
    const f = glide(v, 'bandpass', q, points), g = c.createGain(); g.gain.value = level * 4;
    rough.connect(f).connect(g).connect(cry);
  }
  // the chest
  const chest = c.createBiquadFilter(); chest.type = 'lowpass'; chest.frequency.value = 320;
  rough.connect(chest).connect(drive(3)).connect(v.hit(0.5, 0.9, v.out, 0.05));
  // the air thrown out
  for (const [pan, rate] of [[-0.6, 1.6], [0.6, 2.2]]) {
    const f = v.sweep('bandpass', 420, 2600, 0.4, 0.8);
    v.loop(f); f.connect(v.flange(v.hit(0.32, 0.75, v.lane(1, pan), 0.03), 3, 2.4, rate, 0.55));
  }
  thump(v, 0, 1200, 110, 0.3, 0.5);
  // the shields rising
  [0.12, 0.2, 0.28].forEach((at, i) => iron(v, at, 2, 900, 2800, 0.05, 0.22, v.lane(1, (i - 1) * 0.6)));
  const light = c.createBiquadFilter(); light.type = 'highpass'; light.frequency.value = 5200;
  v.loop(light); light.connect(v.flange(blowAt(v, 0.1, 0.05, 1.1, v.out, 0.2), 2, 1.5, 0.8, 0.6));
  v.start(); v.stopAt(t + 1.6);
}

/** A blow taken on the Bellow's spectral shields: duller than the shield's own, its iron far off, a shimmer shaken
 *  out of it. */
function wardHit(): void {
  const v = voice(0, 0.4);
  thump(v, 0, 900, 200, 0.3, 0.26, v.out, 2.5);
  iron(v, 0, 3, 900, 2800, 0.09, 0.2);
  const shimmer = v.sweep('bandpass', 3400, 1500, 0.3, 1.2);
  v.loop(shimmer); shimmer.connect(v.flange(v.hit(0.14, 0.34, v.out, 0.005), 1.5, 1, 9, 0.7));
  v.start(); v.stopAt(v.t + 0.7);
}

/** A prop chipped by a blow, by what it's made of: timber's thock and splinters, stone's crack and grit (the shared
 *  `clang` was a triangle note at 1180 Hz on every one, heard over every swing that reached a prop). */
function chip(kind: string | undefined): void {
  const v = voice(0, 0.25);
  const lane = v.lane(1, Math.random() * 0.6 - 0.3);
  if (kind === 'wood' || kind === 'shroom') {
    const wood = v.c.createBiquadFilter(); wood.type = 'bandpass'; wood.frequency.value = 300 + Math.random() * 80; wood.Q.value = 1.2;
    v.loop(wood); wood.connect(drive(4)).connect(v.hit(0.38, 0.22, lane, 0.002));
    thump(v, 0, 900, 70, 0.3, 0.3, lane, 3.5);
    grit(v, 5, 0.005, 0.12, 900, 3200, 0.2);
  } else {
    crack(v, 0, 0.22, lane, 1800);
    thump(v, 0, 1000, 60, 0.34, 0.35, lane, 4);
    grit(v, 7, 0.005, 0.2, 600, 2800, 0.26);
  }
  v.start(); v.stopAt(v.t + 0.8);
}

/** Healing Draught drunk: the cork's soft pop, three glugs of the draught, each falling as it's swallowed with a
 *  small swallow under it, then its warmth spreading through him, a dark rush rising and settling. Liquid and breath
 *  alone, nothing high (from the owner's review of #527, "needs work": its gulps rose 380 to 820 Hz each, a wah like a
 *  note, and a 4 kHz fizz hissed over the warmth). */
function draught(): void {
  const v = voice(0, 0.25);
  // the cork: a short hollow pop and a puff under it
  const cork = v.c.createBiquadFilter(); cork.type = 'bandpass'; cork.frequency.value = 520 + Math.random() * 60; cork.Q.value = 3;
  v.loop(cork); cork.connect(blowAt(v, 0, 0.9, 0.05, v.out, 0.001));
  whump(v, 0, 0.3, 0.08);
  // three glugs: liquid's hollow band falling as each goes down, and the throat's small swallow after it
  [0.2, 0.42, 0.66].forEach((at, i) => {
    const top = 560 - i * 40 + Math.random() * 40;
    const glug = glide(v, 'bandpass', 4, [[0, top], [at, top], [at + 0.11, top * 0.55]]);
    v.loop(glug); glug.connect(blowAt(v, at, 0.9, 0.12, v.out, 0.008));
    whump(v, at + 0.07, 0.25, 0.09);
  });
  // the warmth: a dark rush, opening only to 900 Hz, rising and settling
  const warm = glide(v, 'lowpass', 0.7, [[0, 260], [0.9, 260], [1.4, 900], [2.0, 500]]);
  v.loop(warm); warm.connect(swellAt(v, 0.9, 1.35, 0.36, 0.7));
  v.start(); v.stopAt(v.t + 2.2);
}

/** The loading screen's exit (`ui/logoWind.ts`): a gust from the right blows the logo's letters away to the left as
 *  dust and snow (its front crossing them in 1.1 s), and the swirl gathers into the lobby's logo, top left (from 1.45
 *  s, landed by about 2.95). Timed to it, and soft, as the first sound a visit hears (from the owner's review of
 *  #422, the first take was "lame", "hammering on the brain": a 3.2 kHz rush and a 4.5 kHz swirl, snow flickering 11
 *  times a second, the swirl cut off in 0.15 s): a breath of wind rising slowly (0.7 s) and passing from the right
 *  ear to the left, its body dark and its air opening no higher than 1.3 kHz, gently flanged; then the swirl drawn
 *  in towards the logo, rising only to 1.5 kHz and easing away as it lands, a low sigh under it. Wind alone, no
 *  notes, no pulses, as the lobby's music may be starting under it. */
function logoGust(): void {
  const v = voice(0, 0.35);
  const { c, t } = v;
  // the gust's way across: right ear to left, not hard to either side
  const across = c.createStereoPanner(); across.connect(v.out);
  across.pan.setValueAtTime(0.55, t); across.pan.linearRampToValueAtTime(-0.6, t + 1.5);
  const swell = (peak: number, at: number, hold: number, fall: number, to: AudioNode): GainNode => {
    const g = c.createGain(); g.connect(to);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + at);
    g.gain.setValueAtTime(peak, t + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + fall);
    return g;
  };
  // the wind's body: dark noise, opening a little as the gust comes, closing as it passes
  const body = v.sweep('lowpass', 220, 850, 0.8, 0.5);
  body.frequency.exponentialRampToValueAtTime(260, t + 2.3);
  v.loop(body); body.connect(swell(0.24, 0.7, 1.05, 2.5, across));
  // its breath of air, slowly flanged (no fast sweep of the comb, little feedback: a hush, not a jet)
  const air = v.sweep('bandpass', 450, 1300, 0.8, 0.6);
  air.frequency.exponentialRampToValueAtTime(550, t + 2.1);
  v.loop(air); air.connect(v.flange(swell(0.1, 0.75, 1, 2.3, across), 5, 1.5, 0.35, 0.25));
  // the swirl drawn into the lobby's logo, up on the left: rising a little, easing away as it lands
  const gather = c.createStereoPanner(); gather.pan.value = -0.45; gather.connect(v.out);
  const draw = c.createBiquadFilter(); draw.type = 'bandpass'; draw.Q.value = 0.6;
  draw.frequency.setValueAtTime(450, t + 1.3); draw.frequency.exponentialRampToValueAtTime(1500, t + 2.7);
  const dg = c.createGain(); dg.connect(gather);
  dg.gain.setValueAtTime(0.0001, t); dg.gain.setValueAtTime(0.002, t + 1.3);
  dg.gain.exponentialRampToValueAtTime(0.07, t + 2.5); dg.gain.setTargetAtTime(0.0001, t + 2.6, 0.18);
  v.loop(draw); draw.connect(dg);
  // the landing: a low sigh of air as the logo forms
  const land = c.createBiquadFilter(); land.type = 'lowpass'; land.Q.value = 0.5;
  land.frequency.setValueAtTime(700, t + 2.7); land.frequency.exponentialRampToValueAtTime(180, t + 3.4);
  v.loop(land); land.connect(blowAt(v, 2.7, 0.07, 0.7, gather, 0.25));
  v.start(); v.stopAt(t + 3.9);
}

/** how late the exit's gust may still start (s): a context that comes to run this soon after the exit began still
 *  plays it, nearly in time with the letters */
const GUST_LATE = 0.4;

/** `play` now where the context runs (a lab's offline render always); where it's still suspended, asked to resume
 *  (a browser that allows autoplay here, a site visited often or the installed app, lets it without a gesture), and
 *  played if it runs within `late` s, else not at all: a sound asked for in a suspended context is heard only at the
 *  page's first click or key, out of place. */
function whenRunning(play: () => void, late: number): void {
  const c = ctx!;
  if (c !== live || c.state === 'running') { play(); return; }
  const asked = performance.now();
  const onState = (): void => {
    if (c.state !== 'running') return;
    c.removeEventListener('statechange', onState);
    if (performance.now() - asked <= late * 1000) play();
  };
  c.addEventListener('statechange', onState);
  setTimeout(() => c.removeEventListener('statechange', onState), late * 1000 + 50);
  void live.resume().catch(() => undefined);
}

/** Wrap a sound so it silently does nothing until audio is unlocked. */
const guard = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R | undefined => (ctx ? fn(...a) : undefined);
export const sfx = {
  bow: guard(() => { if (throttle('bow', 60)) return; noise({ dur: 0.12, freq: 2800, sweep: 1200, q: 2, gain: 0.1 }); tone({ freq: 180, to: 80, dur: 0.16, type: 'triangle', gain: 0.08 }); }),
  /** a bow drawn to full: a glint on the arrowhead */
  bowReady: guard(() => { tone({ freq: 1560, dur: 0.35, gain: 0.04, type: 'sine' }); tone({ freq: 2340, dur: 0.25, gain: 0.02, type: 'sine', delay: 0.03 }); }),
  /** an arrow driven through foes: a heavier string and a tearing hiss */
  pierce: guard(() => { noise({ dur: 0.22, freq: 2000, sweep: 600, q: 1.6, gain: 0.16 }); tone({ freq: 140, to: 60, dur: 0.2, type: 'triangle', gain: 0.1 }); }),
  /** an arrow bursting into a shower over the area */
  split: guard(() => { noise({ dur: 0.3, freq: 1800, sweep: 4200, q: 1.2, gain: 0.1 }); noise({ dur: 0.5, freq: 3200, sweep: 900, q: 0.8, gain: 0.05, attack: 0.08 }); }),
  /** an arrow into the ground, a blow on wood and straw */
  thud: guard(() => { if (throttle('thud', 70)) return; noise({ dur: 0.08, freq: 500, type: 'lowpass', gain: 0.22 }); noise({ dur: 0.05, freq: 2600, q: 2, gain: 0.04 }); }),
  /** an arrow glancing off stone: a short clink and a scrape */
  ricochet: guard(() => { if (throttle('ricochet', 70)) return; tone({ freq: 2100 + Math.random() * 900, to: 1500, dur: 0.07, type: 'triangle', gain: 0.05 }); noise({ dur: 0.06, freq: 4200, q: 3, gain: 0.07 }); }),
  /** a foe marked as quarry */
  mark: guard(() => { tone({ freq: 660, to: 990, dur: 0.25, gain: 0.05, type: 'triangle' }); noise({ dur: 0.2, freq: 3500, q: 4, gain: 0.05 }); }),
  /** a marked foe's kill: the cooldowns come back */
  refresh: guard(() => { [784, 988, 1175].forEach((f, i) => tone({ freq: f, dur: 0.4, gain: 0.045, type: 'triangle', delay: i * 0.05 })); }),
  /** a straw figure rising out of the ground */
  straw: guard(() => { noise({ dur: 0.45, freq: 1200, sweep: 500, q: 1.2, gain: 0.16 }); tone({ freq: 110, to: 70, dur: 0.18, type: 'triangle', gain: 0.12 }); }),
  /** Splintering Bolt cast, at every cast (a held button casts again and again) */
  bolt: guard(() => { if (throttle('bolt', 60)) return; boltCast(); }),
  /** a Splintering Bolt bursting on a foe: the bolt itself, splitting (`split`), or one of its splits */
  boltBurst: guard((split: boolean) => { if (throttle(split ? 'boltBurst' : 'boltSplit', 40)) return; boltBurst(split); }),
  boltHit: guard(() => { if (throttle('boltHit', 45)) return; noise({ dur: 0.12, freq: 3000, q: 1.5, gain: 0.12 }); }),
  starfallCall: guard(() => { starfallFalling(); }),
  starfallImpact: guard(() => { if (throttle('sfi', 50)) return; starfallStrike(); }),
  /** Void Lance's portal drawn over `dur` s (returns its stop()) */
  lanceCharge: guard((dur: number) => lanceInhale(dur)),
  /** Void Lance bursting out of its portal, then held (returns its stop()) */
  lance: guard(() => { lanceBurst(); return lanceDrone(); }),
  nova: guard(() => { novaBurst(); }),
  /** Maelstrom thrown, then spinning for `dur` s (returns its stop(), for a storm cut short) */
  maelstrom: guard((dur: number) => { maelstromBurst(); return maelstromSpin(dur); }),
  zap: guard(() => { if (throttle('zap', 70)) return; noise({ dur: 0.1, freq: 6000, type: 'highpass', gain: 0.12 }); tone({ freq: 180, to: 60, dur: 0.1, type: 'square', gain: 0.05 }); }),
  /** coming apart into light and crossing: a rush of air rising, and a shimmer rising with it */
  blink: guard(() => { noise({ dur: 0.32, freq: 900, sweep: 4200, q: 1.4, gain: 0.14 }); tone({ freq: 520, to: 1560, dur: 0.22, gain: 0.06 }); tone({ freq: 784, to: 2350, dur: 0.18, type: 'triangle', gain: 0.04, delay: 0.03 }); }),
  /** the loading screen's logo blown away and gathered into the lobby's, by itself as the exit starts: wherever the
   *  browser lets sound play by then (`whenRunning`) */
  logoGust: guard(() => { whenRunning(logoGust, GUST_LATE); }),
  /** Veilstep: gone, and formed again where he lands `dur` s later (the dodge keeps `blink`) */
  veilstep: guard((dur: number) => { veilstepPass(dur); }),
  potion: guard(() => { noise({ dur: 0.35, freq: 800, sweep: 2500, q: 5, gain: 0.15 }); tone({ freq: 440, to: 880, dur: 0.4, gain: 0.08 }); }),
  hurt: guard(() => { if (throttle('hurt', 120)) return; noise({ dur: 0.18, freq: 500, type: 'lowpass', gain: 0.35 }); tone({ freq: 160, to: 90, dur: 0.15, type: 'square', gain: 0.05 }); }),
  enemyDie: guard(() => { if (throttle('die', 40)) return; noise({ dur: 0.35, freq: 700, sweep: 200, q: 1, gain: 0.18 }); }),
  /** a body landing, `k` how hard (0 to 1) */
  bodyFall: guard((k: number) => { if (throttle('fall', 60)) return; noise({ dur: 0.14 + k * 0.1, freq: 260, type: 'lowpass', gain: 0.12 + k * 0.22 }); tone({ freq: 75, to: 40, dur: 0.12, gain: 0.05 + k * 0.1 }); }),
  /** a body frozen stiff breaking into shards */
  shatter: guard(() => { if (throttle('shatter', 50)) return; noise({ dur: 0.35, freq: 5200, sweep: 2400, q: 1.2, gain: 0.16 }); [2350, 3140, 3720].forEach((f, i) => tone({ freq: f, dur: 0.25, gain: 0.025, type: 'triangle', delay: i * 0.03 })); }),
  slam: guard(() => { noise({ dur: 0.8, freq: 120, type: 'lowpass', gain: 0.7 }); tone({ freq: 60, to: 28, dur: 0.6, gain: 0.5 }); }),
  /** a prop breaking: rock and timber giving way */
  crumble: guard(() => { noise({ dur: 0.55, freq: 700, sweep: 140, type: 'lowpass', q: 1.2, gain: 0.5 }); noise({ dur: 0.2, freq: 2400, q: 2, gain: 0.12 }); tone({ freq: 90, to: 40, dur: 0.4, gain: 0.3 }); }),
  witchCast: guard(() => { if (throttle('wc', 90)) return; tone({ freq: 300, to: 700, dur: 0.3, type: 'sawtooth', gain: 0.03 }); }),
  loot: guard((r: number) => { const base = [520, 620, 740, 880, 1040, 1170][r] || 520; tone({ freq: base, dur: 0.35, gain: 0.08 }); if (r >= 3) tone({ freq: base * 1.5, dur: 0.6, gain: 0.07, delay: 0.08 }); if (r >= 4) tone({ freq: base * 2, dur: 0.9, gain: 0.06, delay: 0.16 }); if (r >= 5) tone({ freq: base / 2, dur: 1.4, type: 'triangle', gain: 0.07, delay: 0.24, attack: 0.15 }); }),
  pickup: guard(() => { if (throttle('pickup', 60)) return; tone({ freq: 1200, to: 1600, dur: 0.08, gain: 0.05 }); }),
  waveStart: guard(() => { tone({ freq: 110, dur: 1.4, type: 'sawtooth', gain: 0.08, attack: 0.2 }); tone({ freq: 165, dur: 1.4, type: 'sawtooth', gain: 0.05, attack: 0.25 }); noise({ dur: 1.0, freq: 200, type: 'lowpass', gain: 0.3, attack: 0.1 }); }),
  waveClear: guard(() => { [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, dur: 1.0, gain: 0.07, type: 'triangle', delay: i * 0.1 })); }),
  death: guard(() => { tone({ freq: 220, to: 55, dur: 2.0, type: 'sawtooth', gain: 0.1 }); noise({ dur: 1.5, freq: 300, type: 'lowpass', gain: 0.3 }); }),
  salvage: guard(() => { noise({ dur: 0.25, freq: 900, sweep: 200, q: 2, gain: 0.25 }); tone({ freq: 300, to: 120, dur: 0.2, type: 'square', gain: 0.04 }); }),
  swing: guard(() => { if (throttle('swing', 70)) return; noise({ dur: 0.2, freq: 900, sweep: 2600, q: 1.4, gain: 0.2, attack: 0.03 }); }),
  clang: guard(() => { if (throttle('clang', 60)) return; noise({ dur: 0.15, freq: 3200, q: 3, gain: 0.14 }); tone({ freq: 1180, to: 900, dur: 0.18, type: 'triangle', gain: 0.04 }); tone({ freq: 220, to: 110, dur: 0.12, type: 'square', gain: 0.04 }); }),
  /** Rending Cleave swung, the blade passing `lead` s on, sweeping `way` (+1 right to left) */
  cleave: guard((lead: number, heft: Heft, way: number) => { if (throttle('cleave', 70)) return; cleaveSwing(lead, heft, way); }),
  cleaveBite: guard((heft: Heft) => { if (throttle('cleaveBite', 60)) return; cleaveBite(heft); }),
  /** Twin Fangs cast: its lunge and its two cuts, `first` s on and `apart` s after */
  fangs: guard((first: number, apart: number) => { fangs(first, apart); }),
  /** a fang biting: the right blade's (0) or the left's (1) */
  fangBite: guard((i: number) => { fangBite(i); }),
  /** Thunder Crescent: the weapon brought down over `lead` s, its strike into the ground, its lightning on a foe */
  crescentSwing: guard((lead: number) => { crescentSwing(lead); }),
  crescent: guard(() => { crescentStrike(); }),
  crescentArc: guard(() => { if (throttle('crescentArc', 60)) return; crescentArc(); }),
  /** a blow caught on the shield; one too big for it */
  shieldBlock: guard(() => { if (throttle('shieldBlock', 60)) return; shieldBlock(); }),
  guardBreak: guard(() => { guardBreak(); }),
  /** Steel Tempest held, the blades going round `turns` times a second (returns its stop(), which winds it down) */
  tempest: guard((turns: number, heft: Heft) => tempestSpin(turns, heft)),
  tempestBite: guard((heft: Heft) => { if (throttle('tempestBite', 170)) return; tempestBite(heft); }),
  /** Bull Rush: set off (its brace and run, s), its push-off, a footfall (`side`: +1 the right), a body met, its stop */
  bullRush: guard((brace: number, run: number) => { bullCharge(brace, run); }),
  bullLaunch: guard(() => { bullLaunch(); }),
  bullStep: guard((side: number) => { bullStep(side); }),
  bullHit: guard(() => { if (throttle('bullHit', 60)) return; bullHit(); }),
  bullLand: guard(() => { bullLand(); }),
  /** Power Strike gathered over `dur` s (returns its stop(), for a cast cut short), and landed (`size`: 1, less stopped short) */
  strikeCharge: guard((dur: number) => strikeGather(dur)),
  strike: guard((size: number) => { strikeLand(size); }),
  /** Iron Bellow's cry, and a blow taken on its shields */
  bellow: guard(() => { bellow(); }),
  wardHit: guard(() => { if (throttle('wardHit', 60)) return; wardHit(); }),
  /** a prop chipped by a blow: timber (`wood`, `shroom`) or stone */
  chip: guard((kind?: string) => { if (throttle('chip', 60)) return; chip(kind); }),
  /** Healing Draught drunk */
  draught: guard(() => { draught(); }),
  rush: guard(() => { noise({ dur: 0.45, freq: 220, sweep: 600, type: 'lowpass', gain: 0.45, attack: 0.04 }); tone({ freq: 70, to: 45, dur: 0.4, gain: 0.3 }); }),
  click: guard(() => tone({ freq: 700, dur: 0.05, gain: 0.04, type: 'triangle' })),
  /** a co-op ping (game/ping.ts): two bright notes, rising */
  ping: guard(() => { if (throttle('ping', 150)) return; tone({ freq: 1320, dur: 0.18, gain: 0.05 }); tone({ freq: 1760, dur: 0.28, gain: 0.045, delay: 0.09 }); }),
  /** a partner's chat message (ui/chat.ts): a soft rising pair */
  chat: guard(() => { if (throttle('chat', 250)) return; tone({ freq: 880, dur: 0.09, gain: 0.03, type: 'triangle' }); tone({ freq: 1175, dur: 0.12, gain: 0.025, type: 'triangle', delay: 0.07 }); }),
  spawn: guard(() => { if (throttle('spawn', 150)) return; noise({ dur: 0.6, freq: 250, sweep: 1500, q: 6, gain: 0.12, attack: 0.1 }); }),
};
