// The mage's blink (tools/lab `blink`, Veilstep in src/combat/skills/blink.ts), cast as the player casts it: its key
// held while the mouse is over the aim, the landing shown, the key let go. In each scenario (open ground, past his
// reach, at a prop, past a prop, out at the arena's edge, up onto the dais, at his own feet) it measures where the
// preview showed he'd come out against where he did, his reach, the props and the arena's edge there, how long it all
// took, his body coming apart and put together again, and a blow tried every frame: none may land while he crosses,
// and one must land once he is whole. Then held through its cooldown and short of energy (page/heldCooldown.ts): its
// preview red, counting the seconds down, until it would cast. Then foes near where he vanishes and foes further off:
// the near ones must stand dazed for their time, stars over their heads, and come on again after, and the far ones
// keep coming all along.
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { hurtPlayer } from '../../../src/combat/damage';
import { inObstacle } from '../../../src/world/collision';
import { groundHeight } from '../../../src/world/arena';
import { canaryCaught, describeHeld, heldProblems, holdThroughCooldown, meshReader } from './heldCooldown';

export interface BlinkOptions {
  fixture: Fixture;
  /** the moments of the open-ground and daze scenarios pictured as the player sees them */
  pictures: boolean;
  /** plant faults the checks must catch: the preview read a metre off, the guard taken off as he comes apart, the
   *  preview read green with no countdown on its cooldown, and a near foe's daze cleared at once */
  canary: boolean;
}

/** One scenario: its name, where the hero stands and faces, and where he aims (in his own frame: right, ahead). */
interface Scenario {
  name: string;
  at: [number, number];
  /** the way he faces from where he stands */
  facing: (at: THREE.Vector3) => number;
  aim: (hero: THREE.Vector3, facing: number) => THREE.Vector3;
  /** what must hold of where he came out, besides the checks every scenario has */
  expect: (landing: Landing) => string | null;
}

/** Where he came out, and what it took. */
interface Landing {
  aim: THREE.Vector3;
  preview: THREE.Vector3 | null;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** the frames from letting go until he could act again */
  frames: number;
  /** the frames he was hidden, and those a blow landed in while he was */
  hidden: number;
  struckHidden: number;
  /** a blow landed once he was whole again */
  struckAfter: boolean;
  /** his body's dissolve once whole, and whether he's shown */
  dissolve: number;
  shown: boolean;
  /** his model's height off the ground under him once whole (m) */
  offGround: number;
}

/** the frames the key is held before it's let go (the preview shown meanwhile) */
const HOLD_FRAMES = 12;
/** the most frames a blink may take, coming apart to whole again (0.1 + 0.34 + 0.14 s, a frame's slack) */
const MOST_FRAMES = 36;
/** the frames after he's whole before the blow that must land */
const AFTER_FRAMES = 6;
/** how far the preview may be off where he came out, and he past his reach (m) */
const LANDING_SLACK = 0.02;
/** a blow's damage, tried every frame */
const BLOW = 10;
/** with --canary: how far off the preview is read (m) */
const CANARY_OFF = 1;
/** the foes for the daze: how far from him, near and far (m), and the frames they're given to come up and set off */
const NEAR = 3;
const FAR = 9;
const RISE_FRAMES = 150;
/** where the hero stands for the daze, about (the clear spot nearest it) */
const DAZE_SPOT: [number, number] = [10, 10];
/** a foe standing still moves slower than this (m/s), one coming on faster */
const STILL = 0.3;
const COMING = 0.8;
/** the frames a dazed foe is given to stop (it eases to a halt), and after its daze to set off again */
const STOP_FRAMES = 18;
const SETOFF_FRAMES = 40;
/** how far over a dazed foe's head its stars are looked for (m round the point over it) */
const STAR_REACH = 0.6;

const ahead = (hero: THREE.Vector3, facing: number, metres: number, right = 0) =>
  new THREE.Vector3(
    hero.x + Math.sin(facing) * metres - Math.cos(facing) * right,
    0,
    hero.z + Math.cos(facing) * metres + Math.sin(facing) * right,
  );

