// The training's tracker (game/training.ts): a small card in the lobby's corner listing the first visit's steps, each
// ticked as it's done, and a button to skip them; finished, it says the portals are open, and goes a moment later.
// It shows while the village takes the hero's input (no panel, map or screen over it). The village's tutorial
// (game/tutorial.ts) shows in it too, in the first visit's place while a station is under way: the station's steps,
// the one to take now with how it's done (by the keys, or on touch) and the rule behind it, and a button to leave;
// with the bag or the stash open too, as its steps about items are taken there.
import { G } from '../state';
import { on } from '../events';
import { skipTraining, stepDone, trainingPending, trainingSteps } from '../game/training';
import {
  boundSkills, initTutorial, leaveTutorial, shadeComing, stationSteps, tutorialCount, tutorialFinished, tutorialSaid,
  tutorialOpened, tutorialStation, tutorialStep, tutorialStepDone, updateTutorial,
} from '../game/tutorial';
import { coopOpen } from './coop';
import { villageCardOf } from './villageCard';
import type { TutorialStep } from '../data/tutorial';
import { SKILL_KEYS } from '../loot/loadout';
import { sfx } from '../core/audio';
import { input } from '../core/input';
import { KEY_LABEL } from './hud';
import type { SkillKey } from '../types';

/** a key said in words in a step (the mouse's buttons by name: "LMB" meant nothing to a new player) */
const KEY_WORDS: Partial<Record<SkillKey, string>> = { mouse0: 'the left mouse button', mouse2: 'the right mouse button' };
const keyWords = (key: SkillKey): string => KEY_WORDS[key] ?? KEY_LABEL[key];
/** how often the ring looks again for what it rings and where it stands (s): a layout read, so not every frame */
const RING_EVERY = 0.2;
/** how far the tracker stands off what it's placed beside, out of its column (css px) */
const AFLOAT_GAP = 10;
/** how far the ring stands out round what it rings (css px) */
const RING_PAD = 4;
/** what counts as shown: `visibility: hidden` and a panel faded out too */
const SHOWN = { visibilityProperty: true, opacityProperty: true };

/** how long the tracker says the training is finished before it goes (s) */
const FINISHED_FOR = 5;
/** what it says as each ends */
const FINISHED = { training: 'Training complete: the portals are open.', tutorial: 'Tutorial complete. The notice board keeps every station.' };

let root: HTMLElement, title: HTMLElement, list: HTMLElement, finishedLine: HTMLElement, skip: HTMLElement;
/** whether it's shown now, and how long it has left saying the training is finished */
let shown = false, finishing = 0;
/** whether the steps were last told for touch, and whether the shade was last said to be on its way */
let touchSaid = false, comingSaid = false;
/** where it stands in the page (the minimap's column), and whether it has left it for the page's own box (`afloat`) */
let home: HTMLElement, afloat = false;
/** the ring round the part of the page the step points at, when it last looked, and where it was put */
let ring: HTMLElement, ringT = 0, ringAt = 'boot';
/** a short screen (a phone held sideways: src/ui/AGENTS.md), where the bag's panels fill the screen */
const SHORT = matchMedia('(max-height: 520px)');

/** The tracker's markup filled in, following the training as it changes. */
export function initTrainingTracker(): void {
  root = document.querySelector<HTMLElement>('#training')!;
  home = root.parentElement!;
  title = root.querySelector<HTMLElement>('.tr-title')!;
  list = root.querySelector<HTMLElement>('.tr-steps')!;
  finishedLine = root.querySelector<HTMLElement>('.tr-finished')!;
  skip = root.querySelector<HTMLElement>('.tr-skip')!;
  skip.addEventListener('click', () => {
    sfx.click();
    if (tutorialStation()) leaveTutorial();
    else skipTraining();
  });
  initTutorial();
  // (shown under the loading screen at first, as the tracker is, so its first raster is there and not mid-walk)
  ring = document.createElement('div');
  ring.id = 'tut-ring';
  ring.setAttribute('aria-hidden', 'true');
  ring.className = 'on';
  document.body.append(ring);
  on('tutorialChanged', () => { ringT = 0; });
  render();
  // (shown under the loading screen, so its first raster builds Chrome's Skia programs there: shown first at the
  // reveal, a first visit's held Chrome's GPU process 0.3 to 0.4 s; the first frame after it hides it if it's done)
  root.classList.remove('hidden');
  shown = true;
  on('trainingChanged', () => {
    const wasPending = root.classList.contains('pending');
    render();
    if (wasPending && !trainingPending() && !tutorialStation()) finish(FINISHED.training);
  });
  on('tutorialChanged', () => {
    render();
    if (!tutorialFinished()) return;
    tutorialSaid();
    finish(FINISHED.tutorial);
  });
}

