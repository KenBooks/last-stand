// The Hollow Colossus's model (the Cinder Brute's, grown), registered for the game (its data: data/foes/colossus.ts).
import { foeModels } from '../foeKit';
import { buildBrute } from '../models/brute';

foeModels({ colossus: () => buildBrute('colossus') });
