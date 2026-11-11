// A first visit's hero picked on the hero selection screen (tools/lab `heropick`, src/ui/heroSelect.ts): the page
// booted with no saved hero opens on the screen over the hall of heroes, and the hero in focus is chosen as a player
// chooses him, by a finger's tap on him and then (the screen opened again as a first visit's) by the mouse. Each pick
// must land in the lobby with no run started and none waiting to, and the browser's click after the press must reach
// nothing outside the screen. From play on the owner's phone: "I picked mage, it entered the area, enemies spawned
// and started attacking me, happens every time": the screen closed as the finger lifted, and the tap's click, which
// comes after it, pressed the lobby's Enter the Arena under the mage (on a 640x360 screen); a first visit's fight
// still cold, the Start waited under the fight's loading bar and began the run once it was warm.
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { hallFocus, hallHeroes } from '../../../src/game/hall';
import { heroShare, isReadying, readyingLabel } from '../../../src/game/warm';
import { hasSavedClass } from '../../../src/loot/profile';
import { heroSelectEatsClicks, heroSelectOpen, openHeroSelect } from '../../../src/ui/heroSelect';
import type { Lab, PagePoint, Report } from './lab';

export interface HeroPickOptions {
  /** plant the fault the measure must catch: the click after a choosing tap let through to the lobby */
  canary?: boolean;
}

/** where on the hero the pick lands, a share of his height from his feet: his middle, as a player taps him */
const ON_HERO = 0.5;
/** the frames run after a pick: a run started by it has begun its countdown by then */
const AFTER_FRAMES = 60;

/** How a pick is made: a finger's tap, or the mouse's click. */
type Pointer = 'tap' | 'mouse';

/** What one pick did. */
interface Pick {
  pointer: Pointer;
  hero: string;
  at: PagePoint;
  /** what lies under the pick's point once the screen is gone (the lobby's, where its click would land) */
  under: string;
  /** what the click after the press reached, if it reached anything outside the hero selection screen */
  clicked: string | null;
  mode: string;
  runStarted: boolean;
  /** what a press waiting for the fight's warm-up readies ('' with none: a Start waiting begins the run later) */
  waiting: string;
  screenOpen: boolean;
  lobbyShown: boolean;
}

/** An element named as a selector reads: its tag, id and first class, after the nearest of its ancestors with an id
 *  (`#menu div.ml-body`). */
function nameOf(element: Element | null): string {
  if (!element) return 'nothing';
  if (element.id) return `#${element.id}`;
  const first = element.classList[0];
  const own = first ? `${element.tagName.toLowerCase()}.${first}` : element.tagName.toLowerCase();
  const named = element.parentElement?.closest('[id]');
  return named ? `#${named.id} ${own}` : own;
}

/** The middle of the hero in focus as the camera shows him (css px). */
function heroInFocusAt(): PagePoint {
  const hero = hallHeroes()[hallFocus()].player;
  const base = hero.obj.position;
  const at = base.clone().setY(base.y + hero.model.height * ON_HERO).project(G.camera);
  return { x: (at.x + 1) / 2 * innerWidth, y: (1 - at.y) / 2 * innerHeight };
}

/** The clicks that reach anything outside the hero selection screen, from now on (`stop` ends it). */
function clicksOutside(): { reached: () => string | null; stop: () => void } {
  let reached: string | null = null;
  const heard = (event: MouseEvent): void => {
    const target = event.target as Element;
    if (!target.closest('#heroes')) reached = nameOf(target);
  };
  // (on the document as it captures, before the lobby's own handlers; a click the game kept from the page, on the
  // window as it captures, never gets here)
  document.addEventListener('click', heard, true);
  return { reached: () => reached, stop: () => document.removeEventListener('click', heard, true) };
}

/** The hero in focus picked by `pointer`, and what came of it. */
async function pick(lab: Lab, pointer: Pointer): Promise<Pick> {
  if (!heroSelectOpen()) throw new Error('lab: heropick: the hero selection screen isn\'t open');
  const hero = hallHeroes()[hallFocus()].id;
  const at = heroInFocusAt();
  const clicks = clicksOutside();
  if (pointer === 'tap') await lab.tap(at);
  else await lab.click(at);
  const under = nameOf(document.elementFromPoint(at.x, at.y));
  await lab.step(AFTER_FRAMES);
  clicks.stop();
  return {
    pointer,
    hero,
    at,
    under,
    clicked: clicks.reached(),
    mode: G.mode,
    runStarted: G.run !== null,
    waiting: isReadying() ? readyingLabel() : '',
    screenOpen: heroSelectOpen(),
    lobbyShown: !document.querySelector('#menu')!.classList.contains('hidden'),
  };
}

/** What's wrong with a pick: not in the lobby, a run started or waiting to, or its click reaching past the screen. */
function problemsOf(picked: Pick): string[] {
  const problems: string[] = [];
  const said = `heropick: the ${picked.hero} picked by ${picked.pointer === 'tap' ? 'a tap' : 'the mouse'}`;
  if (picked.screenOpen) problems.push(`${said}: the hero selection screen still open`);
  if (picked.mode !== 'menu' || picked.runStarted) problems.push(`${said}: a run started (mode ${picked.mode})`);
  if (picked.waiting) problems.push(`${said}: a press waiting for the warm-up ("${picked.waiting}")`);
  if (!picked.lobbyShown) problems.push(`${said}: the lobby not shown`);
  if (picked.clicked) problems.push(`${said}: its click reached ${picked.clicked}`);
  return problems;
}

