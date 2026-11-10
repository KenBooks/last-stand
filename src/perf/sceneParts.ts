// The parts of a frame's work the profiler (`profiler.ts`, timed on the player's own device) takes out and puts back,
// each without a program changing: the point lights' lighting where they reach, the shadow maps' drawing, the lit
// shading against a plain colour, what's cut out (leaves, grass: alpha tested) and what's blended, the particles, the
// fires' flames, the hero, and the scene drawn at half its pixels. Each is found in the scene as it stands, so the
// parts are those of the place the player stands in. The lab's `scenecost` (tools/lab/page/sceneCost.ts) keeps its own
// parts, some changing programs (a light hidden, a shadow or the environment taken off), compiled before it times: an
// A/B copies the lab's page modules into the other commit's tree, where this module isn't on a commit older than it.
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY } from '../data/quality';
import { qualityBudget, qualityLevel } from '../core/quality';
import { holdSunShadow, scenePixels, setRenderQuality } from '../core/renderer';
import { WEBGPU, drawnFrom } from '../core/webgpu';
import { RUNNING } from '../core/rendererChoice';

/** A part of a frame's work, put in (`on`) or taken out; `change` may resize a target, settled by frames drawn. */
export interface ScenePart {
  name: string;
  change: (on: boolean) => void;
  /** why it can't be timed here, where it can't (the report says so in its place) */
  untimed?: string;
}

/** Every object under the scene that `wanted` picks, shown now. */
export function shownWhere(wanted: (object: THREE.Object3D) => boolean): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  G.scene.traverseVisible((object) => {
    if (wanted(object)) found.push(object);
  });
  return found;
}

/** A part that shows or hides `objects`. */
export function shownPart(name: string, objects: THREE.Object3D[]): ScenePart {
  return {
    name: `${name} (${objects.length})`,
    change: (on) => {
      for (const object of objects) object.visible = on;
    },
  };
}

/** A part that draws the shadow maps of `lights` each frame or keeps them as they are (`shadowMap.autoUpdate`): the
 *  shadow passes' cost, the same programs either way (a light's shadow taken off, `castShadow`, changes every lit
 *  program's, and each part compiled the scene's programs again: 66 s of a 69 s profile in the lab, minutes on a
 *  phone, its page unanswering). Their sampling in the scene pass stays. */
function shadowMapsPart(lights: THREE.Light[]): ScenePart {
  const shadowMap = G.renderer.shadowMap;
  const kept = shadowMap.autoUpdate;
  // (WebGPU draws each light's shadow by its own `autoUpdate`, never the renderer's: each kept as it is, the sun's
  // held, as each frame sets it)
  const shadows = lights.map((light) => (light as THREE.DirectionalLight).shadow);
  const keptEach = shadows.map((shadow) => shadow.autoUpdate);
  return {
    name: `drawing the shadow maps (${lights.length})`,
    change: (on) => {
      shadowMap.autoUpdate = on ? kept : false;
      if (!WEBGPU) return;
      holdSunShadow(!on);
      shadows.forEach((shadow, index) => {
        shadow.autoUpdate = on && keptEach[index];
        if (!on) shadow.needsUpdate = false;
      });
    },
  };
}

/** the reach a point light is given out of reach of everything (m): a pixel's loop then skips its lighting */
const OUT_OF_REACH = 0.001;

/**
 * A part that puts `lights` out of reach of every pixel or gives them back their reach: the same programs either way
 * (hidden, the lights' count and so the programs change), so it's what their lighting costs where they reach, apart
 * from the loop's own cost over them; the most a shorter reach can save.
 */
function reachingPart(name: string, shown: THREE.PointLight[]): ScenePart {
  // (WebGPU draws a biome's lights by a rig copied from them each render: their reach is set on them)
  const lights = shown.map(drawnFrom);
  const reaches = lights.map((light) => light.distance);
  return {
    name: `${name} (${lights.length})`,
    change: (on) => {
      lights.forEach((light, index) => {
        light.distance = on ? reaches[index] : OUT_OF_REACH;
      });
    },
  };
}

/** The materials of a mesh, as a list. */
export function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Whether a mesh draws see-through or cut out (blended, or alpha tested). */
export function seeThrough(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) return false;
  return materialsOf(mesh).some((material) => material.transparent || material.alphaTest > 0);
}

/** Whether a mesh is cut out (alpha tested: a leaf card, a blade of grass), which a phone's GPU draws slowly: a pixel
 *  it may throw away keeps the GPU from skipping what's hidden behind it. */
function cutOut(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  return Boolean(mesh.isMesh) && materialsOf(mesh).some((material) => material.alphaTest > 0);
}

/** Whether a mesh is blended over what's behind it (and not cut out), apart from the fires' flames and the
 *  particles. */
function blended(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh || cutOut(object) || mesh.userData.fireFlames || mesh.userData.particles) return false;
  return materialsOf(mesh).some((material) => material.transparent);
}

/** why the pixels aren't timed on WebGPU's GPU-driven drawing (`pixelsPart`) */
const RESIZE_REBUILDS = 'not timed with meshlets: each resize builds every GPU-driven batch again, 0.4 to 0.7 s';

/** A part that draws the scene at half its pixels or at all of them (the level's own, and its budget): what the
 *  pixels cost, and what a lower resolution would save. */
function pixelsPart(): ScenePart {
  return {
    name: 'half the scene\'s pixels',
    // (`?meshlets=1`: each resize sent every batch through three's node builder again, 420 to 670 ms of the main
    // thread a time here and its frames slower after, 12 times a profile: some 6 s of a phone's held, and both sides
    // read high)
    untimed: RUNNING.meshlets ? RESIZE_REBUILDS : undefined,
    change: (on) => {
      const preset = QUALITY[qualityLevel()];
      if (on) setRenderQuality(preset, qualityBudget());
      else setRenderQuality(preset, scenePixels() / 2);
    },
  };
}

/**
 * The parts the profiler times in the whole frame, each changed with the scene's programs kept (a uniform, what's
 * shown, the shadow maps' drawing, the pixels): a part that changed a program's key (a light hidden, a shadow taken
 * off, the environment) compiled every program in view again, the whole profile's time. The plain colour's few
 * programs are compiled once, by its first frame.
 */
export function frameParts(): ScenePart[] {
  const lights = shownWhere((object) => (object as THREE.Light).isLight) as THREE.Light[];
  const points = lights.filter((light) => (light as THREE.PointLight).isPointLight) as THREE.PointLight[];
  const plain = new THREE.MeshBasicMaterial({ color: 0x808080 });
  return [
    pixelsPart(),
    reachingPart('the point lights where they reach', points.filter((light) => light.intensity > 0)),
    shadowMapsPart(lights.filter((light) => light.castShadow)),
    {
      name: 'the lit shading, against a plain colour',
      change: (on) => {
        G.scene.overrideMaterial = on ? null : plain;
      },
    },
    // (a particle pool: WebGL's points, WebGPU's quads, `fx/particles.ts`)
    shownPart('the particles', shownWhere((object) => (object as THREE.Points).isPoints || object.userData.particles)),
    shownPart('the hero', [G.player.obj]),
    shownPart('what\'s cut out: leaves, grass', shownWhere(cutOut)),
    shownPart('what\'s blended: smoke, glows, effects', shownWhere(blended)),
    shownPart('the fires\' flames', shownWhere((object) => Boolean(object.userData.fireFlames))),
  ];
}
