// The Bell-Warden's sounds (entities/bellWarden.ts), made of core/audio.ts's voices: a foe's own sounds go in a file of
// their own here, so a PR adding one touches no shared file (core/audio.ts's `sfx` is the shared ones').
import { blowAt, crack, drive, glide, grit, guard, iron, rumble, smash, swellAt, throttle, thump, voice, whump } from '../audio';

// Its sounds: a cracked bronze bell, its wooden yoke and its chains. A bell is a note, so its toll is
// struck as `iron` strikes steel: narrow bands of noise at inharmonic ratios to a strike drawn anew at every toll, so it
// never plays the same pitch twice and never a tune over the music, its crack a rattle of driven noise beating in it.

/** The bell's toll: struck (a whump of bronze and wood), its body ringing for seconds in a cluster of narrow bands at
 *  a cracked bell's inharmonic ratios to a strike drawn anew each time, the crack's buzz beating in it, the hall
 *  ringing on. `heavy` (0..1) the slow ring's weight, a double toll's fast ring lighter. */
function bellToll(heavy: number, pitch = 1): void {
  const v = voice(0, 0.55);
  const base = (150 + Math.random() * 60) * pitch, k = 0.6 + 0.4 * heavy;
  whump(v, 0, 0.6 * k, 0.7);
  thump(v, 0, 1600, 90, 0.35 * k, 0.9, v.out, 3);
  crack(v, 0, 0.12 * k, v.out, 1800);
  // (a cracked bell's partials: the hum, the prime, the minor third gone flat, the fifth, the nominal, and the high ones)
  for (const [ratio, peak, decay] of [[0.5, 0.5, 3.2], [1, 0.6, 2.6], [1.17, 0.45, 2.2], [1.52, 0.32, 1.8], [2.03, 0.4, 1.6], [2.6, 0.22, 1.1], [3.3, 0.15, 0.8], [4.1, 0.1, 0.6]]) {
    const f = v.c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 28;
    f.frequency.value = base * ratio * (0.985 + Math.random() * 0.03);
    v.loop(f); f.connect(blowAt(v, 0, peak * 1.6 * k, decay * (0.6 + 0.4 * heavy), v.lane(1, Math.random() * 0.6 - 0.3), 0.002));
  }
  // the crack: a buzz of driven noise round the bell's middle, beating as the two halves part and meet
  const buzz = v.c.createBiquadFilter(); buzz.type = 'bandpass'; buzz.frequency.value = base * 5; buzz.Q.value = 2;
  const beat = v.c.createGain(); beat.gain.value = 0.5; v.lfo(17 + Math.random() * 8, 0.5, beat.gain);
  v.loop(buzz); buzz.connect(drive(5)).connect(beat).connect(blowAt(v, 0, 0.18 * k, 1.4));
  v.start(); v.stopAt(v.t + 3.6);
}

/** The bell swung back before a toll, over `dur` s: the yoke's wood creaking (a band of noise rubbing, its pitch
 *  wandering), the chains rattling, and the bell's lip brushing a faint ring. */
function bellCreak(dur: number): void {
  const v = voice(0.05, 0.3);
  const rub = glide(v, 'bandpass', 9, [[0, 380], [dur * 0.4, 520], [dur * 0.75, 300], [dur, 460]]);
  v.loop(rub); rub.connect(drive(3)).connect(swellAt(v, 0, dur * 0.7, 0.22, dur * 0.5));
  grit(v, 14, 0.05, dur, 2200, 6000, 0.05);
  iron(v, dur * 0.5, 3, 900, 2600, 0.03, 0.5);
  v.start(); v.stopAt(v.t + dur + 1);
}

/** A bearer's chain snapping: iron's crack, links ringing and falling, and the bearer's weight shifting under it. */
function chainSnap(): void {
  const v = voice(0, 0.3);
  const lane = v.lane(1, Math.random() * 0.6 - 0.3);
  crack(v, 0, 0.3, lane, 2600);
  iron(v, 0, 6, 1200, 5200, 0.12, 0.45, lane);
  grit(v, 10, 0.08, 0.5, 2500, 7000, 0.07);
  whump(v, 0.05, 0.3, 0.3, lane);
  v.start(); v.stopAt(v.t + 1.2);
}

/** The bell dropped to the ground with its chains all broken: bronze and earth, the bell ringing dull against it. */
function bellDrop(): void {
  const v = voice(0, 0.5);
  smash(v, 0, 0.5, 0.4);
  whump(v, 0, 0.8, 0.9);
  rumble(v, 0.02, 0.5, 1.4);
  iron(v, 0.01, 5, 160, 900, 0.2, 1.4);
  v.start(); v.stopAt(v.t + 2.5);
}

/** A ghost seizing a hero: a rush of cold air rising and falling through a slow flanger, a breathy wail with no pitch
 *  (a band of noise swept, not a note), and a hiss as it lifts. */
function ghostGrab(): void {
  const v = voice(0.02, 0.5);
  const wail = glide(v, 'bandpass', 6, [[0, 500], [0.35, 1400], [0.9, 700]]);
  v.loop(wail); wail.connect(v.flange(swellAt(v, 0, 0.3, 0.2, 0.7), 4, 3, 0.7, 0.55));
  const rush = glide(v, 'bandpass', 1, [[0, 300], [0.25, 2200], [0.8, 600]]);
  v.loop(rush); rush.connect(swellAt(v, 0, 0.2, 0.12, 0.6));
  v.start(); v.stopAt(v.t + 1.6);
}

/** A shard of bronze breaking off the bell: a crack and a small high ring. */
function shardBreak(): void {
  const v = voice(0, 0.2);
  crack(v, 0, 0.15, v.out, 3000);
  iron(v, 0, 3, 1800, 5200, 0.06, 0.35);
  v.start(); v.stopAt(v.t + 0.7);
}

/** its toll (`heavy` the slow ring's weight, `pitch` how much higher it's rung: a guard's lesser bell), the bell swung back over `dur` s, a chain snapping, the bell dropped, a
 *  ghost seizing a hero, a shard breaking off */
export const bellSounds = {
  toll: guard((heavy: number = 1, pitch: number = 1) => { if (throttle('bellToll', 120)) return; bellToll(heavy, pitch); }),
  creak: guard((dur: number = 1) => { if (throttle('bellCreak', 300)) return; bellCreak(dur); }),
  chain: guard(() => { if (throttle('chainSnap', 80)) return; chainSnap(); }),
  drop: guard(() => { if (throttle('bellDrop', 500)) return; bellDrop(); }),
  grab: guard(() => { if (throttle('ghostGrab', 300)) return; ghostGrab(); }),
  shard: guard(() => { if (throttle('shardBreak', 90)) return; shardBreak(); }),
};
