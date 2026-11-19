// The bosses' fights (tools/lab `boss`): the ladder of each battleground, the shared boss toolkit through the
// Bell-Warden (entities/bossKit.ts, entities/bellWarden.ts), and how long each boss takes the hero to bring down.
//
// - `ladder`: each battleground's boss waves set off as the game sets them off (the run's wave and its timer), the boss
//   the wave sends read off the run (`RunState.boss`) and the banner's line, against its ladder's rung for the wave.
// - `phases`: the Bell-Warden's life taken down to just over and under each phase's share: its phase as the game has
//   it, and the banner its phase brings.
// - `toll`: the Bell-Warden left to toll at the hero near it (stunned, for its time, its warning first), far off
//   (faded: not stunned), and with a warrior's shield raised towards it (not stunned: `--class warrior --gear shield`).
// - `chains`: each chain struck from its own side until it breaks: broken one by one, all four dropping the bell for
//   its weak-spot window (double damage taken, nothing tolled), then the chains whole again and the bell up.
// - `stand`: the hero walked into the Bell-Warden: it gives way a hair, and he's held off its body.
// - `grab`: a hero at the ghosts' ring seized, lifted, carried out and hurt as he lands, not again within his grace;
//   one well out of it never seized.
// - `swing`: its bell through a toll and a walk, as a pendulum about the yoke, no jolt, no spin (bossSwing.ts).
// - `compiles`: every effect the Bell-Warden's fight draws (a toll, a double toll, a shard, the bell dropped), drawn:
//   no program compiled meanwhile.
// - `ttk`: the hero's basic attack held on a boss held still, its damage a second, and from it the time each boss
//   takes at the wave it comes on (the Colossus at 5, the Bell-Warden at 10), with and without its weak windows.
//
// - `pictures` (asked for alone, not run by default): the Bell-Warden in each of its moments, a sheet for the eye.
//
// `--canary` plants a fault each part must catch: a ladder turned round, a phase's share moved, a toll that stuns no
// one near it, a shield that stops nothing, chains that take no harm, a boss that yields as a small foe does, ghosts that seize no one, a program compiled in the fight, and an attack
// that deals nothing.
import * as THREE from 'three';
import { bellSwing } from './bossSwing';
import type { Fixture, Lab, Pictured, Report, ViewName } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { BiomeId, BossRung, BossWave } from '../../../src/data/biomes';
import type { EnemyId } from '../../../src/data/enemies';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { BIOMES, BIOME_IDS, bossOfWave } from '../../../src/data/biomes';
import { ENEMIES, SCALING } from '../../../src/data/enemies';
import { BELL_WARDEN } from '../../../src/data/foes/bellwarden';
import { WAVES } from '../../../src/data/waves';
import { damageTaken } from '../../../src/entities/bossKit';
import { fx } from '../../../src/entities/enemyAI';
import { startNextWave } from '../../../src/game/run';
import { pressing } from './cast';
import { ARENA } from '../../../src/data/balance';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { heart, pods, rootCompiles, rootLook, rootPhases, rootPictures, rootTtkLines, vines } from './bossRootmother';

/** The parts the command runs, in order. */
export type BossPart = 'ladder' | 'phases' | 'toll' | 'chains' | 'stand' | 'grab' | 'swing' | 'rootPhases' | 'vines'
  | 'pods' | 'heart' | 'compiles' | 'ttk' | 'pictures' | 'rootPictures' | 'rootLook';
export const BOSS_PARTS: BossPart[] = [
  'ladder', 'phases', 'toll', 'chains', 'stand', 'grab', 'swing', 'rootPhases', 'vines', 'pods', 'heart', 'compiles', 'ttk',
];
/** the parts that picture moments for the eye alone, asked for by name */
const PICTURE_PARTS: BossPart[] = ['pictures', 'rootPictures', 'rootLook'];

export interface BossOptions {
  fixture: Fixture;
  /** the parts to run (all by default) */
  parts?: BossPart[];
  /** plant a fault each part must catch */
  canary: boolean;
}

/** where the hero stands (m), off the dais and clear of props, and the boss's distance for each case (m) */
const SPOT: [number, number] = [12, 12];
const NEAR = 7;
const FAR = 19;
/** how many boss waves of each ladder are set off: twice round the Crypt's */
const RUNGS = 4;
/** the most frames a boss takes to rise, a toll to come, and a wave to start */
const RISE_FRAMES = 200;
const TOLL_FRAMES = 420;
const WAVE_FRAMES = 30;
/** how far off its stun's time a stun may be (s): the frame it lands and the frame it ends */
const STUN_SLACK = 0.1;
/** how long the hero's attack is held on a boss for its damage a second (s) */
const TTK_HOLD = 8;
/** frames a second on the lab's clock */
export const FPS = 60;

/** frames on the lab's clock in seconds */
export const secondsOf = (frames: number): number => frames / FPS;
/** a number with `digits` decimals */
export const fixed = (value: number, digits = 2): string => value.toFixed(digits);

