// `lab trees`: the trees standing in the play area, as the ranger's arrows meet them (tools/lab). In each biome every
// tree whose foot is inside the wall must be a wooden prop (an arrow goes into wood: `fx/stuckArrows.ts`), and an
// arrow shot at each one's trunk over the shoulder, from 7 m off it on a line clear of the other props, must stay
// standing in that tree.
// Then the arena is switched to another biome, and no arrow may be left: the floor and the props it lay in aren't
// there. And again as a wave starts: every arrow dissolves then, whatever the quality level. `--canary` plants
// the faults: the first tree made stone (its arrow glances off it) and an arrow stuck again after the switch and
// after the wave's start.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { emit } from '../../../src/events';
import { WALL_R } from '../../../src/world/props';
import type { Obstacle } from '../../../src/types';
import { SINK, spentPoints, spentStats, stickAt } from '../../../src/fx/stuckArrows';
import { drawAt, letGo } from './shots';

export interface TreesOptions {
  /** the biomes whose trees are shot (every one by default) */
  biomes?: BiomeId[];
  canary: boolean;
}

/** the biomes' trees' meshes, by their names (the ring's beyond the wall and the play area's) */
const TREE = /trees' bark|dead trees/;
/** how far from a tree's foot (m) its prop's circle must stand */
const FOOT_NEAR = 0.5;
/** how far in towards the middle he stands to shoot (m), and how high up the trunk he aims */
const STAND_IN = 7;
const TRUNK_UP = 1.2;
/** the turns round a tree (rad, from towards the middle) tried for a line to it clear of the other props by CLEAR m */
const TURNS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2];
const CLEAR = 0.5;
/** an arrow standing this near the trunk's line (m, across) is in the tree */
const IN_TRUNK = 0.7;
/** the most frames an arrow flies, and that a shot takes to be over */
const FLIGHT_FRAMES = 300;
const OVER_FRAMES = 240;
/** an arrow standing in the floor before the switch, off the dais (its point, going straight down) */
const FLOOR_ARROW = new THREE.Vector3(8, 0, 8);
const DOWN = new THREE.Vector3(0, -1, 0);

/** One tree in the play area: its foot, and its prop's circle (none: it isn't a prop) */
interface Tree {
  foot: THREE.Vector2;
  mesh: string;
  circle?: Obstacle;
}

/** Every instance of the biome's trees' meshes whose foot stands inside the wall. */
function treesInside(biome: BiomeId): Tree[] {
  const trees: Tree[] = [];
  const matrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  G.arena.groupOf(biome).traverse((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !TREE.test(mesh.name)) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      at.setFromMatrixPosition(matrix.premultiply(mesh.matrixWorld));
      if (Math.hypot(at.x, at.z) < WALL_R) trees.push({ foot: new THREE.Vector2(at.x, at.z), mesh: mesh.name });
    }
  });
  for (const tree of trees) tree.circle = woodenPropAt(tree.foot);
  return trees;
}

/** The wooden prop's circle round a foot, if one stands there. */
function woodenPropAt(foot: THREE.Vector2): Obstacle | undefined {
  return G.arena.obstacles.find((o) => o.prop?.kind === 'wood' && Math.hypot(o.x - foot.x, o.z - foot.y) < FOOT_NEAR);
}

/** The arrows standing now, by their points. */
const standing = (): Set<THREE.Vector3> => new Set(spentPoints().map((spent) => spent.tip));

/** Whether a prop other than `tree`'s stands within CLEAR of the line from `from` to its foot. */
function propInWay(from: THREE.Vector2, tree: Tree): boolean {
  const way = new THREE.Line3(new THREE.Vector3(from.x, 0, from.y), new THREE.Vector3(tree.foot.x, 0, tree.foot.y));
  const on = new THREE.Vector3();
  return G.arena.obstacles.some((o) => {
    if (o.prop && o.prop === tree.circle?.prop) return false;
    way.closestPointToPoint(new THREE.Vector3(o.x, 0, o.z), true, on);
    return Math.hypot(on.x - o.x, on.z - o.z) < o.r + CLEAR;
  });
}

/** Where he shoots `tree` from: STAND_IN off it, towards the middle or turned round it from there, on a line clear
 *  of the other props and inside the wall (none: no such line). */
function standFor(tree: Tree): THREE.Vector2 | null {
  const inward = Math.atan2(-tree.foot.y, -tree.foot.x);
  for (const turn of TURNS) {
    const way = inward + turn;
    const from = tree.foot.clone().add(new THREE.Vector2(Math.cos(way), Math.sin(way)).multiplyScalar(STAND_IN));
    if (from.length() < WALL_R - STAND_IN / 2 && !propInWay(from, tree)) return from;
  }
  return null;
}

/** One arrow loosed at a tree's trunk from where `standFor` puts him: where the arrows it left stand. */
async function shootAt(lab: Lab, tree: Tree): Promise<string> {
  const from = standFor(tree);
  if (!from) return 'no clear line to it';
  const toward = tree.foot.clone().sub(from);
  G.player.place(new THREE.Vector3(from.x, 0, from.y), Math.atan2(toward.x, toward.y));
  G.player.vel.set(0, 0, 0);
  const point = new THREE.Vector3(tree.foot.x, TRUNK_UP, tree.foot.y);
  const before = standing();
  const flying = new Set(G.projectiles);
  await drawAt(lab, point);
  await lab.step(1, () => letGo(point));
  const shot = G.projectiles.find((projectile) => !flying.has(projectile) && !projectile.hostile);
  for (let f = 0; shot?.alive && f < FLIGHT_FRAMES; f++) await lab.step(1, () => letGo(point));
  await lab.until(() => !G.player.casting, OVER_FRAMES, 'the shot was never over', () => letGo(point));
  const left = spentPoints().filter((spent) => !before.has(spent.tip));
  const inTree = left.some((spent) => spent.mode === 'fixed' && acrossTrunk(spent.tip, tree.foot) < IN_TRUNK);
  if (inTree) return 'in the tree';
  if (!left.length) return 'no arrow left';
  const where = left.map((spent) => {
    const tip = spent.tip.toArray().map((v) => v.toFixed(1)).join(', ');
    return `${spent.mode} at ${tip}, ${acrossTrunk(spent.tip, tree.foot).toFixed(2)} m off its trunk`;
  });
  return `${where.join('; ')} (shot from ${from.x.toFixed(1)}, ${from.y.toFixed(1)})`;
}

