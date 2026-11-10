// The loading screen's exit as it hands over to the lobby's logo (tools/lab `wind`). The loading screen is put back
// over the lobby and its exit (`src/ui/logoWind.ts`) run on the lab's clock, the window put on other screens as the
// particles fly if asked (`--resize`: full screen and back), and the particles' picture as they rest in the logo's
// place is set against the logo they hand over to. Each column of their picture is read back from the exit's canvas
// at the last frame its points all rest there (`restOf`), and laid over the lobby as it shows behind them; the logo is
// pictured once the exit is done, both at the screen's own pixels: the pixels apart, and how far and which way the
// logo stands from where they rested (a jump the player sees as it takes over). The owner, the window resized before
// the exit's end: "when it settles it doesn't directly hit the final location, so this layout shift is visible (from
// particle logo to regular)".
import type { Lab, Pictured, Report, Screen } from './lab';
import { realWait } from './lab';
import * as logoWind from '../../../src/ui/logoWind';
import { APART, apartOf, differenceOf, laidOver, moveOf, patchOf, pngOf } from './windCompare';
import type { Apart, Move, Patch } from './windCompare';

export interface WindOptions {
  /** the screens the window is put on as the particles fly, one after another, the last where they land */
  resize: Screen[];
  /** the lobby logo pictured a pixel lower than it is: the jump the measure is for, which it must find */
  canary: boolean;
}

/** how far round the lobby logo's letters the patch reaches (shares of their box): past their rim and drop shadow */
const PAD = { x: 0.15, y: 0.3 };
/** the frames the exit may take, at most (it takes 3.3 s, 200 frames) */
const MOST_FRAMES = 600;
/** how long the lobby logo's snapshot is waited for once the window has changed it, at most (ms, the browser's) */
const SNAPSHOT_WAIT_MS = 3000;
/** how long the logo's animations (its uncovering, its glow) are waited for once the exit is done, at most (ms) */
const SETTLE_WAIT_MS = 3000;
/** the share of the logo's pixels that may be apart past APART: none but a stray few */
const MOST_APART = 0.001;
/** s into the exit of the window's first change, and how long before the first points rest the last comes */
const RESIZE_FROM = 0.4, RESIZE_BEFORE = 0.4;
/** how near the canary's pixel the jump found must be (px) */
const CANARY_NEAR = 0.25;

/** When the points of column `x` (0..1 across the lobby logo's letters) rest there, s into the exit. */
type Rest = (x: number) => { from: number; to: number };
/** An exit from before it said when its columns rest (main's, before `restOf`), which rested them as it first did */
const restBefore: Rest = (x) => {
  return { from: 2.5 + 0.65 * Math.min(Math.max(x, 0), 1), to: 2.5 + 0.65 * Math.max(x, 0) + 0.04 };
};
const restOf: Rest = (logoWind as { restOf?: Rest }).restOf ?? restBefore;

