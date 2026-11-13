// Derives the engraved steel's maps off the main thread while the game loads (core/engraving.ts `preloadEngraving`):
// the page sends the atlas's heights and the steel's albedo, and gets the three maps' pixels back.
import { deriveMaps, steelTint, type BasePixels } from './engravingMaps';

/** What the page sends: the atlas's heights (RGBA), its size, and the steel's albedo. */
interface Asked { heights: Uint8ClampedArray; size: number; base: BasePixels | null }

self.onmessage = (e: MessageEvent<Asked>) => {
  const { heights, size, base } = e.data;
  const maps = deriveMaps(heights, size, size, base, steelTint);
  self.postMessage(maps, { transfer: [maps.albedo.buffer, maps.normal.buffer, maps.roughness.buffer] });
};