/** A pick as a line of the report. */
function lineOf(picked: Pick): string {
  const at = `${Math.round(picked.at.x)},${Math.round(picked.at.y)}`;
  const where = picked.screenOpen ? 'the hero selection screen' : picked.mode === 'menu' ? 'the lobby' : picked.mode;
  const run = picked.runStarted ? 'a run started' : picked.waiting ? `"${picked.waiting}" waiting` : 'no run';
  return `${picked.pointer} on the ${picked.hero} at ${at} (the lobby's ${picked.under} under it): in ${where}, `
    + `${run}, its click reached ${picked.clicked ?? 'nothing outside the screen'}`;
}

/** Try both tab activation and Enter before an alternate hero's loading bar finishes. */
async function coldNavigation(lab: Lab): Promise<string> {
  const initial = G.player.cls.id;
  const cold = hallHeroes().find((hero) => heroShare(hero.player.cls.model) < 1);
  if (!cold) throw new Error('lab: heropick: no unfinished alternate hero to exercise');
  const tab = document.querySelector<HTMLButtonElement>(`#heroes .hs-tabs [data-c="${cold.id}"]`)!;
  tab.click();
  tab.click();
  await lab.step(1, () => ({ keys: ['enter'] }));
  if (!heroSelectOpen() || G.player.cls.id !== initial || hasSavedClass()) {
    throw new Error('lab: heropick: an unfinished hero was chosen');
  }
  if (heroShare(cold.player.cls.model) < 1 && cold.player.obj.visible) {
    throw new Error('lab: heropick: an unfinished hero entered the scene draw');
  }
  document.querySelector<HTMLButtonElement>(`#heroes .hs-tabs [data-c="${initial}"]`)!.click();
  await lab.step(AFTER_FRAMES);
  return `unfinished ${cold.id}: tab navigation, repeated selection and Enter stayed responsive; no hero saved`;
}

/** Escape must reach pause/settings on a first visit, before any hero has been chosen. */
async function pauseBeforeChoice(lab: Lab): Promise<string> {
  const focus = hallFocus();
  await lab.press('Escape');
  await lab.step(1);
  if (!G.menuOpen || !heroSelectOpen() || hasSavedClass()) {
    throw new Error('lab: heropick: Escape did not pause over the initial selection screen');
  }
  await lab.press('KeyD');
  await lab.step(1);
  await lab.press('Enter');
  await lab.step(1);
  if (hallFocus() !== focus || !heroSelectOpen() || hasSavedClass()) {
    throw new Error('lab: heropick: pause keys navigated or chose a hero behind the menu');
  }
  await lab.press('Escape');
  await lab.step(1);
  if (G.menuOpen || !heroSelectOpen() || !G.player.idle) {
    throw new Error('lab: heropick: closing pause did not restore the unchanged selection screen');
  }
  return 'before choosing: Escape opened pause; navigation stayed behind it; Escape returned to the same hero';
}

/**
 * `lab heropick`: a first visit's hero in focus picked by a finger's tap, then the screen opened again as a first
 * visit's and him picked by the mouse; each must land in the lobby with no run started or waiting, its click
 * reaching nothing outside the screen. `canary` lets the tap's click through, which must be found.
 */
export async function heroPick(lab: Lab, options: HeroPickOptions): Promise<Report> {
  if (hasSavedClass() || !heroSelectOpen()) {
    throw new Error('lab: heropick: the page isn\'t a first visit on the hero selection screen (--first)');
  }
  const canary = Boolean(options.canary);
  const paused = await pauseBeforeChoice(lab);
  const navigation = await coldNavigation(lab);
  heroSelectEatsClicks(!canary);
  const picks: Pick[] = [];
  try {
    picks.push(await pick(lab, 'tap'));
    // (the mouse's pick on the screen as a first visit opens it again: the tap saved the hero, as a pick does)
    if (!canary) {
      openHeroSelect(G.player.cls.id, true);
      await lab.step(AFTER_FRAMES);
      picks.push(await pick(lab, 'mouse'));
    }
  } finally {
    heroSelectEatsClicks(true);
  }
  const found = picks.flatMap(problemsOf);
  const lines = [paused, navigation, ...picks.map(lineOf)];
  if (!canary) {
    await lab.keyDown('KeyW');
    if (!input.down.has('w')) found.push('heropick: lobby keyboard did not receive W after choosing a hero');
    await lab.keyUp('KeyW');
    await lab.keyDown('Escape');
    await lab.step(1);
    await lab.keyUp('Escape');
    if (!G.menuOpen) found.push('heropick: Escape did not pause the lobby after choosing a hero');
    await lab.press('Escape');
    await lab.step(1);
    lines.push('lobby keyboard: W received and Escape opened the pause menu immediately after selection');
  }
  if (!canary) return { text: lines.join('\n'), problems: found };
  lines.push(found.length ? `canary caught: ${found.join('; ')}` : 'canary missed: the tap\'s click let through');
  return { text: lines.join('\n'), problems: found.length ? [] : ['heropick: the canary was missed'] };
}
