// `lab behind`: the heroes built behind the lobby a piece a frame (game/behind.ts; from play: "keep loading the game
// in the background, as long as it does not slow down the player, so avoid all the loading bars later"). The hall's
// heroes and the spares let go, then built again behind the live lobby, each frame's building timed by the browser's
// own clock; then the hall opened and another hero chosen, which must build no hero. `canary` builds them all in one
// frame and lets the spares go before the choice.
import { realWait, type Lab, type Report } from './lab';
import { G } from '../../../src/state';
import { Player, heroLights } from '../../../src/entities/player';
import { CLASS_IDS } from '../../../src/data/classes/index';
import * as behind from '../../../src/game/behind';
import * as hall from '../../../src/game/hall';
import { perfClock } from '../../../src/ui/perfHud';
import { openHall, toLobby } from './hallMoves';
import { headsMadeHere } from '../../../src/entities/models/head';
import { setQuality } from '../../../src/core/quality';

/** Options of `lab behind`. */
export interface BehindOptions {
  /** plant faults the measure must catch: everything built in one frame, and the spares let go before the choice */
  canary?: boolean;
}

/** the most a frame's building may take (ms): its pieces take 1 to 10 ms on the owner's PC, the coat's cut the longest
 *  (`tunicCut`, one call), and now and then a collection's pause lands in one; a hero built whole took 100 to 170 */
const MOST_MS = 30;
/** the frames the building may take at most (20 s at 60 frames a second: a long piece is paid back over the frames
 *  after it, `owed` in game/behind.ts) */
const MOST_FRAMES = 1200;
/** the frames the lobby and the hall are left to settle */
const SETTLE = 60;
/** the slowest pieces listed */
const SLOWEST_LISTED = 8;

/** The browser's own clock (the page's `performance.now` is the lab's, which stands still within a frame). */
function realNow(): number {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  return clock.realNow();
}

/** What the frames building behind the lobby took. */
interface Building {
  frames: number;
  pieces: number;
  /** the heroes built */
  heroes: number;
  /** the longest frame's building (ms) */
  longest: number;
  /** the slowest pieces, each as `behindFrame` names it, with its time (ms) */
  slowest: { name: string; ms: number }[];
}

/** Frames run until nothing is building behind the lobby, each frame's building read as `perfClock` timed it. */
async function frameByFrame(lab: Lab): Promise<Building> {
  const building: Building = { frames: 0, pieces: 0, heroes: 0, longest: 0, slowest: [] };
  const before = Player.built;
  while (building.frames < MOST_FRAMES && (building.frames === 0 || behind.buildingBehind())) {
    await lab.step(1);
    // Workers use the browser's real clock; advancing 1200 parked frames must not starve their replies.
    if (!behind.behindFrame.pieces) await realWait(5);
    building.frames++;
    building.pieces += behind.behindFrame.pieces;
    building.longest = Math.max(building.longest, behind.behindFrame.ms);
    building.slowest.push({ name: behind.behindFrame.slowest, ms: behind.behindFrame.longest });
  }
  if (behind.buildingBehind()) throw new Error(`lab: behind: still building after ${MOST_FRAMES} frames`);
  building.heroes = Player.built - before;
  building.slowest = building.slowest.sort((a, b) => b.ms - a.ms).slice(0, SLOWEST_LISTED);
  return building;
}

/** The heroes let go and built again behind the lobby, timed by the browser's clock (`canary`: all in one frame). */
async function builtAgain(lab: Lab, canary: boolean): Promise<Building> {
  const { ms, most } = behind.BEHIND;
  const now = perfClock.now;
  perfClock.now = realNow;
  hall.queueHallBehind();
  for (const id of CLASS_IDS) behind.finishNow(`spare ${id}`);
  hall.dropHeroesBuilt();
  const lights = heroLights();
  if (lights.staff.parent !== G.scene || lights.hand.parent !== G.scene) {
    throw new Error('lab: behind: disposing cached spares detached the active hero lights');
  }
  if (canary) Object.assign(behind.BEHIND, { ms: Infinity, most: Infinity });
  try {
    return await frameByFrame(lab);
  } finally {
    perfClock.now = now;
    Object.assign(behind.BEHIND, { ms, most });
  }
}

