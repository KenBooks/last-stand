// `lab ui`'s `panelLinks` state (`../uiKit.ts` `Steps`): with --panels, the hero panel's row of links
// (`../uiPanelLinks.ts`).
import { VILLAGE } from '../../../../src/core/beta';
import { closePanelLinks, openPanelLinks, panelLinksShown } from '../uiPanelLinks';
import { PANEL_LINKS_CANARY } from '../uiReportCanaries';
import { asked, plantsCaught } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** The canary's row looked for, in the lobby without the village (which has no such row). */
function panelLinksCanary(found: Found, state: string): Found {
  if (VILLAGE) return { lines: [], problems: [] };
  return plantsCaught(found, state, [PANEL_LINKS_CANARY]);
}

const STATE: Steps = {
  order: 200,
  open: () => openPanelLinks(asked.canary),
  close: closePanelLinks,
  check: () => panelLinksShown('panelLinks'),
  canary: panelLinksCanary,
};
export default STATE;
