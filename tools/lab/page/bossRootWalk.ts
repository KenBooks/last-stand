// The Rootmother's walk on her roots (tools/lab `boss`, parts `rootWalk` and `rootWalkPictures`; models/rootmother.ts
// `walkOn`, entities/rootmother.ts `dragTo`). From Victor, of her gliding across the floor: "how is she moving? would
// not be possible irl, right?". She heaves her trunk up on her roots and walks on them in two halves by turns, a half's
// feet planted in the world while the other's step ahead.
//
// A long vine holds the hero standing `STAND_OFF` m from her (its `hold` lengthened for the walk), and she walks to
// him; each frame is read as it's drawn: each root's foot (where it meets the floor, in its joint's frame: the model's
// `walk.feet`) in the world, on the floor or lifted off it, the trunk's height off the earth and her speed.
//
// - `rootWalk`: she must walk (`WALKED` m at least, `STEPS` steps, each a foot lifted off the floor and set down
//   again); a foot on the floor must stay where it is (`SLIDE` m at most over a whole stay, the drawn foot's own
//   movement: what a planted foot must not do); `BEARING` feet at least on the floor every frame she moves; the trunk
//   `LIFTED` m off the earth while she goes at half her speed or more (not dragged along it); her speed rising and
//   falling through each step (`SURGE` times her slowest at least: a weight carried, not a glide); and once the vine
//   lets him go, her feet back at rest within `RESTED` m and the trunk down on the earth. `--canary` carries her feet
//   with her, never planted, and leaves the trunk on the earth (`walk.carried`): the slides and the trunk must be
//   caught.
// - `rootWalkPictures` (asked for alone): her walk for the eye, from her side every few frames through a step and
//   more, from above, and as the player sees it.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { groundHeight } from '../../../src/world/ground';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { fixed, standIn, type BossOptions } from './boss';
import { holdHerAfter, nextIs, rootmother, standClear } from './bossRootmother';

/** frames a second on the lab's clock */
const FPS = 60;
/** how long the vine holds him for the walk (s), and the frames she's watched: the hold and her settling after */
const WALK_HOLD = 9;
const WALK_FRAMES = (WALK_HOLD + 4) * FPS;
/** a foot within this of the floor under it stands on it (m): at rest it meets it 4 cm up */
const ON_FLOOR = 0.1;
/** the least she must walk (m) and the steps she must take (feet lifted off the floor and set down again) */
const WALKED = 4;
const STEPS = 8;
/** the most a foot on the floor may move over its stay there (m) */
const SLIDE = 0.03;
/** the fewest feet on the floor in any frame she moves */
const BEARING = 4;
/** the least the trunk stands off the earth while she goes at half her speed or more (m) */
const LIFTED = 0.25;
/** her fastest against her slowest, through her steps (her setting off and stopping aside) */
const SURGE = 2;
/** once he's free and she has had `SETTLE_S` s to settle: the most a foot may stand off its rest (m), and the trunk off
 *  the earth (m) */
const SETTLE_S = 3;
const RESTED = 0.2;
const DOWN = 0.05;
/** her speed under which she stands (m/s), and the frames of her setting off and stopping left out of her surge */
const STANDS = 0.05;
const ENDS = FPS;

/** The model's hold on her walk (models/rootmother.ts `walk`). */
interface Walk {
  feet: { joint: THREE.Object3D; foot: THREE.Vector3 }[];
  tree: THREE.Object3D;
  carried: boolean;
}

/** Her walk, read frame by frame. */
interface WalkReading {
  walked: number;
  steps: number;
  /** the most a foot on the floor moved over one stay there (m), and which foot */
  slide: number;
  slideFoot: number;
  /** the frames that stay began and was read at its most, and the most that foot moved in one frame of it (m) */
  slideFrom: number;
  slideTo: number;
  slideJump: number;
  /** the fewest feet on the floor in a frame she moved, and the first frame it was so few */
  bearing: number;
  bearingAt: number;
  /** the trunk's least height off the earth while she went at half her speed or more (m) */
  lifted: number;
  /** her slowest and fastest speed through her steps (m/s) */
  slowest: number;
  fastest: number;
  /** after the settling: the furthest a foot stood off its rest, and the trunk off the earth (m) */
  offRest: number;
  trunkAfter: number;
  /** the frames she moved */
  moving: number;
  /** each foot's highest over the floor under it as she moved (m) */
  highest: number[];
}

