// `lab ui`'s `villageHudTouch` state (`../uiKit.ts` `Steps`): the village's HUD on touch (`../uiVillageHud.ts`).
import { closeVillageHud, openVillageHud, VILLAGE_HUD_CANARY, villageHudShown } from '../uiVillageHud';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 230,
  open: (lab) => openVillageHud(lab, true),
  close: closeVillageHud,
  check: villageHudShown,
  canary: caught(VILLAGE_HUD_CANARY),
};
export default STATE;
