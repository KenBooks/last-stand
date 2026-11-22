// Graphics quality presets. None of these settings change shader variants, so they
// can be switched live without a compile hitch (see core/shaders.ts).
import { VILLAGE } from '../core/beta';

export type QualityLevel = 'high' | 'medium' | 'low' | 'verylow';
export type QualitySetting = 'auto' | QualityLevel;

/**
 * Each setting a block of its own, sorted, its value at every level: a PR adding a setting adds its block alone (as
 * one line a level, every setting a column, any two PRs adding settings both rewrote all four lines and conflicted).
 * `QUALITY` turns it round into a preset a level.
 */
// sorted
const SETTINGS = {
  /** the share of the scene's pixels each way bloom draws at (`setBloomShare` in core/renderer.ts): Low's half,
   *  a quarter of the pixels (an S25 Edge's bloom was 6 ms of an 80 ms frame at full res) */
  // (0: no bloom at all, Very low's)
  bloomShare: { high: 1, medium: 1, low: 0.5, verylow: 0 },
  /** the share of the floor's clutter drawn: grass, ferns, pebbles, rocks, bones (`setClutterShare` in
   *  world/culling.ts) */
  clutter: { high: 1, medium: 1, low: 1, verylow: 0.34 },
  /** whether the props sculpted for close looks are drawn coarser (the crypt's skulls: `setSkullDetail` in
   *  world/skull.ts) */
  coarseProps: { high: false, medium: false, low: true, verylow: true },
  /** the rounds a skirt's cloth is draped over the limbs a frame (`setDrapeRounds` in entities/models/armor.ts) */
  drapeRounds: { high: 3, medium: 4, low: 2, verylow: 2 },
  /** whether the flames take the lite path (`setFlameSteps` in world/fire.ts): the nearest loop frame alone and no
   *  strands at each step, a third of the volume's reads, near the old fire's cost (#461) */
  flameLite: { high: false, medium: false, low: true, verylow: true },
  /** the share of a fire's ray-march steps its flames take (`setFlameSteps` in world/fire.ts): each step is up to
   *  three reads of the flames' volume at every pixel they cover */
  flameSteps: { high: 1, medium: 0.75, low: 0.75, verylow: 0.35 },
  /** whether the floor's plants are drawn: weeds, ferns and fallen leaves, never the grass, which every level keeps
   *  (`setFloorPlants` in world/culling.ts): counts alone. Very low's none (#599, from play: players on Very low
   *  "desperate for fps"; its leaner trees left to the simple ones, #643) */
  floorPlants: { high: true, medium: true, low: true, verylow: false },
  /** whether worn gear glows in its rarity's colour where the player hasn't chosen (Settings' Gear glow,
   *  `setGearGlowByLevel` in core/materials.ts): 3 to 10% of the frame where glowing gear fills the view */
  gearGlow: { high: true, medium: true, low: true, verylow: false },
  /** how far apart the grass's blades stand, against High's, each as many times wider (`setGrassSpread` in
   *  world/meadow.ts): twice, a quarter of the blades cover the ground as before, a quarter of the vertices shaded
   *  (on an S25 Edge at full res the grass was 21 ms of an 80 ms frame; Very low's four times, a sixteenth: a laptop's
   *  integrated GPU drew 5 frames a second over the shoulder, the grass 296k of its 534k triangles) */
  grassSpread: { high: 1, medium: 1, low: 2, verylow: 4 },
  /** whether the grass's near blades are tufts of thin blades, each its own way (`setGrassTufts` in world/meadow.ts):
   *  three times their vertices, High's alone */
  grassTufts: { high: true, medium: false, low: false, verylow: false },
  /** whether the frame may be shown in HDR on a display in HDR mode (`setHdrAllowed` in core/hdr.ts): its copy of
   *  the frame at the screen's pixels cost a 4K laptop's integrated GPU 26 ms of 38 */
  hdr: { high: true, medium: false, low: false, verylow: false },
  /** the heroes' geometric detail (hair locks, fur tufts, curve segments), 1 = full; taken when a hero is built */
  heroDetail: { high: 1, medium: 0.6, low: 0.35, verylow: 0.2 },
  /** enemies further than this from the local player (m) skip the leg IK (models/ik.ts): their walk cycle's own legs */
  ikRange: { high: Infinity, medium: Infinity, low: 14, verylow: 6 },
  /** the share of the village's lamps' reach, and whether they read the shadows' map of what stands round them
   *  (`setLampQuality` in core/lamps.ts) */
  lampReach: { high: 1, medium: 1, low: 0.7, verylow: 0.7 },
  lampShadows: { high: true, medium: true, low: false, verylow: false },
  /** the share of the thicket's leaf cards drawn (`setLeafShare` in world/culling.ts) */
  leaves: { high: 1, medium: 1, low: 1, verylow: 0.5 },
  /** character parts with a smaller bounding radius don't cast shadows (each caster is a draw call) */
  minCasterRadius: { high: 0.09, medium: 0.11, low: 0.16, verylow: 0.3 },
  /** MSAA samples on the scene render target (0 = off) */
  msaa: { high: VILLAGE ? 2 : 4, medium: 2, low: 0, verylow: 0 },
  /** the share of the particles a burst, a puff of smoke or debris spawns (`setParticleShare` in fx/particles.ts):
   *  each is drawn over what's behind it, so fewer is less of the GPU's fill */
  particles: { high: 1, medium: 1, low: 1, verylow: 0.5 },
  /** the most pixels the scene renders, counted on the screen (Infinity: all the screen's own); never by the OS's
   *  scaling, which says nothing of what the hardware draws. Every level renders them all: what a level cuts is
   *  other work ("I want to run the game at full phone res") */
  pixels: { high: Infinity, medium: Infinity, low: Infinity, verylow: Infinity },
  /** the lit shading made plain on WebGPU (`setPlainLitOnWebGPU` in core/webgpu.ts): no surface maps (normal,
   *  roughness, metalness, occlusion), built without that code at the boot's level (each shadow read with one
   *  lookup there), a uniform's branch once the game shows. A quarter of a phone's frame (trace DM4B-R468). WebGL's
   *  lit shading cost that phone 0.8 ms at Medium (EZJ6-YGPE), and is left whole */
  plainLit: { high: false, medium: false, low: true, verylow: true },
  /** a co-op partner and a foe out of view or past the leg IK's range (`ikRange`) are posed one frame in this many,
   *  the time between given to that one (`Player.pose`, `Enemy.animate`); the local hero every frame */
  poseEvery: { high: 1, medium: 1, low: 1, verylow: 2 },
  /** the floors' relief: the most steps down each view ray (core/parallax.ts), 0 = flat */
  relief: { high: 12, medium: 8, low: 0, verylow: 0 },
  /** whether the sun's (moon's) shadow is drawn every other frame, whatever the frame rate (`setShadowInTurns` in
   *  core/renderer.ts): its pass draws every caster again */
  shadowInTurns: { high: false, medium: false, low: false, verylow: true },
  /** directional (moon) shadow map resolution */
  shadowMap: { high: 3072, medium: 2048, low: 1024, verylow: 512 },
  /** whether the village draws what moves into its kept shadow maps only on frames it moved
   *  (`world/shadowsOnMove.ts`): every level's now (a hero on High is 134k triangles a shadow pass, drawn again each
   *  frame he stood still: from play, 1.28M triangles facing a wall, "our users are really struggling") */
  shadowsOnMove: { high: true, medium: true, low: true, verylow: true },
  /** whether the village's and the Thornwood's trees are drawn as simple ones, each a model of a few pieces
   *  (`setSimpleTrees` in world/simpleTrees.ts): geometries alone */
  simpleTrees: { high: false, medium: false, low: true, verylow: true },
  /** whether the sun's shadow is of what stands still alone, drawn only when that changes (`setSunShadowStill` in
   *  world/props.ts): its pass drew the whole biome again each time; the heroes and foes cast none by it then */
  stillSunShadow: { high: false, medium: false, low: false, verylow: true },
};

