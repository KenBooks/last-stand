// The ale's buttons (game/drinkChoice.ts): Drink and Put down at the screen's foot while the hero holds a mug of the
// tavern's ale he hasn't drunk yet, shown and hidden each frame as the tavern offers the choice; a click or a tap picks
// (E and F are the tavern's own to hear). From Kenneth's round 3. And while the ale's boost waits for his next run, a
// line at the screen's top saying so (Kenneth's round 4: he hadn't noticed it).
import { drinkChoice, type DrinkPick } from '../../../game/drinkChoice';
import { aleBoost } from '../../../game/aleBoost';
import { ALE_BOOST } from '../../../data/tavern';
import { G } from '../../../state';
import { screen } from '../../screenKit';

let box: HTMLElement | null = null, shown = false, fortified: HTMLElement | null = null, toldWaiting = false;
/** each button's offer as last shown (E drinks, F puts it down): a button not on offer is greyed, its key hidden, so
 *  the screen never shows a second E beside a seat's or a villager's */
let drinkOn = true, downOn = true;

screen({
  init() {
    box = document.getElementById('drink-choice');
    fortified = document.getElementById('ale-fortified');
    const text = fortified?.querySelector('.af-text');
    if (text) text.textContent = `Fortified by ale: +${Math.round(ALE_BOOST.life * 100)}% health in your next run, for ${ALE_BOOST.waves} waves`;
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
    // (his boost told while it waits for his run, in the village: the run's HUD says it from the run's start)
    const waiting = aleBoost.waiting && G.mode === 'menu';
    if (fortified && waiting !== toldWaiting) {
      toldWaiting = waiting;
      fortified.classList.toggle('hidden', !waiting);
    }
    if (!box) return;
    if (drinkOn !== drinkChoice.eDrinks) {
      drinkOn = drinkChoice.eDrinks;
      box.querySelector('[data-pick="drink"]')?.classList.toggle('off', !drinkOn);
    }
    if (downOn !== drinkChoice.downable) {
      downOn = drinkChoice.downable;
      box.querySelector('[data-pick="down"]')?.classList.toggle('off', !downOn);
    }
    if (shown === drinkChoice.shown) return;
    shown = drinkChoice.shown;
    box.classList.toggle('hidden', !shown);
  },
});
