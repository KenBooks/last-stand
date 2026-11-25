// The Rootmother's burrow (tools/lab `boss`, parts `rootBurrow` and `rootBurrowPictures`; entities/rootBurrow.ts). From
// Kenneth: "instead of moving slowly, it teleports, just going underground, roots going into the ground, and then it
// appears near you. It should look like it actually going underground." She never moves above ground.
//
// Each case grows her in the Thornwood's middle, the hero standing still `STAND_OFF` m off (past her `far`), her cage
// and heart held off, her wait to burrow given over, and reads each frame as the game played it (`BURROW_LOG`, her
// place, her model as drawn, her own state, what of her fight's hits landed):
// - `rootBurrow`: she burrows, and
//   - never moves while any of her stands over the floor: her drawn top (her model's meshes as drawn, her kept pools
//     left out) under the floor every frame her place changes (`MOVED_ABOVE`, 0 m);
//   - is wholly under the floor before she first moves (her top's height under it said);
//   - its rise warned at its spot for the warning's time at least (`BURROW_LOG`: the warning begun where she rises, the
//     rise no sooner than `warn` after it);
//   - rises on a spot clear of the props, the wall and every hero (`clearSpot`), `ring` m from the hero she went for;
//   - can't be struck and strikes nothing from half under till she rises (`invulnerable` every frame of it, none of
//     her hits landing meanwhile, her pose drawn under the floor);
//   - and makes no pipeline.
//   `--canary` plays it three times more, each with one fault planted (`BURROW_CANARY`): moving as she begins to
//   sink, rising unwarned, and rising on the hero; each must be caught, and the part says which were.
// - `rootBurrowPictures` (asked for by name): her burrow as the player sees it (her sinking, the ridge travelling,
//   the warned rise), and her sinking from her side at a man's eye, to show her body really goes down.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { CAMERA } from '../../../src/data/balance';
import { setZoom } from '../../../src/core/renderer';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { groundHeight } from '../../../src/world/ground';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { BURROW_CANARY, BURROW_LOG, clearSpot, type BurrowLog } from '../../../src/entities/rootBurrow';
import { FX } from '../../../src/entities/enemyAI';
import { fixed, type BossOptions } from './boss';
import { rootmother, standClear } from './bossRootmother';

const B = ROOTMOTHER.burrow;
/** frames a second on the lab's clock, and the most frames a case waits for her burrow and follows it */
const FPS = 60;
const CASE_FRAMES = 22 * FPS;
/** her place's change in a frame under which she hasn't moved (m) */
const STILL = 1e-4;
/** how far she may move while any of her stands over the floor (m) */
const MOVED_ABOVE = 0;
/** how far off the ring's distance the rise may be (m), and how near its warning's spot */
const RING_SLACK = 0.05;
const SPOT_SLACK = 0.05;

/** What a case read: the burrow's log, her moves, her drawn top's height over the floor at the frame she first moved
 *  (m: under 0 is under it), how far she moved with any of her over the floor, the frames under with her struck-proof
 *  or not, her hits landing while under, the pipelines made. */
interface BurrowCase {
  log: BurrowLog | null;
  firstMoveTop: number;
  movedAbove: number;
  moved: number;
  underFrames: number;
  openUnder: number;
  hitsUnder: number;
  made: number;
}

/** How far her drawn top stands over the floor where she is (m): the highest corner of each of her meshes' bounds as
 *  drawn (her kept pools, the cage's and the burrow's, left out), less the floor's height under her. */
function topOver(boss: Enemy): number {
  boss.model.root.updateWorldMatrix(true, true);
  let top = -Infinity;
  const box = new THREE.Box3();
  boss.model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.pooled || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    top = Math.max(top, box.max.y);
  });
  return top - groundHeight(boss.pos.x, boss.pos.z);
}

/** Her hits on this game while `body` runs (the fx her attacks land by), counted with their times. */
const HITS = ['branch', 'erupt', 'thorns', 'crush', 'creeper'] as const;

