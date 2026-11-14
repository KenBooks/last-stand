// `lab bowprop`: the ranger drawing at a prop he stands against, its bow's end in it, as the player aims (#317:
// "Ranger flickers between two positions when the bow's end goes inside a prop"). The pose aims the arrow by the arc
// that takes it through the point aimed at, and aimed from the arrow as posed, each frame's angle moved the arrow to
// where the next frame's turned it back: the bow, the arms and the trunk flickered between two poses, the arrow's
// middle 1.49 m and 2.45 m up on alternate frames.
// In each biome, against one prop of each kind it has, from two distances, the shot is drawn and held on a point on
// the prop from the top-down view, the mouse over it; every frame the nocked arrow's middle, the bow's tip and the hero
// are read in the world, and a part's move that turns back on the frame before's is a reversal. (In the close views
// the crosshair's point on anything within 5 m is put on along its ray, `AIM.near` in src/core/input.ts, so the aim is
// never on a prop beside him there.) First, the point the pose aims from is held to the arrow drawn level (`shotFrom`
// in src/combat/skills/ranger.ts). `canary` aims the pose from the arrow again.
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Pictured, Report } from './lab';
import type { Obstacle } from '../../../src/types';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { inObstacle } from '../../../src/world/collision';
import * as ranger from '../../../src/combat/skills/ranger';
import type { Player } from '../../../src/entities/player';

/** What `lab bowprop` is given. */
export interface BowPropOptions {
  fixture: Fixture;
  biomes?: BiomeId[];
  /** picture the frames round the arrow's largest move in each biome's first stand, the whole body from his right
   *  and from above behind (side-on to the shot, from his left the close-up saw his back) */
  pictures: boolean;
  canary: boolean;
}

/** how far from the prop's circle he stands (m): his bow's end in it at the nearer */
const GAPS = [0.25, 0.5];
/** a prop counts when its circle is this wide and this tall at least (m): the bow can reach into it */
const PROP_LEAST = { r: 0.3, h: 0.5 };
/** how high over the floor the aim is put on the prop (m), before the eye's ray meets what it meets */
const AIM_HEIGHT = 1.2;
/** the frames the shot is held on the prop, and the first of them measured (the draw coming up before) */
const HOLD_FRAMES = 150;
const MEASURED_FROM = 10;
/** a move a frame shorter than this (m) never counts as a reversal: the settling of a pose at rest */
const MOVE_LEAST = 0.01;
/** the most reversals a part may make over a hold (a pose easing onto its aim turns back once or twice) */
const REVERSALS_MOST = 3;
/** the level draw that checks where the pose aims from: how far ahead the aim is (m), its height, its frames, and how
 *  far the point may stand off the arrow's middle (m) */
const LEVEL = { ahead: 12, height: 1.5, frames: 90, off: 0.05 };
/** the frames run with the aim turned off the prop before the shot is let go, so it never strikes the prop */
const TURN_AWAY_FRAMES = 40;
/** the room a hero needs to stand (m: his radius) */
const HERO_ROOM = 0.15;
/** how many frames running are pictured round the arrow's largest move, and how many of them before it */
const PICTURED = 4;
const PICTURED_BEFORE = 1;

/** A part measured, and its world position now. */
interface Part {
  name: string;
  at: () => THREE.Vector3;
}

/** One part's reading over a hold. */
interface PartRead {
  name: string;
  reversals: number;
  largestMove: number;
  largestAt: number;
}

/** One stand against a prop. */
interface Stand {
  label: string;
  parts: PartRead[];
  drawn: boolean;
  onProp: boolean;
}

/** The parts read: the nocked arrow's middle, the bow's upper tip, and the hero himself. */
function partsOf(lab: Lab): Part[] {
  const world = (object: THREE.Object3D | undefined) => () => {
    return (object ?? lab.model.root).getWorldPosition(new THREE.Vector3());
  };
  return [
    { name: 'arrow', at: world(lab.model.tip) },
    { name: 'bow tip', at: world(lab.model.weaponTip) },
    { name: 'hero', at: () => lab.player.obj.position.clone() },
  ];
}

/** Counts a part's moves that turn back on the frame before's, each longer than `MOVE_LEAST`. */
class ReversalCount {
  reversals = 0;
  largestMove = 0;
  /** the frame of the largest move */
  largestAt = 0;
  private last: THREE.Vector3 | null = null;
  private lastMove: THREE.Vector3 | null = null;

