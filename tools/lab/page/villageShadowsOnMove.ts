// `lab village --only shadowsOnMove`: Low's kept shadow maps drawn over by what moves only on frames it moved
// (`world/shadowsOnMove.ts`; from play, an S25 Edge's Profile at full res: the shadow maps 8 ms of an 80 ms frame). On
// Low, by midnight (the lamps cast) and noon (the sun), over the shoulder: with him standing, the frames that drew the
// movers again (at most a fifth) and what moved a step; walking, the frames that didn't (at most a tenth); and stood
// again, the frame drawn as the maps were left against drawn with the movers drawn again, at one moment (at most 0.75%
// of it changed: a shadow left where he was would show), both pictured, no program compiled. `canary` draws the
// movers every frame for the counts, and never for the frame, both of which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera } from '../../../src/core/renderer';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { groundHeight } from '../../../src/world/ground';
import {
  holdShadowsOnMove, markMovers, moversMarkedMoved, resetShadowsCount, shadowsCount,
} from '../../../src/world/shadowsOnMove';
import type { Spot } from '../../../src/data/village';
import { drawFrame } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle after a move or a switch, and the frames counted standing and walking */
const SETTLE = 30;
const COUNTED = 60;
/** the hours read: the lamps casting, and the sun */
const HOURS = [0, 12];
/** where he stands, and where he walks to from there */
const STAND: Spot = [2, 3];
const WALK_TO: Spot = [-4, 4];
/** the most of the frames standing that may draw the movers, and of those walking that may not */
const MOST_DRAWN_STANDING = 0.2;
const MOST_LEFT_WALKING = 0.1;
/** the most of the frame that may differ between the maps as left and drawn again: a body's sway under a step
 *  (`STEP` in shadowsOnMove.ts) left in them, 0.30% and 0.35% (a shadow left where he stood, the canary's: 1.2 to
 *  2.7%) */
const MOST_CHANGED = 0.0075;

/** A share as a percentage. */
const percent = (share: number, digits = 0): string => `${(share * 100).toFixed(digits)}%`;

/** A spot on the ground. */
const onGround = ([x, z]: Spot): THREE.Vector3 => new THREE.Vector3(x, groundHeight(x, z), z);

/** He stood at `STAND`, still. */
function standHim(): void {
  G.player.walkTo = null;
  G.player.place(onGround(STAND), Math.PI);
}

/** The share of `frames` frames that drew the movers again, from now. */
async function drawnShare(lab: Lab, frames: number): Promise<number> {
  resetShadowsCount();
  await lab.step(frames);
  const { drawn, skipped } = shadowsCount();
  if (drawn + skipped === 0) throw new Error('lab: village: no frame asked whether to draw the shadows\' movers');
  return drawn / (drawn + skipped);
}

/** What one hour read: the shares drawn standing and walking, what moved standing, the frame changed, the programs
 *  compiled, and the frame as left and drawn again pictured. */
interface HourRead {
  standing: number;
  walking: number;
  swayed: string[];
  changed: number;
  made: number;
  moments: Pictured[];
}

/** One hour read on Low (`canary`: drawn every frame for the counts, never for the frame). */
async function readHour(lab: Lab, hour: number, canary: boolean): Promise<HourRead> {
  const before = G.renderer.info.programs?.length ?? 0;
  holdHour(hour);
  standHim();
  faceCamera(Math.PI);
  holdShadowsOnMove(canary ? 'every' : 'level');
  await lab.step(SETTLE);
  markMovers();
  const standing = await drawnShare(lab, COUNTED);
  const swayed = moversMarkedMoved();
  G.player.walkTo = onGround(WALK_TO);
  const walking = await drawnShare(lab, COUNTED);
  // (stood again, for the frame: walked away and back, a shadow left where he was would show)
  standHim();
  holdShadowsOnMove(canary ? 'never' : 'level');
  await lab.step(SETTLE);
  const left = drawFrame(lab);
  const moments = canary ? [] : [await lab.screen(`hour ${hour}: Low, the shadows as left`, [])];
  holdShadowsOnMove('every');
  const drawnAgain = drawFrame(lab);
  if (!canary) moments.push(await lab.screen(`hour ${hour}: Low, the shadows drawn again`, []));
  holdShadowsOnMove('level');
  const made = (G.renderer.info.programs?.length ?? 0) - before;
  return { standing, walking, swayed, changed: changedShare(left, drawnAgain), made, moments };
}

/** Low's shadows drawn over by what moves on its moves alone, by midnight and noon. */
export async function shadowsOnMove(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = qualityLevel();
  useQuality('low');
  await viewBy(lab, 'third');
  let countsCaught = false;
  let frameCaught = false;
  // (each frame drawn as the game draws it: the lab skips the draws of the frames it steps, and with them the maps')
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (const hour of HOURS) {
      const read = await readHour(lab, hour, canary);
      const swayed = [...new Set(read.swayed)].join(', ') || 'nothing';
      lines.push(`hour ${hour}: the movers drawn again in ${percent(read.standing)} of the frames standing`
        + ` (moved a step: ${swayed}), ${percent(read.walking)} walking; stood again,`
        + ` the frame as left against drawn again changed ${percent(read.changed, 2)}; ${read.made} programs compiled`);
      moments.push(...read.moments);
      const tooMany = read.standing > MOST_DRAWN_STANDING;
      countsCaught ||= tooMany;
      frameCaught ||= read.changed > MOST_CHANGED;
      if (canary) continue;
      if (tooMany) problems.push(`shadowsOnMove: hour ${hour}: drawn again in ${percent(read.standing)} standing`);
      if (1 - read.walking > MOST_LEFT_WALKING) {
        problems.push(`shadowsOnMove: hour ${hour}: left in ${percent(1 - read.walking)} of the frames walking`);
      }
      if (read.changed > MOST_CHANGED) {
        problems.push(`shadowsOnMove: hour ${hour}: the frame as left changed ${percent(read.changed, 2)}`);
      }
      if (read.made) problems.push(`shadowsOnMove: hour ${hour}: ${read.made} programs compiled`);
    }
  } finally {
    lab.drawing = drawing;
    holdShadowsOnMove('level');
    useQuality(was);
    holdHour(null);
    await viewBy(lab, 'top');
  }
  return { lines, problems, caught: canary ? countsCaught && frameCaught : null, moments };
}
