// tools/lab `photo`: photo mode (src/ui/photo.ts) used as a player uses it, in the village and in both battlegrounds.
// Opened by P, it must hide every part of the page but its own panel and leave the world's overlays out of the frame,
// hold a solo game still, fly its camera by the keys and turn it by a drag on its pad, set its look by its sliders and
// buttons with no program compiled, hide the hero by his layers, and save a PNG at the canvas's own pixels under a
// dated name (with the letterbox's bars black in it). Esc must put everything back as it found it, and opened from the
// pause menu's button it goes back to the pause menu. Each place is pictured as the player sees it: the panel open, and
// a shot set up with the panel hidden. In a battleground it is the time before a wave it opens in; during a fight
// (the run's phase held at `fighting`) P must open nothing, the pause menu's button must be disabled, and a wave begun
// while it is open must close it. In each of the village's houses its camera stays in the room (what it turns round
// inside the walls, the camera itself at most a few metres beyond them, the walls it stands beyond cut away as the
// game's own camera has them) and the time of day is greyed out; P opens nothing over a dialog (How to play); and by
// touch alone it opens from the pause menu, a finger's drag turns it, a pinch zooms it and Leave goes back.
//
// `--canary` plants two faults the checks must catch: the page's UI shown again (`body.photo` taken off) and the
// world's overlays drawn over the frame again.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { photoCamera, photoOn } from '../../../src/ui/photo';
import { gradeUniforms, overFrame, showOverlays } from '../../../src/core/renderer';
import { GAME_VIGNETTE } from '../../../src/core/photoLook';
import { programsCompiledInGame } from '../../../src/core/shaders';
import { HIDDEN_LAYER } from '../../../src/core/layers';
import { holdHour } from '../../../src/game/clock';
import { START_SPOTS } from '../../../src/data/village';
import { HOUSES, ROOM_IDS, type RoomId } from '../../../src/data/houses';
import { enterRoom, leaveRoom } from '../../../src/game/rooms';
import { hideHelp, showHelp } from '../../../src/ui/menus';
import { standInVillage } from './readmeShots';
import { standIn } from './light';
import { boxOf, touchMode } from './uiTouch';
import { middleOf } from './lab';

export interface PhotoOptions {
  /** plant the faults the checks must catch: the page's UI shown, the world's overlays drawn */
  canary?: boolean;
}

/** what each check found: its lines, and its problems */
interface Found {
  lines: string[];
  problems: string[];
}

/** the canary's two problems, as each check words them */
export const PHOTO_CANARIES = [
  { name: 'shows on the page', what: "the page's UI shown in photo mode" },
  { name: 'overlays drawn', what: "the world's overlays drawn over the frame" },
];

/** frames for a key or a click to be read by the game's frame, and for a look to be drawn */
const READ_FRAMES = 2;
/** frames flown forward by W, the least it must have gone (m), and how long the game is watched for standing still */
const FLY_FRAMES = 30;
const FLEW_LEAST = 1;
const STILL_FRAMES = 30;
/** a drag across the pad (css px), the turn it must give (rad: 0.005 a px, `TURN_PER_PX`) and how far off it may be */
const DRAG_PX = 200;
const DRAG_TURN = 1;
const TURN_SLACK = 0.05;
/** a slider set by the check, and the value it's set to */
const CONTRAST = 1.4;
/** how long a photo's file may take to come (ms, the browser's own clock: the PNG is encoded off the lab's) */
const PHOTO_WAIT_MS = 10_000;
/** a photo's name, as `photoName` makes it */
const PHOTO_NAME = /^last-stand-\d{4}-\d{2}-\d{2}-\d{6}\.png$/;
/** the least mean light of a photo's pixels (0 to 255): a black frame was taken before the post chain drew it */
const LIT_LEAST = 8;
/** the most any channel of the letterbox's bar may have (0 to 255), and the share down the frame read in it */
const BAR_DARKEST = 2;
const BAR_ROW = 0.04;
/** the hour of each village shot */
const DUSK = 19;

