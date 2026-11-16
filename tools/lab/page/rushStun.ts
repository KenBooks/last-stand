// Bull Rush rammed through packs (tools/lab `rush --scenarios stun`, #397, #560): foes stood dazed on its line, a pack
// at a time on a fresh set-up, the charge cast through them its whole range. The packs: seven common foes (their load
// stops it short and its weight staggers him), three (slowed a little, no stun), seven a hair from death (the dead
// weigh nothing on it and half for the stun: as far as ever, no stun), four elites (two weights each: the third stops
// it), a boss alone (struck, never carried or shoved: the charge stops at it, and he's staggered), and seven with a
// shield held (its own, shorter stun). From the charge's stop the player holds W and the basic attack every frame, as
// one would to get away or strike back. Each is followed until he walks off: the foes met and killed, the most load
// it bore (each living foe carried as `combat/ram.ts` weighs it, lightened by the hero's All Damage) against its most,
// how far it went against its range, the stun's start against the stop and its length against the time its weight
// gives (the skill as the weapons held tune it), how far he moved and whether anything was cast while stunned, and
// that he moved and cast again once free; with no stun, that he cast in the charge's hold. The canary plants a fault
// for each: the big pack's stun cut short, the elite pack's most lifted out of reach, and the boss carried as met.
import * as THREE from 'three';
import { screenArea, type Lab, type Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { HeldStyle, PushDef, RamDef } from '../../../src/types';
import { G } from '../../../src/state';
import { BIOMES } from '../../../src/data/biomes';
import { heftOf, loadOf, stunOf } from '../../../src/combat/ram';
import { bindKnown, pressing, skillNamed } from './cast';
import { foeKind } from './death';
import { fixtureOf, waysOf, type RushOptions } from './rush';

/** What the canary plants in a pack: its stun cut short, its most lifted out of reach, or the boss carried. */
type Plant = 'short' | 'unbounded' | 'carried';

/** the words of the problems each plant makes, any of which its canary looks for */
const PLANT_MARKS: Record<Plant, string[]> = {
  short: ['due'],
  unbounded: ['past its most'],
  carried: ['the boss was carried'],
};

/** What a pack's charge must come to: stopped short by its load or a boss, or going its whole range. */
type Ends = 'short' | 'whole' | 'some';

/** A pack the charge is rammed through: its foes (m ahead, m to his left), how they stand, the weapons held. */
interface Pack {
  name: string;
  foes: { ahead: number; across: number }[];
  dies?: boolean;
  elite?: boolean;
  boss?: boolean;
  gear: HeldStyle;
  ends: Ends;
  plant?: Plant;
  /** pictured as it stops and through the stun */
  pictured?: boolean;
}

/** seven foes on the line, near enough each other that a charge stopped by its load stops among them */
const SEVEN = [
  { ahead: 2.2, across: 0 }, { ahead: 3, across: 0.6 }, { ahead: 3.8, across: -0.6 }, { ahead: 4.6, across: 0.2 },
  { ahead: 5.4, across: -0.5 }, { ahead: 6.2, across: 0.5 }, { ahead: 7, across: -0.1 },
];
const PACKS: Pack[] = [
  { name: 'a big pack', foes: SEVEN, gear: 'oneHanded', ends: 'short', plant: 'short', pictured: true },
  {
    name: 'a small pack',
    foes: [{ ahead: 2.5, across: 0 }, { ahead: 4.5, across: 0.4 }, { ahead: 6.5, across: -0.4 }],
    gear: 'oneHanded',
    ends: 'some',
  },
  { name: 'a big pack killed', foes: SEVEN, dies: true, gear: 'oneHanded', ends: 'whole' },
  {
    name: 'an elite pack',
    foes: [{ ahead: 2.5, across: 0 }, { ahead: 4, across: 0.5 }, { ahead: 5.5, across: -0.5 }, { ahead: 7, across: 0 }],
    elite: true,
    gear: 'oneHanded',
    ends: 'short',
    plant: 'unbounded',
  },
  {
    name: 'a boss',
    foes: [{ ahead: 5, across: 0 }],
    boss: true,
    gear: 'oneHanded',
    ends: 'short',
    plant: 'carried',
    pictured: true,
  },
  { name: 'a big pack with a shield', foes: SEVEN, gear: 'shield', ends: 'short' },
];

/** a living foe's life: past what the charge deals it */
const LIVING = 1e5;
/** frames waited for the foes to rise, and for the charge to stop (s) */
const RISE_FRAMES = 300;
const STOP_WITHIN = 2;
/** followed past the stun's end (or the charge's hold, with none) this long, for him to walk and strike again (s) */
const AFTER = 0.8;
/** moved further than this while stunned is a move (m), and less than `WALKED` after it is standing still */
const STILL = 0.01;
const WALKED = 0.2;
/** the stun may start a frame late and end a frame off its time (s) */
const SLACK = 1.5 / 60;
/** a charge this much short of its range (m) was stopped short; one going its whole range comes within it */
const SHORT_BY = 0.5;
/** a charge going on further than this (m) once its load reached its most went past it (it stops in that frame) */
const PAST_MOST = 0.3;
/** a boss moved further than this off its spot (m) was shoved */
const BOSS_MOVED = 0.3;
/** the moments of a pictured pack's stun, as shares of it */
const STRIP = [0, 0.4, 0.9];
const PICTURE_MARGIN = 170;

/** What a ram through a pack came to. */
interface Rammed {
  pack: Pack;
  ram: RamDef;
  push: PushDef;
  damagePct: number;
  /** the foes the charge's blow met, those it killed, their weight for the stun, and the most living weight it bore */
  met: number;
  killed: number;
  weight: number;
  bore: number;
  /** how far it went on once its load had reached its most (m) */
  pastMost: number;
  /** how far the charge took him, and a boss's: how near his body stopped to it and how far it moved (m) */
  went: number;
  bossGap: number;
  bossMoved: number;
  bossCarried: boolean;
  /** when it stopped and when the stun began and ended (s from the press; -1: never) */
  stoppedAt: number;
  stunFrom: number;
  stunTo: number;
  /** the most he moved from where the stun began while it held (m), and whether anything was cast meanwhile */
  movedStunned: number;
  castStunned: boolean;
  /** once free: how far he walked and whether he cast; and with no stun, whether he cast in the charge's hold */
  walkedAfter: number;
  castAfter: boolean;
  castInHold: boolean;
  /** whether the canary's plant went in */
  planted: boolean;
  moments: Pictured[];
}

const seconds = (value: number): string => `${value.toFixed(2)} s`;
const metres = (value: number): string => `${value.toFixed(2)} m`;
const flat = (from: THREE.Vector3, to: THREE.Vector3): number => Math.hypot(to.x - from.x, to.z - from.z);

/** Whether the hero is casting or holding anything (a cast under way, or a channel). */
function busy(): boolean {
  const hero = G.player;
  return hero.casting !== null || hero.channel !== null;
}

/** The foes a ram's charge struck, and those it carried (each noted as it happens: one let go in the frame the load
 *  stopped the charge was gone from what rode before him by the frame's end). */
interface Touched {
  struck: Set<Enemy>;
  carried: Set<Enemy>;
}

/** The foes of `pack` risen before a hero at `at` facing `facing`, standing dazed, each noting when it's struck and
 *  carried. */
async function packOf(lab: Lab, pack: Pack, at: THREE.Vector3, facing: number, touched: Touched): Promise<Enemy[]> {
  const { forward, left } = waysOf(facing);
  const foes = pack.foes.map((placed) => {
    const spot = at.clone().addScaledVector(forward, placed.ahead).addScaledVector(left, placed.across);
    const kind = pack.boss ? BIOMES[G.arena.biome].bosses[0].id : foeKind();
    return lab.spawnFoe(kind, spot, { hero: Boolean(pack.elite) });
  });
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), RISE_FRAMES, 'the foes never rose');
  for (const foe of foes) {
    foe.dazed = 999;
    foe.life = pack.dies ? 1 : LIVING;
    const takeDamage = foe.takeDamage.bind(foe);
    foe.takeDamage = (amount, info) => {
      touched.struck.add(foe);
      return takeDamage(amount, info);
    };
    const carry = foe.carry.bind(foe);
    foe.carry = (by, way, seconds) => {
      carry(by, way, seconds);
      if (foe.carried?.by === G.player) touched.carried.add(foe);
    };
  }
  return foes;
}