/** The prop nearest `at` between `least` and `most` metres from it. */
function propNear(at: THREE.Vector3, least: number, most: number) {
  const distanceTo = (prop: { x: number; z: number }) => Math.hypot(prop.x - at.x, prop.z - at.z);
  const props = G.arena.obstacles.filter((prop) => distanceTo(prop) > least && distanceTo(prop) < most);
  props.sort((a, b) => distanceTo(a) - distanceTo(b));
  return props[0] ?? null;
}

/**
 * A spot 1.5 m past the nearest prop between 2 m and `reach` less 4 from `hero` whose far side he could stand on, or
 * none. (The nearest alone: with the run's props rolled otherwise, its far side was in another, and the blink stopped
 * short of it as it should, read as stopped at the prop.)
 */
function pastAProp(hero: THREE.Vector3, reach: number): THREE.Vector3 | null {
  const distanceTo = (prop: { x: number; z: number }) => Math.hypot(prop.x - hero.x, prop.z - hero.z);
  const props = G.arena.obstacles.filter((prop) => distanceTo(prop) > 2 && distanceTo(prop) < reach - 4);
  props.sort((a, b) => distanceTo(a) - distanceTo(b));
  for (const prop of props) {
    const away = new THREE.Vector3(prop.x - hero.x, 0, prop.z - hero.z).normalize();
    const spot = new THREE.Vector3(prop.x, 0, prop.z).addScaledVector(away, prop.r + 1.5);
    if (standable(spot)) return spot;
  }
  return null;
}

/** how far clear of the props a spot must be (m, past his own radius), and in from the arena's edge */
const CLEAR_BY = 0.4;
const EDGE_BY = 1;

/** Whether the hero could stand at `spot`: inside the arena and clear of every prop. */
function standable(spot: THREE.Vector3): boolean {
  return Math.hypot(spot.x, spot.z) < G.arena.radius - EDGE_BY && !inObstacle(spot, G.player.radius + CLEAR_BY);
}

/** Facing the arena's middle, turned a step at a time either way until the spot `metres` ahead is standable. */
const towardMiddle = (metres: number) => (at: THREE.Vector3): number => {
  const middle = Math.atan2(-at.x, -at.z);
  for (let turn = 0; turn <= Math.PI; turn += Math.PI / 24) {
    for (const facing of [middle + turn, middle - turn]) if (standable(ahead(at, facing, metres))) return facing;
  }
  return middle;
};
/** A fixed way to face. */
const facingOf = (facing: number) => (): number => facing;

const metres = (value: number): string => `${value.toFixed(2)} m`;
const flat = (point: THREE.Vector3): string => `(${point.x.toFixed(2)}, ${point.z.toFixed(2)})`;

/** How far ahead the past-reach scenario aims for a blink of `reach` (m): well past it, as a cursor might be. */
const pastReach = (reach: number): number => Math.round(reach * 1.4);

/** The scenarios, from the reach of the hero's blink. */
function scenarios(reach: number): Scenario[] {
  const edge = G.arena.radius;
  return [
    {
      name: 'open ground, 7 m ahead',
      at: [12, 22], facing: towardMiddle(7),
      aim: (hero, facing) => ahead(hero, facing, 7),
      expect: (landing) => (landing.to.distanceTo(landing.aim) > LANDING_SLACK ? 'not where it was aimed' : null),
    },
    {
      name: `past his reach, ${pastReach(reach)} m ahead`,
      at: [12, 22], facing: towardMiddle(reach),
      aim: (hero, facing) => ahead(hero, facing, pastReach(reach)),
      expect: (landing) => (Math.abs(landing.from.distanceTo(landing.to) - reach) > LANDING_SLACK
        ? `came out ${metres(landing.from.distanceTo(landing.to))} away, not at his reach` : null),
    },
    {
      name: 'at a prop\'s middle',
      at: [12, 22], facing: facingOf(0),
      aim: (hero) => {
        const prop = propNear(hero, 3, reach - 1);
        return prop ? new THREE.Vector3(prop.x, 0, prop.z) : ahead(hero, 0, 5);
      },
      expect: (landing) => (landing.from.distanceTo(landing.to) >= landing.from.distanceTo(landing.aim)
        ? 'didn\'t stop short of the prop' : null),
    },
    {
      name: 'past a prop',
      at: [12, 22], facing: facingOf(0),
      aim: (hero) => pastAProp(hero, reach) ?? ahead(hero, 0, 8),
      expect: (landing) => (landing.to.distanceTo(landing.aim) > LANDING_SLACK ? 'stopped at the prop' : null),
    },
    {
      // (between two gates: the way out of a gate is no edge)
      name: 'out at the arena\'s edge',
      at: [-(edge - 3) * Math.SQRT1_2, -(edge - 3) * Math.SQRT1_2], facing: facingOf(-3 * Math.PI / 4),
      aim: (hero, facing) => ahead(hero, facing, 8),
      expect: (landing) => (Math.hypot(landing.to.x, landing.to.z) > edge - G.player.radius + LANDING_SLACK
        ? 'came out past the arena\'s edge' : null),
    },
    {
      name: 'up onto the dais',
      at: [0, -10], facing: facingOf(0),
      aim: (hero, facing) => ahead(hero, facing, 8),
      expect: (landing) => (groundHeight(landing.to.x, landing.to.z) <= 0 ? 'not on the dais' : null),
    },
    {
      name: 'at his own feet',
      at: [12, 22], facing: facingOf(0),
      aim: (hero) => hero.clone(),
      expect: (landing) => (landing.to.distanceTo(landing.from) > LANDING_SLACK ? 'moved' : null),
    },
  ];
}

