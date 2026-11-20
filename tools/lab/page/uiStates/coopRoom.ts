// `lab ui`'s `coopRoom` state (`../uiKit.ts` `Steps`): the Play together dialog inside a room with host + partner cards.
import { closeCoopRoom, COOP_ROOM_CANARY, coopRoomShown, openCoopRoom } from '../uiCoopRoom';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 185,
  open: (lab) => openCoopRoom(lab, false),
  close: closeCoopRoom,
  check: (canary) => coopRoomShown('coopRoom', canary),
  canary: caught(COOP_ROOM_CANARY),
};
export default STATE;