/** An area of the screen, device px from its top left. */
interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `lab wind`: the exit run into the lobby logo, its particles at rest against the logo after (the file's header). */
export async function windHandoff(lab: Lab, options: WindOptions): Promise<Report> {
  const first = screenNow();
  const loading = await loadingBack();
  const target = document.querySelector<HTMLElement>('#menu .logo-art');
  if (!target || (lettersOf(target)?.width ?? 0) < 10) throw new Error('lab: wind: the lobby logo isn\'t laid out');
  const blow = await logoWind.prepareBlow(loading.querySelector<HTMLElement>('.ld-logo')!, target);
  if (!blow) throw new Error('lab: wind: the exit wasn\'t made (prepareBlow made none)');
  const gl = fieldOf();
  const uploads = countUploads(gl);
  const rested = new Rested();
  const due = resizesOf(options.resize);
  let over = false;
  const start = performance.now();
  blow.start(() => loading.classList.add('done'), () => { over = true; });
  let frames = 0, taken = 0, waited = 0;
  while (!over) {
    if (frames++ >= MOST_FRAMES) throw new Error(`lab: wind: the exit wasn't over after ${MOST_FRAMES} frames`);
    await lab.step(1);
    const t = (performance.now() - start) / 1000;
    if (!over) rested.read(gl, target, t);
    if (due.length === 0 || t < due[0].at) continue;
    const before = { logo: lettersOf(target)?.width, ratio: devicePixelRatio, uploads: uploads.count };
    await lab.showOn(due.shift()!.screen);
    // (the next frame finds the logo changed and asks for its snapshot again, which comes on the browser's clock)
    await lab.step(1);
    frames++;
    if (lettersOf(target)?.width === before.logo && devicePixelRatio === before.ratio) continue;
    waited++;
    if (await waitFor(() => uploads.count > before.uploads, SNAPSHOT_WAIT_MS)) taken++;
  }
  loading.remove();
  await settled(target);
  const pictures = await pictured(target, options.canary);
  const changed = await afterChange(lab, target);
  return reportOf({ lab, options, first, frames, taken, waited, rested, pictures, changed });
}

/** The screen the page is on now. */
function screenNow(): Screen {
  return { width: innerWidth, height: innerHeight, ratio: devicePixelRatio };
}

/** `screen` as `--screen` writes it. */
function screenName(screen: Screen): string {
  return `${screen.width}x${screen.height}@${screen.ratio}`;
}

/** The loading screen put back over the lobby as the page first shows it (index.html's, its styles still the page's),
 *  laid out with its font in. */
async function loadingBack(): Promise<HTMLElement> {
  const html = await (await fetch('/')).text();
  const shown = new DOMParser().parseFromString(html, 'text/html').getElementById('loading');
  if (!shown) throw new Error('lab: wind: index.html has no loading screen');
  const loading = document.importNode(shown, true);
  document.body.append(loading);
  await document.fonts.ready;
  await smokeDrawn(loading);
  await window.__labClock.realFrame();
  return loading;
}

/** the most real frames the loading screen's smoke is waited for: it's drawn once its picture has decoded */
const SMOKE_FRAMES = 60;

/** The loading screen's smoke drawn into its canvases, as index.html's own script draws it at the page's start (a
 *  script inserted with its markup never runs): waited for till each canvas is shown. */
async function smokeDrawn(loading: HTMLElement): Promise<void> {
  const draw = (window as Window & { ldSmoke?: (root: HTMLElement) => void }).ldSmoke;
  if (!draw) return;
  draw(loading);
  const smokes = [...loading.querySelectorAll('.ld-smoke')];
  for (let frame = 0; frame < SMOKE_FRAMES; frame++) {
    if (smokes.every((smoke) => smoke.classList.contains('on'))) return;
    await window.__labClock.realFrame();
  }
}

/** The lobby logo's letters' box (css px). */
function lettersOf(target: HTMLElement): DOMRect | undefined {
  return target.querySelector('svg:not(.logo-glow)')?.getBoundingClientRect();
}

/** The exit's canvas's context (the last full-window canvas the exit put on the page). */
function fieldOf(): WebGL2RenderingContext {
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('body > canvas')];
  const field = canvases.filter((canvas) => canvas.style.zIndex === '101').at(-1);
  const gl = field?.getContext('webgl2');
  if (!gl) throw new Error('lab: wind: the exit\'s canvas wasn\'t found');
  return gl;
}

/** The lobby logo's snapshots the exit's canvas takes from now on (its texImage2D's calls), counted. */
function countUploads(gl: WebGL2RenderingContext): { count: number } {
  const uploads = { count: 0 };
  const upload = gl.texImage2D as (...values: unknown[]) => void;
  gl.texImage2D = function (this: WebGL2RenderingContext, ...values: unknown[]) {
    uploads.count++;
    return upload.apply(this, values);
  } as typeof gl.texImage2D;
  return uploads;
}

/** When each of `screens` comes (s into the exit): the first early in the gust, the last a moment before the first
 *  points rest, the rest between them. */
function resizesOf(screens: Screen[]): { at: number; screen: Screen }[] {
  const last = restOf(0).from - RESIZE_BEFORE;
  const gaps = Math.max(1, screens.length - 1);
  return screens.map((screen, i) => ({ at: RESIZE_FROM + (last - RESIZE_FROM) * i / gaps, screen }));
}