/** The page's elements (outside photo mode's own and the game's canvas) a player would see now. */
function shownElements(): string[] {
  const shown: string[] = [];
  for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
    if (element.closest('#photo, #game, script, style, svg')) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0) continue;
    // (an element with text or a background of its own is seen; an empty box isn't)
    const painted = style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none'
      || [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (painted) shown.push(element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${element.className}`);
  }
  return shown;
}

/** An element of the page that sets `visibility: visible` itself (as the class card's name and tagline do), planted
 *  under the lobby's panels: it must be hidden too. */
function overridesHidden(where: string): Found {
  const planted = document.createElement('div');
  planted.textContent = 'planted';
  planted.style.cssText = 'visibility: visible; position: fixed; left: 10px; top: 10px; background: #f00;';
  document.getElementById('menu')!.append(planted);
  const shown = getComputedStyle(planted).visibility === 'visible';
  planted.remove();
  const problems = shown ? [`${where}: an element that sets its own visibility shows in photo mode`] : [];
  return { lines: [`${where}: an element that sets its own visibility ${shown ? 'shown' : 'hidden'}`], problems };
}

/** how far the camera must fly from where the hero stood (m), and how near the ground it must come (m) */
const FLIES_FAR = 40;
const COMES_LOW = 0.1;

/** The camera flown far off (in the village; to the wall in a battleground) and down by Q to the ground. */
async function cameraRoom(lab: Lab, where: string, village: boolean): Promise<Found> {
  const camera = photoCamera();
  const home = camera.target.clone();
  camera.target.set(home.x + (village ? FLIES_FAR : 0), home.y, home.z + (village ? 0 : 0));
  await lab.step(1, () => ({ keys: ['w'] }));
  const flew = Math.hypot(camera.target.x - home.x, camera.target.z - home.z);
  camera.target.copy(home);
  await lab.step(FLY_FRAMES * 2, () => ({ keys: ['q'] }));
  const ground = G.arena.groundHeight(camera.target.x, camera.target.z);
  const low = camera.target.y - ground;
  camera.target.copy(home);
  await lab.step(1);
  const problems: string[] = [];
  if (village && flew < FLIES_FAR - 1) problems.push(`${where}: the camera was held ${flew.toFixed(1)} m from him`);
  if (low > COMES_LOW) problems.push(`${where}: Q brought the camera no lower than ${low.toFixed(2)} m over the ground`);
  const far = village ? `kept ${flew.toFixed(1)} m out, ` : '';
  return { lines: [`${where}: ${far}Q brought it ${low.toFixed(2)} m over the ground`], problems };
}

/** Photo mode opened by P from the game: on, the game held still (solo), the look's branch of the grade on. */
async function openedByKey(lab: Lab, where: string): Promise<Found> {
  await lab.press('KeyP');
  await lab.step(READ_FRAMES);
  const problems: string[] = [];
  if (!photoOn()) problems.push(`${where}: P opened no photo mode`);
  if (!G.paused) problems.push(`${where}: the solo game went on in photo mode`);
  if (gradeUniforms().uPhoto.value !== 1) problems.push(`${where}: the grade's look is off in photo mode`);
  return { lines: [`${where}: opened by P, the game ${G.paused ? 'held still' : 'going on'}`], problems };
}

/** the most of an upright screen's height the panel may take (it stands along its foot, the shot above it) */
const UPRIGHT_PANEL_MOST = 0.5;

/** Whether box `inner` lies within box `outer` (to a pixel's rounding). */
function within(inner: DOMRect, outer: { left: number; top: number; right: number; bottom: number }): boolean {
  const slack = 1;
  return inner.left >= outer.left - slack && inner.top >= outer.top - slack
    && inner.right <= outer.right + slack && inner.bottom <= outer.bottom + slack;
}

/** The panel within the window, its head's and foot's buttons within it (its sliders scroll between them), and on an
 *  upright screen under half its height. */
function panelFits(where: string): Found {
  const panel = document.querySelector('#photo .ph-panel')!.getBoundingClientRect();
  const screen = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const buttons = ['#ph-hide', '#ph-leave', '#ph-reset', '#ph-take'].map((id) => document.querySelector(id)!);
  const problems: string[] = [];
  if (!within(panel, screen)) problems.push(`${where}: the panel reaches past the window`);
  for (const button of buttons) {
    if (!within(button.getBoundingClientRect(), panel)) problems.push(`${where}: ${button.id} lies outside the panel`);
  }
  const share = panel.height / innerHeight;
  if (innerHeight > innerWidth && share > UPRIGHT_PANEL_MOST) {
    problems.push(`${where}: the panel takes ${(share * 100).toFixed(0)}% of an upright screen's height`);
  }
  const lines = [`${where}: the panel ${panel.width.toFixed(0)} by ${panel.height.toFixed(0)} css px, `
    + `${(share * 100).toFixed(0)}% of the window's height, its buttons within it`];
  return { lines, problems };
}

/** The page's UI hidden but for photo mode's panel (with the canary, shown again by `body.photo` taken off). */
function uiHidden(where: string, canary: boolean): Found {
  if (canary) document.body.classList.remove('photo');
  const shown = shownElements();
  if (canary) document.body.classList.add('photo');
  const lines = [`${where}: ${shown.length} of the page's elements shown outside photo mode's panel`];
  const problems = shown.length
    ? [`${where}: ${shown.slice(0, 6).join(', ')}${shown.length > 6 ? '...' : ''} ${PHOTO_CANARIES[0].name}`] : [];
  return { lines, problems };
}

/** The world's overlays left out of the frames drawn (with the canary, drawn again). */
async function overlaysLeftOut(lab: Lab, where: string, canary: boolean): Promise<Found> {
  const draw = overFrame.draw;
  let drawn = 0;
  overFrame.draw = () => {
    drawn++;
    draw();
  };
  if (canary) showOverlays(true);
  lab.drawing = true;
  await lab.step(READ_FRAMES);
  lab.drawing = false;
  if (canary) showOverlays(false);
  overFrame.draw = draw;
  const problems = drawn ? [`${where}: the world's ${PHOTO_CANARIES[1].name} ${drawn} times`] : [];
  return { lines: [`${where}: the world's overlays drawn ${drawn} times in ${READ_FRAMES} frames`], problems };
}

/** The solo game held still: its clock and the hero where they were. */
async function heldStill(lab: Lab, where: string): Promise<Found> {
  const time = G.time;
  const at = G.player.pos.clone();
  await lab.step(STILL_FRAMES);
  const moved = G.player.pos.distanceTo(at);
  const problems: string[] = [];
  if (G.time !== time) problems.push(`${where}: the game's clock ran ${(G.time - time).toFixed(3)} s in photo mode`);
  if (moved > 1e-6) problems.push(`${where}: the hero moved ${moved.toFixed(3)} m in photo mode`);
  return { lines: [`${where}: over ${STILL_FRAMES} frames the clock ran ${(G.time - time).toFixed(3)} s`], problems };
}

/** The camera flown forward by W, and turned by a drag across the pad. */
async function flownAndTurned(lab: Lab, where: string): Promise<Found> {
  const camera = photoCamera();
  const from = camera.target.clone();
  await lab.step(FLY_FRAMES, () => ({ keys: ['w'] }));
  const flew = camera.target.distanceTo(from);
  const pad = document.querySelector('#photo .ph-pad')!.getBoundingClientRect();
  const start = { x: pad.left + pad.width * 0.3, y: pad.top + pad.height * 0.5 };
  const yaw = photoCamera().yaw;
  await lab.mouseDown(start);
  await lab.mouseTo({ x: start.x + DRAG_PX, y: start.y });
  await lab.mouseUp({ x: start.x + DRAG_PX, y: start.y });
  const turned = yaw - photoCamera().yaw;
  const problems: string[] = [];
  if (flew < FLEW_LEAST) problems.push(`${where}: W flew the camera ${flew.toFixed(2)} m in ${FLY_FRAMES} frames`);
  if (Math.abs(turned - DRAG_TURN) > TURN_SLACK) {
    problems.push(`${where}: a ${DRAG_PX} px drag turned it ${turned.toFixed(3)} rad, not ${DRAG_TURN}`);
  }
  const lines = [`${where}: W flew it ${flew.toFixed(2)} m, a ${DRAG_PX} px drag turned it ${turned.toFixed(3)} rad`];
  return { lines, problems };
}

/** A slider of the panel set as a player's drag sets it. */
function setSlider(id: string, value: number): HTMLInputElement {
  const range = document.querySelector<HTMLInputElement>(`[data-photo="${id}"]`)!;
  range.value = String(value);
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
  return range;
}

/** A filter's button clicked. */
async function chooseFilter(lab: Lab, filter: string): Promise<void> {
  await lab.clickOn(document.querySelector(`#photo [data-filter="${filter}"]`)!);
}

/** The look set by a slider and a filter, drawn, with no program compiled; the time of day only where it's settable. */
async function lookSet(lab: Lab, where: string, hourSettable: boolean): Promise<Found> {
  const compiled = programsCompiledInGame();
  setSlider('contrast', CONTRAST);
  await chooseFilter(lab, 'cinematic');
  const hour = document.querySelector<HTMLInputElement>('[data-photo="hour"]')!;
  lab.drawing = true;
  await lab.step(READ_FRAMES);
  lab.drawing = false;
  const u = gradeUniforms();
  const newPrograms = programsCompiledInGame() - compiled;
  const problems: string[] = [];
  if (Math.abs(u.uContrast.value - CONTRAST) > 1e-6) problems.push(`${where}: the contrast slider set ${u.uContrast.value}`);
  if (u.uFilterMix.value !== 1) problems.push(`${where}: the Cinematic filter mixed in ${u.uFilterMix.value}`);
  if (newPrograms) problems.push(`${where}: the look compiled ${newPrograms} programs`);
  if (hour.disabled === hourSettable) {
    problems.push(`${where}: the time of day ${hour.disabled ? 'greyed out' : 'settable'} here`);
  }
  const lines = [`${where}: contrast ${u.uContrast.value}, Cinematic mixed ${u.uFilterMix.value}, `
    + `${newPrograms} programs compiled; the time of day ${hour.disabled ? 'greyed out' : 'settable'}`];
  return { lines, problems };
}

/** A photo as the page handed it to the browser to save: its name and its picture. */
interface Saved {
  name: string;
  image: ImageBitmap;
}

/** The next photo the page saves, caught as it's handed over (the browser's download left out). */
function catchPhoto(): Promise<Saved> {
  const createObjectURL = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  const blobs = new Map<string, Blob>();
  const restore = (): void => {
    URL.createObjectURL = createObjectURL;
    HTMLAnchorElement.prototype.click = click;
  };
  return new Promise<Saved>((resolve, reject) => {
    const timer = setTimeout(() => {
      restore();
      reject(new Error(`lab: photo: no photo saved within ${PHOTO_WAIT_MS} ms`));
    }, PHOTO_WAIT_MS);
    URL.createObjectURL = (blob: Blob | MediaSource): string => {
      const url = createObjectURL(blob);
      if (blob instanceof Blob) blobs.set(url, blob);
      return url;
    };
    HTMLAnchorElement.prototype.click = function caught(this: HTMLAnchorElement): void {
      const blob = blobs.get(this.href);
      if (!blob) return click.call(this);
      clearTimeout(timer);
      restore();
      createImageBitmap(blob).then((image) => resolve({ name: this.download, image }), reject);
    };
  });
}

/** Rows of a picture's pixels at shares down it: each row's mean light and its brightest channel (0 to 255). */
function rowsOf(image: ImageBitmap, shares: readonly number[]): { mean: number; brightest: number }[] {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return shares.map((share) => {
    const row = context.getImageData(0, Math.floor(share * (image.height - 1)), image.width, 1).data;
    let sum = 0;
    let brightest = 0;
    for (let i = 0; i < row.length; i += 4) {
      sum += row[i] + row[i + 1] + row[i + 2];
      brightest = Math.max(brightest, row[i], row[i + 1], row[i + 2]);
    }
    return { mean: sum / (row.length / 4) / 3, brightest };
  });
}

/** A photo taken by Space: saved under a dated name at the canvas's pixels, lit; with the letterbox, its bar black. */
/** A photo as saved, as a picture of its own (`<where>-photo`): what the player's PC gets, its letterbox in it. */
function photoPictured(where: string, image: ImageBitmap): Pictured {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  const tile = { view: 'photo', png: canvas.toDataURL('image/png'), width: image.width, height: image.height };
  return { label: `${where}-photo`, tiles: [tile], notes: ['the photo as saved'] };
}

/** A photo taken by Space and checked as the browser was handed it; pictured as saved if `letterbox` (the shot set
 *  up). */
async function photoTaken(lab: Lab, where: string, letterbox: boolean): Promise<Found & { saved?: Pictured }> {
  const caught = catchPhoto();
  await lab.press('Space');
  lab.drawing = true;
  await lab.step(READ_FRAMES);
  lab.drawing = false;
  const { name, image } = await caught;
  const canvas = G.renderer.domElement;
  const [top, middle] = rowsOf(image, [BAR_ROW, 0.5]);
  const problems: string[] = [];
  if (!PHOTO_NAME.test(name)) problems.push(`${where}: the photo was named "${name}"`);
  if (image.width !== canvas.width || image.height !== canvas.height) {
    problems.push(`${where}: the photo is ${image.width}x${image.height}, the canvas ${canvas.width}x${canvas.height}`);
  }
  if (middle.mean < LIT_LEAST) problems.push(`${where}: the photo's middle is black (${middle.mean.toFixed(1)})`);
  if (letterbox && top.brightest > BAR_DARKEST) {
    problems.push(`${where}: the letterbox's bar has light in the photo (${top.brightest})`);
  }
  const bar = letterbox ? `, its bar's brightest ${top.brightest}` : '';
  const lines = [`${where}: saved ${name.replace(/\d/g, '#')} at ${image.width}x${image.height}, `
    + `its middle's light ${middle.mean.toFixed(1)}${bar}`];
  const saved = letterbox ? photoPictured(where, image) : undefined;
  image.close();
  return { lines, problems, saved };
}

/** Each mesh of the hero, and whether every one is on the hidden layer alone. */
function heroHidden(): boolean {
  let hidden = true;
  G.player.obj.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.layers.mask !== 1 << HIDDEN_LAYER) hidden = false;
  });
  return hidden;
}