/** The way from the hero towards the arena's middle, on the floor: a boss placed along it stands inside the wall. */
function inward(): THREE.Vector3 {
  return new THREE.Vector3(-G.player.pos.x, 0, -G.player.pos.z).normalize();
}

/** how far either way round the hero a boss's spot is looked for (rad), in steps of `CLEAR_STEP` */
const CLEAR_MOST = Math.PI;
const CLEAR_STEP = 0.15;

/**
 * A spot `away` m from the hero, nearest the way to the arena's middle, where a boss of `radius` stands clear of the
 * props with nothing between it and him: an obelisk between them took the mage's bolts, his damage a second 11.
 */
function clearSpot(away: number, radius: number): THREE.Vector3 {
  const hero = G.player.pos;
  const inward0 = inward();
  for (let turn = 0; turn <= CLEAR_MOST; turn += CLEAR_STEP) {
    for (const sign of turn === 0 ? [1] : [1, -1]) {
      const way = inward0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * sign);
      const at = hero.clone().addScaledVector(way, away).setY(0);
      const inside = Math.hypot(at.x, at.z) < ARENA.radius - radius;
      if (inside && !inObstacle(at, radius) && lineClear(hero.x, hero.z, at.x, at.z, 0.5)) return at;
    }
  }
  throw new Error(`lab: no spot ${away} m from the hero clear for a boss`);
}

/** The hero set up in `biome`, at the spot, facing the arena's middle. */
export async function standIn(lab: Lab, fixture: Fixture, biome: BiomeId): Promise<void> {
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  const facing = Math.atan2(-SPOT[0], -SPOT[1]);
  await lab.setup({ at: SPOT, facing, ...fixture });
}

/** Boss `kind` risen `away` m from the hero towards the arena's middle, facing him; dazed (thinking nothing) unless
 *  `thinks`. */
async function bossAt(lab: Lab, kind: EnemyId, away: number, thinks: boolean, wave = 1): Promise<Enemy> {
  const at = clearSpot(away, ENEMIES[kind].radius);
  const boss = lab.spawnFoe(kind, at, { wave });
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  boss.facing = boss.targetFacing = Math.atan2(G.player.pos.x - boss.pos.x, G.player.pos.z - boss.pos.z);
  boss.dazed = thinks ? 0 : 1e4;
  return boss;
}

// --- the ladder -------------------------------------------------------------------------------------------

/** The exception of `biome`'s holding boss wave `wave`, if one does (data/biomes.ts `bossWaves`). */
function exceptionOn(biome: BiomeId, wave: number): BossWave | undefined {
  return BIOMES[biome].bossWaves?.find((held) => wave >= held.wave && (wave - held.wave) % held.every === 0);
}

/**
 * Each battleground's boss waves set off: the boss the run sends and the banner's line against what the schedule says,
 * worked out here: an exception's boss on its waves, else the ladder's next rung as it ships, the ladder going on only
 * at the waves it holds.
 */
async function ladder(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  // (the ladders as they ship, before the canary turns every one round: the Crypt's and the Thornwood's)
  const ladders = BIOME_IDS.map((biome) => BIOMES[biome].bosses);
  const shipped = Object.fromEntries(BIOME_IDS.map((biome) => [biome, [...BIOMES[biome].bosses]])) as Record<BiomeId, BossRung[]>;
  if (options.canary) for (const each of ladders) each.reverse();
  try {
    for (const biome of BIOME_IDS) {
      await standIn(lab, options.fixture, biome);
      lab.letWavesCome();
      const met: string[] = [];
      let held = 0;
      for (let rung = 0; rung < RUNGS; rung++) {
        const wave = WAVES.bossEvery * (rung + 1);
        const sent = await bossOfWaveSent(lab, wave);
        const ladderOf = shipped[biome];
        const wanted: { id: EnemyId; banner: string; short: string } = exceptionOn(biome, wave)
          ?? ladderOf[held++ % ladderOf.length];
        met.push(`wave ${wave} ${sent.boss ?? 'none'}`);
        if (sent.boss !== wanted.id) problems.push(`${biome} wave ${wave}: the run sent ${sent.boss ?? 'no boss'}, its schedule's is ${wanted.id}`);
        if (!sent.banner.includes(wanted.banner)) problems.push(`${biome} wave ${wave}: the banner said "${sent.banner}", not its boss's line "${wanted.banner}"`);
        const label = bossOfWave(biome, wave)?.short;
        if (label !== wanted.short) problems.push(`${biome} wave ${wave}: the Continue button would name ${label}`);
      }
      lines.push(`ladder: ${biome}: ${met.join(', ')}`);
    }
  } finally {
    if (options.canary) for (const each of ladders) each.reverse();
  }
}

/** Wave `wave` set off from its countdown as the game begins one (`startNextWave`: its banner put up), then let
 *  start: the boss its run holds for it, and the banner's line. */
