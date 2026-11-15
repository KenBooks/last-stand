// The performance overlay moved by a finger (tools/lab `touchpad`, src/ui/touch.ts, src/ui/overlayPlace.ts; #245): on
// a phone it shared the top left corner with the pause button. A finger held still on it lifts it, and it moves with
// the finger, the hero standing meanwhile; let go, it stays, and its place is kept. A finger that slides at once from
// it walks the hero as anywhere on the move stick's pad, and one pushed past the window's edge leaves the overlay
// whole inside it. Its canary pins the overlays to their corner, which the drag must be caught failing to move.
import { input } from '../../../src/core/input';
import { readCookie, removeCookie } from '../../../src/core/cookies';
import type { Lab, PagePoint, Pictured } from './lab';
import { slide } from './touchStick';

/** the game's module that keeps the overlays' place: found by a glob, so an A/B's side from before it (#245) still
 *  loads this page, its drag reported never lifting the overlay */
interface OverlayPlace { forgetOverlaysPlace(): void }
const placeModules = import.meta.glob<OverlayPlace>('../../../src/ui/overlayPlace.ts', { eager: true });
const overlayPlace = Object.values(placeModules)[0];

/** the cookie the overlays' place is kept in (src/ui/overlayPlace.ts) */
const PLACE_COOKIE = 'last-stand-overlays-place';
/** the most frames a still finger is held before the overlay must be lifted, and the frames after a move or a lift */
const HOLD_MOST_FRAMES = 90;
const SETTLE_FRAMES = 2;
/** a touch let go this soon is a tap, which copies a report (src/ui/touch.ts `TAP_MS`): no hold may lift it sooner */
const TAP_MS = 350;
/** where the finger takes the overlay (css px): right and down from where it lifted it */
const DRAG = { x: 160, y: -60 };
/** how far the overlay may end from where the finger took it (css px) */
const NEAR_PX = 3;
/** the least push that counts as the stick started, and how far a finger slides at once to start it (css px) */
const STARTED = 0.05;
const NUDGE = 30;
/** where a finger is pushed past the window's edge to (css px) */
const PAST = -1000;

/** What a part of the check found. */
export interface DragFound {
  lines: string[];
  problems: string[];
  /** the overlay where the finger let it go */
  moment: Pictured;
}

/** the canary's name, as its problem says it */
const CANARY_NAME = 'stayed in its corner';

/** The performance overlay's box, which must be shown. */
function overlayBox(): DOMRect {
  const overlay = document.querySelector<HTMLElement>('#perf');
  if (!overlay?.offsetParent) throw new Error('lab: touchpad: the performance overlay isn\'t shown');
  return overlay.getBoundingClientRect();
}

