// Casting in the lobby and in the runs it starts (tools/lab `practice`): each skill on a key with a cooldown cast, then
// cast again as soon as the hero is free, in each way the lobby is and in runs started from it. The lobby is the
// village, and its skills cast in the training yard alone: every lobby case is cast there, and one on the square,
// where nothing may cast. Where the lobby shows (the inventory open, I), casting is free: both casts made. In practice
// (the inventory put away) and in a run, the second is refused while the first cools, the HUD counts it down on its
// key and the cast's energy is spent. A run is started at the crypt's portal. A run begun while the lobby was
// practice (a co-op guest's, as its host starts) kept the lobby's free casting through the whole run. With a canary,
// that run again with free casting planted, which must be caught.
import * as THREE from 'three';
import { pressHeld } from './holdPress';
import type { Lab, Report } from './lab';
import type { SkillDef, SkillKey } from '../../../src/types';
import type { Enemy } from '../../../src/entities/enemy';
import type { KnownSkill, Player } from '../../../src/entities/player';
import { G } from '../../../src/state';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { menuStowed } from '../../../src/ui/menus';
import { YARD, yardToWorld } from '../../../src/data/village';
import { goUse, villageObject } from '../../../src/game/village';
import { groundHeight } from '../../../src/world/ground';
import { holdFor, pressing } from './cast';

export interface PracticeOptions {
  /** the run begun in practice played again with free casting planted, which must be caught */
  canary: boolean;
}

/** How a case casts: free (the lobby's), with a run's costs and cooldowns, or not at all (outside the yard). */
type Casting = 'free' | 'counted' | 'none';

/** A skill on a key cast twice in a case: the casts it made, and what the HUD showed once the first was made. */
interface Twice {
  def: SkillDef;
  made: number;
  /** the countdown its key showed ('' none) */
  countdown: string;
  /** the energy the HUD showed before the first and once it was made (none where the HUD isn't shown) */
  energy: [number, number] | null;
}

/** the least cooldown a skill is cast twice for (s): its first cast over well within it */
const LEAST_COOLDOWN = 1;
/** the most frames a cast is waited for to be over */
const CAST_FRAMES = 240;
/** the frames run after the second cast, for one held back until the hero was free */
const AFTER_FRAMES = 30;
/** the frames the lobby is given to take a click (its practice is read in the frame) */
const LOBBY_FRAMES = 2;
/** the most frames a run is waited for to start, and to give way to the lobby */
const RUN_FRAMES = 600;
/** the most frames a dummy is waited for to rise */
const RISE_FRAMES = 120;
/** how far ahead the hero casts where no foe stands near (m) */
const AHEAD = 5;
/** the farthest a foe stands to be cast at (m) */
const NEAR = 12;

const byId = (id: string): HTMLElement => document.getElementById(id)!;

/** The skills on keys that have a cooldown worth casting twice for, each once (a skill on two keys shares one). */
function skillsToCast(hero: Player): { key: SkillKey; skill: KnownSkill }[] {
  const found: { key: SkillKey; skill: KnownSkill }[] = [];
  for (const key of SKILL_KEYS) {
    const skill = hero.skillAt(key);
    if (!skill || skill.impl.channel) continue;
    if (hero.cooldownOf(skill.def) < LEAST_COOLDOWN) continue;
    if (found.some((each) => each.skill.def.impl === skill.def.impl)) continue;
    found.push({ key, skill });
  }
  return found;
}

/** Where the hero casts: at the nearest foe standing near (a mark needs one), or ahead of him. */
function aimFor(hero: Player): THREE.Vector3 {
  const standing = G.enemies.filter((foe) => foe.alive && foe.pos.distanceTo(hero.pos) < NEAR);
  standing.sort((a, b) => a.pos.distanceTo(hero.pos) - b.pos.distanceTo(hero.pos));
  if (standing.length) return standing[0].pos.clone();
  const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing)).multiplyScalar(AHEAD);
  return hero.pos.clone().add(ahead);
}

