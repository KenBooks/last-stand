// What the tavern's keeper costs a frame (`lab tavern`): his body's pose each frame (the gait, his arms reaching and
// kept off his body, his clothes), timed by the browser's own clock (`__labClock.realNow`: the lab's stands still within
// a frame), and the draws his mugs and he add to the room's frame, counted by the engine (the frame drawn with them, and
// again with them hidden). Said, not judged: a phone's cost is `lab perf`'s to play back.
import type { Lab } from './lab';
import type { Keeper } from '../../../src/entities/models/keeper';
import type { TavernKeeper } from '../../../src/world/tavernKeeper';
import { MUG_COUNT } from '../../../src/data/tavern';
import { countedFrame } from './villageHallCull';
import { G } from '../../../src/state';

/** His pose's times (ms), each frame's, as he works. */
export class PoseTimes {
  private readonly times: number[] = [];

  /** `keeper`'s pose timed from now on, every call */
  constructor(keeper: Keeper) {
    const pose = keeper.pose.bind(keeper);
    keeper.pose = (dt, p) => {
      const start = window.__labClock.realNow();
      pose(dt, p);
      this.times.push(window.__labClock.realNow() - start);
    };
  }

  said(): string {
    const sorted = [...this.times].sort((a, b) => a - b);
    if (!sorted.length) return 'his pose: never timed';
    const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))].toFixed(2);
    const mean = sorted.reduce((sum, t) => sum + t, 0) / sorted.length;
    return `his pose a frame (the browser's clock, this PC): ${mean.toFixed(2)} ms on average, ${at(0.5)} median, `
      + `${at(0.95)} at the 95th, ${sorted[sorted.length - 1].toFixed(2)} at most, over ${sorted.length} frames`;
  }
}

/** The room's frame drawn with his mugs and him, without the mugs, and without him too: the draws each adds. */
export function drawsSaid(lab: Lab, tv: TavernKeeper, keeper: Keeper, problems: string[]): string {
  if (G.arena.room !== 'tavern' || !keeper.root.visible) throw new Error('lab: tavern: costs require the keeper in the room');
  const mugs = Array.from({ length: MUG_COUNT }, (_, id) => tv.mugMesh(id));
  const shown = mugs.map((mug) => mug.visible);
  const whole = countedFrame(lab);
  try {
    for (const mug of mugs) mug.visible = false;
    const noMugs = countedFrame(lab);
    keeper.root.visible = false;
    const noKeeper = countedFrame(lab);
    const mugDraws = whole.draws - noMugs.draws;
    const keeperDraws = noMugs.draws - noKeeper.draws;
    if (mugDraws <= 0) problems.push('the sampled tavern frame did not draw any mugs');
    if (keeperDraws <= 0) problems.push('the sampled tavern frame did not draw the keeper');
    return `the room's frame: ${whole.draws} draws, ${whole.triangles} triangles; its mugs ${mugDraws} `
      + `draws and ${whole.triangles - noMugs.triangles} triangles of it, he ${keeperDraws} draws and `
      + `${noMugs.triangles - noKeeper.triangles} triangles`;
  } finally {
    keeper.root.visible = true;
    mugs.forEach((mug, index) => { mug.visible = shown[index]; });
  }
}
