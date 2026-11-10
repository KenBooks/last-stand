// The frame's light as the player sees it (tools/lab `light`): the hero standing in a biome, in one of the game's
// views and looking one way, the frame drawn by the game's own camera and read back from the canvas as shown. Its
// light is a share of the screen's white (SDR white: on a display in HDR mode, the OS's white for SDR content): the
// mean, by thirds of the frame (the sky's at the top through the eyes), its brightest pixels, and how much of it is
// near white, or past white where the frame is HDR. An SDR frame is read as an SDR screen shows it (gamma 2.2), an
// HDR one as the browser shows its extended sRGB (the sRGB curve, past 1 for the highlights).
//
// With HDR (`--hdr`), the same moment is drawn again in HDR (core/hdr.ts) and checked against the SDR frame: under the
// knee every pixel as the SDR screen shows it at the paper white, nothing past the peak, and the canvas shown (the
// WebGPU one, read back) the frame drawn. A frame needs pixels to judge, so this draws, where the lab's other
// measures never do.
//
// At every quality level and Resolution (`--levels`, `--resolutions`), the same moment is drawn again at each, set as
// the pause menu sets them, and held to the first's light: a level is there to cost less, never to look brighter.
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { CAMERA } from '../../../src/data/balance';
import { hdrOutput } from './hdrOutput';
import { useQuality } from '../../../src/core/quality';
import type { QualityLevel } from '../../../src/data/quality';
import type { BiomeId } from '../../../src/data/biomes';
import type { WeaponStyle } from '../../../src/loot/loadout';

/** One of the frames measured: the biome, the view and the way the view looks (degrees, 0 is +z). */
export interface LightScenario {
  biome: BiomeId;
  view: renderer.ViewMode;
  facing: number;
  /** the way the hero holds his weapons (as rolled when not given), and with it the weapon, by its base
   *  (`Fixture.weapon`) */
  gear?: WeaponStyle;
  weapon?: string;
  /** where he stands (x, z; the set-up's spot off the dais when not given) */
  at?: [number, number];
  /** the hero built afresh for it (a quality's detail is the hero's from his build) */
  fresh?: boolean;
  /** the top-down view's zoom (the game's: under 1 is nearer); the game's own where none */
  zoom?: number;
  /** tunable values set for it, by their paths (`Fixture.tune`) */
  tune?: Record<string, number[]>;
}

/** HDR's levels, as shares of the screen's white for SDR content. */
export interface HdrLevels {
  paper: number;
  peak: number;
}

/** A quality level and a Resolution (the share of the screen's pixels each way) a frame is drawn at. */
export interface LevelSetting {
  level: QualityLevel;
  resolution: number;
}

export interface LightOptions {
  scenario: LightScenario;
  /** the settings the frame is drawn at again, each held to the first's light (none: the boot's alone) */
  settings?: LevelSetting[];
  /** the frame pictured too */
  pictures: boolean;
  /** plant faults the measures must catch: the frame at twice the exposure, and in HDR at another paper white */
  canary: boolean;
  /** the same moment drawn again in HDR at these levels, and checked against the SDR frame */
  hdr?: HdrLevels;
}

/** a pixel's light this bright or more (a share of white) is near white */
const NEAR_WHITE = 0.75;
/** the pixels read each way for the light: every this many, so a frame's sort stays small */
const SAMPLE_STEP = 2;
/** the frames stood before a frame is drawn, once the view is set (its particles, the adaptation) */
const SETTLE_FRAMES = 30;
/** with --canary: the exposure's planted factor, and how much brighter its frame's mean must come out */
const CANARY_EXPOSURE = 2;
const CANARY_BRIGHTER = 1.25;
/** a setting's frame may be this many times the first's mean, and its brightest hundredth, plus a little (dark frames) */
const LEVEL_BRIGHTER = 1.12;
const LEVEL_SLACK = 0.004;
/** and this much more of the frame near white */
const LEVEL_NEAR_WHITE = 0.002;
/** with --canary and --hdr: the paper white's planted factor, which the check under the knee must catch */
const CANARY_PAPER = 1.2;
/** how far an HDR pixel under the knee may be off the SDR one at the paper white: a share of it, and outright (an
 *  8-bit channel's step is 1/255 of the encoded value: a few % of a dark pixel's light) */
