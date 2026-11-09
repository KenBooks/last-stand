// The pause menu's profiler (its Performance tab, `perf/profiler.ts`): Profile this spot times each part of the frame
// where the hero stands on this device, shows the costliest, and sends the whole of it as a performance report with
// the player's consent: at once where Slow-game reports is Always, else when they press Send. While it runs every
// panel is hidden (`body.profiling`: the pause menu's blur over the whole screen cost a phone's GPU each frame), the
// scene alone shown, with a pane at the top saying how far it is, and Cancel (or Esc) stopping it.
import { sfx } from '../core/audio';
import { traceConsent, sendProfile } from '../perf/consent';
import {
  canProfile, profile, profileLines, ProfileCancelled, type Profile, type ProfileProgress,
} from '../perf/profiler';

/** the parts listed under the button (the report has them all) */
const PARTS_SHOWN = 5;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

/** the last profile's lines, sent by Send */
let found: string[] = [];
/** whether a profile is running (its button and the pause menu held meanwhile) */
let running = false;
/** whether the running profile was asked to stop */
let cancelling = false;

/** The note under the button. */
function note(text: string): void {
  $('.profile-note').textContent = text;
}

/** The costliest parts as list items: what each takes and its share of the frame. */
function showParts(result: Profile): void {
  const list = $('.profile-parts');
  list.replaceChildren(...result.parts.slice(0, PARTS_SHOWN).map((part) => {
    const item = document.createElement('li');
    const takes = part.on - part.off;
    const share = result.frame > 0 ? Math.round((100 * takes) / result.frame) : 0;
    item.textContent = `${part.name.replace(/ \(\d+\)$/, '')}: ${takes.toFixed(1)} ms (${share}%)`;
    return item;
  }));
  list.classList.remove('hidden');
}

/** Sends the last profile, saying how it went. */
async function send(): Promise<void> {
  const button = $<HTMLButtonElement>('#btn-profile-send');
  button.disabled = true;
  note('Sending the report...');
  const sent = await sendProfile(found);
  const sentNote = `Report sent, thank you. Its code: ${'code' in sent ? sent.code : ''}`;
  note('code' in sent ? sentNote : `The report couldn't be sent (${sent.error})`);
  button.classList.toggle('hidden', 'code' in sent);
  button.disabled = false;
}

/** The pane at the top showing how far the profile is: its share, the part timed and the time left. */
function paneShower(): (progress: ProfileProgress) => void {
  const started = performance.now();
  const fill = $('#profiling .prof-fill');
  const part = $('#profiling .prof-part');
  const left = $('#profiling .prof-left');
  let shownAt = 0;
  return (progress) => {
    const now = performance.now();
    if (now - shownAt < 100 && progress.done < progress.total) return;
    shownAt = now;
    const share = progress.done / progress.total;
    fill.style.transform = `scaleX(${share})`;
    part.textContent = `Timing ${progress.part.replace(/ \(\d+\)$/, '')}`;
    const seconds = ((now - started) / progress.done) * (progress.total - progress.done) / 1000;
    left.textContent = `${Math.round(share * 100)}%, about ${Math.max(1, Math.ceil(seconds))} s left`;
  };
}

/** Every panel hidden and the pane shown while it runs, or the pause menu back. */
function showRunning(on: boolean): void {
  document.body.classList.toggle('profiling', on);
  $('#profiling').classList.toggle('hidden', !on);
  if (!on) return;
  $('#profiling .prof-fill').style.transform = 'scaleX(0)';
  $('#profiling .prof-part').textContent = 'Starting...';
  $('#profiling .prof-left').textContent = '';
}

/** Profiles the frame as it stands, then shows it and sends it as the player chose. */
async function run(): Promise<void> {
  if (running) return;
  running = true;
  cancelling = false;
  const button = $<HTMLButtonElement>('#btn-profile');
  button.disabled = true;
  $('#btn-profile-send').classList.add('hidden');
  $('.profile-parts').classList.add('hidden');
  showRunning(true);
  try {
    const result = await profile({ onProgress: paneShower(), cancelled: () => cancelling });
    found = profileLines(result);
    const fps = result.frame > 0 ? Math.round(1000 / result.frame) : 0;
    note(`The frame here: ${result.frame.toFixed(1)} ms (${fps} fps). Its costliest parts:`);
    showParts(result);
    if (traceConsent() === 'always') void send();
    else $('#btn-profile-send').classList.remove('hidden');
  } catch (error) {
    if (!(error instanceof ProfileCancelled)) throw error;
    note('Profiling cancelled. Nothing was sent.');
  } finally {
    running = false;
    showRunning(false);
    button.disabled = false;
  }
}

/** Whether the profiler is running: the pause menu stays open meanwhile. */
export const profiling = (): boolean => running;

/** Stops the running profile (Cancel, or Esc), every part put back. */
export function cancelProfile(): void {
  if (running) cancelling = true;
}

/** The Performance tab's profiler wired up. */
export function initProfileTab(): void {
  const button = $<HTMLButtonElement>('#btn-profile');
  if (!canProfile()) {
    button.disabled = true;
    note('The profiler times WebGL\'s frames: switch the renderer to WebGL');
  }
  button.onclick = () => {
    sfx.click();
    void run();
  };
  $('#btn-profile-send').onclick = () => {
    sfx.click();
    void send();
  };
  $('#btn-profile-cancel').onclick = () => {
    sfx.click();
    cancelProfile();
  };
}