/** The countdown the HUD shows on `key`'s slot ('' none). */
function countdownOn(key: SkillKey): string {
  const slot = document.querySelectorAll('#hotbar .slot')[SKILL_KEYS.indexOf(key)];
  return slot?.querySelector('.cdt')?.textContent ?? '';
}

/** The energy the HUD shows. */
function shownEnergy(): number {
  return parseInt(document.querySelector('.bar.energy .txt')?.textContent ?? '', 10);
}

/** Counts the casts `impl` makes from here (its effect fired), until `stop`. */
function countCasts(hero: Player, impl: string): { made(): number; stop(): void } {
  const fire = hero.fire;
  let made = 0;
  hero.fire = function (this: Player, skill, target, power) {
    if (skill.def.impl === impl) made++;
    return fire.call(this, skill, target, power);
  };
  return {
    made: () => made,
    stop: () => {
      delete (hero as { fire?: unknown }).fire;
    },
  };
}

/** Whether the hero is still at a skill: casting, channelling, aiming, or carried by a charge or a blink. */
const busy = (hero: Player): boolean => Boolean(hero.casting || hero.channel || hero.aiming || hero.dash);

/**
 * `key` held as its skill is held to cast it (a frame for most, an aimed one a moment, a drawn shot to full) at
 * `aim` and let go, then frames until the hero is free, `watch` run after each.
 */
async function castOnce(lab: Lab, key: SkillKey, def: SkillDef, aim: THREE.Vector3, watch = () => {}): Promise<void> {
  const frames = Math.max(1, Math.ceil(holdFor(def) / (window.__labClock.frame / 1000)));
  await lab.step(frames, () => pressing(key, aim, true), watch);
  await lab.step(1, () => pressing(key, aim, false), watch);
  for (let frame = 0; frame < CAST_FRAMES && busy(lab.player); frame++) await lab.step(1, () => ({ aim }), watch);
}

/** The skill on `key` cast, then cast again as soon as the hero is free, from full energy. */
async function castTwice(lab: Lab, key: SkillKey, def: SkillDef, hud: boolean): Promise<Twice> {
  const hero = lab.player;
  // (each skill from full energy: the costs of them all are more than the hero has)
  hero.energy = hero.stats.maxEnergy;
  await lab.step(1);
  const before = shownEnergy();
  const casts = countCasts(hero, def.impl);
  let seen: { countdown: string; energy: number } | null = null;
  const watch = () => {
    if (!seen && casts.made() > 0) seen = { countdown: hud ? countdownOn(key) : '', energy: shownEnergy() };
  };
  try {
    const aim = aimFor(hero);
    await castOnce(lab, key, def, aim, watch);
    await castOnce(lab, key, def, aim);
    await lab.step(AFTER_FRAMES, () => ({ aim }));
  } finally {
    casts.stop();
  }
  // (set in `watch`, which TypeScript can't see: to it `seen` is still null here)
  const after = seen as { countdown: string; energy: number } | null;
  return {
    def,
    made: casts.made(),
    countdown: after?.countdown ?? '',
    energy: hud && after ? [before, after.energy] : null,
  };
}

/** What a skill cast twice did, and what's wrong with it where casting is as `casting` says. */
function judge(twice: Twice, casting: Casting): { line: string; problems: string[] } {
  const { def, made, countdown, energy } = twice;
  const parts = [`${def.impl} cast ${made} of 2`];
  if (countdown) parts.push(`its key counting ${countdown}`);
  if (energy) parts.push(`energy ${energy[0]} -> ${energy[1]}`);
  const problems: string[] = [];
  if (casting === 'none') {
    if (made > 0) problems.push(`${def.impl} was cast outside the yard`);
  } else if (made === 0) problems.push(`${def.impl} was never cast`);
  else if (casting === 'free' && made < 2) problems.push(`${def.impl} wasn't cast again at once (free casting)`);
  else if (casting === 'counted') {
    if (made > 1) problems.push(`${def.impl} was cast again at once (its cooldown ignored)`);
    if (!countdown) problems.push(`${def.impl}'s key showed no countdown`);
    const spent = energy ? energy[0] - energy[1] : 0;
    if (def.cost > 0 && spent < def.cost / 2) problems.push(`${def.impl} spent ${spent} energy of its ${def.cost}`);
  }
  return { line: parts.join(', '), problems };
}

