// tools/lab fire: a biome's fire as the player meets it, and its flames measured as fire burns. The fire is found by
// its light (the warm one of the biome's ten point lights: a brazier's, a bonfire's) and read back from beside it
// three times a moment, with its own light (what it draws unlit near its light: flames and glows, and the glow
// particles), without it, and without the smoke too, so the differences are the fire alone and its smoke
// (fireMeasure.ts): how tall and wide it burns, its light
// and hue band by band from its base up (a wood fire burns yellow-white low and redder and dimmer as it rises), what
// of it is blown out white, the tongues its top breaks into, the smoke over it, how much of it moves from moment to
// moment and how its light swells (a fire a metre across puffs about 1.5 times a second); its light's flicker on the
// screen in the top-down view, as WCAG counts flashes. Its flames read alone from round it at one moment: seen from
// behind, a flame is its own mirror (its light passes through it), and one that shows the same face from either side
// turns with the camera. The plants reaching over it as the top-down view draws them (`fireClear.ts`). Pictured from
// beside it at three moments, its own light alone, from above, its flames from round it, and in the game's views
// with the hero standing before it.
import * as THREE from 'three';
import type { Lab, Pictured, Report, Tile } from './lab';
import { screenArea } from './lab';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { updateSeeThrough } from '../../../src/core/seeThrough';
import { CAMERA } from '../../../src/data/balance';
import { particles } from '../../../src/fx/particles';
import type { BiomeId } from '../../../src/data/biomes';
import { standIn } from './light';
import { canvasOf, readOpaque, type Area } from './pixels';
import { FrameReader } from './screenCells';
import { worstFlashing } from './flashes';
import {
  BANDS, LIT, changeBetween, frameStats, medianOf, strongestFrequency, swingOf, turningOf,
  type FireFrame, type FrameStats, type Turning,
} from './fireMeasure';
import { CANARY_PLANT, plantIn, reachingInto, type Column, type Reaching } from './fireClear';
import { CANARY_COST_LEAST, canaryCost, flameCost, type FlameCost } from './fireCost';
import { belowFound, readBelow, type BelowReading } from './fireBelow';
import { knowsLogs, logsFound, logsUnknown, readOverLogs, type LogsReading } from './fireLogs';
import { fadeFound, readFade, type FadeFrames } from './fireFade';
import { seeHoleEnd } from '../../../src/core/seeThrough';
import { drawLookOf, partAt } from './looks';

export interface FireOptions {
  biome: BiomeId;
  /** how long the fire is read for (s) */
  seconds: number;
  /** time what its flames take of the GPU (its times differ from run to run) */
  cost: boolean;
  /** plant the faults the measures must catch: a still flame, one drawn white, a strobe on the screen, none drawn */
  canary: boolean;
}

/** A fire of the biome's: its light, where that is, and what it draws of its own light near it. */
interface Fire {
  light: THREE.PointLight;
  at: THREE.Vector3;
  parts: THREE.Object3D[];
  /** the lowest of its parts (m): the bed it burns on */
  base: number;
}

/** A camera of the fire's pictures: the side it looks from (from the fire, its length 1), and how far off. */
interface Shot {
  name: string;
  from: THREE.Vector3;
  distance: number;
  /** how far over the fire's base it looks (m) */
  rise: number;
  /** its field of view (degrees), the close-ups' `FOV` without one */
  fov?: number;
}

/** how far from its light a fire's own parts lie (m, across) */
const FIRE_REACH = 1.5;
/** how far before the fire the hero stands, towards the arena's middle (m) */
const HERO_OFF = 4.5;
/** the frames stood before the fire is read, once the hero is set up: its particles risen and fallen */
const SETTLE_FRAMES = 120;
/** the fire is read this often (s) */
const SAMPLE_S = 1 / 30;
/** the close-ups' field of view (degrees), as the lab's own */
const FOV = 30;
/** the moments of the reading pictured from beside it (s from its start) */
const PICTURED_AT = [0, 0.13, 0.27];
/** a fire whose light moves less than this from one moment to the next (a share of it) is still */
const STILL = 0.02;
/** a fire with more of its lit pixels than this drawn white is blown out */
const WHITE_MOST = 0.2;
/** flashes in a second the screen may show (AGENTS.md: about 1.5 a second is the most; three is a hazard) */
const FLASHES_MOST = 3;
/** the canary's strobe on one cell of the screen: its rate (Hz) and its swing (a share of white) */
const STROBE_HZ = 4;
const STROBE_SWING = 0.3;
/** the flames read alone from round them, to see whether they turn with the camera: level with their middle, from
 *  far off through a long lens (near what an orthographic camera sees, so the far side's picture is the near's mirror
 *  but for the perspective), from these sides (degrees round them from the arena's middle; the first and third
 *  compared) */
const TURN_DISTANCE = 10;
const TURN_FOV = 12;
const TURN_SIDES = [0, 90, 180, 270];
/** seen from behind, flames whose detail is less alike than this to their front's mirror (or more to their front as
 *  it is) turn with the camera */
