// HDR output: on a display in HDR mode, the frame's highlights (effects, glows, the sun's glints) go brighter than the
// screen's white, while everything under them shows as it does on an SDR screen. The grade draws the frame in 16-bit
// floats, past 1 where it's brighter than white (`renderer.ts`). A WebGL canvas is always shown in SDR (Chrome 149 has
// no way to put one in extended range), so the frame is copied each frame onto a WebGPU canvas that is
// (`toneMapping: extended`), on the GPU (`copyExternalImageToTexture`), and that canvas is what shows. The WebGL
// canvas stays under it, invisible, and still takes the pointer.
//
// The levels are the player's, as shares of the screen's white for SDR content (the OS's, which no page can read in
// nits): `paper`, how bright the frame's white is, and `peak`, how far its highlights may go. SDR screens, a browser
// without WebGPU and HDR set off draw as before, with no WebGPU device started.
//
// On the WebGPU renderer (core/webgpu.ts) the game's own canvas is put in extended range as the renderer is made, when
// HDR is wanted then (`initHdrForWebGPU`): three configures its canvas once, so a change of the setting or the display
// shows after a reload there (`reload`).
import { readCookie, writeCookie } from './cookies';

/** Auto: HDR on whenever the display is in HDR mode. */
export type HdrMode = 'auto' | 'off';
export interface HdrSettings {
  mode: HdrMode;
  /** the frame's white, a share of the screen's white for SDR content */
  paper: number;
  /** the brightest highlight, a share of the screen's white for SDR content */
  peak: number;
}
/** What HDR is doing: on, set off, no HDR display, a browser that can't, or starting. */
export type HdrStatus = 'on' | 'off' | 'sdr-display' | 'unsupported' | 'starting' | 'reload';

const COOKIE = 'last-stand-hdr';
const DEFAULTS: HdrSettings = { mode: 'auto', paper: 1, peak: 3 };
/** the sliders' ends */
export const PAPER_RANGE = [0.4, 1.6] as const;
export const PEAK_RANGE = [1.2, 8] as const;
/** a display in HDR mode, as the browser sees it (it changes as the window moves to another monitor) */
const HDR_DISPLAY = '(dynamic-range: high)';
/** `?hdr=1` draws in HDR on any display (to check the path on an SDR one), `?hdr=0` never */
const FORCED = typeof location === 'undefined' ? null : /[?&]hdr=([01])/.exec(location.search)?.[1] ?? null;
/** RGBA16F and RGBA8, the drawing buffer's formats (WebGL2) */
const FLOAT16 = 0x881a;
const BYTE8 = 0x8058;
/** WebGPU's texture usages (`GPUTextureUsage`, which TypeScript's DOM types don't define) */
const COPY_SRC = 0x01, COPY_DST = 0x02, RENDER_ATTACHMENT = 0x10;

/** WebGL2's drawing buffer storage (Chrome 122 on), which TypeScript's DOM types don't have yet. */
interface DrawingBufferStorage {
  drawingBufferStorage?(format: number, width: number, height: number): void;
  drawingBufferFormat?: number;
}
type WebGL = WebGL2RenderingContext & DrawingBufferStorage;

/** The WebGPU side, once started: the canvas that shows the frame, and its device. */
interface Presenter {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
}

let settings: HdrSettings = { ...DEFAULTS };
let gl: WebGL | null = null;
let glCanvas: HTMLCanvasElement | null = null;
let presenter: Presenter | null = null;
let starting: Promise<void> | null = null;
let unsupported = false;
/** on the WebGPU renderer: whether its canvas was made in extended range (null: the WebGL renderer's presenter) */
let onWebGPU: boolean | null = null;
/** the lab's override of the display (null: the display's own) */
let forced: boolean | null = FORCED === null ? null : FORCED === '1';
let displayHdr = false;
const listeners: (() => void)[] = [];

const clamp = (value: number, [least, most]: readonly [number, number]): number => Math.min(most, Math.max(least, value));

/** The settings from their cookie (`auto,1,3`), the defaults for what's missing. */
function readSettings(): HdrSettings {
  const [mode, paper, peak] = (readCookie(COOKIE) ?? '').split(',');
  return {
    mode: mode === 'off' ? 'off' : 'auto',
    paper: Number.isFinite(Number(paper)) && paper ? clamp(Number(paper), PAPER_RANGE) : DEFAULTS.paper,
    peak: Number.isFinite(Number(peak)) && peak ? clamp(Number(peak), PEAK_RANGE) : DEFAULTS.peak,
  };
}

/** Whether HDR is wanted now: the setting, the display (or the lab's override). */
function wanted(): boolean {
  if (forced !== null) return forced;
  return settings.mode === 'auto' && displayHdr;
}

