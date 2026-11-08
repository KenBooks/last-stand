// Procedural sound effects with WebAudio (no audio files; the music is `music.ts`).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const last: Record<string, number> = {};

/** Called at boot (the context starts suspended: opening the audio device is slow, so it happens
 *  behind the loading screen) and on every user gesture (which lets it resume). */
export function initAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  } catch { return; }
  master = ctx.createGain();
  master.gain.value = 0.45;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // (the spells' hall made here, behind the loading screen, not at a first cast)
  space();
}

export function setVolume(v: number): void { if (master) master.gain.value = v; }

/** The shared context (null before boot or where WebAudio is missing), for the music (`core/music.ts`). */
export const audioContext = (): AudioContext | null => ctx;

function throttle(name: string, ms: number): boolean {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return true;
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
  return { c, t, out, osc, lfo, loop, lane, hit, sweep, flange, start, stopAt, end };
}

// Void Lance is a beam of light, so it plays no notes: chimes, a chord, a choir and glittering bells over it played
// as a second tune in another key over the music (from play, "the background music gets duplicated", "like coins
// falling"). Its power is noise (a flanged roar, a blast) over a driven rumble, root and octave alone.

/** Void Lance's cast, the portal drawn over `dur` s: power gathering into it. A roar of noise swelling up from a
 *  murmur, its flanger sweeping faster as it fills, a rumble climbing an octave under it through a filter opening as
 *  it climbs. Returns a stop() (let go early, it dies away). */
function lanceInhale(dur: number): () => void {
  const v = voice(0.04, 0.3);
  const { c, t } = v;
  const swell = (peak: number, to: AudioNode): GainNode => {
    const g = c.createGain(); g.gain.setValueAtTime(0.003, t); g.gain.exponentialRampToValueAtTime(peak, t + dur); g.connect(to); return g;
  };
  // the gathering roar: noise opening from dark to bright, flanged, each ear its own
  const roarF: BiquadFilterNode[] = [], rumble: OscillatorNode[] = [];
  for (const [pan, rate] of [[-0.6, 1.3], [0.6, 1.7]]) {
    const f = v.sweep('lowpass', 400, 5000, dur, 0.8);
    v.loop(f); f.connect(v.flange(swell(0.22, v.lane(1, pan)), 4, 3, rate, 0.6));
    roarF.push(f);
  }
  // the rumble: root and octave climbing an octave, driven, through a filter opening as it climbs
  const sh = drive(3), lp = v.sweep('lowpass', 200, 1400, dur, 1.5);
  sh.connect(lp).connect(swell(0.09, v.out));
  for (const [freq, pan] of [[54.6, -0.5], [55, 0], [55.4, 0.5], [110.2, 0]]) {
    const o = v.osc('sawtooth', freq, v.lane(0.25, pan, sh));
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 2, t + dur);
    rumble.push(o);
  }
  v.start();
  // let go early, it winds down rather than cuts: the rumble sinking, the roar closing
  return () => {
    const n = v.end(0.35);
    const glide = (p: AudioParam, to: (now: number) => number, tau: number): void => {
      const now = p.value; p.cancelScheduledValues(n); p.setValueAtTime(now, n); p.setTargetAtTime(to(now), n, tau);
    };
    for (const o of rumble) glide(o.frequency, (f) => f * 0.5, 0.12);
    for (const f of roarF) glide(f.frequency, () => 250, 0.1);
  };
}

/** The lance bursting out of the portal: a driven blow falling to the floor of hearing, a blast of noise through a
 *  driven filter closing from white to dark (an explosion's shape), a flanged whoosh of the beam leaving and a crack. */
function lanceBurst(): void {
  const v = voice(0, 0.6);
  const { t } = v;
  // the blow: a sine falling from 140 to 30 Hz, driven, so a laptop hears its harmonics as a thump
  const boomSh = drive(3.5);
  boomSh.connect(v.hit(0.45, 0.8));
  const boom = v.osc('sine', 140, boomSh);
  boom.frequency.setValueAtTime(140, t); boom.frequency.exponentialRampToValueAtTime(30, t + 0.6);
  // the blast
  const blastF = v.sweep('lowpass', 7000, 260, 0.7, 0.9), blastSh = drive(3);
  v.loop(blastF); blastF.connect(blastSh).connect(v.hit(0.2, 0.7, v.out, 0.003));
  // the whoosh, flanged, sweeping up as the beam leaves
  const whooshF = v.sweep('bandpass', 500, 6000, 0.45, 0.9);
  v.loop(whooshF); whooshF.connect(v.flange(v.hit(0.16, 0.5, v.out, 0.015), 3, 2.5, 3, 0.7));
  // the crack
  const crackF = v.sweep('highpass', 2500, 2500, 0.1);
  v.loop(crackF); crackF.connect(v.hit(0.18, 0.06, v.out, 0.001));
  v.start(); v.stopAt(t + 1.3);
}

/** Void Lance held, a beam of raw power. The roar: noise through a slowly breathing lowpass and a flanger in each
 *  ear, out of step, the jet of the beam. The rumble: root and octave, five saws detuned into a thick beating
 *  chorus, driven and gently throbbing (a fast wobble read as an electric razor). The heat: a sizzle high over it,
 *  flickering. Returns a stop() that powers it down: its pitch falling, its roar closing to dark. */
