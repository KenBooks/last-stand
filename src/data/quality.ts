// Graphics quality presets. None of these settings change shader variants, so they
// can be switched live without a compile hitch (see core/shaders.ts).
export type QualityLevel = 'high' | 'medium' | 'low' | 'verylow';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityPreset {
  label: string;
  /** the most pixels the scene renders, counted on the screen (Infinity: all the screen's own); never by the OS's
   *  scaling, which says nothing of what the hardware draws. Every level renders them all: what a level cuts is
   *  other work ("I want to run the game at full phone res") */
  pixels: number;
  /** MSAA samples on the scene render target (0 = off) */
  msaa: number;
  /** directional (moon) shadow map resolution */
  shadowMap: number;
  /** character parts with a smaller bounding radius don't cast shadows (each caster is a draw call) */
  minCasterRadius: number;
  /** the heroes' geometric detail (hair locks, fur tufts, curve segments), 1 = full; taken when a hero is built */
  heroDetail: number;
  /** enemies further than this from the local player (m) skip the leg IK (models/ik.ts): their walk cycle's own legs */
  ikRange: number;
  /** the floors' relief: the most steps down each view ray (core/parallax.ts), 0 = flat */
  relief: number;
  /** whether the frame may be shown in HDR on a display in HDR mode (`setHdrAllowed` in core/hdr.ts): its copy of
   *  the frame at the screen's pixels cost a 4K laptop's integrated GPU 26 ms of 38 */
  hdr: boolean;
  /** whether the props sculpted for close looks are drawn coarser (the crypt's skulls: `setSkullDetail` in
   *  world/skull.ts) */
  coarseProps: boolean;
  /** the share of the scene's pixels each way bloom draws at (`setBloomShare` in core/renderer.ts): Low's half,
   *  a quarter of the pixels (an S25 Edge's bloom was 6 ms of an 80 ms frame at full res) */
  bloomShare: number;
  /** whether the sun's (moon's) shadow is drawn every other frame, whatever the frame rate (`setShadowInTurns` in
   *  core/renderer.ts): its pass draws every caster again */
  shadowInTurns: boolean;
  /** whether the sun's shadow is of what stands still alone, drawn only when that changes (`setSunShadowStill` in
   *  world/props.ts): its pass drew the whole biome again each time; the heroes and foes cast none by it then */
  stillSunShadow: boolean;
  /** the share of the floor's clutter drawn: grass, ferns, pebbles, rocks, bones (`setClutterShare` in
   *  world/culling.ts) */
  clutter: number;
  /** the share of the particles a burst, a puff of smoke or debris spawns (`setParticleShare` in fx/particles.ts):
   *  each is drawn over what's behind it, so fewer is less of the GPU's fill */
  particles: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  high:    { label: 'High',     pixels: Infinity, msaa: 4, shadowMap: 4096, minCasterRadius: 0.07, heroDetail: 1, ikRange: Infinity, relief: 16, hdr: true, coarseProps: false, bloomShare: 1, shadowInTurns: false, particles: 1, stillSunShadow: false, clutter: 1 },
  medium:  { label: 'Medium',   pixels: Infinity, msaa: 2, shadowMap: 2048, minCasterRadius: 0.11, heroDetail: 0.6, ikRange: Infinity, relief: 8, hdr: false, coarseProps: false, bloomShare: 1, shadowInTurns: false, particles: 1, stillSunShadow: false, clutter: 1 },
  low:     { label: 'Low',      pixels: Infinity, msaa: 0, shadowMap: 1024, minCasterRadius: 0.16, heroDetail: 0.35, ikRange: 14, relief: 0, hdr: false, coarseProps: true, bloomShare: 0.5, shadowInTurns: false, particles: 1, stillSunShadow: false, clutter: 1 },
  // (below Low, for a device that still lags there: from play, "a very low graphics mode, even lower than low...
  // all graphics reduced, effects that use less GPU processing"; the screen's pixels kept, as at every level)
  verylow: { label: 'Very low', pixels: Infinity, msaa: 0, shadowMap: 512, minCasterRadius: 0.3, heroDetail: 0.2, ikRange: 6, relief: 0, hdr: false, coarseProps: true, bloomShare: 0.25, shadowInTurns: true, particles: 0.5, stillSunShadow: true, clutter: 0.34 },
};

export const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low', 'verylow'];

/**
 * Auto quality: a level down when the average FPS stays below `minFps` for `window` seconds (frames over 250 ms,
 * hitches, left out of it), the screen's own pixels kept at every level (from play, "I want to run the game at full
 * phone res, if we need to cut, we need to cut something else, not resolution"); or to Low at once after
 * `quickWindow` seconds whose middle frame is under `farBelow` of it (a hitch doesn't move the middle). A frame longer
 * than `longestFrame` s is no measure (a tab switch, a breakpoint). What the hardware holds is measured, never guessed
 * from the device or the OS's scaling. From play, a laptop's integrated GPU switched to Auto ran at 5 frames a
 * second "for the first minute or two" (`npm run lab -- auto`: to Low in 3.4 s).
 */
export const AUTO_QUALITY = { minFps: 50, window: 4, quickWindow: 1, farBelow: 0.5, settle: 2, longestFrame: 1 };
