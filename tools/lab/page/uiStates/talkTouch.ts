// `lab ui`'s `talkTouch` state (`../uiKit.ts` `Steps`): Brother Hollis's talk on touch (`../uiTalk.ts`).
import { closeTalkState, openTalkState, TALK_CANARY, talkShown } from '../uiTalk';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 234,
  open: (lab) => openTalkState(lab, true),
  close: closeTalkState,
  check: (canary) => talkShown('talkTouch', canary),
  canary: caught(TALK_CANARY),
};
export default STATE;
