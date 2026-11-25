// The Rootmother's sounds (entities/rootmother.ts), made of core/audio.ts's voices: a foe's own sounds go in a file
// of their own here, so a PR adding one touches no shared file (core/audio.ts's `sfx` is the shared ones'). Wood,
// earth and sap, no notes.
import { guard, noise, throttle } from '../audio';

/** her roots drawn back and driven down: old wood groaning under strain for `dur` s; a seed pod popped or bursting (a
 *  wet husk splitting); thorns tearing up out of the earth round her trunk; the earth cracking under a hero for `dur`
 *  s before roots burst from it; her heart laid bare (a deep double thump); the canopy closing overhead (leaves and
 *  wind rushing, slow); a branch snapped off her crown (green wood cracking, splinters); one whirling through the air
 *  for `dur` s (a whoosh rising and falling, a rasp of its thorns); one driven into the earth (a deep thud, a knock);
 *  her cage's roots tearing up out of the earth round a hero (earth heaving, wood creaking taut); her great root rising
 *  for `dur` s (a deep strain of wood, slow); it crashing down across the cage (a heavy wooden crash, earth thrown up) */
export const rootSounds = {
  groan: guard((dur: number = 0.9) => {
    if (throttle('rootGroan', 300)) return;
    noise({ dur, freq: 240, sweep: 160, q: 9, gain: 0.3, attack: dur * 0.3 });
    noise({ dur: dur * 0.8, freq: 900, sweep: 520, q: 12, gain: 0.08, attack: 0.12 });
    noise({ dur: 0.25, freq: 140, type: 'lowpass', gain: 0.25, attack: 0.02 });
  }),
  pod: guard(() => {
    if (throttle('podPop', 60)) return;
    noise({ dur: 0.1, freq: 1100, sweep: 300, q: 3, gain: 0.32 });
    noise({ dur: 0.35, freq: 380, type: 'lowpass', gain: 0.24, attack: 0.01 });
  }),
  thorns: guard(() => {
    if (throttle('thornsRise', 200)) return;
    noise({ dur: 0.55, freq: 3000, sweep: 1100, q: 1.4, gain: 0.16 });
    noise({ dur: 0.5, freq: 260, type: 'lowpass', gain: 0.42 });
  }),
  crack: guard((dur: number = 1) => {
    if (throttle('earthCrack', 200)) return;
    noise({ dur, freq: 150, type: 'lowpass', gain: 0.32, attack: dur * 0.7 });
    noise({ dur, freq: 1900, q: 5, gain: 0.05, attack: dur * 0.4 });
  }),
  heart: guard(() => {
    if (throttle('heartBeat', 500)) return;
    noise({ dur: 0.16, freq: 90, type: 'lowpass', gain: 0.5 });
    noise({ dur: 0.2, freq: 75, type: 'lowpass', gain: 0.4, attack: 0.02 });
  }),
  snap: guard(() => {
    if (throttle('branchSnap', 120)) return;
    noise({ dur: 0.07, freq: 2600, q: 2.5, gain: 0.34 });
    noise({ dur: 0.22, freq: 900, sweep: 500, q: 4, gain: 0.2, attack: 0.01 });
    noise({ dur: 0.12, freq: 180, type: 'lowpass', gain: 0.22 });
  }),
  whirl: guard((dur: number = 1) => {
    if (throttle('branchWhirl', 60)) return;
    noise({ dur, freq: 700, sweep: 420, q: 3, gain: 0.16, attack: dur * 0.45 });
    noise({ dur: dur * 0.8, freq: 3200, sweep: 2400, q: 6, gain: 0.04, attack: dur * 0.3 });
  }),
  stake: guard(() => {
    if (throttle('branchStake', 50)) return;
    noise({ dur: 0.18, freq: 120, type: 'lowpass', gain: 0.45 });
    noise({ dur: 0.08, freq: 1300, q: 3, gain: 0.16 });
    noise({ dur: 0.4, freq: 300, type: 'lowpass', gain: 0.12, attack: 0.03 });
  }),
  roots: guard(() => {
    if (throttle('cageRoots', 300)) return;
    noise({ dur: 0.5, freq: 200, type: 'lowpass', gain: 0.45, attack: 0.02 });
    noise({ dur: 0.45, freq: 700, sweep: 380, q: 6, gain: 0.14, attack: 0.05 });
    noise({ dur: 0.3, freq: 2400, q: 2, gain: 0.06 });
  }),
  creak: guard((dur: number = 2.5) => {
    if (throttle('greatRootCreak', 500)) return;
    noise({ dur, freq: 180, sweep: 120, q: 8, gain: 0.26, attack: dur * 0.6 });
    noise({ dur: dur * 0.9, freq: 620, sweep: 420, q: 14, gain: 0.06, attack: dur * 0.5 });
  }),
  slam: guard(() => {
    if (throttle('greatRootSlam', 300)) return;
    noise({ dur: 0.6, freq: 110, type: 'lowpass', gain: 0.6, attack: 0.005 });
    noise({ dur: 0.25, freq: 900, q: 1.5, gain: 0.22 });
    noise({ dur: 0.9, freq: 260, type: 'lowpass', gain: 0.18, attack: 0.05 });
  }),
  canopy: guard(() => {
    noise({ dur: 2.6, freq: 1400, sweep: 500, q: 0.7, gain: 0.18, attack: 0.7 });
    noise({ dur: 2.6, freq: 110, type: 'lowpass', gain: 0.3, attack: 0.9 });
  }),
};
