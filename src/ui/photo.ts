// Photo mode (from the owner's ask: "picture mode, where ui is removed and you can adjust time of day and other
// customization where you can get the most cinematic picture... where you press button it takes the picture on its own
// and saves on pc"). Every panel of the page is hidden (`body.photo`, styles/_photo.scss) and the world's overlays left
// out of the frame (`showOverlays`), but for this mode's own panel; a camera of its own flies, orbits and turns round
// the hero; the look is set live (`core/photoLook.ts`, uniforms alone: nothing compiles); and Take photo saves the
// frame as the post chain drew it, at the canvas's own pixels, as a PNG download. Solo the game stands frozen meanwhile
// (as the pause menu holds it); in co-op it can't, and the world moves on, the hero standing idle. Its own code, none
// of the developer mode's (`src/dev` never ships).
import * as THREE from 'three';
import { G } from '../state';
import { VILLAGE } from '../core/beta';
import { ARENA } from '../data/balance';
import { isCoop } from '../net/role';
import { isDown, wasPressed, input } from '../core/input';
import { frameShot, showOverlays, bloomDrawn } from '../core/renderer';
import { applyPhotoLook, FILTER_NAMES, GRADE_LOOK_DRAWN, NEUTRAL_LOOK, PHOTO_FILTERS, type PhotoFilter,
  type PhotoLook } from '../core/photoLook';
import { HIDDEN_LAYER } from '../core/layers';
import { SIGHT, holdSightOff } from '../core/sight';
import { sortBlendedFrom, updateSeeThrough } from '../core/seeThrough';
import { heldHour, holdHour, hourNow } from '../game/clock';
import { lightLampsNow } from '../game/village';
import { viewArms } from '../entities/viewModel';
import { sfx } from '../core/audio';

/** What the game does as photo mode opens and closes (main.ts): the pause menu put away, or opened again. */
export interface PhotoHooks {
  /** the game as photo mode leaves it: the pause menu open again (`toPause`), or the game played on */
  back(toPause: boolean): void;
}

/** the camera's bounds: how close to and far from what it turns round (m), how far up and down it looks (rad), its
 *  lens (vertical degrees) and roll (degrees) */
const DISTANCE = { least: 0.2, most: 60 };
const PITCH_MOST = 1.45;
const FOV = { least: 15, most: 100 };
const ROLL_MOST = 45;
/** how far from where the hero stood what it turns round may go in the village (m: the village is some 110 m across;
 *  at 24, from play, it "has limited space to fly"), the arena's own edge in a battleground, how near the ground the
 *  camera and what it turns round may come (m: at 0.15 it "does not go low to the ground"), and how high */
const LEASH = 70;
const ARENA_EDGE = ARENA.radius + 1;
const OVER_GROUND = 0.04;
const TARGET_HIGHEST = 50;
/** how fast it flies (m/s), Shift's share more, how far a dragged pixel turns it (rad), and a roll key's speed (deg/s) */
const FLY_SPEED = 4;
const FLY_FAST = 3;
const TURN_PER_PX = 0.005;
const ROLL_SPEED = 30;
/** the wheel's step on the distance (a share), and on the lens (degrees) with Shift */
const WHEEL_STEP = 1.12;
const WHEEL_FOV = 3;
/** how long the note that a photo was saved shows (ms) */
const SAVED_FOR = 1800;
/** the cinema's frame the letterbox leaves (its width over its height) */
const LETTERBOX = 2.39;
/** the near plane, close enough to put the camera by a face */
const NEAR = 0.05;

/** the camera: what it turns round, its turn and its pitch over the horizon (rad), how far out, its lens and roll */
interface PhotoCamera {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  distance: number;
  fov: number;
  roll: number;
}

/** what photo mode found as it opened, to put back as it closes */
interface Kept {
  fromPause: boolean;
  hour: number | null;
  sight: number;
  camera: PhotoCamera;
  home: THREE.Vector3;
}