/** The weight the foes the charge struck put up, as the skill weighs them for the stun. */
function weightOf(ram: RamDef, struck: Set<Enemy>): number {
  let weight = 0;
  for (const foe of struck) weight += heftOf(ram, foe, !foe.alive);
  return weight;
}

/** The living weight the hero's charge carried: every foe it took up, none let go before it stopped (all are let go
 *  at its stop, and a kill was never carried). */
function borne(ram: RamDef, carried: Set<Enemy>): number {
  let weight = 0;
  for (const foe of carried) weight += heftOf(ram, foe, false);
  return weight;
}

/** The charge the hero knows now (as the weapons held tune it), its ram and push. */
function chargeNow(): { ram: RamDef; push: PushDef } {
  const def = G.player.known.get('bullRush')?.def;
  if (!def?.ram || !def.push) throw new Error('lab: rush: Bull Rush has no ram or push in its data');
  return { ram: def.ram, push: def.push };
}

/** With the canary, the pack's plant put in before the press (its most lifted out of reach, on a copy of the charge
 *  the hero knows: its own may be the class's data, which every set-up after would keep): what takes it out again,
 *  or null where none went in (a set-up with the same weapons keeps the charge as it was, plant and all). */
function plantBefore(plant: Plant | undefined): (() => void) | null {
  const known = G.player.known.get('bullRush');
  if (plant !== 'unbounded' || !known?.def.push) return null;
  const own = known.def;
  known.def = { ...own, push: { ...own.push!, most: 1e6 } };
  return () => {
    known.def = own;
  };
}

