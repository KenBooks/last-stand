// The game's particles handed to the engine as sprites each frame: the pools blended by their alpha (with the dazed
// foes' stars), then those added.
import { particles } from '../fx/particles';
import { dazedDrawn } from '../fx/dazed';
import type { Core } from './core';

export class Sprites {
  private runs = [new Float32Array(0), new Float32Array(0)];

  constructor(private core: Core) {}

  /** The particles' pools as the engine's sprites: those blended by their alpha, then those added. */
  send(): void {
    const pools = [particles.smoke, particles.glow];
    // (the dazed foes' stars with those blended: a sprite of a width below 0 is a star)
    const stars = dazedDrawn();
    const runs = pools.map((pool, slot) => {
      // (a pool hidden draws nothing, as three drew it: the game hides an empty one, a harness one it takes out)
      const count = pool?.points.visible === false ? 0 : pool?.count ?? 0;
      const extra = slot === 0 ? stars.count : 0;
      if (this.runs[slot].length < (count + extra) * 8) this.runs[slot] = new Float32Array((count + extra) * 16);
      const run = this.runs[slot];
      for (let star = 0; star < extra; star++) {
        const at = (count + star) * 8;
        run[at] = stars.pos[star * 3]; run[at + 1] = stars.pos[star * 3 + 1]; run[at + 2] = stars.pos[star * 3 + 2];
        run[at + 3] = -stars.size[star];
        run[at + 4] = stars.fill.r; run[at + 5] = stars.fill.g; run[at + 6] = stars.fill.b;
        run[at + 7] = stars.alpha[star];
      }
      for (let i = 0; i < count; i++) {
        const at = i * 8;
        run[at] = pool.pos[i * 3]; run[at + 1] = pool.pos[i * 3 + 1]; run[at + 2] = pool.pos[i * 3 + 2];
        run[at + 3] = pool.size[i];
        run[at + 4] = pool.col[i * 4]; run[at + 5] = pool.col[i * 4 + 1]; run[at + 6] = pool.col[i * 4 + 2];
        run[at + 7] = pool.col[i * 4 + 3];
      }
      return run.subarray(0, (count + extra) * 8);
    });
    this.core.engine.set_sprites(runs[0], runs[1]);
    this.core.freshViews();
  }
}