async function bossOfWaveSent(lab: Lab, wave: number): Promise<{ boss: EnemyId | undefined; banner: string }> {
  const run = G.run!;
  run.wave = wave;
  startNextWave();
  const banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', WAVE_FRAMES, `wave ${wave} never started`);
  const boss = run.boss?.[0]?.type;
  // (the wave stopped before it sends anyone, back to a countdown held for the next)
  run.queue.length = 0;
  run.boss = null;
  run.phase = 'countdown';
  run.timer = 1e4;
  return { boss, banner };
}

// --- the phases -------------------------------------------------------------------------------------------

/** The Bell-Warden's life taken to just over and under each phase's share: its phase, and its banner. */
async function phases(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const kit = ENEMIES.bellwarden.bossKit!;
  const second = kit.phases[1].below;
  if (options.canary) kit.phases[1].below = second - 0.2;
  try {
    const boss = await bossAt(lab, 'bellwarden', NEAR, false);
    const seen: string[] = [];
    for (let n = 1; n < kit.phases.length; n++) {
      const share = n === 1 ? second : kit.phases[n].below;
      for (const [side, at] of [['over', share + 0.01], ['under', share - 0.01]] as const) {
        boss.takeDamage(boss.life - at * boss.maxLife, {});
        await lab.step(2);
        const wanted = side === 'over' ? n - 1 : n;
        seen.push(`${fixed(at * 100, 0)}% phase ${boss.bossPhase + 1}`);
        if (boss.bossPhase !== wanted) problems.push(`phases: at ${fixed(at * 100, 0)}% of its life it was in phase ${boss.bossPhase + 1}, not ${wanted + 1}`);
        const banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
        if (side === 'under' && kit.phases[n].banner && banner !== kit.phases[n].banner) {
          problems.push(`phases: phase ${n + 1} began with the banner "${banner}"`);
        }
      }
    }
    lines.push(`phases: ${seen.join(', ')}`);
  } finally {
    kit.phases[1].below = second;
  }
}

// --- the toll ----------------------------------------------------------------------------------------------

/** What became of a toll at the hero: when the bell began its warning and when its ring reached him, how long he was
 *  stunned, and whether he was. */
interface TollCase { warnedAt: number; stunnedAt: number; stunnedFor: number }

/** The Bell-Warden left to toll at the hero `away` m off, `held` the frame's input (a shield raised): what came of it. */
async function tollAt(lab: Lab, options: BossOptions, away: number, held: SkillKey | null): Promise<TollCase> {
  await standIn(lab, options.fixture, 'crypt');
  const hero = G.player;
  const boss = await bossAt(lab, 'bellwarden', away, true);
  boss.cd = 0;
  const aim = boss.pos.clone().setY(1.5);
  const result: TollCase = { warnedAt: -1, stunnedAt: -1, stunnedFor: 0 };
  await lab.step(TOLL_FRAMES, () => {
    // (the hero turned to the boss and held where he stands: the toll is what's measured, not his walk)
    hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
    boss.desired.set(0, 0, 0);
    return held ? pressing(held, aim, true) : { aim };
  }, (frame) => {
    if (result.warnedAt < 0 && boss.action?.name === 'toll') result.warnedAt = frame;
    // (the first stun alone: its cooldown over, the bell tolls again within the frames followed)
    const first = result.stunnedAt < 0 || result.stunnedAt + result.stunnedFor === frame;
    if (hero.stunned && first) {
      if (result.stunnedAt < 0) result.stunnedAt = frame;
      result.stunnedFor++;
    }
  });
  return result;
}

/** The block skill's key on the hero's bar (a shield's raise), or null. */
function blockKey(): SkillKey | null {
  for (const key of ['mouse2', 'mouse0', '1', '2', '3', '4', 'q', 'e', 'r', 'f'] as SkillKey[]) {
    if (G.player.skillAt(key)?.def.block) return key;
  }
  return null;
}

/** The toll's cases: near (stunned after its warning, for its time), far (faded), and a shield raised. */
async function toll(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const t = BELL_WARDEN.toll;
  const stunsTo = t.stunsTo;
  if (options.canary) t.stunsTo = 0;
  try {
    const near = await tollAt(lab, options, NEAR, null);
    const warn = ENEMIES.bellwarden.bossKit!.attacks!.toll.warn;
    const warned = near.stunnedAt >= 0 ? secondsOf(near.stunnedAt - near.warnedAt) : -1;
    lines.push(`toll: near (${NEAR} m): ${near.stunnedAt < 0 ? 'not stunned' : `stunned ${fixed(secondsOf(near.stunnedFor))} s, `
      + `${fixed(warned)} s after the bell began its swing`}`);
    if (near.warnedAt < 0) problems.push('toll: the bell never tolled');
    if (near.stunnedAt < 0) problems.push(`toll: the hero ${NEAR} m off was never stunned`);
    else {
      if (Math.abs(secondsOf(near.stunnedFor) - t.stun) > STUN_SLACK) problems.push(`toll: stunned ${fixed(secondsOf(near.stunnedFor))} s, not ${t.stun}`);
      if (warned < warn) problems.push(`toll: its ring reached him ${fixed(warned)} s into its warning of ${warn} s`);
    }
  } finally {
    t.stunsTo = stunsTo;
  }
  const far = await tollAt(lab, options, FAR, null);
  lines.push(`toll: far (${FAR} m, faded past ${stunsTo} m): ${far.stunnedAt < 0 ? 'not stunned' : 'stunned'}`);
  if (far.warnedAt < 0) problems.push('toll: the bell never tolled at the far hero');
  if (far.stunnedAt >= 0) problems.push(`toll: the hero ${FAR} m off was stunned, past where its ring fades`);
  await blocked(lab, options, lines, problems);
}