/** The hero put where a case casts in the village (the yard, by default), turned to its dummies, and let settle. */
async function standIn(lab: Lab, spot: [number, number] = yardToWorld(0, -2)): Promise<void> {
  lab.player.walkTo = null;
  lab.player.place(new THREE.Vector3(spot[0], groundHeight(spot[0], spot[1]), spot[1]), YARD.turn);
  await lab.step(LOBBY_FRAMES);
}

/** Every skill cast twice in a case named `name`, judged as casting there is: its line and its problems; in the
 *  village, each from `spot` (a blink carries the hero off it). */
async function playCase(lab: Lab, name: string, casting: Casting, spot?: [number, number]): Promise<Report> {
  const hud = casting === 'counted';
  const skills = skillsToCast(lab.player);
  if (!skills.length) throw new Error(`lab: practice: the ${lab.player.cls.id} has no skill on a key with a cooldown`);
  const judged: { line: string; problems: string[] }[] = [];
  for (const { key, skill } of skills) {
    if (G.mode === 'menu') await standIn(lab, spot);
    const twice = await castTwice(lab, key, skill.def, hud);
    judged.push(judge(twice, casting));
  }
  const problems = judged.flatMap((each) => each.problems.map((problem) => `${name}: ${problem}`));
  const how = { free: 'free casting', counted: 'a run\'s costs and cooldowns', none: 'no casting' }[casting];
  return { text: `${name} (wanted: ${how}): ${judged.map((each) => each.line).join('; ')}`, problems };
}

/** The lobby stowed or brought back as the village does it: the inventory put away or opened by I. */
async function toggleStowed(lab: Lab, stowed: boolean): Promise<void> {
  if (menuStowed() === stowed) return;
  await lab.step(1, () => ({ keys: ['i'] }));
  await lab.step(LOBBY_FRAMES);
  if (menuStowed() !== stowed) throw new Error(`lab: practice: the lobby was never ${stowed ? 'stowed' : 'shown'}`);
}

/**
 * The stowed lobby's Enter the Arena pressed where it lies, unseen, by the mouse and then by Enter with it focused:
 * what started a run, in words (from play: "arena fight can be started by clicking on that button while that pane is
 * hidden ... in practice mode"). A run it starts is abandoned, so the cases after it play on.
 */
async function hiddenStart(lab: Lab): Promise<string[]> {
  const started: string[] = [];
  const presses: [string, () => Promise<void>][] = [
    ['a click where it lies', () => lab.clickOn(byId('btn-start'))],
    ['Enter with it focused', async () => {
      byId('btn-start').focus();
      await lab.press('Enter');
    }],
  ];
  for (const [how, press] of presses) {
    await press();
    await lab.step(LOBBY_FRAMES);
    if (G.mode === 'menu') continue;
    started.push(how);
    // (held in its countdown, as every run here is, then abandoned)
    lab.beforeFrame.push(holdTheRun);
    await leaveRun(lab, () => lab.beforeFrame.splice(lab.beforeFrame.indexOf(holdTheRun), 1));
    await toggleStowed(lab, true);
  }
  return started;
}

/** The run held in its countdown (no foe comes), its dummy kept: a frame's hook. */
function holdTheRun(): void {
  const run = G.run;
  if (!run) return;
  run.queue = [];
  run.phase = 'countdown';
  run.timer = Infinity;
}

