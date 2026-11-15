// tools/lab `tutorial`: the village's tutorial (src/game/tutorial.ts) walked as a player walks it, with the keys and
// the mouse or (`--touch`) by a finger: begun at the notice board, then each step done the way its own words say (the
// bag opened, a worn item thrown on the ground, its name clicked, the stash opened at the chest, the item put on; the
// yard walked into, a dummy struck, three skills used, the hero's own defence against the sparring shade, the
// draught). Before each step is done, what the tracker asks is read (the step it says is the step expected, within
// the window and over no other part of the HUD) and pictured. A step that isn't ticked by doing it is a problem, as
// are health lost to the shade, a program compiled on the way, and progress the cookie doesn't keep. Its canaries:
// the tracker as tall as two windows, and the cookie emptied, each of which must be found.
import type { Frame, Lab, Pictured, Report } from './lab';
import { middleOf } from './lab';
import { G } from '../../../src/state';
import { readCookie, writeCookie } from '../../../src/core/cookies';
import { setView } from '../../../src/core/renderer';
import { programsCompiledInGame } from '../../../src/core/shaders';
import { setTraceConsent, traceConsent } from '../../../src/perf/consent';
import { TUTORIAL, type TutorialStepId } from '../../../src/data/tutorial';
import { YARD_DUMMIES, yardToWorld } from '../../../src/data/village';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { groundDrops } from '../../../src/game/groundItems';
import { skipTraining } from '../../../src/game/training';
import { sparringShade, stationDone, stationSteps, tutorialStation, tutorialStep } from '../../../src/game/tutorial';
import { villageObject } from '../../../src/game/village';
import { project } from '../../../src/ui/floaters';
import { panelsOpen } from '../../../src/ui/menus';
import { labelAt } from '../../../src/ui/overlay/layer';
import { groundHeight } from '../../../src/world/ground';
import type { SkillKey } from '../../../src/types';

export interface TutorialOptions {
  /** walked by a finger, on the touch controls */
  touch: boolean;
  /** plant the faults it must catch */
  canary: boolean;
}

/** the cookie the tutorial keeps what was done in (src/game/tutorial.ts) */
const COOKIE = 'last-stand-tutorial';
/** the parts of the HUD the tracker must lie clear of, where they show */
const CLEAR_OF = ['#minimap', '#touch-village', '#touch-skills', '#bottombar'];
/** a short screen's height (css px; the short-screen layout, src/ui/AGENTS.md) */
const SHORT_SCREEN = 520;
/** frames for the page to follow a change (a panel, the tracker, the touch controls) */
const SHOW_FRAMES = 15;
/** frames a step has to be ticked in once it's being done (the shade rises and walks up to strike in them) */
const STEP_FRAMES = 1200;
/** how far over a drop its name is looked for (css px), as a player clicks the name and not the shard */
const NAME_OVER_PX = 14;
/** frames for the camera to come to rest after the hero is stood somewhere else */
const CAMERA_FRAMES = 90;
/** where he steps round a thrown item to bring its name clear of the touch controls (m from it) */
const STEP_ROUND: readonly [number, number][] = [[-3, 0], [3, 0], [0, -3], [0, 3], [-3, -3], [3, 3]];
/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.4, y: 0.45 };
/** where the hero stands in the yard (its own frame), the dummies before him */
const IN_YARD: [number, number] = [0, 1.3];
/** frames the main attack is held before it's let go: a bow's draw, nocked first */
const DRAW_FRAMES = 100;
/** where he stands back to shoot from (the yard's own frame), and the tries at arm's length before he does */
const BACK_IN_YARD: [number, number] = [0, -2.5];
const STAND_BACK_AFTER = 3;
/** where he stands off the yard, on the square (the world's metres) */
const ON_THE_SQUARE: [number, number] = [0, 4];
const SHOWN = { visibilityProperty: true, opacityProperty: true };