const MIRROR_LEAST = 0.6;
/** flames whose front is more alike its own mirror than this look the same turned or not: they say nothing (main's
 *  disc of coals, seen edge on as a line, read as turning) */
const EVEN_MOST = 0.9;
/** how far round the flames' sides and how high over their bed no plant may reach (m) */
const PLANT_CLEAR = 0.3;
const PLANT_HEIGHT = 2.5;

/** `count` `thing`s, said as a count. */
const counted = (count: number, thing: string): string => `${count} ${thing}${count === 1 ? '' : 's'}`;

/** Whether `colour` (linear) is a fire's: red, with little green and less blue. */
const fireColour = (colour: THREE.Color): boolean =>
  colour.r > 0.8 && colour.g < 0.6 * colour.r && colour.b < 0.3 * colour.r;

/** Whether `material` draws its own light: unlit, a shader of the game's own, or added light. */
function glows(material: THREE.Material): boolean {
  if (material.blending === THREE.AdditiveBlending) return true;
  return (material as THREE.ShaderMaterial).isShaderMaterial === true
    || (material as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
}

/** Whether `object` is drawn with a material that draws its own light. */
function drawsGlow(object: THREE.Object3D): boolean {
  const drawn = object as THREE.Mesh;
  if (!drawn.isMesh && !(object as THREE.Points).isPoints) return false;
  const materials = Array.isArray(drawn.material) ? drawn.material : [drawn.material];
  return materials.some(glows);
}

/** The parts of `group` near `at` (across) that draw their own light. */
function glowsNear(group: THREE.Object3D, at: THREE.Vector3): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const centre = new THREE.Vector3();
  group.traverse((object) => {
    if (!drawsGlow(object)) return;
    new THREE.Box3().setFromObject(object).getCenter(centre);
    if (Math.hypot(centre.x - at.x, centre.z - at.z) <= FIRE_REACH) parts.push(object);
  });
  return parts;
}

/** The lowest point of `parts` (m), or `fallback` with none. */
function lowestOf(parts: THREE.Object3D[], fallback: number): number {
  const lows = parts.map((part) => new THREE.Box3().setFromObject(part).min.y).filter(Number.isFinite);
  return lows.length ? Math.min(...lows) : fallback;
}

/** The biome's fires, by its warm lights. */
function firesIn(biome: BiomeId): Fire[] {
  const group = G.arena.groupOf(biome);
  const lights: THREE.PointLight[] = [];
  group.traverse((object) => {
    const light = object as THREE.PointLight;
    if (light.isPointLight && fireColour(light.color)) lights.push(light);
  });
  return lights.map((light) => {
    const at = light.getWorldPosition(new THREE.Vector3());
    const parts = glowsNear(group, at);
    return { light, at, parts, base: lowestOf(parts, at.y - 1) };
  });
}

/** The way from `fire` to the arena's middle, across (its length 1). */
const towardMiddle = (fire: Fire): THREE.Vector3 => new THREE.Vector3(-fire.at.x, 0, -fire.at.z).normalize();

/** The fire's pictures from beside it (from the arena's side, a little above) and from above. */
function shotsOf(fire: Fire): { beside: Shot; above: Shot } {
  const middle = towardMiddle(fire);
  return {
    beside: { name: 'beside', from: middle.clone().setY(0.25).normalize(), distance: 3.6, rise: 0.7 },
    above: { name: 'above', from: middle.clone().multiplyScalar(0.55).setY(1).normalize(), distance: 4.2, rise: 0.5 },
  };
}

/** the window's area a close-up reads: its middle, three-fifths of its height wide */
function closeArea(): Area {
  const width = Math.round(innerHeight * 0.6);
  return { left: Math.round((innerWidth - width) / 2), top: 0, width, height: innerHeight };
}

/** The game's camera put on `shot` of `fire`; returns what puts it back. */
function aim(fire: Fire, shot: Shot): () => void {
  const camera = G.camera;
  const kept = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
    near: camera.near };
  const centre = new THREE.Vector3(fire.at.x, fire.base + shot.rise, fire.at.z);
  camera.position.copy(centre).addScaledVector(shot.from, shot.distance);
  camera.fov = shot.fov ?? FOV;
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  // (the props stand whole: their dissolve round the hero is the game views')
  updateSeeThrough(centre.x, centre.y, centre.z, 0, 0);
  return () => {
    camera.position.copy(kept.position);
    camera.quaternion.copy(kept.quaternion);
    camera.fov = kept.fov;
    camera.near = kept.near;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
}

/** `fire`'s own light and the glow particles shown or hidden. */
function showFire(fire: Fire, shown: boolean): void {
  for (const part of [...fire.parts, particles.glow.points]) part.visible = shown;
}

/** The game drawn now, by its own camera as it is, read back from `area`. */
function drawnNow(lab: Lab, area: Area): ImageData {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    renderer.render();
  } finally {
    lab.drawing = drawing;
  }
  // (the chain's last pass may leave its own target bound: read the canvas's)
  G.renderer.setRenderTarget(null);
  return readOpaque(area);
}

/** `fire` from `shot` now, with its own light, without, and without its smoke too (with `none`, without its light in
 *  all three). */
