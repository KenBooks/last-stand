// The choice a hero holding a mug of the tavern's ale has (from Kenneth's round 3: "temporary buttons at the bottom of
// the screen to put the drink down or drink it"): drink it, or put it down on the bar or the table he's by. The tavern
// (world/tavernKeeper.ts) offers it and hears its keys (E, F); its buttons are the drink screen's
// (ui/screens/drink/), which reads this and calls `choose` on a click or a tap. Nothing else; it imports nothing.

/** What the drink's buttons choose. */
export type DrinkPick = 'drink' | 'down';

/** the choice now: whether it's offered, and the tavern's hand for what's picked */
export const drinkChoice = {
  shown: false,
  choose: (pick: DrinkPick): void => {
    void pick;
  },
};