/** Her model's walk, or null where her model has none. */
const walkOf = (boss: Enemy): Walk | null => (boss.model.root.userData.walk as Walk | undefined) ?? null;

/** A foot's place in the world as drawn. */
function footAt(foot: Walk['feet'][number], to: THREE.Vector3): THREE.Vector3 {
  return foot.joint.localToWorld(to.copy(foot.foot));
}

/** The hero stood clear 14 m from her (bossRootmother.ts `standClear`, or `stand`), a long vine sent at him, and her
 *  walk to him read until she has settled after it lets him go; `each` called every frame (a picture's turn). */
async function walkTo(lab: Lab, options: BossOptions, each?: (frame: number, boss: Enemy) => Promise<void>,
  stand: (lab: Lab, options: BossOptions) => Promise<void> = standClear,
): Promise<{ boss: Enemy; reading: WalkReading | null }> {
  const v = ROOTMOTHER.vines;
  const count = v.count, hold = v.hold;
  v.count = [1, 1];
  v.hold = WALK_HOLD;
  try {
    await stand(lab, options);
    const boss = await rootmother(lab);
    const walk = walkOf(boss);
    if (walk) walk.carried = options.canary;
    nextIs(boss, 'vines');
    const reading: WalkReading = {
      walked: 0, steps: 0, slide: 0, slideFoot: -1, slideFrom: -1, slideTo: -1, slideJump: 0,
      bearing: Infinity, bearingAt: -1, lifted: Infinity, slowest: Infinity, fastest: 0,
      offRest: 0, trunkAfter: 0, moving: 0, highest: [],
    };
    const feet = walk?.feet ?? [];
    reading.highest = feet.map(() => -Infinity);
    const was = feet.map(() => new THREE.Vector3());
    const onFloor = feet.map(() => false);
    const stay = feet.map(() => 0);
    const stayFrom = feet.map(() => -1);
    const stayJump = feet.map(() => 0);
    const speeds: number[] = [];
    let last = boss.pos.clone(), freeAt = -1, heldYet = false;
    const now = new THREE.Vector3();
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      await lab.step(1, () => ({}), () => holdHerAfter(boss, 'vines'));
      if (each) await each(frame, boss);
      if (G.player.rooted) heldYet = true;
      if (heldYet && !G.player.rooted && freeAt < 0) freeAt = frame;
      const moved = Math.hypot(boss.pos.x - last.x, boss.pos.z - last.z);
      last = boss.pos.clone();
      const speed = moved * FPS;
      reading.walked += moved;
      if (!walk) continue;
      const moving = speed > STANDS;
      if (moving) {
        reading.moving++;
        speeds.push(speed);
      } else if (speeds.length && speeds[speeds.length - 1] >= 0) speeds.push(-1);
      // (the trunk off the earth under her, as drawn)
      walk.tree.updateWorldMatrix(true, false);
      const trunkY = new THREE.Vector3().setFromMatrixPosition(walk.tree.matrixWorld).y;
      const trunk = trunkY - groundHeight(boss.pos.x, boss.pos.z);
      if (speed > boss.speed * 0.5) reading.lifted = Math.min(reading.lifted, trunk);
      let bearing = 0;
      feet.forEach((foot, i) => {
        footAt(foot, now);
        const over = now.y - groundHeight(now.x, now.z);
        const on = over < ON_FLOOR;
        if (moving) reading.highest[i] = Math.max(reading.highest[i], over);
        if (on) bearing++;
        if (on && onFloor[i]) {
          const jump = Math.hypot(now.x - was[i].x, now.z - was[i].z);
          stay[i] += jump;
          stayJump[i] = Math.max(stayJump[i], jump);
          if (stay[i] > reading.slide) {
            reading.slide = stay[i];
            reading.slideFoot = i;
            reading.slideFrom = stayFrom[i];
            reading.slideTo = frame;
            reading.slideJump = stayJump[i];
          }
        } else {
          stay[i] = 0;
          stayFrom[i] = frame;
          stayJump[i] = 0;
        }
        if (!on && onFloor[i] && moving) reading.steps++;
        onFloor[i] = on;
        was[i].copy(now);
      });
      if (moving && bearing < reading.bearing) {
        reading.bearing = bearing;
        reading.bearingAt = frame;
      }
      if (freeAt >= 0 && frame === freeAt + SETTLE_S * FPS) {
        reading.trunkAfter = trunk;
        reading.offRest = restOff(boss, walk);
      }
    }
    surgeOf(speeds, reading);
    return { boss, reading: walk ? reading : null };
  } finally {
    v.count = count;
    v.hold = hold;
  }
}

