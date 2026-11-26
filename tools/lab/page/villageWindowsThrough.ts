// `lab village`'s hall windows seen through both ways (from play, "make hall windows semi transparent, so they
// actually show what's outside behind them", "should be able to see hall from outside too, so both ways"): the camera
// set square on to an east window, outside it and inside the hall, at midnight and noon, and the frame drawn three
// ways: culled by the doorway as the game culls it (`world/doorways.ts`, each window an opening of its own), drawn
// whole, and drawn whole with the glass hidden. Culled as the game culls must change no pixel (what the window shows
// is drawn); and the window's picture through the glass must be alike its picture with no glass, pixel for pixel
// (`ALIKE`: what's past it shows through it). Four readings were thrown out: the window's light through the glass
// against with none (from outside the glass mirrors the sky, brighter than the hall past it, and the canary read
// brighter still); the doorway's own 'all' cull leaves the trees and the hall's lit inside drawn; a panel added past
// the glass by the check is never drawn by the engine; and what's past the wall hidden (83% of the window's pixels
// changed from outside) left the trees, instanced, from inside (7%). The canary sets the glass to an opacity of 1,
// which the engine draws as a wall's ghost: nothing past it shows, and the second reading must fail.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { viewMode } from '../../../src/core/renderer';
import { fadedWhole } from '../../../src/core/seeThrough';
import { setDoorCull } from '../../../src/world/doorways';
import * as world_ from '../../../src/world/village';
import { TERRACE } from '../../../src/data/village';
import { changedShare, countedFrame, viewBy } from './villageHallCull';
import type { Canvas } from './light';
import type { LightsChecked } from './villageLights';

/** the hours read, and the frames a stand is given to settle */
const HOURS = [0, 12];
const SETTLE = 30;
/** how many frames a stand waits at most for the walls and roof to stand whole again */
const FADE_FRAMES = 300;
/** how far off the window's middle the camera stands (m), and how far the hero stands off the wall on its side */
const CAMERA_OFF = 4;
const HERO_OFF = 2.5;
/** how much of the window's box on the screen is read, about its middle: its frame and reveals left out */
const BOX_KEPT = 0.7;
/** the most of the frame's pixels the doorway's cull may change, and how alike at least the window's picture through
 *  the glass must be to it with none (its leads and the sky it mirrors take some: 0.28 to 0.79 read as built, the
 *  canary's opaque glass 0.18 to -0.16) */
const MOST_CHANGED = 0.0005;
const ALIKE = 0.2;
/** from inside, at most `MOST_BRIGHTER` of the whole pane's pixels brighter through its glass than with none (by over
 *  `BRIGHTENED` of white and `BRIGHTENED_BY` times): glass dims what's past it. A torch's lamp shone on the glossy
 *  glass as a patch low on the window at any hour, where no flame was (from play, "what's this light on window sill
 *  from ?"). From outside the glass mirrors the sky, brighter than the hall past it, and isn't read so. */
const BRIGHTENED = 0.03;
const BRIGHTENED_BY = 1.5;
const MOST_BRIGHTER = 0.005;
/** the glass's roughness the canary sets: as it was, glossy */
const GLOSSY = 0.1;
/** how far the camera may move as a frame is drawn (m) */
const CAMERA_HELD = 0.01;
/** the wall kinds that must stand whole for a reading: a thinned wall shows what's past it round the glass */
const WALLS = ['hallEast', 'hallRoof', 'hallFront'] as const;

/** The hall's windows as this commit has them (an A/B's other side may have none: a named import of an export it
 *  lacks would stop every command loading there). */
type HallWindows = () => { sill: THREE.Vector3; out: THREE.Vector3; half: number; high: number }[];
const hallWindows = (world_ as { hallWindows?: HallWindows }).hallWindows;

/** Which way a stand looks through the window: from outside in (1), or from inside out (-1). */
interface Stand { name: string; side: 1 | -1 }

const STANDS: Stand[] = [
  { name: 'from outside, into the hall', side: 1 },
  { name: 'from inside, out at the village', side: -1 },
];

/** The middle east window: its middle, the way out of the hall through it, and its half width and height. */
interface Window { middle: THREE.Vector3; out: THREE.Vector3; half: number; high: number }

function eastWindow(): Window {
  const east = hallWindows!().filter((window) => window.out.x > 0);
  const window = east[Math.floor(east.length / 2)];
  const middle = window.sill.clone().add(new THREE.Vector3(0, window.high / 2, 0));
  return { middle, out: window.out.clone(), half: window.half, high: window.high };
}

/** A material of the village's by its name, found in the scene. */
function materialNamed(name: string): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  G.scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (material?.name === name) found = material;
  });
  return found;
}

/** The hall's glass material. */
function hallGlass(): THREE.MeshStandardMaterial {
  const found = materialNamed('hallGlass');
  if (!found) throw new Error('lab: village: no mesh is drawn in the hall\'s glass (a material named hallGlass)');
  return found;
}

