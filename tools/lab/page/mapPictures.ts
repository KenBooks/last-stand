// tools/lab maps' pictures (`lab maps --pictures`): each map as a surface takes it. Its albedo and its height laid
// twice each way (a seam shows as a cross through the middle), its albedo at its own pixels round the corner where
// four of it meet, and lit in the studio on a square and a ball, as the game's materials take it (core/textures.ts:
// repeated, sRGB albedo, the normal and roughness maps as they are).
import * as THREE from 'three';
import type { Lab, Tile } from './lab';
import { canvasOf } from './pixels';
import { cameraOn, shoot, studio } from './studio';
import type { PBRData, RecipeName } from '../../../src/core/pbr';

/** How the lit picture draws a map's material: the colour it's tinted, how metal it is and its normals' scale. */
interface Look {
  color: number;
  metalness: number;
  normalScale: number;
}

/** the metals' looks, as the warrior's plate and mail are drawn (entities/models/warrior.ts); the others' plain */
const LOOKS: Partial<Record<RecipeName, Look>> = {
  steel: { color: 0xa9adb5, metalness: 0.92, normalScale: 0.8 },
  mail: { color: 0x8e949e, metalness: 0.85, normalScale: 1.6 },
};
const PLAIN: Look = { color: 0xffffff, metalness: 0, normalScale: 1.2 };

/** each recipe's group: a sheet of pictures each (a moment's label starts with it) */
const GROUPS: Record<RecipeName, string> = {
  steel: 'metal',
  mail: 'metal',
  cobblestone: 'stone',
  ashlar: 'stone',
  flagstone: 'stone',
  marble: 'stone',
  slate: 'stone',
  rock: 'stone',
  granite: 'stone',
  limestone: 'stone',
  grunge: 'stone',
  forestFloor: 'ground',
  soil: 'ground',
  moss: 'ground',
  wood: 'wood',
  bark: 'wood',
  bowWood: 'wood',
  burlap: 'cloth',
  leather: 'cloth',
  oiled: 'cloth',
  skin: 'cloth',
  wool: 'cloth',
  felt: 'cloth',
  cloth: 'cloth',
  fur: 'cloth',
  face: 'faces',
};
/** the groups of recipes another commit may still make (an A/B's main side), which this tree's took over */
const OTHERS_GROUPS: Record<string, string> = {
  slabs: 'stone',
};

/** the laid pictures' side (px: a tile's width on the lab's sheet) and how many times the map is laid each way */
const LAID_SIDE = 340;
const LAID_TIMES = 2;
/** the corner's picture (px, at the map's own pixels) */
const CORNER_WIDTH = 340;
const CORNER_HEIGHT = 560;
/** the lit square's side and the ball's radius (m), and how many times the map repeats across each */
const SQUARE_SIDE = 2;
const BALL_RADIUS = 0.8;
const LIT_REPEAT = 2;

/** A recipe's group: this tree's, or one main still has (else `other`). */
export const groupOf = (name: string): string => GROUPS[name as RecipeName] ?? OTHERS_GROUPS[name] ?? 'other';

/** A map's three canvases: its albedo, its height (grey) and its normals, at its own pixels. */
function canvasesOf(data: PBRData): { albedo: HTMLCanvasElement; height: HTMLCanvasElement; normal: HTMLCanvasElement;
  rough: HTMLCanvasElement } {
  const width = data.size;
  const height = data.height ?? data.size;
  const grey = new Uint8ClampedArray(data.rough.length);
  for (let k = 0; k < grey.length; k += 4) {
    grey.fill(data.rough[k], k, k + 3);
    grey[k + 3] = 255;
  }
  const canvas = (rgba: Uint8ClampedArray<ArrayBuffer>): HTMLCanvasElement => {
    return canvasOf(new ImageData(rgba, width, height));
  };
  return {
    albedo: canvas(data.albedo),
    height: canvas(grey),
    normal: canvas(data.normal),
    rough: canvas(data.rough),
  };
}

/** `source` drawn over a canvas `width` by `height` from (`left`, `top`) on, again and again each way, at `scale`. */
function tiledOver(source: HTMLCanvasElement, width: number, height: number, left: number, top: number,
  scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  const stepX = source.width * scale;
  const stepY = source.height * scale;
  const firstX = left - Math.ceil(left / stepX) * stepX;
  const firstY = top - Math.ceil(top / stepY) * stepY;
  for (let y = firstY; y < height; y += stepY) {
    for (let x = firstX; x < width; x += stepX) context.drawImage(source, x, y, stepX, stepY);
  }
  return canvas;
}

const tileOf = (view: string, canvas: HTMLCanvasElement): Tile => {
  return { view, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
};

/** `source` laid `LAID_TIMES` each way over a square. */
function laid(view: string, source: HTMLCanvasElement): Tile {
  const scale = LAID_SIDE / LAID_TIMES / source.width;
  return tileOf(view, tiledOver(source, LAID_SIDE, LAID_SIDE, 0, 0, scale));
}

/** `source` at its own pixels with the corner where four of it meet in the middle. */
function cornered(view: string, source: HTMLCanvasElement): Tile {
  return tileOf(view, tiledOver(source, CORNER_WIDTH, CORNER_HEIGHT, CORNER_WIDTH / 2, CORNER_HEIGHT / 2, 1));
}

/** A canvas as a texture as the game makes its maps' (core/textures.ts `toTexture`), repeated `LIT_REPEAT` times. */
function textureOf(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(LIT_REPEAT, LIT_REPEAT);
  texture.anisotropy = 8;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}

/** The map's material on a square above a ball, lit in the studio. */
function lit(lab: Lab, name: RecipeName, canvases: ReturnType<typeof canvasesOf>): Tile {
  const look = LOOKS[name] ?? PLAIN;
  const maps = {
    map: textureOf(canvases.albedo, true),
    normalMap: textureOf(canvases.normal, false),
    roughnessMap: textureOf(canvases.rough, false),
  };
  const material = new THREE.MeshStandardMaterial({
    ...maps,
    color: look.color,
    metalness: look.metalness,
    roughness: 1,
    normalScale: new THREE.Vector2(look.normalScale, look.normalScale),
  });
  const square = new THREE.Mesh(new THREE.PlaneGeometry(SQUARE_SIDE, SQUARE_SIDE), material);
  square.position.y = BALL_RADIUS + 0.1 + SQUARE_SIDE / 2;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 96, 48), material);
  ball.position.y = -0.1 - BALL_RADIUS;
  const scene = studio();
  scene.add(square, ball);
  scene.updateMatrixWorld(true);
  try {
    const box = new THREE.Box3().setFromObject(scene);
    return shoot(lab, scene, [{ name: 'lit', camera: cameraOn(box, [0, 0, 1]) }]).tiles[0];
  } finally {
    for (const mesh of [square, ball]) mesh.geometry.dispose();
    for (const texture of Object.values(maps)) texture.dispose();
    material.dispose();
  }
}

/** A map's pictures: its albedo and height laid, its corner, and its material lit. */
export function picturesOf(lab: Lab, name: RecipeName, data: PBRData): Tile[] {
  const canvases = canvasesOf(data);
  return [
    laid('albedo', canvases.albedo),
    laid('height', canvases.height),
    cornered('corner', canvases.albedo),
    lit(lab, name, canvases),
  ];
}
