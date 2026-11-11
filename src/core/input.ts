// Keyboard + mouse state. `pressed` holds keys that went down this frame. Touch controls
// (ui/touch.ts) feed the same state: a move stick, held skill keys and an aim point.
import * as THREE from 'three';
import { G } from '../state';
import { CAMERA } from '../data/balance';
import { tunable } from './tuning';
import { GROUND_LEVELS, groundHeight } from '../world/ground';
import { castSolid } from '../fx/stuckArrows';
import type { Enemy } from '../entities/enemy';

export const input = {
  down: new Set<string>(),
  pressed: new Set<string>(),
  mouse: { x: 0, y: 0, left: false, right: false, middle: false, overUI: false },
  wheel: 0,
  orbit: 0,                      // horizontal middle-drag this frame, px (rotates the camera)
  look: { x: 0, y: 0 },          // mouse movement this frame while the pointer is locked, px
  /** the close views aim at the screen centre (the crosshair), not the cursor */
  centerAim: false,
  ground: new THREE.Vector3(),   // cursor projected onto the arena floor (y 0, under the dais's top)
  /** the foe whose body the aim is on, the eye's ray met it there (none on the floor or a prop, or aimed by touch) */
  foe: null as Enemy | null,
  /** touch is the active input: the browser's emulated mouse events are ignored */
  touchMode: false,
  /** touch move stick: screen space, x right / y down, length 0..1 */
  stick: { x: 0, y: 0 },
  /** skill keys held down on the touch buttons */
  touch: new Set<string>(),
  /** touch aim point on the floor, replacing the cursor while set */
  aim: null as THREE.Vector3 | null,
};

/**
 * Let go of everything held: keys, mouse buttons, the touch stick and buttons. On leaving a run,
 * a release the page never saw (the hero died mid-stride, the touch controls hid under the finger)
 * mustn't keep the hero walking in the lobby.
 */
export function releaseInput(): void {
  input.down.clear(); input.pressed.clear(); input.touch.clear();
  input.mouse.left = input.mouse.right = input.mouse.middle = false;
  input.stick.x = input.stick.y = 0;
  input.aim = null;
}

let canvasEl: HTMLCanvasElement;
/** the close views lock the pointer for mouse look while a wave is on */
let lockWanted = false, lockTried = 0;
/** when the pointer lock was lost without being asked to (Esc): that same Esc mustn't also unpause */
export let lockLostAt = -1;
let onLockLost: () => void = () => {};
export const pointerLocked = (): boolean => !!canvasEl && document.pointerLockElement === canvasEl;
/** A move under the lock this large (css px) and this many times the one before it is the browser's own, not the hand's:
 *  Chrome on Windows sends one now and then, about half the window across, as it puts its hidden cursor back, and a
 *  long spin turned the view by about 180 degrees at once, back again spun the other way (#318; `lab spin`). A hand's
 *  move grows over a few events. */
const LOOK_JUMP = { least: 200, times: 6 };
/** the size of the last move under the lock (css px) */
let lastLook = 0;
/** A move under the lock taken as mouse look, unless it's the browser's own jump. */
function lookMove(e: MouseEvent): void {
  const size = Math.hypot(e.movementX, e.movementY);
  const jump = size > LOOK_JUMP.least && size > lastLook * LOOK_JUMP.times;
  // (kept whether taken or not: a flick begun fast loses its first move at the most)
  lastLook = size;
  if (jump) return;
  input.look.x += e.movementX;
  input.look.y += e.movementY;
}
function requestLock(): void {
  lockTried = performance.now();
  try { Promise.resolve(canvasEl.requestPointerLock()).catch(() => {}); } catch { /* not allowed right now */ }
}
/**
 * Called every frame: whether mouse look should hold the pointer. It's taken while the browser
 * still counts a recent key press or click as the player's (else the player clicks for it).
 */
export function wantPointerLock(on: boolean): void {
  lockWanted = on;
  if (!on) { if (pointerLocked()) document.exitPointerLock(); return; }
  if (!pointerLocked() && navigator.userActivation?.isActive && performance.now() - lockTried > 600) requestLock();
}
export function onPointerLockLost(fn: () => void): void { onLockLost = fn; }

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

/**
 * Where a ray meets the floor as it's seen: the first of its levels, from the top, standing at least that high where the
 * ray crosses it (the dais and its step stand above the floor). Met on the plane under them, the cursor over the dais
 * pointed 35 cm past what it showed: near the feet the hero turned away from it, and zoomed in, round the other way.
 */
function floorHit(r: THREE.Ray, out: THREE.Vector3): boolean {
  for (const y of GROUND_LEVELS) {
    plane.constant = -y;
    if (r.intersectPlane(plane, hit) && groundHeight(hit.x, hit.z) >= y) { out.set(hit.x, 0, hit.z); return true; }
  }
  return false;
}

