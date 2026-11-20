// `lab ui`'s `coopRoomTouch` state (`../uiKit.ts` `Steps`): the Play together dialog inside a room on touch.
import { closeCoopRoom, COOP_ROOM_CANARY, coopRoomShown, openCoopRoom } from '../uiCoopRoom';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 295,
  open: (lab) => openCoopRoom(lab, true),
  close: closeCoopRoom,
  check: (canary) => coopRoomShown('coopRoomTouch', canary),
  canary: caught(COOP_ROOM_CANARY),
};
export default STATE;
