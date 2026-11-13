// `lab village`'s objects used again where the hero stands: each object with a dialog or a card of its own used by E,
// put away by its own button, and used by E again without a step (from play, "when I press got it, I cannot press E
// again until I move away, might affect other objects too": How to play's Got it hid it, and the village still held the
// notice board as open until he walked off it; the campfire's Close the same, left out here: its dialog asks the relay
// server how it is, which the lab's page can't reach). `canary` leaves the second press out for the first object,
// which must then be found closed. And each put away by E itself ("lets add option to dismiss with E as well"), and
// opened by E after that; its canary leaves that press out for the first, which must be found open.
import * as THREE from 'three';
import type { Lab } from './lab';
import { untilInRealTime } from './villageWaits';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { villageObject } from '../../../src/game/village';
import type { LightsChecked } from './villageLights';

/** frames left after a press or a click for the page to follow it */
const SETTLE = 15;

/** An object, the element it opens and the button that puts it away. */
interface Opened { id: string; shows: string; close: string }

/** the objects whose dialog or card has a button of its own */
const OPENED: readonly Opened[] = [
  { id: 'notice', shows: '#help', close: '#btn-help-close' },
  { id: 'chronicle', shows: '#vcard', close: '#vcard .vc-close' },
  // (from play, "escape from choose hero does not reenable E hint until I move away and back")
  { id: 'hall', shows: '#heroes', close: '#heroes .hs-back' },
];

const shown = (selector: string): boolean => !document.querySelector(selector)?.classList.contains('hidden');

/** the frames what E opens is given to show (the hall's screen comes once its heroes are prepared, by the page's own
 *  time) */
const OPEN_FRAMES = 600;

/** E pressed, and the frames after it; with `shows`, until what it opens shows (`villageWaits.ts`). */
async function pressE(lab: Lab, shows?: string): Promise<void> {
  await lab.step(1, () => ({ keys: ['e'] }));
  if (shows) await untilInRealTime(lab, () => shown(shows), OPEN_FRAMES);
  await lab.step(SETTLE);
}

/** `o` used by E, put away by its button and used by E again: what of it went wrong, if anything. */
async function usedAgain(lab: Lab, o: Opened, skipSecond: boolean): Promise<string | null> {
  const object = villageObject(o.id);
  if (!object) return `${o.id}: no such object`;
  const [x, z] = object.stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  await pressE(lab, o.shows);
  if (!shown(o.shows)) return `${o.id}: E never opened it`;
  (document.querySelector(o.close) as HTMLElement | null)?.click();
  await lab.step(SETTLE);
  if (shown(o.shows)) return `${o.id}: its button never put it away`;
  if (!skipSecond) await pressE(lab, o.shows);
  const again = shown(o.shows);
  (document.querySelector(o.close) as HTMLElement | null)?.click();
  await lab.step(SETTLE);
  return again ? null : `${o.id}: put away by its button, E never opened it again where he stood`;
}

/** `o` used by E, put away by E and used by E again: what of it went wrong, if anything. */
async function putAwayByE(lab: Lab, o: Opened, skipPress: boolean): Promise<string | null> {
  const object = villageObject(o.id);
  if (!object) return `${o.id}: no such object`;
  const [x, z] = object.stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  await pressE(lab, o.shows);
  if (!shown(o.shows)) return `${o.id}: E never opened it`;
  if (!skipPress) await pressE(lab);
  const left = shown(o.shows);
  await pressE(lab, o.shows);
  const again = shown(o.shows);
  (document.querySelector(o.close) as HTMLElement | null)?.click();
  await lab.step(SETTLE);
  if (left) return `${o.id}: E never put it away`;
  return again ? null : `${o.id}: put away by E, E never opened it again`;
}

/** Each object with a button of its own used, put away and used again. */
export async function objectsUsedAgain(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const failed: string[] = [];
  for (const [i, o] of OPENED.entries()) {
    const failure = await usedAgain(lab, o, canary && i === 0);
    if (failure) failed.push(failure);
  }
  // (the hall's screen too, from play, "in hall of heroes pressing E should cancel back, same like other E
  // interactions")
  const dismissed = OPENED;
  for (const [i, o] of dismissed.entries()) {
    const failure = await putAwayByE(lab, o, canary && i === 0);
    if (failure) failed.push(failure);
  }
  const all = OPENED.length + dismissed.length;
  const line = `used again: ${all - failed.length} of ${all}: opened by E after their own button, put away by E`;
  if (canary) return { lines: [line], problems: [], caught: failed.length > 0, moments: [] };
  return { lines: [line], problems: failed.map((f) => `used again: ${f}`), caught: null, moments: [] };
}
