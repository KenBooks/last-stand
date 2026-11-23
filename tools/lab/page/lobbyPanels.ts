// The lobby's panels opened for a `ui` state, as the village opens them: the stash is the chest's alone and the
// inventory is I's (on touch, the Bag button's), so a state that pictures them opens them first and puts back what
// showed after.
import { openPanels, panelsOpen, type Panels } from '../../../src/ui/menus';

/** what the panels showed before the first `showPanels` since the last `panelsBack` (undefined: nothing to put back) */
let before: Panels | undefined;

/** The lobby's panels shown as `open` (the chest's, with the stash; the inventory), what showed before them kept. */
export function showPanels(open: Panels): void {
  if (before === undefined) before = panelsOpen();
  openPanels(open);
}

/** The lobby's panels as they were before `showPanels`. */
export function panelsBack(): void {
  if (before === undefined) return;
  openPanels(before);
  before = undefined;
}