/** The heroes built by the hall's opening and by another hero chosen there (`canary`: the spares let go first). */
async function builtByChoosing(
  lab: Lab, canary: boolean,
): Promise<{ opening: number; choosing: number; programs: number }> {
  const was = G.player.cls.id;
  const before = Player.built;
  await openHall(lab);
  await lab.step(SETTLE);
  const opening = Player.built - before;
  // (it opens on the lobby's own hero: stepped along until it's another's)
  while (document.querySelector('#heroes .hs-choose')?.textContent?.startsWith('Stay')) {
    await lab.step(1, () => ({ keys: ['arrowright'] }));
    await lab.step(SETTLE);
  }
  const chose = Player.built;
  if (canary) hall.dropSpareHeroes();
  const lights = heroLights();
  const compiled = G.renderer.info.programs!.length;
  // (the choice's frame and the next: after it the old class's spare is built behind the lobby, a piece a frame)
  await lab.step(2, (frame) => ({ keys: frame === 0 ? ['enter'] : [] }));
  const choosing = Player.built - chose;
  if (lights.staff.parent !== G.scene || lights.hand.parent !== G.scene) {
    throw new Error('lab: behind: choosing a cached hero detached the shared lights and changed shader variants');
  }
  await lab.step(SETTLE);
  if (hall.hallOpen()) throw new Error('lab: behind: Enter never chose a hero');
  if (G.player.cls.id === was) throw new Error('lab: behind: the hero chosen was the one he was');
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(1);
  } finally {
    lab.drawing = drawing;
  }
  return { opening, choosing, programs: G.renderer.info.programs!.length - compiled };
}

/** Auto can change detail with the hall open. Back alone must not sculpt the new detail on the input thread. */
async function afterDetailChange(lab: Lab, canary: boolean): Promise<{ misses: number; building: Building }> {
  await openHall(lab);
  setQuality('medium');
  hall.dropSpareHeroes();
  const before = headsMadeHere();
  const now = perfClock.now;
  perfClock.now = realNow;
  try {
    await lab.clickOn(document.querySelector<HTMLElement>('.hs-back')!);
    await lab.step(1);
    if (hall.hallOpen()) throw new Error('lab: behind: Back never left hero selection');
    if (canary) for (const id of CLASS_IDS) behind.finishNow(`spare ${id}`);
    const building = await frameByFrame(lab);
    // Repeat the opening after its cached hall heroes became stale too.
    await openHall(lab);
    await lab.clickOn(document.querySelector<HTMLElement>('.hs-back')!);
    await lab.step(1);
    return { misses: headsMadeHere() - before, building };
  } finally { perfClock.now = now; }
}

/** `lab behind`'s report. */
export async function heroesBehind(lab: Lab, options: BehindOptions): Promise<Report> {
  const canary = Boolean(options.canary);
  await toLobby(lab);
  // (a run left by the pause menu may leave the lobby paused: nothing of the game's frame runs till it's closed)
  if (G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(SETTLE);
  if (G.paused) throw new Error('lab: behind: the lobby stayed paused');
  const building = await builtAgain(lab, canary);
  const heroes = CLASS_IDS.length * 2 - 1;
  if (building.heroes !== heroes) {
    throw new Error(`lab: behind: ${building.heroes} heroes were built behind the lobby, not ${heroes}`);
  }
  const { opening, choosing, programs } = await builtByChoosing(lab, canary);
  const changed = await afterDetailChange(lab, canary);
  const slowest = building.slowest.map((s) => `${s.name} ${s.ms.toFixed(1)} ms`).join(', ');
  const lines = [
    `${heroes} heroes built behind the lobby in ${building.frames} frames, ${building.pieces} pieces: the longest `
      + `frame's building ${building.longest.toFixed(1)} ms (at most ${MOST_MS})`,
    `the slowest pieces: ${slowest}`,
    `then the hall's opening built ${opening} heroes, the ${G.player.cls.id} chosen in it ${choosing}`,
    `shared hero lights stayed in the scene; the first lobby draw compiled ${programs} programs`,
    `Back after a detail change: ${changed.misses} head pieces sculpted on the input thread; `
      + `longest background build ${changed.building.longest.toFixed(1)} ms (at most ${MOST_MS}); repeated opening completed`,
  ];
  const slow = building.longest > MOST_MS;
  const builtThen = opening + choosing > 0;
  if (canary) {
    const missed = [slow ? '' : 'the building in one frame was missed', builtThen ? '' : 'the lost spare was missed',
      changed.misses ? '' : 'the missing worker detail was missed'];
    return { text: [...lines, 'canary: one frame and the spares let go'].join('\n'), problems: missed.filter(Boolean) };
  }
  const problems = [slow ? lines[0] : '', builtThen ? lines[2] : '', programs ? lines[3] : '',
    changed.misses || changed.building.longest > MOST_MS ? lines[4] : ''].filter(Boolean);
  return { text: lines.join('\n'), problems };
}