/** How far a point stands off a trunk's upright line (m). */
const acrossTrunk = (tip: THREE.Vector3, foot: THREE.Vector2): number => Math.hypot(tip.x - foot.x, tip.z - foot.y);

/** Every tree inside `biome`'s wall, each judged a prop and shot at (with `canary`, the first one made stone). */
async function treesIn(lab: Lab, biome: BiomeId, canary: boolean): Promise<{ lines: string[]; problems: string[] }> {
  await lab.setup({ view: 'third' });
  const lines: string[] = [];
  const problems: string[] = [];
  const trees = treesInside(biome);
  if (!trees.length) problems.push(`${biome}: no tree stands inside the wall`);
  for (const [i, tree] of trees.entries()) {
    const at = `${biome}: ${tree.mesh} at ${tree.foot.x.toFixed(1)}, ${tree.foot.y.toFixed(1)}`;
    if (!tree.circle) {
      lines.push(`  ${at}: not a wooden prop`);
      problems.push(`${at}: a tree inside the wall that isn't a wooden prop`);
      continue;
    }
    const kind = tree.circle.prop!.kind;
    if (canary && i === 0) tree.circle.prop!.kind = 'stone';
    const ended = await shootAt(lab, tree);
    tree.circle.prop!.kind = kind;
    lines.push(`  ${at}: ${ended}`);
    if (ended !== 'in the tree') problems.push(`${at}: an arrow shot at its trunk isn't standing in it (${ended})`);
  }
  lines.unshift(`${biome}: ${trees.length} trees inside the wall`);
  return { lines, problems };
}

/** Another biome shown after the shots: the arrows left (with `canary`, one stuck again, as a missed clear
 *  leaves it). */
function afterSwitch(canary: boolean): { line: string; problems: string[] } {
  // (and one standing in the floor, as an arrow shot at it stands: the switch has arrows to clear without trees)
  stickAt(FLOOR_ARROW, DOWN, SINK.ground);
  const before = spentStats().all;
  const to = BIOME_IDS.find((id) => id !== G.arena.biome)!;
  G.arena.setBiome(to);
  if (canary) stickAt(FLOOR_ARROW, DOWN, SINK.ground);
  const left = spentStats().all;
  const line = `switched to ${to}: ${before} arrows before, ${left} left`;
  const problems: string[] = [];
  if (left) problems.push(`${line}: the arrows of the biome left behind stay`);
  return { line, problems };
}

/** A wave started with arrows standing in the floor: they must begin dissolving and be gone by the end. */
async function afterWaveStart(lab: Lab, canary: boolean): Promise<{ line: string; problems: string[] }> {
  stickAt(FLOOR_ARROW, DOWN, SINK.ground);
  const before = spentStats().all;
  emit('waveStarted', (G.run?.wave ?? 0) + 1);
  const fading = spentStats().fading;
  if (canary) stickAt(FLOOR_ARROW, DOWN, SINK.ground);
  await lab.step(70);
  const left = spentStats().all;
  const line = `a wave started: ${before} arrows before, ${fading} dissolving, ${left} left after 70 frames`;
  const problems: string[] = [];
  if (fading < before) problems.push(`${line}: the last wave's arrows did not begin dissolving`);
  if (left !== (canary ? 1 : 0)) problems.push(`${line}: the last wave's arrows stay`);
  return { line, problems };
}

/** `lab trees`: each in-arena tree is a wooden prop an arrow stands in; a biome switch clears arrows and a wave start dissolves them. */
export async function trees(lab: Lab, options: TreesOptions): Promise<Report> {
  if (!G.player.cls.quiver) {
    const why = `the ${G.player.cls.id} shoots no arrows: run it with --class ranger`;
    return { text: why, problems: [why] };
  }
  const was = G.arena.biome;
  const lines: string[] = [];
  const problems: string[] = [];
  for (const [b, biome] of (options.biomes ?? [...BIOME_IDS]).entries()) {
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    const read = await treesIn(lab, biome, options.canary && b === 0);
    lines.push(...read.lines);
    problems.push(...read.problems);
  }
  const switched = afterSwitch(options.canary);
  lines.push(switched.line);
  problems.push(...switched.problems);
  const waved = await afterWaveStart(lab, options.canary);
  lines.push(waved.line);
  problems.push(...waved.problems);
  if (G.arena.biome !== was) G.arena.setBiome(was);
  if (!options.canary) return { text: lines.join('\n'), problems };
  const faults = ['isn\'t standing in it', 'left behind stay', 'last wave\'s arrows stay'];
  const caught = faults.map((fault) => problems.some((p) => p.includes(fault)));
  lines.push(`canary: an arrow glancing off a stone tree ${caught[0] ? 'found' : 'unseen'}, `
    + `an arrow kept through the switch ${caught[1] ? 'found' : 'unseen'}, `
    + `an arrow kept through a wave's start ${caught[2] ? 'found' : 'unseen'}`);
  const missed = caught.includes(false) ? ['canary: a planted fault went unseen'] : [];
  return { text: lines.join('\n'), problems: [...problems, ...missed] };
}
