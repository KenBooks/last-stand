// The actual Start/Stop/Send controls, through failure and retry, without allowing a test upload to production.
import { middleOf, realWait, type Lab, type Report } from './lab';
import { recorder } from '../../../src/perf/recorder';
import { MOST_A_DAY, setTraceConsent, traceConsent } from '../../../src/perf/consent';
import { decodeTrace, type Trace } from '../../../src/perf/traceFormat';
import { pauseTab } from '../../../src/ui/menus';
import { G } from '../../../src/state';

const button = (id: string): HTMLButtonElement => document.getElementById(id)! as HTMLButtonElement;
const note = (): string => document.getElementById('recording-note')!.textContent ?? '';

function manualProblems(trace: Trace): string[] {
  const problems = trace.header.reason.why === 'manual' && trace.header.frames >= 6
    ? [] : ['the sent trace was not the manual capture'];
  // Native pointer timestamps use the real browser clock; this fixture has already advanced the parked clock 45 s.
  // Their apparent delay may exceed the planted 800 ms, so require it to survive as a lower bound, not an exact max.
  if (!trace.header.marks.some(([, text]) => text.startsWith('input ') && text.includes('down 1, up 1, handled 1')
    && text.includes('delay 5000 ms') && Number(/move delay ([0-9]+) ms/.exec(text)?.[1]) >= 800)) {
    problems.push('the final partial-second key/movement arrival counts or delivery delays were lost');
  }
  return problems;
}

/** Compression and HTTP use real tasks, not the lab's parked clock. */
async function waited(lab: Lab, done: () => boolean, what: string): Promise<void> {
  for (let tick = 0; tick < 1000 && !done(); tick++) { await lab.step(1); await realWait(5); }
  if (!done()) throw new Error(`lab: manual recording: ${what}`);
}

