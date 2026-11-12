// `lab village --only sightBlacksOut`: what he can't see from where he stands, from above (from play, "we have a bug
// that allows character to see inside buildings while staying outside ... hide the areas player cannot possibly see",
// "solid black does not look good"). At noon, so nothing is dark by itself, and each place read with the fog on and
// held off at one moment: what he can't see keeps a share of its light and little of its colour, the inside of a
// building shut to him far less; what he can see is untouched, a wall he faces among it; over the shoulder none of it
// is fogged. `canary` holds the fog off, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, HALL, TERRACE } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { holdSightOff } from '../../../src/core/sight';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle (the fog eases in), half the box read (px); the least of its light a seen place keeps,
 *  the most an unseen one does */
const SETTLE = 90;
const HALF_BOX = 10;
const SEEN_KEEPS = 0.85;
const UNSEEN_KEEPS = 0.65;
const DARK_ALREADY = 0.3;
/** the least over the shoulder's frame's mean may be */
const LEAST_OVER_SHOULDER = 0.05;
/** how far out of a wall he stands, and how far past it what's read lies (m) */
const OUT_OF_WALL = 1.5;
const PAST_WALL = 5;
const IN_THE_HALL = 4;
const BESIDE_DOOR = 3;
/** how far further back from the door the hall's floor is read (m), and how far off a cottage's end (m) */
const BACK_OF_PORTICO = 4;
const JUST_OUT = 0.8;

/** A place read from a stand, and which way it should come out. */
interface Reading {
  name: string;
  stand: [number, number];
  read: [number, number];
  seen: boolean;
  /** inside a building shut to him */
  shut?: boolean;
}

/** A box of the frame: its mean lightest channel, and how much redder than blue on average, a share of its light: the
 *  fog is cold. */
interface Box {
  light: number;
  warmth: number;
}

/** The floor's height at (x, z), a hair over it. */
const floorAt = (x: number, z: number): number => groundHeight(x, z) + 0.05;

/** What's read, each from where it's read from. */
function readings(): Reading[] {
  const middleZ = (HALL.door + TERRACE.back) / 2;
  const east = TERRACE.x + HALL.half;
  const cottage = COTTAGES[0];
  const out = COTTAGE.d / 2 * cottage.size + OUT_OF_WALL;
  const facingX = Math.sin(cottage.facing);
  const facingZ = Math.cos(cottage.facing);
  const before: [number, number] = [cottage.x + facingX * out, cottage.z + facingZ * out];
  const backOut = out + OUT_OF_WALL;
  const backOf: [number, number] = [cottage.x - facingX * backOut, cottage.z - facingZ * backOut];
  const backWall = COTTAGE.d / 2 * cottage.size + 0.3;
  const atBack: [number, number] = [cottage.x - facingX * backWall, cottage.z - facingZ * backWall];
  // (along it: from behind it, the ground before it lay under the frame)
  const along = COTTAGE.w / 2 * cottage.size + JUST_OUT;
  const alongX = Math.cos(cottage.facing);
  const alongZ = -Math.sin(cottage.facing);
  const westOf: [number, number] = [cottage.x - alongX * along, cottage.z - alongZ * along];
  const eastOf: [number, number] = [cottage.x + alongX * along, cottage.z + alongZ * along];
  return [
    {
      name: 'the hall\'s floor from outside it',
      // (far enough back that no column of the portico, which he does see, stands over it)
      // (before its front wall, the wall and the roof taken off to read it: over his shoulder its side walls stand over
      // the floor from either side)
      stand: [TERRACE.x + BESIDE_DOOR, HALL.door + OUT_OF_WALL],
      read: [TERRACE.x + BESIDE_DOOR, HALL.door - IN_THE_HALL],
      seen: false,
      shut: true,
    },
    {
      name: 'the ground beside him outside it',
      stand: [east + OUT_OF_WALL, middleZ],
      read: [east + OUT_OF_WALL + 1.5, middleZ],
      seen: true,
    },
    {
      // (from play: a wall he plainly faces, read just off it)
      name: 'the ground at a cottage\'s back wall from before it',
      stand: backOf,
      read: atBack,
      seen: true,
    },
    {
      name: 'the hall\'s floor from in it',
      stand: [east - OUT_OF_WALL, middleZ],
      read: [east - OUT_OF_WALL - 2, middleZ],
      seen: true,
    },
    {
      name: 'the ground past its wall from in it',
      stand: [east - OUT_OF_WALL, middleZ],
      read: [east + PAST_WALL, middleZ],
      seen: false,
    },
    {
      name: 'the hall\'s floor through its door',
      stand: [TERRACE.x, HALL.door + 3],
      read: [TERRACE.x, HALL.door - 3],
      seen: true,
    },
    { name: 'the ground before a cottage', stand: before, read: [before[0] + 1.2, before[1]], seen: true },
    { name: 'the ground across the cottage from him', stand: westOf, read: eastOf, seen: false },
  ];
}