function lanceDrone(): () => void {
  const v = voice(0.15, 0.2);
  const { c } = v;
  const pitched: OscillatorNode[] = [];

  // the roar
  const roarF: BiquadFilterNode[] = [];
  for (const [pan, rate, ms] of [[-0.55, 0.23, 3.5], [0.55, 0.31, 5]]) {
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200; f.Q.value = 0.7;
    v.loop(f); f.connect(v.flange(v.lane(0.14, pan), ms, ms * 0.7, rate, 0.65));
    v.lfo(rate * 1.7, 1100, f.frequency);
    roarF.push(f);
  }

  // the rumble
  const rumbleSh = drive(3);
  const rumbleF = c.createBiquadFilter(); rumbleF.type = 'lowpass'; rumbleF.frequency.value = 800; rumbleF.Q.value = 1.2;
  const rumble = c.createGain(); rumble.gain.value = 0.1;
  rumbleSh.connect(rumbleF).connect(rumble).connect(v.out);
  for (const [freq, pan] of [[55, -0.5], [55.35, 0.5], [54.7, 0], [110.4, -0.35], [109.6, 0.35]]) pitched.push(v.osc('sawtooth', freq, v.lane(0.22, pan, rumbleSh)));
  v.lfo(0.4, 250, rumbleF.frequency);
  v.lfo(2.6, 0.022, rumble.gain);
  const sub = c.createGain(); sub.gain.value = 0.05; sub.connect(v.out);
  pitched.push(v.osc('sine', 55, sub));

  // the heat: noise high up, flickering
  const heatF = c.createBiquadFilter(); heatF.type = 'highpass'; heatF.frequency.value = 5500;
  const heat = c.createGain(); heat.gain.value = 0.03;
  v.loop(heatF); heatF.connect(heat).connect(v.out);
  v.lfo(13, 0.012, heat.gain);

  v.start();
  return () => {
    // the power-down, a tune down rather than a cut (from play, "not just have the sound abruptly end ... like a tune
    // down"): the rumble's pitch sinking two octaves, the roar closing to dark, a falling whoosh as the beam goes out
    const n = v.end(1.4);
    // (eased out rather than an exponential ramp, which is 20 dB down in a quarter of its time)
    v.out.gain.cancelScheduledValues(n); v.out.gain.setValueAtTime(Math.max(v.out.gain.value, 0.0001), n);
    v.out.gain.setTargetAtTime(0.0001, n, 0.32);
    for (const o of pitched) o.frequency.setTargetAtTime(o.frequency.value * 0.25, n, 0.35);
    for (const f of roarF) f.frequency.setTargetAtTime(220, n, 0.25);
    rumbleF.frequency.setTargetAtTime(160, n, 0.3);
    lanceOut();
  };
}

/** The beam going out: a flanged whoosh falling from bright to dark, and a soft driven thump sinking under it. */
function lanceOut(): void {
  const v = voice(0, 0.45);
  const { t } = v;
  const f = v.sweep('bandpass', 2600, 180, 0.9, 1.1);
  v.loop(f); f.connect(v.flange(v.hit(0.4, 0.9, v.out, 0.03), 4, 3, 1.4, 0.6));
  const sh = drive(2.5); sh.connect(v.hit(0.24, 0.6, v.out, 0.01));
  const o = v.osc('sine', 110, sh); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
  v.start(); v.stopAt(t + 1.2);
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

/** Splintering Bolt's orb thrown: a soft driven thump falling away, a flanged whoosh leaving. Every throw a little
 *  apart (pitch, pan), so a held button's stream of them doesn't sound like one sample on repeat. */
function orbThrow(): void {
  const v = voice(0, 0.18);
  const { t } = v;
  const k = 0.9 + Math.random() * 0.2, pan = Math.random() * 0.4 - 0.2;
  const lane = v.lane(1, pan);
  const sh = drive(2.2); sh.connect(v.hit(0.4, 0.38, lane));
  const o = v.osc('sine', 260 * k, sh); o.frequency.setValueAtTime(260 * k, t); o.frequency.exponentialRampToValueAtTime(70 * k, t + 0.22);
  const f = v.sweep('bandpass', 600 * k, 3400 * k, 0.4, 0.9);
  v.loop(f); f.connect(v.flange(v.hit(0.55, 0.5, lane, 0.02), 2, 1.5, 6, 0.55));
  v.start(); v.stopAt(t + 0.6);
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
  /** Splintering Bolt's orb thrown, at every cast (a held button casts again and again) */
  bolt: guard(() => { if (throttle('bolt', 60)) return; orbThrow(); }),
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
  loot: guard((r: number) => { const base = [520, 620, 740, 880, 1040][r] || 520; tone({ freq: base, dur: 0.35, gain: 0.08 }); if (r >= 3) tone({ freq: base * 1.5, dur: 0.6, gain: 0.07, delay: 0.08 }); if (r >= 4) tone({ freq: base * 2, dur: 0.9, gain: 0.06, delay: 0.16 }); }),
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
  spawn: guard(() => { if (throttle('spawn', 150)) return; noise({ dur: 0.6, freq: 250, sweep: 1500, q: 6, gain: 0.12, attack: 0.1 }); }),
};
