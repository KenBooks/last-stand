// `lab ui`'s `bugReport` state (`../uiKit.ts` `Steps`): the bug report's form opened from the lobby's pause menu by the
// mouse, a report made and sent (`../uiBugReport.ts`).
import type { Lab } from '../lab';
import {
  bugReportChecked, bugReportPictures, closeBugReportState, openBugReport, useReportService,
} from '../uiBugReport';
import { BUG_REPORT_CANARY } from '../uiReportCanaries';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

/** The form opened, its Send sending to the lab's own reports service alone. */
async function openState(lab: Lab): Promise<void> {
  useReportService(asked.reports);
  await openBugReport(lab, asked.canary);
}

const STATE: Steps = {
  order: 190,
  open: openState,
  close: closeBugReportState,
  check: (canary, lab) => bugReportChecked('bugReport', lab, canary),
  pictures: async () => bugReportPictures(),
  canary: caught(BUG_REPORT_CANARY),
};
export default STATE;
