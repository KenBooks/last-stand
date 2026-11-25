// The village drawn with nothing thinned, for a check's frame to compare with as the game thins it: the game's own
// shares let go (`thinningLetGo` in core/seeThrough.ts) and the engine's house rule opening nothing
// (`rust.housesWhole`, engine/seeKinds.ts). From above a house's walls, roofs and the hall's parts are covers, whose
// shares the engine writes over with the rule's (src/engine/AGENTS.md, a house from above), so with the game's held
// alone the two frames were the same: `lab village`'s hall walls read "0 of 98 places thinned" at every stand.
import { thinningLetGo } from '../../../src/core/seeThrough';
import { RUST } from '../../../src/engine';

/** Nothing thinned, at once, and a function that puts it back. */
export function nothingThinned(): () => void {
  const giveBack = thinningLetGo();
  const housesWhole = RUST.tune.housesWhole;
  RUST.tune.housesWhole = 1;
  return () => {
    RUST.tune.housesWhole = housesWhole;
    giveBack();
  };
}