/** One burrow: her grown, the hero standing still off her, her wait to burrow given over; read frame by frame. */
async function oneBurrow(lab: Lab, options: BossOptions): Promise<BurrowCase> {
  await standClear(lab, options);
  const boss = await rootmother(lab);
  const result: BurrowCase = {
    log: null, firstMoveTop: NaN, movedAbove: 0, moved: 0, underFrames: 0, openUnder: 0, hitsUnder: 0, made: 0,
  };
  const was = BURROW_LOG[BURROW_LOG.length - 1] ?? null;
  const logNow = (): BurrowLog | null => {
    const last = BURROW_LOG[BURROW_LOG.length - 1] ?? null;
    return last === was ? null : last;
  };
  boss.dazed = 0;
  boss.brain.burrowT = 0;
  boss.brain.farT = B.farFor;
  boss.cd = 0.2;
  const made = PIPELINES.made;
  const hitsAt: number[] = [];
  const fxTable = FX as unknown as Record<string, (...a: number[]) => void>;
  const own = HITS.map((name) => fxTable[name]);
  HITS.forEach((name, i) => { fxTable[name] = (...a: number[]) => { hitsAt.push(G.time); own[i](...a); }; });
  let last = boss.pos.clone();
  try {
    await lab.step(CASE_FRAMES, () => {
      // (her cage and her heart held off: a hero standing still would be caged, and her heart holds her still)
      boss.brain.cageT = 1e9;
      boss.brain.heartT = 1e9;
      return {};
    }, () => {
      const log = logNow();
      if (log) result.log = log;
      const step = Math.hypot(boss.pos.x - last.x, boss.pos.z - last.z);
      last = boss.pos.clone();
      if (step > STILL) {
        const top = topOver(boss);
        if (Number.isNaN(result.firstMoveTop)) result.firstMoveTop = top;
        if (top > 0) result.movedAbove += step;
        result.moved += step;
      }
      if (log && log.riseAt < 0 && G.time - log.startedAt >= B.sink * B.hidden) {
        result.underFrames++;
        if (!boss.invulnerable) result.openUnder++;
      }
    });
  } finally {
    HITS.forEach((name, i) => { fxTable[name] = own[i]; });
  }
  const log = result.log;
  if (log) {
    const from = log.startedAt + B.sink * B.hidden, to = log.riseAt < 0 ? Infinity : log.riseAt;
    result.hitsUnder = hitsAt.filter((t) => t > from && t < to).length;
  }
  result.made = PIPELINES.made - made;
  return result;
}

/** A case's lines and its problems, each led by `part`. */
function judge(part: string, c: BurrowCase, lines: string[], problems: string[]): void {
  const log = c.log;
  if (!log || log.roseAt < 0) {
    lines.push(`${part}: ${log ? 'she went under and never rose' : 'she never burrowed'}`);
    problems.push(`${part}: ${log ? 'she never rose again' : 'she never burrowed'} in ${CASE_FRAMES / FPS} s`);
    return;
  }
  const warned = log.riseAt - log.warnedAt;
  const ring = Math.hypot(log.toX - log.heroX, log.toZ - log.heroZ);
  const under = log.riseAt - log.startedAt;
  lines.push(`${part}: went under ${fixed(B.sink, 1)} s, travelled ${fixed(log.travel, 2)} s `
    + `(${fixed(Math.hypot(log.toX - log.fromX, log.toZ - log.fromZ), 1)} m), its rise warned ${fixed(warned, 2)} s at `
    + `its spot, rose ${fixed(ring, 2)} m from the hero; ${fixed(under, 2)} s from her sink to her rise, `
    + `${fixed(log.roseAt - log.startedAt, 2)} s in all`);
  lines.push(`${part}: moved ${fixed(c.moved, 2)} m, ${fixed(c.movedAbove, 3)} m of it with any of her over the floor; `
    + `her top ${fixed(c.firstMoveTop, 2)} m over the floor as she first moved; struck-proof `
    + `${c.underFrames - c.openUnder} of ${c.underFrames} frames from half under to her rise; ${c.hitsUnder} of her hits landed meanwhile; `
    + `${c.made} pipelines made`);
  if (c.movedAbove > MOVED_ABOVE) problems.push(`${part}: moved ${fixed(c.movedAbove, 2)} m with her over the floor`);
  if (!(c.firstMoveTop < 0)) {
    problems.push(`${part}: first moved with her top ${fixed(c.firstMoveTop, 2)} m over the floor`);
  }
  if (warned < B.warn - 1 / FPS) problems.push(`${part}: her rise warned ${fixed(warned, 2)} s, under ${B.warn}`);
  const off = Math.hypot(boss(log).x - log.toX, boss(log).z - log.toZ);
  if (off > SPOT_SLACK) problems.push(`${part}: she rose ${fixed(off, 2)} m off its warned spot`);
  if (ring < B.ring[0] - RING_SLACK || ring > B.ring[1] + RING_SLACK) {
    problems.push(`${part}: rose ${fixed(ring, 2)} m from the hero, not ${B.ring[0]} to ${B.ring[1]}`);
  }
  const her = G.enemies.find((e) => e.id === log.id);
  if (her && !clearSpot(her, log.toX, log.toZ)) {
    problems.push(`${part}: rose on a spot not clear (a prop, the wall or a hero)`);
  }
  if (c.openUnder > 0) problems.push(`${part}: open to hits ${c.openUnder} frames while under`);
  if (c.hitsUnder > 0) problems.push(`${part}: ${c.hitsUnder} of her hits landed while she was under`);
  if (c.made > 0) problems.push(`${part}: ${c.made} pipelines made`);
}