function readFire(lab: Lab, fire: Fire, shot: Shot, none = false): FireFrame {
  const pools = [particles.glow.points, particles.smoke.points].map((pool) => pool.visible);
  const restore = aim(fire, shot);
  try {
    if (none) showFire(fire, false);
    const shown = drawnNow(lab, closeArea());
    showFire(fire, false);
    const hidden = drawnNow(lab, closeArea());
    particles.smoke.points.visible = false;
    const bare = drawnNow(lab, closeArea());
    return { shown, hidden, bare };
  } finally {
    showFire(fire, true);
    particles.glow.points.visible = pools[0];
    particles.smoke.points.visible = pools[1];
    restore();
  }
}

/** the fire seen from under its bowl's rim, towards the arena's middle (`fireBelow.ts`) */
function belowShot(fire: Fire): Shot {
  return { name: 'below', from: towardMiddle(fire).setY(-0.45).normalize(), distance: 2.4, rise: 0.5 };
}

/** the fire seen from above its logs as the player stands over it (the owner's screenshot: about 50° down, near) */
function overLogsShot(fire: Fire): Shot {
  return { name: 'over its logs', from: towardMiddle(fire).setY(1.2).normalize(), distance: 4.5, rise: 0.25 };
}

/** The meshes of the logs in the fire (the game names them so), near its middle across. */
function logsIn(group: THREE.Object3D, fire: Fire): THREE.Mesh[] {
  const logs: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  group.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh || !object.name.includes('logs')) return;
    box.setFromObject(object).getCenter(centre);
    if (Math.hypot(centre.x - fire.at.x, centre.z - fire.at.z) <= FIRE_REACH / 2) logs.push(object as THREE.Mesh);
  });
  return logs;
}

/** `fire` read from above its logs (its light shown, as the player sees it). */
function readFromAbove(lab: Lab, fire: Fire, flames: THREE.Mesh, logs: THREE.Mesh[], canary: boolean): LogsReading {
  const restore = aim(fire, overLogsShot(fire));
  try {
    const logsDrawn = () => coverOf(lab, logs, closeArea());
    return readOverLogs({ draw: () => drawnNow(lab, closeArea()), logsDrawn, flames, canary });
  } finally {
    restore();
  }
}

/** Where the see-through hole's end is put, short of the flames' `middle` along the view (m): across the near faces
 *  of the box the shader is drawn on, and short of every point the flames' fade is taken at (their middle and a
 *  half-width `reach` either side along the view), so the fire fades not at all, and before, its near side alone (a
 *  partial fade, even, read uneven through the bloom and the grade's curve). Halfway between the box's nearest corner
 *  and the nearest of those points; none if the box stands no nearer than they do from here (seen face-on). */
function holeEndShort(middle: THREE.Vector3, reach: number): number | null {
  const camera = G.camera.getWorldPosition(new THREE.Vector3());
  const way = middle.clone().sub(camera).setY(0).normalize();
  const nearest = reach * (Math.abs(way.x) + Math.abs(way.z));
  return nearest > reach * 1.1 ? (nearest + reach) / 2 : null;
}

/** The point the see-through hole is made round, for the hole's end to stand `short` of the flames' `middle`: on the
 *  line from the camera through their middle. */
function focusShort(middle: THREE.Vector3, short: number): THREE.Vector3 {
  const camera = G.camera.getWorldPosition(new THREE.Vector3());
  const way = middle.clone().sub(camera).normalize();
  return middle.clone().addScaledVector(way, seeHoleEnd() - short);
}

/** The flames' box's half-width across (m), as their shader has it. */
const reachOf = (flames: THREE.Mesh): number =>
  ((flames.material as THREE.ShaderMaterial).uniforms.uBox.value as THREE.Vector3).x;

/** `fire`'s flames alone from beside them, with the see-through hole's end across them, without the hole, and none
 *  of it drawn (the grade's adaptation held off, as `readFlames` holds it). */
function fadeFrames(lab: Lab, fire: Fire, flames: THREE.Mesh): FadeFrames | null {
  const restore = aim(fire, shotsOf(fire).beside);
  const shown = hideAllBut([flames]);
  renderer.holdAdaptation(true);
  try {
    const material = flames.material as THREE.ShaderMaterial;
    const middle = material.uniforms.uCentre.value.clone().setY(
      material.uniforms.uCentre.value.y + material.uniforms.uHeight.value / 2);
    const short = holeEndShort(middle, reachOf(flames));
    if (short === null) return null;
    const focus = focusShort(middle, short);
    updateSeeThrough(focus.x, focus.y, focus.z, 1, 0);
    const faded = drawnNow(lab, closeArea());
    updateSeeThrough(focus.x, focus.y, focus.z, 0, 0);
    const unfaded = drawnNow(lab, closeArea());
    flames.visible = false;
    const empty = drawnNow(lab, closeArea());
    flames.visible = true;
    return { faded, unfaded, empty };
  } finally {
    renderer.holdAdaptation(false);
    shown();
    restore();
  }
}

