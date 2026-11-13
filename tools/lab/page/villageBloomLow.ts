// `lab village --only bloomOnLow`: Low's bloom drawn at half the scene's pixels each way (`bloomShare` in
// data/quality.ts, `setBloomShare` in core/renderer.ts; from play, an S25 Edge's Profile at full res: bloom 6 ms of an
// 80 ms frame). By midnight, at the campfire facing it and back from the crypt's portal facing its vortex, over the
// shoulder and from above, on Low: the pixels bloom's passes draw into its own targets, Low's at most a third of the
// same frame's at full share; the light bloom adds to the frame's mean (drawn with it and held off, at one moment)
// within half a thousandth of white of what it adds at full share (it adds under half a thousandth there: as a share,
// noise moved it from -81% to +58%); no program compiled by the switch; both pictured. `canary` leaves Low's bloom at
// full share.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, holdBloom, bloomPixels, setBloomShare, type ViewMode } from '../../../src/core/renderer';
import { QUALITY } from '../../../src/data/quality';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { groundHeight } from '../../../src/world/ground';
import { villageObject } from '../../../src/game/village';
import { drawFrame, pixelLight, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle after a move or a switch */
const SETTLE = 30;
/** the views read: over the shoulder, and the lobby's own */
const VIEWS: ViewMode[] = ['third', 'top'];
/** the most of full share's pixels Low's bloom may draw */
const MOST_PIXELS = 1 / 3;
/** how far the light bloom adds to the frame's mean may stray from full share's (shares of white) */
const MOST_LIGHT_OFF = 0.0005;

/** A share as a whole percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(0)}%`;
/** Light in thousandths of white. */
const thousandths = (light: number): string => (light * 1000).toFixed(2);

/** The frame's mean light. */
function meanLight(canvas: Canvas): number {
  let sum = 0;
  for (let at = 0; at < canvas.pixels.length; at += 4) sum += pixelLight(canvas, at);
  return sum / (canvas.pixels.length / 4);
}

/** What bloom drew at a share: the pixels of its passes, and the light it added to the frame's mean. */
interface BloomRead { pixels: number; added: number }

/** Bloom at `share`, read at one moment: the frame with it and held off. */
async function readAt(lab: Lab, share: number): Promise<BloomRead> {
  setBloomShare(share);
  const withIt = drawFrame(lab);
  holdBloom(true);
  const without = drawFrame(lab);
  holdBloom(false);
  return { pixels: bloomPixels(), added: meanLight(withIt) - meanLight(without) };
}

/** Where he stands and the way he faces. */
interface Place { name: string; at: [number, number]; facing: number }

/** The places read: at the campfire's stand facing it, and back from the crypt's portal facing it (its vortex the
 *  brightest thing in the village by night). */
function places(): Place[] {
  const fire = villageObject('campfire');
  if (!fire) throw new Error('lab: village: no campfire to stand by');
  const [x, z] = fire.stand;
  const exit = G.arena.village!.exits.crypt;
  return [
    { name: 'the campfire', at: fire.stand, facing: Math.atan2(fire.at[0] - x, fire.at[1] - z) },
    { name: "the crypt's portal", at: [exit.at.x, exit.at.z], facing: exit.facing + Math.PI },
  ];
}

/** He stood at `place`, the camera behind him. */
async function standAt(lab: Lab, { at: [x, z], facing }: Place): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** One place in one view: Low's bloom against full share, read and pictured. */
interface PlaceRead { line: string; problems: string[]; tooMany: boolean; added: number; moments: Pictured[] }

/** `place` read in `view` (`canary`: Low's bloom at full share). */
async function readPlace(lab: Lab, view: ViewMode, place: Place, canary: boolean): Promise<PlaceRead> {
  const lowShare = canary ? 1 : QUALITY.low.bloomShare;
  const where = `${view}, ${place.name}`;
  await viewBy(lab, view);
  await standAt(lab, place);
  const moments: Pictured[] = [];
  const whole = await readAt(lab, 1);
  if (!canary) moments.push(await lab.screen(`${where}: Low, bloom at full share`, []));
  const low = await readAt(lab, lowShare);
  if (!canary) moments.push(await lab.screen(`${where}: Low, bloom at ${lowShare}`, []));
  const pixels = low.pixels / whole.pixels;
  const off = low.added - whole.added;
  const line = `${where}: bloom draws ${low.pixels} pixels on Low, ${whole.pixels} at full share`
    + ` (${percent(pixels)}); adds ${thousandths(low.added)} thousandths of white to the frame's mean,`
    + ` ${thousandths(whole.added)} at full share`;
  const problems: string[] = [];
  const tooMany = pixels > MOST_PIXELS;
  if (tooMany) problems.push(`bloomOnLow: Low's bloom draws ${percent(pixels)} of full share's (${where})`);
  if (Math.abs(off) > MOST_LIGHT_OFF) {
    problems.push(`bloomOnLow: Low's bloom adds ${thousandths(off)} thousandths off full share's (${where})`);
  }
  return { line, problems, tooMany, added: whole.added, moments };
}

/** Low's bloom against full share, by midnight. */
export async function bloomOnLow(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = qualityLevel();
  const before = G.renderer.info.programs?.length ?? 0;
  holdHour(0);
  useQuality('low');
  let caught = false;
  let mostAdded = 0;
  try {
    for (const view of VIEWS) {
      for (const place of places()) {
        const read = await readPlace(lab, view, place, canary);
        lines.push(read.line);
        moments.push(...read.moments);
        if (!canary) problems.push(...read.problems);
        caught ||= read.tooMany;
        mostAdded = Math.max(mostAdded, read.added);
      }
    }
  } finally {
    holdBloom(false);
    useQuality(was);
    holdHour(null);
    await viewBy(lab, 'top');
  }
  if (mostAdded <= 0) throw new Error('lab: village: bloom adds no light anywhere it was read');
  const made = (G.renderer.info.programs?.length ?? 0) - before;
  lines.push(`${made} programs compiled by the switches`);
  if (made && !canary) problems.push(`bloomOnLow: ${made} programs compiled by the switches`);
  return { lines, problems, caught: canary ? caught : null, moments };
}
