// Watching the rest of a co-op run once out of it (from play: "in spectate mode, need to click LMB to spectate next,
// RMB previous, and some key for free camera fly, show spectate controls. when spectating on player, should be
// possible to rotate the camera"). The camera follows a partner still in the run: LMB the next by slot, RMB the one
// before; Q and E (or a middle drag, in every view) turn it round him; F lets it fly free (WASD, or the move stick)
// and back. The bar over the HUD (`ui/coop.ts`) shows who is watched and has a button for each, for touch.
import * as THREE from 'three';
import { G } from '../state';
import { ARENA, CAMERA } from '../data/balance';
import { input, isDown, wasPressed } from '../core/input';
import { cameraYaw, turnBy, viewMode } from '../core/renderer';
import type { Player } from '../entities/player';

/** how fast the free camera flies (m/s) and the keys turn the view (rad/s), and the height it looks from (m) */
const FLY = 11;
const TURN = 2.2;
const EYE = 1.7;

/** Where the camera looks while watching: the hero followed (none: flying free) and his place. */
export interface Watch {
  player: Player | null;
  pos: THREE.Vector3;
  height: number;
}

let watched: Player | null = null;
let free = false;
const freeAt = new THREE.Vector3();
/** the bar's held turn buttons: -1 left, 1 right */
let held = 0;

/** Out of the run and watching it: the local player out while it goes on. */
export const spectating = (): boolean => G.mode === 'run' && !!G.run && !G.player.inRun;
/** Flying free (F). */
export const flyingFree = (): boolean => free;

/** The partners still in the run, by slot: those who can be watched. */
function watchable(): Player[] {
  return G.players.filter((p) => !p.local && p.inRun).sort((a, b) => a.slot - b.slot);
}

/** The partner followed: the one chosen while he's still in the run, else the first who is. */
export function watchedPlayer(): Player | null {
  const list = watchable();
  if (!watched || !list.includes(watched)) watched = list[0] ?? watched;
  return watched;
}

/** Follows the next partner in the run (1) or the one before (-1), leaving free flight. */
export function watchNext(step: 1 | -1): void {
  const list = watchable();
  if (!list.length) return;
  const at = watched ? list.indexOf(watched) : -1;
  const from = at < 0 ? (step > 0 ? -1 : 0) : at;
  watched = list[(from + step + list.length) % list.length];
  free = false;
}

/** Free flight on, from where the camera looks now, or off, following the partner watched again. */
export function toggleFree(): void {
  free = !free;
  if (free) freeAt.copy(watchedPlayer()?.pos ?? G.player.pos).setY(0);
}

/** The bar's turn buttons held (-1 left, 1 right) or let go (0). */
export function holdTurn(way: number): void {
  held = way;
}

/** Back to following the first partner, as a new watch starts. */
export function endSpectate(): void {
  watched = null;
  free = false;
  held = 0;
}

/** The free camera flown a frame by WASD or the move stick, its way as the camera faces, within the arena. */
function fly(dt: number): void {
  let mx = 0;
  let mz = 0;
  if (isDown('w') || isDown('arrowup')) mz -= 1;
  if (isDown('s') || isDown('arrowdown')) mz += 1;
  if (isDown('a') || isDown('arrowleft')) mx -= 1;
  if (isDown('d') || isDown('arrowright')) mx += 1;
  if (!mx && !mz) {
    mx = input.stick.x;
    mz = input.stick.y;
  }
  const len = Math.hypot(mx, mz);
  if (!len) return;
  const yaw = cameraYaw();
  const k = (FLY * Math.min(1, len)) / len;
  freeAt.x += (mx * Math.cos(yaw) + mz * Math.sin(yaw)) * k * dt;
  freeAt.z += (mz * Math.cos(yaw) - mx * Math.sin(yaw)) * k * dt;
  const out = Math.hypot(freeAt.x, freeAt.z);
  if (out > ARENA.radius) freeAt.multiplyScalar(ARENA.radius / out);
}

/**
 * A frame of watching: the keys (`keys`: nothing over the game, as the summary is) and where the camera looks; null
 * while the local player is in the run (or out of one).
 */
export function updateSpectate(dt: number, keys: boolean): Watch | null {
  if (!spectating()) {
    if (watched || free || held) endSpectate();
    return null;
  }
  if (keys && !input.mouse.overUI) {
    if (wasPressed('mouse0')) watchNext(1);
    if (wasPressed('mouse2')) watchNext(-1);
  }
  if (keys && wasPressed('f')) toggleFree();
  const turn = (keys && isDown('e') ? 1 : 0) - (keys && isDown('q') ? 1 : 0) + held;
  if (turn) turnBy(-turn * TURN * dt);
  // (top-down turns by a middle drag already: `orbitBy`)
  if (input.orbit && viewMode() !== 'top') turnBy(-input.orbit * CAMERA.orbitSpeed);
  if (free) {
    if (keys) fly(dt);
    return { player: null, pos: freeAt, height: EYE };
  }
  const p = watchedPlayer();
  return p ? { player: p, pos: p.pos, height: p.model.height } : null;
}
