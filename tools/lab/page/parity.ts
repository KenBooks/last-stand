// `lab parity`: the same scenes pictured as the player sees them, for comparing what two renderers draw (`--renderers
// webgl,webgpu`): each biome's arena in a run's countdown, then the lobby's village at noon and at midnight from its
// places (the square, the hall's door and inside it, the training yard, a lamp, a cottage, the campfire), from above
// and over the shoulder. The pictures are the page's own (`lab.screen`, the browser's screenshot), as WebGPU's
// canvas can't be read back the way WebGL's is. It finds nothing itself: what differs is the A/B's verdict and the
// pictures beside each other (tools/lab/out/parity), each difference a look one renderer misses or draws otherwise.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS } from '../../../src/data/biomes';
import { CAMPFIRE, HALL, TERRACE, YARD } from '../../../src/data/village';
import { holdHour } from '../../../src/game/clock';
import { viewMode, type ViewMode } from '../../../src/core/renderer';
import { toVillage } from './village';
import { standFacing } from './villageHallOpens';
import { viewBy } from './villageHallCull';

/** Which scenes to picture (`--scenes`), every one by default. */
export interface ParityOptions { scenes?: string[]; hours?: number[] }

/** the frames each scene is given to settle before it's pictured (a lamp's flicker and the grass's ring settled) */
const SETTLE = 40;
/** the hours the village is pictured at: noon and midnight */
const HOURS = [12, 0];

/** A place in the village to stand at: where, facing which way (rad about y: 0 faces +z) and in which views. */
interface Place { name: string; x: number; z: number; facing: number; views: ViewMode[] }

/** the village's places pictured (each facing into what's there) */
const PLACES: Place[] = [
  { name: 'square', x: 0, z: 9, facing: Math.PI, views: ['top', 'third'] },
  { name: 'hallDoor', x: TERRACE.x, z: HALL.door + 3, facing: Math.PI, views: ['top', 'third'] },
  { name: 'hallInside', x: TERRACE.x, z: HALL.door - 6, facing: Math.PI, views: ['top'] },
  { name: 'yard', x: YARD.x, z: YARD.z - 2, facing: 0, views: ['top'] },
  { name: 'campfire', x: CAMPFIRE[0] + 2, z: CAMPFIRE[1] - 2, facing: -Math.PI * 0.75, views: ['third'] },
  { name: 'cottage', x: -14.2, z: 1.5, facing: Math.PI, views: ['top'] },
];

/** Whether `name` is among the scenes asked for. */
const wanted = (name: string, options: ParityOptions): boolean =>
  !options.scenes || options.scenes.some((scene) => name.includes(scene));

/** This moment pictured after it has settled, named `label`. */
async function picture(lab: Lab, label: string): Promise<Pictured> {
  await lab.step(SETTLE);
  return lab.screen(label, []);
}

/** Each biome's arena from the run's countdown, from above. */
async function biomes(lab: Lab, options: ParityOptions): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  for (const biome of BIOME_IDS) {
    if (!wanted(biome, options)) continue;
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    // (the biome shown in the village's place: set alone, the village stayed on screen)
    G.arena.showVillage(false);
    G.player.place(new THREE.Vector3(0, 0, 8), Math.PI);
    moments.push(await picture(lab, biome));
  }
  return moments;
}

/** The village's places at each hour, in each of their views. */
async function village(lab: Lab, options: ParityOptions): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const places = PLACES.filter((place) => wanted(place.name, options));
  if (!places.length) return moments;
  await toVillage(lab);
  for (const hour of options.hours ?? HOURS) {
    holdHour(hour);
    for (const place of places) {
      for (const view of place.views) {
        await viewBy(lab, view);
        await standFacing(lab, place.x, place.z, place.facing);
        moments.push(await picture(lab, `${place.name} ${view} ${hour}h`));
      }
    }
  }
  holdHour(null);
  return moments;
}

/** The scenes pictured, one after another. */
export async function parity(lab: Lab, options: ParityOptions): Promise<Report> {
  const kept = viewMode();
  const moments = [...await biomes(lab, options), ...await village(lab, options)];
  if (!moments.length) throw new Error(`lab: parity: no scene called ${options.scenes?.join(',')}`);
  await viewBy(lab, kept);
  const lines = moments.map((moment) => `pictured: ${moment.label}`);
  return { text: lines.join('\n'), problems: [], moments };
}
