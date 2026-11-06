// Graphics quality presets. None of these settings change shader variants, so they
// can be switched live without a compile hitch (see core/shaders.ts).
export type QualityLevel = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityPreset {
  label: string;
  /** the most pixels the scene renders, counted on the screen (Infinity: all the screen's own); never by the OS's
   *  scaling, which says nothing of what the hardware draws */
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
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  high:   { label: 'High',   pixels: Infinity,    msaa: 4, shadowMap: 4096, minCasterRadius: 0.07, heroDetail: 1, ikRange: Infinity, relief: 16 },
  medium: { label: 'Medium', pixels: 2560 * 1440, msaa: 2, shadowMap: 2048, minCasterRadius: 0.11, heroDetail: 0.6, ikRange: Infinity, relief: 8 },
  low:    { label: 'Low',    pixels: 1920 * 1080, msaa: 0, shadowMap: 1024, minCasterRadius: 0.16, heroDetail: 0.35, ikRange: 14, relief: 0 },
};

export const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low'];

/**
 * Auto quality: step down when the average FPS stays below `minFps` for `window` seconds (frames over 250 ms, hitches,
 * left out of it), half the pixels a step; or at once after `quickWindow` seconds whose middle frame is under
 * `farBelow` of it (a hitch doesn't move the middle), the pixels cut by the frame rate's share of `minFps` (a
 * GPU-bound frame's time goes with its pixels), at most to `deepest` of them. High first renders fewer pixels, down
 * to `highFloor`; then the level goes down, keeping the pixels; then Low renders fewer, down to `fewest` (each the
 * screen's own, if fewer). A frame longer than `longestFrame` s is no measure (a tab switch, a breakpoint). What the
 * hardware holds is measured, never guessed from the device or the OS's scaling. From play, a laptop's integrated GPU
 * switched to Auto (which starts over from High) ran at 5 frames a second "for the first minute or two": a step a 4 s
 * window and 2 to settle, half the pixels a step (`npm run lab -- auto`: 36.7 s to its target, now 12.6).
 */
export const AUTO_QUALITY = {
  minFps: 50, window: 4, quickWindow: 1, farBelow: 0.5, settle: 2, deepest: 1 / 8, longestFrame: 1,
  highFloor: 1920 * 1080, fewest: 960 * 540,
};