/** A toll at the hero with his shield raised towards it: not stunned. A warrior with a shield alone. */
async function blocked(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const key = blockKey();
  if (!G.player.gear.shield || !key) {
    lines.push('toll: shield raised: not run (--class warrior --gear shield)');
    return;
  }
  const hero = G.player;
  if (options.canary) Object.defineProperty(hero, 'shieldRaised', { get: () => false, configurable: true });
  try {
    const shield = await tollAt(lab, options, NEAR, key);
    lines.push(`toll: shield raised (${NEAR} m): ${shield.stunnedAt < 0 ? 'not stunned' : 'stunned'}`);
    if (shield.warnedAt < 0) problems.push('toll: the bell never tolled at the shielded hero');
    if (shield.stunnedAt >= 0) problems.push('toll: the hero was stunned with his shield raised towards it');
  } finally {
    if (options.canary) delete (hero as { shieldRaised?: boolean }).shieldRaised;
  }
}

// --- the chains --------------------------------------------------------------------------------------------

/** Each chain struck from its side until it breaks: the bell dropped for its window, then up and whole again. */
async function chains(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const parts = ENEMIES.bellwarden.bossKit!.parts!;
  const share = parts.share;
  if (options.canary) parts.share = 0;
  try {
    const boss = await bossAt(lab, 'bellwarden', NEAR, false);
    const broken: string[] = [];
    parts.angles.forEach((angle, i) => {
      const way = boss.facing + angle;
      const from = { x: boss.pos.x + Math.sin(way) * 5, z: boss.pos.z + Math.cos(way) * 5 };
      // (a chain's life and a little more, from its side: a hit no part of which reaches another chain)
      boss.takeDamage(parts.life * boss.maxLife * 1.05, { from });
      broken.push((boss.broken & (1 << i)) ? 'broke' : 'held');
      if (!(boss.broken & (1 << i))) problems.push(`chains: chain ${i + 1} struck from its side for its life held`);
    });
    lines.push(`chains: ${broken.join(', ')}`);
    await lab.step(2);
    // (it thinks again: the window's end is its own to see to)
    boss.dazed = 0;
    if (boss.broken !== 0b1111) return;
    const window = boss.weak;
    lines.push(`chains: all broken: the bell down, ${fixed(window, 1)} s of ${fixed(damageTaken(boss), 1)}x damage`);
    if (Math.abs(window - BELL_WARDEN.down) > 0.1) problems.push(`chains: its window was ${fixed(window)} s, not ${BELL_WARDEN.down}`);
    if (damageTaken(boss) !== ENEMIES.bellwarden.bossKit!.weak!.taken) problems.push(`chains: it took ${damageTaken(boss)}x damage in its window`);
    let tolled = false;
    await lab.step(Math.round((BELL_WARDEN.down + 0.5) * FPS), () => ({}), () => {
      if (boss.action && boss.weak > 0) tolled = true;
    });
    if (tolled) problems.push('chains: it tolled with its bell down');
    const after = boss.broken as number;
    lines.push(`chains: after its window: ${after === 0 ? 'whole again' : 'still broken'}, ${damageTaken(boss)}x damage`);
    if (after !== 0) problems.push('chains: the chains were not whole again after its window');
  } finally {
    parts.share = share;
  }
}

// --- standing its ground -----------------------------------------------------------------------------------

/** how long the hero walks into the boss (s), and how far it may give way meanwhile (m) */
const PRESS_FOR = 3;
const GIVES_MOST = 0.02;

/**
 * The hero walked into the Bell-Warden for `PRESS_FOR` s (from play: "you should not be able to move the boss by just
 * walking towards it", "its a metal bell after all"): how far it gave way, and that he reached it and was
 * held off it. Every foe yielded the whole overlap, and a boss was walked across the arena.
 */
