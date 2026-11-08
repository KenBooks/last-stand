// The game's frames: each drawn as the browser asks for one (vsync, the default), or uncapped, drawn again as soon as
// the last one is done. Uncapped, the screen still shows its own rate (the browser shows the newest frame at each of
// its refreshes and drops the rest), but a frame's cost is what it costs: synced to a 60 Hz screen, the GPU's time a
// frame read 14 ms where it was 7, the rest waiting for the screen to take the frame, and a faster build looked the
// same as a slower one once both reached the screen's rate (from play, "running on 60 FPS bumps GPU frame to double").
// A setting (Settings' Frame rate, the cookie `last-stand-vsync`) or `?vsync=0` for one visit; a hidden tab always
// waits for the browser, uncapped or not (nothing it draws is seen).
// Uncapped, a frame waits until the GPU has done all but the last frame sent (`AHEAD`, by a fence in each frame's
// commands): begun as soon as the last one's commands were sent, a GPU-bound game queued 4 or 5 frames ahead of the
// GPU, and a press waited behind all of them, 152 ms from the key to the GPU done with the frame that read it, where
// synced it was 34 (from play: "Vsync off raises FPS but makes the game feel laggy"; `npm run stalls -- --scenario
// latency --url "this?vsync=1,this?vsync=0" --window 2560x1440 --scale 2`).
import { readCookie, writeCookie } from './cookies';

const COOKIE = 'last-stand-vsync';

/** `?vsync=0` or `?vsync=1` for this visit, over the setting */
const asked = new URLSearchParams(location.search).get('vsync');

let uncapped = asked !== null ? asked === '0' : readCookie(COOKIE) === 'off';

/** Whether frames are drawn uncapped now. */
export const framesUncapped = (): boolean => uncapped;

/** The setting: frames drawn uncapped (vsync off) or as the browser asks (on), kept for the next visit. */
export function setFramesUncapped(on: boolean): void {
  uncapped = on;
  writeCookie(COOKIE, on ? 'off' : 'on');
}

/** A frame's GPU work marked as it's sent: made after a frame's commands, it says whether the GPU is done with them. */
export type FrameFence = () => () => boolean;
let fenceOf: FrameFence | null = null;
/** the frames sent uncapped that the GPU may not be done with yet, the oldest first */
const inFlight: (() => boolean)[] = [];
/** how many frames sent an uncapped frame may begin ahead of the GPU's done with (one: the CPU's next frame overlaps
 *  the GPU's last) */
const AHEAD = 1;

/** Marks each uncapped frame's GPU work with `fence` (the renderer's), so frames never queue ahead of the GPU. */
export function setFrameFence(fence: FrameFence): void {
  fenceOf = fence;
}

/** A WebGL 2 context's fence: done once its sync object is signalled (the status a task later at the soonest). */
export function glFence(gl: WebGL2RenderingContext): FrameFence {
  return () => {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    let done = !sync;
    return () => {
      if (done || !sync) return true;
      done = gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED;
      if (done) gl.deleteSync(sync);
      return done;
    };
  };
}

/** A WebGPU device's fence: done once the work submitted before it is (`onSubmittedWorkDone`). */
export function gpuFence(queue: { onSubmittedWorkDone(): Promise<unknown> }): FrameFence {
  return () => {
    let done = false;
    void queue.onSubmittedWorkDone().then(() => { done = true; });
    return () => done;
  };
}

/** a channel a frame posts itself to, to run again as soon as the browser has handled what's waiting (a timeout is
 *  held to 4 ms once nested; a message isn't) */
const channel = new MessageChannel();
let step: ((timestamp: number) => void) | null = null;

/** The next frame asked for, as the setting and the tab's visibility have it. */
function next(): void {
  if (uncapped && !document.hidden) channel.port1.postMessage(null);
  else requestAnimationFrame(run);
}

function run(timestamp: number): void {
  next();
  step?.(timestamp);
  if (uncapped && fenceOf) inFlight.push(fenceOf());
  else inFlight.length = 0;
}

// (uncapped: the frame waits, asking again a message later, while the GPU has more than `AHEAD` frames to do)
channel.port2.onmessage = () => {
  while (inFlight.length && inFlight[0]()) inFlight.shift();
  if (uncapped && !document.hidden && inFlight.length > AHEAD) channel.port1.postMessage(null);
  else run(performance.now());
};

/** Runs `frame` every frame from now on, with the frame's time (ms, on `performance.now`'s clock). */
export function runFrames(frame: (timestamp: number) => void): void {
  step = frame;
  requestAnimationFrame(run);
}
