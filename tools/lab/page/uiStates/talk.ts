// `lab ui`'s `talk` state (`../uiKit.ts` `Steps`): Brother Hollis's talk (`../uiTalk.ts`).
import { closeTalkState, openTalkState, TALK_CANARY, talkShown } from '../uiTalk';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 232,
  open: (lab) => openTalkState(lab, false),
  close: closeTalkState,
  check: (canary) => talkShown('talk', canary),
  canary: caught(TALK_CANARY),
};
export default STATE;
