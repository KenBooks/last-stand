// The input's lag (`--scenario latency`): how long from a key's press to the GPU finishing the frame that read it.
// From play: "Vsync off raises FPS but makes the game feel laggy". Uncapped, a frame is begun as soon as the last
// one's commands are sent, not drawn: the GPU's queue may fill several frames deep, and a press read by the newest
// frame waits behind all of them. The probe (`watchLatency`, run in the page) times each press to the frame's
// start, its first submit to WebGPU's queue after the press, and to the queue saying the work submitted with it is
// done (`onSubmittedWorkDone`); the display's own wait for its refresh comes on top, the same either way.

/** a press every this long (ms), held as a finger holds a key (ms), and the key (one the lobby does nothing with) */
const PRESS_EVERY_MS = 250;
const PRESS_HOLD_MS = 60;
const PRESS_KEY = 'KeyJ';

/**
 * In the page: from now on, each key press is timed to the start of the first frame that draws after it and to the
 * GPU's finishing it, into `window.__latency` (`{ samples: [{ toFrame, toDone }] }`, ms). Serialized into
 * the page, so all it uses is inside it.
 */
export function watchLatency() {
  const record = { samples: [], error: '', waits: window.__frameWaits };
  window.__latency = record;
  // (the game's uncapped frames' waits for the GPU, `?frameWaits`: counted from the presses' start)
  if (record.waits) Object.assign(record.waits, { frames: 0, waited: 0, ms: 0 });
  const waiting = [];
  window.addEventListener('keydown', (event) => { if (!event.repeat) waiting.push(event.timeStamp); }, true);
  if (!window.GPUQueue) record.error = 'no WebGPU';
  else watchSubmits(record, waiting);

  /** The frames: each press's first submit after it, timed to the queue's work done. */
  function watchSubmits(into, presses) {
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function submitTimed(buffers) {
      const result = submit.call(this, buffers);
      if (!presses.length) return result;
      const frameAt = performance.now();
      const pressed = presses.splice(0);
      void this.onSubmittedWorkDone().then(() => {
        const now = performance.now();
        for (const press of pressed) into.samples.push({ toFrame: frameAt - press, toDone: now - press });
      });
      return result;
    };
  }
}

/** Presses the probe's key every `PRESS_EVERY_MS` for `ms`, as a player taps one. */
export async function pressInTurn(page, ms) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    await page.keyboard.press(PRESS_KEY, { delay: PRESS_HOLD_MS });
    await page.waitForTimeout(PRESS_EVERY_MS - PRESS_HOLD_MS);
  }
}

/** The value at `share` (0 to 1) of `values` sorted. */
export function quantile(values, share) {
  if (!values.length) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/** The probe's samples said in a line: the presses, and the median and 90th percentile of each wait. */
export function latencyLine(record) {
  if (!record || record.error) return `input lag not measured: ${record?.error ?? 'no probe'}`;
  const { samples } = record;
  const said = (key) => {
    const values = samples.map((sample) => sample[key]);
    return `median ${quantile(values, 0.5).toFixed(1)} ms, p90 ${quantile(values, 0.9).toFixed(1)}`;
  };
  return `input lag over ${samples.length} presses: to the frame that read it ${said('toFrame')}; `
    + `to the GPU done with it ${said('toDone')}${waitsSaid(record.waits)}`;
}

/** The game's uncapped frames that waited for the GPU (`?frameWaits`), said after the lag, or nothing. */
function waitsSaid(waits) {
  if (!waits) return '';
  const each = waits.waited ? (waits.ms / waits.waited).toFixed(1) : '0';
  return `; ${waits.waited} of ${waits.frames} frames waited for the GPU, ${each} ms each`;
}
