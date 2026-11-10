// The mage's staffs (tools/lab `staffs`, #402): what each school's staff does that nothing else measures.
// - Lightning (Stormcall, src/combat/skills/stormcall.ts): a tap against a full charge at foes held still from the
//   strike's middle outwards. A tap strikes the middle alone, for `least` of a full charge's damage; a full charge
//   reaches out to its radius and no further; each lands only once its arc has travelled; the middle is dazed for
//   the skill's time, a foe further out for less, an elite not at all.
// - Fire (combat/burn.ts): a dummy set alight is bitten twice a second for the burn's time and no longer, each bite
//   the burn's pace, and shows its flames only meanwhile.
// - Healing (Lifethread, skills/lifethread.ts): whom the beam lands on (an ally in the cone before him, the one
//   nearest the aim of two, himself with none there, out of reach or outside the cone), and its heal on himself:
//   every frame, at the pace its tooltip states.
// - Void Lance with a staff, and with none from its first key (the left hand), its second (the right) and both
//   together: a strand from every finger of the hands casting it and none from the other's, each hand's damage and
//   Energy a second a staff's, both hands' half as much again.
// - The charge mark (src/ui/chargeMark.ts), for any class with a drawn skill on the left button (`--class ranger`
//   runs this part alone): the cursor filling from the bottom up in the top-down view and the ring round the
//   crosshair in third person, each as far as the charge, neither for a tap, both gone once it's let go.
// `--canary` makes a tap strike as a full charge does, which the first part must catch.
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Pictured, Report } from './lab';
import type { InstantSkill } from '../../../src/combat/skills/types';
import type { Enemy } from '../../../src/entities/enemy';
import type { Player } from '../../../src/entities/player';
import type { SkillDef } from '../../../src/types';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { igniteEnemy, BURN_TICK } from '../../../src/combat/burn';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { threadTarget } from '../../../src/combat/skills/lifethread';
import { holdingAll, pressing } from './cast';
import { foeKind } from './death';

export interface StaffsOptions {
  fixture: Fixture;
  /** the charge mark pictured as the player sees it */
  pictures: boolean;
  /** plant the fault the charge's checks must catch: a tap that strikes as a full charge does */
  canary: boolean;
}

/** What a part found: its lines, its problems and its pictures. */
interface Found {
  lines: string[];
  problems: string[];
  moments: Pictured[];
}

/** a struck foe is frozen for this long (s) and given this much life: it stands and outlives every blow */
const HELD_STILL = 999;
const SPARE_LIFE = 1e6;
/** how far ahead of the hero the measures aim (m) */
const AIM_AHEAD = 7;
/** the frames a spawned foe is given to rise */
const RISE_FRAMES = 150;
/** the frames a strike is waited for once its key is let go */
const STRIKE_FRAMES = 60;
/** the least frames between letting go and the strike landing: its arc travels first */
const TRAVEL_FRAMES = 6;
/** how far a figure may be off what's expected, as a share (the damage roll is 10% either way) */
const SLACK = 0.25;
/** the frames a tap holds its key */
const TAP_FRAMES = 2;

const emptyFound = (): Found => ({ lines: [], problems: [], moments: [] });

/** The point `metres` ahead of the hero and `right` to his right. */
function ahead(lab: Lab, metres: number, right = 0): THREE.Vector3 {
  const { pos, facing } = lab.player;
  return new THREE.Vector3(
    pos.x + Math.sin(facing) * metres - Math.cos(facing) * right,
    0,
    pos.z + Math.cos(facing) * metres + Math.sin(facing) * right,
  );
}

/** The hero's skill of behaviour `impl`, as his gear has it. */
function skillOf(lab: Lab, impl: string): SkillDef {
  const known = lab.player.known.get(impl);
  if (!known) throw new Error(`lab: staffs: the ${lab.player.cls.id} has no ${impl}`);
  return known.def;
}