/** The charge rammed through `pack` on a fresh set-up, followed until he has walked off after it. */
async function ramThrough(lab: Lab, options: RushOptions, pack: Pack, canary: boolean): Promise<Rammed> {
  G.arena.restoreProps();
  const fixture = { ...fixtureOf(options), gear: pack.gear };
  await lab.setup(fixture);
  const hero = G.player;
  bindKnown('bullRush');
  const charge = skillNamed('bullRush');
  const attack = skillNamed('mouse0');
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const { ram, push } = chargeNow();
  const facing = fixture.facing ?? hero.facing;
  const { forward } = waysOf(facing);
  const touched: Touched = { struck: new Set(), carried: new Set() };
  const { struck } = touched;
  const foes = await packOf(lab, pack, hero.pos, facing, touched);
  const plant = canary ? pack.plant : undefined;
  const range = charge.def.range ?? 0;
  const aim = hero.pos.clone().addScaledVector(forward, range);
  const frame = window.__labClock.frame / 1000;
  const start = hero.pos.clone();
  const boss = pack.boss ? foes[0] : null;
  const bossAt = boss?.pos.clone() ?? null;
  const done: Rammed = {
    pack, ram, push, damagePct: hero.stats.damagePct, met: 0, killed: 0, weight: 0, bore: 0, pastMost: 0, went: 0,
    bossGap: 0, bossMoved: 0, bossCarried: false, stoppedAt: -1, stunFrom: -1, stunTo: -1, movedStunned: 0,
    castStunned: false, walkedAfter: 0, castAfter: false, castInHold: false, planted: false, moments: [],
  };
  const unplant = plantBefore(plant);
  done.planted = unplant !== null;
  let stunAt: THREE.Vector3 | null = null;
  let mostAt: THREE.Vector3 | null = null;
  let freeAt: THREE.Vector3 | null = null;
  let freeFrom = -1;
  const strip = [...STRIP];
  // (the crosshair of the close views onto the aim first, as the player would)
  await lab.step(10, () => ({ aim, sight: aim }));
  const most = Math.round((STOP_WITHIN + ram.most + AFTER) / frame);
  for (let index = 0; index < most; index++) {
    // (the charge pressed, then from its stop W and the basic attack held every frame: held as it ran, a cleave
    // killed a foe a hair from death before the charge met it)
    const input = index === 0 ? { ...pressing(charge.key, aim, true), sight: aim } : { aim };
    if (done.stoppedAt >= 0) {
      const attacking = pressing(attack.key, aim, true);
      Object.assign(input, attacking, { keys: [...(attacking.keys ?? []), 'w'] });
    }
    await lab.step(1, () => input);
    const now = index * frame;
    const reached = loadOf(push, borne(ram, touched.carried), done.damagePct) >= push.most;
    if (reached && !mostAt) mostAt = hero.pos.clone();
    if (boss && struck.has(boss) && plant === 'carried' && !done.planted) {
      boss.carry(hero, forward, 0.4);
      done.planted = true;
    }
    if (boss?.carried) done.bossCarried = true;
    const dash = hero.dash;
    if (done.stoppedAt < 0 && index > 0 && (dash === null || dash.t >= dash.dur)) {
      done.stoppedAt = now;
      done.went = flat(start, hero.pos);
      done.pastMost = mostAt ? flat(mostAt, hero.pos) : 0;
      if (boss) done.bossGap = flat(hero.pos, boss.pos) - hero.radius - boss.radius;
      if (pack.pictured && options.pictures) done.moments.push(await moment(lab, `${pack.name}, as the charge stops`));
    }
    if (hero.stunned) {
      if (done.stunFrom < 0) {
        done.stunFrom = now;
        stunAt = hero.pos.clone();
        if (plant === 'short') {
          hero.stunnedUntil = G.time;
          done.planted = true;
        }
      }
      done.stunTo = now + frame;
      if (stunAt) done.movedStunned = Math.max(done.movedStunned, flat(stunAt, hero.pos));
      done.castStunned ||= busy();
      if (pack.pictured && options.pictures && strip.length && (now - done.stunFrom) / hero.stunLong >= strip[0]) {
        strip.shift();
        done.moments.push(await moment(lab, `${pack.name}, staggered ${seconds(now - done.stunFrom)} in`));
      }
      continue;
    }
    if (done.stoppedAt < 0) continue;
    // (the charge's hold, while its dash still stands after the stop: his skills are cast there unless stunned)
    if (hero.dash && done.stunFrom < 0) done.castInHold ||= busy();
    if (hero.dash) continue;
    if (freeFrom < 0) {
      freeFrom = now;
      freeAt = hero.pos.clone();
      // (the boss as he comes free: the walk after it pushes it as his body does any foe's)
      if (boss && bossAt) done.bossMoved = flat(bossAt, boss.pos);
    }
    if (freeAt) done.walkedAfter = Math.max(done.walkedAfter, flat(freeAt, hero.pos));
    done.castAfter ||= busy();
    if (now - freeFrom >= AFTER) break;
  }
  unplant?.();
  done.bore = borne(ram, touched.carried);
  done.met = struck.size;
  done.killed = [...struck].filter((foe) => !foe.alive).length;
  done.weight = weightOf(ram, struck);
  return done;
}

