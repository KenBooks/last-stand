// `lab coop`'s `ping` scenario (page/coop.ts plays it, node/coopPings.mjs judges it): the guest pings a foe, a spot and
// an area with Ctrl held and let go (the area dragged from where Ctrl went down), then a spot by a finger held on the
// minimap, and the host a spot; each game records every ping it shows, its own and its partner's, with whether its pin
// and its ring show in the world and where on the arena the minimap drew it (read back from the minimap's pixels by
// this module's own sums, not the game's).
import * as THREE from 'three';
import { G } from '../../../src/state';
import { cameraYaw } from '../../../src/core/renderer';
import type { Frame } from './lab';

/** A point on the ground, x and z. */
type XZ = [number, number];

/** the game's pings on screen and its minimap's span, where the tree has them (an older one has no pings) */
type PingUi = typeof import('../../../src/ui/ping');
type Hud = typeof import('../../../src/ui/hud');
const pingUi = Object.values(import.meta.glob<PingUi>('../../../src/ui/ping.ts', { eager: true }))[0];
const hud = Object.values(import.meta.glob<Hud>('../../../src/ui/hud.ts', { eager: true }))[0];

/** A ping the scenario means: who pings it, what, where, an area's radius, how, and when it's let go (frames after
 *  the scenario settled); `near`: how far from `at` the sender's own game may put it (m: a minimap's pixel is 0.32). */
export interface PlannedPing { by: 'host' | 'guest'; kind: 'spot' | 'foe' | 'area'; at: XZ; r?: number; how: string; frame: number; near: number }

/** the dazed foe the guest pings, and where the minimap is held (its arena point) */
export const PING_FOE: XZ = [12, 15];

/** the frames Ctrl is held before it's let go, and of them the drag of an area's */
const HELD = 20;
const DRAG = 14;
/** the frames a finger is held on the minimap (its long press is 0.5 s), and the tap before it that puts the page in
 *  touch mode, as a phone's first touch does */
const PRESSED = 40;
const TAP_BEFORE = 10;

export const PINGS: PlannedPing[] = [
  { by: 'guest', kind: 'foe', at: PING_FOE, how: 'Ctrl let go on a foe', frame: 30, near: 0.5 },
  { by: 'guest', kind: 'spot', at: [18, 21], how: 'Ctrl let go on the floor', frame: 90, near: 0.3 },
  { by: 'guest', kind: 'area', at: [11, 25], r: 4, how: 'Ctrl dragged 4 m', frame: 160, near: 0.3 },
  { by: 'guest', kind: 'spot', at: [-8, 6], how: 'a finger held on the minimap', frame: 280, near: 0.7 },
  { by: 'host', kind: 'spot', at: [5, 23], how: 'Ctrl let go on the floor', frame: 340, near: 0.3 },
];

/** what the page's finger was over as it went down on the minimap (`elementFromPoint`: its id or tag) */
let pressedOn = '';

/** The foe as this game shows it nearest `at`. */
function foeAt(at: XZ): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null, bestDistance = Infinity;
  for (const foe of G.enemies) {
    const distance = Math.hypot(foe.pos.x - at[0], foe.pos.z - at[1]);
    if (!foe.alive || distance >= bestDistance) continue;
    bestDistance = distance;
    best = foe.pos.clone().setY(foe.height * 0.6);
  }
  return best;
}

/** A Ctrl ping's input: held `HELD` frames up to its frame with the aim on it (an area's dragged out `r` along x from
 *  its middle), the aim kept a few frames either side. */
function ctrlInput(p: PlannedPing, frame: number): Frame | null {
  const start = p.frame - HELD;
  if (frame < start - 5 || frame > p.frame + 5) return null;
  const held = frame >= start && frame < p.frame;
  let aim: THREE.Vector3 | null = new THREE.Vector3(p.at[0], 0, p.at[1]);
  if (p.kind === 'foe') aim = foeAt(p.at);
  else if (p.kind === 'area') aim.x += (p.r ?? 0) * Math.min(1, Math.max(0, (frame - start) / DRAG));
  return { aim: aim ?? undefined, keys: held ? ['controlleft'] : [] };
}

