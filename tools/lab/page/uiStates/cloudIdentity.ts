// `lab ui`'s `cloudIdentity` state (`../uiKit.ts` `Steps`): the save slots' account as the identity renderer shows it
// (`../uiCloudIdentity.ts`).
import { CLOUD_IDENTITY_CANARY, closeCloudIdentity, cloudIdentityChecked, openCloudIdentity } from '../uiCloudIdentity';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 120,
  open: openCloudIdentity,
  close: closeCloudIdentity,
  check: cloudIdentityChecked,
  canary: caught(CLOUD_IDENTITY_CANARY),
};
export default STATE;
