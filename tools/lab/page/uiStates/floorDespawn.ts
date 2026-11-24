// `lab ui`'s `floorDespawn` state (`../uiKit.ts` `Steps`, #736: "Any items that remain uncollected for 2 minutes should
// automatically despawn. A small countdown timer should be displayed, showing how much time is left before the item
// disappears"): an item thrown on the lobby's floor, pictured with its name and its time left; its time read after a
// minute of the game (about 1:00 left) and after two (gone, the floor empty). The game's minutes are run at 20 frames
// a second (the lab's frame made that long: the game steps no frame longer). Its canary holds the floor's clock
// (`holdFloorClock`), the drop still there at the end.
import { G } from '../../../../src/state';
import { makeItem } from '../../../../src/loot/items';
import { LASTS, clearGround, groundDrops, holdFloorClock, throwItem } from '../../../../src/game/groundItems';
import { asked, plantsCaught } from '../uiKit';
import type { Found, Steps } from '../uiKit';
import type { Lab } from '../lab';

/** the frames a second the game's minutes run at here */
const FRAMES_A_SECOND = 20;
/** what a drop has left after a minute may be off by (s: a frame or two, the toss's) */
const SLACK = 1;
/** the canary's plant, named in the problem it must cause */
const PLANT = 'the floor\'s clock held';

let thrownLeft = 0;
let afterMinute = -1;
let afterTwo = -1;

/** `seconds` of the game run at `FRAMES_A_SECOND`. */
async function runFor(lab: Lab, seconds: number): Promise<void> {
  const clock = window.__labClock;
  const frame = clock.frame;
  clock.frame = 1000 / FRAMES_A_SECOND;
  try {
    await lab.step(Math.round(seconds * FRAMES_A_SECOND));
  } finally {
    clock.frame = frame;
  }
}

/** What the one drop on the floor has left (s), or -1 with none. */
const leftNow = (): number => groundDrops()[0]?.left ?? -1;

const STATE: Steps = {
  order: 117,
  async open(lab) {
    clearGround();
    holdFloorClock(asked.canary);
    throwItem(makeItem({ slot: 'ring', rarity: 'epic', ilvl: 12, cls: G.player.cls }));
    await lab.step(40);
    thrownLeft = leftNow();
  },
  close() {
    holdFloorClock(false);
    clearGround();
  },
  async check(_canary, lab): Promise<Found> {
    await runFor(lab, 60);
    afterMinute = leftNow();
    await runFor(lab, LASTS - 60 + 2);
    afterTwo = leftNow();
    const lines = [
      `  thrown: ${thrownLeft.toFixed(1)} s left; after a minute ${afterMinute.toFixed(1)}; after two `
        + `${afterTwo < 0 ? 'gone' : `${afterTwo.toFixed(1)} left`}`,
    ];
    const problems: string[] = [];
    if (thrownLeft < LASTS - 2 || thrownLeft > LASTS) problems.push(`floorDespawn: thrown with ${thrownLeft} s left`);
    if (Math.abs(afterMinute - (thrownLeft - 60)) > SLACK && !asked.canary) {
      problems.push(`floorDespawn: after a minute ${afterMinute.toFixed(1)} s left`);
    }
    if (afterTwo >= 0) problems.push(`floorDespawn: still on the floor after two minutes${asked.canary ? ` (${PLANT})` : ''}`);
    return { lines, problems };
  },
  canary: (found, state) => plantsCaught(found, state, [{ name: PLANT, what: PLANT }]),
};
export default STATE;
