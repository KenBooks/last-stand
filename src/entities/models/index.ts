// Model registry: id -> builder. Class and enemy data refer to these ids.
import { buildMage, mageSteps } from './mage';
import { buildWarrior, warriorSteps } from './warrior';
import { buildRanger, rangerSteps } from './ranger';
import { inOneStep, type ModelSteps } from './steps';
import { buildHusk } from './husk';
import { buildImp } from './imp';
import { buildWitch } from './witch';
import { buildBrute } from './brute';
import { buildDummy } from './dummy';
import { buildThornling } from './thornling';
import { buildMossback } from './mossback';
import { buildSporecaller } from './sporecaller';
import { buildTreant } from './treant';

import type { Model } from '../../types';

export const MODELS: Record<string, () => Model> = {
  mage: buildMage,
  warrior: buildWarrior,
  ranger: buildRanger,
  husk: buildHusk,
  imp: buildImp,
  witch: buildWitch,
  brute: () => buildBrute('brute'),
  colossus: () => buildBrute('colossus'),
  thornling: buildThornling,
  mossback: buildMossback,
  sporecaller: buildSporecaller,
  barkhulk: () => buildTreant('barkhulk'),
  thornheart: () => buildTreant('thornheart'),
  dummy: buildDummy,
};

/** the heroes' builds in pieces (models/steps.ts): built behind the lobby a piece a frame (game/hall.ts) */
const MODEL_STEPS: Record<string, () => ModelSteps> = { mage: mageSteps, warrior: warriorSteps, ranger: rangerSteps };

/** Model `id`'s build in pieces, one piece where it has none of its own. */
export function modelSteps(id: string): ModelSteps {
  const steps = MODEL_STEPS[id];
  return steps ? steps() : inOneStep(() => buildModel(id));
}

export function buildModel(id: string): Model {
  const b = MODELS[id];
  if (!b) throw new Error(`Unknown model "${id}"`);
  return b();
}
