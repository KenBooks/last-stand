// `lab ui`'s `views` state (`../uiKit.ts` `Steps`): the lobby's camera switched through its views from the training
// yard: the labels over the dummies against their anchors.
import * as THREE from 'three';
import { G } from '../../../../src/state';
import { YARD, yardToWorld } from '../../../../src/data/village';
import { anchoredLabels } from '../../../../src/ui/floaters';
import { viewMode } from '../../../../src/core/renderer';
import type { Lab } from '../lab';
import { READOUTS_IN_FRAMES, standAt, standBack } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** the frames run after each press of V as the camera glides to the next view (its glide is 0.45 s) */
const SWITCH_FRAMES = 40;
/** a label further than this from where its anchor shows on the screen is off (css px) */
const LABEL_SLACK = 1;

/** One switch of the view: from which to which, the labels measured, and how far the furthest was off and when. */
interface Switch {
  from: string;
  to: string;
  labels: number;
  worst: number;
  worstFrame: number;
}

/** the view switches the `views` state played, for its check */
let switches: Switch[] = [];

/**
 * How far each label anchored to the world is from where its anchor shows by the camera as the frame draws it
 * (css px): the furthest, and how many were measured (shown, not held on the screen).
 */
function labelsOff(): { labels: number; worst: number } {
  const camera = G.camera.clone();
  camera.updateMatrixWorld();
  const point = new THREE.Vector3();
  let labels = 0;
  let worst = 0;
  for (const { label, at, clamp } of anchoredLabels()) {
    if (!at || clamp || !label.shown) continue;
    point.set(at.x, at.y, at.z).project(camera);
    if (point.z > 1) continue;
    const x = (point.x * 0.5 + 0.5) * innerWidth;
    const y = (-point.y * 0.5 + 0.5) * innerHeight;
    labels++;
    worst = Math.max(worst, Math.hypot(label.x - x, label.y - y));
  }
  return { labels, worst };
}

/**
 * The lobby's camera switched with V through every view and back to the top-down one, each glide played and drawn:
 * every frame of it, the labels over the dummies measured against where their anchors show. The hero stands in the
 * village's training yard facing its dummies (through the eyes, the labels are those before him).
 */
async function switchViews(lab: Lab): Promise<void> {
  switches = [];
  await standAt(lab, yardToWorld(0, -2), YARD.turn);
  // (the dummies' readouts faded in first: they fade in as he comes into the yard, and stood there two frames before
  // the first switch, none was measured through it)
  await lab.until(() => labelsOff().labels > 0, READOUTS_IN_FRAMES, 'the dummies\' readouts faded in in the yard');
  // (every frame drawn, as the game draws them: the drawing refreshed the camera's matrices once a frame)
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let press = 0; press < 3; press++) switches.push(await switchView(lab));
  } finally {
    lab.drawing = drawing;
  }
  if (viewMode() !== 'top') throw new Error(`lab: ui: the views ended in ${viewMode()}, not the top-down view`);
}

/** V pressed once and the glide to the next view played, the labels measured every frame of it. */
async function switchView(lab: Lab): Promise<Switch> {
  const from = viewMode();
  await lab.step(1, () => ({ keys: ['v'] }));
  const switched: Switch = { from, to: viewMode(), labels: 0, worst: 0, worstFrame: 0 };
  for (let frame = 0; frame < SWITCH_FRAMES; frame++) {
    await lab.step(1);
    const off = labelsOff();
    switched.labels = Math.max(switched.labels, off.labels);
    if (off.worst > switched.worst) {
      switched.worst = off.worst;
      switched.worstFrame = frame;
    }
  }
  return switched;
}

/** The labels through each switch as lines, and a problem for each switch that left them off their anchors. */
function labelsThroughSwitches(): Found {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const switched of switches) {
    const where = `${switched.from} to ${switched.to}`;
    lines.push(`  ${where}: ${switched.labels} labels, off their anchors by up to ${switched.worst.toFixed(1)} px `
      + `(frame ${switched.worstFrame})`);
    if (!switched.labels) problems.push(`views, ${where}: no label over the dummies was measured`);
    if (switched.worst > LABEL_SLACK) {
      problems.push(`views, ${where}: the labels were up to ${switched.worst.toFixed(1)} px off their anchors`);
    }
  }
  return { lines, problems };
}

const STATE: Steps = {
  order: 100,
  open: switchViews,
  close: standBack,
  check: labelsThroughSwitches,
};
export default STATE;
