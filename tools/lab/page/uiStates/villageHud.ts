// `lab ui`'s `villageHud` state (`../uiKit.ts` `Steps`): the village's HUD (`../uiVillageHud.ts`).
import { closeVillageHud, openVillageHud, VILLAGE_HUD_CANARY, villageHudShown } from '../uiVillageHud';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 220,
  open: (lab) => openVillageHud(lab, false),
  close: closeVillageHud,
  check: villageHudShown,
  canary: caught(VILLAGE_HUD_CANARY),
};
export default STATE;