/** Hide hero ticked and unticked: every mesh of his on the hidden layer, and back. */
async function heroHiddenAndShown(lab: Lab, where: string): Promise<Found> {
  const box = document.querySelector<HTMLInputElement>('#ph-hero')!;
  await lab.clickOn(box);
  const hidden = heroHidden();
  await lab.clickOn(box);
  let shownAgain = true;
  G.player.obj.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.layers.mask === 1 << HIDDEN_LAYER) shownAgain = false;
  });
  const problems: string[] = [];
  if (!hidden) problems.push(`${where}: Hide hero left a mesh of his drawn`);
  if (!shownAgain) problems.push(`${where}: unticked, a mesh of his stayed hidden`);
  return { lines: [`${where}: Hide hero hid him ${hidden ? 'whole' : 'in part'}, and showed him again`], problems };
}

/** Left by Esc: off, the look the game's again, the page's UI back, the game going on (or the pause menu back). */
async function leftByEsc(lab: Lab, where: string, toPause: boolean): Promise<Found> {
  await lab.press('Escape');
  await lab.step(READ_FRAMES);
  const u = gradeUniforms();
  const problems: string[] = [];
  if (photoOn()) problems.push(`${where}: Esc left photo mode open`);
  if (u.uPhoto.value !== 0) problems.push(`${where}: the grade's look stayed on`);
  if (u.uVignette.value !== GAME_VIGNETTE) problems.push(`${where}: the vignette stayed at ${u.uVignette.value}`);
  if (document.body.classList.contains('photo')) problems.push(`${where}: the page's UI stayed hidden`);
  const pause = document.getElementById('pause')!;
  const pauseShown = !pause.classList.contains('hidden') && G.menuOpen;
  if (toPause && !pauseShown) problems.push(`${where}: left, the pause menu it was opened from didn't come back`);
  if (!toPause && (G.paused || G.menuOpen)) problems.push(`${where}: left, the game stayed paused`);
  const after = toPause ? (pauseShown ? 'the pause menu back' : 'no pause menu') : (G.paused ? 'paused' : 'going on');
  return { lines: [`${where}: left by Esc, the look the game's, ${after}`], problems };
}

