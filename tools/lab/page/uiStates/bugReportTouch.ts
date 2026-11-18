// `lab ui`'s `bugReportTouch` state (`../uiKit.ts` `Steps`): the bug report's form opened over a run by a finger, a
// panel laid over it by the canary (`../uiBugReport.ts`).
import type { Lab } from '../lab';
import {
  bugReportChecked, bugReportPictures, closeBugReportState, openBugReportTouch, useReportService,
} from '../uiBugReport';
import { BUG_REPORT_COVER_CANARY } from '../uiReportCanaries';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

/** The form opened, its Send sending to the lab's own reports service alone. */
async function openState(lab: Lab): Promise<void> {
  useReportService(asked.reports);
  await openBugReportTouch(lab, asked.canary);
}

const STATE: Steps = {
  order: 560,
  inRun: true,
  open: openState,
  close: closeBugReportState,
  check: (canary, lab) => bugReportChecked('bugReportTouch', lab, canary),
  pictures: async () => bugReportPictures(),
  canary: caught(BUG_REPORT_COVER_CANARY),
};
export default STATE;
