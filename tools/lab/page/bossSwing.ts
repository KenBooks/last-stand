// `boss --parts swing`: the Bell-Warden's bell moving as a bell does (from Victor's look at it: "bell is still like a
// catapult and rotates its axis. It looks unnatural"). A bell hangs from its headstock and swings as a pendulum about
// the yoke's one axis, building and dying away with its weight; it never spins about its own upright. Read off the
// bell's own joint as its crowd draws it (models/bellWarden.ts `userData.bell`, under `userData.frame`), frame by
// frame:
// - a toll at the hero: the bell's turn about the yoke's axis, its turn off that axis, its swing's angular
//   acceleration (a catapult's fling is a jolt: a pendulum's is its swing times its rate squared), and the whole
//   body's turn about the upright while it tolls (none: it stands to toll);
// - a walk after a hero circling it: the body's turn a second (a heavy frame turned slowly) and the bell's swing.
// Each pictured from its side as it goes. `--canary` swings it as a catapult (four times as far) and lets it spin.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { ENEMIES } from '../../../src/data/enemies';
import { BELL_WARDEN } from '../../../src/data/foes/bellwarden';

/** The most the bell may turn off the yoke's axis (degrees). */
const OFF_AXIS_MOST = 0.5;
/** The most angular acceleration of its swing (rad/s²): a pendulum's swing times its rate squared, with room. */
const JOLT_MOST = 20;
/** The most the body may turn about the upright while it tolls (rad/s). */
const TOLL_TURN_MOST = 0.05;
/** The slack over its turn a second while it walks (rad/s). */
const WALK_TURN_SLACK = 0.1;
/** Frames followed for a toll from its start, and for the walk. */
const TOLL_FRAMES = 150;
const WALK_FRAMES = 300;
/** The hero's circle round it while it walks: how far out (m) and how fast round (rad/s). */
const CIRCLE = 8, CIRCLE_RATE = 0.9;
/** The toll's shares pictured from its side: through its warning, its strike, and after. */
const TOLL_SHOTS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
/** The walk's frames pictured from above. */
const WALK_SHOTS = [60, 150, 240];
/** How far off the bell it's pictured (m). */
const SEEN_FROM = 15;
const FPS = 60;

/** One frame of the bell: its turn about the yoke's axis and off it (rad), the body's facing, the action's share. */
interface Read { swing: number; off: number; facing: number; share: number; tolling: boolean }

/** The bell's turn relative to its frame, split into its part about the yoke's axis (the frame's x) and the rest. */
function readBell(boss: Enemy): Read {
  const root = boss.model.root;
  root.updateMatrixWorld(true);
  const bell = root.userData.bell as THREE.Object3D, frame = root.userData.frame as THREE.Object3D;
  const rel = new THREE.Quaternion().copy(frame.getWorldQuaternion(new THREE.Quaternion())).invert()
    .multiply(bell.getWorldQuaternion(new THREE.Quaternion()));
  const swing = 2 * Math.atan2(rel.x, rel.w);
  const off = 2 * Math.asin(Math.min(1, Math.hypot(rel.y, rel.z)));
  const action = boss.action;
  return { swing, off, facing: boss.facing, share: action?.t ?? 0, tolling: action?.name === 'toll' };
}

/** The largest second difference of a series over the frame's time (per second squared). */
function mostJolt(values: number[]): number {
  let most = 0;
  for (let i = 1; i < values.length - 1; i++) most = Math.max(most, Math.abs(values[i + 1] - 2 * values[i] + values[i - 1]) * FPS * FPS);
  return most;
}

/** The largest change of an angle a frame, per second. */
function mostTurn(values: number[]): number {
  let most = 0;
  for (let i = 1; i < values.length; i++) most = Math.max(most, Math.abs(Math.atan2(Math.sin(values[i] - values[i - 1]), Math.cos(values[i] - values[i - 1]))) * FPS);
  return most;
}

/** What the part is handed: the lab, a Bell-Warden risen near the hero and thinking, and the canary. */
export interface SwingMeasure {
  lab: Lab;
  boss: Enemy;
  canary: boolean;
  lines: string[];
  problems: string[];
}

/** The bell through a toll and a walk, measured and pictured. */
export async function bellSwing({ lab, boss, canary, lines, problems }: SwingMeasure): Promise<Pictured[]> {
  const def = ENEMIES.bellwarden;
  const shipped = { swing: { ...BELL_WARDEN.swing }, turn: def.turn };
  if (canary) {
    BELL_WARDEN.swing.amp *= 4;
    def.turn = 20;
  }
  try {
    const moments = await toll(lab, boss, lines, problems);
    moments.push(...await walk(lab, boss, shipped.turn ?? 0, lines, problems));
    return moments;
  } finally {
    Object.assign(BELL_WARDEN.swing, shipped.swing);
    def.turn = shipped.turn;
  }
}