const state = {
  on: false,
  look: { ...NEUTRAL_LOOK } as PhotoLook,
  camera: { target: new THREE.Vector3(), yaw: 0, pitch: 0, distance: 5, fov: 50, roll: 0 } as PhotoCamera,
  hideHero: false,
  letterbox: false,
  panelHidden: false,
  /** the hour photo mode holds (null: the village's own, as photo mode found it) */
  hour: null as number | null,
  /** the hour wants lighting again while the game stands frozen */
  hourChanged: false,
  kept: null as Kept | null,
};
/** each of the hero's hidden meshes' own layers, put back as he shows again */
const heroLayers = new Map<THREE.Object3D, number>();
/** the pointers down on the pad: where each was last (css px), and the button it pressed */
const pointers = new Map<number, { x: number; y: number; button: number }>();
/** a camera far off, for showing the hero's body whole as photo mode opens (`viewArms` hides it near his head); made
 *  as it first opens, not as the game loads: every three.js object made draws a random number for its id, and one made
 *  as the modules loaded moved what the hero's idle drew after it (`lab light --ab`, his outline a hair apart) */
let far: THREE.PerspectiveCamera | null = null;
function farCamera(): THREE.PerspectiveCamera {
  if (!far) {
    far = new THREE.PerspectiveCamera();
    far.position.set(1e4, 1e4, 1e4);
  }
  return far;
}
let hooks: PhotoHooks;
let savedTimer = 0;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _move = new THREE.Vector3();

export const photoOn = (): boolean => state.on;
/** The camera as it stands, to set by hand (tools/lab's `photo` poses its example shots by it). */
export const photoCamera = (): PhotoCamera => state.camera;
export type { PhotoCamera };

/** Whether a wave is being fought (foes on the field: not the count before it, nor the choice after it). */
const fighting = (): boolean => G.mode === 'run' && G.run?.phase === 'fighting';

/** Whether photo mode can open now: in the lobby (the village), or in a run the hero is in (not watching a co-op
 *  run's end) between its waves, never during a fight (from play: "make unavailable during battles, in village, and
 *  between waves it works though"). */
export const photoAllowed = (): boolean => G.mode === 'menu' || (G.mode === 'run' && G.player.inRun && !fighting());

/** Whether the time of day can be set where he is: the village's hour (a battleground keeps its own light). */
const hourSettable = (): boolean => VILLAGE && G.mode === 'menu' && G.arena.place === 'village' && !G.arena.hallShown;

/** The hero's chest, where the camera turns round at first. */
function heroChest(out: THREE.Vector3): THREE.Vector3 {
  const p = G.player;
  return out.set(p.pos.x, p.obj.position.y + p.model.height * 0.6, p.pos.z);
}

/** The camera as the game's stands: turning round the hero's chest from where it is. */
function cameraFromGame(): PhotoCamera {
  const target = heroChest(new THREE.Vector3());
  const offset = _dir.copy(G.camera.position).sub(target);
  const distance = THREE.MathUtils.clamp(offset.length(), DISTANCE.least, DISTANCE.most);
  const pitch = THREE.MathUtils.clamp(Math.asin(offset.y / Math.max(offset.length(), 1e-4)), -PITCH_MOST, PITCH_MOST);
  return { target, yaw: Math.atan2(offset.x, offset.z), pitch, distance, fov: G.camera.fov, roll: 0 };
}

const copyCamera = (camera: PhotoCamera): PhotoCamera => ({ ...camera, target: camera.target.clone() });

/** Photo mode opened (`fromPause`: from the pause menu, which it goes back to as it closes). */
export function enterPhoto(fromPause: boolean): void {
  if (state.on || !photoAllowed()) return;
  state.on = true;
  const camera = cameraFromGame();
  state.kept = {
    fromPause, hour: heldHour(), sight: SIGHT.uSightOn.value, camera: copyCamera(camera),
    home: G.player.pos.clone(),
  };
  state.camera = camera;
  state.look = { ...NEUTRAL_LOOK };
  state.hour = null;
  state.hideHero = state.letterbox = state.panelHidden = false;
  // (frozen solo as the pause menu holds the game; in co-op the world goes on, the hero standing idle)
  G.menuOpen = true;
  G.paused = !isCoop();
  G.player.idle = true;
  // (the hero whole, through the eyes too: his arms' own camera off, his body back from its hidden layer)
  viewArms(G.player.model, false, farCamera());
  // (the fog of what he can't see is the top view's, of the hero's sight: no part of a photo)
  holdSightOff(true);
  SIGHT.uSightOn.value = 0;
  showOverlays(false);
  document.body.classList.add('photo');
  $('#photo').classList.remove('hidden');
  renderPanel();
  applyLook();
}