/** Every blow a foe takes from here on, in turn: its damage and the frame it landed in (`frame` says which). */
function blowsOn(foe: Enemy, frame: () => number): { amount: number; frame: number }[] {
  const blows: { amount: number; frame: number }[] = [];
  const take = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    const dealt = take(amount, info);
    blows.push({ amount: dealt, frame: frame() });
    return dealt;
  };
  return blows;
}

/** A foe of a strike's measure: how far from its middle it stands, and what it took. */
interface Struck {
  name: string;
  foe: Enemy;
  blows: { amount: number; frame: number }[];
}

/** One strike of Stormcall at foes held out from its middle: what each took, when, and how long each is dazed. */
interface Strike {
  struck: Struck[];
  /** the frames from letting the key go to the first blow, or -1 with none */
  travel: number;
  dazed: number[];
  /** how far charged each cast of it was, as the skill was given it (0..1) */
  powers: number[];
}

/** where the foes stand from the strike's middle (m to the side), by name; `elite` is a hero foe */
const SPOTS: [string, number][] = [['middle', 0], ['near', 2], ['far', 3.6], ['beyond', 6.5], ['elite', -1.4]];

async function strike(lab: Lab, fixture: Fixture, full: boolean): Promise<Strike> {
  await lab.setup({ ...fixture, gear: 'lightning', view: 'top' });
  // (no crits: a crit's share would read as a charge's)
  lab.player.stats.crit = 0;
  let frame = 0;
  const struck = SPOTS.map(([name, side]): Struck => {
    const foe = lab.spawnFoe(foeKind(), ahead(lab, AIM_AHEAD, side), { hero: name === 'elite' });
    return { name, foe, blows: blowsOn(foe, () => frame) };
  });
  await lab.until(() => struck.every(({ foe }) => foe.spawning <= 0), RISE_FRAMES, 'staffs: the foes never rose');
  // (held where they stand, frozen, with life to spare for every blow: a training dummy is moved off its spot as
  // it spawns and is never dazed)
  for (const { foe } of struck) {
    foe.frozen = HELD_STILL;
    foe.life = SPARE_LIFE;
  }
  const aim = ahead(lab, AIM_AHEAD);
  const held = () => pressing('mouse0', aim, true);
  // (the charge each cast is given, read as the skill is cast: its behaviour wrapped for the round)
  const impl = lab.player.known.get('stormcall')!.impl as InstantSkill;
  const cast = impl.cast;
  const powers: number[] = [];
  impl.cast = (player, def, target, power) => {
    powers.push(power);
    cast(player, def, target, power);
  };
  try {
    return await strikeHeld(lab, struck, aim, held, full, powers, (to) => { frame = to; });
  } finally {
    impl.cast = cast;
  }
}

/** The key held (`full`: to a full charge) and let go, the foes followed until the strike has landed. */
async function strikeHeld(lab: Lab, struck: Struck[], aim: THREE.Vector3, held: () => Frame, full: boolean,
  powers: number[], at: (frame: number) => void): Promise<Strike> {
  let frame = 0;
  if (full) {
    await lab.until(() => (lab.player.charge?.share ?? 0) >= 1, 400, 'staffs: Stormcall never charged to full', held);
  } else {
    await lab.step(TAP_FRAMES, held);
  }
  let letGo = -1;
  let dazed: number[] = [];
  for (frame = 0; frame < STRIKE_FRAMES; frame++) {
    at(frame);
    await lab.step(1, () => ({ aim }));
    if (letGo < 0 && struck.some(({ blows }) => blows.length > 0)) {
      letGo = frame;
      dazed = struck.map(({ foe }) => foe.dazed);
    }
  }
  return { struck, travel: letGo, dazed, powers };
}

const whole = (value: number): string => String(Math.round(value));
const taken = (hit: Struck): number => hit.blows.reduce((sum, blow) => sum + blow.amount, 0);

