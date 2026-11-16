// Model registry: id -> builder. Class and enemy data refer to these ids.
import { buildMage, mageSteps } from './mage';
import { buildWarrior, warriorSteps } from './warrior';
import { buildRanger, rangerSteps } from './ranger';
import { built, inOneStep, type ModelSteps } from './steps';
import type { HeadSpec } from './head';
import { buildHusk } from './husk';
import { buildImp } from './imp';
import { buildWitch } from './witch';
import { buildBrute } from './brute';
import { buildDummy } from './dummy';
import { buildThornling } from './thornling';
import { buildMossback } from './mossback';
import { buildSporecaller } from './sporecaller';
import { buildTreant } from './treant';
import { buildBellWarden } from './bellWarden';
import { buildCantor } from './cantor';
import { buildTwinReliquary, buildTwinSlab } from './twins';

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
  bellwarden: buildBellWarden,
  cantor: buildCantor,
  twinslab: buildTwinSlab,
  twinreliquary: buildTwinReliquary,
  thornling: buildThornling,
  mossback: buildMossback,
  sporecaller: buildSporecaller,
  barkhulk: () => buildTreant('barkhulk'),
  thornheart: () => buildTreant('thornheart'),
  dummy: buildDummy,
};

/** the heroes' builds in pieces (models/steps.ts): built behind the lobby a piece a frame (game/hall.ts); each given
 *  his head (his look), or the one picked in the slot in play */
const MODEL_STEPS: Record<string, (look?: HeadSpec) => ModelSteps> = { mage: mageSteps, warrior: warriorSteps, ranger: rangerSteps };

/** Model `id`'s build in pieces, one piece where it has none of its own; a hero's with head `look` (none: his look in
 *  the slot in play, `headFor`). */
export function modelSteps(id: string, look?: HeadSpec): ModelSteps {
  const steps = MODEL_STEPS[id];
  return steps ? steps(look) : inOneStep(() => buildModel(id));
}

export function buildModel(id: string, look?: HeadSpec): Model {
  const steps = MODEL_STEPS[id];
  if (steps) return built(steps(look));
  const b = MODELS[id];
  if (!b) throw new Error(`Unknown model "${id}"`);
  return b();
}
