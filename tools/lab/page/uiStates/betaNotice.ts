// `lab ui`'s `betaNotice` state (`../uiKit.ts` `Steps`): the beta's notice as the game opens (`../uiBeta.ts`).
import { BETA_NOTICE_CANARY, betaNoticeHere, betaNoticeShown, closeBetaNotice, openBetaNotice } from '../uiBeta';
import { plantsCaught } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** The canary's plant looked for, where the tree shows the notice. */
function betaNoticeCanary(found: Found, state: string): Found {
  if (!betaNoticeHere()) return { lines: [], problems: [] };
  return plantsCaught(found, state, [BETA_NOTICE_CANARY]);
}

const STATE: Steps = {
  order: 160,
  open: openBetaNotice,
  close: closeBetaNotice,
  check: betaNoticeShown,
  canary: betaNoticeCanary,
};
export default STATE;
