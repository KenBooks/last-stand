// tools/lab ui `talk` and `talkTouch`: the talk with the library's Brother Hollis (src/ui/talk.ts) at each screen size,
// his lines all shown and the replies offered at a first meeting (the most replies a hero who's fought is offered:
// six), by the mouse's screen and on touch. The card and every reply within the window, each reply the element at its
// middle, his portrait and name plate shown; on touch each reply a finger's height. Its canary makes the card twice the
// window's height, which must be found.
import { closeTalk, openTalk, talkAnswerable } from '../../../src/ui/screens/talk/talk';
import { portraitMade } from '../../../src/ui/guide/portraits';
import { realWait } from './lab';
import { G } from '../../../src/state';
import { goTo } from '../../../src/game/village';
import type { Lab } from './lab';
import { touchMode, type TouchFound } from './uiTouch';

/** the canary's problem, and what it plants */
export const TALK_CANARY = { name: 'the talk card leaves the window', what: 'the card twice the window\'s height' };
/** the least height of a reply on touch (css px): a finger's */
const FINGER_PX = 32;
/** the most frames for his lines to show once Enter is pressed (the card's fade, and some) */
const SHOWN_FRAMES = 30;
/** the most real time his portrait may take to be made behind the lobby (ms): its compile and encoding run on the
 *  browser's own time, between the lab's frames */
const PORTRAIT_MS = 20000;

/** Frames on, each with a little of the browser's own time, till his portrait is made behind the lobby; how many. */
export async function portraitWaited(lab: Lab): Promise<number> {
  const giveUp = window.__labClock.realNow() + PORTRAIT_MS;
  let frames = 0;
  while (!portraitMade('scholar')) {
    if (window.__labClock.realNow() > giveUp) throw new Error(`lab: his portrait was never made (${PORTRAIT_MS / 1000} s)`);
    await lab.step(1);
    await realWait(5);
    frames++;
  }
  return frames;
}

/** The talk opened as a hero who's fought opens it, his lines all shown by Enter; on touch, in touch mode first. */
export async function openTalkState(lab: Lab, touch: boolean): Promise<void> {
  if (touch) {
    await touchMode(lab);
    // (the tap that puts the page in touch mode walks him to what it lands on in the village: the Party Board, whose
    // co-op dialog then opened over the talk and asked the relay's health. He stays where he stands.)
    goTo(G.player.pos.x, G.player.pos.z);
  }
  await portraitWaited(lab);
  delete G.profile.talk;
  Object.assign(G.profile.records, { runs: Math.max(1, G.profile.records.runs) });
  openTalk('scholar');
  // (the rest of his lines shown as a player would: on touch, a tap on the first; else Enter)
  await lab.until(() => document.querySelectorAll('#talk .tk-says p').length > 0, SHOWN_FRAMES, 'his first line never showed');
  if (touch) {
    const r = document.querySelector('#talk .tk-says')!.getBoundingClientRect();
    await lab.tap({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  } else await lab.step(1, () => ({ keys: ['enter'] }));
  await lab.until(talkAnswerable, SHOWN_FRAMES, 'the talk\'s lines never all showed');
  // (the replies' fade in)
  await lab.step(30);
}

export function closeTalkState(): void { closeTalk(); }

/** The card, its portrait and every reply checked; with the canary, again with the card twice the window's height. */
export function talkShown(state: string, canary: boolean): TouchFound {
  const found = laidOut(state, state === 'talkTouch');
  if (!canary) return found;
  const box = document.querySelector<HTMLElement>('#talk .tk-box')!;
  Object.assign(box.style, { height: `${innerHeight * 2}px`, maxHeight: 'none' });
  const planted = laidOut(state, false);
  Object.assign(box.style, { height: '', maxHeight: '' });
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}

function laidOut(state: string, touch: boolean): TouchFound {
  const problems: string[] = [];
  const within = (r: DOMRect) => r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  const box = document.querySelector('#talk .tk-box')!.getBoundingClientRect();
  if (!within(box)) problems.push(`${state}: ${TALK_CANARY.name} (${box.left.toFixed(0)},${box.top.toFixed(0)} to ${box.right.toFixed(0)},${box.bottom.toFixed(0)})`);
  const photo = document.querySelector<HTMLCanvasElement>('#talk .tk-photo')!;
  if (!document.querySelector('#talk .tk-portrait')!.classList.contains('pictured') || !photo.width) {
    problems.push(`${state}: his portrait's picture isn't shown`);
  }
  for (const what of ['.tk-portrait', '.tk-name']) {
    const r = document.querySelector(`#talk ${what}`)!.getBoundingClientRect();
    if (!within(r)) problems.push(`${state}: his ${what === '.tk-name' ? 'name' : 'portrait'} isn't shown within the window`);
  }
  const replies = [...document.querySelectorAll<HTMLElement>('#talk .tk-reply')];
  let shortest = Infinity;
  for (const b of replies) {
    const r = b.getBoundingClientRect(), name = b.querySelector('.tx')?.textContent ?? '';
    shortest = Math.min(shortest, r.height);
    if (!within(r)) problems.push(`${state}: the reply "${name}" leaves the window`);
    else if (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.tk-reply') !== b) {
      problems.push(`${state}: the reply "${name}" isn't the element at its middle`);
    }
    if (touch && r.height < FINGER_PX) problems.push(`${state}: the reply "${name}" is ${r.height.toFixed(0)} css px tall (a finger's ${FINGER_PX})`);
  }
  if (replies.length < 6) problems.push(`${state}: ${replies.length} replies offered to a hero who's fought (6)`);
  const lines = [`  the card ${box.width.toFixed(0)}x${box.height.toFixed(0)} css px at ${box.left.toFixed(0)},${box.top.toFixed(0)}, `
    + `${replies.length} replies, the shortest ${shortest.toFixed(0)} css px tall`];
  return { lines, problems };
}
