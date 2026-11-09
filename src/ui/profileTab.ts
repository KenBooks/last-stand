// The pause menu's profiler (its Performance tab, `perf/profiler.ts`): Profile this spot times each part of the frame
// where the hero stands on this device, shows the costliest, and sends the whole of it as a performance report with
// the player's consent: at once where Slow-game reports is Always, else when they press Send.
import { sfx } from '../core/audio';
import { traceConsent, sendProfile } from '../perf/consent';
import { canProfile, profile, profileLines, type Profile } from '../perf/profiler';

/** the parts listed under the button (the report has them all) */
const PARTS_SHOWN = 5;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

/** the last profile's lines, sent by Send */
let found: string[] = [];
/** whether a profile is running (its button and the tabs held meanwhile) */
let running = false;

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

/** Profiles the frame as it stands, then shows it and sends it as the player chose. */
async function run(): Promise<void> {
  if (running) return;
  running = true;
  const button = $<HTMLButtonElement>('#btn-profile');
  button.disabled = true;
  $('#btn-profile-send').classList.add('hidden');
  $('.profile-parts').classList.add('hidden');
  try {
    const result = await profile({ onPart: (at, of) => note(`Profiling... ${at} of ${of}`) });
    found = profileLines(result);
    const fps = result.frame > 0 ? Math.round(1000 / result.frame) : 0;
    note(`The frame here: ${result.frame.toFixed(1)} ms (${fps} fps). Its costliest parts:`);
    showParts(result);
    if (traceConsent() === 'always') void send();
    else $('#btn-profile-send').classList.remove('hidden');
  } finally {
    running = false;
    button.disabled = false;
  }
}

/** Whether the profiler is running: the pause menu stays open meanwhile. */
export const profiling = (): boolean => running;

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
}