const KNEE_SHARE = 0.03;
const KNEE_LIGHT = 0.002;
/** the share of the pixels under the knee that may be off it (none should be) */
const KNEE_OFF_MOST = 0.001;
/** how far past the peak a highlight may be (float16's step) */
const PEAK_SLACK = 1.01;
/** how far the canvas shown may be off the frame drawn, encoded (float16's step at the brightest) */
const SHOWN_SLACK = 0.004;
/** the bytes a texture row is copied in multiples of (WebGPU), and a float16 RGBA pixel's */
const ROW_ALIGN = 256;
const PIXEL_BYTES = 8;
/** WebGPU's buffer usages and map mode (`GPUBufferUsage`, `GPUMapMode`: TypeScript's DOM types don't define them) */
const MAP_READ = 0x0001;
const COPY_DST = 0x0008;
const MAP_MODE_READ = 0x0001;

/** The canvas's pixels as last drawn, each channel as encoded (1 is white), its size and whether it's HDR. */
export interface Canvas {
  pixels: Float32Array;
  width: number;
  height: number;
  hdr: boolean;
}

/** A box of the canvas's pixels, from its bottom left (the canvas reads from its bottom row up). */
export interface CanvasBox {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

/** How bright a frame is, as shares of white. */
interface FrameLight {
  mean: number;
  /** the means of its top, middle and bottom thirds */
  thirds: [number, number, number];
  p50: number;
  p90: number;
  p99: number;
  max: number;
  /** the share of its pixels at least `NEAR_WHITE` */
  nearWhite: number;
  /** the share past white (an HDR frame's highlights) */
  pastWhite: number;
  hdr: boolean;
}

/** An encoded channel's light: by the sRGB curve (extended past 1) for an HDR frame, gamma 2.2 for an SDR one. */
function decoded(encoded: number, hdr: boolean): number {
  if (!hdr) return Math.max(0, encoded) ** 2.2;
  if (encoded <= 0.04045) return encoded / 12.92;
  return ((encoded + 0.055) / 1.055) ** 2.4;
}

/** The light of the pixel at `at` (its first channel's index), Rec. 709's weights. */
export function pixelLight(canvas: Canvas, at: number): number {
  const { pixels, hdr } = canvas;
  const red = decoded(pixels[at], hdr);
  const green = decoded(pixels[at + 1], hdr);
  const blue = decoded(pixels[at + 2], hdr);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The brightest channel's light of the pixel at `at`: what the grade grows past the knee. */
export function topLight(canvas: Canvas, at: number): number {
  const { pixels, hdr } = canvas;
  return Math.max(decoded(pixels[at], hdr), decoded(pixels[at + 1], hdr), decoded(pixels[at + 2], hdr));
}

/** The canvas's size in its own pixels. */
export function canvasSize(): { width: number; height: number } {
  const gl = G.renderer.getContext();
  return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
}

/** Bytes as encoded channels (a byte loop: `Float32Array.from` with a mapping took most of a measure's time). */
function channelsOf(bytes: Uint8Array): Float32Array {
  const channels = new Float32Array(bytes.length);
  for (let at = 0; at < bytes.length; at++) channels[at] = bytes[at] / 255;
  return channels;
}

/** The canvas's pixels as last drawn: all of them, or those of `box`. */
function readCanvas(box?: CanvasBox): Canvas {
  const gl = G.renderer.getContext() as WebGL2RenderingContext & { drawingBufferFormat: number };
  G.renderer.setRenderTarget(null);
  const { left, bottom, width, height } = box ?? { left: 0, bottom: 0, ...canvasSize() };
  if (gl.drawingBufferFormat === gl.RGBA16F) {
    const pixels = new Float32Array(width * height * 4);
    gl.readPixels(left, bottom, width, height, gl.RGBA, gl.FLOAT, pixels);
    return { pixels, width, height, hdr: true };
  }
  const bytes = new Uint8Array(width * height * 4);
  gl.readPixels(left, bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  return { pixels: channelsOf(bytes), width, height, hdr: false };
}

/** The frame drawn now by the game's own camera, as the player sees it; returns its pixels, or those of `box`. */
export function drawFrame(lab: Lab, box?: CanvasBox): Canvas {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    renderer.render();
  } finally {
    lab.drawing = drawing;
  }
  return readCanvas(box);
}

/** The value `share` of the way up sorted `values`. */
function percentile(values: Float32Array, share: number): number {
  return values[Math.min(values.length - 1, Math.floor(values.length * share))];
}

/** How bright `canvas` is. */
function lightOf(canvas: Canvas): FrameLight {
  const { width, height } = canvas;
  const lights: number[] = [];
  const thirds = [0, 0, 0];
  const counts = [0, 0, 0];
  let nearWhite = 0;
  let pastWhite = 0;
  for (let y = 0; y < height; y += SAMPLE_STEP) {
    // (the canvas reads from its bottom row up)
    const third = Math.min(2, Math.floor((height - 1 - y) / height * 3));
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const light = pixelLight(canvas, (y * width + x) * 4);
      lights.push(light);
      thirds[third] += light;
      counts[third]++;
      if (light >= NEAR_WHITE) nearWhite++;
      if (light > 1) pastWhite++;
    }
  }
  const sorted = Float32Array.from(lights).sort();
  return {
    mean: (thirds[0] + thirds[1] + thirds[2]) / sorted.length,
    thirds: [thirds[0] / counts[0], thirds[1] / counts[1], thirds[2] / counts[2]],
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    nearWhite: nearWhite / sorted.length,
    pastWhite: pastWhite / sorted.length,
    hdr: canvas.hdr,
  };
}

/** What the HDR frame did against the SDR frame of the same moment. */
interface HdrCheck {
  /** the share of the pixels under the knee that were off the SDR frame at the paper white, and the worst */
  offShare: number;
  worst: string;
  /** the brightest pixel's brightest channel, a share of white */
  brightest: number;
}

/**
 * The HDR frame against the SDR one, pixel by pixel: under the knee (the SDR pixel's brightest channel, as shown)
 * each as the SDR screen shows it at `paper`, and the brightest channel anywhere.
 */
function againstSdr(sdr: Canvas, hdr: Canvas, paper: number): HdrCheck {
  let under = 0;
  let off = 0;
  let worst = '';
  let worstBy = 0;
  let brightest = 0;
  for (let at = 0; at < sdr.pixels.length; at += 4) {
    brightest = Math.max(brightest, topLight(hdr, at));
    if (topLight(sdr, at) >= renderer.HDR_KNEE) continue;
    under++;
    const wanted = pixelLight(sdr, at) * paper;
    const got = pixelLight(hdr, at);
    const by = Math.abs(got - wanted);
    if (by <= wanted * KNEE_SHARE + KNEE_LIGHT) continue;
    off++;
    if (by > worstBy) {
      worstBy = by;
      worst = `${got.toFixed(4)} where the SDR frame's ${wanted.toFixed(4)}`;
    }
  }
  return { offShare: off / Math.max(1, under), worst, brightest };
}

/** The HDR output's module (a tree without one has none). */
type Hdr = NonNullable<Awaited<ReturnType<typeof hdrOutput>>>;

/** The HDR canvas's texture as shown this frame, read back: each channel as encoded, rows from the bottom up as
 *  the WebGL canvas reads (null when HDR is off). */
async function readShown(hdr: Hdr): Promise<Float32Array | null> {
  const texture = hdr.shownTexture();
  const device = hdr.hdrDevice();
  if (!texture || !device) return null;
  const { width, height } = texture;
  const rowBytes = Math.ceil(width * PIXEL_BYTES / ROW_ALIGN) * ROW_ALIGN;
  const buffer = device.createBuffer({ size: rowBytes * height, usage: COPY_DST | MAP_READ });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: rowBytes }, [width, height]);
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(MAP_MODE_READ);
  const halves = new Uint16Array(buffer.getMappedRange());
  const pixels = new Float32Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = row * rowBytes / 2;
    const to = (height - 1 - row) * width * 4;
    for (let index = 0; index < width * 4; index++) pixels[to + index] = fromHalf(halves[from + index]);
  }
  buffer.unmap();
  buffer.destroy();
  return pixels;
}