/** Opened from the pause menu's Photo mode button (its Settings tab), and left back to the pause menu. */
async function fromPauseMenu(lab: Lab, where: string): Promise<Found> {
  await lab.press('Escape');
  await lab.step(READ_FRAMES);
  await lab.clickOn(document.querySelector('[data-pause-tab="settings"]')!);
  await lab.clickOn(document.getElementById('btn-photo')!);
  await lab.step(READ_FRAMES);
  const problems = photoOn() ? [] : [`${where}: the pause menu's Photo mode opened nothing`];
  const left = await leftByEsc(lab, where, true);
  await lab.press('Escape');
  await lab.step(READ_FRAMES);
  return { lines: [`${where}: opened from the pause menu's button`, ...left.lines], problems: [...problems, ...left.problems] };
}

/** how far from him the fight's one foe stands (m) */
const FOE_OFF = 12;

/** During a fight (the run's phase held at `fighting` before every frame): P opens nothing and the pause menu's
 *  button is disabled; and open before the wave, the fight beginning closes it. */
async function notInAFight(lab: Lab, where: string): Promise<Found> {
  const run = G.run;
  if (!run) return { lines: [], problems: [`${where}: no run to fight in`] };
  const before = run.phase, problems: string[] = [];
  const hold = (): void => { run.phase = 'fighting'; };
  // (a foe on the field, well off him: with none, the run calls the wave cleared within the frame)
  const foe = lab.spawnFoe('dummy', G.player.pos.clone().add(new THREE.Vector3(0, 0, FOE_OFF)));
  // (open before the wave, then the fight begins)
  await lab.press('KeyP');
  await lab.step(READ_FRAMES);
  const openedBefore = photoOn();
  // (the lab's set-up holds the run in the count before its wave, every frame: let go, for the fight to stand)
  lab.letWavesCome();
  lab.beforeFrame.push(hold);
  try {
    await lab.step(READ_FRAMES);
    const closedByFight = !photoOn();
    // (left open, P would close it: closed first, so the press is read as one to open it)
    if (!closedByFight) { await lab.press('Escape'); await lab.step(READ_FRAMES); }
    await lab.press('KeyP');
    await lab.step(READ_FRAMES);
    const openedInFight = photoOn();
    await lab.press('Escape');
    await lab.step(READ_FRAMES);
    const button = document.getElementById('btn-photo') as HTMLButtonElement;
    const pauseShown = !document.getElementById('pause')!.classList.contains('hidden');
    const disabled = button.disabled;
    if (pauseShown) await lab.press('Escape');
    await lab.step(READ_FRAMES);
    if (!openedBefore) problems.push(`${where}: P opened no photo mode before the wave`);
    if (!closedByFight) problems.push(`${where}: photo mode stayed open as the fight began`);
    if (openedInFight) problems.push(`${where}: P opened photo mode during a fight`);
    if (!pauseShown) problems.push(`${where}: Esc opened no pause menu during the fight`);
    else if (!disabled) problems.push(`${where}: the pause menu's Photo mode button is enabled during a fight`);
    const said = `${where}: open before the wave, ${closedByFight ? 'closed' : 'LEFT OPEN'} as the fight began; during it P`
      + ` ${openedInFight ? 'OPENED it' : 'opened nothing'}, the pause menu's button ${disabled ? 'disabled' : 'ENABLED'}`;
    return { lines: [said], problems };
  } finally {
    lab.beforeFrame.splice(lab.beforeFrame.indexOf(hold), 1);
    run.phase = before;
    foe.die();
  }
}