/** The meshes drawn in the hall's glass. */
function glassMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === 'hallGlass') meshes.push(mesh);
  });
  return meshes;
}

/** The hero on the stand's side of the window, facing it, let settle with the walls whole. */
async function standBy(lab: Lab, stand: Stand): Promise<void> {
  const { middle, out } = eastWindow();
  const at = middle.clone().addScaledVector(out, stand.side * HERO_OFF);
  // (inside, never past the aisle's middle: the hall's middle is its terrace's)
  if (stand.side < 0) at.x = Math.max(at.x, TERRACE.x);
  at.y = groundHeight(at.x, at.z);
  const facing = Math.atan2(-stand.side * out.x, -stand.side * out.z);
  G.player.walkTo = null;
  G.player.place(at, facing);
  await viewBy(lab, 'third');
  await lab.step(SETTLE);
  for (let frame = 0; frame < FADE_FRAMES && WALLS.some((kind) => fadedWhole(kind)); frame++) await lab.step(1);
}

/** The game's camera set square on to the window, `CAMERA_OFF` on the stand's side; where it stands. */
function aimCamera(stand: Stand): THREE.Vector3 {
  const { middle, out } = eastWindow();
  const eye = middle.clone().addScaledVector(out, stand.side * CAMERA_OFF);
  G.camera.position.copy(eye);
  G.camera.lookAt(middle);
  G.camera.updateMatrixWorld(true);
  return eye;
}

/** A box on the canvas, in pixels from its bottom left (as a canvas is read). */
interface Box { left: number; right: number; bottom: number; top: number }

/** The window's glass on the canvas as the camera has it, `kept` of it about its middle. */
function windowBox(canvas: Canvas, kept: number): Box {
  const { middle, half, high } = eastWindow();
  const xs: number[] = [];
  const ys: number[] = [];
  for (const along of [-1, 1]) {
    for (const up of [-1, 1]) {
      const corner = middle.clone().add(new THREE.Vector3(0, up * high / 2 * kept, along * half * kept));
      corner.project(G.camera);
      xs.push((corner.x + 1) / 2 * canvas.width);
      ys.push((corner.y + 1) / 2 * canvas.height);
    }
  }
  return {
    left: Math.max(0, Math.floor(Math.min(...xs))),
    right: Math.min(canvas.width, Math.ceil(Math.max(...xs))),
    bottom: Math.max(0, Math.floor(Math.min(...ys))),
    top: Math.min(canvas.height, Math.ceil(Math.max(...ys))),
  };
}

/** `canvas`'s pixels within `box`, as a canvas of their own. */
function cropped(canvas: Canvas, box: Box): Canvas {
  const width = box.right - box.left;
  const height = box.top - box.bottom;
  const pixels = new Float32Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((box.bottom + row) * canvas.width + box.left) * 4;
    pixels.set(canvas.pixels.subarray(from, from + width * 4), row * width * 4);
  }
  return { ...canvas, width, height, pixels };
}

/** Each pixel's light in `canvas`, its channels' mean. */
function lightsOf(canvas: Canvas): number[] {
  const lights: number[] = [];
  for (let at = 0; at < canvas.pixels.length; at += 4) {
    lights.push((canvas.pixels[at] + canvas.pixels[at + 1] + canvas.pixels[at + 2]) / 3);
  }
  return lights;
}

/** How alike two pictures of one size are, pixel for pixel: their lights' correlation (1 the same picture however
 *  dimmed or tinted, 0 nothing alike). */
function alike(a: Canvas, b: Canvas): number {
  const one = lightsOf(a);
  const two = lightsOf(b);
  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanOne = mean(one);
  const meanTwo = mean(two);
  let both = 0;
  let firsts = 0;
  let seconds = 0;
  for (let k = 0; k < one.length; k++) {
    both += (one[k] - meanOne) * (two[k] - meanTwo);
    firsts += (one[k] - meanOne) ** 2;
    seconds += (two[k] - meanTwo) ** 2;
  }
  return both / Math.max(1e-12, Math.sqrt(firsts * seconds));
}

/** The share of `through`'s pixels brighter than the same pixel of `bare` by over `BRIGHTENED` of white and
 *  `BRIGHTENED_BY` times. */
function brightenedShare(through: Canvas, bare: Canvas): number {
  const lit = lightsOf(through);
  const plain = lightsOf(bare);
  let brightened = 0;
  for (let k = 0; k < lit.length; k++) {
    if (lit[k] - plain[k] > BRIGHTENED && lit[k] > plain[k] * BRIGHTENED_BY) brightened++;
  }
  return brightened / Math.max(1, lit.length);
}

/** What one hour's frames found: the share of the frame the cull changed, how alike the window's picture is through
 *  the glass and with none, the share of its pane brighter through the glass than with none, and how far the camera
 *  moved as they were drawn. */
