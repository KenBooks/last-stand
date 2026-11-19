// tools/lab pixels: what was just drawn on the game's canvas, read back from its drawing buffer as an opaque picture.
// The game draws its frame with an alpha of 0 (core/hdr.ts adds it to the page as light): copied onto a 2D canvas, a
// frame drawn outside the game's own chain (a studio's, a look's) came out black. On WebGPU the canvas has no
// `readPixels`: it's copied onto a 2D canvas in the same task as the draw, as the lab's pictures are.
import { G } from '../../../src/state';
import { WEBGPU } from '../../../src/core/webgpu';

/** An area of the canvas, css px from its top left. */
export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The pixels of `area` just drawn on the canvas, as an opaque picture at the drawing buffer's own pixels. */
export function readOpaque(area: Area): ImageData {
  if (WEBGPU) {
    const ratio = G.renderer.domElement.width / innerWidth;
    const box = { left: area.left * ratio, top: area.top * ratio, width: area.width * ratio, height: area.height * ratio };
    const image = webGpuPixels(box);
    for (let k = 3; k < image.data.length; k += 4) image.data[k] = 255;
    return image;
  }
  const gl = G.renderer.getContext();
  const ratio = gl.drawingBufferWidth / innerWidth;
  const width = Math.round(area.width * ratio);
  const height = Math.round(area.height * ratio);
  const left = Math.round(area.left * ratio);
  // (the drawing buffer's rows run from its bottom)
  const bottom = gl.drawingBufferHeight - Math.round(area.top * ratio) - height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(left, bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return opaqueRows(pixels, width, height);
}

/** `box` of the WebGPU canvas as last drawn (its own pixels from its top left, rounded), rows from the top. */
export function webGpuPixels(box: Area): ImageData {
  const left = Math.round(box.left);
  const top = Math.round(box.top);
  const width = Math.round(box.width);
  const height = Math.round(box.height);
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(G.renderer.domElement, left, top, width, height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/** A drawing buffer's pixels (rows from the bottom) as an opaque picture, rows from the top. */
export function opaqueRows(pixels: Uint8Array, width: number, height: number): ImageData {
  const image = new ImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  for (let k = 3; k < image.data.length; k += 4) image.data[k] = 255;
  return image;
}

/** `image` on a canvas of its own. */
export function canvasOf(image: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas;
}