/** A run started, as `start` starts it, held in its countdown with a dummy before the hero; returns its unhold. */
async function enterRun(lab: Lab, start: () => Promise<void>): Promise<() => void> {
  await start();
  await lab.until(() => G.mode === 'run', RUN_FRAMES, 'practice: the run never started');
  lab.beforeFrame.push(holdTheRun);
  const hero = lab.player;
  const at = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing)).multiplyScalar(AHEAD).add(hero.pos);
  const dummy: Enemy = lab.spawnFoe('dummy', at);
  await lab.until(() => dummy.spawning <= 0, RISE_FRAMES, 'practice: the run\'s dummy never rose');
  return () => lab.beforeFrame.splice(lab.beforeFrame.indexOf(holdTheRun), 1);
}

/** The run abandoned from the pause menu, back to the lobby. */
async function leaveRun(lab: Lab, unhold: () => void): Promise<void> {
  unhold();
  await lab.step(1, () => ({ keys: ['escape'] }));
  await pressHeld(byId('btn-abandon'));
  await lab.until(() => G.mode === 'menu', RUN_FRAMES, 'practice: the run never gave way to the lobby');
  await lab.step(LOBBY_FRAMES);
  await standIn(lab);
}

/** The crypt's portal used where the hero stands for it, and its card's Enter clicked. */
async function startShown(lab: Lab): Promise<void> {
  const portal = villageObject('crypt')!;
  await standIn(lab, portal.stand);
  goUse(portal);
  await lab.step(LOBBY_FRAMES);
  await lab.clickOn(byId('btn-start'));
}

/**
 * A run begun while the lobby is practice, as a co-op guest's begins when its host starts: no button of a stowed
 * lobby starts one, so the start is called as the host's message calls it (`beginRun`).
 */
async function startInPractice(lab: Lab): Promise<void> {
  await toggleStowed(lab, true);
  byId('btn-start').click();
}

/** A run started by `start`, every skill cast twice in it, and abandoned. */
async function runCase(lab: Lab, name: string, start: () => Promise<void>, plant = false): Promise<Report> {
  const unhold = await enterRun(lab, start);
  const planted = () => {
    lab.player.sandbox = true;
  };
  if (plant) lab.beforeFrame.push(planted);
  try {
    return await playCase(lab, name, 'counted');
  } finally {
    if (plant) lab.beforeFrame.splice(lab.beforeFrame.indexOf(planted), 1);
    await leaveRun(lab, unhold);
  }
}

/** `lab practice`: each skill cast twice in the lobby's ways and the runs started from them. */
export async function practice(lab: Lab, options: PracticeOptions): Promise<Report> {
  if (G.mode !== 'menu') throw new Error('lab: practice: the page isn\'t in the lobby');
  const lines: string[] = [];
  const problems: string[] = [];
  const add = (report: Report) => {
    lines.push(report.text);
    problems.push(...report.problems);
  };
  await toggleStowed(lab, false);
  add(await playCase(lab, 'the lobby', 'free'));
  await toggleStowed(lab, true);
  add(await playCase(lab, 'practice', 'counted'));
  const started = await hiddenStart(lab);
  lines.push(`the stowed lobby's Enter the Arena, unseen: ${started.length ? `started a run by ${started.join(' and by ')}` : 'starts nothing'}`);
  if (started.length) problems.push(`the stowed lobby's Enter the Arena started a run by ${started.join(' and by ')}`);
  await toggleStowed(lab, false);
  add(await playCase(lab, 'the lobby again, after practice', 'free'));
  await toggleStowed(lab, true);
  add(await playCase(lab, 'on the square, out of the yard', 'none', [0, 4.5]));
  await toggleStowed(lab, false);
  add(await runCase(lab, 'a run started from the lobby', () => startShown(lab)));
  const guests = 'a run begun in practice, as a co-op guest\'s is when its host starts';
  add(await runCase(lab, guests, () => startInPractice(lab)));
  if (options.canary) {
    const canary = await runCase(lab, 'canary', () => startInPractice(lab), true);
    const caught = canary.problems.some((problem) => problem.includes('cast again at once'));
    lines.push(`canary, the lobby's free casting planted in a run begun in practice: ${caught ? 'caught' : 'missed'}`);
    if (!caught) problems.push('the canary\'s free casting went unseen');
  }
  return { text: lines.join('\n'), problems };
}
