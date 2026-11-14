// The sun's (the moon's) shadow map in the village, kept. Redrawn every frame it was 3 to 4 ms of a frame's 13 on the
// GPU (`npm run lab -- perf --village --parts --view third`; from play, "inside heroes hall is slow", "night time is
// slow too"), and almost all it holds stands still. So it's drawn once of what stands in the village (with its still
// shadows: `drawStillShadows`), a copy kept, and each frame the copy goes back and what moves (the heroes, the foes) is
// drawn over it, as the lamps' are (`lampShadows.ts`). A fight's foes are most of a biome's map, which redraws as ever.
import { RUNNING } from '../core/rendererChoice';
import * as THREE from 'three';
import { afterShadows } from './culling';
import { heroesOnTheirLayer, moversSeen, unbound, type Bounded } from './lampShadows';
import { G } from '../state';

/** the map as drawn still */
let kept: THREE.WebGLRenderTarget | null = null;
/** whether the map is kept and only what moves is drawn each frame */
let holding = false;
/** a lab's switch: the map redrawn every frame as it was */
let wanted = true;
/** the light whose map this is */
let sun: THREE.DirectionalLight | null = null;

/** A target to keep `map`'s depth in: its size and depth format, its colour (never read) as small as it goes. */
function keeperOf(renderer: THREE.WebGLRenderer, map: THREE.WebGLRenderTarget): THREE.WebGLRenderTarget {
  const keeper = new THREE.WebGLRenderTarget(map.width, map.height, { format: THREE.RedFormat, depthBuffer: true });
  const depth = new THREE.DepthTexture(map.width, map.height, map.depthTexture!.type);
  depth.format = map.depthTexture!.format;
  keeper.depthTexture = depth;
  const target = renderer.getRenderTarget();
  renderer.setRenderTarget(keeper);
  renderer.setRenderTarget(target);
  return keeper;
}

/** `from`'s depth copied into `to`, both of one size and depth format. */
function copyDepth(renderer: THREE.WebGLRenderer, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const frameOf = (target: THREE.WebGLRenderTarget): WebGLFramebuffer =>
    (renderer.properties.get(target) as { __webglFramebuffer: WebGLFramebuffer }).__webglFramebuffer;
  renderer.state.setScissorTest(false);
  renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, frameOf(from));
  renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, frameOf(to));
  gl.blitFramebuffer(0, 0, from.width, from.height, 0, 0, to.width, to.height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  // (the target the frame draws into bound again: left on `to`, the frame drew into the shadow map)
  renderer.setRenderTarget(renderer.getRenderTarget(), renderer.getActiveCubeFace(), renderer.getActiveMipmapLevel());
}

/**
 * The sun's map kept in the village (`on`) and drawn again whole everywhere else; returns whether its map must be drawn
 * still now, having had none to keep.
 */
export function holdMoonShadow(moon: THREE.DirectionalLight, on: boolean): boolean {
  sun = moon;
  // (on WebGPU nothing keeps the map, its depth copied by raw GL, so it's drawn whole as it is in a biome)
  const hold = on && wanted && !RUNNING.webgpu;
  const begun = hold && !holding;
  holding = hold;
  moon.shadow.autoUpdate = !hold;
  return begun || (hold && (!kept || kept.width !== moon.shadow.mapSize.x));
}

/** Whether the sun's map is kept now, only what moves drawn over it each frame: no frame draws it whole. */
export const moonShadowKept = (): boolean => holding && wanted;

/** A lab's switch: false redraws the map every frame as it was, from the next draw (none need run between: the frame
 *  is compared with itself, at one moment). */
export function keepMoonShadow(on: boolean): void {
  wanted = on;
  if (sun && holding) sun.shadow.autoUpdate = !on;
}

/** The sun's map kept as it's drawn still, and what moves drawn over it each frame, as `renderer` draws the game. */
export function castMoversOverMoon(renderer: THREE.WebGLRenderer, moon: THREE.DirectionalLight): void {
  if (RUNNING.webgpu) return;
  afterShadows((draw, scene, camera, still) => {
    const map = moon.shadow.map;
    if (!holding || !map) return;
    if (still) {
      if (!kept || kept.width !== map.width) {
        kept?.dispose();
        kept = keeperOf(renderer, map as THREE.WebGLRenderTarget);
      }
      copyDepth(renderer, map as THREE.WebGLRenderTarget, kept);
      return;
    }
    // (the frame's own draw alone: not the arms' through the eyes, nor a warm-up's or a picture's)
    if (!wanted || camera !== G.camera || !renderer.shadowMap.autoUpdate || !kept || kept.width !== map.width) return;
    copyDepth(renderer, kept, map as THREE.WebGLRenderTarget);
    const bounded: Bounded[] = [];
    heroesOnTheirLayer(bounded);
    const clear = renderer.clear;
    renderer.clear = () => {};
    moon.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    try {
      draw([moon], scene, moversSeen);
    } finally {
      renderer.clear = clear;
      unbound(bounded);
    }
  });
}
