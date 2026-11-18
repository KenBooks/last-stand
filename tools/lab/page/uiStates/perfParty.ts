// `lab ui`'s `perfParty` state (`../uiKit.ts` `Steps`): the performance overlay in a party (`../uiPerfParty.ts`).
import { closePerfParty, openPerfParty, PERF_PARTY_CANARY, perfPartyChecked } from '../uiPerfParty';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 370,
  inRun: true,
  open: (lab) => openPerfParty(lab, asked.canary),
  close: closePerfParty,
  check: perfPartyChecked,
  canary: caught(PERF_PARTY_CANARY),
};
export default STATE;