/** how far round a scenario's spot a clear one is looked for, and in what steps (m) */
const CLEAR_MOST = 6;
const CLEAR_STEP = 0.5;
/** The spot nearest `at` that no prop stands on, ringing out from it (a biome's props stand where they stand). */
function clearSpot(at: [number, number]): [number, number] {
  const radius = G.player.radius + CLEAR_BY;
  for (let out = 0; out <= CLEAR_MOST; out += CLEAR_STEP) {
    const tries = Math.max(1, Math.round(out * 8));
    for (let k = 0; k < tries; k++) {
      const a = k / tries * Math.PI * 2;
      const spot = new THREE.Vector3(at[0] + Math.cos(a) * out, 0, at[1] + Math.sin(a) * out);
      if (!inObstacle(spot, radius)) return [spot.x, spot.z];
    }
  }
  return at;
}

/** The hero set up on the clear spot nearest the scenario's, facing its way; returns that way. */
async function setUpFor(lab: Lab, fixture: Fixture, scenario: Scenario): Promise<number> {
  const at = clearSpot(scenario.at);
  const facing = scenario.facing(new THREE.Vector3(at[0], 0, at[1]));
  await lab.setup({ ...fixture, at, facing });
  return facing;
}

/** The key the hero's blink is on, or null if he has none. */
function blinkKey(): SkillKey | null {
  return SKILL_KEYS.find((key) => G.player.skillAt(key)?.def.impl === 'blink') ?? null;
}

/** Where the preview shows he'd come out, or null if it isn't shown. */
function previewAt(): THREE.Vector3 | null {
  const ring = G.scene.getObjectByName('blink-preview');
  return ring?.visible ? new THREE.Vector3(ring.position.x, 0, ring.position.z) : null;
}

/** The hero's cooldowns over and his energy full: each blink cast as if it were the first. */
function ready(): void {
  G.player.cooldowns.clear();
  G.player.energy = G.player.stats.maxEnergy;
}

/** A blow at the hero now: whether it landed. */
function blowLands(): boolean {
  return hurtPlayer(G.player, BLOW, 'physical') > 0;
}

/** The key held over `aim`, the preview read, the key let go; then every frame until he can act again. */
async function blinkTo(lab: Lab, key: SkillKey, aim: THREE.Vector3, canary: boolean): Promise<Landing> {
  const hero = G.player;
  ready();
  await lab.step(HOLD_FRAMES, () => ({ keys: [key], aim }));
  const shown = previewAt();
  const preview = shown && canary ? shown.clone().add(new THREE.Vector3(CANARY_OFF, 0, 0)) : shown;
  const from = hero.pos.clone();
  await lab.step(1, () => ({ aim }));
  if (canary) hero.guardUntil = -1;
  let frames = 1;
  let hidden = 0;
  let struckHidden = 0;
  while (hero.dash && frames < MOST_FRAMES * 2) {
    if (!hero.obj.visible) {
      hidden++;
      if (blowLands()) struckHidden++;
    }
    await lab.step(1, () => ({ aim }));
    frames++;
  }
  const to = hero.pos.clone();
  const dissolve = hero.model.kit.u.uDissolve.value;
  const offGround = hero.obj.position.y - groundHeight(to.x, to.z);
  await lab.step(AFTER_FRAMES);
  const struckAfter = blowLands();
  const whole = hero.obj.visible;
  return { aim, preview, from, to, frames, hidden, struckHidden, struckAfter, dissolve, shown: whole, offGround };
}

