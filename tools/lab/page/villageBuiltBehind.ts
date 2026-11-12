// `lab village`'s heroes built behind the lobby (from play: "keep loading the game in the background, as long as it
// does not slow down the player"): the hall's heroes and the spares let go, then built again behind the live lobby a
// piece a frame (`buildBehind` in game/behind.ts), each frame's building timed by the browser's own clock. `canary`
// builds them all in one frame, as they were built before the lobby showed.
import type { Lab } from './lab';
import * as hall from '../../../src/game/hall';
import * as behind from '../../../src/game/behind';
import { G } from '../../../src/state';
import { Player } from '../../../src/entities/player';
import { perfClock } from '../../../src/ui/perfHud';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { toLobby } from './hallMoves';
import type { LightsChecked } from './villageLights';

/** the most a frame's building may take (ms): its pieces take 1 to 10 ms on the owner's PC, the coat's cut the longest
 *  (`tunicCut`, one call), and now and then a collection's pause lands in one; a hero built whole took 100 to 170 */
const MOST_MS = 30;
/** the frames the building may take at most (at 60 frames a second, 10 s: the hall is a walk away from the start) */
// (five heroes took 780 frames on a lent laptop held to 86% of its clock, each piece timed by the browser's clock:
// at 600 the two spares were never reached, and it read as 3 heroes built for 5)
const MOST_FRAMES = 1500;
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
  /** the longest frame's building and its longest piece (ms) */
  longest: number;
  piece: number;
  /** the slowest pieces, each as `behind.behindFrame` names it, with its time (ms) */
  slowest: { name: string; ms: number }[];
  done: boolean;
  /** each frame a hero was built in, and the piece named slowest there (the build's, if it was behind the lobby) */
  made: string[];
}

/** Frames run until nothing is building behind the lobby, each frame's building read as `perfClock` timed it. */
async function frameByFrame(lab: Lab): Promise<Building> {
  const building: Building = { frames: 0, pieces: 0, longest: 0, piece: 0, slowest: [], done: false, made: [] };
  while (building.frames < MOST_FRAMES && (building.frames === 0 || behind.buildingBehind())) {
    const was = Player.built;
    await lab.step(1);
    const piece = behind.behindFrame.slowest || 'not behind';
    if (Player.built > was) building.made.push(`frame ${building.frames}: ${piece}`);
    building.frames++;
    building.pieces += behind.behindFrame.pieces;
    building.longest = Math.max(building.longest, behind.behindFrame.ms);
    building.piece = Math.max(building.piece, behind.behindFrame.longest);
    building.slowest.push({ name: behind.behindFrame.slowest, ms: behind.behindFrame.longest });
  }
  building.slowest = building.slowest.sort((a, b) => b.ms - a.ms).slice(0, SLOWEST_LISTED);
  building.done = !behind.buildingBehind();
  return building;
}

/** The hall's heroes and the spares built again behind the lobby: no frame's building past `MOST_MS`, all built
 *  within `MOST_FRAMES`. `canary` lets every piece be built in one frame. */
export async function hallBuiltBehind(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await toLobby(lab);
  // (the run left by the pause menu leaves the lobby paused: nothing of the game's frame runs till it's closed)
  if (G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(2);
  if (G.paused) throw new Error('lab: village: the lobby stayed paused');
  const { ms, most } = behind.BEHIND;
  const now = perfClock.now;
  perfClock.now = realNow;
  // (what's building now built first: a spare begun before this is a hero made before the count, and the spares
  // then counted two short, 3 heroes built for 5, whenever the checks before left one building)
  for (const id of CLASS_IDS) {
    behind.finishNow(`hall ${id}`);
    behind.finishNow(`spare ${id}`);
  }
  hall.dropHeroesBuilt();
  if (canary) Object.assign(behind.BEHIND, { ms: Infinity, most: Infinity });
  let building: Building;
  let built = 0;
  try {
    const before = Player.built;
    building = await frameByFrame(lab);
    built = Player.built - before;
  } finally {
    perfClock.now = now;
    Object.assign(behind.BEHIND, { ms, most });
  }
  const heroes = CLASS_IDS.length * 2 - 1;
  if (!building!.done) throw new Error(`lab: village: still building behind the lobby after ${MOST_FRAMES} frames`);
  if (built !== heroes) {
    const state = `${G.mode} ${G.arena.place}, the hall ${G.arena.hallShown ? 'shown' : 'not shown'}`;
    const made = building!.made.join('; ');
    throw new Error(`lab: village: ${built} heroes were built behind the lobby, not ${heroes} (${state}): ${made}`);
  }
  const line = `${heroes} heroes built behind the lobby in ${building.frames} frames, ${building.pieces} pieces: `
    + `the longest frame's building ${building.longest.toFixed(1)} ms (at most ${MOST_MS}), `
    + `its longest piece ${building.piece.toFixed(1)} ms`;
  const slowest = building.slowest.map((s) => `${s.name} ${s.ms.toFixed(1)} ms`).join(', ');
  const problems: string[] = [];
  if (!building.done) problems.push(`still building after ${MOST_FRAMES} frames`);
  if (building.longest > MOST_MS) problems.push(line);
  if (canary) return { lines: [line], problems: [], caught: building.longest > MOST_MS, moments: [] };
  return { lines: [line, `the slowest pieces: ${slowest}`], problems, caught: null, moments: [] };
}