/** A shot set up with the panel hidden: the letterbox, a filter, the vignette and the time of day where settable. */
async function shotSetUp(lab: Lab, filter: string, hour: number | null): Promise<void> {
  await lab.clickOn(document.getElementById('ph-letterbox')!);
  await chooseFilter(lab, filter);
  setSlider('vignette', 1.6);
  if (hour !== null) setSlider('hour', hour);
  await lab.press('KeyH');
  await lab.step(READ_FRAMES);
}

/** how far photo mode's camera may stand beyond a room's walls and over its ceiling (m: `ROOM_OUT`), and how far out
 *  the check sends what it turns round and the camera (m) */
const ROOM_OUT_MOST = 6;
const ROOM_SENT = 40;
/** frames for a room to be warmed and shown, a door's way in */
const ROOM_FRAMES = 30;

/** How far `p` stands beyond room `id`'s walls (m; negative inside them). */
function beyondWalls(id: RoomId, p: THREE.Vector3): number {
  const [halfX, halfZ] = HOUSES[id].half;
  return Math.max(Math.abs(p.x) - halfX, Math.abs(p.z) - halfZ);
}

/** In house `id`: photo mode opened by P, the time of day greyed out, what it turns round sent far out by the keys and
 *  kept inside the walls, the camera drawn back far kept a few metres beyond them, and the walls it stands beyond cut
 *  away; pictured from outside its walls, as a dollhouse. */
