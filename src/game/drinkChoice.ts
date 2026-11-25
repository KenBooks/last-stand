// The choice a hero holding a mug of the tavern's ale has (from Kenneth's round 3: "temporary buttons at the bottom of
// the screen to put the drink down or drink it"): drink it, or put it down on the bar or the table he's by. The tavern
// (world/tavernKeeper.ts) offers it and hears its keys (E, F); its buttons are the drink screen's
// (ui/screens/drink/), which reads this and calls `choose` on a click or a tap. Nothing else; it imports nothing.

/** What the drink's buttons choose. */
export type DrinkPick = 'drink' | 'down';

/** the choice now: whether it's offered, and the tavern's hand for what's picked */
export const drinkChoice = {
  shown: false,
  /** whether E drinks now: not while the pointer is on a seat or a thing E uses (a stool's E Sit, Bertram's E Talk),
   *  which E is then (Kenneth's round 5: "if mouse is over seat and you press E, is instead has you sit down") */
  eDrinks: true,
  /** whether F puts it down now: a top in his reach (Kenneth's round 5: on the nearest table, at his side of it) */
  downable: true,
  choose: (pick: DrinkPick): void => {
    void pick;
  },
};