/** Stormcall tapped and charged to full: the reach, the damage, the travel and the daze of each. */
async function charge(lab: Lab, options: StaffsOptions): Promise<Found> {
  const found = emptyFound();
  await lab.setup({ ...options.fixture, gear: 'lightning', view: 'top' });
  const def = skillOf(lab, 'stormcall');
  const least = def.least ?? 1;
  // (the canary: a tap as strong and as wide as a full charge)
  if (options.canary) lab.player.known.get('stormcall')!.def = { ...def, least: 1 };
  const tap = await strike(lab, options.fixture, false);
  if (options.canary) lab.player.known.get('stormcall')!.def = def;
  const charged = await strike(lab, options.fixture, true);
  for (const [name, round] of [['a tap', tap], ['a full charge', charged]] as const) {
    const each = round.struck.map((hit) => `${hit.name} ${whole(taken(hit))}`).join(', ');
    const powers = round.powers.map((power) => power.toFixed(2)).join(', ') || 'never';
    const landed = `landed ${round.travel} frames after the key was let go`;
    found.lines.push(`  ${name}: ${each}; cast at a charge of ${powers}; ${landed}`);
    if (round.travel < TRAVEL_FRAMES) {
      found.problems.push(`${name} landed ${round.travel} frames after the key was let go: its arc never travelled`);
    }
  }
  const by = (round: Strike, name: string) => round.struck.find((hit) => hit.name === name)!;
  const tapMiddle = taken(by(tap, 'middle'));
  const fullMiddle = taken(by(charged, 'middle'));
  if (fullMiddle <= 0) found.problems.push('a full charge never struck the foe at its middle');
  const share = fullMiddle > 0 ? tapMiddle / fullMiddle : 0;
  // (what the skill gives a strike at the charge each was cast at: a tap is let go at its least draw, a little over
  // nothing, and each strike has its own damage roll; held to `least` alone, a tap's high roll over a full
  // charge's low one failed it)
  const strength = (round: Strike) => least + (1 - least) * (round.powers[0] ?? 0);
  const expected = strength(tap) / strength(charged);
  const stated = `the skill's at those charges: ${expected.toFixed(2)}, its least ${least}`;
  found.lines.push(`  a tap's share of a full charge on the middle: ${share.toFixed(2)} (${stated})`);
  if (Math.abs(share - expected) > expected * SLACK) {
    found.problems.push(`a tap dealt ${share.toFixed(2)} of a full charge at the middle, not ${expected.toFixed(2)}`);
  }
  for (const name of ['near', 'far']) {
    if (taken(by(tap, name)) > 0) found.problems.push(`a tap struck the ${name} foe, past a tap's reach`);
    if (taken(by(charged, name)) <= 0) found.problems.push(`a full charge missed the ${name} foe, inside its reach`);
  }
  if (taken(by(charged, 'beyond')) > 0) found.problems.push('a full charge struck the foe beyond its reach');
  if (taken(by(charged, 'near')) >= fullMiddle) {
    found.problems.push('a full charge struck the near foe as hard as the middle');
  }
  const daze = (name: string) => charged.dazed[SPOTS.findIndex(([spot]) => spot === name)] ?? 0;
  const dazedFor = (name: string) => `the ${name} ${daze(name).toFixed(2)} s`;
  found.lines.push(`  dazed by a full charge: ${dazedFor('middle')}, ${dazedFor('near')}, `
    + `the far ${daze('far').toFixed(2)} s, the elite ${daze('elite').toFixed(2)} s (the skill's: ${def.duration} s)`);
  if (Math.abs(daze('middle') - (def.duration ?? 0)) > 0.15) {
    found.problems.push(`the middle foe was dazed ${daze('middle').toFixed(2)} s, not the skill's ${def.duration}`);
  }
  if (!(daze('near') > 0 && daze('near') < daze('middle'))) {
    found.problems.push('the near foe was not dazed for less than the middle');
  }
  if (daze('elite') > 0) found.problems.push('the elite was dazed');
  if (taken(by(charged, 'elite')) <= 0) found.problems.push('a full charge never struck the elite, inside its reach');
  if (options.canary) {
    const caught = found.problems.some((problem) => problem.startsWith('a tap'));
    found.lines.push(`  canary, a tap as strong and wide as a full charge: ${caught ? 'caught' : 'missed'}`);
    found.problems = caught ? [] : ['the canary\'s tap as strong as a full charge went unseen'];
  }
  return found;
}

