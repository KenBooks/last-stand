// tools/lab `photo`: photo mode (src/ui/photo.ts) used as a player uses it, in the village and in both battlegrounds.
// Opened by P, it must hide every part of the page but its own panel and leave the world's overlays out of the frame,
// hold a solo game still, fly its camera by the keys and turn it by a drag on its pad, set its look by its sliders and
// buttons with no program compiled, hide the hero by his layers, and save a PNG at the canvas's own pixels under a
// dated name (with the letterbox's bars black in it). Esc must put everything back as it found it, and opened from the
// pause menu's button it goes back to the pause menu. Each place is pictured as the player sees it: the panel open, and
// a shot set up with the panel hidden.
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
import { standInVillage } from './readmeShots';
import { standIn } from './light';

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
async function photoTaken(lab: Lab, where: string, letterbox: boolean): Promise<Found> {
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
  image.close();
  return { lines, problems };
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

/** A shot set up with the panel hidden: the letterbox, a filter, the vignette and the time of day where settable. */
async function shotSetUp(lab: Lab, filter: string, hour: number | null): Promise<void> {
  await lab.clickOn(document.getElementById('ph-letterbox')!);
  await chooseFilter(lab, filter);
  setSlider('vignette', 1.6);
  if (hour !== null) setSlider('hour', hour);
  await lab.press('KeyH');
  await lab.step(READ_FRAMES);
}

/** One place's checks and pictures, photo mode opened in it by P and left by Esc. */
async function inPlace(lab: Lab, where: string, canary: boolean, settable: boolean, shot: { filter: string }):
  Promise<Found & { moments: Pictured[] }> {
  const parts: Found[] = [await openedByKey(lab, where)];
  const moments = [await lab.screen(`${where}-panel`, ['photo mode as it opens'])];
  parts.push(panelFits(where), uiHidden(where, canary));
  parts.push(await overlaysLeftOut(lab, where, canary), await heldStill(lab, where));
  parts.push(await flownAndTurned(lab, where), await lookSet(lab, where, settable));
  parts.push(await heroHiddenAndShown(lab, where), await photoTaken(lab, where, false));
  await shotSetUp(lab, shot.filter, settable ? DUSK : null);
  moments.push(await lab.screen(`${where}-shot`, [`the panel hidden, letterboxed, ${shot.filter}`]));
  parts.push(await photoTaken(lab, where, true));
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
  await standIn(lab, { biome: 'forest', view: 'third', facing: 0 });
  const forest = await inPlace(lab, 'forest', canary, false, { filter: 'warm' });
  await standIn(lab, { biome: 'crypt', view: 'third', facing: 0 });
  const crypt = await inPlace(lab, 'crypt', canary, false, { filter: 'mono' });
  const places = [village, pause, forest, crypt];
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
  return { text: lines.join('\n'), problems, moments: [...village.moments, ...forest.moments, ...crypt.moments] };
}
