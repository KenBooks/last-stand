// What's left queued behind the lobby (game/behind.ts) as `lab behind` and `lab village`'s building measures read it:
// the heroes' builds, counted in frames, and the guide's pictures queued after them, which wait on the browser's own
// compiles and so are waited for by its clock. Counted in frames with the heroes, the lent 4080 laptop's slower
// compiles ran the frames out with only the guide's pictures left ("still building", the heroes long built).
import * as behind from '../../../src/game/behind';

/** the guide's pictures' job (`JOB` in ui/guide/portraits.ts) */
const GUIDE_JOB = 'guide portraits';
/** the most the guide's pictures are waited for once the heroes are built (ms, the browser's clock): their compiles
 *  took up to 9.5 s on this PC, below normal priority */
export const GUIDE_WAIT_MS = 60000;
/** the least the heroes' builds are given (ms, the browser's clock), past their frames: a slow piece is paid back
 *  over the frames after it (`owed` in game/behind.ts), so a loaded machine takes more frames (the village's 8
 *  shards side by side on the lent laptop: the hall's mage still building after 1500) */
const HEROES_WAIT_MS = 45000;

/** Whether anything but the guide's pictures is queued. */
export const heroesQueued = (): boolean => behind.queuedBehind().some((job) => !job.startsWith(GUIDE_JOB));

/** A wait for the building: the heroes' within `mostFrames` (or `HEROES_WAIT_MS`, whichever is later), then the
 *  guide's within `GUIDE_WAIT_MS` of their end. */
export class BuildingWait {
  private guideUntil = Infinity;
  private readonly heroesUntil: number;

  constructor(private readonly mostFrames: number, private readonly realNow: () => number) {
    this.heroesUntil = realNow() + HEROES_WAIT_MS;
  }

  /** Whether to run another frame, `frames` run so far. */
  more(frames: number): boolean {
    if (frames > 0 && !behind.buildingBehind()) return false;
    if (heroesQueued()) return frames < this.mostFrames || this.realNow() < this.heroesUntil;
    if (this.guideUntil === Infinity) this.guideUntil = this.realNow() + GUIDE_WAIT_MS;
    return this.realNow() < this.guideUntil;
  }

  /** What's still queued, said for a failure: the heroes' builds past their frames, or the guide's past its wait. */
  left(): string {
    const queued = behind.queuedBehind().join('; ');
    if (heroesQueued()) {
      return `still building after ${this.mostFrames} frames and ${HEROES_WAIT_MS / 1000} s: ${queued}`;
    }
    return `the guide's pictures still building ${GUIDE_WAIT_MS / 1000} s after the heroes: ${queued}`;
  }
}