/** One moment of a ram, as the player sees it round the hero, and close from his left. */
async function moment(lab: Lab, label: string): Promise<Pictured> {
  const hero = G.player;
  const points = [hero.pos.clone().setY(2.4), hero.pos.clone()];
  const seen = await lab.screen(label, [], screenArea(points, PICTURE_MARGIN));
  const at = hero.pos.clone().setY(1.1);
  const close = lab.capture(['left'], { at, distance: 5 });
  return { label, tiles: [...seen.tiles, ...close], notes: [] };
}

/** A ram's load and its stop against what its pack must come to, as lines and problems. */
function judgeLoad(done: Rammed, range: number): { lines: string[]; problems: string[] } {
  const { pack, push } = done;
  const name = pack.name;
  const load = loadOf(push, done.bore, done.damagePct);
  const lines = [
    `    bore ${done.bore.toFixed(1)} of living weight (a load of ${load.toFixed(2)} at +${done.damagePct.toFixed(0)}%`
      + ` All Damage, its most ${push.most}); went ${metres(done.went)} of ${metres(range)}`,
  ];
  const problems: string[] = [];
  const short = done.went < range - SHORT_BY;
  if (pack.ends === 'short' && !short) problems.push(`${name}: never stopped short (${metres(done.went)})`);
  if (pack.ends === 'whole' && short) problems.push(`${name}: stopped short (${metres(done.went)}), nothing carried`);
  if (!pack.boss && pack.ends === 'short' && load < push.most) {
    problems.push(`${name}: stopped short under its most (a load of ${load.toFixed(2)})`);
  }
  if (done.pastMost > PAST_MOST) problems.push(`${name}: went on ${metres(done.pastMost)} past its most`);
  if (pack.boss) {
    lines.push(`    stopped ${metres(done.bossGap)} from the boss's body, the boss moved ${metres(done.bossMoved)}`);
    if (done.bossCarried) problems.push(`${name}: the boss was carried`);
    if (done.bossMoved > BOSS_MOVED) problems.push(`${name}: the boss was shoved ${metres(done.bossMoved)}`);
  }
  return { lines, problems };
}