/** The furthest a foot stands off its place at rest under her (m): its joint as built (at its knee, turned along its
 *  root, its length its own) on the tree at rest, which is her root's frame. */
function restOff(boss: Enemy, walk: Walk): number {
  let most = 0;
  const now = new THREE.Vector3(), rest = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (const foot of walk.feet) {
    footAt(foot, now);
    const asBuilt = new THREE.Matrix4().compose(foot.joint.position, restTurn(foot.joint), one);
    rest.copy(foot.foot).applyMatrix4(asBuilt).applyMatrix4(boss.model.root.matrixWorld);
    most = Math.max(most, Math.hypot(now.x - rest.x, now.z - rest.z));
  }
  return most;
}

/** A root's joint's turn at rest: as built (`userData.turned`, kept by the model), or its turn now if none. */
function restTurn(joint: THREE.Object3D): THREE.Quaternion {
  return (joint.userData.turned as THREE.Quaternion | undefined) ?? joint.quaternion;
}

/** Her slowest and fastest through each run of moving frames, its setting off and stopping (`ENDS` frames each) left
 *  out. */
function surgeOf(speeds: number[], reading: WalkReading): void {
  const runs: number[][] = [[]];
  for (const s of speeds) {
    if (s < 0) runs.push([]);
    else runs[runs.length - 1].push(s);
  }
  for (const run of runs) {
    for (const s of run.slice(ENDS, run.length - ENDS)) {
      reading.slowest = Math.min(reading.slowest, s);
      reading.fastest = Math.max(reading.fastest, s);
    }
  }
}

/** `rootWalk`: her walk on her roots to a hero her vine holds, read as drawn. */
export async function rootWalk(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const { reading } = await walkTo(lab, options);
  if (!reading) {
    lines.push('rootWalk: her model has no walk (models/rootmother.ts `walk`)');
    problems.push('rootWalk: her model has no walk on her roots');
    return;
  }
  const r = reading;
  lines.push(`rootWalk: she walked ${fixed(r.walked)} m in ${r.steps} steps (feet lifted and set down), `
    + `${r.moving} frames moving`);
  lines.push(`rootWalk: a foot on the floor moved at most ${fixed(r.slide, 3)} m over its stay (foot ${r.slideFoot}), `
    + `at most ${SLIDE} (frames ${r.slideFrom} to ${r.slideTo}, ${fixed(r.slideJump, 3)} m at most in a frame); `
    + `${r.bearing === Infinity ? 'no' : r.bearing} feet bearing her at the fewest (frame ${r.bearingAt}), `
    + `at least ${BEARING}`);
  lines.push(`rootWalk: the trunk ${r.lifted === Infinity ? 'never read' : `${fixed(r.lifted)} m`} off the earth at `
    + `the least as she went, at least ${LIFTED}; her speed through her steps ${fixed(r.slowest)} to `
    + `${fixed(r.fastest)} m/s`);
  const highest = r.highest.map((h) => fixed(h)).join(', ');
  lines.push(`rootWalk: each foot's highest over the floor as she moved: ${highest} m`);
  lines.push(`rootWalk: settled ${SETTLE_S} s after he was free: a foot ${fixed(r.offRest)} m off its rest at the `
    + `most, the trunk ${fixed(r.trunkAfter)} m off the earth`);
  if (r.walked < WALKED) problems.push(`rootWalk: she walked ${fixed(r.walked)} m, under ${WALKED}`);
  if (r.steps < STEPS) problems.push(`rootWalk: ${r.steps} steps, under ${STEPS}`);
  if (r.slide > SLIDE) problems.push(`rootWalk: a planted foot slid ${fixed(r.slide, 3)} m, over ${SLIDE}`);
  if (r.bearing < BEARING) problems.push(`rootWalk: ${r.bearing} feet bore her in a frame, under ${BEARING}`);
  if (!(r.lifted >= LIFTED)) {
    problems.push(`rootWalk: the trunk was ${fixed(r.lifted)} m off the earth as she went, under ${LIFTED}`);
  }
  if (!(r.fastest >= r.slowest * SURGE)) {
    const went = `${fixed(r.slowest)} to ${fixed(r.fastest)} m/s`;
    problems.push(`rootWalk: her speed went ${went}, not ${SURGE} times: a glide`);
  }
  if (r.offRest > RESTED) problems.push(`rootWalk: a foot stayed ${fixed(r.offRest)} m off its rest once she stopped`);
  if (r.trunkAfter > DOWN) problems.push(`rootWalk: the trunk stayed ${fixed(r.trunkAfter)} m up once she stopped`);
}

