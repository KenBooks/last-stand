// The Training Dummy's model, registered for the game (its data: data/foes/dummy.ts).
import { foeModels } from '../foeKit';
import { buildDummy } from '../models/dummy';

foeModels({ dummy: buildDummy });
