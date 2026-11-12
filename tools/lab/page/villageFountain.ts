// `lab village --only fountainStopsArrows`: the ranger's arrows at the fountain (from play, "fountain should be a
// valid obstacle for arrows, and arrow rain should cause some arrows underwater"). Shot at its tiers and at its
// basin's wall from two sides, every arrow ends at the fountain, not past it; a rain over it leaves arrows standing on
// the basin's floor, their points under the water, none in the ground under that floor. Skills are cast in the yard
// alone, so the hero is held armed here (`armedEverywhere`). `canary` has the fountain draw nothing an arrow meets,
// which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { armedEverywhere } from '../../../src/game/village';
import { viewMode } from '../../../src/core/renderer';
import { FOUNTAIN, inBasin } from '../../../src/world/fountain';
import { groundHeight } from '../../../src/world/ground';
import { clearSpent, spentPoints } from '../../../src/fx/stuckArrows';
import type { Obstacle } from '../../../src/types';
import { pressing } from './cast';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames he settles, draws to full and an arrow flies and falls still; a rain's held and let fall */
const SETTLE = 30;
const DRAWN = 90;
const FLIES = 150;
const RAINS = 300;
const RAIN_LANDS = 150;
/** how far from its middle an arrow stopped by the fountain may lie, a glance off it included (m) */
const STOPPED_WITHIN = FOUNTAIN.r + 2;
/** how far a point standing on the basin's floor may be from it (m), the fewest a rain must leave there, the rain's
 *  stand */
const ON_FLOOR = 0.06;
const FEWEST_UNDER = 3;
const RAIN_STAND: [number, number] = [0, 10];
/** where he stands for the pictures, as near as the basin lets him */
const BESIDE_BASIN: [number, number] = [0, 3.2];

/** A shot: where he stands, and the point aimed at (`y` over the floor). */
interface Shot {
  name: string;
  stand: [number, number];
  aim: [number, number, number];
}

const SHOTS: Shot[] = [
  { name: 'at its bowl from the south', stand: [0, 9], aim: [0, 1.4, 0] },
  { name: 'at its top from the east', stand: [9, 0], aim: [0, 2.2, 0] },
  { name: 'at its basin from the south', stand: [0, 9], aim: [0, 0.3, FOUNTAIN.r] },
  { name: 'at its basin from the east', stand: [9, 0], aim: [FOUNTAIN.r, 0.3, 0] },
];

/** He placed at (x, z), facing the fountain, settled. */
async function standAt(lab: Lab, [x, z]: [number, number]): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.atan2(-x, -z));
  await lab.step(SETTLE);
}

/** Each shot's arrows: how far from the fountain's middle the furthest ended, and how many there were. */
async function shoot(lab: Lab, shot: Shot): Promise<{ furthest: number; arrows: number }> {
  clearSpent();
  await standAt(lab, shot.stand);
  const aim = new THREE.Vector3(...shot.aim);
  await lab.step(DRAWN, () => ({ m0: true, aim }));
  await lab.step(FLIES, () => ({ aim }));
  const spent = spentPoints();
  const furthest = spent.reduce((most, arrow) => Math.max(most, Math.hypot(arrow.tip.x, arrow.tip.z)), 0);
  return { furthest, arrows: spent.length };
}

/** A rain over the fountain: the arrows left, by where their points stand. */
async function rain(lab: Lab): Promise<{ onFloor: number; underFloor: number; outOfWater: number; all: number }> {
  clearSpent();
  await standAt(lab, RAIN_STAND);
  const aim = new THREE.Vector3(0, 0, 0);
  await lab.step(RAINS, () => pressing('2', aim, true));
  await lab.step(RAIN_LANDS, () => ({ aim }));
  const spent = spentPoints();
  const inside = spent.filter((arrow) => inBasin(arrow.tip.x, arrow.tip.z));
  const onFloor = inside.filter((arrow) => Math.abs(arrow.tip.y - FOUNTAIN.floor) < ON_FLOOR).length;
  const underFloor = inside.filter((arrow) => arrow.tip.y < FOUNTAIN.floor - ON_FLOOR).length;
  // (its nock as far over its middle as its point is under: one out of the water reads as drawn over it)
  const outOfWater = inside.filter((arrow) => arrow.p.y * 2 - arrow.tip.y > FOUNTAIN.water).length;
  return { onFloor, underFloor, outOfWater, all: spent.length };
}

/** The fountain's obstacles, what they meet an arrow with taken off until `putBack`. */
function drawnTakenOff(): () => void {
  const fountain = G.arena.obstacles.filter((obstacle: Obstacle) => obstacle.drawn);
  const kept = fountain.map((obstacle: Obstacle) => obstacle.drawn);
  for (const obstacle of fountain) obstacle.drawn = undefined;
  return () => fountain.forEach((obstacle: Obstacle, at: number) => {
    obstacle.drawn = kept[at];
  });
}

/** Arrows at the fountain and a rain over it. */
export async function fountainStopsArrows(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (!G.player.cls.quiver) {
    return { lines: ['the fountain\'s arrows: this hero has no bow'], problems: [], caught: null, moments: [] };
  }
  const kept = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const sandboxed = G.player.sandbox;
  const putBack = canary ? drawnTakenOff() : (): void => undefined;
  armedEverywhere(true);
  G.player.sandbox = true;
  try {
    // (from above: the close views aim at the crosshair, whatever point the frame's input says)
    await viewBy(lab, 'top');
    for (const shot of SHOTS) {
      const { furthest, arrows } = await shoot(lab, shot);
      lines.push(`${shot.name}: ${arrows} arrow(s), the furthest ${furthest.toFixed(1)} m from its middle`);
      if (!arrows) problems.push(`${shot.name}: no arrow left anywhere`);
      if (furthest > STOPPED_WITHIN) {
        problems.push(`${shot.name}: an arrow ended ${furthest.toFixed(1)} m out, past it`);
      }
    }
    const { onFloor, underFloor, outOfWater, all } = await rain(lab);
    lines.push(`a rain over it: ${all} arrows, ${onFloor} on the basin's floor, ${underFloor} under it, `
      + `${outOfWater} in the basin standing out of the water`);
    if (outOfWater) problems.push(`a rain left ${outOfWater} arrows in the basin standing out of the water`);
    if (onFloor < FEWEST_UNDER) problems.push(`a rain left ${onFloor} arrows on the basin's floor`);
    if (underFloor) problems.push(`a rain left ${underFloor} arrows under the basin's floor`);
    if (!canary) {
      await standAt(lab, BESIDE_BASIN);
      moments.push(await lab.screen('the rain\'s arrows, from above', []));
      await viewBy(lab, 'third');
      await lab.step(SETTLE);
      moments.push(await lab.screen('the rain\'s arrows, over the shoulder', []));
    }
  } finally {
    putBack();
    armedEverywhere(false);
    G.player.sandbox = sandboxed;
    clearSpent();
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments };
}
