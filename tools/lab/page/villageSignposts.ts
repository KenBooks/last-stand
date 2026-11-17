// `lab village`'s signposts (`src/world/signposts.ts`, `src/data/signposts.ts`; from the owner, of the houses' signs:
// "We need street signs too, not just house labels"). `signpostsReadable`: each arm points at where its name leads,
// within a few degrees; each post stands off the paving and its curb, off the footpaths, clear of what else stands
// (the lamps, the trees, the benches); and each arm can be read from the paving near it: a spot on a road or the
// square within reach from which its face is turned toward the eye, its letters tall enough over the shoulder. Pictured
// from each post's best spot at noon. `canary` turns one arm a quarter round and stands a post on a road's middle,
// both of which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMERA } from '../../../src/data/balance';
import { COTTAGES, type Spot } from '../../../src/data/village';
import { SIGNPOSTS, type Signpost } from '../../../src/data/signposts';
import { footpathOf, pavedAt, roadLines, solidAt, toPolyline } from '../../../src/world/villagePlan';
import { faceCamera } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { holdHour } from '../../../src/game/clock';
import { viewBy } from './villageHallCull';
import type { BuiltArm } from '../../../src/world/signposts';
import type { LightsChecked } from './villageLights';

/** how far off where its name leads an arm may point (rad) */
const POINTS_WITHIN = 0.05;
/** how far past a road's paving a post's middle stands at least (m: its curb, then its foot), and off a footpath */
const OFF_ROAD = 0.55;
const OFF_PATH = 0.6;
/** how much room a post leaves round it to what else stands (m, past both circles) */
const ROOM = 0.25;
/** the ring of spots a face is read from (m from the post, and how many round it), how square to the eye it must be
 *  turned (the cosine) and how tall its letters must stand over the shoulder at 1080 rows (px) */
const READ_FROM = [3, 4.5, 6];
const READ_ROUND = 32;
const SQUARE_ENOUGH = 0.5;
const LETTERS_TALL = 0.14;
const TALL_ENOUGH = 10;
/** the eye's height over the ground (m) */
const EYE = 1.6;
const SETTLE = 60;
/** how far from a post it's pictured from (m), and how far aside of it the view looks (rad) */
const PICTURED_FROM = 3.4;
const PICTURED_ASIDE = 0.35;

const toward = new THREE.Vector3(), facing = new THREE.Vector3(), from = new THREE.Vector3();

/** An arm turned by `by` (rad) about its post, its matrices made again. */
function turnArm(arm: BuiltArm, by: number): void {
  arm.group.rotation.y += by;
  arm.group.updateMatrix();
  arm.group.updateMatrixWorld(true);
}

/** What's wrong with where `post` stands. */
function standsWrong(post: Signpost): string[] {
  const [x, z] = post.at, wrong: string[] = [];
  if (pavedAt(x, z)) wrong.push('stands on the paving');
  const road = Math.min(...roadLines.map((r) => toPolyline(x, z, r.line) - r.width / 2));
  if (road < OFF_ROAD) wrong.push(`stands ${road.toFixed(2)} m past a road's paving, in its curb`);
  if (solidAt(x, z)) wrong.push('stands in what\'s built');
  for (const c of COTTAGES) {
    const path = footpathOf(c);
    if (path && toPolyline(x, z, path) < OFF_PATH) wrong.push('stands on a footpath');
  }
  const own = G.arena.obstacles.find((o) => Math.hypot(o.x - x, o.z - z) < 0.01);
  for (const o of G.arena.obstacles) {
    if (o === own) continue;
    const apart = Math.hypot(o.x - x, o.z - z) - o.r - (own?.r ?? 0);
    if (apart < ROOM) wrong.push(`stands ${apart.toFixed(2)} m from what else stands at ${o.x.toFixed(1)},${o.z.toFixed(1)}`);
  }
  if (!own) wrong.push('keeps no body off it');
  return wrong;
}

/** How far off where its name leads an arm points (rad). */
function pointsOff(arm: BuiltArm, to: Spot): number {
  arm.group.updateWorldMatrix(true, false);
  toward.set(1, 0, 0).transformDirection(arm.group.matrixWorld);
  const want = Math.atan2(to[1] - arm.post.at[1], to[0] - arm.post.at[0]);
  const got = Math.atan2(toward.z, toward.x);
  return Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want)));
}

