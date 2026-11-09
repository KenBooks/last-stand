// A fire's flames over the logs in it, seen from above as the player stands over a bonfire. The flames are a box
// marched in its fragment shader, depth-tested at the box's faces alone: the logs inside the box were drawn over by
// the flames behind them, and those reaching out of it hid the flames in front of them (the owner: "half of campfire
// ignores it, while the other half does not"). The shader hides what's behind a log as far as it knows the logs
// (`uLogs` in world/fire.ts). Read: where the logs are drawn (their meshes' pixels in the lab's `parts` look), the
// share whose light the flames change, set against the same with the logs taken from the shader (the canary's
// drawing, the bug as it was): what lit them through the logs must go, leaving the flames in front of them.
import * as THREE from 'three';

/** a pixel counts as lit by the flames past this many levels (of 255) on its brightest channel (their bloom and
 *  the frame's grade move the logs by less: past 8, 85% of them were lit with the logs known and 93% unknown) */
const LIT = 40;
/** the share of the logs' pixels the flames light through them at most: the flames standing in front of the logs,
 *  and their bloom over dark bark, light some of them (the bonfire from above: 45% with its logs known, 64% unknown) */
const LIT_MOST = 0.55;
/** logs drawn over fewer pixels than this say nothing */
const LOGS_LEAST = 400;

/** What the reading needs of the fire, the camera already set over it. */
export interface OverLogs {
  /** the game drawn now, read back */
  draw: () => ImageData;
  /** which pixels of the drawing the logs cover (1 where they do) */
  logsDrawn: () => Uint8Array;
  /** the flames' volume (its material's `uLogs` the logs the shader knows) */
  flames: THREE.Mesh;
  canary: boolean;
}

/** The logs' pixels, the share of them the flames light as drawn and with the logs unknown to the shader, the
 *  picture, and where each was found (the logs grey, those the flames light red). */
export interface LogsReading {
  logs: number;
  lit: number;
  unknownLit: number;
  /** the share of the logs' pixels that knowing the logs changed (the flames behind them hidden) */
  hidden: number;
  image: ImageData;
  /** the picture with the logs unknown to the flames (as before they knew them) */
  unknownImage: ImageData;
  found: ImageData;
}

/** the found picture's colours: a log, a log the flames light */
const LOG_SHADE = [90, 90, 90];
const LIT_SHADE = [255, 40, 40];

/** The logs the flames' shader knows (a tree before them has none). */
const logsOf = (flames: THREE.Mesh): { value: THREE.Vector4[] } | undefined =>
  (flames.material as THREE.ShaderMaterial).uniforms.uLogs;

/** Whether `flames` know any log. */
export const knowsLogs = (flames: THREE.Mesh): boolean => !!logsOf(flames)?.value.some((end) => end.w > 0);

/** Whether pixel `i` (its first channel's index) differs between `a` and `b` by more than `LIT`. */
function changed(a: ImageData, b: ImageData, i: number): boolean {
  const step = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])));
  return step > LIT;
}

/** `read` with the flames hidden. */
function withoutFlames<T>(flames: THREE.Mesh, read: () => T): T {
  flames.visible = false;
  try {
    return read();
  } finally {
    flames.visible = true;
  }
}

/** `read` with the logs taken from the flames' shader (each 0 thick). */
export function logsUnknown<T>(flames: THREE.Mesh, read: () => T): T {
  const known = logsOf(flames);
  if (!known) return read();
  const kept = known.value;
  known.value = kept.map(() => new THREE.Vector4());
  try {
    return read();
  } finally {
    known.value = kept;
  }
}

/** The share of the `logs` pixels lit in `whole` (against `bare`), painted into `found` if given. */
function litShare(whole: ImageData, bare: ImageData, logs: Uint8Array, found?: ImageData): number {
  let count = 0;
  let lit = 0;
  for (let i = 0; i < whole.data.length; i += 4) {
    if (!logs[i / 4]) continue;
    count++;
    const isLit = changed(whole, bare, i);
    if (isLit) lit++;
    if (found) {
      found.data.set(isLit ? LIT_SHADE : LOG_SHADE, i);
      found.data[i + 3] = 255;
    }
  }
  return count ? lit / count : 0;
}

/** The fire over its logs: drawn whole, without its flames, and with its logs unknown to them (as the canary draws
 *  it, as it is). */
export function readOverLogs(over: OverLogs): LogsReading {
  const draw = () => (over.canary ? logsUnknown(over.flames, over.draw) : over.draw());
  const whole = draw();
  const bare = withoutFlames(over.flames, over.draw);
  const unknown = logsUnknown(over.flames, over.draw);
  const logs = over.logsDrawn();
  const found = new ImageData(whole.width, whole.height);
  const lit = litShare(whole, bare, logs, found);
  const unknownLit = litShare(unknown, bare, logs);
  const hidden = litShare(whole, unknown, logs);
  return { logs: logs.reduce((sum, at) => sum + at, 0), lit, unknownLit, hidden, image: whole,
    unknownImage: unknown, found };
}

/** The reading as a line, and its problems (the canary's: it must find the flames over the logs). */
export function logsFound(reading: LogsReading, canary: boolean): { line: string; problems: string[] } {
  const share = (value: number) => `${(value * 100).toFixed(1)}%`;
  const line = `  from above: the flames light ${share(reading.lit)} of the logs' ${reading.logs} pixels `
    + `(${share(reading.unknownLit)} with the logs unknown to them; knowing them changed ${share(reading.hidden)})`;
  if (reading.logs < LOGS_LEAST) return { line, problems: [`from above, the logs cover only ${reading.logs} pixels`] };
  const over = reading.lit > LIT_MOST;
  if (canary) {
    return { line, problems: over ? [] : ['canary: the flames drawn over logs they didn\'t know went unseen'] };
  }
  return { line, problems: over ? [`from above, the flames are drawn over the logs (${share(reading.lit)} lit)`] : [] };
}
