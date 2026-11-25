// `lab village --only grassOnLow`: the grass as Low draws it against High, in the lobby's view and over the shoulder
// (from play, an S25 Edge's Profile at full res: the grass 21 ms of an 80 ms frame; the owner's choice, "Keep cheaper
// grass"). Low spreads the blades twice as far apart, each twice as wide (`grassSpread`, `setGrassSpread` in
// meadow.ts): the vertices the grass shades a frame are counted on each level, those its rings list at the share of
// blades the engine's pass keeps (Bulwark's gpu/placed.rs: counted as listed, they read the blades it drops too, Low
// 191% of High from above), and Low must shade at most a third of High's; the switch, there and back, must compile no program.
// Very low spreads them four times as far (from play, a laptop's integrated GPU at 5 frames a second over the shoulder
// with a sixteenth of its pixels drawn: the grass was 296k of the frame's 534k triangles) and must shade at most a
// tenth of High's. Each is pictured. `canary` leaves the blades as close as High's on Low, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, type ViewMode } from '../../../src/core/renderer';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { setGrassSpread } from '../../../src/world/meadow';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import { grassShaded } from './grassCount';
import type { LightsChecked } from './villageLights';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { plainMade } from './villageBloomLow';

/** where he stands and the way he faces: open meadow ahead, the cottages off to the side */
const STAND = new THREE.Vector3(10, 0, 4);
const FACING = Math.PI / 2;
/** the frames given to settle after a switch */
const SETTLE = 30;
/** the most vertices the grass may shade a frame on each level, in either view (from play, "we need below 1M tris on
 *  high" for the whole frame): High's tufts are a card each, so its count is no longer the most of the three, and Low
 *  and Very low are held to their own (Low drew 502k over the shoulder and Very low 131k before the tiles were made
 *  fine). Read again on 2026-11-25 under the engine, its pass's blades kept, at some 15% over what it shades: High
 *  636k over the shoulder, Low 481k, Very low 280k, Very low's lawn thinned half as hard since 63dda4ab6 (from play,
 *  "why I see different grass on very low?": it kept every blade within 4 m alone, clumps on bare ground), and High's
 *  and Low's blades as many a cell, High's in tufts (three's budgets were 420k, 360k and 95k) */
const MOST = { high: 730_000, low: 560_000, verylow: 330_000 };
/** the views read: the lobby's own, and over the shoulder */
const VIEWS: ViewMode[] = ['top', 'third'];

/** the levels read */
type Level = 'high' | 'low' | 'verylow';

/** A share as a whole percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(0)}%`;

/** The frame drawn at `level`: the vertices the grass shaded, and the pipelines compiled for it once the level's own
 *  set was made (the plain levels' lit shaders are a set of their own, made aside as the level switches: counted from
 *  the switch, they were 66, none of them the grass's). */
async function drawnAt(lab: Lab, level: Level, canary: boolean): Promise<{ vertices: number; made: number }> {
  useQuality(level);
  if (canary && level !== 'high') setGrassSpread(1);
  await plainMade(lab);
  const before = PIPELINES.made;
  await lab.step(SETTLE);
  drawFrame(lab);
  const { vertices } = await grassShaded(lab);
  return { vertices, made: PIPELINES.made - before };
}

/** The grass on Low against High in each view, its vertices counted and pictured. */
export async function grassOnLow(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = qualityLevel();
  holdHour(12);
  G.player.walkTo = null;
  G.player.place(STAND, FACING);
  faceCamera(FACING);
  let caught = false;
  try {
    for (const view of VIEWS) {
      await viewBy(lab, view);
      const high = await drawnAt(lab, 'high', canary);
      if (!canary) moments.push(await lab.screen(`${view}: High`, []));
      const low = await drawnAt(lab, 'low', canary);
      if (!canary) moments.push(await lab.screen(`${view}: Low`, []));
      const veryLow = await drawnAt(lab, 'verylow', canary);
      if (!canary) moments.push(await lab.screen(`${view}: Very low`, []));
      // (and back: a level's grass left in place by the switch up would show a thinner level's on High)
      const back = await drawnAt(lab, 'high', canary);
      if (!canary) moments.push(await lab.screen(`${view}: High again`, []));
      // (within a fiftieth: the tiles listed follow the view's sway)
      if (Math.abs(back.vertices - high.vertices) > high.vertices / 50) {
        problems.push(`grassOnLow: back on High the grass shades ${back.vertices} vertices in the ${view} view, `
          + `${high.vertices} before`);
      }
      const share = low.vertices / high.vertices;
      const veryShare = veryLow.vertices / high.vertices;
      const made = high.made + low.made + veryLow.made;
      const shaded = `${low.vertices} vertices on Low (${percent(share)}), ${veryLow.vertices} on Very low `
        + `(${percent(veryShare)}), ${high.vertices} on High`;
      lines.push(`${view}: the grass shades ${shaded}, ${made} programs compiled by the switches`);
      if (!high.vertices) throw new Error(`lab: village: no grass drawn in the ${view} view`);
      if (made) problems.push(`grassOnLow: ${made} programs compiled switching the level in the ${view} view`);
      const over = [['High', high.vertices, MOST.high], ['Low', low.vertices, MOST.low],
        ['Very low', veryLow.vertices, MOST.verylow]].filter(([, vertices, most]) => vertices > most);
      if (!over.length) continue;
      if (canary) caught = true;
      else problems.push(...over.map(([level, vertices, most]) =>
        `grassOnLow: ${level} shades ${vertices} grass vertices in the ${view} view (at most ${most})`));
    }
  } finally {
    useQuality(was);
  }
  return { lines, problems, caught: canary ? caught : null, moments };
}
