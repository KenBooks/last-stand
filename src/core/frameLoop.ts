// The game's frames: each drawn as the browser asks for one (vsync, the default), or uncapped, drawn again as soon as
// the last one is done. Uncapped, the screen still shows its own rate (the browser shows the newest frame at each of
// its refreshes and drops the rest), but a frame's cost is what it costs: synced to a 60 Hz screen, the GPU's time a
// frame read 14 ms where it was 7, the rest waiting for the screen to take the frame, and a faster build looked the
// same as a slower one once both reached the screen's rate (from play, "running on 60 FPS bumps GPU frame to double").
// A setting (Settings' Frame rate, the cookie `last-stand-vsync`) or `?vsync=0` for one visit; a hidden tab always
// waits for the browser, uncapped or not (nothing it draws is seen).
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
}

channel.port2.onmessage = () => run(performance.now());

/** Runs `frame` every frame from now on, with the frame's time (ms, on `performance.now`'s clock). */
export function runFrames(frame: (timestamp: number) => void): void {
  step = frame;
  requestAnimationFrame(run);
}
