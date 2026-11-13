// The heroes' shadows from the lamps' casting lights. A lamp's shadow is drawn once, of what stands still round it
// (`lampShadow` in `props.ts`): drawn every frame of all round it, two lamps' twelve faces were 6 ms of a frame's GPU.
// Drawn once with the heroes hidden, a hero by a lamp cast no shadow from it ("no shadows from lights"). So each lamp
// light's still map is kept as it's drawn, a copy of its depth cube, and each frame it's copied back and the heroes
// alone drawn into it over what stands still: their dozen draws a face, not the village's.
import { RUNNING } from '../core/rendererChoice';
import * as THREE from 'three';
import { afterShadows, type ShadowDraw } from './culling';
import { lampShadowLights } from './props';
import { HERO_SHADOW_LAYER, WORLD_LAYER } from '../core/layers';
import { G } from '../state';

/** each lamp light's still shadow as it was last drawn, by the light */
const kept = new Map<THREE.PointLight, THREE.WebGLCubeRenderTarget>();
/** the lamp lights whose maps have heroes drawn over their still shadows */
const overStill = new Set<THREE.PointLight>();
/** what the heroes' draw is drawn as: the heroes' layer alone (`moonShadow.ts` draws by it too) */
export const moversSeen = new THREE.PerspectiveCamera();
moversSeen.layers.set(HERO_SHADOW_LAYER);

/** A cube target to keep `map`'s depth in, of its size, set up on the GPU. */
function keeperOf(renderer: THREE.WebGLRenderer, map: THREE.WebGLRenderTarget): THREE.WebGLCubeRenderTarget {
  const size = map.width;
  const keeper = new THREE.WebGLCubeRenderTarget(size);
  // (as three makes a point light's map: `WebGLShadowMap`, whose types hold a plain depth texture)
  const depth = new THREE.CubeDepthTexture(size, THREE.UnsignedIntType);
  depth.format = THREE.DepthFormat;
  keeper.depthTexture = depth as unknown as THREE.DepthTexture;
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const level = renderer.getActiveMipmapLevel();
  renderer.setRenderTarget(keeper, 0);
  renderer.setRenderTarget(target, face, level);
  return keeper;
}

/** The six faces' framebuffers of a cube target three has set up. */
function facesOf(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): WebGLFramebuffer[] {
  return (renderer.properties.get(target) as { __webglFramebuffer: WebGLFramebuffer[] }).__webglFramebuffer;
}

/** `from`'s depth copied into `to`, face by face (both cubes of one size and depth format). */
function copyDepth(renderer: THREE.WebGLRenderer, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const state = renderer.state;
  const fromFaces = facesOf(renderer, from);
  const toFaces = facesOf(renderer, to);
  const size = from.width;
  // (a blit is clipped by the scissor test)
  state.setScissorTest(false);
  for (let face = 0; face < 6; face++) {
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, fromFaces[face]);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, toFaces[face]);
    gl.blitFramebuffer(0, 0, size, size, 0, 0, size, size, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  }
  state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  // (the target the frame draws into bound again: left on `to`, with no draw after it, the frame drew into the map)
  renderer.setRenderTarget(renderer.getRenderTarget(), renderer.getActiveCubeFace(), renderer.getActiveMipmapLevel());
}

/** Each lamp light's map, drawn still, kept. */
function keepStill(renderer: THREE.WebGLRenderer): void {
  for (const light of lampShadowLights()) {
    const map = light.shadow.map as THREE.WebGLCubeRenderTarget | null;
    if (!map) continue;
    let keeper = kept.get(light);
    if (!keeper || keeper.width !== map.width) {
      keeper?.dispose();
      keeper = keeperOf(renderer, map);
      kept.set(light, keeper);
    }
    copyDepth(renderer, map, keeper);
  }
}

/** a sphere round a standing hero and what he holds: how high its middle is over his feet, and its radius (m) */
const HERO_ROUND = { up: 1, radius: 1.5 };