/** A dummy set alight with the fire staff's burn: its bites, their pace and its flames. */
async function burn(lab: Lab, options: StaffsOptions): Promise<Found> {
  const found = emptyFound();
  await lab.setup({ ...options.fixture, gear: 'fire', view: 'top' });
  lab.player.stats.crit = 0;
  const def = skillOf(lab, 'cinderburst');
  const lit = def.burn;
  if (!lit) throw new Error('lab: staffs: Cinderburst has no burn');
  let frame = 0;
  const foe = lab.spawnFoe('dummy', ahead(lab, AIM_AHEAD));
  const bites = blowsOn(foe, () => frame);
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, 'staffs: the dummy never rose');
  igniteEnemy(foe, lit.perSecond, lit.seconds, lab.player, def);
  const frames = Math.round((lit.seconds + 1.5) / (window.__labClock.frame / 1000));
  let alightFrames = 0;
  for (frame = 0; frame < frames; frame++) {
    await lab.step(1);
    if (foe.burning > 0) alightFrames++;
  }
  const seconds = (count: number) => count * window.__labClock.frame / 1000;
  const expected = Math.round(lit.seconds / BURN_TICK);
  const base = lit.perSecond * BURN_TICK;
  const mean = bites.reduce((sum, bite) => sum + bite.amount, 0) / Math.max(1, bites.length);
  found.lines.push(`  burn: ${bites.length} bites (${expected} expected) of ${mean.toFixed(1)} each (base ${base}), `
    + `alight ${seconds(alightFrames).toFixed(2)} s (the burn's: ${lit.seconds} s)`);
  if (Math.abs(bites.length - expected) > 1) found.problems.push(`the burn bit ${bites.length} times, not ${expected}`);
  if (mean < base * (1 - SLACK)) {
    found.problems.push(`the burn's bites were ${mean.toFixed(1)} each, under its base ${base}`);
  }
  if (Math.abs(seconds(alightFrames) - lit.seconds) > 0.3) {
    found.problems.push(`the dummy showed alight for ${seconds(alightFrames).toFixed(2)} s, not ${lit.seconds}`);
  }
  return found;
}

/** A stand-in for a partner at `at`, for the beam's choice of whom to land on. */
const ally = (at: THREE.Vector3, alive = true): Player => ({ pos: at, alive, away: false }) as unknown as Player;

/** Whom the beam lands on with `allies` in the room (taken out again at once: no frame runs with them there). */
function landsOn(lab: Lab, def: SkillDef, allies: Player[]): Player {
  G.players.push(...allies);
  try {
    return threadTarget(lab.player, { range: def.range ?? 0, arc: def.arc ?? 0 });
  } finally {
    G.players.length -= allies.length;
  }
}