/** A ram's stun against the time its weight gives, and what he could do, as lines and problems. */
function judgeStun(done: Rammed): { lines: string[]; problems: string[] } {
  const want = stunOf(done.ram, done.weight);
  const name = done.pack.name;
  const lines: string[] = [];
  const problems: string[] = [];
  const stunned = done.stunFrom >= 0 ? done.stunTo - done.stunFrom : 0;
  if (done.stunFrom >= 0) {
    lines.push(`    staggered from ${seconds(done.stunFrom - done.stoppedAt)} after the stop for ${seconds(stunned)};`
      + ` moved ${metres(done.movedStunned)} meanwhile, ${done.castStunned ? 'casting' : 'casting nothing'}`);
  } else lines.push('    not staggered');
  const hold = done.castInHold ? 'casting in the charge\'s hold' : 'casting nothing in the charge\'s hold';
  const after = `    then walked ${metres(done.walkedAfter)} and ${done.castAfter ? 'cast' : 'cast nothing'}`;
  lines.push(done.stunFrom < 0 ? `${after}, ${hold}` : after);
  if (want > 0) {
    if (done.stunFrom < 0) problems.push(`${name}: not staggered, ${seconds(want)} due`);
    else {
      if (Math.abs(done.stunFrom - done.stoppedAt) > SLACK) problems.push(`${name}: the stun began off the stop`);
      const off = Math.abs(stunned - want) > SLACK;
      if (off) problems.push(`${name}: staggered ${seconds(stunned)}, ${seconds(want)} due`);
      if (done.movedStunned > STILL) problems.push(`${name}: moved ${metres(done.movedStunned)} while staggered`);
      if (done.castStunned) problems.push(`${name}: cast while staggered`);
    }
  } else {
    if (done.stunFrom >= 0) problems.push(`${name}: staggered ${seconds(stunned)}, none due`);
    if (!done.castInHold) problems.push(`${name}: cast nothing in the charge's hold`);
  }
  if (done.walkedAfter < WALKED) problems.push(`${name}: never walked off after it`);
  if (!done.castAfter) problems.push(`${name}: cast nothing after it`);
  return { lines, problems };
}

/** A ram's lines and problems: what it met and weighed, what it bore and how far it went, and the stun. */
function judge(done: Rammed, range: number): { lines: string[]; problems: string[] } {
  const want = stunOf(done.ram, done.weight);
  const { pack, ram } = done;
  const lines = [
    `  ${pack.name} (${pack.gear}): met ${done.met} of ${pack.foes.length} (${done.killed} killed), weighing`
      + ` ${done.weight.toFixed(1)} against the least ${ram.at}: a stagger of ${seconds(want)} due`
      + ` (${ram.least}-${ram.most} s)`,
  ];
  const problems: string[] = [];
  if (done.met === 0) problems.push(`${pack.name}: the charge met nothing`);
  if (done.stoppedAt < 0) problems.push(`${pack.name}: the charge never stopped`);
  const load = judgeLoad(done, range);
  const stun = judgeStun(done);
  lines.push(...load.lines, ...stun.lines);
  problems.push(...load.problems, ...stun.problems);
  for (const problem of problems) lines.push(`    ! ${problem}`);
  return { lines, problems };
}

/** `lab rush`'s packs: the charge rammed through each; with the canary, whether each plant was caught. */
export async function stunsOf(lab: Lab, options: RushOptions): Promise<{
  lines: string[]; problems: string[]; moments: Pictured[]; canary: string[];
}> {
  bindKnown('bullRush');
  const range = skillNamed('bullRush').def.range ?? 0;
  const lines = ['rammed (#397, #560):'];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const canary: string[] = [];
  for (const pack of PACKS) {
    const done = await ramThrough(lab, options, pack, options.canary);
    const judged = judge(done, range);
    lines.push(...judged.lines);
    moments.push(...done.moments);
    problems.push(...judged.problems);
    const plant = options.canary ? pack.plant : undefined;
    if (!plant) continue;
    const caught = judged.problems.some((problem) => PLANT_MARKS[plant].some((mark) => problem.includes(mark)));
    lines.push(`canary: ${pack.name}'s plant (${plant}) ${caught ? 'caught' : 'missed'}`);
    if (!done.planted) canary.push(`the canary never planted ${plant} in ${pack.name}`);
    else if (!caught) canary.push(`the canary's ${plant} in ${pack.name} went unseen`);
  }
  return { lines, problems, moments, canary };
}
