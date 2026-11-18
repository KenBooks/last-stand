// The Thornling's model, registered for the game (its data: data/foes/thornling.ts).
import { foeModels } from '../foeKit';
import { buildThornling } from '../models/thornling';

foeModels({ thornling: buildThornling });
