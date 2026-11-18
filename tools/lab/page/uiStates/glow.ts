// `lab ui`'s `glow` state (`../uiKit.ts` `Steps`): the stash's items lit for a hovered item's slot (`../uiGlow.ts`).
import { closeGlow, GLOW_CANARIES, glowPictures, glowShown, openGlow } from '../uiGlow';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 30,
  open: openGlow,
  close: closeGlow,
  check: glowShown,
  pictures: glowPictures,
  canary: caught(...Object.values(GLOW_CANARIES)),
};
export default STATE;