/** A 16-bit float's value. */
function fromHalf(half: number): number {
  const exponent = (half >> 10) & 31;
  const mantissa = half & 1023;
  const sign = half >> 15 ? -1 : 1;
  if (exponent === 0) return sign * mantissa / 1024 * 2 ** -14;
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

/** How far the canvas shown is off the frame drawn at most, encoded. */
function shownOff(drawn: Canvas, shown: Float32Array): number {
  let most = 0;
  for (let index = 0; index < shown.length; index++) {
    if (index % 4 === 3) continue;
    most = Math.max(most, Math.abs(shown[index] - drawn.pixels[index]));
  }
  return most;
}

/** A scenario's name: `forest first 90°`. */
export function scenarioName(scenario: LightScenario): string {
  return `${scenario.biome} ${scenario.view} ${scenario.facing}°`;
}

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** A frame's light as a line. */
function lightLine(light: FrameLight): string {
  const thirds = light.thirds.map((mean) => mean.toFixed(3)).join(' / ');
  const spread = `p50 ${light.p50.toFixed(3)}, p90 ${light.p90.toFixed(3)}, p99 ${light.p99.toFixed(3)}`;
  const past = light.hdr ? `, past white ${percent(light.pastWhite)}` : '';
  return `mean ${light.mean.toFixed(3)} (thirds ${thirds}), ${spread}, max ${light.max.toFixed(2)}, `
    + `near white ${percent(light.nearWhite)}${past}`;
}

/** The camera turned to look along `facing` (rad, 0 is +z): in the close views the body follows the camera's look. */
export async function lookAlong(lab: Lab, facing: number): Promise<void> {
  // (the camera looks along its yaw and a half turn)
  const yaw = facing - Math.PI;
  const turn = Math.atan2(Math.sin(yaw - renderer.cameraYaw()), Math.cos(yaw - renderer.cameraYaw()));
  await lab.step(1, () => ({ look: [-turn / CAMERA.lookSpeed, 0] }));
}

/** The hero set up standing in `scenario`'s biome and view, looking its way, the frame settled. */
export async function standIn(lab: Lab, scenario: LightScenario): Promise<void> {
  if (G.arena.biome !== scenario.biome) G.arena.setBiome(scenario.biome);
  const facing = scenario.facing * Math.PI / 180;
  const { view, gear, weapon, at, fresh, tune } = scenario;
  await lab.setup({ view, facing, gear, weapon, at, fresh, tune });
  if (scenario.view !== 'top') await lookAlong(lab, facing);
  if (scenario.zoom !== undefined) renderer.setZoom(scenario.zoom);
  await lab.step(SETTLE_FRAMES);
}

/** A setting as a line names it. */
const settingName = (setting: LevelSetting): string => `${setting.level} at ${Math.round(setting.resolution * 100)}%`;

/** `setting` put to use as the pause menu puts it, the frame settled under it. */
async function settle(lab: Lab, setting: LevelSetting): Promise<void> {
  useQuality(setting.level);
  renderer.setResolutionShare(setting.resolution);
  await lab.step(SETTLE_FRAMES);
}

/** What makes `frame` brighter than `first` allows, in words; none where it's within it. */
function brighterThan(first: FrameLight, frame: FrameLight): string[] {
  const over: string[] = [];
  const most = (light: number): number => light * LEVEL_BRIGHTER + LEVEL_SLACK;
  if (frame.mean > most(first.mean)) over.push(`mean ${frame.mean.toFixed(3)} against ${first.mean.toFixed(3)}`);
  if (frame.p99 > most(first.p99)) over.push(`its brightest hundredth ${frame.p99.toFixed(3)} against ${first.p99.toFixed(3)}`);
  if (frame.nearWhite > first.nearWhite + LEVEL_NEAR_WHITE) {
    over.push(`near white ${percent(frame.nearWhite)} against ${percent(first.nearWhite)}`);
  }
  return over;
}

/**
 * The same moment at each of `settings`, each frame's light held to the first's: a problem where one is brighter. With
 * a canary, the last drawn again at twice the exposure, which must be found brighter. The first is put back after.
 */
async function levelsRound(lab: Lab, name: string, settings: LevelSetting[], pictures: boolean, canary: boolean): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let first: FrameLight | undefined;
  for (const setting of settings) {
    await settle(lab, setting);
    const frame = lightOf(drawFrame(lab));
    first ??= frame;
    const over = brighterThan(first, frame);
    lines.push(`  ${settingName(setting)}: ${lightLine(frame)}${over.length ? ' (BRIGHTER)' : ''}`);
    if (over.length) {
      problems.push(`${name}: ${settingName(setting)} is brighter than ${settingName(settings[0])}: ${over.join(', ')}`);
    }
    if (pictures) moments.push(await lab.screen(`${name} ${settingName(setting)}`, [lightLine(frame)]));
  }
  if (canary && first) {
    const exposure = G.renderer.toneMappingExposure;
    G.renderer.toneMappingExposure = exposure * CANARY_EXPOSURE;
    const planted = brighterThan(first, lightOf(drawFrame(lab)));
    G.renderer.toneMappingExposure = exposure;
    lines.push(`  canary, the last at ${CANARY_EXPOSURE} times the exposure: ${planted.join(', ') || 'not found brighter'}`);
    if (!planted.length) problems.push(`${name}: the canary's brighter setting went unseen`);
  }
  await settle(lab, settings[0]);
  return { text: lines.join('\n'), problems, moments };
}