async function stand(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', 6, false);
  const hero = G.player;
  if (options.canary) Object.defineProperty(boss, 'boss', { value: false, configurable: true });
  const from = boss.pos.clone();
  let nearest = Infinity;
  await lab.step(PRESS_FOR * FPS, () => {
    hero.walkTo = boss.pos.clone();
    boss.desired.set(0, 0, 0);
    return {};
  }, () => {
    nearest = Math.min(nearest, Math.hypot(hero.pos.x - boss.pos.x, hero.pos.z - boss.pos.z));
  });
  hero.walkTo = null;
  const gave = Math.hypot(boss.pos.x - from.x, boss.pos.z - from.z);
  const reach = boss.radius + hero.radius;
  lines.push(`stand: walked into it ${PRESS_FOR} s: it gave ${fixed(gave)} m, the hero came within ${fixed(nearest)} m of `
    + `its middle (its body and his ${fixed(reach)})`);
  if (nearest > reach + 0.3) problems.push(`stand: the hero never reached it (${fixed(nearest)} m from its middle)`);
  if (nearest < reach - 0.2) problems.push(`stand: the hero walked into it, ${fixed(reach - nearest)} m inside its body`);
  if (gave > GIVES_MOST) problems.push(`stand: walked into, it gave way ${fixed(gave)} m (at most ${GIVES_MOST})`);
}

// --- its ghosts seizing a hero -----------------------------------------------------------------------------

/** the most frames waited for a ghost to seize the hero at its ring, and how long one far off is watched (s) */
const SEIZE_FRAMES = 30 * 60;
const FAR_WATCH = 10;
/** where the hero stands for each case, from the bell's middle (m): at its ghosts' ring, and well out of it */
const AT_RING = 3.7;
const FAR_OFF = 9;

/** What became of the hero by a held bell's ghosts: the frame he was seized, how high he was lifted, how far he was
 *  carried, what he took as he landed, and whether he was seized again within his grace. */
interface SeizeCase { seizedAt: number; highest: number; carried: number; hurt: number; again: boolean }

/** The hero stood `away` m from a held Bell-Warden for up to `frames`, its ghosts circling: what they did to him. */
async function seizeCase(lab: Lab, options: BossOptions, away: number, frames: number): Promise<SeizeCase> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', 12, false);
  const hero = G.player;
  // (put where the case wants him from its middle, on his own side of it)
  const out = hero.pos.clone().sub(boss.pos).setY(0).normalize();
  hero.pos.copy(boss.pos).addScaledVector(out, away).setY(0);
  const result: SeizeCase = { seizedAt: -1, highest: 0, carried: 0, hurt: 0, again: false };
  const takeDamage = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, from) => {
    if (result.seizedAt >= 0) result.hurt += amount;
    return takeDamage(amount, type, from);
  };
  let from: THREE.Vector3 | null = null;
  let landedAt = -1;
  try {
    await lab.step(frames, () => ({}), (frame) => {
      if (hero.seized && result.seizedAt < 0) {
        result.seizedAt = frame;
        from = hero.pos.clone();
      } else if (hero.seized && landedAt >= 0 && frame - landedAt < BELL_WARDEN.grab.grace * FPS) result.again = true;
      result.highest = Math.max(result.highest, hero.lift);
      if (from && !hero.seized && landedAt < 0 && result.seizedAt >= 0) {
        landedAt = frame;
        result.carried = Math.hypot(hero.pos.x - from.x, hero.pos.z - from.z);
      }
    });
  } finally {
    hero.takeDamage = takeDamage;
  }
  return result;
}

/** A hero at the ghosts' ring seized, lifted, carried out and hurt as he lands, not again within his grace; one well
 *  out of it never seized. */
async function grab(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const g = BELL_WARDEN.grab;
  const reach = g.reach;
  if (options.canary) g.reach = 0;
  try {
    const near = await seizeCase(lab, options, AT_RING, SEIZE_FRAMES);
    if (near.seizedAt < 0) {
      lines.push(`grab: at its ghosts' ring (${AT_RING} m) for ${fixed(SEIZE_FRAMES / FPS, 0)} s: never seized`);
      problems.push(`grab: a hero ${AT_RING} m from its middle was never seized in ${fixed(SEIZE_FRAMES / FPS, 0)} s`);
    } else {
      lines.push(`grab: at its ghosts' ring (${AT_RING} m): seized after ${fixed(secondsOf(near.seizedAt), 1)} s, lifted `
        + `${fixed(near.highest)} m, carried ${fixed(near.carried)} m, hurt ${fixed(near.hurt, 0)} as he landed`);
      if (near.highest < g.rise * 0.8) problems.push(`grab: lifted ${fixed(near.highest)} m, not ${g.rise}`);
      if (Math.abs(near.carried - g.away) > 0.6) problems.push(`grab: carried ${fixed(near.carried)} m, not ${g.away}`);
      if (!(near.hurt > 0)) problems.push('grab: dropped, he took no harm');
      if (near.again) problems.push(`grab: seized again within his grace of ${g.grace} s`);
    }
  } finally {
    g.reach = reach;
  }
  const far = await seizeCase(lab, options, FAR_OFF, FAR_WATCH * FPS);
  lines.push(`grab: well out of its ghosts' ring (${FAR_OFF} m) for ${FAR_WATCH} s: ${far.seizedAt < 0 ? 'never seized' : 'seized'}`);
  if (far.seizedAt >= 0) problems.push(`grab: a hero ${FAR_OFF} m from its middle was seized`);
}