/** A toll at the hero from its start: the bell about the yoke's axis, off it, its jolt, the body's turn. */
async function toll(lab: Lab, boss: Enemy, lines: string[], problems: string[]): Promise<Pictured[]> {
  const hero = G.player;
  const reads: Read[] = [];
  const moments: Pictured[] = [];
  const shots = [...TOLL_SHOTS];
  boss.cd = 0;
  const keep = (): Record<string, never> => {
    hero.life = hero.stats.maxLife;
    return {};
  };
  await lab.until(() => boss.action?.name === 'toll', TOLL_FRAMES, 'the bell never tolled');
  for (let frame = 0; frame < TOLL_FRAMES; frame++) {
    await lab.step(1, keep);
    const read = readBell(boss);
    if (!read.tolling) break;
    reads.push(read);
    if (shots.length && read.share >= shots[0]) {
      const share = shots.shift()!;
      const at = boss.pos.clone().setY(3);
      moments.push(lab.picture(`swing toll ${share.toFixed(2)}`, ['left'], [`the toll at ${share.toFixed(2)} of its action, from its side`], { at, distance: SEEN_FROM }));
    }
  }
  const swings = reads.map((read) => read.swing);
  const off = Math.max(...reads.map((read) => read.off)) * 180 / Math.PI;
  const jolt = mostJolt(swings);
  const turn = mostTurn(reads.map((read) => read.facing));
  const back = Math.min(...swings), forth = Math.max(...swings);
  lines.push(`swing: a toll over ${reads.length} frames: the bell from ${fixed(deg(back))} to ${fixed(deg(forth))} degrees about the yoke, `
    + `${fixed(off, 2)} degrees off its axis at most, its swing's jolt ${fixed(jolt)} rad/s², the body turning ${fixed(turn, 3)} rad/s`);
  if (reads.length < 10) problems.push(`swing: the toll lasted ${reads.length} frames`);
  if (off > OFF_AXIS_MOST) problems.push(`swing: the bell turned ${fixed(off, 2)} degrees off the yoke's axis`);
  if (jolt > JOLT_MOST) problems.push(`swing: the bell's swing jolted ${fixed(jolt)} rad/s², a catapult's fling, over ${JOLT_MOST}`);
  if (turn > TOLL_TURN_MOST) problems.push(`swing: the body turned ${fixed(turn, 3)} rad/s as it tolled, over ${TOLL_TURN_MOST}`);
  return moments;
}

/** A walk after the hero circling it: the body's turn a second against `most` (as the game ships it: the canary's
 *  raised), and the bell's swing under the frame. */
async function walk(lab: Lab, boss: Enemy, most: number, lines: string[], problems: string[]): Promise<Pictured[]> {
  const hero = G.player;
  const middle = boss.pos.clone();
  const moments: Pictured[] = [];
  const reads: Read[] = [];
  boss.cd = 99;
  boss.cancelAction();
  let angle = Math.atan2(hero.pos.x - middle.x, hero.pos.z - middle.z);
  for (let frame = 0; frame < WALK_FRAMES; frame++) {
    angle += CIRCLE_RATE / FPS;
    await lab.step(1, () => {
      hero.life = hero.stats.maxLife;
      hero.pos.set(middle.x + Math.sin(angle) * CIRCLE, hero.pos.y, middle.z + Math.cos(angle) * CIRCLE);
      return {};
    });
    reads.push(readBell(boss));
    if (WALK_SHOTS.includes(frame)) {
      moments.push(lab.picture(`swing walk ${frame}`, ['above'], ['walking after a hero circling it: the frame turning, the bell swaying under it'], { at: boss.pos.clone().setY(3), distance: SEEN_FROM }));
    }
  }
  const turn = mostTurn(reads.map((read) => read.facing));
  const off = Math.max(...reads.map((read) => read.off)) * 180 / Math.PI;
  const jolt = mostJolt(reads.map((read) => read.swing));
  lines.push(`swing: walking ${WALK_FRAMES} frames after a hero circling it: the body turning ${fixed(turn, 2)} rad/s at most `
    + `(its turn ${most}), the bell ${fixed(off, 2)} degrees off the yoke's axis, its swing's jolt ${fixed(jolt)} rad/s²`);
  if (turn > most + WALK_TURN_SLACK) problems.push(`swing: walking, the body turned ${fixed(turn, 2)} rad/s, past its ${most}`);
  if (off > OFF_AXIS_MOST) problems.push(`swing: walking, the bell turned ${fixed(off, 2)} degrees off the yoke's axis`);
  if (jolt > JOLT_MOST) problems.push(`swing: walking, the bell's swing jolted ${fixed(jolt)} rad/s²`);
  return moments;
}

const deg = (rad: number): number => rad * 180 / Math.PI;
const fixed = (value: number, digits = 1): string => value.toFixed(digits);
