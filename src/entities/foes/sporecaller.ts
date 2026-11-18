// The Sporecaller's model, registered for the game (its data: data/foes/sporecaller.ts).
import { foeModels } from '../foeKit';
import { buildSporecaller } from '../models/sporecaller';

foeModels({ sporecaller: buildSporecaller });
