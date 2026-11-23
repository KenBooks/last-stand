// tools/lab studio: a plain, lit room to picture a thing alone in, as it's made (`lab weapons`, `lab hands`): a grey
// backdrop, a sky light and two lamps, a camera framing what's pictured, and its pictures read back with the share of
// each the thing covers.
import * as THREE from 'three';
import type { Lab, Tile } from './lab';
import { G } from '../../../src/state';
import { frameRect } from '../../../src/core/renderer';
import { drawRust } from '../../../src/engine';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { PLAIN_GRADE, type Grade } from '../../../src/engine/globals';
import { particles } from '../../../src/fx/particles';
import { webGpuPixels } from './pixels';

/** A picture to take in the studio: its name and the camera it's taken with. */
export interface Shot {
  name: string;
  camera: THREE.PerspectiveCamera;
}

/** the studio's backdrop, and how far a pixel may be from it and still count as backdrop (0-255 a channel) */
const BACKDROP = new THREE.Color(0x5a5f66);
const BACKDROP_SLACK = 6;
/** a picture's shape (width over height, as the sheet's tiles), the camera's field of view (degrees) and the room
 *  left round what it frames */
const TILE_SHAPE = 340 / 560;
const STUDIO_FOV = 20;
const MARGIN = 1.12;
/** the grade the studio's pictures are drawn with: the eye held (`PLAIN_GRADE`), no vignette and no bloom, so its
 *  backdrop is one colour across a picture and nothing's glow spills past its edge */
const STUDIO_GRADE: Grade = { ...PLAIN_GRADE, vignette: 0, bloomShare: 0 };
/** how long the browser is given to compile the pipelines a picture asks for (ms of its own clock) */
const COMPILE_MS = 30000;

/** where the studio's key and rim stand, for a camera in front (+z): the key above it and to its right, the rim behind
 *  on the left */
const KEY_AT = new THREE.Vector3(1.5, 3, 4);
const RIM_AT = new THREE.Vector3(-3, 1.5, -3);

/** The studio: the backdrop, a sky light and two lamps, a key from above in front and a rim from behind; with
 *  `withCamera`, each picture `shoot` takes lit so from its own camera's side, as a photograph is (lit from the front,
 *  a hood's back showed in the shade). */
export function studio(withCamera = false): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = BACKDROP;
  scene.environment = G.scene.environment;
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3530, 1.4));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
  key.name = 'key';
  key.position.copy(KEY_AT);
  const rim = new THREE.DirectionalLight(0xc8d8ff, 1.6);
  rim.name = 'rim';
  rim.position.copy(RIM_AT);
  scene.add(key, rim);
  scene.userData.lightWithCamera = withCamera;
  return scene;
}

/** The studio's key and rim turned round the upright with `camera`, from where they stand for a camera in front. */
function lightFrom(scene: THREE.Scene, camera: THREE.Camera): void {
  const towards = camera.getWorldDirection(new THREE.Vector3());
  const turn = Math.atan2(-towards.x, -towards.z);
  const up = new THREE.Vector3(0, 1, 0);
  scene.getObjectByName('key')!.position.copy(KEY_AT).applyAxisAngle(up, turn);
  scene.getObjectByName('rim')!.position.copy(RIM_AT).applyAxisAngle(up, turn);
}

/**
 * The studio's camera looking at `part` from the side `from` points to (from its middle), near enough to frame it in
 * a picture of `TILE_SHAPE`: its height (y) up the picture, its width or depth across it, with `up` up the picture,
 * through a lens of `fov` degrees (a longer one, from further off, draws what's nearer it and what's further at
 * nearer their sizes beside each other).
 */
