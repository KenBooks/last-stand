// The ale's buttons (game/drinkChoice.ts): Drink and Put down at the screen's foot while the hero holds a mug of the
// tavern's ale he hasn't drunk yet, shown and hidden each frame as the tavern offers the choice; a click or a tap picks
// (E and F are the tavern's own to hear). From Kenneth's round 3.
import { drinkChoice, type DrinkPick } from '../../../game/drinkChoice';
import { screen } from '../../screenKit';

let box: HTMLElement | null = null, shown = false;

screen({
  init() {
    box = document.getElementById('drink-choice');
    if (!box) return;
    for (const button of box.querySelectorAll<HTMLButtonElement>('.dc-btn')) {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        drinkChoice.choose(button.dataset.pick as DrinkPick);
        button.blur();
      });
      // (a press on a button is the button's, never the game's beneath it)
      button.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  },
  frame() {
    if (!box || shown === drinkChoice.shown) return;
    shown = drinkChoice.shown;
    box.classList.toggle('hidden', !shown);
  },
});
