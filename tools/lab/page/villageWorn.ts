// `lab village`'s worn item clicked (from play, "clicking an item on character in I mode teleports it to stash, it
// should not happen"): with the inventory by I a click leaves it on him, as no stash is at hand; at the chest, with the
// stash beside it, it goes there. `canary` clicks it at the chest and reads it as the inventory, which must be found.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { equipFromStash } from '../../../src/loot/profile';
import { openPanels, type Panels } from '../../../src/ui/menus';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';
import type { Slot } from '../../../src/types';

/** The first slot the hero wears something in. */
function wornSlot(): Slot {
  const worn = Object.entries(G.profile.equipped).find(([, item]) => item);
  if (!worn) throw new Error('lab: village: the hero wears nothing to click');
  return worn[0] as Slot;
}

/** Whether a click on what's worn in `slot` left it on him, with `panels` open. */
async function stayedOn(lab: Lab, slot: Slot, panels: Panels): Promise<boolean> {
  openPanels(panels);
  const worn = document.querySelector<HTMLElement>(`.eslot[data-slot="${slot}"]`);
  if (!worn) throw new Error(`lab: village: no ${slot} slot on the page`);
  await lab.clickOn(worn);
  return Boolean(G.profile.equipped[slot]);
}

/** A worn item clicked in the inventory stays on him, and at the chest goes to the stash. */
export async function wornStaysOn(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, 'top');
  const slot = wornSlot();
  const item = G.profile.equipped[slot]!;
  try {
    const byI = await stayedOn(lab, slot, canary ? 'chest' : 'inventory');
    const atChest = canary ? byI : await stayedOn(lab, slot, 'chest');
    const line = `a worn ${slot} clicked: by I ${byI ? 'stays on him' : 'goes to the stash'}, `
      + `at the chest ${atChest ? 'stays on him' : 'goes to the stash'}`;
    if (canary) return { lines: [line], problems: [], caught: !byI, moments: [] };
    const fine = byI && !atChest;
    return { lines: [line], problems: fine ? [] : [line], caught: null, moments: [] };
  } finally {
    if (!G.profile.equipped[slot]) equipFromStash(G.profile, item.id);
    openPanels(null);
  }
}
