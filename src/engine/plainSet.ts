// Which making of the lit shaders the scene is drawn with, the plain levels' own or the whole one (Bulwark's
// `set_plain_only`), switched without a draw left out. The engine makes every pipeline it has met again for the
// other making as it's switched, each compiled aside with its draws left out until it's ready: a level change from
// Medium to Low made 72 at once, which a phone takes seconds over, the village's ground and walls missing meanwhile.
// Under the loading screens the switch is made at once (they wait for what it makes); in play the other making's
// pipelines are first made aside, the engine switched there and straight back in one go, the scene drawn on by the
// making in use until each is ready, and only then switched for good. Switching to a making already made makes none.
import { PIPELINES, pipelinesOf } from './pipelinesAside';
import type { Core } from './core';

export class PlainSet {
  /** the making the scene is drawn with */
  private drawn = false;
  /** the making wanted while the other is drawn, and whether its pipelines are all made */
  private pending: { want: boolean; ready: () => boolean } | null = null;

  constructor(private readonly core: Core) {}

  /** whether a switch waits on its pipelines: the frames are still the making's before (Auto judges none of them) */
  get switching(): boolean { return this.pending !== null; }

  /** The making the frame asks for (`plain`: the plain levels' own), switched to as soon as it draws whole. */
  tell(plain: boolean): void {
    if (plain === this.drawn) {
      this.pending = null;
      return;
    }
    // (under the loading screens, what it makes is waited for there)
    if (PIPELINES.waitLeft !== Infinity) return this.switchTo(plain);
    if (this.pending?.want !== plain) this.pending = { want: plain, ready: this.makeAside(plain) };
    if (this.pending.ready()) this.switchTo(plain);
  }

  /** The making `plain` told ahead of the frame that would say so, as the samples are (`rustPlain`): a boot at a
   *  plain level makes the plain one's pipelines alone. Under the loading screens alone: in play the frame's own
   *  `tell` makes them aside first. Switched at once in play, every draw of the making was left out until its
   *  pipeline compiled: Auto stepping Low to Medium drew the village grey for seconds (ZSW4-FVNM). */
  ahead(plain: boolean): void {
    if (plain !== this.drawn && PIPELINES.waitLeft !== Infinity) this.switchTo(plain);
  }

  /** The making `plain` switched to, and back at once: its pipelines asked for, the scene drawn on as it was. */
  private makeAside(plain: boolean): () => boolean {
    const engine = this.core.engine;
    return pipelinesOf(() => {
      engine.set_plain_only(plain);
      engine.set_plain_only(this.drawn);
    });
  }

  private switchTo(plain: boolean): void {
    this.core.engine.set_plain_only(plain);
    this.drawn = plain;
    this.pending = null;
  }
}