async function inHouse(lab: Lab, id: RoomId): Promise<Found & { moment: Pictured }> {
  const where = `house ${id}`;
  enterRoom(id);
  await lab.step(ROOM_FRAMES);
  const problems: string[] = [];
  if (G.arena.room !== id) problems.push(`${where}: the hero was not taken in`);
  const opened = await openedByKey(lab, where);
  problems.push(...opened.problems);
  const hour = document.querySelector<HTMLInputElement>('[data-photo="hour"]')!;
  if (!hour.disabled) problems.push(`${where}: the time of day settable in a house, whose light is its own`);
  const camera = photoCamera();
  camera.target.x += ROOM_SENT;
  await lab.step(1, () => ({ keys: ['w'] }));
  const targetOut = beyondWalls(id, camera.target);
  if (targetOut > 0) {
    problems.push(`${where}: what the camera turns round went ${targetOut.toFixed(1)} m out of the room`);
  }
  camera.distance = ROOM_SENT;
  camera.pitch = 0.3;
  await lab.step(READ_FRAMES);
  const eyeOut = beyondWalls(id, G.camera.position);
  if (eyeOut > ROOM_OUT_MOST + 0.01) {
    problems.push(`${where}: the camera stood ${eyeOut.toFixed(1)} m beyond the walls`);
  }
  const cut = G.arena.rooms![id].cutNow();
  if (eyeOut > 0 && cut.length === 0) problems.push(`${where}: no wall cut away with the camera beyond them`);
  const moment = await lab.screen(`house-${id}`, ['photo mode in a house, the camera beyond its walls']);
  await lab.press('Escape');
  await lab.step(READ_FRAMES);
  leaveRoom();
  await lab.step(READ_FRAMES);
  const said = `${where}: the time of day ${hour.disabled ? 'greyed out' : 'SETTABLE'}, what it turns round `
    + `${targetOut.toFixed(1)} m past the walls, the camera ${eyeOut.toFixed(1)} m, `
    + `cut away: ${cut.join(', ') || 'none'}`;
  return { lines: [...opened.lines, said], problems, moment };
}

/** P pressed with How to play open: no photo mode over a dialog, whose state would wait unseen under it. */
async function notOverADialog(lab: Lab, where: string): Promise<Found> {
  showHelp();
  await lab.step(READ_FRAMES);
  await lab.press('KeyP');
  await lab.step(READ_FRAMES);
  const opened = photoOn();
  if (opened) {
    await lab.press('Escape');
    await lab.step(READ_FRAMES);
  }
  hideHelp();
  await lab.step(READ_FRAMES);
  const problems = opened ? [`${where}: P opened photo mode over How to play`] : [];
  return { lines: [`${where}: P over How to play ${opened ? 'OPENED photo mode' : 'opened nothing'}`], problems };
}

