// `lab village --only grassBeyondOnHigh`: the grass beyond the palisade, which Low and Very low leave out (#680,
// `simpleVillage`, `setGrassBeyondWalls` in world/village.ts) and High and Medium keep as main has it (from review:
// "You removed grass from here on High as well"). Read on High as booted, on Low, on Very low and on High again
// after them: the mask the blades read (`meadow.userData.maskTexture`) as the GPU holds it, at points in a band just
// outside the palisade, against its image on the page, and the grass's vertices shaded looking out through the forest's
// gap. High must grow grass at most of the points and Low and Very low at none, the GPU's copy as the image has it;
// High again must read as High did. Run it booted at Low too (`--boot low`): Auto boots a first visit there, the village
// built with the grass cut, and the mask swapped back for High was never sent to the GPU (the image read 93% and the
// GPU none). Its canary leaves the grass beyond the palisade out on High, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera } from '../../../src/core/renderer';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { ENTRANCES } from '../../../src/data/village';
import { palisadePolygon } from '../../../src/world/villagePlan';
import { setGrassBeyondWalls } from '../../../src/world/village';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import { grassVertices } from './grassCount';
import type { LightsChecked } from './villageLights';

/** how far outside the palisade's line the points are read (m), and how many round it */
const OUTSIDE = 5;
const POINTS = 90;
/** a point grows grass where the mask reads over this (of 255) */
const GROWS = 128;
/** High must grow grass at this share of the points at least (the ways out and the trees' feet are bare) */
const HIGH_LEAST = 0.3;
/** how far inside the forest's gap he stands, looking out through it (m) */
const INSIDE_GAP = 4;
/** the frames given to settle after a switch */
const SETTLE = 30;

/** The levels read, in turn: High as booted, the two that leave the grass out, and High again. */
const LEVELS = ['high', 'low', 'verylow', 'high'] as const;

/** Points `OUTSIDE` m outside the palisade's line, all round it. */
function pointsOutside(): THREE.Vector2[] {
  const line = palisadePolygon(POINTS);
  const middle = line.reduce((sum, [x, z]) => sum.add(new THREE.Vector2(x, z)), new THREE.Vector2())
    .divideScalar(line.length);
  return line.map(([x, z]) => {
    const at = new THREE.Vector2(x, z);
    return at.clone().add(at.clone().sub(middle).normalize().multiplyScalar(OUTSIDE));
  });
}

/** the size of the target the GPU's copy of the mask is drawn into to be read (px a side) */
const READ_SIZE = 256;

/** Where on a mask of `size` px a side a point of the world lies, or null off it. */
function texelOf(point: THREE.Vector2, half: number, size: number): [number, number] | null {
  const u = Math.floor(((point.x + half) / (2 * half)) * size);
  const v = Math.floor(((point.y + half) / (2 * half)) * size);
  return u < 0 || v < 0 || u >= size || v >= size ? null : [u, v];
}

/** The share of `points` that grow grass in a mask read as `red(u, v)` (0 to 255) over `size` px a side. */
function shareGrowing(points: THREE.Vector2[], size: number, red: (u: number, v: number) => number): number {
  const half = G.arena.village!.meadow.userData.maskHalf as number;
  const grows = points.filter((point) => {
    const texel = texelOf(point, half, size);
    return texel !== null && red(texel[0], texel[1]) > GROWS;
  });
  return grows.length / points.length;
}

/** The mask's texture the blades read. */
const maskTexture = (): THREE.Texture => G.arena.village!.meadow.userData.maskTexture as THREE.Texture;

/** The share of `points` that grow grass in the mask's image as the page holds it. */
function imageShare(points: THREE.Vector2[]): number {
  const image = maskTexture().source.data as HTMLCanvasElement;
  const read = document.createElement('canvas');
  read.width = image.width;
  read.height = image.height;
  const context = read.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  return shareGrowing(points, image.width, (u, v) => pixels[(v * image.width + u) * 4]);
}

