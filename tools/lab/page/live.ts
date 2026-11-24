// tools/lab live: the page's side of a live session (`lab live`, node/live.mjs). One page set up once and kept, each
// step on the state the last one left: the hero pictured from any view in any look, with a reference laid over the
// picture and a part of it kept, the scene's objects listed with where each is (in the world and on the screen),
// and frames run. A pose is tried here by hand (a joint turned in an `eval`, a picture after it) in a second, where a
// command boots and sets up for each look; what's found is measured by a command, on a page of its own.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import type { Joints } from '../../../src/entities/models/rig';
import type { Lab, Fixture, Tile, ViewName } from './lab';
import { describeParts, jointsByObject, lensOf, meshesOf, readyLook, type Look } from './looks';
import { describeFramed, framed } from './inFrame';

/** `lab live picture`'s options. */
export interface LivePicture {
  /** the views (through the eyes the eyes' own, else over the shoulder, by default); `screen` the whole page as the
   *  player sees it, the game's frame with its UI over it (the HUD, the touch controls, a menu) */
  views?: (ViewName | typeof SCREEN)[];
  look?: Look;
  focus?: keyof Joints;
  /** a place in the world the close-ups are framed on instead of the hero (a prop), [x, y, z] in metres */
  on?: number[];
  /** a close-up's distance from what it's framed on (m: the lab's own by default) */
  distance?: number;
  /** a reference laid over each picture, stretched to it (a picture's data URL), and how strongly (0-1) */
  over?: string;
  strength?: number;
  /** the part of each picture kept: its left, top, right and bottom, as shares of it */
  crop?: number[];
  /** the hero hidden and pictured in the `parts` look too: no part of him may be found */
  canary?: boolean;
}

/** `lab live inspect`'s options: the object listed with what's under it (the hero by default), how deep. */
export interface LiveInspect {
  name?: string;
  depth: number;
}

/** the view that pictures the page as it shows, its UI with it (`lab.screen`) */
const SCREEN = 'screen';
/** how strongly a reference is laid over a picture unless asked */
const OVER_STRENGTH = 0.5;
/** how many parts a picture's notes name, and how many children of one object an inspection lists */
const PARTS_LISTED = 20;
const CHILDREN_LISTED = 24;

/** `lab live start`: the run set up as `fixture` says. */
export async function start(lab: Lab, fixture: Fixture): Promise<Record<string, unknown>> {
  return lab.setup(fixture);
}

/** `lab live frames`: `count` frames run with no input. */
export async function frames(lab: Lab, count: number): Promise<string> {
  await lab.step(count);
  return `ran ${count} frames: the game's clock at ${G.time.toFixed(3)} s`;
}

/** What `lab live picture` returns: its pictures, the notes beside them, and what it found wrong. */
export interface LivePictured {
  tiles: Tile[];
  notes: string[];
  problems: string[];
}

/** `--on`'s place in the world, if it's given. */
function placeOf(on: number[] | undefined): THREE.Vector3 | undefined {
  return on ? new THREE.Vector3(on[0], on[1], on[2]) : undefined;
}

/** `lab live picture`: the hero pictured as `options` say, each picture finished (laid over, cropped). */
export async function picture(lab: Lab, options: LivePicture): Promise<LivePictured> {
  const asked = options.views ?? [renderer.viewMode() === 'first' ? 'eyes' : 'third'];
  const views = asked.filter((view): view is ViewName => view !== SCREEN);
  if (views.length) lab.checkCapture(views, renderer.viewMode(), options.focus);
  lab.model.root.updateMatrixWorld(true);
  // (a look's pipelines made first: its picture is drawn and read in one task, `readyLook`)
  if (views.length && options.look) await readyLook(options.look, meshesOf(lab.model.root));
  const tiles = views.length
    ? lab.capture(views, {
      focus: options.focus,
      at: placeOf(options.on),
      distance: options.distance,
      look: options.look,
    })
    : [];
  if (asked.includes(SCREEN)) tiles.push(...(await lab.screen(SCREEN)).tiles);
  const notes = tiles.filter((tile) => tile.parts).map((tile) => {
    return `${tile.view}: ${describeParts(tile.parts!, PARTS_LISTED)}`;
  });
  // (through the eyes, the weapon as they frame it: where it comes in, its tip and head, what it and the arm cover)
  const seen = renderer.viewMode() === 'first' ? await framed(lab) : null;
  if (seen) notes.unshift(describeFramed(seen));
  const finished: Tile[] = [];
  for (const tile of tiles) finished.push(await finish(tile, options));
  const problems = options.canary ? partsCanary(lab, views, options.focus) : [];
  return { tiles: finished, notes, problems };
}

