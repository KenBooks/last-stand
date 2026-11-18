// Model registry: id -> builder. Class and enemy data refer to these ids (a foe's registered by its file in
// entities/foes/).
import { buildMage, mageSteps } from './mage';
import { buildWarrior, warriorSteps } from './warrior';
import { buildRanger, rangerSteps } from './ranger';
import { built, inOneStep, type ModelSteps } from './steps';
import type { HeadSpec } from './head';
import type { Model } from '../../types';

import { MODEL_BUILDERS } from '../foeKit';
import '../allFoes';

/** every model's builder by id: the heroes' here, each foe's added by its own file in entities/foes/ */
export const MODELS: Record<string, () => Model> = Object.assign(MODEL_BUILDERS, {
  mage: buildMage,
  warrior: buildWarrior,
  ranger: buildRanger,
});

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
  if (!b) throw new Error(`Unknown model "${id}" (a boss's is loaded at its wave: entities/bosses.ts loadFoe)`);
  return b();
}