/** The share of `points` that grow grass in the mask as the GPU holds it: drawn whole into a target and read back
 *  (an image swapped without the texture marked stays on the GPU as it was first sent). */
function gpuShare(lab: Lab, points: THREE.Vector2[]): number {
  const target = new THREE.WebGLRenderTarget(READ_SIZE, READ_SIZE);
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: maskTexture(), toneMapped: false }),
  );
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const pixels = new Uint8Array(READ_SIZE * READ_SIZE * 4);
  const renderer = G.renderer;
  const before = renderer.getRenderTarget();
  // (the lab draws nothing unless asked: `drawing`)
  const drawing = lab.drawing;
  lab.drawing = true;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  lab.drawing = drawing;
  renderer.readRenderTargetPixels(target, 0, 0, READ_SIZE, READ_SIZE, pixels);
  renderer.setRenderTarget(before);
  target.dispose();
  quad.geometry.dispose();
  (quad.material as THREE.Material).dispose();
  // (the mask isn't flipped as it's sent, `flipY` off, so its first row is drawn at the quad's foot, read first)
  return shareGrowing(points, READ_SIZE, (u, v) => pixels[(v * READ_SIZE + u) * 4]);
}

/** He stands inside the forest's gap, looking out through it over the shoulder. */
async function lookOut(lab: Lab): Promise<void> {
  const { gap, out } = ENTRANCES.forest;
  const facing = Math.atan2(out[0], out[1]);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(gap[0] - out[0] * INSIDE_GAP, 0, gap[1] - out[1] * INSIDE_GAP), facing);
  faceCamera(facing);
  await viewBy(lab, 'third');
}

/** One level read: where the grass grows beyond the palisade, and the vertices shaded looking out. */
async function readAt(lab: Lab, level: (typeof LEVELS)[number], canary: boolean) {
  useQuality(level);
  if (canary && level === 'high') setGrassBeyondWalls(false);
  await lab.step(SETTLE);
  drawFrame(lab);
  const points = pointsOutside();
  return { level, share: gpuShare(lab, points), image: imageShare(points), vertices: grassVertices() };
}

/** The grass beyond the palisade on High, Low, Very low and High again. */
export async function grassBeyondOnHigh(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = qualityLevel();
  holdHour(12);
  await lookOut(lab);
  try {
    const reads = [];
    for (const level of LEVELS) {
      reads.push(await readAt(lab, level, canary));
      if (!canary) moments.push(await lab.screen(`${level} (${reads.length})`, []));
    }
    for (const read of reads) {
      const share = `${(read.share * 100).toFixed(0)}%`;
      const image = `${(read.image * 100).toFixed(0)}%`;
      lines.push(`${read.level}: grass at ${share} of the points beyond the palisade on the GPU (${image} in the `
        + `mask's image), ${read.vertices} vertices`);
      if (Math.abs(read.share - read.image) > 0.05) {
        problems.push(`grassBeyondOnHigh: on ${read.level} the GPU's mask grows grass at ${share} of the points and `
          + `its image at ${image}: the texture wasn't sent again`);
      }
    }
    const [high, low, veryLow, again] = reads;
    if (high.share < HIGH_LEAST) problems.push(`grassBeyondOnHigh: High grows grass at ${high.share} beyond the palisade`);
    if (again.share < HIGH_LEAST) {
      problems.push(`grassBeyondOnHigh: back on High it grows grass at ${again.share} beyond the palisade`);
    }
    if (Math.abs(again.vertices - high.vertices) > high.vertices / 50) {
      problems.push(`grassBeyondOnHigh: back on High ${again.vertices} vertices, ${high.vertices} before`);
    }
    for (const thin of [low, veryLow]) {
      if (thin.share > 0) problems.push(`grassBeyondOnHigh: ${thin.level} grows grass beyond the palisade`);
    }
  } finally {
    useQuality(was);
  }
  const caught = canary ? problems.length > 0 : null;
  return { lines, problems: canary ? [] : problems, caught, moments };
}
