// `lab hallnear`: the other heroes' warm-up as the hero comes near the village's hall on a lobby whose heroes are cold
// (a new deploy's: `--cold`). Asked for at once there, their programs compiled while the lobby drew, and a phone's
// village held frames of 280 to 320 ms walking on its square, every one in the scene's draw behind that compile (trace
// 476Y-88D5). Nearing the hall now begins it behind the lobby (`approach` in `game/warm.ts`), given up at a frame held
// past `WARM_BEHIND.heldMost` until something asks for the heroes. `held` counts every frame as held, as a phone's
// GPU holds them where the lab's never does: the warm-up must give up, compiling nothing after, and the heroes must
// not be asked for. Without it the heroes must be warm before long, behind the lobby. `canary` asks for the heroes as
// the game did, which must be caught.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import { HALL, TERRACE } from '../../../src/data/village';
import * as warm from '../../../src/game/warm';
import * as warmup from '../../../src/game/warmup';
import type { Need } from '../../../src/game/warm';
import { toLobby } from './hallMoves';

/** what `hallnear` takes */
export interface HallNearOptions {
  held: boolean;
  canary: boolean;
}

/** how far from the hall's door he's stood (m): well within the 22 m it's neared at, out on the square */
const FROM_DOOR = 12;
/** the frames given to the warm-up: held, to give up in; not held, to be warm in */
const HELD_FRAMES = 240;
const WARM_FRAMES = 3000;
/** the frames after a give-up over which nothing may compile, and the most programs made before it gives up */
const AFTER_FRAMES = 240;
const MOST_BEFORE_GIVING_UP = 24;

/** the warm-up's held-frame bound, read where the tree has it (an A/B's other commit may not) */
const warmBehind = (warmup as { WARM_BEHIND?: { heldMost: number; givenUp: Set<Need> } }).WARM_BEHIND;
/** whether something asked for the heroes, where the tree tells it */
const askedFor = (warm as { isAsked?: (need: Need) => boolean }).isAsked;

/** The programs made so far. */
function programsMade(): number {
  return G.renderer.info.programs?.length ?? 0;
}

/** A yes or a no. */
const yesNo = (value: boolean): string => (value ? 'yes' : 'no');

/** `need`'s share warmed, in percent. */
const percent = (need: Need): number => Math.round(warm.needShare(need) * 100);

/** `frames` frames stepped, the browser let go after each (a warm-up's links and tasks run on its time), until
 *  `done` says so; the frames stepped. */
async function stepUntil(lab: Lab, frames: number, done: () => boolean): Promise<number> {
  for (let frame = 0; frame < frames; frame++) {
    if (done()) return frame;
    await lab.step(1);
    await window.__labClock.realFrame();
  }
  return frames;
}

/** Him stood on the square `FROM_DOOR` from the hall's door, toward the square's middle; where, as a line. */
async function standNearHall(lab: Lab): Promise<string> {
  const door = new THREE.Vector3(TERRACE.x, 0, HALL.door);
  const away = new THREE.Vector3(0, 0, 0).sub(door).setY(0).normalize();
  G.player.walkTo = null;
  G.player.pos.copy(door).addScaledVector(away, FROM_DOOR);
  await lab.step(2);
  const at = G.player.pos;
  const fromDoor = Math.hypot(at.x - TERRACE.x, at.z - HALL.door);
  return `stood at ${at.x.toFixed(1)}, ${at.z.toFixed(1)}, ${fromDoor.toFixed(1)} m from the hall's door; `
    + `the mode ${G.mode}, a menu ${G.menuOpen ? 'open' : 'shut'}, the place ${G.arena.place}`;
}