/** the camera's reach pictured: low, what it turns round at the ground's least height and the camera looking along it
 *  (rad up), and far, drawn back its whole way (m) and looking down (rad) */
const LOW_PITCH = 0.04;
const FAR_DISTANCE = 60;
const FAR_PITCH = 0.5;

/** The camera at its reach, pictured with the panel hidden: down at the ground looking along it, and drawn far back. */
async function cameraReach(lab: Lab, where: string): Promise<Pictured[]> {
  const camera = photoCamera();
  const kept = { target: camera.target.clone(), distance: camera.distance, pitch: camera.pitch };
  await lab.press('KeyH');
  camera.target.y = 0;
  camera.distance = 1.2;
  camera.pitch = LOW_PITCH;
  await lab.step(FLY_FRAMES, () => ({ keys: ['q'] }));
  const low = await lab.screen(`${where}-low`, ['the camera down at the ground']);
  camera.target.copy(kept.target);
  camera.distance = FAR_DISTANCE;
  camera.pitch = FAR_PITCH;
  await lab.step(READ_FRAMES);
  const far = await lab.screen(`${where}-far`, [`the camera ${FAR_DISTANCE} m back`]);
  camera.target.copy(kept.target);
  camera.distance = kept.distance;
  camera.pitch = kept.pitch;
  await lab.press('KeyH');
  await lab.step(READ_FRAMES);
  return [low, far];
}

/** where on the screen a finger works the pad (shares of its width and height: clear of the panel at the right, and
 *  of an upright screen's at the foot), how far apart a pinch's fingers start and end (css px), and the least share a
 *  pinch outward must bring the camera in by */
const PAD_AT = { x: 0.3, y: 0.3 };
const PINCH_FROM = 40;
const PINCH_TO = 160;
const PINCH_NEARER = 0.5;

/** A finger's drag on the pad from `from` by `by` (css px), `finger` lifted at its end. */
async function fingerDrag(lab: Lab, from: { x: number; y: number }, by: { x: number; y: number }, finger = 0):
  Promise<void> {
  await lab.touchDown(from, finger);
  await lab.touchMove({ x: from.x + by.x / 2, y: from.y + by.y / 2 }, finger);
  await lab.touchMove({ x: from.x + by.x, y: from.y + by.y }, finger);
  await lab.touchUp(finger);
}

/** Photo mode by touch alone: the pause button tapped, its Settings tab and Photo mode, the touch keys' line shown, a
 *  finger's drag turning the camera as the mouse's does, two fingers spread bringing it nearer, and Leave tapped back
 *  to the pause menu. */
async function byTouch(lab: Lab, where: string): Promise<Found> {
  await touchMode(lab);
  await lab.tap(middleOf(document.getElementById('btn-pause')!));
  await lab.step(READ_FRAMES);
  await lab.tap(middleOf(document.querySelector('[data-pause-tab="settings"]')!));
  await lab.tap(middleOf(document.getElementById('btn-photo')!));
  await lab.step(READ_FRAMES);
  const problems: string[] = [];
  if (!photoOn()) {
    problems.push(`${where}: a finger's taps on the pause menu opened no photo mode`);
    return { lines: [`${where}: by touch, photo mode NOT OPENED`], problems };
  }
  const keysShown = boxOf('#photo .ph-keys-touch') !== null || innerHeight <= 520;
  if (!keysShown) problems.push(`${where}: the touch keys' line not shown in touch mode`);
  const camera = photoCamera();
  const pad = { x: innerWidth * PAD_AT.x, y: innerHeight * PAD_AT.y };
  const yaw = camera.yaw;
  await fingerDrag(lab, pad, { x: DRAG_PX, y: 0 });
  await lab.step(READ_FRAMES);
  const turned = yaw - camera.yaw;
  if (Math.abs(turned - DRAG_TURN) > TURN_SLACK) {
    problems.push(`${where}: a finger's drag turned it ${turned.toFixed(3)} rad`);
  }
  const distance = camera.distance;
  await lab.touchDown({ x: pad.x - PINCH_FROM / 2, y: pad.y }, 0);
  await lab.touchDown({ x: pad.x + PINCH_FROM / 2, y: pad.y }, 1);
  await lab.touchMove({ x: pad.x - PINCH_TO / 2, y: pad.y }, 0);
  await lab.touchMove({ x: pad.x + PINCH_TO / 2, y: pad.y }, 1);
  await lab.touchUp(0);
  await lab.touchUp(1);
  await lab.step(READ_FRAMES);
  const nearer = camera.distance / distance;
  if (nearer > PINCH_NEARER) {
    problems.push(`${where}: a pinch outward left the camera at ${percentOf(nearer)} of its distance`);
  }
  await lab.tap(middleOf(document.getElementById('ph-leave')!));
  await lab.step(READ_FRAMES);
  const pauseShown = !document.getElementById('pause')!.classList.contains('hidden');
  if (photoOn()) problems.push(`${where}: Leave tapped left photo mode open`);
  if (!pauseShown) problems.push(`${where}: Leave tapped brought no pause menu back`);
  await lab.press('Escape');
  await lab.step(READ_FRAMES);
  const said = `${where}: by touch, opened from the pause menu, a 200 px drag turned it ${turned.toFixed(3)} rad, a `
    + `pinch outward brought it to ${percentOf(nearer)} of its distance, `
    + `Leave ${pauseShown ? 'back to the pause menu' : 'NO PAUSE'}`;
  return { lines: [said], problems };
}

