// `lab ui`'s `heroesWarming` state (`../uiKit.ts` `Steps`): the hero selection screen while the heroes warm
// (`../uiHeroesWarming.ts`).
import {
  closeHeroesWarming, HEROES_WARMING_CANARY, heroesWarmingShown, openHeroesWarming,
} from '../uiHeroesWarming';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 240,
  open: openHeroesWarming,
  close: closeHeroesWarming,
  check: heroesWarmingShown,
  canary: caught(HEROES_WARMING_CANARY),
};
export default STATE;