/** The box round (x, z) on the floor as `canvas` shows it, null where it's off the frame. */
function boxAt(canvas: Canvas, x: number, z: number): Box | null {
  const place = new THREE.Vector3(x, floorAt(x, z), z).project(G.camera);
  const middleX = Math.round((place.x + 1) / 2 * canvas.width);
  const middleY = Math.round((place.y + 1) / 2 * canvas.height);
  const inFrame = middleX > HALF_BOX && middleY > HALF_BOX
    && middleX < canvas.width - HALF_BOX && middleY < canvas.height - HALF_BOX;
  if (!inFrame) return null;
  let light = 0;
  let warmth = 0;
  let count = 0;
  for (let y = middleY - HALF_BOX; y < middleY + HALF_BOX; y++) {
    for (let x0 = middleX - HALF_BOX; x0 < middleX + HALF_BOX; x0++) {
      const at = (y * canvas.width + x0) * 4;
      light += Math.max(canvas.pixels[at], canvas.pixels[at + 1], canvas.pixels[at + 2]);
      warmth += canvas.pixels[at] - canvas.pixels[at + 2];
      count++;
    }
  }
  return { light: light / count, warmth: warmth / Math.max(light, 1e-4) };
}

/** What's wrong with `reading`'s box with the fog on, against it held off. */
function judged(reading: Reading, fogged: Box, clear: Box): string | null {
  const kept = fogged.light / Math.max(clear.light, 1e-4);
  if (reading.seen) return kept < SEEN_KEEPS ? `keeps ${kept.toFixed(2)} of its light, seen` : null;
  // (a place already dark isn't dimmed by half: the fog holds a floor, not to fall to black;
  // its colour says it's fogged)
  // (in a building shut to him as in the open: its room is fogged as the ground is, grey and cold)
  if (clear.light > DARK_ALREADY && kept > UNSEEN_KEEPS) return `keeps ${kept.toFixed(2)} of its light, unseen`;
  return fogged.warmth < clear.warmth && fogged.warmth < 0 ? null : `its colour no colder, ${fogged.warmth.toFixed(3)}`;
}

/** He placed at `stand`, settled, and the frame drawn. */
async function drawnFrom(lab: Lab, stand: [number, number]): Promise<Canvas> {
  const [x, z] = stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  return drawFrame(lab);
}

/** Each place read from its stand, from above, and what's unseen over the shoulder left whole. */
export async function sightBlacksOut(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  if (canary) holdSightOff(true);
  holdHour(12);
  const hallCutaway = G.arena.village!.hallCutaway;
  try {
    await viewBy(lab, 'top');
    // (as the village opens, looking north: a measure before it may have turned it)
    faceCamera(Math.PI);
    for (const reading of readings()) {
      for (const part of hallCutaway) part.visible = !reading.shut;
      const canvas = await drawnFrom(lab, reading.stand);
      const fogged = boxAt(canvas, reading.read[0], reading.read[1]);
      if (!canary) moments.push(await lab.screen(reading.name, []));
      holdSightOff(true);
      await lab.step(SETTLE);
      const clear = boxAt(drawFrame(lab), reading.read[0], reading.read[1]);
      holdSightOff(canary);
      await lab.step(SETTLE);
      if (!fogged || !clear) {
        problems.push(`${reading.name}: off the frame`);
        continue;
      }
      lines.push(`${reading.name}: ${fogged.light.toFixed(3)} of ${clear.light.toFixed(3)}, `
        + `warmth ${fogged.warmth.toFixed(3)} of ${clear.warmth.toFixed(3)} (${reading.seen ? 'seen' : 'unseen'})`);
      const wrong = judged(reading, fogged, clear);
      if (wrong) problems.push(`${reading.name}: ${wrong}`);
    }
    const behind = readings()[readings().length - 1];
    await viewBy(lab, 'third');
    const shoulder = await drawnFrom(lab, behind.stand);
    const whole = shoulder.pixels.reduce((sum, value) => sum + value, 0) / shoulder.pixels.length;
    lines.push(`over the shoulder the frame's mean ${whole.toFixed(3)}`);
    if (whole < LEAST_OVER_SHOULDER) problems.push(`over the shoulder the frame is dark: ${whole.toFixed(3)}`);
  } finally {
    for (const part of hallCutaway) part.visible = true;
    holdSightOff(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments };
}
