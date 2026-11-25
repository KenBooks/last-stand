// The Ossuary Cantor's sounds (entities/cantor.ts), made of core/audio.ts's voices: a foe's own sounds go in a file of
// their own here, so a PR adding one touches no shared file (core/audio.ts's `sfx` is the shared ones').
import { crack, glide, grit, guard, rumble, swellAt, throttle, voice, whump } from '../audio';

/** The Ossuary Cantor's chant over a cast's warning: a choir of dead throats, each a band of breath swept through an
 *  "oo" and an "ah" (formants, no pitch), swelling to the cast and cut off on it. */
function cantorChant(dur: number): void {
  const v = voice(0.08, 0.6);
  for (const [lo, hi, q, peak] of [[260, 420, 7, 0.16], [520, 780, 8, 0.12], [900, 1250, 9, 0.07]] as const) {
    const mouth = glide(v, 'bandpass', q, [[0, lo], [dur * 0.5, hi], [dur, lo * 1.1]]);
    v.loop(mouth); mouth.connect(v.flange(swellAt(v, 0, dur * 0.85, peak, 0.35), 5, 2.5, 0.6, 0.4));
  }
  rumble(v, dur * 0.6, 0.18, dur * 0.6);
  v.start(); v.stopAt(v.t + dur + 1);
}

/** Grave hands bursting from the floor: earth torn, bones knocking and cracking, a dull blow under them. */
function boneHands(): void {
  const v = voice(0, 0.3);
  whump(v, 0, 0.5, 0.35);
  grit(v, 16, 0, 0.35, 900, 3200, 0.1);
  crack(v, 0.02, 0.22, v.out, 1800);
  crack(v, 0.09, 0.16, v.out, 2600);
  v.start(); v.stopAt(v.t + 1);
}

/** The Cantor's phase begun: one long breath drawn in by the whole choir and let out as a wail through the ossuary. */
function cantorWail(): void {
  const v = voice(0.05, 0.7);
  const wail = glide(v, 'bandpass', 5, [[0, 300], [0.8, 1100], [2.2, 380]]);
  v.loop(wail); wail.connect(v.flange(swellAt(v, 0, 0.9, 0.24, 1.4), 3, 3, 0.7, 0.5));
  rumble(v, 0.1, 0.4, 1.8);
  v.start(); v.stopAt(v.t + 3);
}

/**
 * Its choir's ring: the dead singing round the ring, many throats of breath through their "oo" and "ah" (formants, no
 * pitch, as its chant), swelling over the ring's `warn` s as its singers rise, holding low for `lasts` s, and
 * breathing out as it fades.
 */
function choirSing(warn: number, lasts: number): void {
  const v = voice(0.1, 0.8);
  const end = warn + lasts;
  for (const [lo, hi, q, peak, rate] of [[240, 380, 6, 0.12, 0.31], [480, 720, 7, 0.1, 0.23], [820, 1180, 8, 0.06, 0.37], [1600, 2300, 9, 0.03, 0.19]] as const) {
    const throats = glide(v, 'bandpass', q, [[0, lo], [warn, hi], [warn + lasts * 0.5, lo * 1.15], [end, hi * 0.9]]);
    v.loop(throats);
    throats.connect(v.flange(swellAt(v, 0, warn, peak, lasts * 0.7), 4 + rate * 4, 3, 0.65, 0.45));
  }
  rumble(v, warn * 0.8, 0.2, lasts * 0.4);
  v.start(); v.stopAt(v.t + end + 1.5);
}

/** A gravestone pushed up out of the floor: stone grinding on stone, earth breaking, a dull blow as it stops. */
function graveRise(): void {
  const v = voice(0, 0.25);
  grit(v, 22, 0, 0.45, 300, 1400, 0.12);
  whump(v, 0.38, 0.4, 0.3);
  crack(v, 0.05, 0.18, v.out, 1200);
  rumble(v, 0, 0.15, 0.5);
  v.start(); v.stopAt(v.t + 1.2);
}

/** its chant over a cast's `dur` s of warning, its grave hands bursting up, its phase's wail, its choir's ring, a
 *  gravestone rising */
export const cantorSounds = {
  chant: guard((dur: number = 1) => { if (throttle('cantorChant', 400)) return; cantorChant(dur); }),
  hands: guard(() => { if (throttle('boneHands', 70)) return; boneHands(); }),
  wail: guard(() => { if (throttle('cantorWail', 800)) return; cantorWail(); }),
  choir: guard((warn: number = 1.8, lasts: number = 13) => { if (throttle('cantorChoir', 2000)) return; choirSing(warn, lasts); }),
  graveRise: guard(() => { if (throttle('graveRise', 120)) return; graveRise(); }),
};
