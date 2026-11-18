// The Barkhide Hulk's model, registered for the game (its data: data/foes/barkhulk.ts).
import { foeModels } from '../foeKit';
import { buildTreant } from '../models/treant';

foeModels({ barkhulk: () => buildTreant('barkhulk') });
