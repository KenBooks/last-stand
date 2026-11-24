// `lab ui`'s `summarySkip` state (`../uiKit.ts` `Steps`, #734: "if a large amount of gear is claimed after banking,
// players should be able to click anywhere on the screen to skip the waiting time"; from the owner: "I would just speed
// up showing if too many items"): a bank of 90 items. Its reveal must end within `MOST_S` whatever the bag holds (the
// last chip's own delay), and a click on the summary's title as the caches open must open every one still to open:
// no chip's animation left running. Its canary leaves the click out, the chips still opening.
import { G } from '../../../../src/state';
import { makeItem } from '../../../../src/loot/items';
import { RARITIES } from '../../../../src/data/items';
import { hideSummary, showSummary, summaryRevealing } from '../../../../src/ui/menus';
import { plantsCaught, asked } from '../uiKit';
import type { Found, Steps } from '../uiKit';
import type { Item } from '../../../../src/types';

/** the bag banked: a long night's spoils */
const BAG = 90;
/** the most the whole reveal may take (s): the first cache's 0.3 and the game's `REVEAL_MOST` */
const MOST_S = 3.8;
/** the canary's plant, named in the problem it must cause */
const PLANT = 'the click left out';

let lastDelay = 0;
let wasRevealing = false;
/** the chips still opening right after the click (read then: the chips open on the browser's own clock, and by the
 *  check's turn, after the pictures, they had all opened anyway) */
let openingAfter = 0;

/** A bag of `BAG` items, the rarities in turn. */
function longBag(): Item[] {
  return Array.from({ length: BAG }, (_, i) => makeItem({ rarity: RARITIES[i % 5].id, ilvl: 12, cls: G.player.cls }));
}

/** The summary's chips still opening: each with an animation still running. */
function stillOpening(): number {
  const chips = [...document.querySelectorAll<HTMLElement>('#summary .sm-items .chip')];
  return chips.filter((chip) => chip.getAnimations().some((animation) => animation.playState === 'running')).length;
}

const STATE: Steps = {
  order: 485,
  inRun: true,
  async open(lab) {
    // (the reveal is the motion: with reduced motion asked for there's none, every chip shown at once)
    await lab.reduceMotion(false);
    showSummary({ outcome: 'banked', wave: 18, score: 91_220, kills: 702, bag: longBag() });
    const chips = [...document.querySelectorAll<HTMLElement>('#summary .sm-items .chip')];
    lastDelay = parseFloat(chips[chips.length - 1]?.style.animationDelay || '0');
    wasRevealing = summaryRevealing();
    if (!asked.canary) {
      const title = document.querySelector('#summary .sm-title')!.getBoundingClientRect();
      await lab.click({ x: title.left + title.width / 2, y: title.top + title.height / 2 });
    }
    openingAfter = stillOpening();
  },
  async close(lab) {
    hideSummary();
    await lab.reduceMotion(true);
  },
  check(): Found {
    const opening = openingAfter;
    const lines = [
      `  ${BAG} items: the last opens at ${lastDelay.toFixed(2)} s (at most ${MOST_S}); revealing as shown `
        + `${wasRevealing}; after a click on the title ${opening} still opening`,
    ];
    const problems: string[] = [];
    if (lastDelay > MOST_S) problems.push(`summarySkip: the last of ${BAG} items opens at ${lastDelay.toFixed(2)} s`);
    if (!wasRevealing) problems.push('summarySkip: the reveal never said it was under way');
    if (opening) problems.push(`summarySkip: ${opening} chips still opening after the click${asked.canary ? ` (${PLANT})` : ''}`);
    return { lines, problems };
  },
  canary: (found, state) => plantsCaught(found, state, [{ name: PLANT, what: PLANT }]),
};
export default STATE;
