// tools/lab studio: a plain, lit room to picture a thing alone in, as it's made (`lab weapons`, `lab hands`): a grey
// backdrop, a sky light and two lamps, a camera framing what's pictured, and its pictures read back with the share of
// each the thing covers.
import * as THREE from 'three';
import type { Lab, Tile } from './lab';
import { G } from '../../../src/state';
import { frameRect } from '../../../src/core/renderer';
import { opaqueRows } from './pixels';

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

/**
 * The middle of the canvas just drawn at the tile's shape, as a tile, and the share of it the thing covers. Read
 * from the drawing buffer and taken as opaque: the game draws its frame with an alpha of 0 (core/hdr.ts adds it to
 * the page as light), and copied onto a 2D canvas every picture came out black.
 */
function readTile(name: string): { tile: Tile; drawn: number } {
  const gl = G.renderer.getContext();
  const frame = frameRect();
  const height = frame.height;
  const width = Math.round(height * TILE_SHAPE);
  const left = frame.left + Math.round((frame.width - width) / 2);
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(left, frame.bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.putImageData(opaqueRows(pixels, width, height), 0, 0);
  const tile = { view: name, png: canvas.toDataURL('image/png'), width, height };
  return { tile, drawn: drawnShare(context, width, height) };
}

/** The share of a picture's pixels that aren't the backdrop. */
function drawnShare(context: CanvasRenderingContext2D, width: number, height: number): number {
  const pixels = context.getImageData(0, 0, width, height).data;
  const backdrop = BACKDROP.clone().convertLinearToSRGB();
  const [r, g, b] = [backdrop.r, backdrop.g, backdrop.b].map((channel) => channel * 255);
  let drawn = 0;
  for (let k = 0; k < pixels.length; k += 4) {
    const off = Math.max(Math.abs(pixels[k] - r), Math.abs(pixels[k + 1] - g), Math.abs(pixels[k + 2] - b));
    if (off > BACKDROP_SLACK) drawn++;
  }
  return drawn / (width * height);
}

/** The backdrop's colour as a picture shows it (0-255 a channel), and how far a pixel may be from it and still be it. */
export function backdropDrawn(): { colour: number[]; slack: number } {
  const shown = BACKDROP.clone().convertLinearToSRGB();
  return { colour: [shown.r, shown.g, shown.b].map((channel) => channel * 255), slack: BACKDROP_SLACK };
}

/** `scene` drawn from `shot`'s camera as `shoot` draws it, read back as a tile's pixels (RGBA, its bottom row first). */
export function drawnPixels(lab: Lab, scene: THREE.Scene, shot: Shot):
  { pixels: Uint8Array; width: number; height: number } {
  const renderer = G.renderer;
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    if (scene.userData.lightWithCamera) lightFrom(scene, shot.camera);
    renderer.setRenderTarget(null);
    renderer.render(scene, shot.camera);
    const gl = renderer.getContext();
    const frame = frameRect();
    const height = frame.height;
    const width = Math.round(height * TILE_SHAPE);
    const left = frame.left + Math.round((frame.width - width) / 2);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(left, frame.bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels, width, height };
  } finally {
    lab.drawing = drawing;
  }
}

/** `scene` pictured with each of `shots`, and the least and the most of a picture drawn. */
export function shoot(lab: Lab, scene: THREE.Scene, shots: Shot[]): { tiles: Tile[]; least: number; most: number } {
  const renderer = G.renderer;
  const toneMapping = renderer.toneMapping;
  const drawing = lab.drawing;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // (the lab draws nothing unless it's picturing)
  lab.drawing = true;
  const tiles: Tile[] = [];
  let least = 1;
  let most = 0;
  try {
    for (const shot of shots) {
      if (scene.userData.lightWithCamera) lightFrom(scene, shot.camera);
      renderer.setRenderTarget(null);
      renderer.render(scene, shot.camera);
      const { tile, drawn } = readTile(shot.name);
      tiles.push(tile);
      least = Math.min(least, drawn);
      most = Math.max(most, drawn);
    }
  } finally {
    renderer.toneMapping = toneMapping;
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