/** Every frame held: the warm-up must give up, nothing compiled after it, the heroes not asked for. */
async function whileHeld(lab: Lab, isAsked: (need: Need) => boolean): Promise<Report> {
  const before = programsMade();
  const startShare = percent('heroes');
  await stepUntil(lab, HELD_FRAMES, () => false);
  const atGiveUp = programsMade();
  await stepUntil(lab, AFTER_FRAMES, () => warm.isWarm('heroes'));
  const after = programsMade() - atGiveUp;
  const madeFirst = atGiveUp - before;
  const text = `frames held: the heroes' warm-up ${startShare}% to ${percent('heroes')}%, `
    + `${madeFirst} programs made in its first ${HELD_FRAMES} frames, ${after} in the ${AFTER_FRAMES} after; `
    + `asked for: ${yesNo(isAsked('heroes'))}, warm: ${yesNo(warm.isWarm('heroes'))}`;
  const problems: string[] = [];
  if (isAsked('heroes')) problems.push('hallnear: nearing the hall asked for the heroes: compiled however held');
  if (after > 0) problems.push(`hallnear: ${after} programs made after the warm-up should have given up`);
  if (warm.isWarm('heroes')) problems.push('hallnear: the heroes warmed with every frame held');
  if (madeFirst > MOST_BEFORE_GIVING_UP) {
    problems.push(`hallnear: ${madeFirst} programs made before giving up (at most ${MOST_BEFORE_GIVING_UP})`);
  }
  return { text, problems };
}

/** No frame held: the heroes must be warm before long, asked for by nothing. */
async function whileSmooth(lab: Lab, isAsked: (need: Need) => boolean): Promise<Report> {
  const before = programsMade();
  const frames = await stepUntil(lab, WARM_FRAMES, () => warm.isWarm('heroes'));
  const text = `frames not held: the heroes ${percent('heroes')}% warm after ${frames} frames, `
    + `${programsMade() - before} programs made; asked for: ${yesNo(isAsked('heroes'))}`;
  if (warm.isWarm('heroes')) return { text, problems: [] };
  return { text, problems: [`hallnear: the heroes not warm after ${WARM_FRAMES} frames near the hall`] };
}

/** The heroes' warm-up as he nears the hall, frames held or not. */
export async function hallNear(lab: Lab, options: HallNearOptions): Promise<Report> {
  if (!warmBehind || !askedFor) {
    return { text: 'this tree asks for the heroes outright as he nears the hall: nothing to measure', problems: [] };
  }
  if (warm.isWarm('heroes')) {
    return { text: '', problems: ['hallnear: the heroes are warm already: boot it --cold, as a new deploy is'] };
  }
  const givenUp = [...warmBehind.givenUp].join(', ') || 'none';
  const lines = [`at the start: given up behind the lobby: ${givenUp}; the fight `
    + `${warm.isWarm('fight') ? 'warm' : 'cold'}`];
  const heldMost = warmBehind.heldMost;
  const drawing = lab.drawing;
  lab.drawing = true;
  let measured: Report;
  try {
    // (the set-up's run left for the village: the hall is neared only on its square, `villageActive` in main.ts)
    if (G.mode !== 'menu') await toLobby(lab);
    // (held, every frame counts; not held, none does: the lab's own gaps between its frames, the browser let go for
    // the warm-up's links, aren't a player's frames held)
    warmBehind.heldMost = options.held ? 0 : Infinity;
    // (the lab's boot gives every warm-up up by its own gaps between frames: each is begun afresh here)
    warmBehind.givenUp.clear();
    lines.push(await standNearHall(lab));
    if (options.canary) warm.want('heroes');
    measured = options.held ? await whileHeld(lab, askedFor) : await whileSmooth(lab, askedFor);
  } finally {
    warmBehind.heldMost = heldMost;
    lab.drawing = drawing;
  }
  lines.push(measured.text);
  if (!options.canary) return { text: lines.join('\n'), problems: measured.problems };
  const caught = measured.problems.length > 0;
  lines.push(`canary: the heroes asked for as he nears the hall: ${caught ? 'caught' : 'missed'}`);
  return { text: lines.join('\n'), problems: caught ? [] : ['hallnear: the canary went unseen'] };
}
