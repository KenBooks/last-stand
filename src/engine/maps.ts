// The game's maps handed to the engine: a picture of the page's copied on the GPU, bytes for what can't be (a data
// texture, a frame written down as a tape), and a base map joined to its alpha map on the page.
import * as THREE from 'three';
import type { Core } from './core';

interface TextureEntry { id: number; version: number }

export class Maps {
  private textures = new WeakMap<THREE.Texture, TextureEntry>();
  private cutOuts = new Map<string, number>();
  private canvas2d: CanvasRenderingContext2D | null = null;

  constructor(private core: Core) {}

  /** What's kept of the maps handed over forgotten: the next frame hands each over again. */
  forget(): void {
    this.textures = new WeakMap();
    this.cutOuts = new Map();
  }

  /** A map's RGBA bytes, row 0 where v is 0, no larger than `MAX_MAP` a side. */
  private pixelsOf(texture: THREE.Texture): { width: number; height: number; data: Uint8Array } | null {
    const image = texture.image as {
      data?: ArrayBufferView | null; width?: number; height?: number;
    } & CanvasImageSource | null;
    if (!image) return null;
    if ((texture as THREE.DataTexture).isDataTexture) {
      const { data, width = 0, height = 0 } = image;
      if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
      if (texture.format !== THREE.RGBAFormat || data.length !== width * height * 4) return null;
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.length);
      return { width, height, data: bytes };
    }
    if ((texture as THREE.CompressedTexture).isCompressedTexture || (texture as THREE.CubeTexture).isCubeTexture) return null;
    const sized = image as { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number };
    const fullWidth = sized.naturalWidth || sized.videoWidth || image.width || 0;
    const fullHeight = sized.naturalHeight || sized.videoHeight || image.height || 0;
    if (!fullWidth || !fullHeight) return null;
    const scale = Math.min(1, this.core.mostMap / Math.max(fullWidth, fullHeight));
    const width = Math.max(1, Math.round(fullWidth * scale)), height = Math.max(1, Math.round(fullHeight * scale));
    this.canvas2d ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const context = this.canvas2d;
    if (!context) return null;
    context.canvas.width = width;
    context.canvas.height = height;
    context.save();
    // (three's `flipY` puts the picture's foot at v 0)
    if (texture.flipY) { context.translate(0, height); context.scale(1, -1); }
    try {
      context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    } catch {
      context.restore();
      return null;
    }
    context.restore();
    const { data } = context.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8Array(data.buffer) };
  }

  /** A map's id in the engine, handed over the first time it's met and again when its version moves on; 0: none. */
  textureId(texture: THREE.Texture | null | undefined): number {
    if (!texture) return 0;
    const core = this.core, entry = this.textures.get(texture);
    if (entry && entry.version === texture.version) return entry.id;
    if (entry?.id) { core.engine.drop_texture(entry.id); core.held.textures--; }
    const srgb = texture.colorSpace === THREE.SRGBColorSpace;
    // (a picture of the page's is copied on the GPU, the engine making its smaller levels there: read back to bytes
    // through a canvas, a house's maps were 9 s of the page's time as it was first walked into, 20 s in play. A
    // frame written down as a tape needs the bytes)
    const copied = !core.tape && pictured(texture);
    let id = copied ? core.engine.add_texture_from(texture.image as object, srgb, texture.flipY) : 0;
    if (!id) {
      const pixels = this.pixelsOf(texture);
      id = pixels ? core.engine.add_texture(pixels.width, pixels.height, pixels.data, srgb) : 0;
      if (!pixels) core.skip('texture not readable');
    }
    if (id) { core.held.textures++; core.stats.newTextures++; }
    this.textures.set(texture, { id, version: texture.version });
    core.freshViews();
    return id;
  }

  /** A base map with an alpha map's green as its alpha (three reads the two apart; the engine has one base map). */
  cutOutId(map: THREE.Texture | null, alpha: THREE.Texture): number {
    const core = this.core;
    const key = `${map?.id ?? 0}:${map?.version ?? 0}:${alpha.id}:${alpha.version}`;
    const kept = this.cutOuts.get(key);
    if (kept !== undefined) return kept;
    const cut = this.pixelsOf(alpha);
    if (!cut) { core.skip('alpha map not readable'); return this.textureId(map); }
    const data = new Uint8Array(cut.data.length).fill(255);
    const base = map ? this.pixelsOf(map) : null;
    if (base && base.width === cut.width && base.height === cut.height) data.set(base.data);
    for (let i = 0; i < data.length; i += 4) data[i + 3] = cut.data[i + 1];
    const id = core.engine.add_texture(cut.width, cut.height, data, map?.colorSpace === THREE.SRGBColorSpace);
    this.cutOuts.set(key, id);
    core.held.textures++;
    core.freshViews();
    return id;
  }
}

/** Whether a map's image is a picture the GPU copies by itself: a canvas, a bitmap, an image (not bytes, nor a
 *  compressed or a cube map). */
function pictured(texture: THREE.Texture): boolean {
  const image = texture.image as unknown;
  if ((texture as THREE.DataTexture).isDataTexture || (texture as THREE.CompressedTexture).isCompressedTexture) return false;
  if ((texture as THREE.CubeTexture).isCubeTexture) return false;
  if (image instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas)) {
    // (a canvas nothing has drawn on yet has no context, and the GPU's copy of one is an error the engine's wgpu
    // doesn't survive: every call after it threw, the game stopped. Asking for its context gives it one; null is a
    // canvas with a context of another kind, which copies too)
    if (!image.width || !image.height) return false;
    (image as HTMLCanvasElement).getContext('2d');
    return true;
  }
  if (image instanceof ImageBitmap) return image.width > 0 && image.height > 0;
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
}
