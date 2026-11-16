// A straight run held straight, for `lab form` and `lab gait`'s `run`: the way the hero faces, frame by frame over the
// frames measured, against the way the run was set to go. He faces the way he moves (`facesWay` in `entities/
// player.ts`), so a run whose keys went another way than its set-up meant, or whose path bent off a wall, turns him:
// the keys go by the camera, and the boot's top-down camera was the village's opening spot's, which differs by class
// (the warrior's boot faced it the other way round, and `d` ran him from (-20, 14) into the crypt's wall, turning 60
// to 80 degrees over `form`'s frames: its pelvis against the legs read -0.77, a run held straight +1.00). The set-ups
// turn the camera to the battleground's own (`Fixture.yaw`), and this says when a run still didn't go straight.
//
// Nor was its lane clear any more: turned the right way, the run along z 14 ran into a prop at -5.6, 13.9 (r 0.85),
// and every lane +x from z 9 to 24 passes one nearer than `CLEARANCE`. The crypt's obstacles are the same every run
// (a run's seed moved none of its 61), and the clearest +x lane of the floor long enough, off the dais and the wall,
// is along z -8.5 from x -20.6 (1.59 m off the nearest). The runs start there, and should a prop come within
// `CLEARANCE` of the line, are set up again on the nearest lane beside it that is clear, or fail (`setUpClear`).
//
// Its canary (`straightCanary`) runs the judgement over made-up runs: one held straight with a sway of half a degree
// must pass; one turning 10 degrees over its frames, and one going the other way, must each be caught.
import type { Fixture, Lab } from './lab';
import { G } from '../../../src/state';

/** how far every obstacle stays off a straight run's line (m, past its own radius) */
const CLEARANCE = 1.5;
/** how far beside the asked line a lane is looked for (m), and the step between the lanes tried */
const LANE_MOST = 6;
const LANE_STEP = 0.5;
/** a lane runs this much further than the run is expected to go (m) */
const LANE_SPARE = 2;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** The nearest lane beside `[x, z]` (itself first) whose run of `metres` along `way` (rad, as the hero faces) passes
 *  every obstacle `CLEARANCE` off, or null. */
export function clearLane(x: number, z: number, way: number, metres: number): [number, number] | null {
  const along = { x: Math.sin(way), z: Math.cos(way) };
  for (let i = 0; i <= 2 * LANE_MOST / LANE_STEP; i++) {
    const aside = Math.ceil(i / 2) * LANE_STEP * (i % 2 ? 1 : -1);
    const from = { x: x + along.z * aside, z: z - along.x * aside };
    const clear = G.arena.obstacles.every((obstacle) => {
      const ahead = clamp((obstacle.x - from.x) * along.x + (obstacle.z - from.z) * along.z, 0, metres);
      const gap = Math.hypot(from.x + along.x * ahead - obstacle.x, from.z + along.z * ahead - obstacle.z);
      return gap - obstacle.r >= CLEARANCE;
    });
    if (clear) return [Number(from.x.toFixed(2)), Number(from.z.toFixed(2))];
  }
  return null;
}

/**
 * The run set up as `fixture` says, facing `way`, on a lane clear of every obstacle for `seconds` at the hero's speed:
 * at `fixture.at` if that one is, else on the nearest clear one beside it (the run's props are its own, known once it
 * has begun, so it is set up a second time there). Returns where it starts.
 */
export async function setUpClear(lab: Lab, fixture: Fixture, way: number, seconds: number): Promise<[number, number]> {
  let at = fixture.at ?? [0, 0];
  for (let tries = 0; tries < 3; tries++) {
    await lab.setup({ ...fixture, at, facing: way });
    const metres = seconds * lab.player.stats.moveSpeed + LANE_SPARE;
    const lane = clearLane(at[0], at[1], way, metres);
    if (!lane) throw new Error(`lab: no lane within ${LANE_MOST} m of ${at.join(', ')} is ${metres.toFixed(1)} m clear`);
    if (lane[0] === at[0] && lane[1] === at[1]) return at;
    at = lane;
  }
  throw new Error(`lab: the run's lane kept moving as it was set up (its props shaped anew each time?)`);
}

/** a run's facing may turn this much over its frames (deg) before it reads as not straight */
const TURN_MOST = 3;
/** and lie this far off the way it was set to go (deg) */
const OFF_MOST = 3;
const DEG = 180 / Math.PI;

/** An angle brought within a half turn either way (rad). */
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/** How a run's facings (rad, frame by frame) held against `way` (rad): how far off it they started, and the most they
 *  turned from there (deg). */
export interface Held {
  off: number;
  turned: number;
}

export function heldOf(facings: number[], way: number): Held {
  if (!facings.length) return { off: NaN, turned: NaN };
  const first = facings[0];
  const turned = Math.max(...facings.map((facing) => Math.abs(wrap(facing - first))));
  return { off: wrap(first - way) * DEG, turned: turned * DEG };
}

/** What went wrong with a straight run's facings against `way`, each said under `what`. */
export function straightProblems(what: string, facings: number[], way: number): string[] {
  const held = heldOf(facings, way);
  if (Number.isNaN(held.off)) return [`${what}: the run measured no frames`];
  const problems: string[] = [];
  if (Math.abs(held.off) > OFF_MOST) {
    problems.push(`${what}: the run went ${(wrap(facings[0]) * DEG).toFixed(0)} deg, not ${(way * DEG).toFixed(0)} ` +
      `(its keys go by the camera: the set-up's \`yaw\`)`);
  }
  if (held.turned > TURN_MOST) {
    problems.push(`${what}: the run turned ${held.turned.toFixed(1)} deg over its frames, not straight ` +
      `(more than ${TURN_MOST}: something in its way?)`);
  }
  return problems;
}

/** A line saying where a straight run started and how straight it held. */
export function straightLine(facings: number[], way: number, from: [number, number]): string {
  const held = heldOf(facings, way);
  return `held straight from ${from[0].toFixed(1)}, ${from[1].toFixed(1)}: ${held.off.toFixed(1)} deg off its way, ` +
    `turned ${held.turned.toFixed(1)} over the frames (at most ${OFF_MOST} and ${TURN_MOST})`;
}

/** The judgement run over made-up runs it must pass and catch: the misses, if any. */
export function straightCanary(): string[] {
  const way = Math.PI / 2;
  const frames = 160;
  const run = (facing: (frame: number) => number) => Array.from({ length: frames }, (_, frame) => facing(frame));
  const swaying = run((frame) => way + 0.5 / DEG * Math.sin(frame / 7));
  const turning = run((frame) => way - (10 / DEG) * frame / (frames - 1));
  const backwards = run(() => -way);
  const missed: string[] = [];
  if (straightProblems('', swaying, way).length) missed.push('a run held straight, swaying half a degree, failed');
  if (!straightProblems('', turning, way).length) missed.push('a run turning 10 deg over its frames passed');
  if (!straightProblems('', backwards, way).length) missed.push('a run going the other way passed');
  return missed;
}