// --- the programs ------------------------------------------------------------------------------------------

/** Every effect of the Bell-Warden's fight drawn (each toll, a shard, the bell dropped): no program compiled. */
async function compiles(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', NEAR, false);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(2);
    const before = (G.renderer.info.programs ?? []).length;
    const x = boss.pos.x, z = boss.pos.z;
    fx('toll', boss.id, x, z, 0, 0);
    await lab.step(20);
    fx('toll', boss.id, x, z, 1, 0);
    fx('shard', boss.id, x, z, x + 3, z, 0);
    fx('bellDown', x, z);
    for (let i = 0; i < 4; i++) fx('bossPart', boss.id, i, 1);
    if (options.canary) {
      const odd = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1), new THREE.MeshPhongMaterial({ color: 0x123456, flatShading: true }));
      odd.position.copy(boss.pos).setY(2);
      G.scene.add(odd);
      await lab.step(4);
      G.scene.remove(odd);
    }
    await lab.step(60);
    const compiled = (G.renderer.info.programs ?? []).length - before;
    lines.push(`compiles: ${compiled} programs compiled drawing its tolls, a shard and the bell dropped`);
    if (compiled > 0) problems.push(`compiles: ${compiled} programs compiled in the Bell-Warden's fight`);
  } finally {
    lab.drawing = drawing;
  }
  const rooted = await rootCompiles(lab, options);
  lines.push(`compiles: ${rooted} programs compiled drawing the Rootmother's vine, pods, thorns, cracks, eruption, `
    + 'spores, heart and canopy');
  if (rooted > 0) problems.push(`compiles: ${rooted} programs compiled in the Rootmother's fight`);
}

// --- time to kill ------------------------------------------------------------------------------------------

/** The hero's basic attack held `TTK_HOLD` s on a boss held still: the damage it dealt a second. */
async function damageASecond(lab: Lab, options: BossOptions): Promise<number> {
  await standIn(lab, options.fixture, 'crypt');
  const attack = G.player.skillAt('mouse0')!.def;
  // (a melee hero up to it, a shooter out where its shots fly level: `AIM.near` takes the aim on past a foe nearer)
  const melee = !attack.draw && !attack.speed;
  const boss = await bossAt(lab, 'colossus', melee ? 3.6 : 8, false);
  const hero = G.player;
  if (options.canary) boss.takeDamage = () => 0;
  const aim = boss.pos.clone().setY(1.6);
  const before = boss.life;
  // (a drawn shot drawn to full and let go, round again: held, a bow draws and never looses)
  const cycle = attack.draw ? Math.round((attack.draw + 0.1) * FPS) + 1 : 0;
  await lab.step(TTK_HOLD * FPS, (frame) => {
    hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
    // (its Energy kept full, as the class balance's damage a second is judged: the attack's damage, not its cost)
    hero.energy = hero.stats.maxEnergy;
    boss.desired.set(0, 0, 0);
    const held = cycle === 0 || frame % cycle !== cycle - 1;
    return pressing('mouse0', aim, held);
  });
  return (before - boss.life) / TTK_HOLD;
}

/** How long a boss of life `life` takes at `dps`, its weak windows (a share `drops` of its life dealt to its chains
 *  opening one of `down` s at `taken` times) counted where it has them. */
function timeToKill(life: number, dps: number, windows?: { drops: number; down: number; taken: number }): number {
  if (!windows) return life / dps;
  let dealt = 0, time = 0, sinceDrop = 0;
  const step = 0.05, round = windows.drops * life;
  while (dealt < life && time < 3600) {
    dealt += dps * step;
    sinceDrop += dps * step;
    time += step;
    if (sinceDrop >= round) {
      sinceDrop = 0;
      dealt += dps * windows.taken * windows.down;
      time += windows.down;
    }
  }
  return time;
}

/** The time each boss takes the hero at the wave it comes on, from his basic attack's damage a second. */
async function ttk(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const dps = await damageASecond(lab, options);
  const cls = G.player.cls.id;
  if (!(dps > 0)) {
    problems.push(`ttk: the ${cls}'s basic attack dealt nothing to the boss`);
    return;
  }
  const colossus = ENEMIES.colossus.life * SCALING.life(5);
  const bell = ENEMIES.bellwarden.life * SCALING.life(10);
  const parts = ENEMIES.bellwarden.bossKit!.parts!;
  const windows = { drops: parts.life * parts.angles.length, down: BELL_WARDEN.down, taken: ENEMIES.bellwarden.bossKit!.weak!.taken };
  const plain = timeToKill(bell, dps);
  const dropped = timeToKill(bell, dps, windows);
  const first = timeToKill(colossus, dps);
  lines.push(`ttk: ${cls}: ${fixed(dps, 0)} damage a second with ${G.player.skillAt('mouse0')!.def.name} and the starting gear`);
  lines.push(`ttk: the Colossus at wave 5 (${fixed(colossus, 0)} life): ${fixed(first, 0)} s`);
  lines.push(`ttk: the Bell-Warden at wave 10 (${fixed(bell, 0)} life): ${fixed(plain, 0)} s, ${fixed(dropped, 0)} s dropping the bell `
    + `each time its chains break (${fixed(dropped / first, 2)}x the Colossus's)`);
  lines.push(...rootTtkLines(dps));
}