/** Photo mode closed: everything as it found it, and the game as it was (the pause menu again if it came from it). */
export function leavePhoto(): void {
  if (!state.on || !state.kept) return;
  const kept = state.kept;
  state.on = false;
  showHero(true);
  state.look = { ...NEUTRAL_LOOK };
  applyPhotoLook(state.look, false);
  holdHour(kept.hour);
  if (VILLAGE) relightHour(0);
  holdSightOff(false);
  SIGHT.uSightOn.value = kept.sight;
  showOverlays(true);
  pointers.clear();
  document.body.classList.remove('photo');
  $('#photo').classList.add('hidden');
  state.kept = null;
  hooks.back(kept.fromPause);
}

/** Every look and camera value back to how photo mode opened. */
export function resetPhoto(): void {
  if (!state.kept) return;
  state.look = { ...NEUTRAL_LOOK };
  state.camera = copyCamera(state.kept.camera);
  state.hour = null;
  holdHour(state.kept.hour);
  state.hourChanged = true;
  state.letterbox = false;
  showHero(true);
  renderPanel();
  applyLook();
}

/** The look as it stands put on the post chain, the letterbox shown or not. */
function applyLook(): void {
  applyPhotoLook(state.look, state.on);
  placeBars();
}

/** The hero's meshes shown, or hidden by their layer (never `visible`, and never a light: a light gone from a pass
 *  changes its light count, and every program it draws compiles again). */
function showHero(show: boolean): void {
  state.hideHero = !show;
  if (show) {
    for (const [object, mask] of heroLayers) object.layers.mask = mask;
    heroLayers.clear();
    return;
  }
  G.player.obj.traverse((object) => {
    if ((object as THREE.Light).isLight || heroLayers.has(object)) return;
    heroLayers.set(object, object.layers.mask);
    object.layers.set(HIDDEN_LAYER);
  });
}

/** The village's light for the hour held, with the game frozen (in co-op the game's own frame lights it). */
function relightHour(dt: number): void {
  if (G.arena.place !== 'village') return;
  G.arena.setHour(hourNow());
  G.arena.update(0, G.time);
  lightLampsNow(dt);
}

// --- the camera -----------------------------------------------------------------------------------------------------

/** The camera's way out from what it turns round, a unit vector. */
function outward(camera: PhotoCamera, out: THREE.Vector3): THREE.Vector3 {
  const level = Math.cos(camera.pitch);
  return out.set(level * Math.sin(camera.yaw), Math.sin(camera.pitch), level * Math.cos(camera.yaw));
}

/** What it turns round kept within reach of where the hero stood, inside a battleground's wall, over the ground. */
function keepTarget(target: THREE.Vector3): void {
  const home = state.kept?.home ?? G.player.pos;
  const dx = target.x - home.x, dz = target.z - home.z;
  const away = Math.hypot(dx, dz);
  if (G.arena.place === 'village' && away > LEASH) {
    target.set(home.x + (dx / away) * LEASH, target.y, home.z + (dz / away) * LEASH);
  }
  if (G.arena.place !== 'village') {
    const edge = Math.hypot(target.x, target.z);
    if (edge > ARENA_EDGE) target.set((target.x / edge) * ARENA_EDGE, target.y, (target.z / edge) * ARENA_EDGE);
  }
  const ground = G.arena.groundHeight(target.x, target.z);
  target.y = THREE.MathUtils.clamp(target.y, ground + OVER_GROUND, ground + TARGET_HIGHEST);
}

/** The keys' flight this frame: WASD or the arrows over the ground, Q and E down and up, Z and C rolled. */
function flyByKeys(dt: number): void {
  const camera = state.camera;
  const forward = (isDown('w') || isDown('arrowup') ? 1 : 0) - (isDown('s') || isDown('arrowdown') ? 1 : 0);
  const side = (isDown('d') || isDown('arrowright') ? 1 : 0) - (isDown('a') || isDown('arrowleft') ? 1 : 0);
  const rise = (isDown('e') ? 1 : 0) - (isDown('q') ? 1 : 0);
  const roll = (isDown('c') ? 1 : 0) - (isDown('z') ? 1 : 0);
  if (roll) {
    camera.roll = THREE.MathUtils.clamp(camera.roll + roll * ROLL_SPEED * dt, -ROLL_MOST, ROLL_MOST);
    syncSlider('roll');
  }
  if (!forward && !side && !rise) return;
  const fast = isDown('shiftleft') || isDown('shiftright') ? FLY_FAST : 1;
  // (over the ground along the way the camera looks, as a walk would go)
  const sin = Math.sin(camera.yaw), cos = Math.cos(camera.yaw);
  _move.set(-sin * forward + cos * side, rise, -cos * forward - sin * side);
  if (_move.lengthSq() > 1) _move.normalize();
  camera.target.addScaledVector(_move, FLY_SPEED * fast * dt);
  keepTarget(camera.target);
}

