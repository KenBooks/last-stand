// tools/lab `poses`: the hero's pose frame by frame as a digest, and what his animation costs. He stands, walks,
// strafes attacking and stops, and after each frame every object of his model (its world matrix) and every point of
// the cloth and strings that move (a geometry's positions drawn as `DynamicDrawUsage`) is folded into a digest, to the
// last bit of each number; each move's digest is a line. So a change made to cost less is shown to pose him exactly as
// before by an A/B's digest lines agreeing (`--ab`), and its gain by the time lines beside them: his model's `animate`
// timed each frame by the browser's clock. A clip or range measure's lines agree for changes far past the last bit,
// and a gait's later strides go elsewhere after one bit (`check`'s offsets), so neither showed a speed-up kept the pose.
// The canary moves one number of the last frame by its last bit, and the digest must change. `--lobby` makes the moves
// in the lobby, the run abandoned for it: in co-op a hero's update cost about 30% more there than in a run (`coop`).
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import { quantile, timeCalls } from './timing';
import { toLobby } from './hallMoves';
import { G } from '../../../src/state';
import { Skirt } from '../../../src/entities/models/armor';
import { Player } from '../../../src/entities/player';

/** What `lab poses` takes. */
export interface PosesOptions {
  fixture?: Fixture;
  canary?: boolean;
  /** the moves made in the lobby, the run abandoned for it */
  lobby?: boolean;
}

/** One move he makes: its name, how many frames, and what's held down. */
interface Move {
  name: string;
  frames: number;
  input: Frame;
}

/** the moves, in turn: standing, walking ahead, strafing with the attack held, and stopped */
const MOVES: Move[] = [
  { name: 'stand', frames: 60, input: {} },
  { name: 'walk', frames: 90, input: { keys: ['w'] } },
  { name: 'strafe attacking', frames: 90, input: { keys: ['d'], m0: true } },
  { name: 'stop', frames: 90, input: {} },
];

/** FNV-1a's start and prime, over 32-bit words */
const FNV_START = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** A digest folded a number at a time, each by the bits of its 64-bit float. */
class Digest {
  private value = FNV_START;
  private readonly float = new Float64Array(1);
  private readonly words = new Uint32Array(this.float.buffer);

  add(number: number): void {
    this.float[0] = number;
    this.fold(this.words[0]);
    this.fold(this.words[1]);
  }

  /** the digest so far, as 8 hex digits */
  get hex(): string {
    return this.value.toString(16).padStart(8, '0');
  }

  private fold(word: number): void {
    this.value = Math.imul(this.value ^ word, FNV_PRIME) >>> 0;
  }
}

/** Folds the pose now into `digest`: each object's world matrix, and each moving geometry's positions. */
function addPose(digest: Digest, root: THREE.Object3D): void {
  root.traverse((object) => {
    for (const element of object.matrixWorld.elements) digest.add(element);
    const position = (object as THREE.Mesh).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
    if (position?.usage !== THREE.DynamicDrawUsage) return;
    for (const value of position.array as Float32Array) digest.add(value);
  });
}

/** The canary: the pose's digest now, then again with one of its numbers moved by its last bit; whether they differ. */
function caughtLastBit(root: THREE.Object3D): boolean {
  const before = new Digest();
  addPose(before, root);
  const elements = root.matrixWorld.elements;
  const kept = elements[12];
  const bits = new Float64Array([kept]);
  new BigInt64Array(bits.buffer)[0] += 1n;
  elements[12] = bits[0];
  const after = new Digest();
  addPose(after, root);
  elements[12] = kept;
  return before.hex !== after.hex;
}

/** A part timed beside his `animate`: a method of every instance of a class, by name (the drape is private). */
interface Part {
  name: string;
  owner: Record<string, unknown>;
  method: string;
}

/** The parts timed beside his `animate`: what holds it, and what of it costs most. */
const PARTS: Part[] = [
  { name: 'his update', owner: Player.prototype as unknown as Part['owner'], method: 'update' },
  { name: 'his skirts\' update', owner: Skirt.prototype as unknown as Part['owner'], method: 'update' },
  { name: 'their drape', owner: Skirt.prototype as unknown as Part['owner'], method: 'drape' },
];

/** a time a frame as a line shows it (ms) */
const ms = (time: number): string => time.toFixed(2);

/** The frames' times as a line: their median, 90th percentile and total. */
function timesOf(times: number[]): string {
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((sum, time) => sum + time, 0);
  return `median ${ms(quantile(sorted, 0.5))}, 90th percentile ${ms(quantile(sorted, 0.9))}, in all ${ms(total)} ms`;
}

/** `lab poses`: the hero's pose a move at a time as digests, and what his `animate` took a frame. */
export async function poses(lab: Lab, options: PosesOptions): Promise<Report> {
  const nocked = Boolean(lab.player.cls.quiver);
  const setUp = await lab.setup({ nocked, ...options.fixture });
  if (options.lobby) await toLobby(lab);
  if (options.lobby && G.mode !== 'menu') throw new Error('lab: poses: the lobby never came');
  const timing = timeCalls(lab.model, 'animate');
  // (what of it, and round it, by part: the whole hero's update, his skirts' and their drape)
  const parts = PARTS.map((part) => ({ name: part.name, timing: timeCalls(part.owner, part.method) }));
  const whole = new Digest();
  const digests: string[] = [];
  const timed: string[] = [];
  const all: number[] = [];
  try {
    for (const move of MOVES) {
      const digest = new Digest();
      const times = await lab.step(move.frames, () => move.input, () => {
        addPose(digest, lab.model.root);
        addPose(whole, lab.model.root);
        return timing.lap();
      });
      for (const part of parts) part.timing.lap();
      digests.push(`  ${move.name}, ${move.frames} frames: ${digest.hex}`);
      timed.push(`  ${move.name}: ${timesOf(times)}`);
      all.push(...times);
    }
  } finally {
    timing.stop();
  }
  const frames = all.length;
  const byPart = parts.map(({ name, timing: partTiming }) => {
    const perFrame = partTiming.stop().total / frames;
    return `  ${name}: ${ms(perFrame)} ms a frame`;
  });
  const problems: string[] = [];
  const caught = options.canary ? caughtLastBit(lab.model.root) : null;
  if (caught === false) problems.push('canary missed: a number moved by its last bit left the digest as it was');
  const text = [
    `set up as ${JSON.stringify(setUp)}${options.lobby ? ', then back to the lobby' : ''}`,
    'the pose, each move\'s frames as a digest (every object\'s world matrix, every moving point of cloth):',
    ...digests,
    `  in all: ${whole.hex}`,
    'his animate a frame, by the browser\'s clock (it differs from run to run):',
    ...timed,
    `  in all: ${timesOf(all)}`,
    'by part, a frame over every move (his update holds his animate, his skirts\' update their drape):',
    ...byPart,
    ...(caught ? ['canary: a number moved by its last bit moved the digest'] : []),
  ].join('\n');
  return { text, problems };
}