export function cameraOn(part: THREE.Box3, from: THREE.Vector3Tuple, up: THREE.Vector3Tuple = [0, 1, 0],
  fov = STUDIO_FOV): THREE.PerspectiveCamera {
  const frame = frameRect();
  const camera = new THREE.PerspectiveCamera(fov, frame.width / frame.height, 0.01, 50);
  const centre = part.getCenter(new THREE.Vector3());
  const size = part.getSize(new THREE.Vector3());
  const tall = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const upWay = new THREE.Vector3(...up).normalize();
  const height = Math.abs(size.dot(upWay));
  // (its widest square to `up`, one of the box's axes)
  const across = Math.max(...size.toArray().map((extent, i) => extent * (1 - Math.abs(upWay.getComponent(i)))));
  // (from the nearest of it: half its depth nearer than its middle)
  const fit = Math.max(height / 2 / tall, across / 2 / (tall * TILE_SHAPE));
  const distance = fit * MARGIN + across / 2;
  const way = new THREE.Vector3(...from).normalize();
  camera.position.copy(centre).addScaledVector(way, distance);
  camera.up.copy(upWay);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  return camera;
}

/** `draw` run with the game's particles' pools held empty: the engine draws them with whatever scene it's handed
 *  (`engine/sprites.ts`), and the lobby's motes and his staff's sparks were dots on the studio's backdrop, an empty
 *  studio read as 0.3 to 0.5% drawn. */
function withoutParticles(draw: () => void): void {
  const pools = [particles.glow, particles.smoke];
  const counts = pools.map((pool) => pool.count);
  for (const pool of pools) pool.count = 0;
  try {
    draw();
  } finally {
    pools.forEach((pool, k) => (pool.count = counts[k]));
  }
}

/**
 * `scene` drawn by the engine from `camera`, at the frame's size, and the middle of it at the tile's shape read back
 * as an opaque picture, rows from the top, in the task that drew it (the engine's canvas holds it until the next
 * frame). The engine alone draws the game: three's renderer, drawn into and read by `readPixels` before, has no
 * drawing buffer of its own now, and every command that pictured in the studio stopped at its first picture.
 */