/** The game's camera put where photo mode's stands, after the game placed its own. */
function placeCamera(): void {
  const camera = state.camera;
  const cam = G.camera;
  if (cam.view) cam.clearViewOffset();
  cam.position.copy(camera.target).addScaledVector(outward(camera, _dir), camera.distance);
  const ground = G.arena.groundHeight(cam.position.x, cam.position.z);
  cam.position.y = Math.max(cam.position.y, ground + OVER_GROUND);
  if (G.arena.place !== 'village') {
    const edge = Math.hypot(cam.position.x, cam.position.z);
    if (edge > ARENA_EDGE) cam.position.set((cam.position.x / edge) * ARENA_EDGE, cam.position.y, (cam.position.z / edge) * ARENA_EDGE);
  }
  cam.up.set(0, 1, 0);
  cam.lookAt(camera.target);
  cam.rotateZ(THREE.MathUtils.degToRad(camera.roll));
  if (cam.fov !== camera.fov || cam.near !== NEAR) {
    cam.fov = camera.fov;
    cam.near = NEAR;
    cam.updateProjectionMatrix();
  }
  cam.updateMatrixWorld();
  // (nothing stands thinned between the camera and him: a photo shows the place whole)
  const p = G.player.pos;
  updateSeeThrough(p.x, G.player.obj.position.y + G.player.model.height * 0.6, p.z, 0, 0);
  if (VILLAGE) sortBlendedFrom(cam.position, cam.getWorldDirection(_dir));
}

/** A frame of photo mode, after the game's own (`dt`: the browser's, as the game may stand frozen). */
export function photoFrame(dt: number): void {
  if (!state.on) return;
  // (a wave begun while it's open, as a co-op partner's count runs out: back to the fight at once)
  if (fighting()) { leavePhoto(); return; }
  G.player.idle = true;
  flyByKeys(dt);
  if (state.hourChanged && G.paused) relightHour(dt);
  state.hourChanged = false;
  placeCamera();
}

/** Photo mode's keys (main.ts calls this in its stead while it's open): every key it reads is spent here. */
export function photoKeys(): void {
  if (wasPressed('escape') || wasPressed('p')) leavePhoto();
  else if (wasPressed('space') || wasPressed('enter') || wasPressed('numpadenter')) void takePhoto();
  else if (wasPressed('h')) hidePanel(!state.panelHidden);
  else if (wasPressed('r')) recentre();
  // (none of them reaches the game: a co-op game's frame goes on, and E there would use what he's near)
  input.pressed.clear();
}

/** The camera back on the hero, as photo mode opened. */
function recentre(): void {
  if (!state.kept) return;
  state.camera = copyCamera(state.kept.camera);
  syncSlider('fov');
  syncSlider('roll');
}

// --- the pointer on the pad: a drag turns, a right drag (or Shift, or two fingers) moves, the wheel or a pinch zooms

function onPointerDown(event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.shiftKey ? 2 : event.button });
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  const was = pointers.get(event.pointerId);
  if (!was) return;
  const dx = event.clientX - was.x, dy = event.clientY - was.y;
  if (pointers.size >= 2) pinch(event.pointerId, event.clientX, event.clientY);
  else if (was.button === 0) turn(dx, dy);
  else pan(dx, dy);
  was.x = event.clientX;
  was.y = event.clientY;
}

function onPointerUp(event: PointerEvent): void {
  pointers.delete(event.pointerId);
}

/** Turned round what it looks at by a drag of `dx`, `dy` css px. */
function turn(dx: number, dy: number): void {
  const camera = state.camera;
  camera.yaw -= dx * TURN_PER_PX;
  camera.pitch = THREE.MathUtils.clamp(camera.pitch + dy * TURN_PER_PX, -PITCH_MOST, PITCH_MOST);
}