/** The minimap's canvas, its box on the page, its border as drawn, its inner width and its px a metre. */
function minimapFrame(): { c: HTMLCanvasElement; rect: DOMRect; border: number; inner: number; S: number } | null {
  const c = document.querySelector<HTMLCanvasElement>('#minimap');
  if (!c || !hud) return null;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1) return null;
  const border = c.clientLeft * (rect.width / c.offsetWidth);
  return { c, rect, border, inner: rect.width - 2 * border, S: c.width / hud.MINIMAP_METRES };
}

/** Where on the page the minimap shows the arena's point `at` (css px): its middle the arena's, turned by the
 *  camera's yaw. */
function onMinimap(at: XZ): [number, number] | null {
  const m = minimapFrame();
  if (!m) return null;
  const yaw = cameraYaw(), x = at[0] * m.S, z = at[1] * m.S, W = m.c.width;
  const px = x * Math.cos(yaw) - z * Math.sin(yaw) + W / 2, py = x * Math.sin(yaw) + z * Math.cos(yaw) + W / 2;
  return [m.rect.left + m.border + px / W * m.inner, m.rect.top + m.border + py / W * m.inner];
}

/** The arena's point the minimap's canvas pixel (x, y) shows. */
function fromMinimap(x: number, y: number): XZ | null {
  const m = minimapFrame();
  if (!m) return null;
  const W = m.c.width, yaw = -cameraYaw(), px = (x - W / 2) / m.S, py = (y - W / 2) / m.S;
  return [px * Math.cos(yaw) - py * Math.sin(yaw), px * Math.sin(yaw) + py * Math.cos(yaw)];
}

/** A finger on the page: down, up, or the mouse moved again (out of touch mode), on what's under `at` (css px). */
function finger(type: 'pointerdown' | 'pointerup', at: [number, number]): string {
  const under = document.elementFromPoint(at[0], at[1]);
  const init = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: at[0], clientY: at[1], bubbles: true, cancelable: true };
  (under ?? window).dispatchEvent(new PointerEvent(type, init));
  return under ? (under.id ? `#${under.id}` : under.tagName.toLowerCase()) : 'nothing';
}
function mouseAgain(): void {
  window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: 1, bubbles: true }));
}

/** A minimap ping's input: a tap on it first (the page into touch mode), then a finger held there `PRESSED` frames
 *  up to its frame, then the mouse back. */
function pressInput(p: PlannedPing, frame: number): Frame | null {
  const down = p.frame - PRESSED, tap = down - TAP_BEFORE;
  if (frame < tap || frame > p.frame + 1) return null;
  const at = onMinimap(p.at);
  if (at && frame === tap) { finger('pointerdown', at); finger('pointerup', at); }
  if (at && frame === down) pressedOn = finger('pointerdown', at);
  if (at && frame === p.frame) finger('pointerup', at);
  if (frame === p.frame + 1) mouseAgain();
  return {};
}

/** The input of `role`'s hero in `ping` at `frame` after it settled. */
export function pingInput(role: 'host' | 'guest', frame: number): Frame {
  for (const p of PINGS) {
    if (p.by !== role) continue;
    const input = p.how.includes('minimap') ? pressInput(p, frame) : ctrlInput(p, frame);
    if (input) return input;
  }
  return {};
}

/** A ping as one game shows it in one frame: who sent it (its slot), what and where, how long it has shown, whether
 *  its pin and ring show in the world, and the arena's point where the minimap drew it lately (none: not drawn). */
export interface PingSample {
  slot: number; kind: string; x: number; z: number; r: number; foe: number | null; age: number;
  pin: boolean; ring: boolean; map: XZ | null;
}

/** Every ping this game shows this frame (none in an older tree), and what its finger was last over on the minimap. */
export function pingsNow(): { pings: PingSample[]; pressedOn: string } {
  const pings = (pingUi?.pingsOnScreen() ?? []).map((p) => ({ ...p, map: p.map ? fromMinimap(p.map[0], p.map[1]) : null }));
  return { pings, pressedOn };
}

/** Each scenario starts with no finger on the minimap. */
export function resetPings(): void { pressedOn = ''; }