/** The fire's flames' volume: the part its shader marches from the bed's middle (`uCentre`), if it has one. */
function flamesOf(fire: Fire): THREE.Mesh | undefined {
  return fire.parts.find((part): part is THREE.Mesh => {
    const material = (part as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    return !!material?.uniforms?.uCentre;
  });
}

/** how far under its bed a bowl's foot reaches at least (a bonfire's ring of stones lies round it) */
const BOWL_DEPTH = 0.3;

/** Whether `solids` round the fire's bed hold it in a bowl: one rises past the bed from well under it. */
function inBowl(solids: THREE.Mesh[], fire: Fire): boolean {
  const box = new THREE.Box3();
  return solids.some((solid) => {
    box.setFromObject(solid);
    return box.min.y < fire.base - BOWL_DEPTH && box.max.y > fire.base;
  });
}

/** The solid parts round the fire's bed (its bowl and stand: drawn by no light of their own, no higher than its bed
 *  and a little over, within its reach across). */
function solidsUnder(group: THREE.Object3D, fire: Fire): THREE.Mesh[] {
  const solids: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  group.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh || drawsGlow(object)) return;
    box.setFromObject(object).getCenter(centre);
    const near = Math.hypot(centre.x - fire.at.x, centre.z - fire.at.z) <= FIRE_REACH / 2;
    if (near && box.max.y <= fire.base + 0.4 && box.min.y < fire.base) solids.push(object as THREE.Mesh);
  });
  return solids;
}

/** Which pixels of `area` `meshes` cover as drawn now (1 where they do), rows from the top. */
function coverOf(lab: Lab, meshes: THREE.Mesh[], area: Area): Uint8Array {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    const parts = partAt(drawLookOf('parts', meshes, area, () => '').image, meshes);
    return Uint8Array.from(parts, (part) => (part >= 0 ? 1 : 0));
  } finally {
    lab.drawing = drawing;
  }
}

/** `fire` read from under its bowl (its light shown, as the player sees it). */
function readFromBelow(lab: Lab, fire: Fire, flames: THREE.Mesh, solids: THREE.Mesh[], canary: boolean):
  BelowReading {
  const restore = aim(fire, belowShot(fire));
  try {
    const glows = [...fire.parts.filter((part) => part !== flames && !(part as THREE.Light).isLight),
      particles.glow.points];
    const solidsDrawn = () => coverOf(lab, solids, closeArea());
    return readBelow({ draw: () => drawnNow(lab, closeArea()), solidsDrawn, flames, glows, canary });
  } finally {
    restore();
  }
}

/** `image` as a picture of `view`. */
function tileOf(image: ImageData, view: string): Tile {
  const canvas = canvasOf(image);
  return { view, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** The fire's own light alone (each pixel its shown over its hidden), as a picture. */
function aloneImage(frame: FireFrame): ImageData {
  const { shown, hidden } = frame;
  const image = new ImageData(shown.width, shown.height);
  for (let at = 0; at < shown.data.length; at += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const light = Math.max(0, (shown.data[at + channel] / 255) ** 2.2 - (hidden.data[at + channel] / 255) ** 2.2);
      image.data[at + channel] = Math.round(light ** (1 / 2.2) * 255);
    }
    image.data[at + 3] = 255;
  }
  return image;
}

/** What the reading of a fire found, moment by moment. */
interface Reading {
  stats: FrameStats[];
  /** each moment's change from the one before (a share of its light) */
  changes: number[];
  /** the fire's point light's intensity at each moment */
  lights: number[];
  /** the moments pictured, read back */
  pictured: FireFrame[];
}

/** `fire` read from `shot` every `SAMPLE_S` for `seconds`. */
async function readOver(lab: Lab, fire: Fire, shot: Shot, seconds: number): Promise<Reading> {
  const frameTime = window.__labClock.frame / 1000;
  const stepFrames = Math.max(1, Math.round(SAMPLE_S / frameTime));
  const moments = Math.round(seconds / (stepFrames * frameTime));
  const pictureAt = new Set(PICTURED_AT.map((time) => Math.round(time / (stepFrames * frameTime))));
  const reading: Reading = { stats: [], changes: [], lights: [], pictured: [] };
  for (let moment = 0; moment < moments; moment++) {
    await lab.step(stepFrames);
    const frame = readFire(lab, fire, shot);
    const stats = frameStats(frame);
    const before = reading.stats[reading.stats.length - 1];
    if (before) reading.changes.push(changeBetween(before.alone, stats.alone));
    reading.stats.push(stats);
    reading.lights.push(fire.light.intensity);
    if (pictureAt.has(moment)) reading.pictured.push(frame);
  }
  return reading;
}

/** The screen's cells' light in the top-down view as it stands, each frame for `seconds`. */
async function screenLights(lab: Lab, seconds: number): Promise<number[][]> {
  const frames = Math.round(seconds / (window.__labClock.frame / 1000));
  const reader = new FrameReader();
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let frame = 0; frame < frames; frame++) {
      await lab.step(1);
      reader.take();
    }
  } finally {
    lab.drawing = drawing;
  }
  return reader.frames().map((frame) => frame.cellLights);
}

