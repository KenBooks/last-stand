// A player-controlled performance capture, independent of automatic slow-game prompts and their session limits.
import { recorder } from '../perf/recorder';
import { canSend, gzip, sendTrace, traceOf } from '../perf/upload';
import { TRACE_MAX_BYTES } from '../perf/traceFormat';
import { putAway } from '../perf/consent';
import { sfx } from '../core/audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id)! as T;
let body: Uint8Array | null = null;
let busy = false;

function note(text: string): void { $('recording-note').textContent = text; }
function controls(): void {
  const recording = recorder.recordingSince() !== null;
  const toggle = $<HTMLButtonElement>('btn-recording');
  toggle.textContent = recording ? 'Stop recording' : 'Start recording';
  toggle.disabled = busy || body !== null;
  toggle.classList.toggle('hidden', body !== null || (busy && !recording));
  toggle.classList.toggle('danger', recording);
  const send = $<HTMLButtonElement>('btn-recording-send');
  send.classList.toggle('hidden', !body);
  send.disabled = busy || !body || body.length > TRACE_MAX_BYTES || !canSend();
  $('btn-recording-discard').classList.toggle('hidden', !recorder.automaticSuppressed() || recording || busy);
}

async function stop(): Promise<void> {
  const capture = recorder.stopRecording();
  if (!capture) return;
  busy = true;
  controls();
  note('Preparing the recording...');
  try {
    const duration = capture.tookMs / 1000;
    // Unlike automatic packing, do not silently discard the first half of a requested recording to fit.
    body = capture.snapshot.frames > 0 ? await gzip(traceOf(capture)) : null;
    if (!body) note('No frames were captured. Discard and try again.');
    else if (body.length > TRACE_MAX_BYTES) note(`Recording is too large (${Math.ceil(body.length / 1024)} KB). Discard and record a shorter interval.`);
    else note(`${duration.toFixed(1)} s recorded, ${(body.length / 1024).toFixed(1)} KB. Send when ready; automatic reports are paused.`);
  } catch {
    note('The recording could not be prepared. Discard and try again.');
  } finally { busy = false; controls(); }
}

async function send(): Promise<void> {
  if (busy || !body || body.length > TRACE_MAX_BYTES || !canSend()) return;
  busy = true;
  controls();
  note('Sending the recording...');
  const sent = await sendTrace(body);
  busy = false;
  if ('code' in sent) {
    body = null;
    recorder.releaseRecording();
    note(`Recording sent. Code: ${sent.code}`);
  } else note(`Could not send (${sent.error}). The recording is kept; try Send recording again.`);
  controls();
}

export function initRecordingTab(): void {
  $('btn-recording').onclick = () => {
    if (busy || body) return;
    sfx.click();
    if (recorder.recordingSince() !== null || recorder.recordingFinished()) { void stop(); return; }
    putAway();
    recorder.startRecording();
    tick();
    controls();
  };
  $('btn-recording-send').onclick = () => { sfx.click(); void send(); };
  $('btn-recording-discard').onclick = () => {
    if (busy) return;
    sfx.click();
    body = null;
    recorder.releaseRecording();
    note('Record up to 60 s, then stop and send. Automatic reports pause during capture and review.');
    controls();
  };
  setInterval(tick, 1000);
  controls();
}

function tick(): void {
  if (recorder.recordingFinished() && !busy) { void stop(); return; }
  const since = recorder.recordingSince();
  if (since === null) return;
  const elapsed = performance.now() - since;
  if (elapsed >= recorder.recordingLimitMs) { void stop(); return; }
  note(`Recording ${Math.floor(elapsed / 1000)} / 60 s, including menus. Automatic reports are paused.`);
}
