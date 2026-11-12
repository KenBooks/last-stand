// Sculpts a side's hand off the main thread while the game loads (models/hands.ts `preloadHands`): the side is
// the worker's name.
import { COARSE_NAMED, sculptSide } from './hands';
import { packHand, setHandsCoarse } from './handShape';

// (a coarse hand waits for its simplifier to load: Very low's)
void setHandsCoarse(self.name.endsWith(COARSE_NAMED)).finally(() => {
  const { packed, buffers } = packHand(sculptSide(parseInt(self.name, 10)));
  self.postMessage(packed, { transfer: buffers });
});
