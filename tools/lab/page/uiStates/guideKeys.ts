// `lab ui`'s `guideKeys` state (`../uiKit.ts` `Steps`): the guide's controls legends on a hero's page
// (`../uiGuideKeys.ts`).
import {
  closeGuideKeys, GUIDE_KEYS_CANARY, guideKeysPictures, guideKeysShown, openGuideKeys,
} from '../uiGuideKeys';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 45,
  open: openGuideKeys,
  close: closeGuideKeys,
  check: guideKeysShown,
  pictures: guideKeysPictures,
  canary: caught(GUIDE_KEYS_CANARY),
};
export default STATE;
