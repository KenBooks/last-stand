// tools/lab ui `heroesWarming`: the hero selection screen opened as a first visit opens it, the other heroes not yet
// warm (from play, "we can only load currently selected/default hero... and then load the two others, show some
// loading bars on those heroes"): the lobby's own hero standing, each cold one off his plinth with a bar on his tab
// at his share, the choice on a cold one saying how far along he is and choosing nothing; then the heroes warm, and
// every hero standing, no bar left. Its canary leaves a cold hero's tab without its bar.
import { G } from '../../../src/state';
import { CLASSES, CLASS_IDS } from '../../../src/data/classes/index';
import { chill, heroWarming, markWarm } from '../../../src/game/warm';
import { hallFocus, hallHeroes } from '../../../src/game/hall';
import { closeHeroSelect, heroSelectOpen, openHeroSelect } from '../../../src/ui/heroSelect';
import type { Lab } from './lab';
import type { TouchFound } from './uiTouch';

/** the canary's problem, and what it plants */
export const HEROES_WARMING_CANARY = { name: 'no bar on its tab', what: 'a cold hero\'s tab without its bar' };
/** how far the first cold hero is warmed as it's pictured (the second not at all) */
const PART_WARM = 0.4;
/** frames for the hall to show what's warm */
const SHOW_FRAMES = 4;
/** frames for the camera to come to a hero brought into focus (its glide, as `uiHeroes.ts` waits it out) */
const ARRIVE_FRAMES = 30;

/** what the screen showed with the heroes cold, read as it opened (the check reads it after), and what was found with
 *  the canary planted then */
let cold: { lines: string[]; problems: string[] } = { lines: [], problems: [] };
let planted: string[] = [];

/** The tab of class `id`. */
const tabOf = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.hs-tabs button[data-c="${id}"]`)!;

/** The hall's heroes as the screen shows them: each class, whether he stands there, his tab's bar and its share. */
function heroesRead(): { id: string; drawn: boolean; bar: boolean; share: number }[] {
  return hallHeroes().map(({ id, player }) => {
    const tab = tabOf(id);
    const share = Number(tab.style.getPropertyValue('--ready') || 1);
    return { id, drawn: player.obj.visible, bar: tab.classList.contains('cold'), share };
  });
}

/** The screen's state with the heroes cold: each problem found, and lines saying what was read. */
function coldRead(canary: boolean): { lines: string[]; problems: string[] } {
  const own = G.player.cls.id;
  const lines: string[] = [];
  const problems: string[] = [];
  if (canary) for (const id of CLASS_IDS) if (id !== own) tabOf(id).classList.remove('cold');
  for (const hero of heroesRead()) {
    const said = hero.id === own ? 'the lobby\'s own' : `${Math.round(hero.share * 100)}% warm`;
    lines.push(`  ${hero.id} (${said}): ${hero.drawn ? 'standing' : 'off his plinth'}, ${hero.bar ? 'a bar' : 'no bar'}`);
    if (hero.id === own) {
      if (!hero.drawn) problems.push(`heroesWarming: the lobby's own ${hero.id} isn't standing`);
      if (hero.bar) problems.push(`heroesWarming: the lobby's own ${hero.id} has a bar on his tab`);
      continue;
    }
    if (hero.drawn) problems.push(`heroesWarming: the cold ${hero.id} is drawn, his programs made in the frame`);
    if (!hero.bar) problems.push(`heroesWarming: the cold ${hero.id} has ${HEROES_WARMING_CANARY.name}`);
  }
  if (canary) for (const id of CLASS_IDS) if (id !== own) tabOf(id).classList.add('cold');
  return { lines, problems };
}

/** The screen opened as a first visit's, the heroes cold, the first other one `PART_WARM` of the way; read, then a
 *  cold hero in focus and chosen, which must leave the screen open; the heroes then warmed. */
export async function openHeroesWarming(lab: Lab): Promise<void> {
  chill('heroes');
  const others = CLASS_IDS.filter((id) => id !== G.player.cls.id);
  heroWarming(CLASSES[others[0]].model, PART_WARM);
  openHeroSelect(G.player.cls.id, true);
  await lab.step(SHOW_FRAMES);
  cold = coldRead(false);
  planted = coldRead(true).problems;
  // (a cold hero in focus: his choice says how far along he is, and choosing him leaves the screen open)
  const tab = tabOf(others[0]);
  await lab.clickOn(tab);
  const focused = hallHeroes()[hallFocus()].id;
  const choice = document.querySelector<HTMLElement>('.hs-choose')!;
  const said = choice.textContent?.trim() ?? '';
  cold.lines.push(`  ${focused} in focus, the choice says "${said}"`);
  if (focused !== others[0]) cold.problems.push(`heroesWarming: his tab put ${focused} in focus, not ${others[0]}`);
  if (!said.includes('Readying')) cold.problems.push(`heroesWarming: a cold hero's choice says "${said}"`);
  // (the choice is a label the pointer goes through, kept on its hero every frame: clicked where it stands once the
  // camera has come to him, as a player would)
  await lab.step(ARRIVE_FRAMES);
  await lab.clickOn(choice);
  await lab.step(1);
  cold.lines.push(`  chosen while cold: the screen ${heroSelectOpen() ? 'stays open' : 'closed'}`);
  if (!heroSelectOpen()) cold.problems.push('heroesWarming: a cold hero was chosen, the screen closed');
  markWarm('heroes');
  await lab.step(SHOW_FRAMES);
}

/** The screen closed as a chosen hero's would be, nothing chosen. */
export function closeHeroesWarming(): void {
  closeHeroSelect();
}

/** What the screen showed cold, and now with the heroes warm: every hero standing, no bar left; `canary`, with what
 *  was found as it was planted. */
export function heroesWarmingShown(canary: boolean): TouchFound {
  const lines = [...cold.lines];
  const problems = [...cold.problems, ...(canary ? planted : [])];
  const warm = heroesRead();
  const standing = warm.filter((hero) => hero.drawn).length;
  const bars = warm.filter((hero) => hero.bar).length;
  lines.push(`  the heroes warm: ${standing} of ${warm.length} standing, ${bars} bars left`);
  if (standing < warm.length) problems.push('heroesWarming: a warm hero isn\'t standing');
  if (bars) problems.push('heroesWarming: a bar is left on a warm hero\'s tab');
  return { lines, problems };
}