function finish(says: string): void {
  finishedLine.textContent = says;
  finishing = FINISHED_FOR;
  sfx.click();
}

/** Its frame: shown while `visible` and the training is under way or just finished; a tutorial's station while the
 *  village is `up` (it takes the hero's input, or his bag or the stash is open over it: `bag`, `stash`). */
export function updateTrainingTracker(dt: number, visible: boolean, up = visible, bag = false, stash = false): void {
  if (finishing > 0) finishing = Math.max(0, finishing - dt);
  const touring = !!tutorialStation();
  updateTutorial(up, bag, stash);
  // (a card or Play together up over the village: the step that asks for it)
  if (touring) {
    const card = villageCardOf();
    if (card) tutorialOpened(card.use);
    if (coopOpen()) tutorialOpened('coop');
  }
  // (its keys said with a keyboard alone: told again as the player takes up the other)
  if (input.touchMode !== touchSaid || shadeComing() !== comingSaid) {
    touchSaid = input.touchMode;
    comingSaid = shadeComing();
    render();
  }
  // (the minimap's column is put away with the bag or the stash open, and on a short screen it stands over the skill
  // buttons' arc: a station's step is said from the page's own box there, placed by the stylesheet)
  const floats = touring && bag;
  if (floats !== afloat) {
    afloat = floats;
    (afloat ? document.body : home).append(root);
    root.classList.toggle('afloat', afloat);
    if (!afloat) root.style.right = '';
    else ringT = 0;
  }
  root.classList.toggle('over-bag', touring && bag);
  ringT -= dt;
  if (ringT <= 0) {
    ringT = RING_EVERY;
    if (afloat) placeAfloat();
    placeRing(touring && up ? markedNow() : null);
  }
  const show = touring ? up : visible && (trainingPending() || finishing > 0);
  if (show === shown) return;
  shown = show;
  root.classList.toggle('hidden', !show);
}

function render(): void {
  const station = tutorialStation();
  root.classList.toggle('pending', !!station || trainingPending());
  root.classList.toggle('tour', !!station);
  skip.textContent = station ? 'Leave the tutorial' : 'Skip training';
  if (!station) {
    title.textContent = 'Training';
    list.replaceChildren(...trainingSteps().map((t) => {
      const li = document.createElement('li');
      li.textContent = input.touchMode ? t.touchText ?? t.text : t.key ? `${t.text} (${t.key})` : t.text;
      li.classList.toggle('done', stepDone(t.id));
      return li;
    }));
    return;
  }
  const steps = stationSteps(station), now = tutorialStep();
  title.textContent = `Tutorial: ${station.name}`;
  list.replaceChildren(...steps.map((t) => {
    const li = document.createElement('li');
    li.classList.toggle('done', tutorialStepDone(t.id));
    if (t !== now) { li.textContent = t.title; return li; }
    li.classList.add('now');
    li.append(line('tr-do', t.count ? `${t.title} (${tutorialCount()} of ${t.count})` : t.title));
    li.append(line('tr-how', t.shade && shadeComing() ? 'The sparring shade is gathering itself: a moment.' : said(howOf(t), t)));
    li.append(line('tr-why', t.why));
    return li;
  }));
}

/** How `step` is done by the input in hand: on touch its own words, with the keys its words and, for a drawn main
 *  attack, what holding it does. */
function howOf(step: TutorialStep): string {
  if (input.touchMode) return step.touch ?? step.how;
  return step.drawn && G.player.skillAt('mouse0')?.def.draw ? `${step.how} ${step.drawn}` : step.how;
}