/** The exposure canary: the frame drawn again at twice the exposure, a problem unless it's found brighter. */
function exposureCanary(lab: Lab, name: string, frame: FrameLight, lines: string[], problems: string[]): void {
  const exposure = G.renderer.toneMappingExposure;
  G.renderer.toneMappingExposure = exposure * CANARY_EXPOSURE;
  const planted = lightOf(drawFrame(lab));
  G.renderer.toneMappingExposure = exposure;
  lines.push(`  canary, at ${CANARY_EXPOSURE} times the exposure: mean ${planted.mean.toFixed(3)}`);
  if (planted.mean < frame.mean * CANARY_BRIGHTER) {
    problems.push(`${name}: the canary's brighter frame went unseen (mean ${planted.mean.toFixed(3)})`);
  }
}

/**
 * The same moment in HDR at `levels`, against the SDR frame `sdr`: its light, the pixels under the knee off the SDR
 * frame, the brightest, and the canvas shown against the frame drawn. With a canary, drawn again at another paper
 * white, which the check under the knee must catch. HDR is set off again after.
 */
async function hdrRound(lab: Lab, name: string, sdr: Canvas, levels: HdrLevels, canary: boolean): Promise<Report> {
  const output = await hdrOutput();
  if (!output) return { text: '', problems: [`${name}: this tree has no HDR output (src/core/hdr.ts)`] };
  const lines: string[] = [];
  const problems: string[] = [];
  output.setHdrSettings(levels);
  await output.forceHdr(true);
  try {
    if (!output.hdrActive()) {
      return { text: '', problems: [`${name}: HDR never came on (no WebGPU, or no extended range)`] };
    }
    const hdr = drawFrame(lab);
    const shown = await readShown(output);
    const check = againstSdr(sdr, hdr, levels.paper);
    lines.push(`  HDR at paper ${levels.paper}, peak ${levels.peak}: ${lightLine(lightOf(hdr))}`);
    const worst = check.worst ? ` (worst ${check.worst})` : '';
    lines.push(`  under the knee: ${percent(check.offShare)} off the SDR frame${worst}; `
      + `brightest ${check.brightest.toFixed(2)} of the peak's ${levels.peak}`);
    if (check.offShare > KNEE_OFF_MOST) {
      problems.push(`${name}: HDR under the knee is off the SDR frame (${percent(check.offShare)})`);
    }
    if (check.brightest > levels.peak * PEAK_SLACK) {
      problems.push(`${name}: HDR goes past its peak (${check.brightest.toFixed(2)})`);
    }
    const off = shown ? shownOff(hdr, shown) : Infinity;
    lines.push(`  the canvas shown: ${shown ? `at most ${off.toFixed(4)} off the frame drawn` : 'none read'}`);
    if (off > SHOWN_SLACK) {
      problems.push(`${name}: the HDR canvas doesn't show the frame drawn (off by ${off.toFixed(4)})`);
    }
    if (canary) {
      output.setHdrSettings({ paper: levels.paper * CANARY_PAPER });
      const planted = againstSdr(sdr, drawFrame(lab), levels.paper);
      output.setHdrSettings(levels);
      const caught = percent(planted.offShare);
      lines.push(`  canary, at ${CANARY_PAPER} times the paper white: ${caught} off under the knee`);
      if (planted.offShare <= KNEE_OFF_MOST) {
        problems.push(`${name}: the canary's paper white went unseen under the knee`);
      }
    }
  } finally {
    await output.forceHdr(false);
  }
  return { text: lines.join('\n'), problems };
}