/** Whether `done` came true within `ms` (the browser's clock), asked every 20 ms. */
async function waitFor(done: () => boolean, ms: number): Promise<boolean> {
  const until = window.__labClock.realNow() + ms;
  while (!done()) {
    if (window.__labClock.realNow() > until) return false;
    await realWait(20);
  }
  return true;
}

/** The lobby logo's own animations (its uncovering, its glow's) over, on the browser's clock, and a frame drawn. */
async function settled(target: HTMLElement): Promise<void> {
  const running = target.getAnimations({ subtree: true }).map((animation) => animation.finished);
  await Promise.race([Promise.all(running), realWait(SETTLE_WAIT_MS)]);
  await window.__labClock.realFrame();
}

/** The patch round the lobby logo's letters where they are now, within the screen (device px). */
function areaOf(target: HTMLElement): Area {
  const box = lettersOf(target)!;
  const ratio = devicePixelRatio;
  const x = Math.max(0, Math.floor((box.left - box.width * PAD.x) * ratio));
  const y = Math.max(0, Math.floor((box.top - box.height * PAD.y) * ratio));
  const right = Math.min(Math.floor(innerWidth * ratio), Math.ceil((box.right + box.width * PAD.x) * ratio));
  const bottom = Math.min(Math.floor(innerHeight * ratio), Math.ceil((box.bottom + box.height * PAD.y) * ratio));
  return { x, y, width: right - x, height: bottom - y };
}

const sameArea = (a: Area, b: Area): boolean => {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
};

/**
 * The particles' picture as they rest in the lobby logo's place, a column at a time: each the exit's canvas as it was
 * at the last frame the column's points all rested there (premultiplied, as the canvas holds it). Read where the
 * logo is as the first column rests: the logo moved after it is `moved`.
 */
class Rested {
  patch: Patch | null = null;
  area: Area | null = null;
  /** the frames each column was read at rest */
  reads: number[] = [];
  moved = false;

  /** The columns resting at `t`, read from the exit's canvas as it was just drawn. */
  read(gl: WebGL2RenderingContext, target: HTMLElement, t: number): void {
    const box = lettersOf(target)!;
    const area = areaOf(target);
    const ratio = devicePixelRatio;
    const resting: number[] = [];
    for (let column = 0; column < area.width; column++) {
      const x = ((area.x + column + 0.5) / ratio - box.left) / box.width;
      const { from, to } = restOf(x);
      if (t >= from - 1e-6 && t <= to + 1e-6) resting.push(column);
    }
    if (resting.length === 0) return;
    if (!this.area) this.start(area);
    if (!sameArea(this.area!, area)) {
      this.moved = true;
      return;
    }
    const pixels = canvasPixels(gl, area);
    const patch = this.patch!;
    for (const column of resting) {
      for (let row = 0; row < area.height; row++) {
        const at = (row * area.width + column) * 4;
        patch.data.set(pixels.subarray(at, at + 4), at);
      }
      this.reads[column]++;
    }
  }

  /** The columns never read at rest. */
  unread(): number {
    return this.reads.filter((reads) => reads === 0).length;
  }

  private start(area: Area): void {
    this.area = area;
    this.patch = { width: area.width, height: area.height, data: new Uint8ClampedArray(area.width * area.height * 4) };
    this.reads = new Array<number>(area.width).fill(0);
  }
}

/** The exit's canvas's pixels in `area` as just drawn, rows from the top (its drawing buffer's run from its bottom). */
function canvasPixels(gl: WebGL2RenderingContext, area: Area): Uint8Array {
  const rows = new Uint8Array(area.width * area.height * 4);
  gl.readPixels(area.x, gl.drawingBufferHeight - area.y - area.height, area.width, area.height, gl.RGBA,
    gl.UNSIGNED_BYTE, rows);
  const pixels = new Uint8Array(rows.length);
  const row = area.width * 4;
  for (let r = 0; r < area.height; r++) {
    pixels.set(rows.subarray((area.height - 1 - r) * row, (area.height - r) * row), r * row);
  }
  return pixels;
}