/** The `parts` look's canary: the hero hidden and pictured from `views`, where no part of him may be found. */
function partsCanary(lab: Lab, views: ViewName[], focus?: keyof Joints): string[] {
  const root = lab.model.root;
  const shown = root.visible;
  root.visible = false;
  try {
    const found = lab.capture(views, { focus, look: 'parts' }).filter((tile) => tile.parts!.length > 0);
    return found.map((tile) => `the canary: ${tile.view} found ${tile.parts!.length} parts of a hidden hero`);
  } finally {
    root.visible = shown;
  }
}

/** An image from a data URL, loaded. */
async function imageOf(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** `tile` with the reference laid over it and cropped, as `options` say. */
async function finish(tile: Tile, options: LivePicture): Promise<Tile> {
  if (!options.over && !options.crop) return tile;
  const [left, top, right, bottom] = options.crop ?? [0, 0, 1, 1];
  const x = Math.round(left * tile.width);
  const y = Math.round(top * tile.height);
  const width = Math.max(1, Math.round((right - left) * tile.width));
  const height = Math.max(1, Math.round((bottom - top) * tile.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.drawImage(await imageOf(tile.png), -x, -y);
  if (options.over) {
    context.globalAlpha = options.strength ?? OVER_STRENGTH;
    context.drawImage(await imageOf(options.over), -x, -y, tile.width, tile.height);
  }
  return { ...tile, png: canvas.toDataURL('image/png'), width, height };
}

/** `lab live inspect`: the object `options` names (the hero by default) and what's under it, each on a line. */
export function inspect(lab: Lab, options: LiveInspect): string {
  const joints = jointsByObject(lab.joints);
  const root = options.name ? objectNamed(lab, options.name) : lab.model.root;
  G.scene.updateMatrixWorld(true);
  const lines: string[] = [];
  const list = (object: THREE.Object3D, depth: number, indent: string) => {
    lines.push(`${indent}${describe(object, joints)}`);
    const children = object.children;
    if (children.length === 0) return;
    if (depth >= options.depth) {
      lines.push(`${indent}  (${children.length} under it: --depth ${options.depth + 1} lists them)`);
      return;
    }
    for (const child of children.slice(0, CHILDREN_LISTED)) list(child, depth + 1, `${indent}  `);
    if (children.length > CHILDREN_LISTED) lines.push(`${indent}  (and ${children.length - CHILDREN_LISTED} more)`);
  };
  list(root, 0, '');
  return lines.join('\n');
}

/** The object of the scene `name` names: one of the hero's joints, or an object of that name. */
function objectNamed(lab: Lab, name: string): THREE.Object3D {
  const joint = (lab.joints as unknown as Record<string, unknown>)[name];
  if (joint instanceof THREE.Object3D) return joint;
  const found = G.scene.getObjectByName(name);
  if (found) return found;
  const names = new Set<string>(lab.jointNames());
  G.scene.traverse((object) => {
    if (object.name) names.add(object.name);
  });
  throw new Error(`lab: live inspect: nothing is called ${name} (the names: ${[...names].join(', ')})`);
}

const metres = (vector: THREE.Vector3) => vector.toArray().map((value) => value.toFixed(3)).join(', ');
const degrees = (euler: THREE.Euler) => [euler.x, euler.y, euler.z].map((value) => {
  return THREE.MathUtils.radToDeg(value).toFixed(1);
}).join(', ');

/** An object on a line: what it is, where it is in the world, how it's turned and scaled in its parent, what it's
 *  drawn with and where it is on the screen. */
function describe(object: THREE.Object3D, joints: Map<THREE.Object3D, string>): string {
  const name = object.name || joints.get(object) || '';
  const what = name ? `${name} (${object.type})` : object.type;
  const parts = [`at ${metres(object.getWorldPosition(new THREE.Vector3()))}`];
  if (object.rotation.x || object.rotation.y || object.rotation.z) parts.push(`turned ${degrees(object.rotation)}°`);
  if (!object.scale.equals(new THREE.Vector3(1, 1, 1))) parts.push(`scaled ${metres(object.scale)}`);
  if (!object.visible) parts.push('hidden');
  if (object.layers.mask !== 1) parts.push(`layers ${object.layers.mask.toString(2)}`);
  const meshes = meshesOf(object);
  if (meshes.length) {
    const triangles = meshes.reduce((sum, mesh) => sum + trianglesOf(mesh), 0);
    parts.push(`${triangles.toLocaleString('en')} triangles in ${meshes.length} meshes`);
    parts.push(onScreen(object));
  }
  return `${what}: ${parts.join('; ')}`;
}

function trianglesOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

/** the most vertices of a mesh projected to find where it is on the screen (every so many past it) */
const VERTICES_PROJECTED = 4000;

/** Where a picture's points reach, as shares of it across and down, and how many were seen and behind the camera. */
interface Reach {
  left: number;
  top: number;
  right: number;
  bottom: number;
  seen: number;
  behind: number;
}

/**
 * Where `object` is on the screen through the game's camera, as drawn and posed: the box round its vertices there,
 * as shares across and down. (Its box in the world, projected, reached two screens past the edges for a maul held
 * by the camera.)
 */
function onScreen(object: THREE.Object3D): string {
  const reach: Reach = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, seen: 0, behind: 0 };
  for (const mesh of meshesOf(object)) {
    // (a crowd's instances are each somewhere else; a mesh on a layer no camera draws isn't seen)
    const lens = lensOf(mesh);
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || !lens) continue;
    reachOf(mesh, lens, reach);
  }
  if (reach.seen === 0) return reach.behind ? 'behind the camera' : 'not drawn by the camera';
  const off = reach.left < 0 || reach.top < 0 || reach.right > 1 || reach.bottom > 1;
  const share = (value: number) => `${Math.round(THREE.MathUtils.clamp(value, 0, 1) * 100)}%`;
  const across = `across ${share(reach.left)}-${share(reach.right)}`;
  const down = `down ${share(reach.top)}-${share(reach.bottom)}`;
  const past = off ? ' (reaching past its edge)' : '';
  const partly = reach.behind ? ', partly behind the camera' : '';
  return `on the screen ${across}, ${down}${past}${partly}`;
}

/** `reach` widened to `mesh`'s vertices on the screen, as posed (skinned) and drawn by `camera`. */
function reachOf(mesh: THREE.Mesh, camera: THREE.Camera, reach: Reach): void {
  const point = new THREE.Vector3();
  const inView = new THREE.Vector3();
  const count = mesh.geometry.attributes.position.count;
  const step = Math.max(1, Math.ceil(count / VERTICES_PROJECTED));
  for (let i = 0; i < count; i += step) {
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
    inView.copy(point).applyMatrix4(camera.matrixWorldInverse);
    // (a point behind the camera projects through it, to the wrong side)
    if (inView.z >= 0) {
      reach.behind++;
      continue;
    }
    point.project(camera);
    const x = (point.x + 1) / 2;
    const y = (1 - point.y) / 2;
    reach.left = Math.min(reach.left, x);
    reach.right = Math.max(reach.right, x);
    reach.top = Math.min(reach.top, y);
    reach.bottom = Math.max(reach.bottom, y);
    reach.seen++;
  }
}
