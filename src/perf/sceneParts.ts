// The parts of a frame's work that can be taken out and put back without a shader changing (the profiler's,
// `profiler.ts`, timed on the player's own device, and the lab's `scenecost`): the point lights and their lighting
// where they reach, their shadows, the sun's shadow, the environment, the lit shading against a plain colour, what's
// cut out (leaves, grass: alpha tested) and what's blended, the particles, the fires' flames, the hero, and the scene drawn at
// half its pixels. Each is found in the scene as it stands, so the parts are those of the place the player stands in.
// The lab's `scenecost` (tools/lab/page/sceneCost.ts) keeps its own copy of the scene pass's: an A/B copies the lab's
// page modules into the other commit's tree, where this module isn't on a commit older than it.
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY } from '../data/quality';
import { qualityBudget, qualityLevel } from '../core/quality';
import { scenePixels, setRenderQuality } from '../core/renderer';

/** A part of a frame's work, put in (`on`) or taken out; `change` may resize a target, settled by frames drawn. */
export interface ScenePart {
  name: string;
  change: (on: boolean) => void;
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

/** A part that lets `lights` cast their shadows or not. */
function castingPart(name: string, lights: THREE.Light[]): ScenePart {
  return {
    name: `${name} (${lights.length})`,
    change: (on) => {
      for (const light of lights) light.castShadow = on;
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
function reachingPart(name: string, lights: THREE.PointLight[]): ScenePart {
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

/** Whether a mesh is blended over what's behind it (and not cut out), apart from the fires' flames. */
function blended(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh || cutOut(object) || mesh.userData.fireFlames) return false;
  return materialsOf(mesh).some((material) => material.transparent);
}

/** A part that draws the scene at half its pixels or at all of them (the level's own, and its budget): what the
 *  pixels cost, and what a lower resolution would save. */
function pixelsPart(): ScenePart {
  return {
    name: 'half the scene\'s pixels',
    change: (on) => {
      const preset = QUALITY[qualityLevel()];
      if (on) setRenderQuality(preset, qualityBudget());
      else setRenderQuality(preset, scenePixels() / 2);
    },
  };
}

/** The scene's parts as `scenecost` times them (the scene pass's, on the GPU's timer). */
export function scenePassParts(): ScenePart[] {
  const points = shownWhere((object) => (object as THREE.PointLight).isPointLight) as THREE.PointLight[];
  const sun = shownWhere((object) => (object as THREE.DirectionalLight).isDirectionalLight) as THREE.Light[];
  const plain = new THREE.MeshBasicMaterial({ color: 0x808080 });
  const environment = G.scene.environment;
  return [
    shownPart('the point lights', points),
    reachingPart('the point lights where they reach', points.filter((light) => light.intensity > 0)),
    castingPart('the point lights\' shadows', points.filter((light) => light.castShadow)),
    castingPart('the sun\'s shadow', sun.filter((light) => light.castShadow)),
    {
      name: 'the environment',
      change: (on) => {
        G.scene.environment = on ? environment : null;
      },
    },
    {
      name: 'the lit shading, against a plain colour',
      change: (on) => {
        G.scene.overrideMaterial = on ? null : plain;
      },
    },
    shownPart('what\'s see-through or cut out', shownWhere(seeThrough)),
    shownPart('the particles', shownWhere((object) => (object as THREE.Points).isPoints)),
    shownPart('the hero', [G.player.obj]),
  ];
}

/** The parts the profiler times in the whole frame: the scene pass's, with what's cut out apart from what's blended,
 *  the fires' flames, and the pixels. */
export function frameParts(): ScenePart[] {
  const passParts = scenePassParts().filter((part) => !part.name.startsWith('what\'s see-through'));
  return [
    pixelsPart(),
    ...passParts,
    shownPart('what\'s cut out: leaves, grass', shownWhere(cutOut)),
    shownPart('what\'s blended: smoke, glows, effects', shownWhere(blended)),
    shownPart('the fires\' flames', shownWhere((object) => Boolean(object.userData.fireFlames))),
  ];
}