/** How the lobby logo shows once the window has changed again after the exit (a tenth smaller each way, which
 *  sizes the UI again): as itself, any picture of it the exit left gone. */
interface Changed {
  screen: Screen;
  /** whether the logo showed as a picture before the change (a canvas in its place) */
  wasPicture: boolean;
  /** whether it shows as itself after it: its letters seen, no picture */
  itself: boolean;
}

async function afterChange(lab: Lab, target: HTMLElement): Promise<Changed> {
  const picture = (): boolean => target.querySelector('canvas') !== null;
  const wasPicture = picture();
  const smaller = (size: number): number => Math.round(size * 0.9);
  const screen = { width: smaller(innerWidth), height: smaller(innerHeight), ratio: devicePixelRatio };
  await lab.showOn(screen);
  await lab.step(1);
  await window.__labClock.realFrame();
  const letters = target.querySelector<SVGSVGElement>('svg:not(.logo-glow)');
  const itself = !picture() && letters !== null && getComputedStyle(letters).visibility === 'visible';
  return { screen, wasPicture, itself };
}

/** The pictures of the patch once the exit is done: the lobby as it shows (twice, which must agree), with its logo's
 *  letters hidden (what lies behind them), and with the logo a pixel lower (the canary's). The logo's glow is hidden
 *  in each: the particles' picture is read without it. */
interface Pictures {
  area: Area;
  logo: Patch;
  again: Patch;
  behind: Patch;
  lower: Patch | null;
}

async function pictured(target: HTMLElement, canary: boolean): Promise<Pictures> {
  const area = areaOf(target);
  const glows = [...target.querySelectorAll<SVGElement>('.logo-glow')];
  const letters = [...target.children].filter((child) => !child.classList.contains('logo-glow')) as HTMLElement[];
  const hidden = (elements: (HTMLElement | SVGElement)[], hide: boolean): void => {
    for (const element of elements) element.style.visibility = hide ? 'hidden' : '';
  };
  hidden(glows, true);
  const logo = await patchAt(area);
  const again = await patchAt(area);
  hidden(letters, true);
  const behind = await patchAt(area);
  hidden(letters, false);
  let lower: Patch | null = null;
  if (canary) {
    target.style.translate = `0 ${1 / devicePixelRatio}px`;
    lower = await patchAt(area);
    target.style.translate = '';
  }
  hidden(glows, false);
  return { area, logo, again, behind, lower };
}

/** The screen's pixels in `area` as the browser shows them, once it has drawn a frame. */
async function patchAt(area: Area): Promise<Patch> {
  if (!window.__labScreenshot) throw new Error('lab: wind: this page has no screenshots (opened by an older lab)');
  await window.__labClock.realFrame();
  const ratio = devicePixelRatio;
  const clip = { x: area.x / ratio, y: area.y / ratio, width: area.width / ratio, height: area.height / ratio };
  const patch = await patchOf(await window.__labScreenshot(clip));
  if (patch.width !== area.width || patch.height !== area.height) {
    const asked = `${area.width}x${area.height}`;
    throw new Error(`lab: wind: the screen pictured ${patch.width}x${patch.height}, not the ${asked} asked`);
  }
  return patch;
}

/** What `windHandoff` found, for its report. */
interface Found {
  lab: Lab;
  options: WindOptions;
  first: Screen;
  frames: number;
  taken: number;
  waited: number;
  rested: Rested;
  pictures: Pictures;
  changed: Changed;
}

