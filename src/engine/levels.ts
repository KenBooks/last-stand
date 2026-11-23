// What the game's quality level and a profile's switches ask of the engine, told when they change: the samples a
// pixel and the sun's map, the bloom and its share of the scene's pixels, the sun's shadow held between its turns,
// the scene's depth drawn first; and the engine's GPU clock, which a profile asks. Each is the engine's own
// setting, none a number of the frame's globals.
import { PIPELINES } from './pipelinesAside';
import type { Core } from './core';
import { TUNE, type Grade } from './globals';
import { PlainSet } from './plainSet';
import { SightFog } from './sightFog';

export class Levels {
  private samples = 4;
  private shadowSize = 2048;
  private bloom = true;
  private bloomShare = 1;
  /** the share the engine was last told (the level's, by a dense screen's) */
  private bloomSent = 1;
  /** whether the game left the sun's shadow out of the frame last drawn (a harness reads it) */
  shadowHeld = false;

  /** the fog over what the hero can't see, told with the frame's settings (`sightFog.ts`) */
  private readonly sight: SightFog;
  /** which making of the lit shaders draws the scene, switched with nothing left out (`plainSet.ts`) */
  private readonly plain: PlainSet;

  constructor(private readonly core: Core) {
    this.sight = new SightFog(core);
    this.plain = new PlainSet(core);
    // (ahead of the warm-ups: a material readied then is given the pipelines of the frame's two passes)
    core.engine.set_depth_first(TUNE.depthFirst > 0 && !PIPELINES.depthRefused);
  }

  /** The GPU's clock asked, with no frame drawn: how many frames' times have come back, whether one is on its
   *  way, and the last (ms). A profile of the frame waits on it between its frames (perf/profiler.ts). */
  gpuClock(): { reads: number; busy: boolean; ms: number } {
    this.core.engine.poll_clock();
    const stats = this.core.engine.stats();
    return { reads: stats[6], busy: stats[7] > 0, ms: stats[5] };
  }

  /** The frames broken down by their parts from now on, or drawn as they are (Bulwark gpu/parts.rs): a
   *  profile's. A frame broken down isn't timed whole: `gpuClock` stays the last whole frame's. */
  setBreakdown(on: boolean): void { this.core.engine.set_breakdown(on); }

  /** The parts' names, in the order `breakdown` has their times. */
  breakdownNames(): string[] { return this.core.engine.breakdown_names().split('\n'); }

  /** Each part's time in the last frame broken down whose stamps have come back (ms), the passes it was stamped in, how many
   *  have, and whether one's are on their way; asked with no frame drawn. */
  breakdown(): { ms: number[]; passes: number; reads: number; busy: boolean } {
    const told = Array.from(this.core.engine.breakdown());
    const [passes, reads, busy] = told.slice(-3);
    return { ms: told.slice(0, -3), passes, reads, busy: busy > 0 };
  }

  /** The last frame broken down's parts' times by each shader of the page's that drew in them: the part's place
   *  among `breakdownNames`, the shader's id, its time (ms). */
  breakdownByShader(): { part: number; shader: number; ms: number }[] {
    const told = this.core.engine.breakdown_by_shader();
    const rows: { part: number; shader: number; ms: number }[] = [];
    for (let at = 0; at + 2 < told.length; at += 3) rows.push({ part: told[at], shader: told[at + 1], ms: told[at + 2] });
    return rows;
  }

  /** The engine told the quality level's samples and shadow map, when they change: it drew 4 samples a pixel
   *  and a map of 2048 at every level, a phone's Very low among them (26 ms a frame on its GPU, from play). */
  private quality(samples: number, shadowSize: number): void {
    if (samples === this.samples && shadowSize === this.shadowSize) return;
    this.samples = samples;
    this.shadowSize = shadowSize;
    this.core.engine.set_quality(samples, shadowSize);
    this.core.freshViews();
  }

  /** The samples the scene is drawn with, told ahead of the frame that would say so (`rustSamples`). */
  samplesAhead(samples: number): void {
    this.quality(samples, this.shadowSize);
  }

  /** The plain levels' lit shaders, or the whole ones, told ahead of the frame that would say so (`rustPlain`). */
  plainAhead(lite: boolean): void {
    this.plain.ahead(plainWanted(lite));
  }

  /** whether a switch of the lit shaders' making waits on its pipelines (Auto judges none of its frames) */
  get plainSwitching(): boolean { return this.plain.switching; }

  /** A harness's: the samples and the shadow map's side the engine draws with, and the level's bloom. */
  now(): { samples: number; shadowSize: number; bloomShare: number } {
    return { samples: this.samples, shadowSize: this.shadowSize, bloomShare: this.bloomShare };
  }

  /** A frame's settings told, as its `grade` and the sun's map (`shadowSize`, a side) have them. */
  tell(grade: Grade, shadowSize: number): void {
    const engine = this.core.engine;
    this.quality(grade.samples ?? 4, shadowSize);
    if ((TUNE.bloom > 0) !== this.bloom) engine.set_bloom(this.bloom = TUNE.bloom > 0);
    this.shadowHeld = !!grade.shadowHeld;
    engine.hold_shadow(this.shadowHeld && TUNE.shadowTurns > 0);
    engine.set_depth_first(TUNE.depthFirst > 0 && !PIPELINES.depthRefused);
    engine.set_fields_first(TUNE.fieldsFirst > 0);
    this.plain.tell(plainWanted(!!grade.lite));
    engine.set_fields_placed(TUNE.fieldsPlaced > 0);
    // (on a dense screen, three device pixels or more to a CSS one, the bloom at half its level's share: a glow is
    // a blur, and its first level was 1560 by 720 on a phone, 2.4 ms of its 18 ms frame at Medium, PSHZ-JAWP)
    const share = grade.bloomShare ?? 1, dense = window.devicePixelRatio >= 3 ? TUNE.bloomDense : 1;
    if (share * dense !== this.bloomSent) engine.set_bloom_share(this.bloomSent = share * dense);
    this.bloomShare = share;
    this.sight.tell(!!grade.lite);
  }
}

/** whether the scene is drawn by the lit shaders made for the plain levels at a level `lite` or not (2: at every
 *  level, the canary of `lab rustcheck`'s check of them) */
const plainWanted = (lite: boolean): boolean => TUNE.plainShader > 1 || (lite && TUNE.plainShader > 0);