async function drawnTile(scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<ImageData> {
  const frame = frameRect();
  const height = frame.height;
  const width = Math.round(height * TILE_SHAPE);
  const left = Math.round((frame.width - width) / 2);
  camera.aspect = frame.width / frame.height;
  camera.updateProjectionMatrix();
  const began = window.__labClock.realNow();
  for (;;) {
    const unready = PIPELINES.unready;
    withoutParticles(() => {
      const host = G.renderer as unknown as THREE.WebGLRenderer;
      drawRust(scene, camera, G.time, frame.width, frame.height, host, STUDIO_GRADE);
    });
    // (a draw whose pipeline was still compiling is left out of the frame: the studio's lights and backdrop ask for
    // pipelines of their own, compiled aside on the browser's time, and its first picture lacked 11 of its draws)
    const leftOut = PIPELINES.unready - unready;
    if (leftOut === 0) break;
    if (window.__labClock.realNow() - began > COMPILE_MS) {
      throw new Error(`lab: studio: ${leftOut} draws still left out after ${COMPILE_MS} ms, their pipelines compiling`);
    }
    await window.__labClock.realFrame();
  }
  const image = webGpuPixels({ left, top: 0, width, height });
  for (let k = 3; k < image.data.length; k += 4) image.data[k] = 255;
  return image;
}

/** A tile of `scene` drawn from `shot`'s camera, and the share of it the thing covers. */
async function readTile(scene: THREE.Scene, shot: Shot): Promise<{ tile: Tile; drawn: number }> {
  const image = await drawnTile(scene, shot.camera);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.putImageData(image, 0, 0);
  const tile = { view: shot.name, png: canvas.toDataURL('image/png'), width: image.width, height: image.height };
  const backdrop = await backdropDrawn();
  return { tile, drawn: drawnShare(context, image.width, image.height, backdrop) };
}

/** The share of a picture's pixels that aren't the backdrop (`backdrop` as drawn). */
function drawnShare(context: CanvasRenderingContext2D, width: number, height: number,
  backdrop: { colour: number[]; slack: number }): number {
  const pixels = context.getImageData(0, 0, width, height).data;
  const [r, g, b] = backdrop.colour;
  let drawn = 0;
  for (let k = 0; k < pixels.length; k += 4) {
    const off = Math.max(Math.abs(pixels[k] - r), Math.abs(pixels[k + 1] - g), Math.abs(pixels[k + 2] - b));
    if (off > backdrop.slack) drawn++;
  }
  return drawn / (width * height);
}

/** the backdrop as the engine draws it, read once (`backdropDrawn`) */
let backdropShown: { colour: number[]; slack: number } | null = null;

/** the share of an empty picture's pixels its slack must hold: a pixel or two of the grain's may stray further */
const GRAIN_SHARE = 0.999;

/** An empty picture's mean colour (0-255 a channel), and how far its pixels stray from it in any channel, all but the
 *  farthest (`GRAIN_SHARE`). */
function meanAndReach(picture: ImageData): { colour: number[]; reach: number } {
  const pixels = picture.width * picture.height;
  const colour = [0, 1, 2].map((channel) => {
    let sum = 0;
    for (let k = channel; k < picture.data.length; k += 4) sum += picture.data[k];
    return sum / pixels;
  });
  const strays: number[] = [];
  for (let k = 0; k < picture.data.length; k += 4) {
    const off = [0, 1, 2].map((channel) => Math.abs(picture.data[k + channel] - colour[channel]));
    strays.push(Math.max(...off));
  }
  strays.sort((a, b) => a - b);
  return { colour, reach: strays[Math.floor((strays.length - 1) * GRAIN_SHARE)] };
}

/**
 * The backdrop's colour as a picture shows it (0-255 a channel), and how far a pixel may be from it and still be it:
 * read from an empty studio's picture, as the engine grades it. Its colour is the picture's mean, its slack how far
 * its pixels stray (the grade's grain, 3 to 4 levels a channel), `BACKDROP_SLACK` at least: taken as three's
 * backdrop's own colour, and then as one pixel of it, an empty studio read as 100% and 40% drawn, and with its
 * farthest pixel (a mote of the game's particles, `withoutParticles`) the hero read as none.
 */
export async function backdropDrawn(): Promise<{ colour: number[]; slack: number }> {
  if (!backdropShown) {
    const camera = new THREE.PerspectiveCamera(STUDIO_FOV, 1, 0.01, 50);
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld();
    const { colour, reach } = meanAndReach(await drawnTile(studio(), camera));
    backdropShown = { colour, slack: Math.max(BACKDROP_SLACK, Math.ceil(reach) + 1) };
  }
  return backdropShown;
}

/** `scene` drawn from `camera` as `shoot` draws it, read back as a tile, rows from the top (any scene: a mask's,
 *  a look's). */
export async function studioPicture(lab: Lab, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<ImageData> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    if (scene.userData.lightWithCamera) lightFrom(scene, camera);
    return await drawnTile(scene, camera);
  } finally {
    lab.drawing = drawing;
  }
}

/** `scene` drawn from `shot`'s camera as `shoot` draws it, read back as a tile's pixels (RGBA, its bottom row
 *  first). */
export async function drawnPixels(lab: Lab, scene: THREE.Scene, shot: Shot):
  Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const image = await studioPicture(lab, scene, shot.camera);
  const { width, height } = image;
  // (rows from the bottom, as a drawing buffer's were)
  const pixels = new Uint8Array(width * height * 4);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    pixels.set(image.data.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  return { pixels, width, height };
}

/** `scene` pictured with each of `shots`, and the least and the most of a picture drawn. */
export async function shoot(lab: Lab, scene: THREE.Scene, shots: Shot[]):
  Promise<{ tiles: Tile[]; least: number; most: number }> {
  const drawing = lab.drawing;
  // (the lab draws nothing unless it's picturing)
  lab.drawing = true;
  const tiles: Tile[] = [];
  let least = 1;
  let most = 0;
  try {
    for (const shot of shots) {
      if (scene.userData.lightWithCamera) lightFrom(scene, shot.camera);
      const { tile, drawn } = await readTile(scene, shot);
      tiles.push(tile);
      least = Math.min(least, drawn);
      most = Math.max(most, drawn);
    }
  } finally {
    lab.drawing = drawing;
  }
  return { tiles, least, most };
}

/** How many triangles and meshes `object` is drawn with. */
export function countsOf(object: THREE.Object3D): { triangles: number; meshes: number } {
  let triangles = 0;
  let meshes = 0;
  object.traverseVisible((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const geometry = mesh.geometry;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return { triangles, meshes };
}