// --- pictures ----------------------------------------------------------------------------------------------

/** how far off the boss the pictures are taken from (m), and the height they're framed on */
const PICTURE_FROM = 15;
const PICTURE_Y = 3;

/** The boss pictured from in front of it (behind the hero), from its side and from the game's own view above. */
function pictureBoss(lab: Lab, boss: Enemy, label: string, notes: string[]): Pictured {
  const at = boss.pos.clone().setY(PICTURE_Y);
  return lab.picture(label, ['back', 'left', 'above'], notes, { at, distance: PICTURE_FROM });
}

/** Frames until the boss's action is `name` at `share` of it through. */
async function untilAction(lab: Lab, boss: Enemy, name: string, share: number): Promise<void> {
  const reached = (): boolean => boss.action?.name === name && boss.action.t / boss.action.dur >= share;
  await lab.until(reached, TOLL_FRAMES, `the Bell-Warden never reached ${share} of its ${name}`);
}

/**
 * The Bell-Warden at every stage of its fight, for the eye (no verdicts), each as the player sees it (the game's view
 * with the HUD and its banners) or close up: coming on, a toll's warning, its ring, the hero stunned with husks
 * rising, a chain broken, all four and the bell down, back up, its second phase's banner, a double toll and shards,
 * its last phase's banner and its bearers kneeling, and its fall.
 */
async function pictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  // (the hero set up again facing where it will stand, so the player's view looks at it)
  const spot = clearSpot(12, ENEMIES.bellwarden.radius);
  await lab.setup({ ...options.fixture, at: SPOT, facing: Math.atan2(spot.x - SPOT[0], spot.z - SPOT[1]) });
  const hero = G.player;
  const boss = await bossAt(lab, 'bellwarden', 12, false);
  const moments: Pictured[] = [];
  const close = (label: string, note: string, views: ViewName[] = ['left']): void => {
    const at = boss.pos.clone().setY(PICTURE_Y);
    moments.push(lab.picture(label, views, [note], { at, distance: PICTURE_FROM }));
  };
  const seen = async (label: string, note: string): Promise<void> => { moments.push(await lab.screen(label, [note])); };
  const still = (): void => { boss.dazed = 1e4; boss.cancelAction(); };
  const sides = boss.def.bossKit!.parts!;
  const breakChain = (i: number): void => {
    const way = boss.facing + sides.angles[i];
    const from = { x: boss.pos.x + Math.sin(way) * 5, z: boss.pos.z + Math.cos(way) * 5 };
    boss.takeDamage(sides.life * boss.maxLife * 1.05, { from });
  };

  // 0. a ghost seizing the hero who stands at its ring, carrying him up and out
  const out = hero.pos.clone().sub(boss.pos).setY(0).normalize();
  const stoodAt = hero.pos.clone();
  hero.pos.copy(boss.pos).addScaledVector(out, AT_RING).setY(0);
  const lifted = (): boolean => hero.seized && hero.lift > BELL_WARDEN.grab.rise * 0.75;
  await lab.until(lifted, SEIZE_FRAMES, 'no ghost seized the hero for the pictures');
  const carriedAt = hero.pos.clone().setY(2.2);
  moments.push(lab.picture('0 seized (close)', ['back', 'left'], ['a ghost carrying the hero up and out, to drop him'], { at: carriedAt, distance: 6 }));
  await seen('0 seized', 'a ghost carrying the hero off, as the player sees it');
  await lab.until(() => !hero.seized, 120, 'the hero was never dropped');
  await lab.step(30);
  hero.pos.copy(stoodAt);
  // 1. it comes on, shuffling under its bell, its toll held off
  boss.dazed = 0;
  boss.cd = 99;
  await lab.step(80);
  await seen('1 it comes', 'the Bell-Warden shuffling in, as the player sees it');
  close('1 it comes (close)', 'four ghoul bearers under the frame, the pale clapper light inside');
  // (a ghost haunting it, framed on its own: models/bellGhosts.ts)
  const ghost = boss.obj.getObjectByName('bell ghost');
  if (ghost) {
    const at = ghost.getWorldPosition(new THREE.Vector3());
    moments.push(lab.picture('1 a ghost', ['back', 'left'], ['a ghost circling the bell, its arms out, its hem swept back'], { at, distance: 3.2 }));
  }
  // 2-4. a toll: its warning, its ring, the hero stunned; this toll (its second) raises husks round the arena
  boss.brain.tolls = 1;
  boss.cd = 0;
  await untilAction(lab, boss, 'toll', 0.4);
  close('2 toll warning (close)', 'the bell swung back, its cracks and clapper glowing, creaking: about 1 s to get away or raise a shield');
  await seen('2 toll warning', 'the warning as the player sees it');
  await untilAction(lab, boss, 'toll', 0.6);
  await seen('3 the ring', 'the toll\'s ring rolling out over the floor');
  await lab.until(() => hero.stunned, TOLL_FRAMES, 'the hero was never stunned');
  await lab.step(20);
  await seen('4 stunned', 'the ring reached the hero: stunned 2 s (stars over his head); Hollow Husks rising round the arena');
  // 5-7. the chains, one broken, then all four: the bell down for its window, then up again
  still();
  breakChain(0);
  await lab.step(30);
  close('5 one chain broken', 'a chain struck from its side until it snapped hangs loose from the frame', ['back', 'left']);
  for (let i = 1; i < sides.angles.length; i++) breakChain(i);
  await lab.step(90);
  close('6 bell down (close)', 'all four chains broken: the bell rests on the ground for 6 s, taking double damage (the gold ring)');
  await seen('6 bell down', 'the weak-spot window as the player sees it');
  boss.dazed = 0;
  boss.cd = 99;
  await lab.until(() => boss.broken === 0, 600, 'the chains were never whole again');
  await lab.step(80);
  close('7 back up', 'its window over: the bearers up, the chains whole, the bell lifted');
  // 8-10. phase 2: its banner, a double toll, shards on the floor
  boss.takeDamage(boss.life - 0.58 * boss.maxLife, {});
  // (its hit's flash faded first: a hit of half its life lit it flat)
  await lab.step(30);
  await seen('8 phase 2', 'under 60%: the bell splits, and tolls twice from now on');
  boss.cd = 0;
  await untilAction(lab, boss, 'doubleToll', 0.75);
  await seen('9 double toll', 'two rings: a fast one, and a slow one after it');
  still();
  for (const way of [0.6, 2.3, 4.4]) {
    const x = boss.pos.x + Math.sin(way) * 5.5, z = boss.pos.z + Math.cos(way) * 5.5;
    fx('shard', boss.id, boss.pos.x, boss.pos.z, x, z, 0);
  }
  await lab.step(50);
  close('10 shards', 'bronze shards broken off as it\'s hit, lying on the floor a few seconds: standing on them hurts', ['left', 'above']);
  // 11-12. phase 3: its banner, the bearers kneeling
  boss.takeDamage(boss.life - 0.22 * boss.maxLife, {});
  // (its hit's flash faded first: a hit of half its life lit it flat)
  await lab.step(30);
  await seen('11 phase 3', 'under 25%: it stops and tolls every 3 s');
  await lab.step(90);
  close('12 kneeling', 'the bearers down on their knees, the frame lowered');
  // 13. its fall
  boss.takeDamage(boss.life + 1, {});
  await lab.step(45);
  close('13 its fall', 'killed: the bell crashes down, the bearers collapse');
  lines.push(`pictures: ${moments.length} moments`);
  return moments;
}

