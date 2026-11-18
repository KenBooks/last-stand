// Sculpts a side's hand of a build off the main thread while the game loads (models/hands.ts `preloadHands`): the
// side and build are the worker's name.
import { COARSE_NAMED, sculptSide, sideNamed } from './hands';
import { packHand, setHandsCoarse } from './handShape';

// (a coarse hand waits for its simplifier to load: Very low's)
void setHandsCoarse(self.name.endsWith(COARSE_NAMED)).finally(() => {
  const { s, build } = sideNamed(self.name);
  const { packed, buffers } = packHand(sculptSide(s, build));
  self.postMessage(packed, { transfer: buffers });
});