/** The most flashes any cell of `lights` (each frame's) showed in one second. */
const flashesIn = (lights: number[][]): number => worstFlashing(lights, window.__labClock.frame / 1000).most;

/** The strobe canary: `lights` with their first cell's swung `STROBE_SWING` at `STROBE_HZ`, square. */
function strobed(lights: number[][]): number[][] {
  const frameTime = window.__labClock.frame / 1000;
  return lights.map((cells, frame) => {
    const high = Math.floor(frame * frameTime * STROBE_HZ * 2) % 2 === 0;
    return [Math.min(0.7, cells[0]) + (high ? STROBE_SWING : 0), ...cells.slice(1)];
  });
}

/** The metres a pixel spans at `shot`'s distance, at the drawing buffer's pixels. */
function metresPerPixel(shot: Shot): number {
  const height = G.renderer.getContext().drawingBufferHeight;
  return 2 * shot.distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / height;
}

/** The fire's size from `shot` over the reading (m), the moments' median. */
function sizeOf(reading: Reading, shot: Shot): { height: number; width: number } {
  const lit = reading.stats.filter((stats) => stats.extent !== null);
  const metres = metresPerPixel(shot);
  return {
    height: medianOf(lit.map((stats) => (stats.extent!.bottom - stats.extent!.top + 1) * metres)),
    width: medianOf(lit.map((stats) => (stats.extent!.right - stats.extent!.left + 1) * metres)),
  };
}

/** The fire's size, its bands, white, tongues, detail and smoke over the reading, each the moments' median. */
function shapeLines(reading: Reading, shot: Shot): string[] {
  const lit = reading.stats.filter((stats) => stats.extent !== null);
  const { height, width } = sizeOf(reading, shot);
  const bands = Array.from({ length: BANDS }, (_, band) => ({
    light: medianOf(lit.map((stats) => stats.bands[band].light)),
    hue: medianOf(lit.map((stats) => stats.bands[band].hue)),
  }));
  const bandText = bands.map((band) => `${band.light.toFixed(2)} at ${band.hue.toFixed(0)}°`).join(', ');
  const white = medianOf(lit.map((stats) => stats.white));
  const tongues = medianOf(lit.map((stats) => stats.tongues));
  const detail = medianOf(lit.map((stats) => stats.detail));
  const smoke = medianOf(lit.map((stats) => stats.smoke));
  return [
    `  its light ${height.toFixed(2)} m tall and ${width.toFixed(2)} m wide from beside it`,
    `  its bands from its base up, their light (a share of white) and hue: ${bandText}`,
    `  ${(white * 100).toFixed(1)}% of it drawn white; its top in ${tongues} parts; its light's spread over its `
      + `mean ${detail.toFixed(2)}; ${(smoke * 100).toFixed(1)}% of the picture over it changed by its smoke`,
  ];
}

/** The fire's moving: the change from moment to moment, and how its light and its point light swell. */
function motionLines(reading: Reading): string[] {
  const totals = reading.stats.map((stats) => stats.total);
  const puffing = strongestFrequency(totals, SAMPLE_S);
  const flicker = strongestFrequency(reading.lights, SAMPLE_S);
  return [
    `  ${(medianOf(reading.changes) * 100).toFixed(1)}% of its light moved from one moment to the next; its light `
      + `swung ${(swingOf(totals) * 100).toFixed(1)}%, most at ${puffing.hz.toFixed(1)} Hz `
      + `(${(puffing.share * 100).toFixed(0)}% of the swing)`,
    `  its point light swung ${(swingOf(reading.lights) * 100).toFixed(1)}%, most at ${flicker.hz.toFixed(1)} Hz`,
  ];
}

/** The faults the reading shows: nothing drawn, a still flame, one blown out white. */
function faultsOf(reading: Reading): string[] {
  const lit = reading.stats.filter((stats) => stats.extent !== null);
  if (!lit.length) return ['the fire drew nothing of its own light'];
  const faults: string[] = [];
  const change = medianOf(reading.changes);
  if (change < STILL) faults.push(`the fire stood still (${(change * 100).toFixed(1)}% of its light moved a moment)`);
  const white = medianOf(lit.map((stats) => stats.white));
  if (white > WHITE_MOST) faults.push(`the fire was blown out white (${(white * 100).toFixed(0)}% of it)`);
  return faults;
}

/** The canaries planted on the reading: a still flame, one drawn white, none drawn; a problem each it missed. */
function readingCanaries(lab: Lab, fire: Fire, shot: Shot, reading: Reading): string[] {
  const missed: string[] = [];
  const first = reading.stats[0];
  const still: Reading = { ...reading, changes: reading.changes.map(() => changeBetween(first.alone, first.alone)) };
  if (!faultsOf(still).some((fault) => fault.includes('stood still'))) missed.push('the still flame went unseen');
  const frame = reading.pictured[0];
  const whiteShown = new ImageData(new Uint8ClampedArray(frame.shown.data), frame.shown.width);
  const lit = frameStats(frame).alone;
  lit.forEach((light, pixel) => {
    if (light >= LIT) whiteShown.data.fill(255, pixel * 4, pixel * 4 + 3);
  });
  const white: Reading = { ...reading, stats: [frameStats({ ...frame, shown: whiteShown })] };
  if (!faultsOf(white).some((fault) => fault.includes('blown out'))) missed.push('the white flame went unseen');
  const none: Reading = { ...reading, stats: [frameStats(readFire(lab, fire, shot, true))] };
  if (!faultsOf(none).some((fault) => fault.includes('drew nothing'))) missed.push('the fire put out went unseen');
  return missed.map((what) => `canary: ${what}`);
}

