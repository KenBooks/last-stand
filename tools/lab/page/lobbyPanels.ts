// The lobby's panels opened for a `ui` state, as the village opens them: the stash is the chest's alone and the
// inventory is I's (on touch, the Bag button's), so a state that pictures them opens them first and puts back what
// showed after. A tree from before the village always shows them, and has nothing to open.
import * as menus from '../../../src/ui/menus';

/** The village's way to show the lobby's panels, or undefined in a tree from before it. */
interface PanelControls {
  panelsOpen?: () => menus.Panels;
  openPanels?: (open: menus.Panels) => void;
}

/** what the panels showed before the first `showPanels` since the last `panelsBack` (undefined: nothing to put back) */
let before: menus.Panels | undefined;

/** The lobby's panels shown as `open` (the chest's, with the stash; the inventory), what showed before them kept. */
export function showPanels(open: menus.Panels): void {
  const controls = menus as PanelControls;
  if (!controls.panelsOpen || !controls.openPanels) return;
  if (before === undefined) before = controls.panelsOpen();
  controls.openPanels(open);
}

/** The lobby's panels as they were before `showPanels`. */
export function panelsBack(): void {
  const controls = menus as PanelControls;
  if (before === undefined || !controls.openPanels) return;
  controls.openPanels(before);
  before = undefined;
}
