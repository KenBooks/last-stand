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
import * as THREE from 'three';
import { hallFocus, hallHeroes, dropSpareHeroes, heroesStanding } from '../../../src/game/hall';
import { heroShare, isReadying, readyingLabel, chill, heroWarming, isWarm, markWarm } from '../../../src/game/warm';
import { hasSavedClass } from '../../../src/loot/profile';
import { heroSelectEatsClicks, heroSelectOpen, openHeroSelect } from '../../../src/ui/heroSelect';
import { buildingBehind } from '../../../src/game/behind';
import { realWait, type Lab, type PagePoint, type Pictured, type Report } from './lab';
import { Player } from '../../../src/entities/player';
import { ownColour, savedColour, saveColour } from '../../../src/net/heroColour';

export interface HeroPickOptions {
  /** plant the fault the measure must catch: the click after a choosing tap let through to the lobby */
  canary?: boolean;
  /** the hero in focus picked at once, the others still warming, and the scene read for strays after it */
  quick?: boolean;
}

/** where on the hero the pick lands, a share of his height from his feet: his middle, as a player taps him */
const ON_HERO = 0.5;
/** the frames run after a pick: a run started by it has begun its countdown by then */
const AFTER_FRAMES = 60;

/** How a pick is made: a finger's tap, or the mouse's click. */
type Pointer = 'tap' | 'mouse';