/** Whether `object` is drawn: a mesh, points, a line or a sprite. */
function drawable(object: THREE.Object3D): boolean {
  return (object as THREE.Mesh).isMesh === true || (object as THREE.Points).isPoints === true
    || (object as THREE.Line).isLine === true || (object as THREE.Sprite).isSprite === true;
}

/** The materials `object` is drawn with. */
function materialsOf(object: THREE.Object3D): THREE.Material[] {
  const material = (object as THREE.Mesh).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

/** Everything the scene draws hidden but `kept`, by its materials (the culled plants show themselves again as they
 *  are packed for each render, `world/culling.ts`: hidden by their meshes, the forest's thicket stood between the fire
 *  and the camera; the lights stay, their count is in every lit program); returns what shows it again. */
function hideAllBut(kept: THREE.Object3D[]): () => void {
  const keep = new Set(kept.flatMap(materialsOf));
  const hidden = new Set<THREE.Material>();
  G.scene.traverse((object) => {
    if (!drawable(object)) return;
    for (const material of materialsOf(object)) {
      if (keep.has(material) || !material.visible) continue;
      material.visible = false;
      hidden.add(material);
    }
  });
  return () => {
    for (const material of hidden) material.visible = true;
  };
}

/** The flames' shot from `side` degrees round them from the arena's middle, level with their `height`'s middle. */
function turnShot(fire: Fire, side: number, height: number): Shot {
  const from = towardMiddle(fire).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(side));
  return { name: `from ${side}°`, from, distance: TURN_DISTANCE, rise: height / 2, fov: TURN_FOV };
}

/** `fire`'s flames from `shot` now, nothing else drawn (its bed and logs, the particles, the world), the grade's
 *  adaptation held off (left on, it set each picture's exposure by itself: what's left of the world, the haze over the
 *  forest, showed in the difference between them, its edges where the flames' box stood), and the logs taken from
 *  the flames' shader (hidden, they still cut the flames behind them: from behind, the bonfire's flames were 0.42
 *  alike their front's mirror, carved by logs not drawn). */
function readFlames(lab: Lab, fire: Fire, shot: Shot): FireFrame {
  const restore = hideAllBut(fire.parts);
  const flames = flamesOf(fire);
  renderer.holdAdaptation(true);
  try {
    return flames ? logsUnknown(flames, () => readFire(lab, fire, shot)) : readFire(lab, fire, shot);
  } finally {
    renderer.holdAdaptation(false);
    restore();
  }
}

/** The flames seen from each of `TURN_SIDES` at one moment, and how the far side's compares with the near's. */
interface TurnReading {
  frames: FireFrame[];
  /** each side's light alone, a share of white a pixel */
  alone: Float32Array[];
  width: number;
  turning: Turning;
}

/** `fire`'s flames read from round them now, `height` m tall. */
function readTurning(lab: Lab, fire: Fire, height: number): TurnReading {
  const frames = TURN_SIDES.map((side) => readFlames(lab, fire, turnShot(fire, side, height)));
  const alone = frames.map((frame) => frameStats(frame).alone);
  const width = frames[0].shown.width;
  const far = TURN_SIDES.indexOf(180);
  return { frames, alone, width, turning: turningOf(alone[0], alone[far], width) };
}

/** Whether flames seen from behind as `turning` says turn with the camera. */
const turnsWithCamera = (turning: Turning): boolean => !tooEven(turning)
  && (turning.mirrored < MIRROR_LEAST || turning.unmirrored >= turning.mirrored);

/** Whether flames seen as `turning` says are as even both ways as their mirror, so neither turned nor not. */
const tooEven = (turning: Turning): boolean => turning.even > EVEN_MOST;

/** How the flames compare seen from behind. */
function turningLine(turning: Turning): string {
  const even = tooEven(turning) ? `; too even to tell (${turning.even.toFixed(2)} alike its own mirror)` : '';
  return `  seen from behind, level from ${TURN_DISTANCE} m: its detail ${turning.mirrored.toFixed(2)} alike its `
    + `front's mirror (a flame's own from behind), ${turning.unmirrored.toFixed(2)} its front as it is${even}`;
}

/** The column round `fire` no plant may reach into, by its flames' `width` from beside them (m). */
function columnOf(fire: Fire, width: number): Column {
  return { x: fire.at.x, z: fire.at.z, base: fire.base, radius: width / 2 + PLANT_CLEAR, height: PLANT_HEIGHT };
}

/** `reaching` said, mesh by mesh. */
function reachingText(reaching: Reaching[]): string {
  const said = reaching.map((each) => `${each.name} (${counted(each.instances, 'instance')}, `
    + `${counted(each.points, 'point')})`);
  return said.join(', ');
}

