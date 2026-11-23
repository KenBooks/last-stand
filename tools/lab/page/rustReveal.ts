// `lab rustcheck`'s check of what a loading screen waits for last (`sceneReady` in src/engine/pipelinesAside.ts):
// the lobby's own frame drawn until none of the pipelines it draws with is still compiling. A pipeline compiles
// aside and its draws are left out meanwhile; on a PC whose GPU's process was busy the lobby was shown with its
// ground left out, the sky's colour in its place (from play, "white ground on load", report 8YEZ-W9ZG). The lab
// holds pipelines back as a busy GPU would (`PIPELINES.hold`) and has the frame ask for new ones.
import type { Lab } from './lab';
import { apartShare, percent } from './rustPlain';
import { type Checked, failed, passed, pixelsIn } from './rustPixels';
import { RUST } from '../../../src/engine';
import { PIPELINES, releaseHeld, sceneReady } from '../../../src/engine/pipelinesAside';
import { render } from '../../../src/core/renderer';
import { G } from '../../../src/state';

/** the frames a switch is given before the frame is pictured */
const SETTLE_FRAMES = 6;
/** the share of the frame that may be apart between two pictures of it held still */
const STILL_SHARE = 0.0005;
/** the least share of the frame that must change with its pipelines held back (the canary: things left out) */
const LEFT_OUT_SHARE = 0.05;
/** the browser's frames the wait is watched for before the pipelines are let go, and given to end after */
const WATCHED_FRAMES = 20, ENDS_WITHIN = 600;

/** `frames` of the browser's own frames gone by. */
async function realFrames(frames: number): Promise<void> {
  for (let frame = 0; frame < frames; frame++) await window.__labClock.realFrame();
}

/**
 * Where the hero stands, the game held still: the frame is made to ask for pipelines it hasn't (the scene drawn in
 * one pass, `rust.depthFirst=0`) with every new pipeline held back. The frame then has things left out (the
 * canary: it must differ, and say how many pipelines it set unready), and `sceneReady` must not resolve while they're
 * held, and must once they're let go, the frame whole again.
 */
export async function sceneWaitsItsPipelines(lab: Lab): Promise<Checked> {
  const drawing = lab.drawing, paused = G.paused, depthFirst = RUST.tune.depthFirst;
  lab.drawing = true;
  G.paused = true;
  try {
    await lab.step(SETTLE_FRAMES);
    const whole = await pixelsIn(lab, undefined, 'reveal: the frame whole');
    const made = PIPELINES.made;
    PIPELINES.hold = true;
    RUST.tune.depthFirst = depthFirst ? 0 : 1;
    await lab.step(SETTLE_FRAMES);
    await realFrames(WATCHED_FRAMES);
    PIPELINES.unready = 0;
    await lab.step(1);
    const unready = PIPELINES.unready, asked = PIPELINES.made - made;
    const without = await pixelsIn(lab, undefined, 'reveal: its new pipelines held back');
    const leftOut = apartShare(whole, without);
    let ended = false;
    const waiting = sceneReady(render, Infinity).then(() => { ended = true; });
    await realFrames(WATCHED_FRAMES);
    const endedHeld = ended;
    releaseHeld();
    for (let frame = 0; frame < ENDS_WITHIN && !ended; frame++) await window.__labClock.realFrame();
    if (!ended) return failed('the wait for the frame\'s pipelines never ended once they were let go');
    await waiting;
    await lab.step(SETTLE_FRAMES);
    const after = await pixelsIn(lab, undefined, 'reveal: its pipelines ready');
    const back = apartShare(whole, after);
    if (!asked) return failed('the frame asked for no new pipeline with the depth drawn first switched: nothing to hold');
    if (!unready || leftOut < LEFT_OUT_SHARE) {
      return failed(`the canary: with ${asked} new pipelines held back the frame set ${unready} unready and changed `
        + `${percent(leftOut)} of its pixels, as if nothing were left out`);
    }
    if (endedHeld) return failed(`the wait ended with ${unready} of the frame's pipelines still compiling`);
    if (back > STILL_SHARE) {
      return failed(`once its pipelines were ready the frame is ${percent(back)} of its pixels apart from before`);
    }
    return passed(`a loading screen's last wait holds for the frame's own pipelines: with ${asked} held back the `
      + `frame set ${unready} unready and ${percent(leftOut)} of it was left out; the wait ended only once they `
      + `were let go, the frame whole (${percent(back)} of its pixels apart)`);
  } finally {
    releaseHeld();
    RUST.tune.depthFirst = depthFirst;
    G.paused = paused;
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}