/** Where a ray first enters an upright cylinder (round (x, z), radius `r`, from y0 up to y1): the distance along it, 0 if
 *  it starts inside, Infinity if it never does. A cheap test before what the cylinder stands for is met as it's drawn. */
function cylinder(r: THREE.Ray, x: number, z: number, rad: number, y0: number, y1: number): number {
  const o = r.origin, d = r.direction, fx = o.x - x, fz = o.z - z, a = d.x * d.x + d.z * d.z, c = fx * fx + fz * fz - rad * rad;
  // (the stretch of the ray inside the round, then inside the heights)
  let t0 = -Infinity, t1 = Infinity;
  if (a < 1e-12) { if (c > 0) return Infinity; } else {
    const b = 2 * (fx * d.x + fz * d.z), disc = b * b - 4 * a * c;
    if (disc < 0) return Infinity;
    const q = Math.sqrt(disc); t0 = (-b - q) / (2 * a); t1 = (-b + q) / (2 * a);
  }
  if (Math.abs(d.y) < 1e-12) { if (o.y < y0 || o.y > y1) return Infinity; } else {
    const u0 = (y0 - o.y) / d.y, u1 = (y1 - o.y) / d.y;
    t0 = Math.max(t0, Math.min(u0, u1)); t1 = Math.min(t1, Math.max(u0, u1));
  }
  return t1 < Math.max(t0, 0) ? Infinity : Math.max(t0, 0);
}

const _best = new THREE.Vector3(), _hits: THREE.Intersection[] = [];
/** the crosshair's aim on a body is no nearer the hero than this (m, across the floor): nearer, it goes on along the
 *  crosshair's ray to there. The hero aims from his own place at the point, and the camera stands behind and beside
 *  him: a point on a foe hugging him is beside him, and his aim wheeled 75 degrees to it and back as its paw crossed
 *  the crosshair, Void Lance's whole beam with it (3 to 4 flashes a second, #482). From this far the two lines are
 *  a few degrees apart, and what's under the crosshair that near is still in his aim's way. */
const AIM = tunable('aim', { near: 5 });

/**
 * How far along `r` (from `from` on, `most` at the most) it is `AIM.near` from the hero across the floor: `from`
 * where it's that far already.
 */
function clearOfHero(r: THREE.Ray, from: number, most: number): number {
  const hero = G.player?.pos;
  if (!hero) return from;
  const o = r.origin, d = r.direction, fx = o.x - hero.x, fz = o.z - hero.z;
  const a = d.x * d.x + d.z * d.z, b = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - AIM.near * AIM.near;
  const disc = b * b - 4 * a * c;
  // (a ray straight down, or one that never comes that near)
  if (a < 1e-12 || disc <= 0) return from;
  return Math.min(most, Math.max(from, (-b + Math.sqrt(disc)) / (2 * a)));
}
/** a foe's or a prop's cylinder round it, for the cheap test: a little wider than its circle, its arms and its edges out of
 *  it (a foe's: as far as its body reaches, drawn, if that's further) */
const ROUND = 1.3;
/**
 * The aim along a ray from the eye: the first thing it meets, as it's drawn, whatever it is: a foe's body, a prop, the
 * floor (and with nothing within `far`, the point `far` along it). Its point goes into `input.ground`, `y` how high it is
 * over the floor under it. A shot goes there and nowhere else: aimed at a man's chest over the floor, it flew over a
 * log, and on a foe the aim snapped to its feet. `offHero`: a body's point kept `AIM.near` off the hero (the crosshair's).
 */
function aimAlong(far: number, offHero = false): void {
  const r = ray.ray;
  let best = far, what = 'none', floor = far;
  if (floorHit(r, hit)) {
    const t = r.origin.distanceTo(hit.setY(groundHeight(hit.x, hit.z)));
    if (t < best) { best = floor = t; _best.copy(hit); what = 'floor'; }
  }
  // the foes and props whose cylinders the ray enters before that, nearest first, met as they're drawn
  const near: [number, () => void, Enemy | null][] = [];
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const y0 = e.obj.position.y, out = Math.max(e.radius * ROUND, e.reach.out), t = cylinder(r, e.pos.x, e.pos.z, out, y0, y0 + Math.max(e.height * 1.1, e.reach.top));
    if (t < best) near.push([t, () => { const h = castSolid(e.obj, ray); if (h) _hits.push(h); }, e]);
  }
  for (const o of G.arena.obstacles) {
    const base = groundHeight(o.x, o.z), t = cylinder(r, o.x, o.z, o.r * ROUND, base, base + o.h * ROUND);
    if (t < best) near.push([t, () => o.prop?.raycast(ray, _hits), null]);
  }
  near.sort((a, b) => a[0] - b[0]);
  let on: Enemy | null = null;
  for (const [t, meet, foe] of near) {
    if (t >= best) break;
    ray.far = best; _hits.length = 0;
    meet();
    for (const h of _hits) if (h.distance < best) { best = h.distance; _best.copy(h.point); what = 'body'; on = foe; }
  }
  ray.far = Infinity;
  input.foe = what === 'body' ? on : null;
  // (the foe met is still the one aimed at; the point alone goes on, to the floor or the aim's range at the most)
  if (offHero && what === 'body' && floor < Infinity) r.at(clearOfHero(r, best, floor), _best);
  if (what === 'none') { if (far === Infinity) return; _best.copy(r.origin).addScaledVector(r.direction, far); }
  input.ground.set(_best.x, _best.y - groundHeight(_best.x, _best.z), _best.z);
}

