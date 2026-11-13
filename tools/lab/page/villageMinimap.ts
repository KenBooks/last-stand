// tools/lab village `minimapOut`: the village's minimap as the fights have it, the training's tracker in its column.
// From play: "move training checklist to the right below minimap, and yes, we need a minimap in wardenhollow too".
// It reads what the page shows: the minimap's canvas (the hero's arrow where the hero is, as the camera has it turned,
// at two spots) and the boxes of the minimap and the tracker; out on the square and in the yard, with the bottom bar in
// the yard alone, and put away with the inventory. Its canary reads the arrow half a turn off and sets the tracker
// over the minimap.
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { cameraYaw } from '../../../src/core/renderer';
import { restartTraining, skipTraining } from '../../../src/game/training';
import { openPanels } from '../../../src/ui/menus';
import { villageMinimapScale } from '../../../src/ui/villageMinimap';

/** the minimap's canvas across (px) */
const WIDTH = 200;
/** how far round where the hero's arrow should be its colour is looked for (px of the canvas) */
const ARROW_NEAR = 3;
/** how much green over red and blue says a pixel is the hero's arrow (#6dffb0) */
const ARROW_GREEN = 60;
/** the least share of the canvas the village must cover */
const LEAST_DRAWN = 0.15;
/** the most the tracker may stand under the minimap, in the minimap's own widths */
const MOST_BELOW = 0.2;
/** frames for a change of the minimap's or the panels' to show */
const SHOW_FRAMES = 15;

/** What a measure asks of the village's walking: the hero stood at a spot and the frames run. */
export type Stand = (spot: [number, number]) => Promise<void>;

/** What this check found, as the village's checks say it. */
export interface MinimapChecked {
  lines: string[];
  problems: string[];
  caught: boolean | null;
  moments: Pictured[];
}

/** Whether the page shows `selector`'s element. */
function shows(selector: string): boolean {
  return document.querySelector<HTMLElement>(selector)!.checkVisibility();
}

/** The minimap's pixels as they stand. */
function minimapPixels(): ImageData {
  const canvas = document.querySelector<HTMLCanvasElement>('#minimap')!;
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

/** Whether (x, y) of the canvas has the arrow's green near it. */
function arrowAt(pixels: ImageData, x: number, y: number): boolean {
  for (let v = Math.round(y) - ARROW_NEAR; v <= y + ARROW_NEAR; v++) {
    for (let u = Math.round(x) - ARROW_NEAR; u <= x + ARROW_NEAR; u++) {
      if (u < 0 || v < 0 || u >= pixels.width || v >= pixels.height) continue;
      const at = (v * pixels.width + u) * 4;
      const [red, green, blue] = [pixels.data[at], pixels.data[at + 1], pixels.data[at + 2]];
      if (green - red > ARROW_GREEN && green > blue && pixels.data[at + 3] > 200) return true;
    }
  }
  return false;
}

/** Where the hero should show on the canvas, the camera's turn `extra` radians off. */
function heroOnCanvas(extra: number): [number, number] {
  const scale = villageMinimapScale(WIDTH);
  const x = G.player.pos.x * scale;
  const z = G.player.pos.z * scale;
  const yaw = cameraYaw() + extra;
  return [WIDTH / 2 + x * Math.cos(yaw) - z * Math.sin(yaw), WIDTH / 2 + x * Math.sin(yaw) + z * Math.cos(yaw)];
}

/** The share of the canvas drawn on. */
function shareDrawn(pixels: ImageData): number {
  let drawn = 0;
  for (let at = 3; at < pixels.data.length; at += 4) {
    if (pixels.data[at] > 0) drawn++;
  }
  return drawn / (pixels.width * pixels.height);
}

/** The tracker against the minimap, as boxes: its problems. */
function trackerBelow(): string[] {
  const map = document.querySelector('#minimap')!.getBoundingClientRect();
  const tracker = document.querySelector('#training')!.getBoundingClientRect();
  const problems: string[] = [];
  if (tracker.top < map.bottom) problems.push('the tracker lies over the minimap');
  if (tracker.top - map.bottom > map.width * MOST_BELOW) problems.push('the tracker stands far under the minimap');
  if (tracker.left < innerWidth / 2) problems.push('the tracker is on the left of the screen');
  if (tracker.right > innerWidth || tracker.bottom > innerHeight) problems.push('the tracker reaches past the window');
  return problems;
}

/** The arrow at the hero, the village drawn and the state's parts out as they should be: its problems. */
function atSpot(where: string, yardBar: boolean, extra = 0): string[] {
  const problems: string[] = [];
  if (!shows('#minimap')) problems.push(`${where}: the minimap isn't out`);
  if (shows('#bottombar') !== yardBar) problems.push(`${where}: the bottom bar ${yardBar ? 'is missing' : 'is out'}`);
  if (shows('.objectives') || shows('#spoils')) problems.push(`${where}: a run's objectives or spoils show`);
  const title = document.querySelector('.mm-title')!.textContent;
  if (title !== 'Wardenhollow') problems.push(`${where}: the minimap is titled "${title}"`);
  const pixels = minimapPixels();
  if (shareDrawn(pixels) < LEAST_DRAWN) problems.push(`${where}: the village isn't drawn on the minimap`);
  const [x, y] = heroOnCanvas(extra);
  if (!arrowAt(pixels, x, y)) problems.push(`${where}: no arrow where the hero is (${x.toFixed(0)}, ${y.toFixed(0)})`);
  return problems;
}

/** The minimap out in the village as a run has it, the tracker in its column. */
export async function minimapOut(
  lab: Lab,
  stand: Stand,
  yard: [number, number],
  canary: boolean,
): Promise<MinimapChecked> {
  restartTraining();
  await stand([0, 9]);
  await lab.step(SHOW_FRAMES);
  const problems: string[] = [...atSpot('on the square', false), ...trackerBelow()];
  const onSquare = await lab.screen('the tracker over the square, its words over the world', []);
  const squareAt = heroOnCanvas(0).map((v) => v.toFixed(0)).join(', ');
  const wrongTurn = atSpot('on the square', false, Math.PI).some((problem) => problem.includes('no arrow'));
  const tracker = document.querySelector<HTMLElement>('#training')!;
  tracker.style.order = '-1';
  const wrongPlace = trackerBelow().some((problem) => problem.includes('over the minimap'));
  tracker.style.order = '';
  await stand(yard);
  await lab.step(SHOW_FRAMES);
  problems.push(...atSpot('in the yard', true));
  const yardAt = heroOnCanvas(0).map((v) => v.toFixed(0)).join(', ');
  const inYard = await lab.screen('the tracker over the yard', []);
  openPanels('inventory');
  await lab.step(SHOW_FRAMES);
  if (shows('#minimap') || shows('#training')) problems.push('the minimap or the tracker shows over the inventory');
  openPanels(null);
  await lab.step(SHOW_FRAMES);
  if (!shows('#minimap')) problems.push('the minimap stayed away after the inventory');
  restartTraining();
  skipTraining();
  const lines = [`minimap: the hero's arrow at ${squareAt} on the square and ${yardAt} in the yard; `
    + `the tracker under it, ${problems.length} problems`];
  const moments = canary ? [] : [onSquare, inYard];
  return { lines, problems: canary ? [] : problems, caught: canary ? wrongTurn && wrongPlace : null, moments };
}