/** a frame with every key and button let go (frames run with no input given leave the last one held) */
const REST = (): Frame => ({});

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const shows = (selector: string): boolean => !!document.querySelector<HTMLElement>(selector)?.checkVisibility(SHOWN);
const open = (selector: string): boolean => !element(selector).classList.contains('hidden');

/** What each of `selector`'s parts covers (the touch controls' own buttons: their boxes are wider than they show). */
function boxesOf(selector: string): DOMRect[] {
  if (!shows(selector)) return [];
  const whole = element(selector);
  const parts = selector.startsWith('#touch-') ? [...whole.children] as HTMLElement[] : [whole];
  return parts.filter((part) => part.checkVisibility(SHOWN)).map((part) => part.getBoundingClientRect()).filter((box) => box.width >= 1);
}

/** What of the page lies under a point: the element's tag and class, and the nearest part with an id. */
function under(at: { x: number; y: number }): string {
  const found = document.elementFromPoint(at.x, at.y);
  return found ? `${found.tagName.toLowerCase()}.${found.className} in #${found.closest('[id]')?.id}` : 'nothing';
}

const rectText = (r: DOMRect): string => `${r.width.toFixed(0)}x${r.height.toFixed(0)} at ${r.left.toFixed(0)}, ${r.top.toFixed(0)}`;

const overlap = (a: DOMRect, b: DOMRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** What's wrong with where the tracker stands as it asks for `step`. */
function trackerProblems(step: string): string[] {
  if (!shows('#training')) return [`${step}: the tracker isn't shown`];
  const box = element('#training').getBoundingClientRect();
  const problems: string[] = [];
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    problems.push(`${step}: the tracker reaches past the window (${box.width.toFixed(0)}x${box.height.toFixed(0)} px at ${box.left.toFixed(0)}, ${box.top.toFixed(0)})`);
  }
  for (const part of CLEAR_OF) {
    if (boxesOf(part).some((other) => overlap(box, other))) problems.push(`${step}: the tracker lies over ${part}`);
  }
  // (on the right in every case: "why did it move on left? I would keep it on right in all cases")
  // (its middle past two fifths of the way across: on the shortest phones it stands between the bars and the touch
  // buttons at the top, a little right of the middle)
  if (box.left + box.width / 2 < innerWidth * 0.4) problems.push(`${step}: the tracker stands on the left (${rectText(box)}, ${element('#training').className}, in #${element('#training').parentElement?.id || element('#training').parentElement?.tagName})`);
  // (beside the bag's panels, never over them: but the short screen's line along their foot, which is meant to be)
  const footLine = innerHeight <= SHORT_SCREEN && element('#training').classList.contains('over-bag');
  const panels = panelsOpen() ? [...document.querySelectorAll<HTMLElement>('#menu .panel:not(#lobby-rail)')].filter((panel) => panel.checkVisibility(SHOWN)) : [];
  const under = panels.find((panel) => overlap(box, panel.getBoundingClientRect()));
  if (!footLine && under) problems.push(`${step}: the tracker (${rectText(box)}, ${element('#training').className}) lies over the bag's panel ${under.id || under.className} (${rectText(under.getBoundingClientRect())})`);
  return problems;
}