/** What's wrong with a landing, by every scenario's checks and its own. */
function landingProblems(scenario: Scenario, landing: Landing, reach: number): string[] {
  const problems: string[] = [];
  const say = (what: string) => problems.push(`${scenario.name}: ${what}`);
  if (!landing.preview) say('no preview while the key was held');
  else if (landing.preview.distanceTo(landing.to) > LANDING_SLACK) {
    say(`came out ${metres(landing.preview.distanceTo(landing.to))} from where the preview showed`);
  }
  if (landing.from.distanceTo(landing.to) > reach + LANDING_SLACK) say('came out past his reach');
  if (inObstacle(landing.to, G.player.radius)) say('came out in a prop');
  if (landing.frames > MOST_FRAMES) say(`took ${landing.frames} frames`);
  if (landing.struckHidden > 0) say(`${landing.struckHidden} blows landed while he crossed`);
  if (!landing.struckAfter) say('no blow landed once he was whole again');
  if (landing.dissolve > 0 || !landing.shown) say('his body isn\'t whole again');
  if (Math.abs(landing.offGround) > LANDING_SLACK) say(`his model is ${metres(landing.offGround)} off the ground`);
  const own = scenario.expect(landing);
  if (own) say(own);
  return problems;
}

/** A landing as a line. */
function landingLine(scenario: Scenario, landing: Landing): string {
  const preview = landing.preview ? `previewed ${flat(landing.preview)}` : 'no preview';
  return `  ${scenario.name}: aimed ${flat(landing.aim)}, ${preview}, came out ${flat(landing.to)} `
    + `${metres(landing.from.distanceTo(landing.to))} away in ${landing.frames} frames (${landing.hidden} hidden, `
    + `${landing.struckHidden} blows landed in them; a blow after: ${landing.struckAfter ? 'landed' : 'none'})`;
}

/** The moments of a blink pictured as the player sees them: held, coming apart, crossing, forming, whole. */
async function pictureBlink(lab: Lab, key: SkillKey, aim: THREE.Vector3): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  ready();
  await lab.step(HOLD_FRAMES, () => ({ keys: [key], aim }));
  moments.push(await lab.screen('blink: held, the landing shown'));
  const marks: [number, string][] = [[3, 'coming apart'], [9, 'crossing'], [17, 'forming again'], [30, 'whole']];
  let frame = 0;
  for (const [at, label] of marks) {
    await lab.step(at - frame, () => ({ aim }));
    frame = at;
    moments.push(await lab.screen(`blink: ${label} (frame ${at})`));
  }
  return moments;
}

/**
 * The blink held through its cooldown and short of energy from the first scenario's spot, as its lines and problems;
 * with a canary, again with the preview read green and no countdown, which must be caught.
 */
async function cooldownRound(lab: Lab, key: SkillKey, reach: number, options: BlinkOptions, lines: string[],
  problems: string[]): Promise<Pictured[]> {
  const [first] = scenarios(reach);
  const facing = await setUpFor(lab, options.fixture, first);
  const aim = first.aim(G.player.pos, facing);
  const ring = meshReader('blink-preview');
  const hold = { pictures: options.pictures, canary: false, label: 'blink' };
  const { held, moments } = await holdThroughCooldown(lab, key, aim, ring, hold);
  lines.push(describeHeld(held));
  problems.push(...heldProblems(held));
  if (!options.canary) return moments;
  await setUpFor(lab, options.fixture, first);
  const planted = await holdThroughCooldown(lab, key, aim, ring, { ...hold, pictures: false, canary: true });
  const caught = canaryCaught(planted.held);
  lines.push(`  canary, the preview read green with no countdown on its cooldown: ${caught ? 'caught' : 'missed'}`);
  if (!caught) problems.push('the canary\'s green preview on cooldown went unseen');
  return moments;
}