/** The healing beam: whom it lands on, and its heal on the hero himself frame by frame. */
async function thread(lab: Lab, options: StaffsOptions): Promise<Found> {
  const found = emptyFound();
  await lab.setup({ ...options.fixture, gear: 'healing', view: 'top' });
  const def = skillOf(lab, 'lifethread');
  const hero = lab.player;
  const aim = ahead(lab, AIM_AHEAD);
  hero.aim.copy(aim);
  const range = def.range ?? 0;
  const before = ally(ahead(lab, 5, 0.5));
  const nearer = ally(ahead(lab, AIM_AHEAD - 0.5, -0.3));
  const cases: [string, Player[], Player][] = [
    ['an ally in the cone', [before], before],
    ['two allies, one nearer the aim', [before, nearer], nearer],
    ['an ally 40° off the aim', [ally(ahead(lab, 5 * Math.cos(0.7), 5 * Math.sin(0.7)))], hero],
    ['an ally past his reach', [ally(ahead(lab, range + 2))], hero],
    ['a fallen ally in the cone', [ally(ahead(lab, 5), false)], hero],
    ['no ally', [], hero],
  ];
  for (const [name, allies, expected] of cases) {
    const got = landsOn(lab, def, allies);
    const who = (player: Player) => (player === hero ? 'himself' : `the ally ${allies.indexOf(player) + 1}`);
    found.lines.push(`  beam, ${name}: lands on ${who(got)}`);
    if (got !== expected) found.problems.push(`the beam with ${name} landed on ${who(got)}, not ${who(expected)}`);
  }
  // his own heal: Health held low each frame, so each frame's gain is the frame's heal
  lab.lifeShare = 0.3;
  const low = hero.stats.maxLife * lab.lifeShare;
  const frameSeconds = window.__labClock.frame / 1000;
  const gains: number[] = [];
  let beamSeen = false;
  await lab.step(90, () => pressing('mouse0', aim, true), () => {
    gains.push(hero.life - low);
    beamSeen ||= Boolean(G.scene.getObjectByName('Lifethread: beam'));
  });
  await lab.step(10, () => ({ aim }));
  lab.lifeShare = 1;
  const flowing = gains.slice(10);
  const perSecond = flowing.reduce((sum, gain) => sum + gain, 0) / (flowing.length * frameSeconds);
  const stated = (def.heal ?? 0) * (1 + hero.stats.damagePct / 100) + hero.stats.lifeRegen;
  const dry = flowing.filter((gain) => gain <= 0).length;
  const pace = `${perSecond.toFixed(1)} Health a second (its heal and his regeneration: ${stated.toFixed(1)})`;
  found.lines.push(`  beam on himself: ${pace}, `
    + `${dry} of ${flowing.length} frames healing nothing`);
  if (!beamSeen) found.problems.push('the beam was never drawn while its key was held');
  if (G.scene.getObjectByName('Lifethread: beam')) {
    found.problems.push('the beam was still drawn after its key was let go');
  }
  if (Math.abs(perSecond - stated) > stated * 0.1) {
    found.problems.push(`the beam healed ${perSecond.toFixed(1)} a second, not ${stated.toFixed(1)}`);
  }
  if (dry > 0) found.problems.push(`the beam healed nothing in ${dry} frames: it must heal every frame`);
  return found;
}

/** the frames the lance is held: its portal opened and its beam out */
const LANCE_FRAMES = 80;
/** how much harder the lance strikes from both hands, and how much faster it drains, as the issue has it */
const BOTH_HANDS = 1.5;
/** the frames at a held lance's end its damage and drain are read over */
const LANCE_READ = 36;

/** The strands feeding the lance now, a finger's each: how many are drawn, and how many start nearer each hand. */
function strandsShown(lab: Lab): { shown: number; left: number; right: number } {
  const at = new THREE.Vector3();
  const leftHand = lab.joints.handL.getWorldPosition(new THREE.Vector3());
  const rightHand = lab.joints.handR.getWorldPosition(new THREE.Vector3());
  const count = { shown: 0, left: 0, right: 0 };
  G.scene.traverse((object) => {
    if (object.name !== 'Void Lance: strands' || !object.visible) return;
    object.getWorldPosition(at);
    count.shown++;
    if (at.distanceTo(leftHand) < at.distanceTo(rightHand)) count.left++;
    else count.right++;
  });
  return count;
}

/** One way of casting the lance: what he holds, which of the lance's keys are held (by their place among them), and
 *  the hands and strands that must follow. */