/** a level's settings, every one (each documented in `SETTINGS`) */
export type QualityPreset = { label: string } & {
  -readonly [K in keyof typeof SETTINGS]: (typeof SETTINGS)[K][QualityLevel];
};

// (Very low is below Low, for a device that still lags there: from play, "a very low graphics mode, even lower than
// low... all graphics reduced, effects that use less GPU processing"; the screen's pixels kept, as at every level)
const LABELS: Record<QualityLevel, string> = { high: 'High', medium: 'Medium', low: 'Low', verylow: 'Very low' };

export const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low', 'verylow'];

/** each level's preset, read from `SETTINGS` */
export const QUALITY = Object.fromEntries(QUALITY_ORDER.map((level) => [level, {
  label: LABELS[level],
  ...Object.fromEntries(Object.entries(SETTINGS).map(([name, each]) => [name, each[level]])),
}])) as Record<QualityLevel, QualityPreset>;

/**
 * Auto quality: a level down when the average FPS stays below `minFps` for `window` seconds (frames over 250 ms,
 * hitches, left out of it), the screen's own pixels kept at every level (from play, "I want to run the game at full
 * phone res, if we need to cut, we need to cut something else, not resolution"); or to Low at once after
 * `quickWindow` seconds whose middle frame is under `farBelow` of it (a hitch doesn't move the middle). A frame longer
 * than `longestFrame` s is no measure (a tab switch, a breakpoint). What the hardware holds is measured, never guessed
 * from the device or the OS's scaling. From play, a step at a time, 6 s each, a phone's first visit (Auto starting
 * from High) drew a few frames a second for half a minute ("insane slowdown when choosing a hero upon first entry
 * into the game, on phone"), and a laptop's integrated GPU switched to Auto ran at 5 frames a second "for the first
 * minute or two" (`npm run lab -- auto`: to Low in 3.4 s, where it holds 7.8 frames a second at its full 4.4 Mpx).
 * Where the GPU's own time a frame is known (a timer query), a window under the target whose GPU frames' middle is
 * within `gpuShare` of the target's frame steps nothing: the frames were slow on the CPU or the loading's side, which a
 * lower level doesn't help (from play, a 4070 Ti's trial of High left at 20 s with its GPU at 6 to 12 ms a frame,
 * trace P307-C0HE: "it sometimes settles on low/med on a powerful machine"). `gpuFrames` is the fewest of them that
 * judge. The level a step down left is tried again once after `retry` s of play: a hitch's drop comes back that visit.
 */
export const AUTO_QUALITY = {
  minFps: 50, window: 4, quickWindow: 1, farBelow: 0.5, settle: 2, longestFrame: 1, gpuShare: 0.8, gpuFrames: 8,
  retry: 30,
  // (the frame rate Auto holds: this share of the best the device shows, which is the lowest level's, read over
  // `probeWindows` quick windows there once every `probeDays` days and whenever Auto is at the bottom; 0 windows:
  // never read, `minFps` the target as it was)
  holdBest: 0.9, probeWindows: 2, probeDays: 7,
};
