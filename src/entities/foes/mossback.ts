// The Mossback's model, registered for the game (its data: data/foes/mossback.ts).
import { foeModels } from '../foeKit';
import { buildMossback } from '../models/mossback';

foeModels({ mossback: buildMossback });