/** What one pick did. */
interface Pick {
  colour: string | null;
  /** Bodies completed in the picking event, before background frames run. */
  built: number;
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
async function pick(lab: Lab, pointer: Pointer, loseColour = false): Promise<Pick> {
  if (!heroSelectOpen()) throw new Error('lab: heropick: the hero selection screen isn\'t open');
  const hero = hallHeroes()[hallFocus()].id;
  const at = heroInFocusAt();
  const clicks = clicksOutside();
  const before = Player.built;
  if (pointer === 'tap') await lab.tap(at);
  else await lab.click(at);
  const built = Player.built - before;
  if (loseColour) G.player.setColour(null);
  const under = nameOf(document.elementFromPoint(at.x, at.y));
  await lab.step(AFTER_FRAMES);
  clicks.stop();
  return {
    colour: G.player.colour,
    built,
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
  if (picked.built) problems.push(`${said}: built ${picked.built} complete hero bodies inside the picking event`);
  if (picked.colour !== 'gold') problems.push(`${said}: lost the chosen colour on the cached hero (${picked.colour})`);
  return problems;
}

/** A pick as a line of the report. */
function lineOf(picked: Pick): string {
  const at = `${Math.round(picked.at.x)},${Math.round(picked.at.y)}`;
  const where = picked.screenOpen ? 'the hero selection screen' : picked.mode === 'menu' ? 'the lobby' : picked.mode;
  const run = picked.runStarted ? 'a run started' : picked.waiting ? `"${picked.waiting}" waiting` : 'no run';
  return `${picked.pointer} on the ${picked.hero} at ${at} (the lobby's ${picked.under} under it): in ${where}, `
    + `${run}, its click reached ${picked.clicked ?? 'nothing outside the screen'}, ${picked.built} bodies built in the pick`;
}

/** Try both tab activation and Enter before an alternate hero's loading bar finishes. */
async function coldNavigation(lab: Lab): Promise<string> {
  const initial = G.player.cls.id;
  const unfinished = hallHeroes().find((hero) => heroShare(hero.player.cls.model) < 1);
  const cold = unfinished ?? hallHeroes().find(hero => hero.id !== initial)!;
  const wasWarm = isWarm('heroes');
  const progress = hallHeroes().map(hero => [hero.player.cls.model, heroShare(hero.player.cls.model)] as const);
  const visible = cold.player.obj.visible;
  // Cached programs may finish before a prebooted page is used. Hold a real readiness state for the UI guard,
  // rather than letting machine speed decide whether this part of the check runs.
  const hold = (): void => {
    chill('heroes');
    for (const [model, share] of progress) heroWarming(model, model === cold.player.cls.model ? 0.5 : share);
  };
  if (!unfinished) { hold(); lab.beforeFrame.push(hold); }
  try {
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
  } finally {
    if (!unfinished) {
      lab.beforeFrame.splice(lab.beforeFrame.indexOf(hold), 1);
      for (const [model, share] of progress) heroWarming(model, share);
      if (wasWarm) markWarm('heroes');
      cold.player.obj.visible = visible;
    }
  }
  document.querySelector<HTMLButtonElement>(`#heroes .hs-tabs [data-c="${initial}"]`)!.click();
  await lab.step(AFTER_FRAMES);
  const state = unfinished ? 'warming' : 'readiness held at 50%';
  return `unfinished ${cold.id} (${state}): repeated tab and Enter blocked; no hero saved`;
}

/** How far (m) a hero may be drawn from where he stands: his object's world matrix against his position. */
const DRAWN_OFF_MOST = 0.01;

/**
 * Every shown hero in the scene that's drawn somewhere else than where he stands, or that no one plays or shows (a
 * player's, the hall of heroes' while it's open, or standing on the village's hall's dais): each a line, with where
 * he's drawn. From play on a slow first visit: the mage picked while the others still warmed, the warrior and the
 * ranger stood on the fountain, the hall of heroes' plinths, their dais's matrices held where its room had them.
 */
function heroesAmiss(): string[] {
  const owned = new Set<THREE.Object3D>([
    ...G.players.map((p) => p.obj), ...hallHeroes().map((h) => h.player.obj), ...heroesStanding().map((p) => p.obj),
  ]);
  const drawn = new THREE.Vector3();
  const amiss: string[] = [];
  for (const o of G.scene.children) {
    if (!o.name.startsWith('hero ') || !o.visible) continue;
    drawn.setFromMatrixPosition(o.matrixWorld);
    const where = `drawn at ${drawn.x.toFixed(1)}, ${drawn.z.toFixed(1)}, ${Math.hypot(drawn.x, drawn.z).toFixed(1)} m from the fountain`;
    if (!owned.has(o)) amiss.push(`${o.name} in the scene, no one's (${where})`);
    else if (drawn.distanceTo(o.position) > DRAWN_OFF_MOST) {
      amiss.push(`${o.name} ${where}, standing at ${o.position.x.toFixed(1)}, ${o.position.z.toFixed(1)}`);
    }
  }
  return amiss;
}

/** where the fountain is pictured from and what at (m): beside it and a little above, as the player's screenshot */
const FOUNTAIN_SHOT = { from: new THREE.Vector3(3.5, 3.2, 6.5), at: new THREE.Vector3(0.3, 0.9, 0.4) };

/** The screen with the game's camera put beside the fountain for the frame (`FOUNTAIN_SHOT`), then given back. */
async function fountainPictured(lab: Lab, frame: number): Promise<Pictured> {
  const cam = G.camera, was = { at: cam.position.clone(), turn: cam.quaternion.clone() };
  cam.position.copy(FOUNTAIN_SHOT.from);
  cam.lookAt(FOUNTAIN_SHOT.at);
  cam.updateMatrixWorld();
  try {
    const who = heroesStanding().map((p) => p.cls.id).join(' and the ');
    return await lab.screen('heropick-quick-fountain', [`frame ${frame}: the fountain as the ${who} first stand on the dais of the village's hall, 31 m off`]);
  } finally {
    cam.position.copy(was.at);
    cam.quaternion.copy(was.turn);
    cam.updateMatrixWorld();
  }
}

/** the most frames followed after a quick pick for the other heroes' warm-up and builds to end, how slow the CPU is
 *  meanwhile (a slow first visit's: at 4 times, the others were warm before the hall closed), and how often the view
 *  is changed meanwhile (V, the training's first step: from above, the hall's dais is seen from the square) */
const QUICK = { frames: 3000, throttle: 12, viewEvery: 40 };

/**
 * The hero in focus picked at once, the other heroes still warming behind the screen (hidden on their plinths), as a
 * player on a slow first visit picks the mage he's shown, the view changed now and then as the training has him do,
 * then followed frame by frame until their warm-up and builds are done: every hero must be drawn where he stands, and
 * none stand in the scene that no one plays or shows (`heroesAmiss`). The others must have come to stand on the
 * village's hall's dais meanwhile, or nothing was measured. `canary` holds a hero on the dais drawn where the hall of
 * heroes' room had him, as the fault did, which must be found.
 */
async function quickPick(lab: Lab, canary: boolean): Promise<{ lines: string[]; problems: string[]; moments: Pictured[] }> {
  const others = hallHeroes().filter((h) => h.id !== G.player.cls.id);
  const coldAtPick = others.filter((h) => !h.player.obj.visible).map((h) => h.id);
  const amiss = new Map<string, number>();
  const onDais = new Set<string>();
  let frames = 0, planted = '';
  const moments: Pictured[] = [];
  await lab.throttle(QUICK.throttle);
  try {
    const picked = await pick(lab, 'mouse');
    if (picked.screenOpen) throw new Error('lab: heropick --quick: the pick left the screen open');
    for (let after = 0; frames < QUICK.frames && after < 120; frames++) {
      if (isWarm('heroes') && !buildingBehind()) after++;
      if (frames % QUICK.viewEvery === QUICK.viewEvery - 1) await lab.press('KeyV');
      for (const p of heroesStanding()) onDais.add(p.cls.id);
      if (canary && !planted && heroesStanding().length) {
        const p = heroesStanding()[0];
        p.obj.matrixWorld.setPosition(0, p.obj.position.y, 0.4);
        planted = p.cls.id;
      }
      for (const line of heroesAmiss()) if (!amiss.has(line)) amiss.set(line, frames);
      // (the fountain pictured as the others first stand on the dais, from beside it and a little above, as the
      // player's screenshot had it: where they're drawn)
      if (!moments.length && heroesStanding().length === others.length) moments.push(await fountainPictured(lab, frames));
      await lab.step(1);
      await realWait(2);
    }
  } finally { await lab.throttle(1); }
  const lines = [
    `quick pick of the ${G.player.cls.id}, the others still warming (hidden on their plinths): `
      + `${coldAtPick.join(', ') || 'none'}; ${frames} frames followed at ${QUICK.throttle}x slower CPU, the view `
      + `changed every ${QUICK.viewEvery}; on the village's hall's dais meanwhile: ${[...onDais].join(', ') || 'none'}`,
    `heroes drawn amiss: ${[...amiss].map(([line, at]) => `${line} (frame ${at})`).join('; ') || 'none'}`,
  ];
  const problems = [...amiss.keys()].map((line) => `heropick --quick: ${line}`);
  if (!coldAtPick.length) problems.push('heropick --quick: the other heroes were warm at the pick (nothing raced it)');
  if (!onDais.size) problems.push('heropick --quick: no hero came to stand on the dais of the village\'s hall (nothing measured)');
  if (canary) {
    lines.push(`canary: the ${planted || 'nobody'} on the dais drawn on the fountain`);
    if (!planted || !problems.some((line) => line.includes(`hero ${planted} drawn`))) {
      return { lines, problems: ['heropick --quick: the canary (a dais hero drawn on the fountain) was missed'], moments };
    }
    return { lines, problems: [], moments };
  }
  return { lines, problems, moments };
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
  if (options.quick) {
    const quick = await quickPick(lab, canary);
    return { text: quick.lines.join('\n'), problems: quick.problems, moments: quick.moments };
  }
  const navigation = await coldNavigation(lab);
  const paused = await pauseBeforeChoice(lab);
  const alternate = hallHeroes().find(hero => hero.id !== G.player.cls.id)!;
  // A first visit has no lobby frames in which to build a spare. Pick as soon as its own readiness permits it.
  for (let frames = 0; heroShare(alternate.player.cls.model) < 1; frames++) {
    if (frames > 1800) throw new Error('lab: heropick: alternate hero never became ready');
    await lab.step(1);
    await realWait(2);
  }
  document.querySelector<HTMLButtonElement>(`#heroes .hs-tabs [data-c="${alternate.id}"]`)!.click();
  await lab.step(AFTER_FRAMES);
  heroSelectEatsClicks(!canary);
  const previousColour = savedColour();
  saveColour('gold');
  G.player.setColour(ownColour());
  const picks: Pick[] = [];
  try {
    if (canary) dropSpareHeroes();
    picks.push(await pick(lab, 'tap', canary));
    // (the mouse's pick on the screen as a first visit opens it again: the tap saved the hero, as a pick does)
    if (!canary) {
      openHeroSelect(G.player.cls.id, true);
      await lab.step(AFTER_FRAMES);
      picks.push(await pick(lab, 'mouse'));
    }
  } finally {
    heroSelectEatsClicks(true);
    saveColour(previousColour);
    G.player.setColour(ownColour());
  }
  const found = picks.flatMap(problemsOf);
  const colours = picks.map(picked => picked.colour ?? 'original').join(', ');
  const lines = [paused, navigation, ...picks.map(lineOf), `colour picked after spare preparation: Gold; worn: ${colours}`];
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
  const missed: string[] = [];
  if (!found.some(problem => problem.includes('lost the chosen colour'))) missed.push('heropick: the lost-colour canary was missed');
  if (!found.some(problem => problem.includes('complete hero bodies'))) missed.push('heropick: the missing-spare canary was missed');
  if (!found.some(problem => problem.includes('its click reached'))) missed.push('heropick: the click-through canary was missed');
  lines.push(`canary: ${found.join('; ')}`);
  return { text: lines.join('\n'), problems: missed };
}
