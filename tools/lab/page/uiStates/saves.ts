// `lab ui`'s `saves` state (`../uiKit.ts` `Steps`): the save slots.
import { openSaves } from '../../../../src/ui/saves';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 50,
  open: () => openSaves(true),
  close: () => openSaves(false),
};
export default STATE;
