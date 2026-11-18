// `lab ui`'s `heroes` state (`../uiKit.ts` `Steps`): the hero selection screen opened by Change hero
// (`../uiHeroes.ts`).
import {
  closeHeroes, heroesCanaryCaught, heroesClosed, heroesShown, heroLabelPictures, openHeroes,
} from '../uiHeroes';
import type { Found, Steps } from '../uiKit';

/** what the canary plants, for the report */
const PLANTED = 'Back over the heroes\' names, a card\'s traits moved, the choice off the hero, a glow by the '
  + 'hidden hero\'s hand, an item of his draggable and the save slot letting a click through';

/** The canary's plants looked for, all of them, where the tree has the hero selection screen. */
function heroesCanary(found: Found, state: string): Found {
  if (!document.getElementById('heroes')) return { lines: [], problems: [] };
  const caught = heroesCanaryCaught(found.problems);
  const lines = [`  canary: ${PLANTED} ${caught ? 'caught' : 'went unseen'}`];
  return { lines, problems: caught ? [] : [`${state}: the canary's ${PLANTED}: not all seen`] };
}

const STATE: Steps = {
  order: 60,
  open: openHeroes,
  close: closeHeroes,
  check: heroesShown,
  closed: heroesClosed,
  pictures: async () => heroLabelPictures(),
  canary: heroesCanary,
};
export default STATE;