/**
 * `lab light`, one scenario: the frame's light, pictured if asked, and in HDR if asked; with a canary, faults planted
 * that the measures must catch.
 */
export async function light(lab: Lab, options: LightOptions): Promise<Report> {
  const name = scenarioName(options.scenario);
  await (await hdrOutput())?.forceHdr(false);
  await standIn(lab, options.scenario);
  const sdr = drawFrame(lab);
  const frame = lightOf(sdr);
  const lines = [`${name}: ${lightLine(frame)}`];
  const problems: string[] = [];
  if (frame.max <= 0) problems.push(`${name}: the frame is black (nothing was drawn)`);
  if (options.canary) exposureCanary(lab, name, frame, lines, problems);
  const moments: Pictured[] = [];
  if (options.pictures) moments.push(await lab.screen(name, [lightLine(frame)]));
  if (options.hdr) {
    const round = await hdrRound(lab, name, sdr, options.hdr, options.canary);
    if (round.text) lines.push(round.text);
    problems.push(...round.problems);
  }
  if (options.settings?.length) {
    const round = await levelsRound(lab, name, options.settings, options.pictures, options.canary);
    lines.push(round.text);
    problems.push(...round.problems);
    moments.push(...round.moments ?? []);
  }
  return { text: lines.join('\n'), problems, moments };
}