/** The best spot on the paving near an arm to read it from: where its face is turned most to the eye. */
function readFrom(arm: BuiltArm, outs = READ_FROM): { at: Spot; square: number; tall: number } | null {
  arm.group.updateWorldMatrix(true, false);
  facing.set(0, 0, 1).transformDirection(arm.group.matrixWorld);
  const [px, pz] = arm.post.at;
  let best: { at: Spot; square: number; tall: number } | null = null;
  for (const out of outs) {
    for (let k = 0; k < READ_ROUND; k++) {
      const a = (k / READ_ROUND) * Math.PI * 2, x = px + Math.cos(a) * out, z = pz + Math.sin(a) * out;
      if (!pavedAt(x, z)) continue;
      from.set(x, groundHeight(x, z) + EYE, z).sub(new THREE.Vector3(px, groundHeight(px, pz) + arm.y, pz));
      const distance = from.length();
      const square = Math.abs(from.normalize().dot(facing));
      const tall = (LETTERS_TALL / (2 * distance * Math.tan(((CAMERA.third.fov / 2) * Math.PI) / 180))) * 1080 * square;
      if (!best || square > best.square) best = { at: [x, z], square, tall };
    }
  }
  return best;
}

/** The signposts stand clear, point true and read from the paving. */
export async function signpostsReadable(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const arms = G.arena.village.signArms;
  const problems: string[] = [];
  const lines: string[] = [`signposts: ${SIGNPOSTS.length}, ${arms.length} arms`];
  if (!arms.length) problems.push('signposts: the village has none');
  // (the canary's faults: an arm turned a quarter round, a post stood in a road)
  const turned = canary ? arms[0] : null;
  // (its matrix made again: the post stands still, its matrices made once)
  if (turned) turnArm(turned, Math.PI / 2);
  const posts: Signpost[] = canary ? [...SIGNPOSTS, { at: roadLines[0].line[4], arms: [] }] : [...SIGNPOSTS];
  let caughtTurn = false, caughtRoad = false;
  try {
    for (const post of posts) {
      const wrong = standsWrong(post);
      const said = `post at ${post.at[0].toFixed(1)},${post.at[1].toFixed(1)}`;
      lines.push(`${said}: ${wrong.length ? wrong.join('; ') : 'clear of the paving, the paths and what stands'}`);
      if (canary && post.arms.length === 0) caughtRoad = wrong.length > 0;
      else problems.push(...wrong.map((w) => `signposts: the ${said} ${w}`));
    }
    for (const arm of arms) {
      const to = arm.post.arms.find((a) => a.name === arm.name)!.to;
      const off = pointsOff(arm, to);
      const read = readFrom(arm);
      const where = read ? `read best from ${read.at[0].toFixed(1)},${read.at[1].toFixed(1)}, ${(read.square * 100).toFixed(0)}% square, its letters ${read.tall.toFixed(0)} px` : 'no paving near it';
      lines.push(`  ${arm.name} (post ${arm.post.at.join(',')}): points ${(off * 180 / Math.PI).toFixed(1)} deg off; ${where}`);
      if (arm === turned) {
        caughtTurn = off > POINTS_WITHIN;
        continue;
      }
      if (off > POINTS_WITHIN) problems.push(`signposts: "${arm.name}" points ${(off * 180 / Math.PI).toFixed(0)} deg off its way`);
      if (!read || read.square < SQUARE_ENOUGH) problems.push(`signposts: "${arm.name}" is read from no paving near it face on`);
      else if (read.tall < TALL_ENOUGH) problems.push(`signposts: "${arm.name}"'s letters stand ${read.tall.toFixed(0)} px tall at best`);
    }
  } finally {
    if (turned) turnArm(turned, -Math.PI / 2);
  }
  if (canary) {
    const caught = caughtTurn && caughtRoad;
    lines.push(`canary: an arm turned a quarter round ${caughtTurn ? 'caught' : 'missed'}, a post in a road ${caughtRoad ? 'caught' : 'missed'}`);
    return { lines, problems: [], caught, moments: [] };
  }
  const moments = await pictured(lab);
  return { lines, problems, caught: null, moments };
}

/** Each post at noon over the shoulder, from the paving before its first arm's best spot. */
async function pictured(lab: Lab): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  await viewBy(lab, 'third');
  holdHour(12);
  try {
    for (const post of SIGNPOSTS) {
      const arm = G.arena.village.signArms.find((a) => a.post === post)!;
      const spot = readFrom(arm, [PICTURED_FROM])?.at ?? post.at;
      // (looking a little past the post, so it stands beside him in the frame, not behind him)
      const look = Math.atan2(post.at[0] - spot[0], post.at[1] - spot[1]) - PICTURED_ASIDE;
      G.player.walkTo = null;
      G.player.place(new THREE.Vector3(spot[0], groundHeight(spot[0], spot[1]), spot[1]), look);
      faceCamera(look);
      await lab.step(SETTLE);
      moments.push(await lab.screen(`signpost at ${post.at.join(',')}`, [post.arms.map((a) => a.name).join(' / ')]));
    }
  } finally {
    holdHour(null);
  }
  return moments;
}
