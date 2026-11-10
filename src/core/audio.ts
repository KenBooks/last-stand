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
  rush: guard(() => { noise({ dur: 0.45, freq: 220, sweep: 600, type: 'lowpass', gain: 0.45, attack: 0.04 }); tone({ freq: 70, to: 45, dur: 0.4, gain: 0.3 }); }),
  /** a rising hum over a skill's charge-up of `dur` seconds */
  charge: guard((dur: number) => { tone({ freq: 70, to: 260, dur, type: 'sawtooth', gain: 0.05, attack: 0.3 }); noise({ dur, freq: 300, sweep: 2400, q: 3, gain: 0.08, attack: 0.4 }); }),
  roar: guard(() => { tone({ freq: 95, to: 70, dur: 0.9, type: 'sawtooth', gain: 0.1, attack: 0.05 }); tone({ freq: 142, to: 104, dur: 0.9, type: 'sawtooth', gain: 0.06, attack: 0.06 }); noise({ dur: 0.8, freq: 600, q: 0.8, gain: 0.25, attack: 0.06 }); }),
  click: guard(() => tone({ freq: 700, dur: 0.05, gain: 0.04, type: 'triangle' })),
  /** a co-op ping (game/ping.ts): two bright notes, rising */
  ping: guard(() => { if (throttle('ping', 150)) return; tone({ freq: 1320, dur: 0.18, gain: 0.05 }); tone({ freq: 1760, dur: 0.28, gain: 0.045, delay: 0.09 }); }),
  spawn: guard(() => { if (throttle('spawn', 150)) return; noise({ dur: 0.6, freq: 250, sweep: 1500, q: 6, gain: 0.12, attack: 0.1 }); }),
};