  observe(at: THREE.Vector3, frame: number): void {
    const move = this.last ? at.clone().sub(this.last) : null;
    this.last = at;
    if (!move) return;
    if (move.length() > this.largestMove) {
      this.largestMove = move.length();
      this.largestAt = frame;
    }
    const long = move.length() > MOVE_LEAST;
    if (long && this.lastMove && move.dot(this.lastMove) < 0) this.reversals++;
    this.lastMove = long ? move : null;
  }
}

/** The props of the biome shown that the bow can reach into, one of each kind: the one nearest the middle with room
 *  to stand at every gap on its side towards the middle. */
function propsOfEachKind(): Obstacle[] {
  const chosen = new Map<string, Obstacle>();
  const reachable = G.arena.obstacles
    .filter((part) => part.prop && !part.prop.broken && part.r >= PROP_LEAST.r && part.h >= PROP_LEAST.h)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const part of reachable) {
    const kind = part.prop!.kind;
    if (chosen.has(kind)) continue;
    if (GAPS.every((gap) => !inObstacle(standAt(part, gap), HERO_ROOM))) chosen.set(kind, part);
  }
  return [...chosen.values()];
}

/** Where he stands `gap` off `prop`'s circle, on its side towards the arena's middle. */
function standAt(prop: Obstacle, gap: number): THREE.Vector3 {
  const toMiddle = new THREE.Vector3(-prop.x, 0, -prop.z).normalize();
  return new THREE.Vector3(prop.x, 0, prop.z).addScaledVector(toMiddle, prop.r + gap);
}

/** The way that faces `to` from `from` (rad, as the hero's facing). */
const facingTo = (from: THREE.Vector3, to: THREE.Vector3): number => Math.atan2(to.x - from.x, to.z - from.z);

/** The shot drawn and held on `aim` for `frames` (the mouse over it and the crosshair turned to it). */
const holding = (aim: THREE.Vector3): Frame => ({ aim, sight: aim, m0: true });

/** The shot let go aimed off behind him, so its arrow flies away from the prop. */
async function letGoAway(lab: Lab, from: THREE.Vector3, prop: Obstacle): Promise<void> {
  const away = from.clone().multiplyScalar(2).sub(new THREE.Vector3(prop.x, AIM_HEIGHT, prop.z));
  await lab.step(TURN_AWAY_FRAMES, () => holding(away));
  await lab.step(1, () => ({ aim: away, sight: away }));
}

/** The point the pose aims from, where the tree has one (a commit from before #317 aims from the arrow as posed). */
type ShotFrom = (player: Player) => THREE.Vector3;
const shotFrom = (ranger as { shotFrom?: ShotFrom }).shotFrom;

/** How far the point the pose aims from stands off the arrow's middle, drawn level ahead (m). */
async function levelOff(lab: Lab, fixture: Fixture, from: ShotFrom): Promise<number> {
  await lab.setup({ ...fixture, nocked: true });
  const hero = lab.player.pos.clone();
  const ahead = new THREE.Vector3(Math.sin(lab.player.facing), 0, Math.cos(lab.player.facing));
  const aim = hero.addScaledVector(ahead, LEVEL.ahead).setY(LEVEL.height);
  await lab.step(LEVEL.frames, () => holding(aim));
  if (!lab.player.casting?.drawT) throw new Error('lab: the level draw never drew');
  const arrow = lab.model.tip!.getWorldPosition(new THREE.Vector3());
  return from(lab.player).distanceTo(arrow);
}

/** Whether the aim is on `prop`: the point under it within its circle (a little wider) and over the floor. */
function aimOn(prop: Obstacle): boolean {
  const across = Math.hypot(input.ground.x - prop.x, input.ground.z - prop.z);
  return across < prop.r * 1.3 + 0.1 && input.ground.y > 0.2;
}

/** The set-up of a stand against `prop` from `gap`: his spot, and the point on the prop aimed at. */
async function standBy(lab: Lab, fixture: Fixture, prop: Obstacle, gap: number): Promise<THREE.Vector3> {
  const at = standAt(prop, gap);
  const target = new THREE.Vector3(prop.x, AIM_HEIGHT, prop.z);
  await lab.setup({ ...fixture, at: [at.x, at.z], facing: facingTo(at, target), nocked: true });
  return target;
}

/** One stand: the shot held on `prop` from `gap`, each part read every frame. */
async function standAgainst(lab: Lab, fixture: Fixture, prop: Obstacle, gap: number, label: string): Promise<Stand> {
  const target = await standBy(lab, fixture, prop, gap);
  const parts = partsOf(lab);
  const counts = parts.map(() => new ReversalCount());
  let drawn = false;
  let onProp = false;
  await lab.step(HOLD_FRAMES, () => holding(target), (frame) => {
    drawn ||= !!lab.player.casting?.drawT;
    onProp ||= aimOn(prop);
    if (frame >= MEASURED_FROM) parts.forEach((part, index) => counts[index].observe(part.at(), frame));
  });
  await letGoAway(lab, standAt(prop, gap), prop);
  const read = parts.map((part, index) => ({
    name: part.name, reversals: counts[index].reversals, largestMove: counts[index].largestMove,
    largestAt: counts[index].largestAt,
  }));
  return { label, parts: read, drawn, onProp };
}

