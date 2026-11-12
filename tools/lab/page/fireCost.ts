// tools/lab fire's cost: what a fire's flames take of the GPU close up, where they fill much of the screen (the top-down
// view's few pixels of them cost less than the timer's noise), the frame timed with the flames drawn and without, in
// turns (`gpuTurns.ts`). Its canary draws the flames four times over, which must read as more.
import * as THREE from 'three';
import { costInTurns } from './gpuTurns';

/** The frame's median time on the GPU (ms) with the flames drawn and without. */
export interface FlameCost {
  shown: number;
  hidden: number;
  /** what the turn takes: the median of each round's own difference, its two turns drawn back to back
   *  (`costInTurns`' `takes`: what else uses the GPU drifts within a run, and two whole sides' medians read parts as
   *  costing less than nothing) */
  apart: number;
  /** the renders each side was timed over */
  renders: number;
}

/** the flames drawn this many times over by the canary, and how many times the flames' own cost it must read */
const CANARY_TIMES = 4;
export const CANARY_COST_LEAST = 2;

/** The frame's median time on the GPU with `turn` given true and false, in turns (it's left true); null where the
 *  browser times nothing. `draw` renders the frame as it stands. */
export async function turnCost(renderer: THREE.WebGLRenderer, turn: (on: boolean) => void, draw: () => void):
  Promise<FlameCost | null> {
  const cost = await costInTurns(renderer, turn, draw);
  return cost && { shown: cost.on, hidden: cost.off, apart: cost.takes, renders: cost.renders };
}

/** What `parts` take of the GPU as `draw` renders the frame, drawn and not in turns; null where the browser times
 *  nothing. `draw` renders the frame as it stands, its camera on the flames. */
export function flameCost(renderer: THREE.WebGLRenderer, parts: THREE.Object3D[], draw: () => void):
  Promise<FlameCost | null> {
  const show = (on: boolean): void => {
    for (const part of parts) part.visible = on;
  };
  return turnCost(renderer, show, draw);
}

/** The canary's flames: `parts` drawn `CANARY_TIMES` over (copies sharing their geometry and material, so nothing
 *  compiles), timed as `flameCost` times them; what they took over the frame without them, or null. */
export async function canaryCost(renderer: THREE.WebGLRenderer, parts: THREE.Object3D[], draw: () => void):
  Promise<number | null> {
  const copies = parts.flatMap((part) => Array.from({ length: CANARY_TIMES - 1 }, () => {
    const copy = part.clone();
    part.parent!.add(copy);
    return copy;
  }));
  try {
    const cost = await flameCost(renderer, [...parts, ...copies], draw);
    return cost ? cost.shown - cost.hidden : null;
  } finally {
    for (const copy of copies) copy.removeFromParent();
  }
}
