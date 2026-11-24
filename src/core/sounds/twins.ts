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

/** A belt skull torn off its rope and thrown: a rattle of bone on the rope, a swish as the arm comes over. */
function skullThrow(): void {
  const v = voice(0, 0.3);
  grit(v, 10, 0, 0.18, 1400, 3600, 0.06);
  const swish = glide(v, 'bandpass', 2, [[0.1, 500], [0.3, 1800], [0.45, 700]]);
  v.loop(swish); swish.connect(swellAt(v, 0.1, 0.28, 0.12, 0.25));
  v.start(); v.stopAt(v.t + 0.8);
}

/** A bomb's fuse burning down over `dur` s: a hiss rising in pitch and loudness under a crackle, cut at the blast. */
function skullFuse(dur: number): void {
  const v = voice(0.05, 0.25);
  const hiss = glide(v, 'bandpass', 4, [[0, 1800], [dur, 5200]]);
  v.loop(hiss); hiss.connect(swellAt(v, 0, dur, 0.1, 0.05));
  grit(v, Math.round(dur * 14), 0, dur, 2400, 6000, 0.035);
  v.start(); v.stopAt(v.t + dur + 0.05);
}

/** A bomb skull bursting: a deep thump, bone and stone thrown, a rumble after. */
function skullBlast(): void {
  const v = voice(0, 0.45);
  whump(v, 0, 0.75, 0.5);
  crack(v, 0, 0.3, v.out, 1300);
  grit(v, 24, 0.02, 0.5, 900, 4200, 0.09);
  rumble(v, 0.02, 0.45, 1.2);
  v.start(); v.stopAt(v.t + 1.8);
}

/** A poison skull breaking where it lands: a wet crack and a long hiss of gas let out. */
function skullPoison(): void {
  const v = voice(0, 0.4);
  crack(v, 0, 0.18, v.out, 1800);
  const gas = glide(v, 'bandpass', 1.5, [[0, 2600], [0.3, 1400], [1.6, 900]]);
  v.loop(gas); gas.connect(swellAt(v, 0, 0.15, 0.1, 1.4));
  v.start(); v.stopAt(v.t + 2);
}

/** the survivor taking up his brother's power, the chain snapping tight, the skulls let fly, the mend over `dur` s, one
 *  of them collapsing */
export const twinSounds = {
  rise: guard(() => { if (throttle('twinsRise', 800)) return; twinsRise(); }),
  chain: guard(() => { if (throttle('twinChain', 300)) return; twinChain(); }),
  skulls: guard(() => { if (throttle('skullVolley', 200)) return; skullVolley(); }),
  mend: guard((dur: number = 2) => { if (throttle('twinMend', 500)) return; twinMend(dur); }),
  fall: guard(() => { if (throttle('twinFall', 800)) return; twinFall(); }),
  /** a belt skull thrown, a bomb's fuse over `dur` s, its blast, a poison skull breaking (entities/twinSkulls.ts) */
  skullThrow: guard(() => { if (throttle('skullThrow', 300)) return; skullThrow(); }),
  fuse: guard((dur: number = 2) => { if (throttle('skullFuse', 300)) return; skullFuse(dur); }),
  blast: guard(() => { if (throttle('skullBlast', 300)) return; skullBlast(); }),
  poison: guard(() => { if (throttle('skullPoison', 300)) return; skullPoison(); }),
};
