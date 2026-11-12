// The village walked from place to place as a player goes about it (tools/stalls, `--scenario walks`): the map
// opened with M and a place's name clicked, the hero walking there of himself and using it, then its card or screen
// put away and the next one picked. From the owner: "make sure to test walks to various areas, ensure no freezes".
import { markPhase } from './page.mjs';

/** the places walked to in turn, by the map's names (`data-use`), each across the village from the one before */
export const STOPS = ['yard', 'heroes', 'stash', 'portal:crypt', 'chronicle', 'coop', 'portal:forest', 'help', 'yard'];
/** the query the page is loaded with unless the command gives URLs: the hero walks of himself this many times his
 *  speed (`WALK_PACE` in `entities/player.ts`), so a round takes seconds where it took a minute and a half */
export const WALKS_QUERY = '?walkPace=3';
/** how long a walk may take to arrive (ms: the village is about 90 m across, the hero walks about 5 m a second) */
const ARRIVE_MS = 30_000;
/** how long the yard, which opens nothing, is walked towards (ms: across it at three times his pace) */
const YARD_MS = 3500;
/** how long each place is stood at before its card is put away, and how long the map may take to lie flat (ms) */
const STAY_MS = 500;
const MAP_MS = 3000;
/** how long a key is held for a tap (ms), as a finger holds it */
const TAP_MS = 90;

/**
 * Walks the village from place to place (`STOPS`), each walk a phase of its own (`to <place>`), so the stalls of
 * each are listed apart: the yard and the hall of heroes, the chest, both portals, the chronicle, the campfire and
 * the notice board. A first visit's training is skipped first, as the portals wait for it. Its notes say how long
 * each walk took to arrive by the page's clock, and a place never reached.
 */
export async function walks(page, ms, options = {}) {
  if (!(await page.$('#vmap'))) return ['no village in this tree: walked nothing'];
  await skipTraining(page);
  await page.evaluate(markPhase, 'away');
  await page.waitForTimeout(Math.min(ms / 10, 3000));
  const notes = [];
  for (const stop of options.stops ?? STOPS) notes.push(await walkTo(page, stop));
  return notes;
}

/** The training skipped where it's offered (its tracker's Skip), so the portals open. */
async function skipTraining(page) {
  const skip = await page.$('.tr-skip');
  if (skip && (await skip.isVisible())) await skip.click();
}

/** Walks to `stop` (a map name's `data-use`, `portal:<biome>` for a portal) and back out of what it opens. */
async function walkTo(page, stop) {
  const [use, biome] = stop.split(':');
  let asked = await declineReport(page);
  const why = await openMap(page);
  if (why) return `never walked to ${stop}: ${why}`;
  const name = biome ? `.vm-name[data-use="${use}"][data-biome="${biome}"]` : `.vm-name[data-use="${use}"]`;
  if (await page.evaluate(arrived, use)) {
    return `never walked to ${stop}: open already (${await page.evaluate(openNow)})`;
  }
  await page.evaluate(markPhase, `to ${stop}`);
  const clicked = await page.evaluate(() => performance.now());
  asked = (await clickPastReport(page, name)) || asked;
  if (use === 'yard') {
    await page.waitForTimeout(YARD_MS);
    return `walked towards the yard for ${YARD_MS / 1000} s`;
  }
  const reached = await page.waitForFunction(arrived, use, { timeout: ARRIVE_MS, polling: 100 })
    .then(() => true, () => false);
  if (!reached) return `never reached ${stop} in ${ARRIVE_MS / 1000} s`;
  const took = (await page.evaluate(() => performance.now())) - clicked;
  await page.evaluate(markPhase, `at ${stop}`);
  await page.waitForTimeout(STAY_MS);
  const left = await putAway(page, use);
  if (left) return `reached ${stop} in ${(took / 1000).toFixed(1)} s, then ${left}`;
  const note = `reached ${stop} in ${(took / 1000).toFixed(1)} s`;
  return asked ? `${note} (a slow game's report asked for first: Not now)` : note;
}

/** how long a click waits for its element before the report's prompt is looked for over it (ms) */
const CLICK_MS = 2000;

/** `selector` clicked, the slow game's prompt answered first if it came up over it meanwhile: whether it did. */
async function clickPastReport(page, selector) {
  const clicked = await page.click(selector, { timeout: CLICK_MS }).then(() => true, () => false);
  if (clicked) return false;
  if (!(await declineReport(page))) throw new Error(`stalls: walks: ${selector} took no click`);
  await page.click(selector);
  return true;
}

/** The game's prompt to send a slow stretch's report answered Not now where it shows (a first visit's slow boot
 *  asks once the lobby is calm), as it lies over the map's names: whether it was asked. */
async function declineReport(page) {
  const later = await page.$('#perf-ask .pa-later');
  if (!later || !(await later.isVisible())) return false;
  await later.click();
  return true;
}

/** The map opened with M and waited for till it lies flat, its names taking clicks: why it didn't, if it didn't. */
async function openMap(page) {
  await tap(page, 'm');
  const flat = () => Boolean(document.querySelector('#vmap.flat:not(.ahead)'));
  const opened = await page.waitForFunction(flat, null, { timeout: MAP_MS, polling: 100 })
    .then(() => true, () => false);
  if (!opened) return `the map never opened (${await page.evaluate(openNow)})`;
  return '';
}

/** What's open on the page now, said for a map that didn't open. (Run in the page.) */
function openNow() {
  const ids = ['vmap', 'menu', 'pause', 'help', 'coop', 'vcard', 'heroes', 'perf-ask'];
  const shown = ids.filter((id) => document.getElementById(id)?.checkVisibility());
  const menu = document.getElementById('menu');
  return `shown: ${shown.join(', ') || 'none'}; the panels ${menu?.className ?? 'missing'}`;
}

/** Whether what `use` opens is shown: the hero arrived and used it. (Run in the page.) */
function arrived(use) {
  const open = (id) => {
    const element = document.getElementById(id);
    return Boolean(element) && !element.classList.contains('hidden') && element.checkVisibility();
  };
  if (use === 'portal' || use === 'chronicle') return open('vcard');
  // (stowed, the panels are still shown, slid aside)
  const menu = document.getElementById('menu');
  if (use === 'stash') return open('menu') && !menu.classList.contains('stowed') && menu.dataset.open === 'chest';
  if (use === 'coop') return open('coop');
  if (use === 'help') return open('help');
  if (use === 'heroes') return open('heroes');
  return false;
}

/** What `use` opened put away as a player does: the hero screen by Back, the rest by Esc: what went wrong, if
 *  anything did. */
async function putAway(page, use) {
  if (use === 'heroes') {
    await page.click('#heroes .hs-back');
    const gone = () => !document.getElementById('heroes').checkVisibility();
    await page.waitForFunction(gone, null, { timeout: ARRIVE_MS });
  } else {
    await tap(page, 'Escape');
  }
  await page.waitForTimeout(STAY_MS);
  // (a press the page missed as a panel slid: pressed again, and said)
  if (!(await page.evaluate(arrived, use))) return '';
  await tap(page, 'Escape');
  await page.waitForTimeout(STAY_MS);
  return `Esc closed nothing the first time (${await page.evaluate(openNow)})`;
  // (Esc with nothing left to close opens the pause menu: closed again)
  if (await page.evaluate(() => !document.getElementById('pause')?.classList.contains('hidden'))) {
    await tap(page, 'Escape');
  }
}

/** Taps `key` as a person does. */
const tap = (page, key) => page.keyboard.press(key, { delay: TAP_MS });
