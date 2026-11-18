// `lab ui`'s `behindProps` state (`../uiKit.ts` `Steps`): a column planted between the camera and each dummy's label:
// every label hidden behind it.
import { G } from '../../../../src/state';
import { YARD, yardToWorld } from '../../../../src/data/village';
import type { Obstacle } from '../../../../src/types';
import { anchoredLabels, OWN_PROP } from '../../../../src/ui/floaters';
import type { Lab } from '../lab';
import { metersBehindHero } from '../uiBehindHero';
import { caught, READOUTS_IN_FRAMES, standAt, standBack } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** how far to the side of the line to a dummy's label the canary plants its column (m): clear of the line */
const ASIDE = 3;
/** a planted column's radius and height (m): taller than any line from the camera to a label over the dais */
const COLUMN = { r: 0.5, h: 40 };
/** how far past a label's own props a planted column stands (m) */
const PAST_OWN = 0.1;
/** how long the camera may glide into the view a state before left it (frames) */
const CAMERA_SETTLES = 240;
/** a camera moving less than this a frame is still (m) */
const CAMERA_STILL = 1e-4;
/** the canary's plants: the columns beside the lines, and the meters placed seeing no hero (`../uiBehindHero.ts`) */
const BESIDE = { name: 'shown through a prop', what: 'the labels beside the columns' };
const NO_HERO = { name: 'shown over the hero', what: 'the meters placed seeing no hero' };

/** The dummies' labels shown now (each label anchored within a metre of a standing dummy), and how many there are. */
function dummyLabels(): { shown: number; all: number } {
  const dummies = G.enemies.filter((enemy) => enemy.def.dummy && enemy.alive);
  const near = (at: { x: number; z: number }) => dummies.some((d) => Math.hypot(d.pos.x - at.x, d.pos.z - at.z) < 1);
  const labels = anchoredLabels().filter(({ at }) => at && near(at));
  return { shown: labels.filter(({ label }) => label.shown).length, all: labels.length };
}

/**
 * A column for each dummy's label on the line from the camera to it (`aside`: that far off the line): half way along,
 * or nearer the camera where half way is within the label's own props (`OWN_PROP`, which never hide it). On a short
 * screen the camera stands nearly over the dummies, and a column half way stood by the label as its own.
 */
function columnsBefore(aside: number): Obstacle[] {
  const from = G.camera.position;
  return anchoredLabels().flatMap(({ at }) => {
    if (!at) return [];
    const dx = at.x - from.x, dz = at.z - from.z, length = Math.hypot(dx, dz) || 1;
    const fromLabel = Math.max(length / 2, COLUMN.r + OWN_PROP + PAST_OWN);
    if (fromLabel > length - COLUMN.r - PAST_OWN) {
      throw new Error(`lab: ui: no room for a column between the camera and a label ${length.toFixed(2)} m off`);
    }
    const along = 1 - fromLabel / length;
    const x = from.x + dx * along - (dz / length) * aside;
    const z = from.z + dz * along + (dx / length) * aside;
    return [{ x, z, ...COLUMN }];
  });
}

/** Frames until the camera stands still: a column planted on the line to a label as the camera followed him back
 *  out of the yard (`views` closing before this) stood off the line a frame later. */
async function cameraSettled(lab: Lab): Promise<void> {
  const was = G.camera.position.clone();
  await lab.until(() => {
    const moved = G.camera.position.distanceTo(was);
    was.copy(G.camera.position);
    return moved < CAMERA_STILL;
  }, CAMERA_SETTLES, 'the camera came to rest');
}

/** The hero stood in the training yard facing its dummies, their readouts faded in and the camera at rest: left to
 *  `views` before it, the state ran as he was put back out of the yard, its readouts fading and the camera moving. */
async function standByDummies(lab: Lab): Promise<void> {
  await standAt(lab, yardToWorld(0, -2), YARD.turn);
  await lab.until(() => dummyLabels().shown > 0, READOUTS_IN_FRAMES, "the dummies' readouts faded in in the yard");
  await cameraSettled(lab);
}

/**
 * The dummies' labels behind a prop: a column planted between the camera and each (beside the line in the canary)
 * must hide every one, and with the columns gone every one shows again (#288: the labels showed through an obelisk).
 */
async function labelsBehindProps(canary: boolean, lab: Lab): Promise<Found> {
  const open = dummyLabels();
  const columns = columnsBefore(canary ? ASIDE : 0);
  G.arena.obstacles.push(...columns);
  await lab.step(1);
  const behind = dummyLabels();
  G.arena.obstacles.splice(G.arena.obstacles.length - columns.length, columns.length);
  await lab.step(1);
  const after = dummyLabels();
  const heroes = await metersBehindHero(lab, canary);
  const lines = [`  the dummies' labels: ${open.shown} of ${open.all} shown in the open, ${behind.shown} behind `
    + `${columns.length} columns, ${after.shown} with them gone`, ...heroes.lines];
  const problems: string[] = [...heroes.problems];
  if (!open.all) problems.push('behindProps: no label over a dummy was found');
  if (open.shown < open.all) problems.push(`behindProps: ${open.all - open.shown} labels hidden in the open`);
  if (behind.shown > 0) problems.push(`behindProps: ${behind.shown} labels shown through a prop`);
  if (after.shown < open.shown) problems.push(`behindProps: ${open.shown - after.shown} labels stayed hidden`);
  return { lines, problems };
}

const STATE: Steps = {
  order: 110,
  open: standByDummies,
  close: standBack,
  check: labelsBehindProps,
  canary: caught(BESIDE, NO_HERO),
};
export default STATE;