export async function manualRecording(lab: Lab, server: string, canary: boolean): Promise<Report> {
  const problems: string[] = [], lines: string[] = [];
  const preference = traceConsent(), fetch = window.fetch;
  const policyKey = 'last-stand-perf-traces', savedPolicy = localStorage.getItem(policyKey);
  const bodies: Uint8Array[] = [];
  let permitted = false, automaticPosts = 0;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (init?.method !== 'POST' || !url.endsWith('/traces')) return fetch.call(window, input, init);
    if (!permitted) { automaticPosts++; return new Response('', { status: 503 }); }
    bodies.push(new Uint8Array(init.body as Uint8Array));
    if (bodies.length === 1) return new Response('', { status: 503 });
    return fetch.call(window, `${server}/traces`, init);
  };
  try {
    setTraceConsent('always');
    if (!G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
    pauseTab('performance');
    recorder.mark('outside the manual interval');
    await lab.clickOn(button('btn-recording'));
    if (recorder.recordingSince() === null) throw new Error('lab: manual recording never started');
    if (recorder.wanted() || !recorder.automaticSuppressed() || recorder.pending()) {
      problems.push('automatic report detection was not suppressed by Start recording');
    }
    await lab.clickOn(document.querySelector('#opt-resolution [data-r="0.5"]')!);
    recorder.mark('inside the manual interval');
    const delayed = new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j', bubbles: true });
    Object.defineProperty(delayed, 'timeStamp', { value: performance.now() - 5000 });
    window.dispatchEvent(delayed);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ', key: 'j', bubbles: true }));
    const movement = new PointerEvent('pointermove', { bubbles: true });
    Object.defineProperty(movement, 'timeStamp', { value: performance.now() - 800 });
    window.dispatchEvent(movement);
    await lab.step(6);
    await lab.clickOn(button('btn-recording'));
    await waited(lab, () => !button('btn-recording-send').disabled, 'Stop never produced a sendable capture');
    recorder.mark('after the stopped recording');
    await lab.step(5);
    // A previous automatic report / its client quota must not disable an explicitly requested upload.
    const policy = JSON.parse(localStorage.getItem(policyKey)!);
    localStorage.setItem(policyKey, JSON.stringify({ ...policy, sent: Array(MOST_A_DAY).fill(Date.now()) }));
    permitted = true;
    await lab.clickOn(button('btn-recording-send'));
    await waited(lab, () => note().startsWith('Could not send'), 'the failed send was not reported');
    if (button('btn-recording-send').disabled) problems.push('a failed send could not be retried');
    await lab.clickOn(button('btn-recording-send'));
    await waited(lab, () => note().startsWith('Recording sent.'), 'retry never sent the kept recording');
    const code = /Code: ([A-Z0-9-]+)/.exec(note())?.[1];
    if (!code) problems.push('the manual send returned no report code');
    if (bodies.length !== 2 || bodies[0].length !== bodies[1].length || bodies[0].some((v, i) => v !== bodies[1][i])) {
      problems.push('retry changed the stopped recording');
    }
    const raw = await new Response(new Blob([bodies[1] as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const trace = decodeTrace(new Uint8Array(raw));
    const marks = trace.header.marks.map(([, text]) => text);
    problems.push(...manualProblems(trace));
    if (marks.includes('outside the manual interval') || marks.includes('after the stopped recording')) {
      problems.push('the recording included work outside Start/Stop');
    }
    if (!marks.includes('resolution 50%') || !marks.some(text => text.startsWith('keyboard delivery delayed 5000 ms'))) {
      problems.push('resolution or delayed-keyboard timing was lost');
    }
    if (![...trace.columns.state].some(state => state & 4)) problems.push('paused menu frames were not captured');
    if (automaticPosts || recorder.automaticSuppressed() || traceConsent() !== 'always') {
      problems.push('manual sending changed the saved preference or failed to pause/resume automatic reports');
    }
    lines.push(`manual Start/Stop: ${trace.header.frames} frames, ${(bodies[1].length / 1024).toFixed(1)} KB; `
      + 'paused frames, resolution and delayed-keyboard marks kept; outside frames excluded; failed send retried unchanged',
    'automatic reports stayed suppressed through capture/review, then resumed the unchanged preference',
    `manual recording sent to the traces service: ${code}`);
    // Both bounds must stop before the ring can overwrite the selected start, even at uncapped frame rates.
    const maxFrames = recorder.recordingMaxFrames, limitMs = recorder.recordingLimitMs;
    try {
      recorder.recordingMaxFrames = 4;
      await lab.tap(middleOf(button('btn-recording')));
      if (recorder.recordingSince() === null) throw new Error('lab: manual recording did not start from a touch');
      await lab.step(8);
      const capped = recorder.stopRecording();
      if (capped?.snapshot.frames !== 4 || !recorder.automaticSuppressed()) problems.push('the manual frame cap lost its selected interval');
      recorder.releaseRecording();
      recorder.recordingMaxFrames = maxFrames;
      recorder.recordingLimitMs = 30;
      recorder.startRecording();
      await lab.step(8);
      const timed = recorder.stopRecording();
      if (!timed || timed.tookMs > 60 || timed.snapshot.frames > 4) problems.push('the manual time cap did not stop capture');
    } finally {
      recorder.recordingMaxFrames = maxFrames;
      recorder.recordingLimitMs = limitMs;
    }
    lines.push('touch started capture; frame and time limits stopped it before its selected start was overwritten; automatic client quota did not block manual Send');
    if (canary) {
      const planted = { ...trace, header: { ...trace.header, reason: { ...trace.header.reason, why: 'stalls' } } };
      if (!manualProblems(planted).length) problems.push('canary: an automatic report passed as a manual recording');
      lines.push('canary: an automatic report cannot satisfy the manual-capture reason');
      const missing = { ...trace, header: { ...trace.header, marks: trace.header.marks.filter(([, text]) => !text.startsWith('input ')) } };
      if (!manualProblems(missing).length) problems.push('canary: losing input arrival diagnostics passed');
      lines.push('canary: lost input-arrival diagnostics cannot pass the stopped recording');
    }
  } finally {
    window.fetch = fetch;
    setTraceConsent(preference);
    if (savedPolicy === null) localStorage.removeItem(policyKey);
    else localStorage.setItem(policyKey, savedPolicy);
    recorder.releaseRecording();
    if (G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
  }
  return { text: lines.join('\n'), problems };
}
