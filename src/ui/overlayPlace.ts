// Where the player put the overlays down the left (`#diag`) on a touch screen: a finger held still on the performance
// overlay lifts them, moved with it, and they stay where it lets go, kept in a cookie (#245: on a phone the overlay
// and the pause button shared the top left corner). Put by the compositor, as the lobby's clearance puts them
// (`--clear-x`, `--clear-y`, `clearOverlays` in `menus.ts`), and kept on the screen: the performance overlay whole
// inside the window, however it was put on a screen of another size.
import { readCookie, writeCookie } from '../core/cookies';

/** the cookie the place is kept in: `x,y`, the overlays' offset from their corner (css px) */
const PLACE_COOKIE = 'last-stand-overlays-place';

interface Offset { x: number; y: number }
/** the offsets that keep the performance overlay inside the window, as it is laid out now */
interface Bounds { left: number; right: number; top: number; bottom: number }

/** where the player put them (null: never moved, their corner) */
let placed: Offset | null = readPlace();
/** the finger moving them: where it went down, and the offset they had then */
let grab: { x0: number; y0: number; from: Offset } | null = null;
/** the bounds read for a way the page is laid out (`boundsKey`), forgotten when the overlay's size changes */
let bounds: { key: string; within: Bounds } | null = null;
const resized = new ResizeObserver(() => { bounds = null; });
let watched = false;

function readPlace(): Offset | null {
  const [x, y] = (readCookie(PLACE_COOKIE) ?? '').split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

const perf = (): HTMLElement | null => document.querySelector<HTMLElement>('#perf');
const diag = (): HTMLElement => document.querySelector<HTMLElement>('#diag')!;

/** The overlays' offset as the page has it now (css px). */
function offsetNow(): Offset {
  const style = diag().style;
  return { x: parseFloat(style.getPropertyValue('--clear-x')) || 0, y: parseFloat(style.getPropertyValue('--clear-y')) || 0 };
}

const boundsKey = (): string => `${innerWidth}x${innerHeight} ${document.body.className}`;

/** The offsets that keep the performance overlay inside the window: read from its box, once a way it's laid out. */
function boundsNow(): Bounds | null {
  const overlay = perf();
  if (!overlay?.offsetParent) return null;
  if (!watched) {
    watched = true;
    resized.observe(overlay);
  }
  const key = boundsKey();
  if (bounds?.key === key) return bounds.within;
  const box = overlay.getBoundingClientRect();
  const now = offsetNow();
  const left = box.left - now.x, top = box.top - now.y;
  const within = { left: -left, right: innerWidth - box.width - left, top: -top, bottom: innerHeight - box.height - top };
  bounds = { key, within };
  return within;
}

/** `at` kept inside `within`. */
function inside(at: Offset, within: Bounds): Offset {
  return {
    x: Math.round(Math.max(within.left, Math.min(within.right, at.x))),
    y: Math.round(Math.max(within.top, Math.min(within.bottom, at.y))),
  };
}

/** Where the player put the overlays, kept inside the window as it is now; null where they never moved them. */
export function overlaysPlaced(): Offset | null {
  if (!placed) return null;
  const within = boundsNow();
  return within ? inside(placed, within) : placed;
}

/** Whether a finger holds the overlays now. */
export const overlaysHeld = (): boolean => !!grab;

/** The overlays lifted by a finger at `x`, `y` (css px), from where they stand. */
export function grabOverlays(x: number, y: number): void {
  bounds = null;
  grab = { x0: x, y0: y, from: offsetNow() };
  perf()?.classList.add('held');
}

/** The overlays moved with the finger holding them, kept inside the window. */
export function dragOverlays(x: number, y: number): void {
  if (!grab) return;
  const to = { x: grab.from.x + x - grab.x0, y: grab.from.y + y - grab.y0 };
  const within = boundsNow();
  placed = within ? inside(to, within) : to;
}

/** The overlays let go where they are, and the place kept. */
export function dropOverlays(): void {
  if (!grab) return;
  grab = null;
  perf()?.classList.remove('held');
  if (placed) writeCookie(PLACE_COOKIE, `${placed.x},${placed.y}`);
}

/** The overlays put back in their corner, where the player never moved them (for a harness: tools/lab `touchpad`). */
export function forgetOverlaysPlace(): void {
  placed = null;
  grab = null;
  perf()?.classList.remove('held');
}