/** The plants over `fire` as the last frame drew them, in `column`. */
function plantsLine(reaching: Reaching[], column: Column): string {
  const over = reaching.length ? reachingText(reaching) : 'none';
  return `  plants over it (${column.radius.toFixed(2)} m round its middle, up to ${column.height} m over its bed, `
    + `as the top-down view draws them): ${over}`;
}

/** The turning's and the plants' canaries: the far side's flames its near side's as they are, and a plant grown in
 *  the fire's middle; a problem each it missed. */
function roundCanaries(turned: TurnReading, group: THREE.Object3D, column: Column): string[] {
  const missed: string[] = [];
  // (flames too even to tell say nothing of a face shown twice either)
  const sameFace = turningOf(turned.alone[0], turned.alone[0], turned.width);
  if (!tooEven(turned.turning) && !turnsWithCamera(sameFace)) {
    missed.push('canary: the flames showing the same face from behind went unseen');
  }
  const uproot = plantIn(group, column);
  try {
    // (by its name: with plants already over the fire, any reaching passed it)
    const grown = reachingInto(group, G.camera, column).some((each) => each.name === CANARY_PLANT);
    if (!grown) missed.push('canary: the plant grown over the fire went unseen');
  } finally {
    uproot();
  }
  return missed;
}

/** `time` run with the game's camera on `shot` of `fire`, each of its renders drawing the frame as it stands. */
async function timedFrom<T>(lab: Lab, fire: Fire, shot: Shot, time: (draw: () => void) => Promise<T>): Promise<T> {
  const restore = aim(fire, shot);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    return await time(() => renderer.render());
  } finally {
    lab.drawing = drawing;
    restore();
  }
}

/** What the flames take of the GPU from beside them. */
function costLine(cost: FlameCost | null): string {
  if (!cost) return '  its flames\' cost on the GPU: untimed (the browser has no timer)';
  return `  its flames' cost on the GPU from beside them: the frame ${cost.shown.toFixed(2)} ms with them, `
    + `${cost.hidden.toFixed(2)} without (the median of ${cost.renders} renders each, in turns)`;
}

/** The cost's canary: the flames drawn four times over must cost `CANARY_COST_LEAST` times theirs or more; a problem
 *  if not. */
async function costCanary(lab: Lab, fire: Fire, shot: Shot, cost: FlameCost): Promise<string[]> {
  const single = cost.shown - cost.hidden;
  const planted = await timedFrom(lab, fire, shot, (draw) => canaryCost(G.renderer, fire.parts, draw));
  if (planted === null || planted <= 0 || planted < single * CANARY_COST_LEAST) {
    return [`canary: the flames drawn over went unseen (${planted?.toFixed(2)} ms against their own `
      + `${single.toFixed(2)})`];
  }
  return [];
}

/** The game's views of the fire with the hero before it, each as the player sees it, round the fire. */
async function viewsOf(lab: Lab, biome: BiomeId, fire: Fire, at: THREE.Vector2, facing: number): Promise<Pictured[]> {
  const corners = [-1, 1].flatMap((side) => [0, 1.8].map((rise) => {
    const across = new THREE.Vector3(-towardMiddle(fire).z, 0, towardMiddle(fire).x).multiplyScalar(side);
    return fire.at.clone().setY(fire.base + rise).add(across);
  }));
  const pictured: Pictured[] = [];
  for (const view of ['top', 'third', 'first'] as const) {
    await standIn(lab, { biome, view, facing, at: [at.x, at.y] });
    // (through the eyes the hero is the camera: round the fire alone)
    const round = view === 'first' ? corners : [...corners, G.player.pos];
    pictured.push(await lab.screen(`${biome}: ${view}`, [], screenArea(round)));
  }
  await standIn(lab, { biome, view: 'top', facing, at: [at.x, at.y] });
  renderer.setZoom(CAMERA.lobbyZoom);
  for (let i = 0; i < 3; i++) renderer.updateCamera(10, G.player.pos, lab.model.height);
  pictured.push(await lab.screen(`${biome}: lobby`, [], screenArea([...corners, G.player.pos])));
  renderer.setZoom(1);
  return pictured;
}