interface HourRead { culled: number; shown: number; brighter: number; moved: number }

/** One stand's three frames at the hour held. */
function readHour(lab: Lab, stand: Stand): HourRead {
  const eye = aimCamera(stand);
  setDoorCull('door');
  const culled = countedFrame(lab);
  aimCamera(stand);
  setDoorCull('off');
  const whole = countedFrame(lab);
  const glass = glassMeshes();
  for (const mesh of glass) mesh.visible = false;
  aimCamera(stand);
  let bare: Canvas;
  try {
    bare = countedFrame(lab).canvas;
  } finally {
    for (const mesh of glass) mesh.visible = true;
    setDoorCull('door');
  }
  const box = windowBox(whole.canvas, BOX_KEPT);
  const pane = windowBox(whole.canvas, 1);
  return {
    culled: changedShare(culled.canvas, whole.canvas),
    shown: alike(cropped(whole.canvas, box), cropped(bare, box)),
    brighter: brightenedShare(cropped(whole.canvas, pane), cropped(bare, pane)),
    moved: G.camera.position.distanceTo(eye),
  };
}

/** A share as a percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(3)}%`;

/** What one stand found: its line, its problems, whether what's past the glass showed at every hour, whether the
 *  glass shone brighter than what's past it at an hour (from inside), its pictures. */
interface StandRead { line: string; problems: string[]; showsThrough: boolean; shone: boolean; moments: Pictured[] }

/** One stand's readings at each hour, and its frame pictured at each as the check's camera has it. */
async function readStand(lab: Lab, stand: Stand): Promise<StandRead> {
  await standBy(lab, stand);
  const at = `hall windows seen through, ${stand.name}`;
  const problems: string[] = [];
  const read: string[] = [];
  const moments: Pictured[] = [];
  let showsThrough = true;
  let shone = false;
  for (const hour of HOURS) {
    holdHour(hour);
    await lab.step(SETTLE);
    const thinned = WALLS.filter((kind) => fadedWhole(kind));
    if (thinned.length) problems.push(`${at}: at ${hour}:00 thinned: ${thinned.join(', ')}`);
    const { culled, shown, brighter, moved } = readHour(lab, stand);
    read.push(`${hour}:00 ${percent(culled)} of pixels changed by the cull, the window ${shown.toFixed(2)} alike `
      + `with no glass, ${percent(brighter)} of its pane brighter through it`);
    if (stand.side < 0 && brighter > MOST_BRIGHTER) {
      shone = true;
      problems.push(`${at}: at ${hour}:00 ${percent(brighter)} of the window's pane is brighter through its glass `
        + `than with none, not over ${percent(MOST_BRIGHTER)}: the glass shines`);
    }
    aimCamera(stand);
    moments.push(await lab.screen(`${stand.name}, ${hour}:00`));
    if (moved > CAMERA_HELD) problems.push(`${at}: the camera moved ${moved.toFixed(2)} m as the frame was drawn`);
    if (culled > MOST_CHANGED) problems.push(`${at}: at ${hour}:00 the doorway's cull changed the frame`);
    if (shown < ALIKE) {
      showsThrough = false;
      problems.push(`${at}: at ${hour}:00 the window through its glass is ${shown.toFixed(2)} alike it with none, `
        + `not ${ALIKE}`);
    }
  }
  return { line: `${at}: ${read.join('; ')}`, problems, showsThrough, shone, moments };
}

/** The hall's windows seen through from outside and inside, at midnight and noon. */
export async function hallWindowsSeeThrough(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (!hallWindows) {
    return { lines: ['hall windows seen through: this commit has no windows seen through'], problems: [], caught: null,
      moments: [] };
  }
  const view = viewMode();
  const glass = hallGlass();
  const { opacity, roughness } = glass;
  const reads: StandRead[] = [];
  const glossy: StandRead[] = [];
  try {
    if (canary) glass.opacity = 1;
    for (const stand of STANDS) reads.push(await readStand(lab, stand));
    // (the second canary: the glass glossy as it was, read from inside)
    if (canary) {
      glass.opacity = opacity;
      glass.roughness = GLOSSY;
      glass.needsUpdate = true;
      glossy.push(await readStand(lab, STANDS[1]));
    }
  } finally {
    glass.opacity = opacity;
    glass.roughness = roughness;
    glass.needsUpdate = true;
    setDoorCull('door');
    holdHour(null);
    await viewBy(lab, view);
  }
  const lines = [...reads, ...glossy].map((read) => read.line);
  const problems = [...reads, ...glossy].flatMap((read) => read.problems);
  const caught = canary ? reads.every((read) => !read.showsThrough) && glossy.every((read) => read.shone) : null;
  return { lines, problems, caught, moments: reads.flatMap((read) => read.moments) };
}
