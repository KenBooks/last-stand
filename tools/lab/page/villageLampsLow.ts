// `lab village --only lampsOnLow`: the village's lamps as Low lights them against High, by midnight on the square
// (from play, an S25 Edge's Profile at full res: the lamps 5.5 ms of an 80 ms frame, their shadows' map 5). Every lit
// pixel loops over the lamps' list (`core/lamps.ts`) and is lit by each lamp in its reach, the shadows' map read
// sixteen times for each. Over the ground round him, the lamps each point is lit by, read from the list as the shaders
// read it, on each level: Low's mean at most 60% of High's, its shadows' map not read, the switch there and back
// compiling no program; each pictured from above and over the shoulder. `canary` leaves Low's lamps as High's.
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, type ViewMode } from '../../../src/core/renderer';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { LAMPS_MOST, lampList, lampShadowsOn, setLampQuality } from '../../../src/core/lamps';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the way he faces where the set-up stands him (the square, lamps all round), and the hour */
const FACING = Math.PI;
const MIDNIGHT = 0;
/** the frames given to settle after a switch */
const SETTLE = 30;
/** how far round him the ground is read (m), and its grid's steps (m) */
const ROUND_HIM = 20;
const GRID = 1;
/** the most of High's lamps a point may be lit by on Low: their shadows' sixteen reads a lamp gone too (at 10 m,
 *  1.5 lamps against 4.6, the square's middle lay dark between them) */
const MOST_OF_HIGH = 0.6;
/** the views pictured: the lobby's own, and over the shoulder */
const VIEWS: ViewMode[] = ['top', 'third'];

/** A level's lamps read from the list: the mean a point round him is lit by, and whether their shadows are read. */
interface LampsRead { perPoint: number; shadows: boolean; made: number }

/** The lamps lighting the ground at (x, z), as the shaders count them: lit, and within their reach. */
function lampsAt(x: number, z: number): number {
  let lit = 0;
  for (let i = 0; i < LAMPS_MOST; i++) {
    const place = (1 + i * 2) * 4;
    const light = place + 4;
    if (lampList[light + 3] === 0) continue;
    const reach = lampList[place + 3];
    if (Math.hypot(lampList[place] - x, lampList[place + 1], lampList[place + 2] - z) < reach) lit++;
  }
  return lit;
}

/** The mean count of lamps lighting the ground round him. */
function lampsPerPoint(): number {
  const { x, z } = G.player.pos;
  let points = 0;
  let lit = 0;
  for (let dx = -ROUND_HIM; dx <= ROUND_HIM; dx += GRID) {
    for (let dz = -ROUND_HIM; dz <= ROUND_HIM; dz += GRID) {
      if (Math.hypot(dx, dz) > ROUND_HIM) continue;
      points++;
      lit += lampsAt(x + dx, z + dz);
    }
  }
  return lit / points;
}

/** The lamps at `level` (`canary`: Low's left as High's). */
async function readAt(lab: Lab, level: 'high' | 'low', canary: boolean): Promise<LampsRead> {
  const before = G.renderer.info.programs?.length ?? 0;
  useQuality(level);
  if (canary && level === 'low') setLampQuality(1, true);
  await lab.step(SETTLE);
  drawFrame(lab);
  const made = (G.renderer.info.programs?.length ?? 0) - before;
  return { perPoint: lampsPerPoint(), shadows: lampShadowsOn(), made };
}

/** The lamps on Low against High, read and pictured. */
export async function lampsOnLow(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = qualityLevel();
  holdHour(MIDNIGHT);
  faceCamera(FACING);
  let caught = false;
  try {
    for (const view of VIEWS) {
      await viewBy(lab, view);
      const high = await readAt(lab, 'high', canary);
      if (!canary) moments.push(await lab.screen(`${view}: High, midnight`, []));
      const low = await readAt(lab, 'low', canary);
      if (!canary) moments.push(await lab.screen(`${view}: Low, midnight`, []));
      const shadows = (read: LampsRead): string => (read.shadows ? 'their shadows read' : 'no shadows read');
      lines.push(`${view}: the ground round him lit by ${low.perPoint.toFixed(1)} lamps a point on Low`
        + ` (${shadows(low)}), ${high.perPoint.toFixed(1)} on High (${shadows(high)}),`
        + ` ${high.made + low.made} programs compiled by the switches`);
      if (high.perPoint < 1) throw new Error('lab: village: the lamps light nothing round him at midnight on High');
      if (high.made + low.made) problems.push(`lampsOnLow: programs compiled switching to Low and back (${view})`);
      const tooMany = low.perPoint > high.perPoint * MOST_OF_HIGH;
      if (canary) caught ||= tooMany || low.shadows;
      else if (tooMany) problems.push(`lampsOnLow: Low lights a point by ${low.perPoint.toFixed(1)} lamps (${view})`);
      else if (low.shadows) problems.push(`lampsOnLow: Low reads the lamps' shadows (${view})`);
    }
  } finally {
    useQuality(was);
  }
  return { lines, problems, caught: canary ? caught : null, moments };
}