/** `swing`: the bell through a toll and a walk (bossSwing.ts), a Bell-Warden risen near the hero and thinking. */
async function swing(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', NEAR, true);
  return bellSwing({ lab, boss, canary: options.canary, lines, problems });
}

/** `lab boss`: each part asked for, in turn. */
export async function boss(lab: Lab, options: BossOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const run: Record<Exclude<BossPart, 'pictures' | 'swing' | 'rootPictures' | 'rootLook'>, typeof ladder> = {
    ladder, phases, toll, chains, stand, grab, rootPhases, vines, pods, heart, compiles, ttk,
  };
  const moments: Pictured[] = [];
  const was = G.arena.biome;
  try {
    for (const part of options.parts ?? BOSS_PARTS) {
      if (part === 'pictures') moments.push(...await pictures(lab, options, lines));
      else if (part === 'swing') moments.push(...await swing(lab, options, lines, problems));
      else if (part === 'rootPictures') moments.push(...await rootPictures(lab, options, lines));
      else if (part === 'rootLook') moments.push(...await rootLook(lab, options, lines, problems));
      else await run[part](lab, options, lines, problems);
    }
  } finally {
    if (G.arena.biome !== was) G.arena.setBiome(was);
  }
  if (options.canary) {
    const caught = problems.length;
    lines.push(`canary: ${caught} faults caught`);
    const judged = (options.parts ?? BOSS_PARTS).filter((part) => !PICTURE_PARTS.includes(part));
    return { text: lines.join('\n'), problems: canaryMissed(judged, problems), moments };
  }
  return { text: lines.join('\n'), problems, moments };
}

/** With the canary: the parts whose planted fault went uncaught (each part's problems name it). */
function canaryMissed(parts: BossPart[], problems: string[]): string[] {
  const missed = parts.filter((part) => !problems.some((problem) => problem.startsWith(`${part}:`) || (part === 'ladder' && problem.includes(' wave '))));
  return missed.map((part) => `canary: the ${part} part's planted fault went uncaught`);
}
