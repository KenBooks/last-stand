// `lab ui`'s `villageMap` state (`../uiKit.ts` `Steps`): the village's map (`../uiVillageMap.ts`).
import {
  closeVillageMap, openVillageMap, VILLAGE_MAP_CANARY, VILLAGE_MAP_WALK_CANARY, villageMapShown,
} from '../uiVillageMap';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 210,
  open: openVillageMap,
  close: closeVillageMap,
  check: villageMapShown,
  canary: caught(VILLAGE_MAP_CANARY, VILLAGE_MAP_WALK_CANARY),
};
export default STATE;