/** Starts the WebGPU side: its device and an extended-range canvas over the game's. Sets `unsupported` if it can't. */
async function start(): Promise<void> {
  const supported = gl?.drawingBufferStorage && typeof navigator !== 'undefined' && navigator.gpu;
  const adapter = supported ? await navigator.gpu.requestAdapter().catch(() => null) : null;
  const device = adapter ? await adapter.requestDevice().catch(() => null) : null;
  if (!device || !glCanvas) {
    unsupported = true;
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.id = 'hdr-canvas';
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) {
    unsupported = true;
    return;
  }
  // (copied to: a copy's destination must be a render attachment too; read back by the lab)
  const usage = RENDER_ATTACHMENT | COPY_DST | COPY_SRC;
  context.configure({ device, format: 'rgba16float', usage, alphaMode: 'opaque', toneMapping: { mode: 'extended' } });
  if (context.getConfiguration()?.toneMapping?.mode !== 'extended') {
    unsupported = true;
    return;
  }
  glCanvas.after(canvas);
  presenter = { device, canvas, context };
  void device.lost.then((info) => {
    if (presenter?.device !== device) return;
    console.warn(`HDR: the WebGPU device was lost (${info.message}): back to SDR`);
    presenter.canvas.remove();
    presenter = null;
    unsupported = true;
    apply();
  });
}

/** The drawing buffer in `format` at the canvas's size. */
function storeAs(format: number): void {
  if (!gl?.drawingBufferStorage || gl.drawingBufferFormat === format) return;
  gl.drawingBufferStorage(format, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

/** Puts the output in the state wanted: HDR started and shown, or the WebGL canvas shown alone. */
function apply(): void {
  if (onWebGPU !== null) {
    for (const listener of listeners) listener();
    return;
  }
  const on = wanted() && !unsupported;
  if (on && !presenter && !starting) {
    starting = start().finally(() => {
      starting = null;
      apply();
    });
  }
  const shown = on && presenter !== null;
  storeAs(shown ? FLOAT16 : BYTE8);
  if (glCanvas) glCanvas.style.opacity = shown ? '0' : '';
  if (presenter) presenter.canvas.hidden = !shown;
  for (const listener of listeners) listener();
}

/** Watches the display and reads the settings: HDR starts once the display is in HDR mode. */
export function initHdr(canvas: HTMLCanvasElement, context: WebGL2RenderingContext): void {
  glCanvas = canvas;
  gl = context as WebGL;
  settings = readSettings();
  const query = matchMedia(HDR_DISPLAY);
  displayHdr = query.matches;
  query.addEventListener('change', () => {
    displayHdr = query.matches;
    apply();
  });
  apply();
}

/** Reads the settings and the display for the WebGPU renderer, about to be made: whether its canvas is to be made in
 *  extended range (a browser that can't take it shows it as SDR). Watches the display for the settings' note. */
export function initHdrForWebGPU(): boolean {
  settings = readSettings();
  const query = matchMedia(HDR_DISPLAY);
  displayHdr = query.matches;
  query.addEventListener('change', () => {
    displayHdr = query.matches;
    apply();
  });
  onWebGPU = wanted();
  return onWebGPU;
}

/** Whether the frame is drawn and shown in HDR now. */
export const hdrActive = (): boolean => onWebGPU ?? (presenter !== null && !presenter.canvas.hidden);

/** The levels the grade draws at: the paper white and the peak (both 1 in SDR). */
export function hdrLevels(): { paper: number; peak: number } {
  if (!hdrActive()) return { paper: 1, peak: 1 };
  return { paper: settings.paper, peak: Math.max(settings.peak, settings.paper) };
}

/** What HDR is doing, for the settings. */
export function hdrStatus(): HdrStatus {
  if (onWebGPU !== null && onWebGPU !== wanted()) return 'reload';
  if (hdrActive()) return 'on';
  if (!wanted()) return forced === null && settings.mode === 'auto' ? 'sdr-display' : 'off';
  if (unsupported) return 'unsupported';
  return 'starting';
}

export const hdrSettings = (): HdrSettings => ({ ...settings });

/** Changes the settings (kept in their cookie) and applies them. */
export function setHdrSettings(change: Partial<HdrSettings>): void {
  settings = {
    mode: change.mode ?? settings.mode,
    paper: clamp(change.paper ?? settings.paper, PAPER_RANGE),
    peak: clamp(change.peak ?? settings.peak, PEAK_RANGE),
  };
  writeCookie(COOKIE, `${settings.mode},${settings.paper},${settings.peak}`);
  apply();
}

/** Calls `listener` whenever HDR goes on or off. */
export function onHdrChange(listener: () => void): void {
  listeners.push(listener);
}

/**
 * The lab's: HDR on (`true`) or off on any display, or back to the display's own (`null`); resolves once it is as
 * asked (on, if the browser can).
 */
export async function forceHdr(on: boolean | null): Promise<void> {
  forced = on;
  apply();
  await starting;
}

/** The frame drawn into the WebGL canvas, copied onto the HDR canvas to be shown (once the frame is finished). */
export function presentHdr(): void {
  if (!hdrActive() || !presenter || !gl || !glCanvas) return;
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const { canvas, context, device } = presenter;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const texture = context.getCurrentTexture();
  // (the frame's alpha is 0, the canvas premultiplied and drawn over the page as light added to it: taken as it is,
  // or the copy divides the colour by that alpha)
  const destination = { texture, premultipliedAlpha: true };
  device.queue.copyExternalImageToTexture({ source: glCanvas }, destination, [width, height]);
}

/** The HDR canvas's current texture, as shown this frame (the lab reads it back), or null when HDR is off. */
export const shownTexture = (): GPUTexture | null => (hdrActive() && presenter ? presenter.context.getCurrentTexture() : null);
export const hdrDevice = (): GPUDevice | null => presenter?.device ?? null;
