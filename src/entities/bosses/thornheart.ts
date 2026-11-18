// The Elder Thornheart's model (the Barkhide Hulk's, grown), registered for the game (its data: data/foes/thornheart.ts).
import { foeModels } from '../foeKit';
import { buildTreant } from '../models/treant';

foeModels({ thornheart: () => buildTreant('thornheart') });
