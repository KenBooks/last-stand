// `lab village`'s chest as the hero comes and goes: its lid read off the object drawn (from play, "stash chest should
// open when I approach it, and close when I move away"). Shut with him far off and as he walks through the hall's door
// beside it, open where he stands to use it, shut again once he has walked off. `canary` keeps him far off at the
// reading where it should be open, which must be found. The chronicle's candle the same way, read off its flame
// ("candle should light up when I approach similar to chest opening").
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { CHEST, TERRACE, type Spot } from '../../../src/data/village';
import { villageObject } from '../../../src/game/village';
import type { LightsChecked } from './villageLights';

/** the frames the lid is given to swing once he stands somewhere */
const SWING = 90;
/** how far the lid must have turned to count as open, and at most as shut (rad, of its 1.4) */
const OPEN_FROM = 1;
const SHUT_TO = 0.05;
/** how grown the candle's flame must be to count as lit, and at most as out (of 1) */
const FLAME_LIT = 0.9;
const FLAME_OUT = 0.05;
/** where he stands far off, on the terrace before the portico's far end */
const FAR_OFF: Spot = [TERRACE.x - 8, -12.5];

/** How far the lid stands turned (rad) with him stood at `spot`. */
async function lidWith(lab: Lab, [x, z]: Spot): Promise<number> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SWING);
  const lid = G.scene.getObjectByName('chest-lid');
  if (!lid) throw new Error('lab: village: no chest-lid in the scene');
  return Math.abs(lid.rotation.x);
}

/** How far the candle's flame stands grown (of 1) with him stood at `spot`. */
async function flameWith(lab: Lab, [x, z]: Spot): Promise<number> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SWING);
  const flame = G.scene.getObjectByName('candle-flame');
  if (!flame?.parent) throw new Error('lab: village: no candle-flame in the scene');
  return flame.parent.scale.x;
}

/** The candle out far off, lit at the chronicle's stand, out again as he leaves. */
export async function candleLightsNear(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const standBy = villageObject('chronicle')?.stand;
  if (!standBy) throw new Error('lab: village: no chronicle to stand by');
  const before = await flameWith(lab, FAR_OFF);
  const near = await flameWith(lab, canary ? FAR_OFF : standBy);
  const after = await flameWith(lab, FAR_OFF);
  const line = `candle's flame (of 1): far off ${before.toFixed(2)}, at its stand ${near.toFixed(2)}, `
    + `walked off ${after.toFixed(2)}`;
  const problems: string[] = [];
  if (before > FLAME_OUT) problems.push(`${line}: burning with him far off`);
  if (near < FLAME_LIT) problems.push(`${line}: stays out as he comes to it`);
  if (after > FLAME_OUT) problems.push(`${line}: stays lit as he leaves`);
  if (canary) return { lines: [line], problems: [], caught: problems.length > 0, moments: [] };
  return { lines: [line], problems, caught: null, moments: [] };
}

/** The lid shut far off and in the door, open at the chest's stand, shut again as he leaves. */
export async function chestOpensNear(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const standBy = villageObject('chest')?.stand;
  if (!standBy) throw new Error('lab: village: no chest to stand by');
  const before = await lidWith(lab, FAR_OFF);
  const inDoor = await lidWith(lab, [TERRACE.x, CHEST.z]);
  const near = await lidWith(lab, canary ? FAR_OFF : standBy);
  const after = await lidWith(lab, FAR_OFF);
  const read = (turn: number): string => turn.toFixed(2);
  const line = `chest's lid (rad): far off ${read(before)}, in the hall's door ${read(inDoor)}, `
    + `at its stand ${read(near)}, walked off ${read(after)}`;
  const problems: string[] = [];
  if (before > SHUT_TO) problems.push(`${line}: open with him far off`);
  if (inDoor > SHUT_TO) problems.push(`${line}: opens as he goes through the door`);
  if (near < OPEN_FROM) problems.push(`${line}: stays shut as he comes to it`);
  if (after > SHUT_TO) problems.push(`${line}: stays open as he leaves`);
  if (canary) return { lines: [line], problems: [], caught: problems.length > 0, moments: [] };
  return { lines: [line], problems, caught: null, moments: [] };
}