function keyName(e: KeyboardEvent): string {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  return e.code.toLowerCase(); // space, escape, shiftleft, ...
}

/** Alt, held in the close views for the cursor drawn over mouse look (ui/altCursor.ts) */
const alt = (k: string): boolean => k === 'altleft' || k === 'altright';

/** Typing in a text field (a room code, a confirmation) isn't playing: WASD mustn't walk the hero. */
const typing = (e: KeyboardEvent): boolean => e.target instanceof HTMLElement
  && (e.target.matches('textarea, input:not([type=checkbox], [type=radio], [type=range])') || e.target.isContentEditable);

export function initInput(canvas: HTMLCanvasElement): void {
  canvasEl = canvas;
  document.addEventListener('pointerlockchange', () => {
    if (pointerLocked() || !lockWanted) return;
    lockLostAt = performance.now();
    onLockLost();
  });
  window.addEventListener('keydown', (e) => {
    // (typing, the game's keys aren't the player's, but Alt still shows the cursor over mouse look: from play, "when
    // typing, holding alt has mouse cursor appearing", ui/altCursor.ts; it types nothing)
    if (typing(e) && !alt(keyName(e))) return;
    const k = keyName(e);
    if (!input.down.has(k)) input.pressed.add(k);
    input.down.add(k);
    if (k === 'space' || k === 'tab' || alt(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = keyName(e);
    input.down.delete(k);
    // (let go alone, Alt would take the keys to the browser's menu: typing in the chat too, where it shows the cursor)
    if (alt(k)) e.preventDefault();
  });
  window.addEventListener('blur', releaseInput);
  window.addEventListener('mousemove', (e) => {
    if (input.touchMode) return;
    if (pointerLocked()) { lookMove(e); input.mouse.overUI = false; return; }
    input.mouse.x = e.clientX; input.mouse.y = e.clientY;
    input.mouse.overUI = e.target !== canvas;
    // the drag keeps rotating over the UI; `buttons` catches a release outside the window
    if (input.mouse.middle) { if (e.buttons & 4) input.orbit += e.movementX; else input.mouse.middle = false; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (input.touchMode) return;
    // the click that takes the pointer for mouse look doesn't also attack
    if (lockWanted && !pointerLocked()) { requestLock(); return; }
    if (e.button === 0) { input.mouse.left = true; input.pressed.add('mouse0'); }
    if (e.button === 2) { input.mouse.right = true; input.pressed.add('mouse2'); }
    if (e.button === 1) { input.mouse.middle = true; e.preventDefault(); } // no autoscroll
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.left = false;
    if (e.button === 2) input.mouse.right = false;
    if (e.button === 1) input.mouse.middle = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
}

export function updateInputRay(): void {
  if (input.aim || input.touchMode) input.foe = null;
  if (input.aim) { input.ground.copy(input.aim); return; }
  if (input.touchMode) return;
  if (input.centerAim) { aimAtCenter(); return; }
  ndc.set((input.mouse.x / window.innerWidth) * 2 - 1, -(input.mouse.y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  aimAlong(Infinity);
}

/** The crosshair's aim: what's under it (`aimAlong`), or the point aim range along it. */
function aimAtCenter(): void {
  ndc.set(0, 0);
  ray.setFromCamera(ndc, G.camera);
  aimAlong(CAMERA.aimRange, true);
}

export function endInputFrame(): void {
  input.pressed.clear();
  input.wheel = 0;
  input.orbit = 0;
  input.look.x = input.look.y = 0;
}

export const isDown = (k: string): boolean =>
  input.down.has(k) || input.touch.has(k) || (k === 'mouse0' && input.mouse.left) || (k === 'mouse2' && input.mouse.right);
export const wasPressed = (k: string): boolean => input.pressed.has(k);