function reportOf(found: Found): Report {
  const { options, first, frames, taken, waited, rested, pictures, changed } = found;
  const lines: string[] = [];
  const problems: string[] = [];
  const resized = options.resize.map(screenName).join(' then ');
  lines.push(`wind: the loading screen's exit into the lobby logo on ${screenName(first)}`
    + (resized ? `, the window put on ${resized} as the particles flew` : ''));
  const snapshots = waited ? `, the logo's snapshot taken again ${taken} of the ${waited} times it changed` : '';
  lines.push(`  the exit: ${frames} frames${snapshots}`);
  if (taken < waited) {
    problems.push(`the lobby logo's snapshot wasn't taken again after ${waited - taken} of its changes`);
  }
  if (!rested.patch || !rested.area) throw new Error('lab: wind: no column of the lobby logo was read at rest');
  if (rested.moved) problems.push('the lobby logo moved after its first column of particles rested');
  if (!sameArea(rested.area, pictures.area)) problems.push('the lobby logo moved after its particles rested');
  const unread = rested.unread();
  lines.push(`  the particles at rest: ${rested.area.width - unread} of the ${rested.area.width} columns round the logo`
    + ` read as they rested (${rested.area.width}x${rested.area.height} px at ${devicePixelRatio}x)`);
  if (unread) problems.push(`${unread} columns round the lobby logo were never read as their particles rested`);
  const twice = apartOf(pictures.logo, pictures.again, pictures.behind);
  lines.push(`  the lobby pictured twice: ${twice.apart} pixels apart`);
  if (twice.apart) {
    problems.push(`the lobby pictured twice was ${twice.apart} pixels apart: its pictures can't be held to anything`);
  }
  const particles = laidOver(rested.patch, pictures.behind);
  const jump = jumpOf(particles, pictures.logo, pictures.behind);
  lines.push(`  the particles at rest against the lobby logo: ${jump.line}`);
  if (jump.jumps) problems.push(`the lobby logo jumps as the particles hand over to it: ${jump.line}`);
  if (pictures.lower) {
    const lower = jumpOf(particles, pictures.lower, pictures.behind);
    const found = lower.move.dy - jump.move.dy;
    const across = Math.abs(lower.move.dx - jump.move.dx);
    const caught = lower.jumps && Math.abs(found - 1) <= CANARY_NEAR && across <= CANARY_NEAR;
    const how = `found ${found.toFixed(2)} px lower`;
    lines.push(`  canary: the logo a pixel lower ${caught ? 'caught' : 'went unseen'}, ${how}`);
    if (!caught) problems.push(`the canary's logo a pixel lower went unseen: ${lower.line}`);
  }
  const was = changed.wasPicture ? 'shown as their picture' : 'shown as itself';
  const after = changed.itself ? 'as itself again' : 'NOT as itself';
  lines.push(`  the lobby logo after the exit: ${was}; the window put on ${screenName(changed.screen)}, ${after}`);
  if (!changed.itself) problems.push(`the lobby logo didn't show as itself once the window had changed after the exit`);
  const moments: Pictured[] = [{
    label: 'the particles at rest, the lobby logo, where they are apart (x4)',
    tiles: [
      tileOf('rest', particles),
      tileOf('logo', pictures.logo),
      tileOf('apart', differenceOf(particles, pictures.logo)),
    ],
    notes: [jump.line],
  }];
  return { text: lines.join('\n'), problems, moments };
}

/** How far the logo stands from the particles at rest: its pixels apart, and the move that fits one to the other. */
function jumpOf(particles: Patch, logo: Patch, behind: Patch): { line: string; jumps: boolean; move: Move } {
  const apart: Apart = apartOf(particles, logo, behind);
  const move = moveOf(particles, logo);
  const jumps = apart.apart > apart.logo * MOST_APART;
  const share = apart.logo ? (apart.apart / apart.logo * 100).toFixed(2) : '0';
  const line = `${apart.apart} of the logo's ${apart.logo} pixels apart past ${APART} (${share}%; the most `
    + `${apart.most}, the mean ${apart.mean.toFixed(2)}), the logo ${moveName(move)}`;
  return { line, jumps, move };
}

/** Where the logo stands from the particles, as words: how far right or left of them, and down or up. */
function moveName(move: Move): string {
  const across = move.dx === 0 ? '' : `${Math.abs(move.dx).toFixed(2)} px ${move.dx > 0 ? 'right' : 'left'}`;
  const down = move.dy === 0 ? '' : `${Math.abs(move.dy).toFixed(2)} px ${move.dy > 0 ? 'down' : 'up'}`;
  return across || down ? `${[across, down].filter(Boolean).join(' and ')} of them` : 'where they rested';
}

function tileOf(view: string, patch: Patch): Pictured['tiles'][number] {
  return { view, png: pngOf(patch), width: patch.width, height: patch.height };
}