/**
 * The stand played again (the lab's runs come out the same) to the arrow's largest move, and the frames round it
 * pictured, the whole body from his right and from above behind, each with the arrow's height: where it flickers, the
 * moment it jumps.
 */
async function filmStand(lab: Lab, fixture: Fixture, prop: Obstacle, gap: number, stand: Stand): Promise<Pictured[]> {
  const target = await standBy(lab, fixture, prop, gap);
  const arrow = partsOf(lab)[0];
  const first = Math.max(0, stand.parts[0].largestAt - PICTURED_BEFORE);
  await lab.step(first, () => holding(target));
  const moments: Pictured[] = [];
  for (let frame = first; frame < first + PICTURED; frame++) {
    await lab.step(1, () => holding(target));
    const note = `arrow's middle ${arrow.at().y.toFixed(2)} m up`;
    moments.push(lab.picture(`${stand.label}, frame ${frame}`, ['right', 'above'], [note]));
  }
  await letGoAway(lab, standAt(prop, gap), prop);
  return moments;
}

/** A stand's line, and its problems. */
function judged(stand: Stand): { line: string; problems: string[] } {
  const parts = stand.parts.map((part) => `${part.name} ${part.reversals} reversals, `
    + `${(part.largestMove * 100).toFixed(1)} cm a frame at most`);
  const problems = stand.parts.filter((part) => part.reversals > REVERSALS_MOST)
    .map((part) => `${stand.label}: the ${part.name} turned back ${part.reversals} times in `
      + `${HOLD_FRAMES - MEASURED_FROM} frames (at most ${REVERSALS_MOST}): it flickers`);
  if (!stand.drawn) problems.push(`${stand.label}: the shot was never drawn`);
  if (!stand.onProp) problems.push(`${stand.label}: the aim never met the prop`);
  return { line: `${stand.label}: ${parts.join('; ')}`, problems };
}

/** `lab bowprop`: the level draw, then every stand in each biome. */
export async function bowProp(lab: Lab, options: BowPropOptions): Promise<Report> {
  if (!G.player.cls.quiver) {
    const why = `the ${G.player.cls.id} draws no bow: run it with --class ranger`;
    return { text: why, problems: [why] };
  }
  const tune = options.canary ? { ...options.fixture.tune, 'shotFrom.steady': [0] } : options.fixture.tune;
  const fixture: Fixture = { ...options.fixture, tune, view: 'top' };
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = G.arena.biome;

  // (the run started first, its biomes and their props built: listed from the lobby's, there were none)
  await lab.setup(fixture);
  const off = shotFrom ? await levelOff(lab, fixture, shotFrom) : 0;
  const offLine = `${(off * 100).toFixed(1)} cm off the arrow drawn level`;
  lines.push(`the point the pose aims from: ${shotFrom ? offLine : 'the arrow as posed (this tree has no shotFrom)'}`);
  if (!options.canary && off > LEVEL.off) {
    problems.push(`the point the pose aims from is ${(off * 100).toFixed(1)} cm off the arrow drawn level (at most `
      + `${LEVEL.off * 100} cm): shotFrom wants measuring again`);
  }
  for (const biome of options.biomes ?? [...BIOME_IDS]) {
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    const props = propsOfEachKind();
    if (!props.length) problems.push(`${biome}: no prop the bow can reach into with room to stand by it`);
    let first = options.pictures;
    for (const prop of props) {
      for (const gap of GAPS) {
        const label = `${biome}, ${prop.prop!.kind} prop (r ${prop.r.toFixed(2)} m), ${gap} m off it`;
        const stand = await standAgainst(lab, fixture, prop, gap, label);
        if (first) moments.push(...await filmStand(lab, fixture, prop, gap, stand));
        first = false;
        const read = judged(stand);
        lines.push(read.line);
        problems.push(...read.problems);
      }
    }
  }
  if (G.arena.biome !== was) G.arena.setBiome(was);
  lines.push(...problems.map((problem) => `! ${problem}`));
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  const caught = problems.some((problem) => problem.includes('flickers'));
  lines.push(`canary: the pose aimed from the arrow as posed ${caught ? 'caught flickering' : 'went unseen'}`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: the flicker went unseen'], moments };
}
