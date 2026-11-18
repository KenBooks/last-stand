// `lab ui`'s `sitHint` state (`../uiKit.ts` `Steps`): the mouse rested on the nearest seat, the hint E Sit shown
// within the window, gone once it leaves (`../uiSitHint.ts`).
import { closeSitHint, openSitHint, sitHintClosed, sitHintShown } from '../uiSitHint';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

/** the canary's plant: the hint made clear over the seat outlined, caught as not shown */
const HIDDEN = { name: 'isn\'t shown', what: 'the hint hidden over a seat outlined' };

const STATE: Steps = {
  order: 115,
  open: openSitHint,
  close: closeSitHint,
  check: sitHintShown,
  closed: sitHintClosed,
  canary: caught(HIDDEN),
};
export default STATE;