/** The part of the page the step to take now points at (`TutorialStep.mark`): the first of its list that shows and
 *  isn't a tab already picked. */
function markedNow(): HTMLElement | null {
  const step = tutorialStep();
  const marks = (input.touchMode ? step?.touchMark ?? step?.mark : step?.mark) ?? [];
  for (const mark of marks) {
    const selector = mark.replace(/\{key:(\w+)\}/g, (_, impl: string) => SKILL_KEYS.find((k) => G.player.skillAt(k)?.def.impl === impl) ?? 'none');
    const el = document.querySelector<HTMLElement>(selector);
    if (!el || el.classList.contains('active') || !el.checkVisibility(SHOWN)) continue;
    const box = el.getBoundingClientRect();
    if (box.width >= 1 && box.height >= 1 && box.bottom > 0 && box.top < innerHeight) return el;
  }
  return null;
}

/** Out of its column (the bag open, which puts the column away), the tracker stands on the right beside the bag's
 *  panels, at the top. In its column the rest of the time, where the first visit's checklist stood (from review, "Lets
 *  keep tutorial on the right like it was originally": it had stood out of it, in the top left corner, then left of the
 *  minimap). On a short screen with the bag open it's a line along the panels' foot, placed by the stylesheet. Its
 *  offset is written divided by its own zoom, which scales it. */
function placeAfloat(): void {
  if (SHORT.matches) { root.style.right = ''; return; }
  const shown = (el: Element): boolean => (el as HTMLElement).checkVisibility(SHOWN) && el.getBoundingClientRect().width >= 1;
  // (the bag's panels down the right alone: the skill bar's along the foot is no wall to stand beside)
  const panels = [...document.querySelectorAll('#menu .panel:not(#lobby-rail)')]
    .filter((p) => shown(p) && p.getBoundingClientRect().top < innerHeight / 3 && p.getBoundingClientRect().right > innerWidth / 2);
  const beside = panels.length ? Math.min(...panels.map((p) => p.getBoundingClientRect().left)) : innerWidth;
  const zoom = parseFloat(getComputedStyle(root).zoom) || 1;
  const right = `${Math.round((innerWidth - beside + AFLOAT_GAP) / zoom)}px`;
  if (root.style.right !== right) root.style.right = right;
}

/** The ring put round `el` (none: hidden), written only when where it stands changes. */
function placeRing(el: HTMLElement | null): void {
  const box = el?.getBoundingClientRect();
  const at = box ? [box.left - RING_PAD, box.top - RING_PAD, box.width + 2 * RING_PAD, box.height + 2 * RING_PAD].map(Math.round).join(',') : '';
  if (at === ringAt) return;
  ringAt = at;
  ring.classList.toggle('on', !!at);
  if (!at) return;
  const [x, y, w, h] = at.split(',');
  Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
}

function line(cls: string, text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

/** `text` with its words in braces filled in from the hero's skills and keys (data/tutorial.ts). */
function said(text: string, step: TutorialStep): string {
  const p = G.player;
  const keyOf = (impl: string) => SKILL_KEYS.find((k) => p.skillAt(k)?.def.impl === impl);
  const nameOf = (impl: string) => boundSkills(p).find((s) => s.def.impl === impl)?.def.name ?? 'that skill';
  const anyOf = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0] ?? 'a skill');
  return text.replace(/\{(\w+)(?::(\w+))?\}/g, (_, word: string, impl?: string) => {
    if (word === 'attack') {
      const s = p.skillAt('mouse0');
      return s ? `${keyWords('mouse0')} (${s.def.name})` : 'your attack';
    }
    if (word === 'keys') {
      return SKILL_KEYS.filter((k) => k !== 'mouse0' && p.skillAt(k) && p.skillAt(k)!.def.impl !== 'potion').map(keyWords).join(', ');
    }
    if (word === 'skills') {
      return anyOf([...new Set(boundSkills(p).filter((s) => step.skills?.includes(s.def.impl)).map((s) => s.def.name))]);
    }
    if (word === 'key' && impl) { const k = keyOf(impl); return k ? keyWords(k) : 'its key'; }
    if (word === 'name' && impl) return nameOf(impl);
    return '';
  });
}