/** What it looks at moved across the view by a drag of `dx`, `dy` css px, as far as the view there is wide. */
function pan(dx: number, dy: number): void {
  const camera = state.camera;
  const metresPerPx = (2 * camera.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / innerHeight;
  G.camera.updateMatrixWorld();
  _right.setFromMatrixColumn(G.camera.matrixWorld, 0);
  _up.setFromMatrixColumn(G.camera.matrixWorld, 1);
  camera.target.addScaledVector(_right, -dx * metresPerPx).addScaledVector(_up, dy * metresPerPx);
  keepTarget(camera.target);
}

/** Two fingers: their spread's change zooms, their middle's move pans. */
function pinch(id: number, x: number, y: number): void {
  const [a, b] = [...pointers.entries()];
  const other = a[0] === id ? b[1] : a[1];
  const mine = pointers.get(id)!;
  const before = Math.hypot(mine.x - other.x, mine.y - other.y);
  const after = Math.hypot(x - other.x, y - other.y);
  if (before > 1 && after > 1) zoomBy(before / after);
  pan((x - mine.x) / 2, (y - mine.y) / 2);
}

/** The camera brought nearer (under 1) or further (over 1). */
function zoomBy(share: number): void {
  const camera = state.camera;
  camera.distance = THREE.MathUtils.clamp(camera.distance * share, DISTANCE.least, DISTANCE.most);
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const notches = Math.sign(event.deltaY);
  if (event.shiftKey) {
    state.camera.fov = THREE.MathUtils.clamp(state.camera.fov + notches * WHEEL_FOV, FOV.least, FOV.most);
    syncSlider('fov');
  } else zoomBy(WHEEL_STEP ** notches);
}

// --- the panel ------------------------------------------------------------------------------------------------------

/** A slider of the panel: its name, ends and step, and how it reads and sets what it moves. */
interface Slider {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(value: number): void;
  shown(value: number): string;
  /** why it's greyed out here (null: it isn't) */
  off?(): string | null;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const signed = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
const clock = (hour: number): string => `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
const lookOff = (): string | null => (GRADE_LOOK_DRAWN ? null : 'Not on the WebGPU renderer');

/** Each section's sliders, in order. */
const SLIDERS: Record<string, Slider[]> = {
  camera: [
    {
      id: 'fov', label: 'Lens', min: FOV.least, max: FOV.most, step: 1,
      get: () => state.camera.fov, set: (value) => { state.camera.fov = value; }, shown: (value) => `${Math.round(value)}°`,
    },
    {
      id: 'roll', label: 'Tilt', min: -ROLL_MOST, max: ROLL_MOST, step: 0.5,
      get: () => state.camera.roll, set: (value) => { state.camera.roll = value; }, shown: (value) => `${Math.round(value)}°`,
    },
  ],
  light: [
    {
      id: 'hour', label: 'Time of day', min: 0, max: 23.75, step: 0.25,
      get: () => state.hour ?? hourNow(),
      set: (value) => { state.hour = value; holdHour(value); state.hourChanged = true; },
      shown: clock,
      off: () => (hourSettable() ? null : 'The battlegrounds keep their own light'),
    },
    {
      id: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05,
      get: () => Math.log2(state.look.exposure), set: (value) => { state.look.exposure = 2 ** value; },
      shown: signed, off: lookOff,
    },
    {
      id: 'bloom', label: 'Bloom', min: 0, max: 3, step: 0.05,
      get: () => state.look.bloom, set: (value) => { state.look.bloom = value; }, shown: (value) => value.toFixed(2),
      off: () => (bloomDrawn() ? null : 'Bloom is off at this graphics level'),
    },
  ],
  colour: [
    {
      id: 'contrast', label: 'Contrast', min: 0.5, max: 1.6, step: 0.01,
      get: () => state.look.contrast, set: (value) => { state.look.contrast = value; }, shown: percent, off: lookOff,
    },
    {
      id: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01,
      get: () => state.look.saturation, set: (value) => { state.look.saturation = value; }, shown: percent, off: lookOff,
    },
    {
      id: 'filterStrength', label: 'Filter', min: 0, max: 1, step: 0.01,
      get: () => state.look.filterStrength, set: (value) => { state.look.filterStrength = value; }, shown: percent,
      off: () => lookOff() ?? (state.look.filter === 'none' ? 'Choose a filter first' : null),
    },
    {
      id: 'vignette', label: 'Vignette', min: 0, max: 3, step: 0.05,
      get: () => state.look.vignette, set: (value) => { state.look.vignette = value; }, shown: (value) => value.toFixed(2),
    },
  ],
  focus: [
    {
      id: 'blur', label: 'Focus blur', min: 0, max: 1, step: 0.01,
      get: () => state.look.blur, set: (value) => { state.look.blur = value; }, shown: percent, off: lookOff,
    },
    {
      id: 'focus', label: 'Focus at', min: 0, max: 1, step: 0.01,
      get: () => state.look.focus, set: (value) => { state.look.focus = value; }, shown: percent,
      off: () => lookOff() ?? (state.look.blur <= 0 ? 'Turn the focus blur up first' : null),
    },
  ],
};
const ALL_SLIDERS = Object.values(SLIDERS).flat();

/** A slider's row: its label, the range and its value. */
function sliderRow(slider: Slider): string {
  return `<label class="opt-level ph-level" data-photo-row="${slider.id}"><span>${slider.label}</span>`
    + `<input type="range" data-photo="${slider.id}" min="${slider.min}" max="${slider.max}" step="${slider.step}">`
    + '<output></output></label>';
}

/** The panel's sections built once: sliders, the filter's buttons and the toggles. */
function buildPanel(): void {
  const filters = PHOTO_FILTERS.map((filter) => `<button data-filter="${filter}">${FILTER_NAMES[filter]}</button>`).join('');
  $('#photo .ph-body').innerHTML = `
    <div class="ph-section"><div class="ph-heading">Camera</div>
      ${SLIDERS.camera.map(sliderRow).join('')}
      <div class="ph-toggles">
        <label class="ph-check"><input type="checkbox" id="ph-hero"> Hide hero</label>
        <label class="ph-check"><input type="checkbox" id="ph-letterbox"> Letterbox</label>
        <button class="btn" id="ph-recentre">Recentre</button>
      </div></div>
    <div class="ph-section"><div class="ph-heading">Light</div>${SLIDERS.light.map(sliderRow).join('')}</div>
    <div class="ph-section"><div class="ph-heading">Colour</div>
      <div class="seg ph-filters" role="group" aria-label="Colour filter">${filters}</div>
      ${SLIDERS.colour.map(sliderRow).join('')}</div>
    <div class="ph-section"><div class="ph-heading">Focus</div>${SLIDERS.focus.map(sliderRow).join('')}</div>`;
}

/** A slider shown as what it moves stands now. */
function syncSlider(id: string): void {
  const slider = ALL_SLIDERS.find((each) => each.id === id);
  const row = document.querySelector<HTMLElement>(`[data-photo-row="${id}"]`);
  if (!slider || !row) return;
  const input = row.querySelector<HTMLInputElement>('input')!;
  const value = slider.get();
  input.value = String(value);
  row.querySelector('output')!.textContent = slider.shown(value);
  const off = slider.off?.() ?? null;
  input.disabled = off !== null;
  row.classList.toggle('off', off !== null);
  row.title = off ?? '';
}

/** Every control shown as it stands. */
function renderPanel(): void {
  for (const slider of ALL_SLIDERS) syncSlider(slider.id);
  document.querySelectorAll<HTMLButtonElement>('#photo [data-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.look.filter);
    button.disabled = !GRADE_LOOK_DRAWN;
  });
  $<HTMLInputElement>('#ph-hero').checked = state.hideHero;
  $<HTMLInputElement>('#ph-letterbox').checked = state.letterbox;
  $('#photo .ph-coop').classList.toggle('hidden', !isCoop());
  $('#photo .ph-panel').classList.toggle('hidden', state.panelHidden);
  $('#ph-show').classList.toggle('hidden', !state.panelHidden);
}

/** The panel hidden for the shot (H, its Hide), or shown again. */
function hidePanel(hidden: boolean): void {
  state.panelHidden = hidden;
  renderPanel();
}

/** The letterbox's bars on the screen, as the photo will have them. */
function placeBars(): void {
  const bar = barShare(innerWidth, innerHeight);
  document.querySelectorAll<HTMLElement>('#photo .ph-bar').forEach((element) => {
    element.style.height = `${(bar * 100).toFixed(3)}%`;
    element.classList.toggle('hidden', !state.letterbox || bar <= 0);
  });
}

/** The share of a frame `width` by `height` each letterbox bar covers (none if it's as wide as the cinema's). */
function barShare(width: number, height: number): number {
  return Math.max(0, (1 - width / LETTERBOX / height) / 2);
}

// --- the picture ----------------------------------------------------------------------------------------------------

/** A photo saved: its file, name and size in pixels. */
export interface PhotoSaved { blob: Blob; name: string; width: number; height: number }

/** The file's name, from the local time: `last-stand-2026-11-14-213005.png`. */
export function photoName(at = new Date()): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  return `last-stand-${day}-${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}.png`;
}

/** The frame as drawn copied onto a canvas of its size, the letterbox's bars over it. */
function framed(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const context = out.getContext('2d')!;
  context.drawImage(canvas, 0, 0);
  const bar = Math.round(barShare(out.width, out.height) * out.height);
  if (state.letterbox && bar > 0) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, out.width, bar);
    context.fillRect(0, out.height - bar, out.width, bar);
  }
  return out;
}

/** The file handed to the browser to save: a download (on a phone, its downloads; a share sheet would need another tap). */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  // (in the page, as Firefox clicks a link only there; hidden with the rest of it)
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The note that a photo was saved, a moment. */
function sayPhotoSaved(name: string): void {
  const note = $('#photo .ph-saved');
  note.textContent = `Saved ${name}`;
  note.classList.remove('hidden');
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => note.classList.add('hidden'), SAVED_FOR);
}

/**
 * The next frame saved as a PNG: taken in its own task as the post chain draws it (`frameShot`: bloom and the grade in
 * it, the panel never, as it's the page's and not the canvas's), at the canvas's pixels, and downloaded.
 */
export function takePhoto(): Promise<PhotoSaved> {
  return new Promise((resolve, reject) => {
    frameShot.take = (canvas) => {
      const out = framed(canvas);
      const name = photoName();
      out.toBlob((blob) => {
        if (!blob) {
          reject(new Error('photo: the frame gave no picture'));
          return;
        }
        download(blob, name);
        sfx.click();
        sayPhotoSaved(name);
        resolve({ blob, name, width: out.width, height: out.height });
      }, 'image/png');
    };
  });
}

/** Photo mode's panel wired up (once, at boot). */
export function initPhoto(photoHooks: PhotoHooks): void {
  hooks = photoHooks;
  buildPanel();
  const pad = $('#photo .ph-pad');
  pad.addEventListener('pointerdown', onPointerDown);
  pad.addEventListener('pointermove', onPointerMove);
  pad.addEventListener('pointerup', onPointerUp);
  pad.addEventListener('pointercancel', onPointerUp);
  pad.addEventListener('wheel', onWheel, { passive: false });
  pad.addEventListener('contextmenu', (event) => event.preventDefault());
  for (const slider of ALL_SLIDERS) {
    const range = document.querySelector<HTMLInputElement>(`[data-photo="${slider.id}"]`)!;
    range.addEventListener('input', () => {
      slider.set(Number(range.value));
      renderPanel();
      applyLook();
    });
    // (let go, the keys are the camera's again: a slider kept focused took the arrows too)
    range.addEventListener('change', () => range.blur());
  }
  document.querySelectorAll<HTMLButtonElement>('#photo [data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.look.filter = button.dataset.filter as PhotoFilter;
      renderPanel();
      applyLook();
    });
  });
  $<HTMLInputElement>('#ph-hero').addEventListener('change', (event) => {
    showHero(!(event.target as HTMLInputElement).checked);
  });
  $<HTMLInputElement>('#ph-letterbox').addEventListener('change', (event) => {
    state.letterbox = (event.target as HTMLInputElement).checked;
    placeBars();
  });
  $('#ph-recentre').addEventListener('click', recentre);
  $('#ph-take').addEventListener('click', () => void takePhoto());
  $('#ph-reset').addEventListener('click', () => { sfx.click(); resetPhoto(); });
  $('#ph-hide').addEventListener('click', () => hidePanel(true));
  $('#ph-show').addEventListener('click', () => hidePanel(false));
  $('#ph-leave').addEventListener('click', () => { sfx.click(); leavePhoto(); });
  window.addEventListener('resize', () => { if (state.on) placeBars(); });
}