const percentOf = (share: number): string => `${Math.round(share * 100)}%`;

/** One place's checks and pictures, photo mode opened in it by P and left by Esc. */
async function inPlace(lab: Lab, where: string, canary: boolean, settable: boolean, shot: { filter: string }):
  Promise<Found & { moments: Pictured[] }> {
  const parts: Found[] = [await openedByKey(lab, where)];
  const moments = [await lab.screen(`${where}-panel`, ['photo mode as it opens'])];
  parts.push(panelFits(where), uiHidden(where, canary), overridesHidden(where));
  parts.push(await overlaysLeftOut(lab, where, canary), await heldStill(lab, where));
  parts.push(await flownAndTurned(lab, where), await cameraRoom(lab, where, settable));
  if (settable) moments.push(...await cameraReach(lab, where));
  parts.push(await lookSet(lab, where, settable));
  parts.push(await heroHiddenAndShown(lab, where), await photoTaken(lab, where, false));
  await shotSetUp(lab, shot.filter, settable ? DUSK : null);
  moments.push(await lab.screen(`${where}-shot`, [`the panel hidden, letterboxed, ${shot.filter}`]));
  const taken = await photoTaken(lab, where, true);
  parts.push(taken);
  if (taken.saved) moments.push(taken.saved);
  parts.push(await leftByEsc(lab, where, false));
  return {
    lines: parts.flatMap((part) => part.lines),
    problems: parts.flatMap((part) => part.problems),
    moments,
  };
}

/** `lab photo`: photo mode in the village (and from its pause menu), the Thornwood and the crypt. */
export async function photo(lab: Lab, options: PhotoOptions): Promise<Report> {
  const canary = Boolean(options.canary);
  holdHour(DUSK);
  const spot = START_SPOTS[0];
  await standInVillage(lab, spot.at, spot.facing);
  const village = await inPlace(lab, 'village', canary, true, { filter: 'cinematic' });
  holdHour(null);
  const pause = await fromPauseMenu(lab, 'village');
  const dialog = await notOverADialog(lab, 'village');
  const touch = await byTouch(lab, 'village');
  const houses: (Found & { moment: Pictured })[] = [];
  for (const id of ROOM_IDS) houses.push(await inHouse(lab, id));
  await standIn(lab, { biome: 'forest', view: 'third', facing: 0 });
  const forest = await inPlace(lab, 'forest', canary, false, { filter: 'warm' });
  await standIn(lab, { biome: 'crypt', view: 'third', facing: 0 });
  const crypt = await inPlace(lab, 'crypt', canary, false, { filter: 'mono' });
  const fight = await notInAFight(lab, 'crypt');
  const places = [village, pause, dialog, touch, ...houses, forest, crypt, fight];
  const lines = places.flatMap((place) => place.lines);
  let problems = places.flatMap((place) => place.problems);
  if (canary) {
    const missed = PHOTO_CANARIES.filter((plant) => !problems.some((problem) => problem.includes(plant.name)));
    for (const plant of PHOTO_CANARIES) {
      lines.push(`canary: ${plant.what} ${missed.includes(plant) ? 'went unseen' : 'caught'}`);
    }
    // (the canary's own problems are what it's for: only one it missed fails it)
    problems = problems.filter((problem) => !PHOTO_CANARIES.some((plant) => problem.includes(plant.name)));
    problems.push(...missed.map((plant) => `the canary's ${plant.what} went unseen`));
  }
  const moments = [...village.moments, ...houses.map((house) => house.moment), ...forest.moments, ...crypt.moments];
  return { text: lines.join('\n'), problems, moments };
}
