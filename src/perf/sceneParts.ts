// The parts of a frame's work the profiler (`profiler.ts`, timed on the player's own device) takes out and puts back,
// each without a program changing: the engine's own parts (its lights, shadows and shading, each a number its frame
// reads), what's cut out (leaves, grass: alpha tested) and what's blended, the particles, the
// fires' flames, the hero, and the scene drawn at half its pixels. Each is found in the scene as it stands, so the
// parts are those of the place the player stands in. The lab's `scenecost` (tools/lab/page/sceneCost.ts) keeps its own
// parts, some changing programs (a light hidden, a shadow or the environment taken off), compiled before it times: an
// A/B copies the lab's page modules into the other commit's tree, where this module isn't on a commit older than it.
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY } from '../data/quality';
import { qualityBudget, qualityLevel } from '../core/quality';
import { scenePixels, setRenderQuality } from '../core/renderer';
import { RUST } from '../engine';

/** A part of a frame's work, put in (`on`) or taken out; `change` may resize a target, settled by frames drawn. */
export interface ScenePart {
  name: string;
  change: (on: boolean) => void;
  /** puts the part back as the game had it before the profile, where that isn't `change(true)`: a part timed as
   *  the old way against the new has the old way as its "with" */
  restore?: () => void;
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

/** the engine's tuned numbers a profile switches */
type EngineSwitch = 'points' | 'ownPoints' | 'nearLamps' | 'lampShadows' | 'bloom' | 'shadows' | 'see' | 'debug' | 'nearFirst' | 'shine' | 'solidSee' | 'shadowTurns' | 'lowRes'
  | 'depthFirst' | 'scene' | 'fieldsFirst' | 'fieldsPlaced' | 'grassShaded' | 'sightFog' | 'overCleared'
  | 'plainShader';

/** A part of the Rust engine's frame, switched by one of its tuned numbers (`TUNE` in engine/globals.ts), and put
 *  back to the number it found: a part whose "with" is the old way (`fieldsPlaced`, `overCleared`) left the game
 *  on it after a profile, and every part timed after it too. */
function tunedPart(name: string, key: EngineSwitch, off: number,
  on = RUST.tune[key]): ScenePart {
  const found = RUST.tune[key];
  return {
    name,
    change: (put) => { RUST.tune[key] = put ? on : off; },
    restore: () => { RUST.tune[key] = found; },
  };
}

/**
 * The Rust engine's own parts (src/engine): three's lights, shadow maps and materials are none of its frame, and
 * switched as three's they changed nothing, every part read 0.0 ms (a phone's profile, report H37Q-PEYK). Each is
 * a number the engine's frame reads, no pipeline made anew.
 */
function engineParts(): ScenePart[] {
  return [
    tunedPart('the point lights and the lamps', 'points', 0),
    tunedPart('the point lights: a brazier, a fire, a portal (the scene\'s own)', 'ownPoints', 0),
    tunedPart('the point lights: the baked lamps\' light near them', 'nearLamps', 0),
    tunedPart('the lamps\' shadows read', 'lampShadows', 0),
    tunedPart('the sun\'s shadow: its map drawn and read', 'shadows', 0),
    tunedPart('the lit shading, against a plain colour', 'debug', 3, 0),
    tunedPart('what hides the hero seen through', 'see', 0),
    tunedPart('the fog over what the hero cannot see', 'sightFog', 0),
    tunedPart('the grass: its blades shaded (without: placed, none shaded)', 'grassShaded', 0),
    tunedPart('the labels\' and the outline\'s canvas cleared by a pass of its own, as it was (without: by their first '
      + 'draw)', 'overCleared', 1, 0),
    tunedPart('the grass placed at every vertex, as it was (without: each blade placed once, those kept drawn)',
      'fieldsPlaced', 1, 0),
    tunedPart('the grass left out of the depth drawn first (without: in it, shaded once a pixel, placed twice)', 'fieldsFirst', 1, 0),
    tunedPart('every mesh of the scene (without: the frame cleared, graded and shown, with its particles)', 'scene', 0),
    tunedPart('the bloom\'s passes', 'bloom', 0),
    tunedPart('what the camera stands inside drawn last', 'nearFirst', 0),
    tunedPart('the point lights\' shine (their diffuse light kept)', 'shine', 0),
    tunedPart('what\'s see-through drawn solid while nothing thins it', 'solidSee', 0),
    tunedPart('the sun\'s shadow kept on the frames between its turns', 'shadowTurns', 0),
    tunedPart('the flames at a quarter of the scene\'s pixels', 'lowRes', 0),
    tunedPart('the scene\'s depth drawn first, what\'s opaque shaded once a pixel', 'depthFirst', 0),
    tunedPart('the normal, roughness and glow maps read', 'debug', 4, 0),
    // (at Low and Very low alone, where the two shaders draw one frame: what the whole shader's untaken
    // branches cost a pixel. An Adreno 810's lit shading was 11.9 ms of its 38.5 ms frame at Very low, 4YT2-QTZW)
    tunedPart('the lit shader whole (without: the one made for the plain levels alone, as they draw)',
      'plainShader', 1, 0),
    // (the lit shading's own parts, each a look of the engine that leaves one out: Bulwark, lit.wgsl `look`. The
    // S25's lit shading was 7.1 ms of a 13.8 ms frame at Low in the square, 3.4 of it the lights', the sun's shadow
    // and the maps: what the rest is, the device says)
    tunedPart('the lit shading: the baked light of the still lamps', 'debug', 5, 0),
    tunedPart('the lit shading: the sun, its light and the reads of its shadow', 'debug', 6, 0),
    tunedPart('the lit shading: the lamps taken by the shadows of what moves', 'debug', 7, 0),
    tunedPart('the lit shading: the fog', 'debug', 8, 0),
  ];
}

/**
 * The parts the profiler times in the whole frame, each changed with the scene's programs kept (a uniform, what's
 * shown, the shadow maps' drawing, the pixels): a part that changed a program's key (a light hidden, a shadow taken
 * off, the environment) compiled every program in view again, the whole profile's time. The plain colour's few
 * programs are compiled once, by its first frame.
 */
export function frameParts(): ScenePart[] {
  return [pixelsPart(), ...engineParts(), ...shownParts()];
}

/** What's shown or hidden to time it. */
function shownParts(): ScenePart[] {
  return [
    // (a particle pool: its quads, `fx/particles.ts`)
    shownPart('the particles', shownWhere((object) => (object as THREE.Points).isPoints || object.userData.particles)),
    shownPart('the hero', [G.player.obj]),
    // (the ground's blades and the trees, a million triangles and more of the village's frame at High)
    shownPart('the meadow\'s grass', shownWhere((object) => object.name === 'meadow')),
    shownPart('the trees: bark and leaves', shownWhere((object) => /trees' (bark|leaves)/.test(object.name))),
    shownPart('what\'s cut out: leaves, grass', shownWhere(cutOut)),
    shownPart('what\'s blended: smoke, glows, effects', shownWhere(blended)),
    shownPart('the fires\' flames', shownWhere((object) => Boolean(object.userData.fireFlames))),
    // (the arrows left standing where they came down, fx/stuckArrows.ts: two instanced meshes, up to a thousand; with
    // none down they stand drawing nothing, and the part holds none of them)
    shownPart('the spent arrows', shownWhere((object) => Boolean(object.userData.spentArrows)
      && (object as THREE.InstancedMesh).count > 0)),
  ];
}
