// The engraved maps' pixels from a height field (core/engraving.ts): its albedo, normal and roughness, with no canvas
// in it, so a worker makes the steel's as the game loads (`engraving.worker.ts`: 1.35 s of a CPU slowed six times,
// the loading screen frozen).
import { clamp } from '../util';

/** A pixel's albedo (r, g, b) and roughness from its height `h` (0..1), its depth in a groove (0..1) and the base
 *  albedo under it (`i`, 0..1). */
export type Tint = (h: number, groove: number, i: number) => [number, number, number, number];

/** An albedo's pixels to lay the ornament over, `width` square, tiled. */
export interface BasePixels { data: Uint8ClampedArray; width: number }

/** The three maps' RGBA pixels. */
export interface DerivedPixels { albedo: Uint8ClampedArray; normal: Uint8ClampedArray; roughness: Uint8ClampedArray }

/** The worn steel's grime in the grooves and polish on the raised bands, over the steel's own albedo. */
export const steelTint: Tint = (hv, g, b) => {
  const k = clamp(b * (1 - g * 0.75) + Math.max(0, hv - 0.5) * 0.35, 0, 1);
  return [k, k, k, clamp(0.34 + g * 0.5 - Math.max(0, hv - 0.5) * 0.3 + (1 - b) * 0.3, 0.1, 1)];
};

/** The maps from a height field's RGBA pixels (its red the height), `w`×`h`, `base` under the ornament. */
export function deriveMaps(src: Uint8ClampedArray, w: number, h: number, base: BasePixels | null, tint: Tint):
  DerivedPixels {
  // a light blur, so the grooves have sloped walls (the normal needs a gradient to catch light)
  const H = new Float32Array(w * h), B = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = src[i * 4] / 255;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) s += H[y * w + clamp(x + d, 0, w - 1)];
      B[y * w + x] = s / 3;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) s += B[clamp(y + d, 0, h - 1) * w + x];
      H[y * w + x] = s / 3;
    }
  }
  const bd = base?.data ?? null, bs = base?.width ?? 1;
  const albedo = new Uint8ClampedArray(w * h * 4), normal = new Uint8ClampedArray(w * h * 4);
  const roughness = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, hv = H[i];
    const dx = (H[y * w + clamp(x + 1, 0, w - 1)] - H[y * w + clamp(x - 1, 0, w - 1)]) * 3;
    const dy = (H[clamp(y + 1, 0, h - 1) * w + x] - H[clamp(y - 1, 0, h - 1) * w + x]) * 3;
    const l = Math.hypot(dx, dy, 1);
    normal[i * 4] = (-dx / l * 0.5 + 0.5) * 255;
    normal[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255;
    normal[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
    normal[i * 4 + 3] = 255;
    const b = bd ? bd[((y % bs) * bs + (x % bs)) * 4] / 255 : 1;
    const [r, g, bb, ro] = tint(hv, clamp((0.5 - hv) * 2, 0, 1), b);
    albedo[i * 4] = r * 255;
    albedo[i * 4 + 1] = g * 255;
    albedo[i * 4 + 2] = bb * 255;
    albedo[i * 4 + 3] = 255;
    roughness[i * 4] = roughness[i * 4 + 1] = roughness[i * 4 + 2] = ro * 255;
    roughness[i * 4 + 3] = 255;
  }
  return { albedo, normal, roughness };
}
