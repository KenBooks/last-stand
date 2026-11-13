// The developer mode's free camera: the view flown anywhere, the game frozen or running, from any angle. It takes the
// camera after the game's own has placed it each frame (`applyFreeCam`, called by main.ts's frame), so the views, the
// shake and the follow carry on underneath and come back as they were when it's let go. The hero stands idle while it
// flies (WASD is the camera's), and the page's own pieces that follow the world (the labels) are left off unless
// asked for, as they're placed by the game's camera, not this one.
import * as THREE from 'three';
import { G } from '../state';
import { isDown } from '../core/input';
import { overFrame } from '../core/renderer';

/** how fast it flies (m/s) at first, the wheel's step on it, and its bounds; Shift's and Ctrl's share of it */
const SPEED = { start: 10, step: 1.25, least: 0.5, most: 120, fast: 4, slow: 0.2 };
/** how far a dragged pixel turns the view (rad), and how far up or down it may look */
const TURN_PER_PX = 0.0035;
const PITCH_MOST = Math.PI / 2 - 0.01;
/** its lens: wider than the game's, to see round a crowd, and near enough to put the eye in a bush */
const FOV = 60, NEAR = 0.05;

const state = {
  on: false,
  pos: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  speed: SPEED.start,
  /** the world's labels drawn while it flies */
  labels: false,
  /** the buttons held on the touch pad: forward, back, left, right, up, down */
  held: new Set<string>(),
};
const _euler = new THREE.Euler(0, 0, 0, 'YXZ'), _move = new THREE.Vector3();
/** the overlays' draw, kept while the free camera leaves it out */
let drawOverlays: (() => void) | null = null;

export const freeCamOn = (): boolean => state.on;
export const freeCamSpeed = (): number => state.speed;
export const freeCamLabels = (): boolean => state.labels;

/** On, from where the camera looks now, or off, the game's camera taking over again. */
export function setFreeCam(on: boolean): void {
  if (on === state.on) return;
  state.on = on;
  state.held.clear();
  G.player.idle = on;
  if (on) {
    const cam = G.camera;
    state.pos.copy(cam.position);
    _euler.setFromQuaternion(cam.quaternion, 'YXZ');
    state.yaw = _euler.y;
    state.pitch = _euler.x;
  }
  showLabels(state.labels);
}

/** The world's labels (damage numbers, names, bars) drawn or not while it flies. */
export function setFreeCamLabels(on: boolean): void {
  state.labels = on;
  showLabels(on);
}

function showLabels(on: boolean): void {
  if (on && drawOverlays) { overFrame.draw = drawOverlays; drawOverlays = null; }
  if (!on && !drawOverlays) { drawOverlays = overFrame.draw; overFrame.draw = () => {}; }
}

/** Turned by a drag of `dx`, `dy` px (right turns right, down looks down). */
export function turnFreeCam(dx: number, dy: number): void {
  state.yaw -= dx * TURN_PER_PX;
  state.pitch = THREE.MathUtils.clamp(state.pitch - dy * TURN_PER_PX, -PITCH_MOST, PITCH_MOST);
}

/** The speed stepped up (positive notches) or down. */
export function speedFreeCam(notches: number): void {
  state.speed = THREE.MathUtils.clamp(state.speed * SPEED.step ** notches, SPEED.least, SPEED.most);
}

/** A touch pad's button held (`on`) or let go: forward, back, left, right, up, down. */
export function holdFreeCam(way: string, on: boolean): void {
  if (on) state.held.add(way);
  else state.held.delete(way);
}

/** Back above the hero, looking down at him as the top view does. */
export function freeCamToHero(): void {
  const p = G.player.pos;
  state.pos.set(p.x, p.y + 9, p.z + 9);
  state.yaw = 0;
  state.pitch = -Math.PI / 4;
}

/** Put at `pos` looking `yaw` round and `pitch` up (rad): a harness's flight (tools/lab's `perf --village --fly`). */
export function placeFreeCam(pos: THREE.Vector3, yaw: number, pitch: number): void {
  state.pos.copy(pos);
  state.yaw = yaw;
  state.pitch = THREE.MathUtils.clamp(pitch, -PITCH_MOST, PITCH_MOST);
}

/** A frame of flight (`dt`: the browser's own, so it flies with the game frozen), the camera put where it is. */
export function applyFreeCam(dt: number): void {
  if (!state.on) return;
  // (kept idle each frame: closing the pause menu lets him go)
  G.player.idle = true;
  const key = (k: string, way: string): number => (isDown(k) || state.held.has(way) ? 1 : 0);
  const fwd = key('w', 'forward') + key('arrowup', '') - key('s', 'back') - key('arrowdown', '');
  const side = key('d', 'right') + key('arrowright', '') - key('a', 'left') - key('arrowleft', '');
  const up = key('e', 'up') - key('q', 'down');
  const speed = state.speed * (isDown('shiftleft') || isDown('shiftright') ? SPEED.fast : 1)
    * (isDown('controlleft') || isDown('controlright') ? SPEED.slow : 1);
  // (forward along the look, up and down along the world's up: a flight like an editor's)
  _euler.set(state.pitch, state.yaw, 0);
  _move.set(side, 0, -fwd).applyEuler(_euler);
  _move.y += up;
  if (_move.lengthSq() > 1) _move.normalize();
  state.pos.addScaledVector(_move, speed * dt);
  state.pos.y = Math.max(0.05, state.pos.y);

  const cam = G.camera;
  if (cam.view) cam.clearViewOffset();
  cam.position.copy(state.pos);
  cam.quaternion.setFromEuler(_euler);
  if (cam.fov !== FOV || cam.near !== NEAR) { cam.fov = FOV; cam.near = NEAR; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}