/** Walk the tutorial through, checking and picturing each step. */
export async function tutorial(lab: Lab, options: TutorialOptions): Promise<Report> {
  const problems: string[] = [];
  const lines: string[] = [];
  const moments: Pictured[] = [];
  const { touch } = options;
  const p = lab.player;
  if (G.mode !== 'menu' || G.arena.place !== 'village') throw new Error('lab: tutorial: the page must begin in the village');
  const check = (condition: boolean, message: string): void => { if (!condition) problems.push(message); };

  const stand = async ([x, z]: readonly [number, number], facing = 0): Promise<void> => {
    p.walkTo = null;
    p.place(new lab.THREE.Vector3(x, groundHeight(x, z), z), facing);
    await lab.step(SHOW_FRAMES, REST);
  };
  /** A finger's tap on `target`, saying which it was if the page never heard it. */
  const tap = async (target: Element): Promise<void> => {
    try {
      target.scrollIntoView({ block: 'nearest' });
      await lab.tap(middleOf(target));
    } catch (error) {
      const at = middleOf(target);
      throw new Error(`${(error as Error).message}: tapping ${target.tagName.toLowerCase()}.${target.className} at ${at.x.toFixed(0)}, ${at.y.toFixed(0)} (there: ${under(at)})`);
    }
  };
  const press = async (target: Element): Promise<void> => {
    if (touch) await tap(target);
    else await lab.clickOn(target);
    await lab.step(SHOW_FRAMES, REST);
  };
  const use = async (id: string): Promise<void> => {
    const object = villageObject(id);
    if (!object) throw new Error(`lab: tutorial: the village has no ${id}`);
    await stand(object.stand);
    if (touch) await tap(element('#touch-village .tv-use'));
    else await lab.step(1, () => ({ keys: ['e'] }));
    await lab.step(SHOW_FRAMES, REST);
  };
  /** The tracker read as it asks for `step`, and pictured. */
  const asked = async (step: TutorialStepId): Promise<boolean> => {
    const now = tutorialStep()?.id;
    if (now !== step) { problems.push(`the step asked is ${now ?? 'none'}, not ${step}`); return false; }
    problems.push(...trackerProblems(step));
    const says = element('#training .tr-steps li.now')?.textContent ?? '';
    check(says.length > 0 && !/[{}]/.test(says), `${step}: the tracker's words are unfilled: "${says}"`);
    lines.push(`  ${step}: ${element('#training .tr-how')?.textContent ?? ''}`);
    moments.push(await lab.screen(`tutorial-${step}`));
    return true;
  };
  /** Frames run with `frame`'s input until `step` is ticked. */
  const until = async (step: TutorialStepId, frame?: () => { keys?: string[]; m0?: boolean; m2?: boolean; aim?: InstanceType<Lab['THREE']['Vector3']> }): Promise<void> => {
    try {
      await lab.until(() => tutorialStep()?.id !== step, STEP_FRAMES, `${step} was never ticked`, frame);
    } catch (error) {
      problems.push((error as Error).message);
    }
    await lab.step(SHOW_FRAMES, REST);
  };
  const keyOf = (impl: string): SkillKey | undefined => SKILL_KEYS.find((key) => p.skillAt(key)?.def.impl === impl);
  /** A skill's key held (on touch its button) while `held` frames run with the aim on `aim`. */
  const hold = async (key: SkillKey, aim: InstanceType<Lab['THREE']['Vector3']>, done: () => boolean, limit: number): Promise<void> => {
    // (the mouse stays there as the key lifts: a drawn shot is loosed where it points then)
    lab.aim.copy(aim);
    if (touch) {
      await lab.touchDown(middleOf(element(`#touch-skills .tk-${key}`)));
      for (let f = 0; f < limit && !done(); f++) await lab.step(1);
      await lab.touchUp();
    } else {
      const input = key === 'mouse0' ? { m0: true } : key === 'mouse2' ? { m2: true } : { keys: [key] };
      for (let f = 0; f < limit && !done(); f++) await lab.step(1, () => ({ ...input, aim }));
    }
    await lab.step(SHOW_FRAMES, REST);
  };

  const said = (): Report => ({ text: [`the tutorial walked ${touch ? 'by a finger' : 'with keys and mouse'} as the ${p.cls.name.toLowerCase()}:`, ...lines].join('\n'), problems, moments });
  // (a walk that can't go on is a problem, said with the pictures of the steps before it)
  // (the slow game's prompt kept away: on a loaded PC it came up over the Use button, and the walk tapped it)
  const consentWas = traceConsent();
  setTraceConsent('off');
  try {
  // --- the board ---
  skipTraining();
  // (from above, where the mouse aims: over the shoulder he aims by the camera's turn, which this walk doesn't make)
  setView('top');
  writeCookie(COOKIE, '');
  if (touch && !document.body.classList.contains('touch')) {
    // (a finger on the world puts the page in touch mode; over an object the village keeps the press, and no click
    // follows to wait for)
    await lab.touchDown({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
    await lab.touchUp();
    await lab.step(SHOW_FRAMES, REST);
  }
  const compiledBefore = programsCompiledInGame();
  const lifeBefore = p.life;
  await use('notice');
  check(open('#help') && open('#help .help-tour'), 'the notice board shows no tutorial');
  const board = element('#help .modal-box').getBoundingClientRect();
  check(board.top >= 0 && board.left >= 0 && board.right <= innerWidth && board.bottom <= innerHeight, 'the notice board\'s box reaches past the window');
  check(element('#help .ht-stations').children.length === TUTORIAL.length, 'the board lists other stations than the tutorial has');
  // (one way in: "remove one of the Start/Restart buttons, showing 2 at the same time is lame")
  // (by what's put away, not by what shows: the board fades in, and a button half faded in counted as unseen)
  const starts = [...document.querySelectorAll<HTMLElement>('#help button')].filter((b) => !b.closest('.hidden') && b.getBoundingClientRect().width > 0 && b.id !== 'btn-help-close' && b.id !== 'btn-help-guide');
  check(starts.length === 1 && starts[0].id === 'btn-tour', `the board shows ${starts.length} ways to start (${starts.map((b) => b.textContent).join(', ')}), not the tutorial's one`);
  moments.push(await lab.screen('tutorial-board'));
  await press(element('#btn-tour'));
  check(!open('#help'), 'starting the tutorial left the notice board open');
  check(tutorialStation()?.id === 'items', 'the board\'s button began no items station');

  // --- items ---
  const worn = (): number => Object.values(G.profile.equipped).filter(Boolean).length;
  /** the slot of the item thrown: one of its kind is put on again (the hero fights with what he had) */
  let thrown = '';
  if (await asked('bag')) {
    if (touch) await press(element('#touch-village .tv-bag'));
    else await lab.step(1, () => ({ keys: ['i'] }));
    await lab.step(SHOW_FRAMES, REST);
  }
  if (await asked('throw')) {
    const wornBefore = worn();
    const slot = document.querySelector<HTMLElement>('#menu .eslot[draggable="true"]');
    if (!slot) throw new Error('lab: tutorial: the hero wears nothing to throw');
    thrown = slot.dataset.slot ?? '';
    if (touch) {
      await press(slot);
      await press(element('#item-sheet .is-salvage'));
    } else {
      // (dragged as the page hears a drag: its start on the item, its drop on the game's field)
      const canvas = G.renderer.domElement, at = { clientX: innerWidth * 0.5, clientY: innerHeight * 0.6 };
      const data = new DataTransfer();
      slot.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
      canvas.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data, ...at }));
      canvas.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, ...at }));
      await lab.step(SHOW_FRAMES, REST);
    }
    check(worn() === wornBefore - 1 && groundDrops().length === 1, 'the item thrown is not on the ground');
  }
  if (await asked('take')) {
    // (the bag put away, as its panels may lie over the name)
    if (touch) await press(element('#rail-close'));
    else await lab.step(1, () => ({ keys: ['i'] }));
    await lab.step(SHOW_FRAMES * 3);
    const drop = groundDrops()[0];
    const nameOf = (): { x: number; y: number } | null => {
      const at = drop && project(drop.x, groundHeight(drop.x, drop.z) + 0.5, drop.z);
      const point = at && { x: at.x, y: at.y - NAME_OVER_PX };
      return point && labelAt(point.x, point.y) && document.elementFromPoint(point.x, point.y) === G.renderer.domElement ? point : null;
    };
    // (a name under the touch controls takes no tap: he steps round it until it's clear of them, as a player does)
    let name = nameOf();
    for (const [dx, dz] of STEP_ROUND) {
      if (name || !drop) break;
      await stand([drop.x + dx, drop.z + dz]);
      // (the camera left to come to rest over him: the name moves on the screen with it)
      await lab.step(CAMERA_FRAMES);
      name = nameOf();
    }
    if (!name) problems.push('take: the thrown item\'s name is nowhere a press reaches it');
    else if (touch) {
      // (a press the floor keeps from the page gives no click to wait for: a finger put down and lifted, twice)
      for (let taps = 0; taps < 2; taps++) { await lab.touchDown(nameOf() ?? name); await lab.touchUp(); await lab.step(SHOW_FRAMES, REST); }
    } else {
      // (the mouse brought over the name a frame before it clicks, as a hand does)
      await lab.mouseTo(name);
      await lab.step(2);
      await lab.click(name);
    }
    await lab.step(SHOW_FRAMES, REST);
    check(groundDrops().length === 0, `the item is still on the ground (under the click: ${name ? under(name) : 'nothing'})`);
  }
  if (await asked('stash')) await use('chest');
  if (await asked('wear')) {
    const wornBefore = worn();
    const item = document.querySelector<HTMLElement>(`#stash .sitem[draggable="true"][data-slot="${thrown}"]`)
      ?? document.querySelector<HTMLElement>('#stash .sitem[draggable="true"]');
    if (!item) throw new Error('lab: tutorial: the stash holds nothing to wear');
    await press(item);
    if (touch) await press(element('#item-sheet .is-a'));
    check(worn() >= wornBefore, 'nothing was put on from the stash');
  }
  check(stationDone('items'), 'the items station is not done after its steps');
  check(tutorialStation()?.id === 'combat', 'the combat station did not follow the items');

  // --- combat ---
  await stand(ON_THE_SQUARE);
  await lab.step(SHOW_FRAMES * 2);
  const dummy = new lab.THREE.Vector3(YARD_DUMMIES[1][0], 0, YARD_DUMMIES[1][1]);
  const inYard = yardToWorld(...IN_YARD);
  const toYard = async (): Promise<void> => stand(inYard, Math.atan2(dummy.x - inYard[0], dummy.z - inYard[1]));
  if (await asked('yard')) await toYard();
  if (await asked('strike')) {
    if (touch) {
      for (let tries = 0; tries < 8 && tutorialStep()?.id === 'strike'; tries++) {
        await tap(element('#touch-skills .tk-mouse0'));
        await lab.step(60);
      }
    } else {
      // (held a moment and let go, again and again: a bow's shot is loosed as its key lifts)
      for (let tries = 0; tries < 12 && tutorialStep()?.id === 'strike'; tries++) {
        // (a bow shoots past a dummy at arm's length: he steps back from it, as an archer does)
        if (tries === STAND_BACK_AFTER) await stand(yardToWorld(...BACK_IN_YARD), Math.atan2(dummy.x - yardToWorld(...BACK_IN_YARD)[0], dummy.z - yardToWorld(...BACK_IN_YARD)[1]));
        await hold('mouse0', dummy, () => tutorialStep()?.id !== 'strike', DRAW_FRAMES);
        await lab.step(30, REST);
      }
      if (tutorialStep()?.id === 'strike') {
        problems.push(`strike was never ticked (he stands ${Math.hypot(p.pos.x - dummy.x, p.pos.z - dummy.z).toFixed(1)} m off the dummy, `
          + `facing ${p.facing.toFixed(2)} for ${Math.atan2(dummy.x - p.pos.x, dummy.z - p.pos.z).toFixed(2)})`);
      }
    }
  }
  if (await asked('skills')) {
    const keys = SKILL_KEYS.filter((key) => key !== 'mouse0' && p.skillAt(key) && p.skillAt(key)!.def.impl !== 'potion');
    for (const key of keys) {
      if (tutorialStep()?.id !== 'skills') break;
      const count = (): string => element('#training .tr-do')?.textContent ?? '';
      const before = count();
      await hold(key, dummy, () => count() !== before, 40);
      // (the skill left to end, and the hero back where a charge took him from)
      await lab.step(90);
      await toYard();
    }
    check(tutorialStep()?.id !== 'skills', 'three skills used did not tick the skills step');
  }
  for (const step of ['block', 'break', 'daze', 'lure'] as const) {
    if (tutorialStep()?.id !== step) continue;
    try {
      await lab.until(() => !!sparringShade() && sparringShade()!.spawning <= 0, STEP_FRAMES, 'the sparring shade never came up');
    } catch (error) {
      problems.push((error as Error).message);
      break;
    }
    const shade = sparringShade()!;
    check(shade.training && shade.damage === 0, 'the sparring shade is no harmless projection');
    await asked(step);
    const key = stationSteps(tutorialStation()!).find((t) => t.id === step)!.skills!.map(keyOf).find(Boolean)!;
    for (let tries = 0; tries < 12 && tutorialStep()?.id === step; tries++) {
      // (a shield is held up to the blow; a skill is held a moment and let go)
      await hold(key, shade.pos, () => tutorialStep()?.id !== step, step === 'block' || step === 'break' ? STEP_FRAMES : 45);
      await lab.step(45);
    }
    check(tutorialStep()?.id !== step, `${step} was never ticked`);
    if (step === 'break') {
      check(p.staggered, 'the guard broken left the hero unstaggered');
      moments.push(await lab.screen('tutorial-broken'));
    }
  }
  check(p.life >= lifeBefore, `the shade cost the hero health (${lifeBefore.toFixed(0)} to ${p.life.toFixed(0)})`);
  if (await asked('draught')) {
    // (staggered, he drinks nothing: the guard's 1.5 s first)
    await lab.step(120);
    const key = keyOf('potion')!;
    await hold(key, dummy, () => tutorialStep()?.id !== 'draught', 30);
  }

  // --- the end, and what's kept ---
  check(tutorialStation() === null, `the walk did not end: ${tutorialStation()?.id} is under way at ${tutorialStep()?.id}`);
  check(!sparringShade(), 'the sparring shade outstayed the tutorial');
  check(TUTORIAL.every((s) => stationDone(s.id)), 'a station is not done after the walk');
  moments.push(await lab.screen('tutorial-done'));
  const kept = (): string[] => {
    const saved = (readCookie(COOKIE) ?? '').split(',');
    return TUTORIAL.flatMap((s) => stationSteps(s)).filter((t) => !saved.includes(t.id)).map((t) => `the cookie keeps no ${t.id}`);
  };
  problems.push(...kept());
  const compiled = programsCompiledInGame() - compiledBefore;
  check(compiled === 0, `${compiled} programs were compiled on the walk`);
  lines.push(`  programs compiled on the walk: ${compiled}`);
  await stand(ON_THE_SQUARE);
  await use('notice');
  if (!open('#help')) {
    const use = element('#touch-village .tv-use');
    problems.push(`the notice board did not open at the walk's end (the Use button ${use.checkVisibility(SHOWN) ? 'shown' : 'hidden'}, under its middle ${under(middleOf(use))})`);
  } else check([...element('#help .ht-stations').children].every((row) => row.classList.contains('done')), 'the board does not say each station is done');
  moments.push(await lab.screen('tutorial-board-done'));
  await press(element('#btn-help-close'));

  if (options.canary) {
    const tracker = element('#training');
    tracker.classList.remove('hidden');
    tracker.style.height = `${innerHeight * 2}px`;
    const tall = trackerProblems('canary').some((problem) => problem.includes('reaches past the window'));
    tracker.style.height = '';
    tracker.classList.add('hidden');
    lines.push(`  canary: the tracker as tall as two windows ${tall ? 'caught' : 'went unseen'}`);
    check(tall, 'the canary\'s tall tracker went unseen');
    const saved = readCookie(COOKIE) ?? '';
    writeCookie(COOKIE, '');
    const lost = kept().length > 0;
    writeCookie(COOKIE, saved);
    lines.push(`  canary: the cookie emptied ${lost ? 'caught' : 'went unseen'}`);
    check(lost, 'the canary\'s emptied cookie went unseen');
  }
  } catch (error) {
    problems.push(`the walk stopped: ${(error as Error).message}`);
  }
  setTraceConsent(consentWas);
  return said();
}
