// `lab ui`'s `panelLinksTouch` state (`../uiKit.ts` `Steps`): with --panels, the hero panel's row of links on touch
// (`../uiPanelLinks.ts`).
import { VILLAGE } from '../../../../src/core/beta';
import type { Lab } from '../lab';
import { closePanelLinks, openPanelLinks, panelLinksShown } from '../uiPanelLinks';
import { PANEL_LINKS_CANARY } from '../uiReportCanaries';
import { touchMode } from '../uiTouch';
import { asked, plantsCaught } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** The page put in touch mode, then the row of links opened. */
async function openPanelLinksTouch(lab: Lab): Promise<void> {
  await touchMode(lab);
  openPanelLinks(asked.canary);
}

/** The canary's row looked for, in the lobby without the village (which has no such row). */
function panelLinksCanary(found: Found, state: string): Found {
  if (VILLAGE) return { lines: [], problems: [] };
  return plantsCaught(found, state, [PANEL_LINKS_CANARY]);
}

const STATE: Steps = {
  order: 300,
  open: openPanelLinksTouch,
  close: closePanelLinks,
  check: () => panelLinksShown('panelLinksTouch'),
  canary: panelLinksCanary,
};
export default STATE;
