// The Cinder Brute's model, registered for the game (its data: data/foes/brute.ts).
import { foeModels } from '../foeKit';
import { buildBrute } from '../models/brute';

foeModels({ brute: () => buildBrute('brute') });
