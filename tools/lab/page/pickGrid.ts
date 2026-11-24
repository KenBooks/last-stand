// What each cell of a grid over the frame shows of some meshes (tools/lab's frame measure, page/inFrame.ts): those
// meshes alone drawn once by the engine through a camera at the grid's size, each group of them unlit in a pure
// colour of its own (red, green, blue) over black, and read back off the engine's canvas. A cell is a pixel, drawn at
// its middle, as the eye's ray through its middle would meet it. (A ray a cell, three's own test posed every vertex
// of a skinned mesh by its bones for each ray: with the hands across the view at a strike, a frame took 43 s.) It drew
// them with three's renderer into a target of its own and read it with `readRenderTargetPixels`, which has nothing to
// draw into under the engine: `framed` (the eyes' notes of `sheet`, `live`, `fitrest`) threw at its first frame.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { drawRust } from '../../../src/engine';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { PLAIN_GRADE, type Grade } from '../../../src/engine/globals';
import { webGpuPixels } from './pixels';

/** the layer the picked meshes are drawn on alone (three's last: nothing of the game's is on it) */
const PICK_LAYER = 31;
/** each group's colour, a channel each, and the most groups told apart */
const CHANNELS: THREE.ColorRepresentation[] = [0xff0000, 0x00ff00, 0x0000ff];
/** how bright a group's channel must read, and how far over the others, for a cell to be it (the grade's curve and
 *  grain move a colour off its own) */
const LEAST_LIGHT = 64;
const OVER_OTHERS = 2;
/** the frame's grade: the eye held, no vignette, no bloom (as the studio's pictures) */
const PICK_GRADE: Grade = { ...PLAIN_GRADE, vignette: 0, bloomShare: 0 };
/** the longest the draw waits for the flat materials' pipelines, compiled aside, before it gives up (ms) */
const COMPILE_MS = 30000;
/** the backdrop: nothing drawn is black */
const BLACK = new THREE.Color(0);

/** A flat unlit material of the group `index`'s colour, sided as `like` is. */
function flatLike(like: THREE.Material, index: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: CHANNELS[index], side: like.side, fog: false, toneMapped: false });
}

/** What a picked mesh was drawn as, to put back. */
interface Worn {
  mesh: THREE.Mesh;
  material: THREE.Mesh['material'];
  onLayer: boolean;
}

/**
 * Each cell of an `across` by `down` grid over what `camera` sees (row by row from the top left): the index in
 * `groups` of the group whose mesh is nearest there, or -1 where none is. Drawn with the meshes' world matrices and
 * bones as they are, the draw waited out on the browser's time while their pipelines compile.
 */
export async function pickGrid(lab: Lab, camera: THREE.Camera, groups: THREE.Mesh[][], across: number, down: number):
  Promise<Int8Array> {
  if (groups.length > CHANNELS.length) throw new Error(`lab: pickGrid: at most ${CHANNELS.length} groups`);
  const worn: Worn[] = [];
  const made: THREE.Material[] = [];
  groups.forEach((meshes, index) => {
    for (const mesh of meshes) {
      worn.push({ mesh, material: mesh.material, onLayer: mesh.layers.isEnabled(PICK_LAYER) });
      const flat = flatLike(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, index);
      made.push(flat);
      mesh.material = flat;
      mesh.layers.enable(PICK_LAYER);
    }
  });
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    return readGroups(await drawPicked(camera as THREE.PerspectiveCamera, across, down), groups.length);
  } finally {
    lab.drawing = drawing;
    for (const { mesh, material, onLayer } of worn) {
      mesh.material = material;
      if (!onLayer) mesh.layers.disable(PICK_LAYER);
    }
    for (const material of made) material.dispose();
  }
}

/** The scene drawn by the engine through `camera` on the pick layer alone, `across` by `down`, until no draw is left
 *  out for a pipeline still compiling; its picture, rows from the top. */
async function drawPicked(camera: THREE.PerspectiveCamera, across: number, down: number): Promise<ImageData> {
  const scene = G.scene;
  const host = G.renderer as unknown as THREE.WebGLRenderer;
  const layers = camera.layers.mask;
  const background = scene.background;
  const fog = scene.fog;
  const began = window.__labClock.realNow();
  try {
    camera.layers.set(PICK_LAYER);
    scene.background = BLACK;
    scene.fog = null;
    for (;;) {
      const unready = PIPELINES.unready;
      drawRust(scene, camera, G.time, across, down, host, PICK_GRADE);
      const leftOut = PIPELINES.unready - unready;
      if (leftOut === 0) break;
      if (window.__labClock.realNow() - began > COMPILE_MS) {
        throw new Error(`lab: pickGrid: ${leftOut} draws still left out after ${COMPILE_MS} ms, their pipelines compiling`);
      }
      await window.__labClock.realFrame();
    }
    return webGpuPixels({ left: 0, top: 0, width: across, height: down });
  } finally {
    camera.layers.mask = layers;
    scene.background = background;
    scene.fog = fog;
  }
}

/** The group a pixel shows: the channel that reads bright and well over the others, or -1. */
function groupAt(data: Uint8ClampedArray, at: number, groups: number): number {
  for (let index = 0; index < groups; index++) {
    const own = data[at + index];
    const others = Math.max(...[0, 1, 2].filter((channel) => channel !== index).map((channel) => data[at + channel]));
    if (own >= LEAST_LIGHT && own > others * OVER_OTHERS) return index;
  }
  return -1;
}

/** Each cell's group from the picture (rows from the top), row by row from the top left. */
function readGroups(image: ImageData, groups: number): Int8Array {
  const cells = new Int8Array(image.width * image.height).fill(-1);
  for (let cell = 0; cell < cells.length; cell++) cells[cell] = groupAt(image.data, cell * 4, groups);
  return cells;
}
