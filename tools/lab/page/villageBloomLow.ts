// `lab village --only bloomOnLow`: Low's bloom drawn at half the scene's pixels each way (`bloomShare` in
// data/quality.ts, `setBloomShare` in core/renderer.ts; from play, an S25 Edge's Profile at full res: bloom 6 ms of an
// 80 ms frame). By midnight, at the campfire facing it and back from the crypt's portal facing its vortex, over the
// shoulder and from above, on Low: the pixels the engine's bloom passes draw (by the share it was told, the engine's
// own sizes: `bloomPixels`), Low's at most a third of the same frame's at full share; the light bloom adds to the
// frame's mean (drawn with it and taken out, the engine's `rust.bloom`, at one moment) within half a thousandth of
// white of what it adds at full share (it adds under half a thousandth there: as a share, noise moved it from -81% to
// +58%); no pipeline asked for by the bloom's switches (Low's level itself makes its plain set aside: `lab
// rustcheck`'s); both pictured. `canary` leaves Low's bloom at full share. It read three's bloom passes, none under
// the engine: 0 pixels both ways, and the light it added 0.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, setBloomShare, type ViewMode } from '../../../src/core/renderer';
import { RUST, rustSwitching } from '../../../src/engine';
import { QUALITY } from '../../../src/data/quality';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { groundHeight } from '../../../src/world/ground';
import { villageObject } from '../../../src/game/village';
import { drawFrame, pixelLight, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';
import { PIPELINES, PIPELINES_ASKED } from '../../../src/engine/pipelinesAside';

/** the frames given to settle after a move or a switch */
const SETTLE = 30;
/** the views read: over the shoulder, and the lobby's own */
const VIEWS: ViewMode[] = ['third', 'top'];
/** the most of full share's pixels Low's bloom may draw */
const MOST_PIXELS = 1 / 3;
/** how far the light bloom adds to the frame's mean may stray from full share's (shares of white) */
const MOST_LIGHT_OFF = 0.0005;

/** the engine's bloom levels (Bulwark's post.rs `BLOOM_LEVELS`) */
const BLOOM_LEVELS = 5;
/** the most real frames waited for Low's plain pipelines, made aside, before reading */
const MOST_WAITED = 600;

/** The engine's bridge. */
function bridge(): NonNullable<typeof RUST.bridge> {
  if (!RUST.bridge) throw new Error('lab: village: the engine is not drawing');
  return RUST.bridge;
}

/** A side halved, as the engine halves it (never under one pixel). */
const halfOf = (side: number): number => Math.max(1, Math.floor(side / 2));

/** The pixels the engine's bloom draws a frame at the share it was told, by its own sizes (Bulwark's post.rs `size`):
 *  its first level half the frame's each way, a quarter at a share of 0.5 or less, each level after half the one
 *  before; the bright pass and the levels' sum at the first level's size, each level blurred across and then down. */
function bloomPixels(): number {
  const { bloomSent, bloomOn } = bridge().levels.now();
  if (!bloomOn || bloomSent <= 0) return 0;
  const canvas = document.getElementById('rust-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('lab: village: no engine canvas');
  let size: [number, number] = [halfOf(canvas.width), halfOf(canvas.height)];
  if (bloomSent <= 0.5) size = [halfOf(size[0]), halfOf(size[1])];
  let pixels = 2 * size[0] * size[1];
  for (let level = 0; level < BLOOM_LEVELS; level++) {
    pixels += 2 * size[0] * size[1];
    size = [halfOf(size[0]), halfOf(size[1])];
  }
  return pixels;
}

/** The engine's bloom drawn or taken out. */
function bloomOn(on: boolean): void {
  RUST.tune.bloom = on ? 1 : 0;
}

/** A level's plain pipelines (or the whole ones again), made aside as its level switches in play, waited for on the
 *  browser's time. */
export async function plainMade(lab: Lab): Promise<void> {
  const drawing = lab.drawing;
  // (drawn: the switch begins as a frame tells the engine the level)
  lab.drawing = true;
  try {
    await lab.step(1);
    for (let frame = 0; frame < MOST_WAITED && (rustSwitching() || PIPELINES.compiling > 0); frame++) {
      await lab.step(1);
      await window.__labClock.realFrame();
    }
  } finally {
    lab.drawing = drawing;
  }
  if (rustSwitching()) throw new Error('lab: village: the plain pipelines of Low never made');
}

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
  // (a frame for the engine to be told the share, and to size its passes)
  drawFrame(lab);
  const withIt = drawFrame(lab);
  const pixels = bloomPixels();
  bloomOn(false);
  const without = drawFrame(lab);
  bloomOn(true);
  return { pixels, added: meanLight(withIt) - meanLight(without) };
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
interface PlaceRead {
  line: string;
  problems: string[];
  tooMany: boolean;
  added: number;
  moments: Pictured[];
  /** the pipelines asked for between the bloom's switches */
  asked: string[];
}

/** `place` read in `view` (`canary`: Low's bloom at full share). */
async function readPlace(lab: Lab, view: ViewMode, place: Place, canary: boolean): Promise<PlaceRead> {
  const lowShare = canary ? 1 : QUALITY.low.bloomShare;
  const where = `${view}, ${place.name}`;
  await viewBy(lab, view);
  await standAt(lab, place);
  const moments: Pictured[] = [];
  // (a frame of the view first: what it draws asks for its own pipelines, the bloom's switches none)
  drawFrame(lab);
  const before = PIPELINES_ASKED.length;
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
  const asked = PIPELINES_ASKED.slice(before).map((pipeline) => `${pipeline.kind}: ${pipeline.what}`);
  return { line, problems, tooMany, added: whole.added, moments, asked };
}

/** Low's bloom against full share, by midnight. */
export async function bloomOnLow(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = qualityLevel();
  holdHour(0);
  useQuality('low');
  await plainMade(lab);
  const made: string[] = [];
  let caught = false;
  let mostAdded = 0;
  try {
    for (const view of VIEWS) {
      for (const place of places()) {
        const read = await readPlace(lab, view, place, canary);
        lines.push(read.line);
        moments.push(...read.moments);
        made.push(...read.asked);
        if (!canary) problems.push(...read.problems);
        caught ||= read.tooMany;
        mostAdded = Math.max(mostAdded, read.added);
      }
    }
  } finally {
    bloomOn(true);
    setBloomShare(1);
    useQuality(was);
    holdHour(null);
    await viewBy(lab, 'top');
  }
  if (mostAdded <= 0) throw new Error('lab: village: bloom adds no light anywhere it was read');
  const asked = `${made.length} pipelines asked for by the bloom's switches${made.length ? `: ${made.join('; ')}` : ''}`;
  lines.push(asked);
  if (made.length && !canary) problems.push(`bloomOnLow: ${asked}`);
  return { lines, problems, caught: canary ? caught : null, moments };
}