/** Where she stands now (the boss the log names). */
function boss(log: BurrowLog): { x: number; z: number } {
  const her = G.enemies.find((e) => e.id === log.id);
  return her ? { x: her.pos.x, z: her.pos.z } : { x: NaN, z: NaN };
}

/** `rootBurrow`: her burrow read as the game played it; with the canary, once more for each fault planted. */
export async function rootBurrow(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  judge('rootBurrow', await oneBurrow(lab, { ...options, canary: false }), lines, options.canary ? [] : problems);
  if (!options.canary) return;
  for (const plant of ['slide', 'unwarned', 'onHero'] as const) {
    BURROW_CANARY[plant] = true;
    const caught: string[] = [];
    try {
      judge(`rootBurrow: canary ${plant}`, await oneBurrow(lab, options), lines, caught);
    } finally {
      BURROW_CANARY[plant] = false;
    }
    lines.push(`rootBurrow: canary ${plant}: ${caught.length ? `caught (${caught.length})` : 'went unseen'}`);
    problems.push(...caught);
  }
}

// --- pictures -----------------------------------------------------------------------------------------------

/** her burrow's moments as the player sees it (s from its start, or `rise` from her rise), and the side strip's frames
 *  between pictures through her sink, and its distance (m) */
const SEEN = [0.15, 0.5, 0.85, 1.2] as const;
const SIDE_EVERY = 6;
const SIDE_DISTANCE = 18;

/** `rootBurrowPictures`: her sink, the ridge travelling and her warned rise as the player sees them, and her sink from
 *  her side at a man's eye. */
export async function rootBurrowPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standClear(lab, options);
  // (the top view zoomed out as far as a player may, so her sink 14 m off is on the screen beside him)
  setZoom(CAMERA.maxZoom);
  await lab.step(30);
  const her = await rootmother(lab);
  her.dazed = 0;
  her.brain.burrowT = 0;
  her.brain.farT = B.farFor;
  her.cd = 0.2;
  const moments: Pictured[] = [];
  const was = BURROW_LOG[BURROW_LOG.length - 1] ?? null;
  let sideShot = 0, seen = 0, ridge = 0, warn = 0, rise = 0;
  for (let frame = 0; frame < CASE_FRAMES; frame++) {
    await lab.step(1, () => {
      her.brain.cageT = 1e9;
      her.brain.heartT = 1e9;
      return {};
    });
    const log = BURROW_LOG[BURROW_LOG.length - 1];
    if (!log || log === was) continue;
    const t = G.time - log.startedAt;
    const at = new THREE.Vector3(log.fromX, 3, log.fromZ);
    // (her sink from her side, every few frames)
    if (t <= B.sink + 0.2 && Math.round(t * FPS) === sideShot * SIDE_EVERY) {
      moments.push(lab.picture(`sink side ${sideShot + 1}`, ['left'], [`her sink from her side, ${fixed(t, 2)} s in`],
        { at, distance: SIDE_DISTANCE }));
      sideShot++;
    }
    if (seen < SEEN.length && t >= SEEN[seen]) {
      moments.push(await lab.screen(`sink ${seen + 1}`, [`her sink as the player sees it, ${fixed(t, 2)} s in`]));
      seen++;
    }
    const under = B.sink, warned = B.sink + log.travel;
    if (ridge < 3 && t >= under + (log.travel * (ridge + 0.5)) / 3) {
      moments.push(await lab.screen(`ridge ${ridge + 1}`, [`the ridge over her way, ${fixed(t - under, 2)} s under`]));
      ridge++;
    }
    if (warn < 3 && t >= warned + (B.warn * (warn + 0.3)) / 3) {
      const note = `the ground bulging where she'll rise, ${fixed(t - warned, 2)} s in`;
      moments.push(await lab.screen(`warn ${warn + 1}`, [note]));
      warn++;
    }
    if (log.riseAt >= 0 && rise < 4 && G.time - log.riseAt >= (B.rise * (rise + 0.4)) / 3) {
      moments.push(await lab.screen(`rise ${rise + 1}`, [`her rise, ${fixed(G.time - log.riseAt, 2)} s in`]));
      rise++;
    }
    if (rise >= 4) break;
  }
  setZoom(1);
  lines.push(`rootBurrowPictures: ${moments.length} moments`);
  return moments;
}
