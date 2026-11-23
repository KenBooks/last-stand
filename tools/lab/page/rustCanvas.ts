// What reaches the engine's canvas, as the page reads it: `lab rust`'s lines of the engine's device, the canvas's
// format, the screen, and the frame read back in the task that drew it. On a lent laptop the engine drew its 292
// calls a frame and its canvas stayed empty, with nothing said: the lab's picture white behind the HUD, the game's
// own check "the frame is black" (VictorZakharov/last-stand#827). These lines say what the device and its canvas
// are where that happens, and an empty canvas is a problem of the command.
import { render } from '../../../src/core/renderer';
import { deviceSaid, faultsSoFar } from '../../../src/engine/said';

/** the size the canvas is read back at */
const READ = [32, 18] as const;

/** A canvas's frame as the page reads it: the brightest of its colours, the least and the most of its alpha (of
 *  255), and the share of its pixels with any colour. */
interface CanvasRead { brightest: number; alphaLeast: number; alphaMost: number; drawn: number }

/** The engine's canvas drawn anew and read back small in the same task (its picture is gone after it). */
function readNow(canvas: HTMLCanvasElement): CanvasRead | null {
  const small = Object.assign(document.createElement('canvas'), { width: READ[0], height: READ[1] });
  const context = small.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  render();
  context.drawImage(canvas, 0, 0, READ[0], READ[1]);
  const pixels = context.getImageData(0, 0, READ[0], READ[1]).data;
  const read: CanvasRead = { brightest: 0, alphaLeast: 255, alphaMost: 0, drawn: 0 };
  for (let at = 0; at < pixels.length; at += 4) {
    const most = Math.max(pixels[at], pixels[at + 1], pixels[at + 2]);
    read.brightest = Math.max(read.brightest, most);
    read.alphaLeast = Math.min(read.alphaLeast, pixels[at + 3]);
    read.alphaMost = Math.max(read.alphaMost, pixels[at + 3]);
    if (most > 0) read.drawn++;
  }
  read.drawn /= pixels.length / 4;
  return read;
}

/** The page's WebGPU, as much of it as a plain canvas needs. */
interface Gpu {
  getPreferredCanvasFormat(): string;
  requestAdapter(options: object): Promise<{
    info?: { vendor?: string; architecture?: string };
    requestDevice(): Promise<GpuDevice>;
  } | null>;
}
interface GpuDevice {
  createCommandEncoder(): {
    beginRenderPass(pass: object): { end(): void };
    finish(): object;
  };
  queue: { submit(buffers: object[]): void };
  destroy(): void;
}
interface GpuContext { configure(config: object): void; getCurrentTexture(): { createView(): object } }

/** A canvas of the page's own cleared to orange by a device of the adapter asked for, read back as the engine's
 *  is: whether any WebGPU canvas reaches the page here, and by which adapter. */
async function plainCanvas(gpu: Gpu, powerPreference: string | undefined): Promise<string> {
  const asked = powerPreference ?? 'no preference';
  const adapter = await gpu.requestAdapter(powerPreference ? { powerPreference } : {});
  if (!adapter) return `${asked}: no adapter`;
  const device = await adapter.requestDevice();
  const canvas = Object.assign(document.createElement('canvas'), { width: READ[0], height: READ[1] });
  const context = canvas.getContext('webgpu') as unknown as GpuContext;
  context.configure({ device, format: gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();
  const clearValue = { r: 1, g: 0.5, b: 0, a: 1 };
  encoder.beginRenderPass({ colorAttachments: [{ view, clearValue, loadOp: 'clear', storeOp: 'store' }] }).end();
  device.queue.submit([encoder.finish()]);
  const small = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  const flat = small.getContext('2d', { willReadFrequently: true });
  flat?.drawImage(canvas as unknown as CanvasImageSource, 0, 0, 1, 1);
  const pixel = flat?.getImageData(0, 0, 1, 1).data ?? [];
  device.destroy();
  return `${asked} (${adapter.info?.vendor ?? '?'} ${adapter.info?.architecture ?? '?'}): ${Array.from(pixel).join(' ')}`;
}

/** What the browser's own WebGL draws with (its compositor's GPU, as near as a page can ask), and a WebGL canvas
 *  cleared to orange and read back the same way. */
function webglSaid(): string {
  const canvas = Object.assign(document.createElement('canvas'), { width: READ[0], height: READ[1] });
  const gl = canvas.getContext('webgl2');
  if (!gl) return 'no WebGL';
  const named = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(named ? gl.getParameter(named.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  gl.clearColor(1, 0.5, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const small = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  const flat = small.getContext('2d', { willReadFrequently: true });
  flat?.drawImage(canvas, 0, 0, 1, 1);
  const pixel = Array.from(flat?.getImageData(0, 0, 1, 1).data ?? []).join(' ');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return `${pixel} by ${renderer}`;
}

/** `lab rust`'s line of plain WebGPU canvases, one per adapter the page can ask for (orange is 255 128 0 255). */
export async function plainCanvasSaid(): Promise<string[]> {
  const gpu = (navigator as unknown as { gpu?: Gpu }).gpu;
  if (!gpu) return [];
  const read: string[] = [];
  for (const preference of [undefined, 'high-performance', 'low-power']) {
    read.push(await plainCanvas(gpu, preference).catch((error: unknown) => `${preference}: ${String(error)}`));
  }
  return [
    `  a plain WebGPU canvas of the page's own, cleared to orange and read back: ${read.join('; ')}`,
    `  a WebGL canvas the same: ${webglSaid()}`,
  ];
}

/** The browser's own word on the screen and its canvases: the format it prefers, the screen's range and gamut,
 *  its pixel ratio. */
function screenSaid(): string {
  const gpu = (navigator as unknown as { gpu?: { getPreferredCanvasFormat?: () => string } }).gpu;
  const high = matchMedia('(dynamic-range: high)').matches;
  const wide = matchMedia('(color-gamut: p3)').matches;
  return `the browser prefers ${gpu?.getPreferredCanvasFormat?.() ?? 'no format (no WebGPU)'}, the screen `
    + `${high ? 'HDR' : 'SDR'}${wide ? ', wide gamut' : ''}, ${devicePixelRatio} pixels a CSS pixel`;
}

/** What `lab rust` says of the engine's canvas: its lines, and its problems (an empty canvas, the engine's own
 *  faults). */
export function canvasSaid(canvas: HTMLCanvasElement): { lines: string[]; problems: string[] } {
  const read = readNow(canvas);
  const problems = faultsSoFar().map((fault) => `the engine's own fault: ${fault.slice(0, 600)}`);
  const lines = [`  ${deviceSaid() || 'the device: not said'}`, `  ${screenSaid()}`];
  if (!read) return { lines, problems };
  lines.push(`  the engine's canvas as the page reads it: its brightest colour ${read.brightest} of 255, its alpha `
    + `${read.alphaLeast} to ${read.alphaMost}, ${(read.drawn * 100).toFixed(0)}% of its pixels with any colour`);
  if (read.brightest === 0) {
    problems.push(`the engine's canvas is empty as the page reads it (its alpha ${read.alphaLeast} to ${read.alphaMost}): `
      + 'nothing of the frame reaches the screen');
  }
  return { lines, problems };
}
