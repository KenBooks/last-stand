// `lab ui`'s `tooltip` state (`../uiKit.ts` `Steps`): an item's tooltip over the lobby's left panel.
import { G } from '../../../../src/state';
import { hideTooltip, itemTooltip, showTooltipAt } from '../../../../src/ui/tooltip';
import type { Steps } from '../uiKit';

/** where the tooltip is opened, as shares of the window (the mouse over the lobby's left panel) */
const TOOLTIP_AT = { x: 0.18, y: 0.3 };

/** The tooltip of the hero's equipped weapon, opened where the mouse would be over the lobby's left panel. */
function openTooltip(): void {
  const weapon = G.profile.equipped.weapon;
  if (!weapon) throw new Error('lab: ui: the hero has no weapon equipped for the tooltip');
  showTooltipAt(itemTooltip(weapon)(), { clientX: innerWidth * TOOLTIP_AT.x, clientY: innerHeight * TOOLTIP_AT.y });
}

const STATE: Steps = {
  order: 20,
  open: openTooltip,
  close: hideTooltip,
};
export default STATE;
