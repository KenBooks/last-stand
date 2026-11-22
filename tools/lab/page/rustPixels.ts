// What `lab rustcheck`'s checks share: a check's outcome, and the page's pixels as the browser pictures them (the
// engine's frame is on a canvas of its own, which no read of three's drawing buffer sees).
import type { Clip, Lab } from './lab';

/** A check's outcome: a line for the report, and what it found wrong. */
export interface Checked {
  line: string;
  problems: string[];
}

export const passed = (line: string): Checked => ({ line: `  ok: ${line}`, problems: [] });
export const failed = (line: string): Checked => ({ line: `  WRONG: ${line}`, problems: [line] });

/** how much a pixel's three channels must differ in all to count as changed (of 255 each) */
const CHANGED = 24;

/** The page's pixels within `clip` (the whole page with none), as the browser pictures them. */
export async function pixelsIn(lab: Lab, clip: Clip | undefined, label: string): Promise<Uint8ClampedArray> {
  return (await pictureIn(lab, clip, label)).data;
}

/** The page's picture within `clip` (the whole page with none), as the browser pictures it. */
export async function pictureIn(lab: Lab, clip: Clip | undefined, label: string): Promise<ImageData> {
  const picture = await lab.screen(label, [], clip);
  const image = new Image();
  image.src = picture.tiles[0].png;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

/** The share of two pictures' pixels that differ by more than a frame's grain. */
export function changedShare(one: Uint8ClampedArray, other: Uint8ClampedArray): number {
  let changed = 0;
  for (let at = 0; at < one.length; at += 4) {
    const differs = Math.abs(one[at] - other[at]) + Math.abs(one[at + 1] - other[at + 1])
      + Math.abs(one[at + 2] - other[at + 2]);
    if (differs > CHANGED) changed++;
  }
  return changed / (one.length / 4);
}

/** a block's side (pixels), and how much its mean light must differ to count as changed (of 255) */
const BLOCK = 24;
const BLOCK_CHANGED = 6;

/** Each block's mean light, row by row: grass in the wind and the frame's grain average out of it. */
function blockLight(picture: ImageData): number[] {
  const { data, width, height } = picture;
  const means: number[] = [];
  for (let top = 0; top + BLOCK <= height; top += BLOCK) {
    for (let left = 0; left + BLOCK <= width; left += BLOCK) {
      let sum = 0;
      for (let y = top; y < top + BLOCK; y++) {
        for (let x = left; x < left + BLOCK; x++) {
          const at = (y * width + x) * 4;
          sum += data[at] * 0.2126 + data[at + 1] * 0.7152 + data[at + 2] * 0.0722;
        }
      }
      means.push(sum / (BLOCK * BLOCK));
    }
  }
  return means;
}

/** The share of two pictures' blocks whose mean light differs: what a shadow or a fog changes, not a blade's sway. */
export function blocksChanged(one: ImageData, other: ImageData): number {
  const before = blockLight(one);
  const after = blockLight(other);
  const changed = before.filter((light, at) => Math.abs(light - after[at]) > BLOCK_CHANGED).length;
  return changed / Math.max(1, before.length);
}