/** How fast a foe goes (m/s). */
const speedOf = (foe: Enemy): number => Math.hypot(foe.vel.x, foe.vel.z);

/**
 * Whether stars circle over a foe's head now: points drawn there, of any of the scene's point clouds (they were glow
 * particles, and are stars drawn on their own, fx/dazed.ts), over its crown where the game has one (`overHead`).
 */
function starsOver(foe: Enemy): boolean {
  const top = (foe as { overHead?: number }).overHead ?? foe.height;
  const head = new THREE.Vector3(foe.pos.x, foe.obj.position.y + top + 0.25, foe.pos.z);
  return G.scene.children.some((object) => (object as THREE.Points).isPoints && drawsNear(object as THREE.Points, head));
}

/** Whether `points` draws a point within `STAR_REACH` of `head` now. */
function drawsNear(points: THREE.Points, head: THREE.Vector3): boolean {
  const { attributes, drawRange } = points.geometry;
  const end = Math.min(attributes.position.count, drawRange.start + drawRange.count);
  const at = new THREE.Vector3();
  for (let index = drawRange.start; index < end; index++) {
    if (at.fromBufferAttribute(attributes.position, index).distanceTo(head) < STAR_REACH) return true;
  }
  return false;
}

/** How one foe took the blink: dazed or not, how it stood or came on, and its stars. */
interface FoeTook {
  near: boolean;
  /** how far from him as he vanished (m) */
  away: number;
  dazedFor: number;
  /** its fastest while it should stand (from `STOP_FRAMES` in until its daze ends), and its slowest meanwhile */
  fastest: number;
  slowest: number;
  /** its fastest once its daze is over */
  after: number;
  stars: boolean;
  acting: boolean;
}

/**
 * Foes near where he vanishes and further off, up and coming at him, then the blink away from them: each one's daze,
 * its speed while dazed and after, its stars and whether it went on with an action. With a canary, the first near
 * foe's daze cleared at once.
 */
async function dazeRound(lab: Lab, key: SkillKey, options: BlinkOptions, lines: string[],
  problems: string[]): Promise<Pictured[]> {
  // (facing the middle from an open spot, the foes ahead of him inside the arena: from (12, 22) facing +z, the far
  // ones' spots lay past its edge and they were pushed in onto it, 3 m from him)
  const at = clearSpot(DAZE_SPOT);
  const facing = Math.atan2(-at[0], -at[1]);
  await lab.setup({ ...options.fixture, at, facing });
  const hero = G.player.pos.clone();
  const spots: [number, boolean][] = [[NEAR, true], [-NEAR, true], [FAR, false], [-FAR, false]];
  const foes = spots.map(([away, near]) => {
    const spot = ahead(hero, facing, Math.abs(away), away > 0 ? 1 : -1);
    return { near, spot, foe: lab.spawnFoe('husk', spot) };
  });
  await lab.until(() => foes.every(({ foe }) => foe.spawning <= 0), RISE_FRAMES, 'the foes never rose');
  // (back on their spots, coming on from there: the first up walked in a few metres while the last rose)
  for (const { foe, spot } of foes) foe.pos.copy(spot);
  const aim = ahead(hero, facing, -9, 0);
  ready();
  await lab.step(HOLD_FRAMES, () => ({ keys: [key], aim }));
  await lab.step(1, () => ({ aim }));
  if (options.canary) {
    const planted = foes.find(({ near }) => near)!.foe;
    planted.dazed = 0;
  }
  const took: FoeTook[] = foes.map(({ near, foe }) => ({
    near, away: foe.pos.distanceTo(hero), dazedFor: foe.dazed, fastest: 0, slowest: Infinity, after: 0,
    stars: false, acting: false,
  }));
  const moments: Pictured[] = [];
  const daze = G.player.skillAt(key)!.def.duration ?? 0;
  const dazeFrames = Math.round(daze * 60);
  for (let frame = 1; frame <= dazeFrames + SETOFF_FRAMES; frame++) {
    await lab.step(1, () => ({ aim }));
    foes.forEach(({ foe }, index) => {
      const record = took[index];
      const speed = speedOf(foe);
      if (frame > STOP_FRAMES && frame < dazeFrames - 2) {
        record.fastest = Math.max(record.fastest, speed);
        record.slowest = Math.min(record.slowest, speed);
        if (foe.dazed > 0 && starsOver(foe)) record.stars = true;
        if (foe.dazed > 0 && foe.action) record.acting = true;
      }
      if (frame > dazeFrames) record.after = Math.max(record.after, speed);
    });
    if (options.pictures && frame === STOP_FRAMES) {
      moments.push(await lab.screen('daze: the near foes standing, stars over their heads'));
    }
  }
  took.forEach((record, index) => {
    const which = `${record.near ? 'a near' : 'a far'} foe (${index + 1})`;
    const speeds = `while dazed ${record.slowest.toFixed(2)} to ${record.fastest.toFixed(2)} m/s`;
    lines.push(`  ${which}, ${metres(record.away)} away: dazed for ${record.dazedFor.toFixed(2)} s, ${speeds}, `
      + `${record.stars ? 'stars over it' : 'no stars'}, after ${record.after.toFixed(2)} m/s`);
    if (record.near) {
      if (record.fastest > STILL) problems.push(`daze: ${which} moved while dazed (${record.fastest.toFixed(2)} m/s)`);
      if (!record.stars) problems.push(`daze: ${which} had no stars over it`);
      if (record.acting) problems.push(`daze: ${which} went on with an action while dazed`);
      if (record.after < COMING) problems.push(`daze: ${which} never came on again after it`);
    } else {
      if (record.dazedFor > 0) problems.push(`daze: ${which} was dazed`);
      if (record.slowest < COMING) problems.push(`daze: ${which} stopped coming (${record.slowest.toFixed(2)} m/s)`);
    }
  });
  if (options.canary) {
    const plantedCaught = (problem: string) =>
      problem.includes('(1) moved while dazed') || problem.includes('(1) had no stars');
    const caught = problems.some(plantedCaught);
    lines.push(`  canary, the first near foe's daze cleared at once: ${caught ? 'caught' : 'missed'}`);
    if (caught) problems.splice(0, problems.length, ...problems.filter((problem) => !problem.includes('foe (1)')));
    else problems.push('daze: the canary\'s cleared daze went unseen');
  }
  return moments;
}

