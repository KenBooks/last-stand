// The Rift Witch's model, registered for the game (its data: data/foes/witch.ts).
import { foeModels } from '../foeKit';
import { buildWitch } from '../models/witch';

foeModels({ witch: buildWitch });