interface LanceCast {
  name: string;
  gear: 'arcane' | 'bare';
  keys: number[];
  hands: 'left' | 'right' | 'both';
}

const LANCE_CASTS: LanceCast[] = [
  { name: 'a staff', gear: 'arcane', keys: [0], hands: 'left' },
  { name: 'no staff, its first key', gear: 'bare', keys: [0], hands: 'left' },
  { name: 'no staff, its second key', gear: 'bare', keys: [1], hands: 'right' },
  { name: 'no staff, both its keys', gear: 'bare', keys: [0, 1], hands: 'both' },
];

/** What a cast of the lance came to: its strands by hand, and its damage and Energy a second once it fires. */
interface LanceRead {
  strands: { shown: number; left: number; right: number };
  damage: number;
  drain: number;
}

async function castLance(lab: Lab, options: StaffsOptions, cast: LanceCast): Promise<LanceRead> {
  await lab.setup({ ...options.fixture, gear: cast.gear, view: 'top' });
  lab.player.stats.crit = 0;
  const aim = ahead(lab, AIM_AHEAD);
  const bound = SKILL_KEYS.filter((key) => lab.player.skillAt(key)?.def.impl === 'voidLance');
  const keys = cast.keys.map((index) => bound[index]);
  if (keys.some((key) => !key)) throw new Error(`lab: staffs: ${cast.name}: the lance is on ${bound.length} keys`);
  let frame = 0;
  const foe = lab.spawnFoe(foeKind(), aim);
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, 'staffs: the foe never rose');
  foe.frozen = HELD_STILL;
  foe.life = SPARE_LIFE;
  const blows = blowsOn(foe, () => frame);
  const held = () => holdingAll(keys, aim);
  await lab.step(LANCE_FRAMES, held);
  if (!lab.player.channel) throw new Error(`lab: staffs: ${cast.name}: Void Lance was not held`);
  const from = frame = LANCE_FRAMES;
  const energy = lab.player.energy;
  for (; frame < from + LANCE_READ; frame++) await lab.step(1, held);
  lab.model.root.updateWorldMatrix(true, true);
  const seconds = LANCE_READ * window.__labClock.frame / 1000;
  const dealt = blows.filter((blow) => blow.frame >= from).reduce((sum, blow) => sum + blow.amount, 0);
  const read = { strands: strandsShown(lab), damage: dealt / seconds, drain: (energy - lab.player.energy) / seconds };
  await lab.step(10, () => ({ aim }));
  return read;
}

/** Void Lance with a staff, and with none from the left hand, the right and both: the strands from the fingers of
 *  the hands that cast it, its damage and its Energy a second, half as much again from both. */
async function lance(lab: Lab, options: StaffsOptions): Promise<Found> {
  const found = emptyFound();
  const reads: LanceRead[] = [];
  for (const cast of LANCE_CASTS) {
    const read = await castLance(lab, options, cast);
    reads.push(read);
    const { shown, left, right } = read.strands;
    found.lines.push(`  ${cast.name}: ${shown} strands (${left} at the left hand, ${right} at the right), `
      + `${read.damage.toFixed(0)} damage and ${read.drain.toFixed(1)} Energy a second`);
    const want = { left: cast.hands === 'right' ? 0 : 5, right: cast.hands === 'left' ? 0 : 5 };
    // (both hands are held together: which of them a thumb's strand starts nearer isn't told, only how many)
    const wrong = cast.hands === 'both' ? shown !== 10 : left !== want.left || right !== want.right;
    if (wrong) {
      found.problems.push(`${cast.name}: ${left} strands at the left hand and ${right} at the right, `
        + `not ${want.left} and ${want.right}`);
    }
  }
  const [staff, first, second, both] = reads;
  const def = skillOf(lab, 'voidLance');
  for (const [name, read] of [['a staff', staff], ['its first key', first], ['its second key', second]] as const) {
    if (Math.abs(read.drain - def.cost) > 0.5) {
      found.problems.push(`the lance from ${name} drained ${read.drain.toFixed(1)} Energy a second, not ${def.cost}`);
    }
    if (Math.abs(read.damage / staff.damage - 1) > SLACK / 2) {
      found.problems.push(`the lance from ${name} dealt ${(read.damage / staff.damage).toFixed(2)} of a staff's`);
    }
  }
  const harder = both.damage / first.damage;
  const dearer = both.drain / first.drain;
  found.lines.push(`  both hands against one: ${harder.toFixed(2)} of the damage, ${dearer.toFixed(2)} of the Energy`);
  if (Math.abs(harder - BOTH_HANDS) > SLACK / 2) {
    found.problems.push(`the lance from both hands dealt ${harder.toFixed(2)} of one hand's, not ${BOTH_HANDS}`);
  }
  if (Math.abs(dearer - BOTH_HANDS) > 0.03) {
    found.problems.push(`the lance from both hands drained ${dearer.toFixed(2)} of one hand's, not ${BOTH_HANDS}`);
  }
  return found;
}