/**
 * `lab blink`: every scenario's blink, then the daze; a problem for each check failed and each canary missed. A
 * hero without the blink (only the mage has it) is a problem.
 */
export async function blink(lab: Lab, options: BlinkOptions): Promise<Report> {
  await lab.setup(options.fixture);
  const key = blinkKey();
  if (!key) return { text: '', problems: [`the ${G.player.cls.id} has no blink (--class mage)`] };
  const reach = G.player.skillAt(key)!.def.range ?? 0;
  const lines = [`the ${G.player.cls.id}'s blink on ${key}, reach ${metres(reach)}`];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const scenario of scenarios(reach)) {
    const facing = await setUpFor(lab, options.fixture, scenario);
    const aim = scenario.aim(G.player.pos, facing);
    const landing = await blinkTo(lab, key, aim, false);
    lines.push(landingLine(scenario, landing));
    problems.push(...landingProblems(scenario, landing, reach));
  }
  if (options.canary) {
    const [first] = scenarios(reach);
    const facing = await setUpFor(lab, options.fixture, first);
    const landing = await blinkTo(lab, key, first.aim(G.player.pos, facing), true);
    const found = landingProblems(first, landing, reach);
    const offCaught = found.some((problem) => problem.includes('from where the preview showed'));
    const guardCaught = found.some((problem) => problem.includes('blows landed while he crossed'));
    lines.push(`  canary, the preview read ${metres(CANARY_OFF)} off: ${offCaught ? 'caught' : 'missed'}; `
      + `the guard taken off: ${guardCaught ? 'caught' : 'missed'}`);
    if (!offCaught) problems.push('the canary\'s preview a metre off went unseen');
    if (!guardCaught) problems.push('the canary\'s blows while he crossed went unseen');
  }
  moments.push(...await cooldownRound(lab, key, reach, options, lines, problems));
  if (options.pictures) {
    const [first] = scenarios(reach);
    const facing = await setUpFor(lab, options.fixture, first);
    moments.push(...await pictureBlink(lab, key, first.aim(G.player.pos, facing)));
  }
  lines.push('daze');
  moments.push(...await dazeRound(lab, key, options, lines, problems));
  return { text: lines.join('\n'), problems, moments };
}
