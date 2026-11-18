// The Ossuary Twins' sounds (entities/twins.ts), made of core/audio.ts's voices: a foe's or a skill's own sounds go in
// a file of their own here, so a PR adding one touches no shared file (core/audio.ts's `sfx` is the shared ones').
import { crack, glide, grit, guard, rumble, swellAt, throttle, voice, whump } from '../audio';

/** One of the Ossuary Twins taking up his brother's power at half: a long breath drawn in and let out as a wail through
 *  the ossuary. */
function twinsRise(): void {
  const v = voice(0.05, 0.7);
  const wail = glide(v, 'bandpass', 5, [[0, 300], [0.8, 1100], [2.2, 380]]);
  v.loop(wail); wail.connect(v.flange(swellAt(v, 0, 0.9, 0.24, 1.4), 3, 3, 0.7, 0.5));
  rumble(v, 0.1, 0.4, 1.8);
  v.start(); v.stopAt(v.t + 3);
}

/** The Ossuary Twins' chain of bone snapping tight: a rattle of bones knocking down its length, a crack as it goes taut,
 *  a heavy drag under it. */
function twinChain(): void {
  const v = voice(0, 0.35);
  grit(v, 22, 0, 0.3, 1200, 4200, 0.09);
  crack(v, 0.05, 0.24, v.out, 2200);
  crack(v, 0.11, 0.14, v.out, 3400);
  whump(v, 0.04, 0.4, 0.4);
  rumble(v, 0.05, 0.25, 0.7);
  v.start(); v.stopAt(v.t + 1.2);
}

/** Reliquary's skulls let fly: a hiss of breath through each, swept up as they leave. */
function skullVolley(): void {
  const v = voice(0.01, 0.5);
  const hiss = glide(v, 'bandpass', 3, [[0, 700], [0.25, 2400], [0.6, 1200]]);
  v.loop(hiss); hiss.connect(swellAt(v, 0, 0.12, 0.14, 0.5));
  grit(v, 8, 0, 0.2, 1500, 3800, 0.05);
  v.start(); v.stopAt(v.t + 0.9);
}

/** Reliquary mending his brother over `dur` s: a low murmur of breath swelling under the channel, falling off with it. */
function twinMend(dur: number): void {
  const v = voice(0.1, 0.6);
  for (const [lo, hi, peak] of [[180, 300, 0.12], [420, 600, 0.07]] as const) {
    const mouth = glide(v, 'bandpass', 6, [[0, lo], [dur * 0.6, hi], [dur, lo]]);
    v.loop(mouth); mouth.connect(v.flange(swellAt(v, 0, dur * 0.8, peak, 0.4), 4, 2, 0.5, 0.4));
  }
  v.start(); v.stopAt(v.t + dur + 0.8);
}

/** One of the Twins collapsing at half: its bones coming down in a heap, stone and bone knocking, a long settling. */
function twinFall(): void {
  const v = voice(0, 0.5);
  whump(v, 0, 0.6, 0.6);
  grit(v, 30, 0, 0.9, 800, 3600, 0.1);
  crack(v, 0.1, 0.2, v.out, 1600);
  crack(v, 0.3, 0.14, v.out, 2400);
  rumble(v, 0.05, 0.4, 1.6);
  v.start(); v.stopAt(v.t + 2.5);
}

/** the survivor taking up his brother's power, the chain snapping tight, the skulls let fly, the mend over `dur` s, one
 *  of them collapsing */
export const twinSounds = {
  rise: guard(() => { if (throttle('twinsRise', 800)) return; twinsRise(); }),
  chain: guard(() => { if (throttle('twinChain', 300)) return; twinChain(); }),
  skulls: guard(() => { if (throttle('skullVolley', 200)) return; skullVolley(); }),
  mend: guard((dur: number = 2) => { if (throttle('twinMend', 500)) return; twinMend(dur); }),
  fall: guard(() => { if (throttle('twinFall', 800)) return; twinFall(); }),
};