/** The charge mark's state on the page. */
interface Mark {
  share: number;
  cursorShown: boolean;
  ringShown: boolean;
  /** how far up the cursor is filled, and the ring drawn round (0..1), as the page has them */
  filled: number;
  drawn: number;
  browserCursorHidden: boolean;
  /** how far the drawn cursor's point is from the mouse (css px), and its size against the browser's cursor's */
  cursorOff: number;
  cursorSize: number;
}

/** the game's cursor: its art's size and the point in it that points (css px: index.html's `--cursor`, `3 2`) */
const CURSOR_SIZE = 32;
const CURSOR_POINT = { x: 3, y: 2 };

function readMark(lab: Lab): Mark {
  const cursor = document.getElementById('charge-cursor')!;
  const ring = document.getElementById('charge-ring')!;
  const box = cursor.getBoundingClientRect();
  const slid = /translateY\(([\d.]+)%/.exec(cursor.querySelector<HTMLElement>('b')!.style.transform);
  const turned = ['.cr-right > i', '.cr-left > i'].map((half) => {
    const turn = /rotate\(([\d.]+)deg/.exec(ring.querySelector<HTMLElement>(half)!.style.transform);
    return turn ? Number(turn[1]) : 0;
  });
  return {
    share: lab.player.charge?.share ?? 0,
    cursorShown: !cursor.classList.contains('hidden'),
    ringShown: !ring.classList.contains('hidden'),
    filled: slid ? 1 - Number(slid[1]) / 100 : 0,
    drawn: (turned[0] + turned[1]) / 360,
    browserCursorHidden: document.documentElement.classList.contains('charging'),
    cursorOff: Math.hypot(box.left + CURSOR_POINT.x - input.mouse.x, box.top + CURSOR_POINT.y - input.mouse.y),
    cursorSize: box.width / CURSOR_SIZE,
  };
}

/** the frames the charge is held for its mark, and how far the mark may be off the charge */
const MARK_FRAMES = 45;
const MARK_SLACK = 0.03;

/** The charge mark in a view: none for a tap, as far as the charge while held, gone once let go. */
async function markIn(lab: Lab, options: StaffsOptions, view: 'top' | 'third', gear: Fixture['gear']): Promise<Found> {
  const found = emptyFound();
  await lab.setup({ ...options.fixture, gear, view });
  const aim = ahead(lab, AIM_AHEAD);
  const cursor = view === 'top';
  const shown = (mark: Mark) => (cursor ? mark.cursorShown : mark.ringShown);
  const tapped = await lab.step(TAP_FRAMES, () => pressing('mouse0', aim, true), () => readMark(lab));
  if (tapped.some(shown)) found.problems.push(`${view}: the charge mark showed for a tap`);
  await lab.until(() => !lab.player.casting, 240, 'staffs: the tap never ended', () => ({ aim }));
  const held = await lab.step(MARK_FRAMES, () => pressing('mouse0', aim, true), () => readMark(lab));
  const last = held[held.length - 1];
  const level = cursor ? last.filled : last.drawn;
  const marked = `the ${cursor ? 'cursor filled' : 'ring drawn'} ${level.toFixed(2)}`;
  found.lines.push(`  ${view}: charged ${last.share.toFixed(2)}, ${marked}`);
  if (last.share <= 0) found.problems.push(`${view}: the skill never charged while its key was held`);
  if (!shown(last)) found.problems.push(`${view}: no charge mark while the skill charged`);
  if (cursor ? last.ringShown : last.cursorShown) found.problems.push(`${view}: the other view's charge mark showed`);
  if (Math.abs(level - last.share) > MARK_SLACK) {
    found.problems.push(`${view}: the mark showed ${level.toFixed(2)} at a charge of ${last.share.toFixed(2)}`);
  }
  if (cursor && !last.browserCursorHidden) {
    found.problems.push('top: the browser\'s cursor was left over the drawn one');
  }
  if (cursor && last.cursorOff > 1) {
    found.problems.push(`top: the drawn cursor's point was ${last.cursorOff.toFixed(0)} px from the mouse`);
  }
  if (cursor && Math.abs(last.cursorSize - 1) > 0.02) {
    found.problems.push(`top: the drawn cursor was ${last.cursorSize.toFixed(2)} times the browser's cursor's size`);
  }
  if (options.pictures) found.moments.push(await lab.screen(`the charge mark, ${view}, at ${last.share.toFixed(2)}`));
  await lab.step(TAP_FRAMES, () => ({ aim }));
  const after = readMark(lab);
  if (after.cursorShown || after.ringShown || after.browserCursorHidden) {
    found.problems.push(`${view}: the charge mark stayed after the key was let go`);
  }
  return found;
}

/** where the hero stands when the command says nowhere (the lab's own spot, off the dais and clear of props) */
const SPOT: [number, number] = [12, 22];

/** The fixture with the hero facing the arena's middle, unless it says which way: the measures aim `AIM_AHEAD` m
 *  before him, and from the lab's spot facing out that is past the wall, where no foe may stand (stood there, they
 *  were moved back inside, 4 m off the strike). */
function facingIn(fixture: Fixture): Fixture {
  const at = fixture.at ?? SPOT;
  return { ...fixture, at, facing: fixture.facing ?? Math.atan2(-at[0], -at[1]) };
}

/** `lab staffs`: each part in turn; `--class ranger` (any class without schools) runs the charge mark alone. */
export async function staffs(lab: Lab, command: StaffsOptions): Promise<Report> {
  const options = { ...command, fixture: facingIn(command.fixture) };
  await lab.setup(options.fixture);
  const mage = Boolean(lab.player.cls.schools);
  const parts: [string, Found][] = [];
  if (mage) {
    parts.push(['Stormcall, a tap and a full charge', await charge(lab, options)]);
    if (!options.canary) {
      parts.push(['the fire staff\'s burn', await burn(lab, options)]);
      parts.push(['Lifethread, the healing beam', await thread(lab, options)]);
      parts.push(['Void Lance, with a staff and from each hand with none', await lance(lab, options)]);
    }
  }
  if (!options.canary) {
    const gear = mage ? 'lightning' : options.fixture.gear;
    for (const view of ['top', 'third'] as const) {
      parts.push([`the charge mark, ${view}`, await markIn(lab, options, view, gear)]);
    }
  }
  const text = parts.map(([name, found]) => [name, ...found.lines].join('\n')).join('\n');
  return {
    text,
    problems: parts.flatMap(([, found]) => found.problems),
    moments: parts.flatMap(([, found]) => found.moments),
  };
}
