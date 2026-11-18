// `lab ui`'s `decision` state (`../uiKit.ts` `Steps`): the bank-or-continue choice after a wave (`../uiDecision.ts`).
import { showDecision } from '../../../../src/ui/hud';
import { closeDecision, DECISION_CANARY, decisionShown } from '../uiDecision';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 380,
  inRun: true,
  open: showDecision,
  close: closeDecision,
  check: decisionShown,
  canary: caught(DECISION_CANARY),
};
export default STATE;