/** A skinned part unculled (its bounds the bind pose's) held to a hero's sphere for the lamps' draw, put back after. */
export interface Bounded { part: THREE.SkinnedMesh; sphere: THREE.Sphere | null }

const _round = new THREE.Sphere();
const _toPart = new THREE.Matrix4();

/** Every hero's part the world's layer shows put on the heroes' layer too (gear comes and goes), and no other; each
 *  skinned part three never culls culled by a sphere round its hero, into `bounded`: unculled, each was drawn into all
 *  six faces of each lamp's cube, 1.4 ms of the GPU a frame. */
export function heroesOnTheirLayer(bounded: Bounded[]): void {
  for (const player of G.players) {
    _round.center.copy(player.obj.position).y += HERO_ROUND.up;
    _round.radius = HERO_ROUND.radius;
    player.obj.traverse((part) => {
      if (!part.layers.isEnabled(WORLD_LAYER)) {
        part.layers.disable(HERO_SHADOW_LAYER);
        return;
      }
      part.layers.enable(HERO_SHADOW_LAYER);
      const skinned = part as THREE.SkinnedMesh;
      if (!skinned.isSkinnedMesh || skinned.frustumCulled) return;
      bounded.push({ part: skinned, sphere: skinned.boundingSphere });
      skinned.frustumCulled = true;
      skinned.boundingSphere = _round.clone().applyMatrix4(_toPart.copy(skinned.matrixWorld).invert());
    });
  }
}

/** The skinned parts held to their hero's sphere unculled again, their own bounds back. */
export function unbound(bounded: Bounded[]): void {
  for (const { part, sphere } of bounded) {
    part.frustumCulled = false;
    part.boundingSphere = sphere!;
  }
}

/** Whether `light` reaches any hero's sphere: past its reach, he casts nothing from it (and its map, drawn over him
 *  last, is copied back still the next frame he's in it). */
function reachesAHero(light: THREE.PointLight): boolean {
  return G.players.some((player) => {
    const off = Math.hypot(player.obj.position.x - light.position.x, player.obj.position.z - light.position.z);
    return off < light.distance + HERO_ROUND.radius;
  });
}

/** The lamp lights' kept maps copied back and the heroes drawn over them, the shadow map's clear held off. */
function heroesOverStill(renderer: THREE.WebGLRenderer, draw: ShadowDraw, scene: THREE.Scene): void {
  const lights: THREE.PointLight[] = [];
  for (const light of lampShadowLights()) {
    const keeper = kept.get(light);
    const map = light.shadow.map as THREE.WebGLCubeRenderTarget | null;
    if (!keeper || !map || keeper.width !== map.width) continue;
    const reaches = reachesAHero(light);
    // (past its reach, its map is copied back still once, then left)
    if (!reaches && !overStill.has(light)) continue;
    copyDepth(renderer, keeper, map);
    if (!reaches) {
      overStill.delete(light);
      continue;
    }
    overStill.add(light);
    light.shadow.needsUpdate = true;
    lights.push(light);
  }
  if (!lights.length) return;
  const bounded: Bounded[] = [];
  heroesOnTheirLayer(bounded);
  const clear = renderer.clear;
  renderer.clear = () => {};
  renderer.shadowMap.needsUpdate = true;
  try {
    draw(lights, scene, moversSeen);
  } finally {
    renderer.clear = clear;
    unbound(bounded);
  }
}

/** The lamps' shadows kept as drawn still and the heroes drawn over them each frame, as `renderer` draws the game. */
export function castHeroesOverLamps(renderer: THREE.WebGLRenderer): void {
  if (RUNNING.webgpu) return; // (its depth is copied by raw GL)
  afterShadows((draw, scene, camera, still) => {
    if (!lampShadowLights().size) return;
    if (still) {
      keepStill(renderer);
      return;
    }
    // (the frame's own draw alone: not the arms' through the eyes, nor a warm-up's or a picture's)
    if (camera !== G.camera || !renderer.shadowMap.autoUpdate) return;
    heroesOverStill(renderer, draw, scene);
  });
}
