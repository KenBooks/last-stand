// The input's lag (`--scenario latency`): how long from a key's press to the GPU finishing the frame that read it.
// From play: "Vsync off raises FPS but makes the game feel laggy". Uncapped, a frame is begun as soon as the last
// one's commands are sent, not drawn: the GPU's queue may fill several frames deep, and a press read by the newest
// frame waits behind all of them. The probe (`watchLatency`, run in the page) puts a fence into the game's WebGL
// context after the first frame that drew after each press, and times the press to the frame's start and to the
// fence's signal; the display's own wait for its refresh comes on top, the same either way. On WebGPU
// (`?renderer=webgpu`) the frame starts at its first submit after the press, and is done when the queue says the
// work submitted with it is (`onSubmittedWorkDone`).

/** a press every this long (ms), held as a finger holds a key (ms), and the key (one the lobby does nothing with) */
const PRESS_EVERY_MS = 250;
const PRESS_HOLD_MS = 60;
const PRESS_KEY = 'KeyJ';

/**
 * In the page: from now on, each key press is timed to the start of the first frame that draws after it and to the
 * GPU's finishing it, into `window.__latency` (`{ samples: [{ toFrame, toDone }], renderer }`, ms). Serialized into
 * the page, so all it uses is inside it.
 */
export function watchLatency() {
  const webgpu = /^webgpu$/.test(new URLSearchParams(location.search).get('renderer') ?? '');
  const record = { samples: [], error: '', renderer: webgpu ? 'WebGPU' : 'WebGL 2', waits: window.__frameWaits };
  window.__latency = record;
  // (the game's uncapped frames' waits for the GPU, `?frameWaits`: counted from the presses' start)
  if (record.waits) Object.assign(record.waits, { frames: 0, waited: 0, ms: 0 });
  const waiting = [];
  window.addEventListener('keydown', (event) => { if (!event.repeat) waiting.push(event.timeStamp); }, true);
  if (webgpu) {
    if (!window.GPUQueue) record.error = 'no WebGPU';
    else watchSubmits(record, waiting);
    return;
  }
  // (a canvas with no context yet would be given one by asking: only the game's, the largest, is asked)
  const canvases = [...document.querySelectorAll('canvas')];
  const largest = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const gl = largest?.getContext('webgl2');
  if (!gl) {
    record.error = 'no WebGL 2 canvas';
    return;
  }
  const fenced = [];
  const ping = new MessageChannel();
  const poll = () => {
    const now = performance.now();
    for (let index = fenced.length - 1; index >= 0; index--) {
      const { sync, press, frameAt } = fenced[index];
      if (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) continue;
      gl.deleteSync(sync);
      fenced.splice(index, 1);
      record.samples.push({ toFrame: frameAt - press, toDone: now - press });
    }
    if (fenced.length) ping.port2.postMessage(null);
  };
  ping.port1.onmessage = poll;
  // (the fence goes in once the frame's task has drawn all it draws: a microtask runs as its script ends)
  const fenceAfterFrame = (frameAt, presses) => queueMicrotask(() => {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    for (const press of presses) fenced.push({ sync, press, frameAt });
    ping.port2.postMessage(null);
  });
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const draw = gl[name].bind(gl);
    gl[name] = (...args) => {
      if (waiting.length) fenceAfterFrame(performance.now(), waiting.splice(0));
      return draw(...args);
    };
  }

  /** WebGPU's frames: each press's first submit after it, timed to the queue's work done. */
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
  const on = record.renderer ? ` (${record.renderer})` : '';
  const said = (key) => {
    const values = samples.map((sample) => sample[key]);
    return `median ${quantile(values, 0.5).toFixed(1)} ms, p90 ${quantile(values, 0.9).toFixed(1)}`;
  };
  return `input lag${on} over ${samples.length} presses: to the frame that read it ${said('toFrame')}; `
    + `to the GPU done with it ${said('toDone')}${waitsSaid(record.waits)}`;
}

/** The game's uncapped frames that waited for the GPU (`?frameWaits`), said after the lag, or nothing. */
function waitsSaid(waits) {
  if (!waits) return '';
  const each = waits.waited ? (waits.ms / waits.waited).toFixed(1) : '0';
  return `; ${waits.waited} of ${waits.frames} frames waited for the GPU, ${each} ms each`;
}