/** how far she has walked as the side pictures start (m: under way, off the dais, past its corner stones, which hid
 *  her), how many, and the frames between them (a step and more) */
const SIDE_FROM = 5.5;
const SIDE_SHOTS = 10;
const SIDE_EVERY = 10;
/** the side pictures' distance and height they're framed on (m) */
const SIDE_DISTANCE = 16;
const SIDE_Y = 2.6;

/** where the hero stands for the pictures (m from the middle), the stretch of her path the side pictures see (m from
 *  the middle), and the ways tried: first along the dais's axes, her path out between its corner stones (they stand
 *  on its diagonals, and the line tests don't read them), then all round */
const PICTURE_STAND = 14;
const PICTURE_PATH = [5.5, 7, 8.5];
const PICTURE_WAYS = [0, 1, 2, 3].map((k) => (k * Math.PI) / 2);
const PICTURE_STEP = Math.PI / 24;

/** The hero stood `PICTURE_STAND` m from the middle, facing it, at the spot round it with a clear line to her whose
 *  side views of her path past the dais are clearest of props (the most clear lines from a side camera to a point of
 *  it: none was clear on both sides across the Thornwood). */
async function standSeen(lab: Lab, options: BossOptions): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  let best: [number, number] | null = null, bestSeen = -1;
  const all = Array.from({ length: Math.round((Math.PI * 2) / PICTURE_STEP) }, (_, k) => k * PICTURE_STEP);
  for (const way of [...PICTURE_WAYS, ...all]) {
    const ux = Math.sin(way), uz = Math.cos(way);
    const x = ux * PICTURE_STAND, z = uz * PICTURE_STAND;
    if (inObstacle(new THREE.Vector3(x, 0, z), 1) || !lineClear(x, z, 0, 0, 0.6)) continue;
    let seen = 0;
    for (const d of PICTURE_PATH) {
      for (const side of [1, -1]) {
        const cameraX = ux * d + uz * side * SIDE_DISTANCE, cameraZ = uz * d - ux * side * SIDE_DISTANCE;
        if (lineClear(cameraX, cameraZ, ux * d, uz * d, 0.3)) seen++;
      }
    }
    // (an axis's spot kept unless one all round sees more)
    if (seen > bestSeen) {
      best = [x, z];
      bestSeen = seen;
    }
  }
  if (!best) throw new Error('lab: no spot with a clear line to her');
  await lab.setup({ ...options.fixture, at: best, facing: Math.atan2(-best[0], -best[1]) });
}

/** `rootWalkPictures`: her walk for the eye, from her side through a step and more, from above, and as the player
 *  sees it. */
export async function rootWalkPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  let from: THREE.Vector3 | null = null, first = -1;
  await walkTo(lab, { ...options, canary: false }, async (frame, boss) => {
    from ??= boss.pos.clone();
    if (first < 0 && Math.hypot(boss.pos.x - from.x, boss.pos.z - from.z) >= SIDE_FROM) first = frame;
    if (first < 0) return;
    const shot = (frame - first) / SIDE_EVERY;
    const at = boss.pos.clone().setY(SIDE_Y);
    if (Number.isInteger(shot) && shot < SIDE_SHOTS) {
      const note = `her walk from her side, ${frame - first} frames on`;
      moments.push(lab.picture(`walk ${shot + 1}`, ['left', 'right'], [note], { at, distance: SIDE_DISTANCE }));
    }
    if (frame === first + SIDE_SHOTS * SIDE_EVERY + 20) {
      moments.push(lab.picture('walk from above', ['above'], ['her walk from above'], { at, distance: SIDE_DISTANCE }));
      moments.push(await lab.screen('walk (the game\'s view)', ['her walk as the player sees it']));
    }
  }, standSeen);
  lines.push(`rootWalkPictures: ${moments.length} moments`);
  return moments;
}