/** `lab fire` in one biome: its first fire read and pictured; its faults and the canaries missed are problems. */
export async function fire(lab: Lab, options: FireOptions): Promise<Report> {
  const { biome, seconds, canary } = options;
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  const fires = firesIn(biome);
  if (!fires.length) return { text: `${biome}: no fire`, problems: [`${biome}: no warm light, no fire found`] };
  const found = fires[0];
  const stand = new THREE.Vector2(found.at.x, found.at.z).addScaledVector(
    new THREE.Vector2(towardMiddle(found).x, towardMiddle(found).z), HERO_OFF);
  const facing = THREE.MathUtils.radToDeg(Math.atan2(found.at.x - stand.x, found.at.z - stand.y));
  await standIn(lab, { biome, view: 'top', facing, at: [stand.x, stand.y] });
  await lab.step(SETTLE_FRAMES);
  const fire = found;
  if (!fire.parts.length) return { text: `${biome}: no fire drawn`, problems: [`${biome}: its fire draws nothing`] };
  const shots = shotsOf(fire);
  const reading = await readOver(lab, fire, shots.beside, seconds);
  // (a second at least: flashes are counted in a second, and over half of one the strobe flashed twice)
  const lights = await screenLights(lab, Math.max(seconds, 1));
  const flashes = flashesIn(lights);
  // (the top-down view's last frame drawn: its culled plants are those it drew)
  const group = G.arena.groupOf(biome);
  const size = sizeOf(reading, shots.beside);
  const column = columnOf(fire, size.width);
  const plants = reachingInto(group, G.camera, column);
  const cost = options.cost
    ? await timedFrom(lab, fire, shots.beside, (draw) => flameCost(G.renderer, fire.parts, draw))
    : undefined;
  const turned = readTurning(lab, fire, size.height);
  const lines = [
    `${biome}: ${counted(fires.length, 'fire')}; the first at ${fire.at.x.toFixed(1)}, ${fire.at.z.toFixed(1)}, `
      + `its bed ${fire.base.toFixed(2)} m up, its own light drawn by ${counted(fire.parts.length, 'part')}`,
    ...shapeLines(reading, shots.beside),
    ...motionLines(reading),
    turningLine(turned.turning),
    plantsLine(plants, column),
    ...(cost === undefined ? [] : [costLine(cost)]),
    `  the top-down view flashed at most ${flashes} times in a second`,
  ];
  const problems = faultsOf(reading).map((fault) => `${biome}: ${fault}`);
  if (flashes >= FLASHES_MOST) problems.push(`${biome}: the screen flashed ${flashes} times in a second by the fire`);
  if (turnsWithCamera(turned.turning)) {
    problems.push(`${biome}: the fire turns with the camera (seen from behind, its detail `
      + `${turned.turning.unmirrored.toFixed(2)} alike its front, ${turned.turning.mirrored.toFixed(2)} its mirror)`);
  }
  if (plants.length) problems.push(`${biome}: plants reach over the fire: ${reachingText(plants)}`);
  if (canary) {
    problems.push(...readingCanaries(lab, fire, shots.beside, reading).map((missed) => `${biome}: ${missed}`));
    if (flashesIn(strobed(lights)) < FLASHES_MOST) problems.push(`${biome}: canary: the strobe went unseen`);
    problems.push(...roundCanaries(turned, group, column).map((missed) => `${biome}: ${missed}`));
    if (cost) {
      problems.push(...(await costCanary(lab, fire, shots.beside, cost)).map((missed) => `${biome}: ${missed}`));
    }
  }
  const above = readFire(lab, fire, shots.above);
  const flames = flamesOf(fire);
  const solids = solidsUnder(G.arena.groupOf(G.arena.biome), fire);
  const below = flames && inBowl(solids, fire) ? readFromBelow(lab, fire, flames, solids, canary) : null;
  if (below) {
    const found = belowFound(below, canary);
    lines.push(found.line);
    problems.push(...found.problems.map((problem) => `${biome}: ${problem}`));
  }
  const faded = flames ? fadeFrames(lab, fire, flames) : null;
  if (faded) {
    const found = fadeFound(readFade(faded, canary), canary);
    lines.push(found.line);
    problems.push(...found.problems.map((problem) => `${biome}: ${problem}`));
  } else if (flames) {
    problems.push(`${biome}: from beside it the flames' box is face-on: no hole's end across its faces alone`);
  }
  const logs = logsIn(G.arena.groupOf(G.arena.biome), fire);
  const overLogs = flames && logs.length && knowsLogs(flames) ? readFromAbove(lab, fire, flames, logs, canary) : null;
  if (overLogs) {
    const found = logsFound(overLogs, canary);
    lines.push(found.line);
    problems.push(...found.problems.map((problem) => `${biome}: ${problem}`));
  }
  const moments: Pictured[] = [
    {
      // (each tile says what it shows: the label names the pictures' files)
      label: `${biome}: close`,
      tiles: [
        ...reading.pictured.map((frame, at) => tileOf(frame.shown, `beside ${PICTURED_AT[at]} s`)),
        tileOf(aloneImage(reading.pictured[0]), 'its own light'),
        tileOf(above.shown, 'above'),
        ...(below ? [tileOf(below.image, 'below'), tileOf(below.found, 'below-found')] : []),
        ...(overLogs ? [tileOf(overLogs.image, 'over-logs'), tileOf(overLogs.unknownImage, 'over-logs-unknown'),
          tileOf(overLogs.found, 'over-logs-found')] : []),
      ],
      notes: lines.slice(1),
    },
    {
      label: `${biome}: round`,
      tiles: [
        ...turned.frames.map((frame, at) => tileOf(frame.shown, `from ${TURN_SIDES[at]}°`)),
        tileOf(aloneImage(turned.frames[0]), `their light alone from ${TURN_SIDES[0]}°`),
      ],
      notes: [turningLine(turned.turning)],
    },
    ...(await viewsOf(lab, biome, fire, stand, facing)),
  ];
  return { text: lines.join('\n'), problems, moments };
}
