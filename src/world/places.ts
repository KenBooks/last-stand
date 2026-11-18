// The village's places of their own, each built by its file in world/places/ (its `build`, given the village as
// placeKit.ts says; its object, what the hero uses there, is its file in data/places/): a new place is a file in each
// folder, and touches neither world/village.ts nor a list. Built in their files' order where the village builds them,
// everything they add standing still but lights (world/village.ts `stillBuilt`).
import type { PlaceKit } from './placeKit';

/** each place's builder, by its file's name */
const BUILDS = import.meta.glob<(kit: PlaceKit) => void>('./places/*.ts', { eager: true, import: 'build' });

/** Every place built into the village. */
export function buildPlaces(kit: PlaceKit): void {
  for (const build of Object.values(BUILDS)) build(kit);
}