/** Where a finger takes the overlay: the middle of its frame rate's line. */
function grip(): PagePoint {
  const head = document.querySelector('#perf .pf-head');
  if (!head) throw new Error('lab: touchpad: the performance overlay has no .pf-head');
  const box = head.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

const held = (): boolean => !!document.querySelector('#perf.held');

/** A still finger held on the overlay until it's lifted: how long that took (ms on the lab's clock), or null. */
async function holdUntilLifted(lab: Lab, at: PagePoint): Promise<number | null> {
  const start = performance.now();
  await lab.touchDown(at);
  for (let frame = 0; frame < HOLD_MOST_FRAMES; frame++) {
    await lab.step(1);
    if (held()) return performance.now() - start;
  }
  return null;
}

/** The overlay lifted, slid `DRAG` and let go: whether it followed the finger and the hero stood. */
async function dragOnce(lab: Lab, problems: string[]): Promise<string[]> {
  const before = overlayBox();
  const from = grip();
  const took = await holdUntilLifted(lab, from);
  if (took === null) {
    await lab.touchUp();
    problems.push('a finger held still on the performance overlay never lifted it');
    return ['held still on the overlay: never lifted'];
  }
  if (took < TAP_MS) problems.push(`the overlay was lifted after ${took.toFixed(0)} ms, before a tap ends (${TAP_MS})`);
  const to = { x: from.x + DRAG.x, y: from.y + DRAG.y };
  await slide(lab, from, to);
  await lab.step(SETTLE_FRAMES);
  const pushed = Math.hypot(input.stick.x, input.stick.y);
  await lab.touchUp();
  await lab.step(SETTLE_FRAMES);
  const after = overlayBox();
  const moved = { x: after.left - before.left, y: after.top - before.top };
  const off = Math.hypot(moved.x - DRAG.x, moved.y - DRAG.y);
  if (off > NEAR_PX) {
    const by = `${moved.x.toFixed(0)},${moved.y.toFixed(0)}`;
    problems.push(`the overlay moved ${by} px for a finger's ${DRAG.x},${DRAG.y}: `
      + `it ${off < Math.hypot(DRAG.x, DRAG.y) / 2 ? 'fell behind' : CANARY_NAME}`);
  }
  if (pushed > STARTED) problems.push(`the hero walked while the overlay was held (the stick at ${pushed.toFixed(2)})`);
  if (held()) problems.push('the overlay was still held once the finger lifted');
  if (!readCookie(PLACE_COOKIE)) problems.push('the overlay\'s place wasn\'t kept');
  return [
    `held still on the overlay: lifted after ${took.toFixed(0)} ms`,
    `slid ${DRAG.x},${DRAG.y} px: the overlay moved ${moved.x.toFixed(1)},${moved.y.toFixed(1)}, the stick at `
      + `${pushed.toFixed(2)}, its place kept as ${readCookie(PLACE_COOKIE) ?? 'nothing'}`,
  ];
}

/** A finger that slides at once from the overlay: it must walk the hero and leave the overlay where it is. */
async function slideFromOverlay(lab: Lab, problems: string[]): Promise<string> {
  const before = overlayBox();
  const from = grip();
  await lab.touchDown(from);
  await slide(lab, from, { x: from.x + NUDGE, y: from.y });
  await lab.step(1);
  const pushed = Math.hypot(input.stick.x, input.stick.y);
  await lab.touchUp();
  await lab.step(SETTLE_FRAMES);
  const after = overlayBox();
  const moved = Math.hypot(after.left - before.left, after.top - before.top);
  if (pushed <= STARTED) problems.push('a finger sliding at once from the overlay didn\'t walk the hero');
  if (moved > NEAR_PX) problems.push(`a finger sliding at once from the overlay moved it ${moved.toFixed(0)} px`);
  return `slid at once from the overlay: the stick at ${pushed.toFixed(2)}, the overlay moved ${moved.toFixed(1)} px`;
}

/** The overlay dragged far past the window's top left: it must stay whole inside the window. */
async function dragPastEdge(lab: Lab, problems: string[]): Promise<string> {
  const from = grip();
  if ((await holdUntilLifted(lab, from)) === null) {
    await lab.touchUp();
    return 'pushed past the edge: never lifted';
  }
  await slide(lab, from, { x: PAST, y: PAST });
  await lab.touchUp();
  await lab.step(SETTLE_FRAMES);
  const box = overlayBox();
  const inside = box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  const at = `${box.left.toFixed(1)},${box.top.toFixed(1)}`;
  if (!inside) problems.push(`pushed past the window's edge, the overlay lay partly outside it, at ${at}`);
  return `pushed past the window's top left: the overlay at ${at}`;
}

/** The overlays put back in their corner, their place forgotten. */
async function forget(lab: Lab): Promise<void> {
  overlayPlace?.forgetOverlaysPlace();
  removeCookie(PLACE_COOKIE);
  await lab.step(SETTLE_FRAMES);
}

/** The overlays pinned to their corner, as a drag that moved nothing would leave them; or set free again. */
function pin(pinned: boolean): void {
  const diag = document.querySelector<HTMLElement>('#diag')!;
  if (pinned) diag.style.setProperty('translate', '0px 0px', 'important');
  else diag.style.removeProperty('translate');
}

/**
 * The performance overlay (shown, with the touch controls) dragged by a finger: lifted by a hold, moved with the
 * finger, kept inside the window; a finger sliding at once from it walking the hero. With `canary`, the drag again with
 * the overlays pinned to their corner, which must be caught.
 */
export async function dragsOverlay(lab: Lab, canary: boolean): Promise<DragFound> {
  const problems: string[] = [];
  await forget(lab);
  const lines = ['the performance overlay moved by a finger:'];
  const dragged = await dragOnce(lab, problems);
  lines.push(...dragged.map((line) => `  ${line}`));
  const moment = await lab.screen('the overlay moved by a finger', dragged);
  await forget(lab);
  lines.push(`  ${await slideFromOverlay(lab, problems)}`);
  lines.push(`  ${await dragPastEdge(lab, problems)}`);
  await forget(lab);
  if (canary) {
    pin(true);
    const planted: string[] = [];
    try {
      await dragOnce(lab, planted);
    } finally {
      pin(false);
      await forget(lab);
    }
    const caught = planted.some((problem) => problem.includes(CANARY_NAME));
    lines.push(caught ? 'canary: caught (the overlays pinned to their corner)' : '');
    if (!caught) problems.push('the canary went unseen: the overlays pinned to their corner');
  }
  return { lines: lines.filter(Boolean), problems, moment };
}
